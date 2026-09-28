import { defineConfig, devices } from "@playwright/test";

/**
 * Tests the exported static demo exactly as it will be hosted: plain static
 * files served from a sub-folder (/printing-demo/), no Node server behind it.
 *   pnpm demo:build
 *   mkdir -p demo/.build/serve && ln -sfn ../site/out demo/.build/serve/printing-demo
 *   python3 -m http.server 4173 --directory demo/.build/serve &
 *   pnpm demo:test            (DEMO_URL=… to test another host)
 */
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.DEMO_URL ?? "http://localhost:4173",
    locale: "fa-IR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
