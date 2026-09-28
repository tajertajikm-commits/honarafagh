import { expect, test, type Page } from "@playwright/test";

/**
 * Breadth checks for the static demo: payment outcomes, every internal
 * workspace for the manager, and every demo role reaching its own workspace.
 */
const BASE = process.env.DEMO_BASE ?? "/printing-demo";
const at = (p: string) => `${BASE}${p}`;
const PROBLEM = "خطا در نمایش صفحه";

async function booted(p: Page) {
  await expect(p.locator('[role="status"][aria-live="polite"]')).toHaveCount(0, { timeout: 120_000 });
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  // #418 = recoverable hydration mismatch of the statically pre-rendered shell.
  page.on("pageerror", (e) => !e.message.includes("#418") && errors.push(e.message));
  return errors;
}

async function staffLogin(page: Page, phone: string) {
  await page.goto(at("/panel/login/"));
  await booted(page);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByLabel("رمز عبور").fill("honar1405");
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((u) => u.pathname.startsWith(at("/panel/")) && !u.pathname.includes("/login"));
}

test("failed and cancelled payments are recorded on the order", async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto(at("/login/"));
  await booted(page);
  await page.getByLabel("شماره موبایل").fill(`0936${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const demo = page.getByText("حالت نمایشی — کد تأیید:");
  await page.getByLabel("کد تأیید").fill((await demo.locator("b").innerText()).trim());
  await page.getByPlaceholder("نام و نام خانوادگی").fill("مشتری پرداخت");
  await page.getByRole("button", { name: /ذخیره/ }).click();
  await expect(page.getByRole("heading", { name: "مشتری پرداخت" })).toBeVisible();

  await page.goto(at("/p/item/?__id=business-card"));
  await booted(page);
  await page.getByRole("button", { name: "افزودن به سبد خرید" }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page.getByRole("link", { name: /ادامه و ثبت سفارش/ }).click();
  await page.getByRole("radio", { name: /پیک هنر آفاق/ }).click();
  await page.getByPlaceholder("خیابان، کوچه، پلاک، واحد").fill("خیابان آزادی، پلاک ۵");
  await page.getByRole("radio", { name: /پرداخت کامل آنلاین/ }).click();
  await page.getByRole("button", { name: "ثبت و پرداخت" }).click();

  await expect(page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" })).toBeVisible();
  await page.getByRole("link", { name: /پرداخت ناموفق/ }).click();
  await expect(page.getByRole("heading", { name: "پرداخت ناموفق بود" })).toBeVisible();
  await page.getByRole("link", { name: "مشاهده سفارش" }).click();
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  await expect(page.getByText("پرداخت نشده").first()).toBeVisible();

  await page.getByRole("button", { name: "پرداخت آنلاین" }).click();
  await expect(page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" })).toBeVisible();
  await page.getByRole("link", { name: "انصراف از پرداخت" }).click();
  await expect(page.getByRole("heading", { name: "پرداخت لغو شد" })).toBeVisible();
  await page.getByRole("link", { name: "مشاهده سفارش" }).click();
  await expect(page.getByText("پرداخت نشده").first()).toBeVisible();
  expect(errors).toEqual([]);
});

const WORKSPACES = [
  "/panel/control/", "/panel/orders/", "/panel/sales/", "/panel/sales/new/", "/panel/studio/", "/panel/production/",
  "/panel/station/", "/panel/machines/", "/panel/qc/", "/panel/warehouse/", "/panel/inventory/", "/panel/procurement/",
  "/panel/shipping/", "/panel/accounting/", "/panel/customers/", "/panel/employees/", "/panel/catalog/", "/panel/pricing/",
  "/panel/workflows/", "/panel/reports/", "/panel/audit/", "/panel/settings/",
];
const DETAILS: [string, string][] = [
  ["/panel/orders/", "/panel/orders/item/"],
  ["/panel/customers/", "/panel/customers/item/"],
  ["/panel/employees/", "/panel/employees/item/"],
  ["/panel/inventory/", "/panel/inventory/item/"],
  ["/panel/catalog/", "/panel/catalog/item/"],
  ["/panel/sales/?tab=quotes", "/panel/sales/quotes/item/"],
];

test("manager: every internal workspace and detail page renders from the shared data", async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await staffLogin(page, "09120000001");
  for (const path of WORKSPACES) {
    await page.goto(at(path));
    await booted(page);
    await expect(page.getByRole("heading", { level: 1 }).first(), path).toBeVisible();
    await expect(page.getByText(PROBLEM), path).toHaveCount(0);
  }
  await page.goto(at("/panel/workflows/"));
  await booted(page);
  await expect(page.getByText(/افست/).first()).toBeVisible();
  await expect(page.getByText(/دیجیتال/).first()).toBeVisible();
  for (const [list, detail] of DETAILS) {
    await page.goto(at(list));
    await booted(page);
    const link = page.locator(`main a[href*="${BASE}${detail}"]`).first();
    await expect(link, list).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(detail.replace(/\//g, "\\/")));
    await expect(page.getByRole("heading", { level: 1 }).first(), detail).toBeVisible();
    await expect(page.getByText(PROBLEM), detail).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("each demo role switches in from the DEMO MODE panel and lands in its own workspace", async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await page.goto(at("/"));
  await booted(page);
  const landings: string[] = [];
  for (let i = 0; i < 12; i++) {
    if (i > 0) {
      await page.goto(at("/"));
      await booted(page);
    }
    await page.getByRole("button", { name: /پنل حالت نمایشی/ }).click();
    const buttons = page.getByRole("dialog").locator("section").nth(1).getByRole("button");
    await expect(buttons).toHaveCount(12);
    const label = (await buttons.nth(i).innerText()).split("\n")[0];
    await buttons.nth(i).click();
    await page.waitForURL((u) => u.pathname.startsWith(at("/panel/")) && u.pathname !== at("/panel/"), { timeout: 60_000 });
    await booted(page);
    await expect(page.getByRole("heading", { level: 1 }).first(), label).toBeVisible();
    await expect(page.getByText(PROBLEM), label).toHaveCount(0);
    landings.push(`${label} → ${new URL(page.url()).pathname}`);
  }
  console.info(landings.join("\n"));
  expect(new Set(landings.map((l) => l.split(" → ")[1])).size).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
