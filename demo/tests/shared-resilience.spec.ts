import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, test, type Page } from "@playwright/test";

/**
 * The shared demo must never lose the project during a presentation:
 * a failed boot, a network drop while saving or a host that does not answer
 * for a moment must not wipe or hide the shared data; a reset can be undone.
 *   php -S … ; DEMO_URL=http://127.0.0.1:4180 pnpm demo:test shared-resilience
 */
const BASE = process.env.DEMO_BASE ?? "/printing-demo";
const at = (p: string) => `${BASE}${p}`;
const SYNC = `**${BASE}/demo/sync.php*`;

async function booted(p: Page) {
  await expect(p.locator('[role="status"][aria-live="polite"]')).toHaveCount(0, { timeout: 120_000 });
}
async function head(p: Page): Promise<number> {
  const r = await p.request.get(at("/demo/sync.php?since=999999999"));
  return (await r.json()).head as number;
}
async function staffLogin(p: Page, name: RegExp) {
  await p.goto(at("/panel/login/"));
  await booted(p);
  await p.getByRole("button", { name }).click();
  await p.waitForURL((u) => u.pathname.startsWith(at("/panel/")) && !u.pathname.includes("/login"), { timeout: 60_000 });
  await booted(p);
}
/** A real write: the manager gives a station priority… simplest write available on a clean demo: a new supplier. */
async function addSupplier(p: Page, name: string) {
  await p.goto(at("/panel/suppliers/"));
  await booted(p);
  await p.getByRole("button", { name: /تأمین‌کننده جدید/ }).click();
  const d = p.getByRole("dialog");
  await d.getByLabel("نام").fill(name);
  await d.getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(p.getByText(name).first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("a failed boot never resets the shared data; «تلاش دوباره» brings the project back", async ({ page }) => {
  test.setTimeout(240_000);
  await staffLogin(page, /حامد نورصالحی/);
  await addSupplier(page, "کاغذ آزمون بقا");
  const before = await head(page);
  expect(before).toBeGreaterThan(0);

  // The snapshot download fails once (e.g. the host hiccups) → error screen
  let fail = true;
  await page.route(`**${BASE}/demo/seed.tgz*`, (r) => (fail ? r.abort() : r.continue()));
  await page.reload();
  await expect(page.getByText("راه‌اندازی دمو ممکن نشد")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "بازنشانی و تلاش دوباره" })).toHaveCount(0);
  expect(await head(page)).toBe(before); // nothing was wiped
  fail = false;
  await page.getByRole("button", { name: "تلاش دوباره", exact: true }).click();
  await booted(page);
  await page.goto(at("/panel/suppliers/"));
  await booted(page);
  await expect(page.getByText("کاغذ آزمون بقا").first()).toBeVisible();
});

test("the host not answering for a moment never shows an empty, per-browser demo", async ({ page }) => {
  test.setTimeout(240_000);
  await staffLogin(page, /حامد نورصالحی/);
  await page.route(SYNC, (r) => r.abort());
  await page.reload();
  await expect(page.getByText(/ارتباط با سرور دمو برقرار نشد/).first()).toBeVisible({ timeout: 90_000 });
  await page.unroute(SYNC);
  await page.getByRole("button", { name: "تلاش دوباره", exact: true }).click();
  await booted(page);
  await page.goto(at("/panel/suppliers/"));
  await booted(page);
  await expect(page.getByText("کاغذ آزمون بقا").first()).toBeVisible();
});

test("a save during a network drop is kept and reaches the others once the network is back", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await staffLogin(page, /حامد نورصالحی/);
  await page.goto(at("/panel/suppliers/"));
  await booted(page);
  // Pushes fail for ~8 s
  let down = true;
  await page.route(SYNC, (r) => (down && r.request().method() === "POST" ? r.abort() : r.continue()));
  await page.getByRole("button", { name: /تأمین‌کننده جدید/ }).click();
  await page.getByRole("dialog").getByLabel("نام").fill("کاغذ قطعی اینترنت");
  await page.getByRole("dialog").getByRole("button", { name: "ذخیره", exact: true }).click();
  await expect(page.getByText(/تغییرات در حال ذخیره است/)).toBeVisible({ timeout: 15_000 });
  down = false;
  await expect(page.getByText(/تغییرات در حال ذخیره است/)).toHaveCount(0, { timeout: 20_000 });
  const other = await (await browser.newContext({ locale: "fa-IR" })).newPage();
  await staffLogin(other, /حامد نورصالحی/);
  await other.goto(at("/panel/suppliers/"));
  await booted(other);
  await expect(other.getByText("کاغذ قطعی اینترنت").first()).toBeVisible();
});

test("a reset can be undone: «بازگرداندن داده‌های قبل از بازنشانی»", async ({ page }) => {
  test.setTimeout(240_000);
  await staffLogin(page, /حامد نورصالحی/);
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /پنل حالت نمایشی/ }).click();
  await page.getByRole("button", { name: "بازنشانی دمو" }).click();
  await page.waitForURL(new RegExp(`${BASE}/?$`));
  await booted(page);
  expect(await head(page)).toBe(0);
  await page.getByRole("button", { name: /پنل حالت نمایشی/ }).click();
  await page.getByRole("button", { name: "بازگرداندن داده‌های قبل از بازنشانی" }).click();
  await page.waitForURL(new RegExp(`${BASE}/?$`));
  await booted(page);
  expect(await head(page)).toBeGreaterThan(0);
  await staffLogin(page, /حامد نورصالحی/);
  await page.goto(at("/panel/suppliers/"));
  await booted(page);
  await expect(page.getByText("کاغذ آزمون بقا").first()).toBeVisible();
});

test("an old cached data file (previous demo version) is detected and replaced, not used", async ({ page }) => {
  test.setTimeout(240_000);
  // An "old demo" snapshot: the current one without the sync tables.
  const db = await PGlite.create({ loadDataDir: new Blob([readFileSync(path.resolve("demo/.build/seed.tgz"))]) });
  await db.exec("DROP TABLE demo_changes CASCADE");
  const stale = Buffer.from(await (await db.dumpDataDir("gzip")).arrayBuffer());
  await db.close();
  // The first request for the snapshot gets the old file, as a stale browser/host cache would.
  await page.route(`**${BASE}/demo/seed.tgz*`, (r) => (r.request().url().includes("&r=") ? r.continue() : r.fulfill({ body: stale, contentType: "application/gzip" })));
  await staffLogin(page, /حامد نورصالحی/);
  await page.goto(at("/panel/suppliers/"));
  await booted(page);
  await expect(page.getByText("کاغذ آزمون بقا").first()).toBeVisible();
  await expect(page.getByText("راه‌اندازی دمو ممکن نشد")).toHaveCount(0);
});
