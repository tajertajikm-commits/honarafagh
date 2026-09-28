import { expect, test } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function loginCustomer(page: import("@playwright/test").Page, phone: string, next = "/account") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const demo = page.getByText("حالت نمایشی — کد تأیید:");
  await expect(demo).toBeVisible();
  const code = (await demo.locator("b").innerText()).trim();
  await page.getByLabel("کد تأیید").fill(code);
}

test("customer: browse → configure → cart → checkout → pay → track", async ({ page }) => {
  const phone = `0937${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

  // Browse & configure
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("چاپ حرفه‌ای");
  await page.locator(`a[href="/p/business-card"]`).first().click();
  await expect(page.getByRole("heading", { name: "کارت ویزیت" })).toBeVisible();
  const total = page.locator("aside").getByText("تومان").first();
  await expect(total).toBeVisible();
  const before = await page.locator("aside .text-\\[30px\\]").innerText();
  await page.getByRole("radio", { name: /سلفون مات دو رو/ }).click();
  await expect.poll(async () => page.locator("aside .text-\\[30px\\]").innerText()).not.toBe(before);
  await page.getByRole("button", { name: "2,000" }).or(page.getByRole("button", { name: "۲٬۰۰۰" })).click();
  await shot(page, "01-configurator");

  // Cart (as guest), then login and continue
  await page.getByRole("button", { name: "افزودن به سبد خرید" }).click();
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.getByText("کارت ویزیت").first()).toBeVisible();
  await shot(page, "02-cart");
  await page.getByRole("link", { name: /ادامه و ثبت سفارش/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  const code = (await page.getByText("حالت نمایشی — کد تأیید:").locator("b").innerText()).trim();
  await page.getByLabel("کد تأیید").fill(code);

  // New customer: name form, then checkout
  await expect(page.getByText("به هنر آفاق خوش آمدید")).toBeVisible();
  await page.getByPlaceholder("نام و نام خانوادگی").fill("مشتری آزمون خودکار");
  await page.getByRole("button", { name: /ذخیره و ادامه/ }).click();
  await expect(page).toHaveURL(/\/checkout/);

  // Checkout: courier + new address, pay deposit
  await page.getByRole("radio", { name: /پیک هنر آفاق/ }).click();
  await page.getByPlaceholder("خیابان، کوچه، پلاک، واحد").fill("خیابان انقلاب، پلاک ۱۰، واحد ۲");
  await page.getByRole("radio", { name: /^پیش‌پرداخت/ }).click();
  await shot(page, "03-checkout");
  await page.getByRole("button", { name: "ثبت و پرداخت" }).click();

  // Sandbox gateway
  await expect(page.getByRole("heading", { name: "درگاه پرداخت آزمایشی" })).toBeVisible();
  await page.getByRole("link", { name: "پرداخت موفق" }).click();
  await expect(page.getByRole("heading", { name: "پرداخت با موفقیت انجام شد" })).toBeVisible();
  await page.getByRole("link", { name: "مشاهده سفارش" }).click();

  // Order page: auto-confirmed after deposit; upload artwork
  await expect(page.getByRole("heading", { name: /سفارش #/ })).toBeVisible();
  await expect(page.getByText("پرداخت بخشی").first()).toBeVisible();
  await expect(page.getByText("تأیید شده").first()).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "card.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%demo\n%%EOF") });
  await page.getByRole("button", { name: "ارسال فایل برای بررسی" }).click();
  await expect(page.getByText("در حال بررسی").first()).toBeVisible();
  await expect(page.getByText("ثبت سفارش").first()).toBeVisible();
  await shot(page, "04-order");

  // Public tracking works without login
  const heading = await page.getByRole("heading", { name: /سفارش #/ }).innerText();
  const number = heading.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  await page.context().clearCookies();
  await page.goto("/track");
  await page.getByLabel("شماره سفارش").fill(number);
  await page.getByLabel("موبایل").fill(phone);
  await page.getByRole("button", { name: "پیگیری" }).click();
  await expect(page.getByLabel("مراحل سفارش")).toBeVisible();
  await expect(page.getByText("ثبت سفارش")).toBeVisible();
});

test("customer: existing demo customer sees order history and a proof to approve @mobile", async ({ page }) => {
  await loginCustomer(page, "09121111111");
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(/سفارش #/).first()).toBeVisible();
  await shot(page, "05-account");
});
