import { type BrowserContext, expect, test, type Page } from "@playwright/test";

/**
 * End-to-end journey through the STATIC demo (no backend): one browser
 * profile, state kept in IndexedDB between steps, exactly like a visitor.
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.DEMO_BASE ?? "/printing-demo";
const at = (p: string) => `${BASE}${p}`;
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

let context: BrowserContext;
let page: Page;
const phone = `0935${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
let orderNumber = "";

async function booted(p: Page) {
  await expect(p.locator('[role="status"][aria-live="polite"]')).toHaveCount(0, { timeout: 120_000 });
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fa-IR" });
  page = await context.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text().slice(0, 1500)); });
});
test.afterAll(async () => {
  await context.close();
});

test("1. first visit loads seeded printing house from static files", async () => {
  await page.goto(at("/"));
  await booted(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("چاپ حرفه‌ای", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /پنل حالت نمایشی/ })).toBeVisible();
  await shot(page, "d01-home");
});

test("2-4. new customer registers with a generated demo OTP", async () => {
  await page.goto(at("/login/"));
  await booted(page);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const demo = page.getByText("حالت نمایشی — کد تأیید:");
  await expect(demo).toBeVisible();
  const code = (await demo.locator("b").innerText()).trim();
  expect(code).toMatch(/^\d{5}$/);
  await shot(page, "d02-otp");
  await page.getByLabel("کد تأیید").fill(code);
  await expect(page.getByText("به هنر آفاق خوش آمدید")).toBeVisible();
  await page.getByPlaceholder("نام و نام خانوادگی").fill("مشتری دمو");
  await page.getByRole("button", { name: /ذخیره و ادامه/ }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByRole("heading", { name: "مشتری دمو" })).toBeVisible();
  await expect(page.getByText("به هنر آفاق خوش آمدید")).toHaveCount(0);
  await shot(page, "d02b-account");
});

test("5-10. configure product, dynamic price, cart, checkout, fake payment → order", async () => {
  await page.goto(at("/products/"));
  await booted(page);
  await page.locator("main a[href*=\"/p/\"]", { hasText: "کارت ویزیت" }).first().click();
  await expect(page.getByRole("heading", { name: "کارت ویزیت" })).toBeVisible();
  const price = page.locator("aside .text-\\[30px\\]");
  await expect(price).toContainText(/[۰-۹]/);
  const before = await price.innerText();
  await page.getByRole("radio", { name: /سلفون مات دو رو/ }).click();
  await expect.poll(async () => price.innerText()).not.toBe(before);
  await shot(page, "d03-configurator");
  await page.getByRole("button", { name: "افزودن به سبد خرید" }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page.getByRole("link", { name: /ادامه و ثبت سفارش/ }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole("radio", { name: /پیک هنر آفاق/ }).click();
  await page.getByPlaceholder("خیابان، کوچه، پلاک، واحد").fill("خیابان انقلاب، پلاک ۱۰، واحد ۲");
  await page.getByRole("radio", { name: /^پیش‌پرداخت/ }).click();
  await shot(page, "d04-checkout");
  await page.getByRole("button", { name: "ثبت و پرداخت" }).click();
  await expect(page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${BASE}/payment/sandbox`));
  await shot(page, "d05-gateway");
  await page.getByRole("link", { name: "پرداخت موفق" }).click();
  await expect(page.getByRole("heading", { name: "پرداخت با موفقیت انجام شد" })).toBeVisible();
  await page.getByRole("link", { name: "مشاهده سفارش" }).click();
  const heading = page.getByRole("heading", { name: /سفارش #/ });
  await expect(heading).toBeVisible();
  orderNumber = toLatin((await heading.innerText()).replace(/[^\d۰-۹]/g, ""));
  expect(orderNumber).toMatch(/^1000\d\d$/);
  await expect(page.getByText("پرداخت بخشی").first()).toBeVisible();
  await shot(page, "d06-order");
});

test("11-12. manager logs in and finds the same order", async () => {
  await page.goto(at("/panel/login/"));
  await booted(page);
  await page.getByLabel("شماره موبایل").fill("09120000001");
  await page.getByLabel("رمز عبور").fill("honar1405");
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("heading", { name: "مرکز کنترل" })).toBeVisible();
  await shot(page, "d07-control");
  await page.goto(at(`/panel/orders/?q=${orderNumber}`));
  await booted(page);
  const link = page.getByRole("link", { name: new RegExp(`#${orderNumber.replace(/\d/g, (d) => `[${d}${"۰۱۲۳۴۵۶۷۸۹"[Number(d)]}]`)}`) }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  // The paid deposit released the order: its Digital workflow and material reservations exist.
  await expect(page.getByRole("heading", { name: "تولید", level: 3 })).toBeVisible();
  await shot(page, "d08-panel-order");
});

test("13-14. other roles act on it: file approval by prepress, production starts", async () => {
  // Customer's file: upload as the customer first
  await page.goto(at("/account/"));
  await booted(page);
  await page.getByText(new RegExp(`سفارش #`)).first().click();
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "card.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%demo\n%%EOF") });
  await page.getByRole("button", { name: "ارسال فایل برای بررسی" }).click();
  await expect(page.getByText("فایل برای بررسی ارسال شد.").first()).toBeVisible();
  await expect(page.getByText("در حال بررسی").first()).toBeVisible();

  // Switch role via the DEMO MODE panel: prepress approves the file
  await page.getByRole("button", { name: /پنل حالت نمایشی/ }).click();
  await page.getByRole("button", { name: /پیش از چاپ/ }).first().click();
  await expect(page).toHaveURL(/\/panel\//);
  await booted(page);
  await page.goto(at("/panel/studio/?tab=review"));
  await booted(page);
  await expect(page.getByText(`سفارش ${fa(orderNumber)}`).first()).toBeVisible();
  await page.getByRole("button", { name: /تأیید برای چاپ/ }).first().click();
  await expect(page.getByText("فایل برای چاپ تأیید شد.").first()).toBeVisible();
  await shot(page, "d09-studio");

  // Prepress starts the PREPRESS task at the station → production in progress
  await page.goto(at("/panel/station/"));
  await booted(page);
  await page.getByRole("link", { name: new RegExp(`سفارش ${fa(orderNumber)}`) }).first().click();
  await page.getByRole("button", { name: "شروع کار" }).click();
  await expect(page.getByText("کار شروع شد.").first()).toBeVisible();
  await shot(page, "d10-station");
});

test("15-16. customer sees the updated status", async () => {
  await page.goto(at("/account/"));
  await booted(page);
  await page.getByText(new RegExp(`سفارش #`)).first().click();
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  await expect(page.getByText(/در حال انجام|در حال تولید/).first()).toBeVisible();
  await page.getByRole("button", { name: /اعلان‌ها/ }).click();
  await expect(page.getByText("پرداخت موفق").first()).toBeVisible();
  await shot(page, "d11-customer-updated");
  await page.keyboard.press("Escape");
});

test("17-18. data survives a browser refresh", async () => {
  await page.reload();
  await booted(page);
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  await expect(page.getByText(/در حال انجام|در حال تولید/).first()).toBeVisible();
});

test("19-20. reset restores the seed (new customer's order disappears)", async () => {
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /پنل حالت نمایشی/ }).click();
  await page.getByRole("button", { name: "بازنشانی دمو" }).click();
  await page.waitForURL(new RegExp(`${BASE}/?$`));
  await booted(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("چاپ حرفه‌ای");
  await page.goto(at("/panel/login/"));
  await booted(page);
  await page.getByLabel("شماره موبایل").fill("09120000001");
  await page.getByLabel("رمز عبور").fill("honar1405");
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("heading", { name: "مرکز کنترل" })).toBeVisible();
  await page.goto(at(`/panel/orders/?status=all&q=${orderNumber}`));
  await booted(page);
  // The seed has 18 orders (100001–100018); the customer's new order number no longer exists.
  await expect(page.getByText("سفارشی پیدا نشد")).toBeVisible();
});

test("mobile storefront works in the sub-folder @mobile", async ({ page: m }) => {
  await m.goto(at("/"));
  await booted(m);
  await expect(m.getByRole("heading", { level: 1 })).toContainText("چاپ حرفه‌ای", { timeout: 60_000 });
  await m.goto(at("/products/"));
  await booted(m);
  await expect(m.getByRole("link", { name: /کارت ویزیت/ }).first()).toBeVisible();
});
