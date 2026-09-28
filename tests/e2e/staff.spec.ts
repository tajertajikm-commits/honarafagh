import { expect, test, type Page } from "@playwright/test";

/**
 * Staff journeys against the seeded demo (pnpm db:reset && pnpm db:seed).
 * The steps build on each other (settle → hand over), so they run in order.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "honar1405";

async function staffLogin(page: Page, phone: string) {
  await page.context().clearCookies();
  await page.goto("/panel/login");
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/panel") && !u.pathname.startsWith("/panel/login"));
}

const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

test("manager: login → control center → manual order with live pricing → confirmed order", async ({ page }) => {
  await staffLogin(page, "09120000001");
  await expect(page).toHaveURL(/\/panel\/control/);
  await expect(page.getByRole("heading", { name: "مرکز کنترل" })).toBeVisible();

  await page.goto("/panel/sales/new");
  await page.getByLabel("جستجوی مشتری").fill("صالحی");
  await page.getByRole("button", { name: /حمید صالحی/ }).click();
  await page.getByLabel("محصول").selectOption({ label: "کارت ویزیت" });
  await expect(page.getByText(/^قیمت:/).first()).toBeVisible();
  await page.getByRole("button", { name: "ثبت سفارش" }).click();
  await page.waitForURL(/\/panel\/orders\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  await expect(page.getByText("تأیید شده").first()).toBeVisible();
});

test("warehouse: issue reserved material, receive a purchase order, ledger updated", async ({ page }) => {
  await staffLogin(page, "09120000004");
  await page.goto("/panel/warehouse?tab=issue");
  const firstIssue = page.getByRole("button", { name: "حواله", exact: true }).first();
  await firstIssue.click();
  await page.getByRole("button", { name: "ثبت حواله" }).click();
  await toast(page, "حواله ثبت شد و از موجودی کسر شد.");

  await page.goto("/panel/warehouse?tab=receive");
  await page.getByRole("button", { name: "ثبت رسید" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "ثبت رسید" }).click();
  await toast(page, "رسید کالا ثبت شد.");

  await page.goto("/panel/warehouse?tab=ledger");
  await expect(page.getByText("دریافت").first()).toBeVisible();
  await expect(page.getByText("حواله").first()).toBeVisible();
});

test("operator: start and finish a production step at the station", async ({ page }) => {
  await staffLogin(page, "09120000009");
  await expect(page).toHaveURL(/\/panel\/station/);
  await page.getByRole("link", { name: /برش/ }).first().click();
  await page.getByRole("button", { name: "شروع کار" }).click();
  await toast(page, "کار شروع شد.");
  await page.getByRole("button", { name: "پایان کار" }).click();
  await page.getByRole("button", { name: "ثبت پایان کار" }).click();
  await toast(page, "مرحله ثبت شد و کار به مرحله بعد رفت.");
});

test("operator cannot open other workspaces or call their APIs", async ({ page }) => {
  await staffLogin(page, "09120000007");
  await page.goto("/panel/accounting");
  await expect(page).toHaveURL(/\/panel\/forbidden/);
  const res = await page.request.post("/api/v1/inventory/adjust", {
    headers: { Origin: "http://localhost:3000" },
    data: { materialId: "00000000-0000-0000-0000-000000000000", locationId: "00000000-0000-0000-0000-000000000000", delta: 1, reason: "test" },
  });
  expect(res.status()).toBe(403);
});

test("accountant: settle an outstanding balance", async ({ page }) => {
  await staffLogin(page, "09120000003");
  await page.goto("/panel/accounting?tab=receivables");
  const row = page.getByRole("row").filter({ hasText: "آماده تحویل" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "تسویه" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ثبت" }).click();
  await toast(page, "پرداخت ثبت شد.");
});

test("shipping: settled order is handed over and the order completes", async ({ page }) => {
  await staffLogin(page, "09120000012");
  await page.goto("/panel/shipping?tab=ready");
  const item = page.locator("li").filter({ hasText: "تسویه" }).first();
  await item.getByRole("button", { name: "ایجاد مرسوله" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ایجاد" }).click();
  await toast(page, "مرسوله ایجاد شد.");

  await page.goto("/panel/shipping?tab=open");
  await page.getByRole("button", { name: "ثبت تحویل" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("نام تحویل‌گیرنده").fill("مشتری نمونه");
  await dialog.getByRole("button", { name: "تأیید تحویل" }).click();
  await toast(page, "تحویل ثبت شد.");
});
