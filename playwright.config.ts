import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "browser.spec.ts",
  // End-to-end journeys restore several scenes under software WebGL.
  // Rendering budgets are measured separately by audit:browser.
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:3000",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_MANAGED_BROWSER
        ? undefined
        : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
