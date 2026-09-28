// Dev helper: node scripts/shot.mjs <path> <out.png> [width] [height] [theme] [cookie]
import { chromium } from "@playwright/test";
const [, , path = "/", out = "shot.png", w = "1360", h = "900", theme = "light", cookie = ""] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1, locale: "fa-IR" });
if (cookie) {
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, domain: "localhost", path: "/" }]);
}
await ctx.addInitScript((t) => { try { localStorage.setItem("ha-theme", t); } catch {} }, theme);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: process.env.FULL !== "0" });
await browser.close();
