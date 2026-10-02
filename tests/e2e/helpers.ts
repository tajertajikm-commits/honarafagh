import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "honar1405";

export const STAFF = {
  hamed: "09120000001",
  labafi: "09120000002",
  azad: "09120000003",
  abdali: "09120000004",
  gholipour: "09120000005",
  hajghasemi: "09120000006",
  memarian: "09120000007",
} as const;

export const PDF = { name: "artwork.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%demo artwork\n%%EOF") };

export async function loginCustomer(page: Page, phone: string, next = "/account") {
  await page.context().clearCookies();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const demo = page.getByText("حالت نمایشی — کد تأیید:");
  await expect(demo).toBeVisible();
  await page.getByLabel("کد تأیید").fill((await demo.locator("b").innerText()).trim());
}

export async function loginStaff(page: Page, phone: string) {
  await page.context().clearCookies();
  await page.goto("/panel/login");
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/panel") && !u.pathname.startsWith("/panel/login"));
}

export const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

/** Customer places a custom order from /order; returns its code (D-… / O-…). */
export async function placeCustomOrder(page: Page, type: "دیجیتال" | "افست", title: string, quantity: string) {
  await page.goto("/order");
  await page.getByRole("button", { name: new RegExp(`چاپ ${type}`) }).click();
  await page.getByLabel("عنوان سفارش").fill(title);
  await page.getByLabel("تیراژ (تعداد)").fill(quantity);
  await page.locator('input[type="file"]').first().setInputFiles(PDF);
  await expect(page.getByText("artwork.pdf").first()).toBeVisible();
  await page.getByRole("button", { name: "ثبت سفارش" }).click();
  const t = page.getByText(/سفارش [DO]-\d+-\d+ ثبت شد/).first();
  await expect(t).toBeVisible();
  const code = (await t.innerText()).match(/[DO]-\d+-\d+/)![0];
  await page.waitForURL(/\/account\/orders\/[0-9a-f-]{36}/);
  return { code, customerUrl: page.url().replace(/\?.*$/, "") };
}

export const orderTab = (page: Page, code: string, tab?: string) => page.goto(`/panel/orders/${code}${tab ? `?tab=${tab}` : ""}`);

/** Approve with the suggested station plan. */
export async function approve(page: Page, code: string) {
  await orderTab(page, code);
  await page.getByRole("button", { name: "تأیید و شروع تولید" }).click();
  await toast(page, "سفارش تأیید شد و وارد صف تولید شد.");
}

export async function approveArtwork(page: Page, code: string) {
  await orderTab(page, code, "files");
  await page.getByRole("button", { name: "تأیید برای چاپ" }).first().click();
  await toast(page, "فایل برای چاپ تأیید شد.");
}

/**
 * Work through every production step this person can act on (finish /
 * choose paper / approve quality) until nothing is left for them.
 */
export async function workSteps(page: Page, code: string, max = 12) {
  let done = 0;
  for (let i = 0; i < max; i++) {
    await orderTab(page, code, "production");
    const finish = page.getByRole("button", { name: "انجام شد", exact: true }).first();
    const paper = page.getByRole("button", { name: "انتخاب کاغذ" }).first();
    const quality = page.getByRole("button", { name: "تأیید کیفیت" }).first();
    await page.waitForLoadState("networkidle");
    if (await paper.isVisible()) {
      await paper.click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("select").selectOption({ index: 1 });
      await dialog.getByRole("button", { name: "ثبت و ادامه" }).click();
      await toast(page, "کاغذ ثبت شد.");
    } else if (await quality.isVisible()) {
      await quality.click();
      await page.getByRole("dialog").getByRole("button", { name: "تأیید کیفیت" }).click();
      await toast(page, "کیفیت تأیید شد.");
    } else if (await finish.isVisible()) {
      await finish.click();
      await toast(page, /انجام شد\.$/);
    } else break;
    done++;
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  return done;
}
