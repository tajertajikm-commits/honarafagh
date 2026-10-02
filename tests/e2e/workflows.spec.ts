import { expect, test } from "@playwright/test";
import { approve, approveArtwork, loginCustomer, loginStaff, orderTab, placeCustomOrder, STAFF, toast, workSteps } from "./helpers";

/**
 * The two production processes end to end, through the real UI, each step
 * performed by the person the business assigns it to. Runs against the
 * seeded demo database (pnpm db:reset && pnpm db:seed).
 */
test.describe.configure({ mode: "serial" });


test("digital: customer → Labafi approves → stations → Labafi QC → packaging → shipping → customer sees «ارسال شد»", async ({ page, browser }) => {
  const CUSTOMER = "09122222222";
  const customer = await browser.newPage();
  await loginCustomer(customer, CUSTOMER, "/order");
  await customer.waitForURL(/\/order/);
  const { code, customerUrl } = await placeCustomOrder(customer, "دیجیتال", "کارت دعوت آزمون دیجیتال", "200");
  expect(code).toMatch(/^D-\d+-\d+$/);
  await expect(customer.getByText("در انتظار تأیید").first()).toBeVisible();

  // Labafi: approval gate (station plan), artwork review, every station
  await loginStaff(page, STAFF.labafi);
  await approve(page, code);
  await approveArtwork(page, code);
  // Azad performs part of the stations, Labafi the rest including final QC & packaging.
  await loginStaff(page, STAFF.azad);
  expect(await workSteps(page, code, 1)).toBe(1);
  await loginStaff(page, STAFF.labafi);
  expect(await workSteps(page, code)).toBeGreaterThan(1);

  await orderTab(page, code, "shipping");
  await page.getByRole("button", { name: "پست", exact: true }).click();
  await page.getByLabel("شرکت حمل / اداره پست").fill("پست پیشتاز");
  await page.getByLabel("کد رهگیری").fill("PT123456789");
  await page.getByRole("button", { name: "ثبت ارسال" }).click();
  await toast(page, "ارسال ثبت شد.");
  await page.getByRole("button", { name: "تحویل شد" }).click();
  await toast(page, "تحویل ثبت شد.");

  // Customer: only the simplified stage
  await customer.goto(customerUrl);
  await expect(customer.getByText("ارسال شد").first()).toBeVisible();
  await expect(customer.locator("main").getByText("کنترل کیفیت")).toHaveCount(0);
});

test("offset: approval → litho ‖ paper quotes → Hamed picks supplier → press → priority → print QC → post-press → final QC → packaging → shipping", async ({ page, browser }) => {
  const CUSTOMER = "09124444444";
  const customer = await browser.newPage();
  await loginCustomer(customer, CUSTOMER, "/order");
  await customer.waitForURL(/\/order/);
  const { code, customerUrl } = await placeCustomOrder(customer, "افست", "بروشور آزمون افست", "3000");
  expect(code).toMatch(/^O-\d+-\d+$/);

  // Gholipour: approve, review file, record lithography and two paper quotes (in parallel)
  await loginStaff(page, STAFF.gholipour);
  await approve(page, code);
  await approveArtwork(page, code);
  await orderTab(page, code, "procurement");
  await page.getByLabel("وضعیت").selectOption("RECEIVED");
  await page.getByRole("button", { name: "ثبت وضعیت لیتوگرافی" }).click();
  await toast(page, "زینک دریافت شد؛ لیتوگرافی تکمیل شد.");
  for (const [i, price] of [[0, "4500000"], [1, "4200000"]] as const) {
    await page.getByLabel("تأمین‌کننده").selectOption({ index: i });
    await page.getByLabel("قیمت").fill(price);
    await page.getByRole("button", { name: "ثبت قیمت" }).click();
    await toast(page, "قیمت ثبت شد.");
    await page.reload();
  }

  // Hamed approves the cheapest supplier; Gholipour records receipt
  await loginStaff(page, STAFF.hamed);
  await orderTab(page, code, "procurement");
  await page.getByRole("button", { name: "انتخاب" }).last().click();
  await toast(page, /انتخاب شد\./);
  await loginStaff(page, STAFF.gholipour);
  await orderTab(page, code, "procurement");
  await page.getByRole("button", { name: "کاغذ رسید" }).click();
  await toast(page, "دریافت کاغذ ثبت شد.");

  // Hajghasemi assigns the 4-colour press; Hamed gives audited priority with a charge
  await loginStaff(page, STAFF.hajghasemi);
  await orderTab(page, code, "production");
  await page.getByLabel("تعیین ماشین چاپ").selectOption({ label: "چهاررنگ — هایدلبرگ SM74 چهاررنگ" });
  await toast(page, "ماشین چاپ تعیین شد.");
  await loginStaff(page, STAFF.hamed);
  await orderTab(page, code);
  await page.getByRole("button", { name: "اولویت در صف" }).click();
  await page.getByLabel("دلیل").fill("مشتری هزینه فوری پرداخت کرد");
  await page.getByLabel("هزینه اولویت (اختیاری)").fill("500000");
  await page.getByRole("dialog").getByRole("button", { name: "ثبت" }).click();
  await toast(page, "سفارش به ابتدای صف رفت.");

  // Print (Hajghasemi) → print QC (Hamed only) → post-press (Gholipour/Hajghasemi) → final QC (Hamed) → packaging (Hajghasemi)
  await loginStaff(page, STAFF.hajghasemi);
  expect(await workSteps(page, code, 1)).toBe(1);
  await expect(page.getByRole("button", { name: "تأیید کیفیت" })).toHaveCount(0); // not his to approve
  await loginStaff(page, STAFF.hamed);
  expect(await workSteps(page, code, 1)).toBe(1);
  await loginStaff(page, STAFF.gholipour);
  await workSteps(page, code);
  await loginStaff(page, STAFF.hamed);
  expect(await workSteps(page, code, 1)).toBe(1);
  await loginStaff(page, STAFF.hajghasemi);
  await workSteps(page, code);

  await orderTab(page, code, "shipping");
  await page.getByRole("button", { name: "پیک چاپخانه" }).click();
  await page.getByRole("button", { name: "ثبت ارسال" }).click();
  await toast(page, "ارسال ثبت شد.");

  // Customer sees «در حال ارسال», never the internal steps
  await customer.goto(customerUrl);
  await expect(customer.getByText("در حال ارسال").first()).toBeVisible();
  await expect(customer.locator("main").getByText("لیتوگرافی")).toHaveCount(0);

  // Public tracking by order code + phone
  await page.context().clearCookies();
  await page.goto("/track");
  await page.getByLabel("کد سفارش").fill(code);
  await page.getByLabel("موبایل").fill(CUSTOMER);
  await page.getByRole("button", { name: "پیگیری" }).click();
  await expect(page.getByLabel("وضعیت سفارش")).toBeVisible();
});

test("roles: Azad cannot open the offset queue; manager lands on the control center", async ({ page }) => {
  await loginStaff(page, STAFF.azad);
  await page.goto("/panel/queues/offset");
  await expect(page).toHaveURL(/forbidden/);
  await loginStaff(page, STAFF.hamed);
  await expect(page).toHaveURL(/\/panel\/dashboard/);
});
