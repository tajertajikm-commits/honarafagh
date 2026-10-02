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

let context: BrowserContext;
let page: Page;
const phone = `0935${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
let orderCode = "";

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
  await page.goto(at("/p/item/?__id=business-card"));
  await booted(page);
  await expect(page.getByRole("heading", { name: "کارت ویزیت", level: 1 })).toBeVisible();
  await expect(page.getByText("تومان").first()).toBeVisible();
  await page.getByRole("radio", { name: /سلفون مات دو رو/ }).click();
  await page.getByRole("button", { name: "افزودن به سبد خرید" }).click();
  await expect(page).toHaveURL(/\/cart/);
  await page.getByRole("link", { name: /ادامه و ثبت سفارش/ }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await page.getByRole("radio", { name: /پیک هنر آفاق/ }).click();
  await page.getByPlaceholder("خیابان، کوچه، پلاک، واحد").fill("خیابان انقلاب، پلاک ۱۰");
  await shot(page, "demo-03-checkout");
  await page.getByRole("button", { name: "ثبت و پرداخت" }).click();
  await expect(page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" })).toBeVisible();
  await page.getByRole("link", { name: "پرداخت موفق" }).click();
  await expect(page.getByRole("heading", { name: "پرداخت با موفقیت انجام شد" })).toBeVisible();
  await page.getByRole("link", { name: "مشاهده سفارش" }).click();
  const code = page.getByText(/^[DO]-\d+-\d+$/).first();
  await expect(code).toBeVisible();
  orderCode = (await code.innerText()).trim();
  await expect(page.getByText("در انتظار تأیید").first()).toBeVisible();
  await expect(page.getByText("تسویه").first()).toBeVisible();
});

test("11-12. approver logs in and finds the same order", async () => {
  await page.goto(at("/panel/login/"));
  await booted(page);
  await page.getByLabel("شماره موبایل").fill(orderCode.startsWith("D") ? "09120000002" : "09120000005");
  await page.getByLabel("رمز عبور").fill("honar1405");
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((u) => u.pathname.startsWith(at("/panel/")) && !u.pathname.includes("/login"));
  await page.goto(at(`/panel/orders/?tab=approval&q=${orderCode}`));
  await booted(page);
  await page.locator(`main a[href*="/panel/orders/item/"]`).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(orderCode);
});

test("13-14. approval with a station plan puts it into production", async () => {
  await page.getByRole("button", { name: "تأیید و شروع تولید" }).click();
  await expect(page.getByText("سفارش تأیید شد و وارد صف تولید شد.").first()).toBeVisible();
});

test("15-16. customer sees the simplified status (public tracking by code + phone)", async () => {
  await page.goto(at("/track/"));
  await booted(page);
  await page.getByLabel("کد سفارش").fill(orderCode);
  await page.getByLabel("موبایل").fill(phone);
  await page.getByRole("button", { name: "پیگیری" }).click();
  await expect(page.getByLabel("وضعیت سفارش")).toBeVisible();
  await expect(page.locator("main").getByText(/تأیید شد|در حال آماده‌سازی/).first()).toBeVisible();
});

test("17-18. data survives a browser refresh", async () => {
  await page.goto(at(`/panel/orders/?tab=all&q=${orderCode}`));
  await page.reload();
  await booted(page);
  await expect(page.locator(`main a[href*="/panel/orders/item/"]`).first()).toBeVisible();
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
  await page.goto(at(`/panel/orders/?tab=all&q=${orderCode}`));
  await booted(page);
  await expect(page.locator(`main a[href*="/panel/orders/item/"]`)).toHaveCount(0);
});

test("mobile storefront works in the sub-folder @mobile", async ({ page: m }) => {
  await m.goto(at("/"));
  await booted(m);
  await expect(m.getByRole("heading", { level: 1 })).toContainText("چاپ حرفه‌ای", { timeout: 60_000 });
  await m.goto(at("/products/"));
  await booted(m);
  await expect(m.getByRole("link", { name: /کارت ویزیت/ }).first()).toBeVisible();
});
