import { expect, test } from "@playwright/test";
import { approve, approveArtwork, loginCustomer, loginStaff, orderTab, placeCustomOrder, STAFF, toast, workSteps } from "./helpers";

/**
 * Corrections in the panel: reassigning a task, undo / send back with a chosen
 * target, adding a station mid-job, who handed the order over, the work report
 * and the customer's "call the printing house" when the order is ready.
 */
test.describe.configure({ mode: "serial" });

test("manager: reassign, add lamination mid-job, send back to design; report and customer call", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const customer = await browser.newPage();
  await loginCustomer(customer, "09126666666", "/order");
  await customer.waitForURL(/\/order/);
  const { code, customerUrl } = await placeCustomOrder(customer, "دیجیتال", "منوی رستوران", "150");

  await loginStaff(page, STAFF.labafi);
  await approve(page, code);
  await approveArtwork(page, code);

  // Hamed hands the sheet step to Azad: Labafi no longer has a button for it
  await loginStaff(page, STAFF.hamed);
  await orderTab(page, code, "production");
  await page.getByLabel("ارجاع به").first().selectOption({ label: "خانم آزاد" });
  await toast(page, "کار ارجاع شد.");
  await expect(page.getByText(/ارجاع به خانم آزاد/).first()).toBeVisible();
  await loginStaff(page, STAFF.labafi);
  await orderTab(page, code, "production");
  await expect(page.getByRole("button", { name: "انجام شد", exact: true })).toHaveCount(0);
  await loginStaff(page, STAFF.azad);
  expect(await workSteps(page, code, 1)).toBe(1);

  // Azad recorded the next step by mistake: she undoes it herself
  expect(await workSteps(page, code, 1)).toBe(1);
  await orderTab(page, code, "production");
  await page.getByRole("button", { name: "لغو (اشتباه)" }).last().click();
  await page.getByRole("dialog").getByRole("textbox").fill("اشتباهی ثبت شد");
  await page.getByRole("dialog").getByRole("button", { name: "لغو و بازگشت" }).click();
  await toast(page, "سفارش برگردانده شد.");

  // Finish production (Labafi does QC and packaging)
  await loginStaff(page, STAFF.labafi);
  await workSteps(page, code);

  // Ready: the customer sees "call the printing house"
  await customer.goto(customerUrl);
  await expect(customer.getByText("سفارش شما آماده است")).toBeVisible();
  await expect(customer.getByRole("link", { name: /تماس با چاپخانه/ }).first()).toHaveAttribute("href", /^tel:/);

  // The customer calls: wants lamination. Hamed adds it with a charge; quality/packaging are redone
  await loginStaff(page, STAFF.hamed);
  await orderTab(page, code, "production");
  await page.getByRole("button", { name: "تغییر ایستگاه‌ها" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("سلفون", { exact: true }).click();
  await dlg.getByLabel("دلیل").fill("مشتری تماس گرفت و سلفون مات خواست");
  await dlg.getByLabel("هزینه اضافه (اختیاری)").fill("200000");
  await dlg.getByRole("button", { name: "ثبت تغییر" }).click();
  await toast(page, "مسیر تولید به‌روز شد.");
  await expect(page.getByText("سلفون", { exact: true }).first()).toBeVisible();

  // …then changes his mind: back to design, from the "send back" dialog
  await page.getByRole("button", { name: "برگرداندن سفارش به مرحله قبل" }).click();
  await page.getByRole("dialog").getByLabel("بازگشت به").selectOption({ label: "طراحی مجدد" });
  await page.getByRole("dialog").getByLabel("دلیل").fill("مشتری متن منو را عوض کرد");
  await page.getByRole("dialog").getByRole("button", { name: "برگرداندن" }).click();
  await toast(page, "سفارش برگردانده شد.");
  await orderTab(page, code);
  await expect(page.getByText("طراحی درخواست شده").first()).toBeVisible();

  // The accountant's work report has every section
  await loginStaff(page, STAFF.abdali);
  await page.goto(`/panel/order-report/${code}`);
  await expect(page.getByRole("heading", { name: "شناسنامه و گزارش کار سفارش" })).toBeVisible();
  for (const h of ["۱. مشتری و مشخصات سفارش", "۴. مسیر تولید (ایستگاه‌ها)", "۹. ارسال و تحویل", "۱۰. تاریخچه کامل"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByText(/ارجاع مدیر/).first()).toBeVisible();
  await expect(page.getByText(/بازگشت به «طراحی مجدد»/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /دانلود PDF/ })).toBeVisible();
});

test("pickup: the person who handed it over is on the shipping tab and the report", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const customer = await browser.newPage();
  await loginCustomer(customer, "09125555555", "/order");
  await customer.waitForURL(/\/order/);
  const { code } = await placeCustomOrder(customer, "دیجیتال", "کارت تخفیف", "100");
  await loginStaff(page, STAFF.labafi);
  await approve(page, code);
  await approveArtwork(page, code);
  await workSteps(page, code);
  await orderTab(page, code, "shipping");
  await page.getByRole("button", { name: "تحویل حضوری در چاپخانه" }).click();
  await page.getByLabel("تحویل‌دهنده به مشتری").selectOption({ label: "آقای لبافی" });
  await page.getByRole("button", { name: "ثبت تحویل" }).click();
  await toast(page, "تحویل ثبت شد.");
  await expect(page.getByText("تحویل‌دهنده به مشتری").first()).toBeVisible();
  await loginStaff(page, STAFF.hamed);
  await page.goto(`/panel/order-report/${code}`);
  await expect(page.getByText("تحویل‌دهنده به مشتری:").locator("..")).toContainText("آقای لبافی");
});
