import { expect, test, type Page } from "@playwright/test";

/**
 * The shared demo on a PHP host (demo/sync.php): a customer on one device and
 * staff on another (or in other tabs) work on the same data.
 *   php -S 127.0.0.1:4180 -t demo/.build/serve &
 *   DEMO_URL=http://127.0.0.1:4180 pnpm demo:test shared-demo
 */
const BASE = process.env.DEMO_BASE ?? "/printing-demo";
const at = (p: string) => `${BASE}${p}`;
const PDF = { name: "artwork.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%demo artwork\n%%EOF") };

async function booted(p: Page) {
  await expect(p.locator('[role="status"][aria-live="polite"]')).toHaveCount(0, { timeout: 120_000 });
}

async function staffLogin(p: Page, name: RegExp) {
  await p.goto(at("/panel/login/"));
  await booted(p);
  await p.getByRole("button", { name }).click();
  await p.waitForURL((u) => u.pathname.startsWith(at("/panel/")) && !u.pathname.includes("/login"), { timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test("customer on one device orders; manager on another sees it, approves; customer sees the update", async ({ browser }) => {
  test.setTimeout(300_000);
  const phone = `0938${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  const customerCtx = await browser.newContext({ locale: "fa-IR" });
  const staffCtx = await browser.newContext({ locale: "fa-IR" });
  const c = await customerCtx.newPage();
  const s = await staffCtx.newPage();

  // Customer registers on the site and places a custom order
  await c.goto(at("/login/?next=/order/"));
  await booted(c);
  await c.getByLabel("شماره موبایل").fill(phone);
  await c.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const demo = c.getByText("حالت نمایشی — کد تأیید:");
  await c.getByLabel("کد تأیید").fill((await demo.locator("b").innerText()).trim());
  const nameField = c.getByPlaceholder("نام و نام خانوادگی");
  await expect(nameField.or(c.getByLabel("عنوان سفارش"))).toBeVisible({ timeout: 30_000 });
  if (await nameField.isVisible()) {
    await nameField.fill("کارفرمای جلسه");
    await c.getByRole("button", { name: /ذخیره/ }).click();
  }
  await c.goto(at("/order/"));
  await booted(c);
  await c.getByRole("button", { name: /چاپ دیجیتال/ }).click();
  await c.getByLabel("عنوان سفارش").fill("کارت دعوت جلسه");
  await c.getByLabel("تیراژ (تعداد)").fill("300");
  await c.locator('input[type="file"]').first().setInputFiles(PDF);
  await expect(c.getByText("artwork.pdf").first()).toBeVisible();
  await c.getByRole("button", { name: "ثبت سفارش" }).click();
  const placed = c.getByText(/سفارش [DO]-\d+-\d+ ثبت شد/).first();
  await expect(placed).toBeVisible();
  const code = (await placed.innerText()).match(/[DO]-\d+-\d+/)![0];
  await expect(c.getByText("در انتظار تأیید").first()).toBeVisible();

  // Manager (other device) sees the new order and approves it
  await staffLogin(s, /آقای لبافی/);
  await s.goto(at("/panel/orders/?tab=approval"));
  await booted(s);
  await expect(s.getByText(code).first()).toBeVisible({ timeout: 20_000 });
  await s.getByText(code).first().click();
  await expect(s.getByRole("heading", { level: 1 })).toContainText(code);
  await s.getByRole("button", { name: "تأیید و شروع تولید" }).click();
  await expect(s.getByText("سفارش تأیید شد و وارد صف تولید شد.").first()).toBeVisible();

  // The customer's open page updates by itself
  await expect(c.getByText(/^تأیید شد$|در حال آماده‌سازی/).first()).toBeVisible({ timeout: 20_000 });

  // A second tab in the customer's browser is a separate sign-in (e.g. Hamed beside the customer)
  const tab2 = await customerCtx.newPage();
  await staffLogin(tab2, /حامد نورصالحی/);
  await expect(tab2.getByRole("heading", { name: "مرکز کنترل" })).toBeVisible();
  await c.reload();
  await booted(c);
  await expect(c.getByText(code).first()).toBeVisible(); // first tab is still the customer
  await expect(c.getByText(/^تأیید شد$|در حال آماده‌سازی/).first()).toBeVisible();

  await customerCtx.close();
  await staffCtx.close();
});
