import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(r.status() + " " + r.url());
});
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("evidence/screenshots", { recursive: true });
await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:3000");
await page.getByLabel("Your explorer name").waitFor();
await page.locator("canvas[data-avatar-ready=true]").waitFor();
await page.waitForTimeout(500);
await page.screenshot({
  path: "evidence/screenshots/avatar-studio-current.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await page.screenshot({
  path: "evidence/screenshots/avatar-studio-phone-current.png",
  fullPage: true,
});
await page.setViewportSize({ width: 640, height: 900 });
await page.waitForTimeout(900);
await page.screenshot({
  path: "evidence/screenshots/avatar-studio-tablet-current.png",
  fullPage: true,
});
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByLabel("Your explorer name").fill("Amina");
await page.getByLabel("teal outfit").click();
await page.getByRole("button", { name: "Enter Venture City" }).click();
await page
  .locator(".engine-status b")
  .filter({ hasNotText: "Loading" })
  .waitFor();
await page.locator("canvas[data-avatar-ready=true]").waitFor();
await page.locator("canvas[data-residents-ready=true]").waitFor();
await page.waitForTimeout(1200);
await page.screenshot({
  path: "evidence/screenshots/course-streets-current.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);
await page.screenshot({
  path: "evidence/screenshots/course-streets-phone-current.png",
  fullPage: true,
});
console.log(
  JSON.stringify({
    errors,
    desktopScene: "evidence/screenshots/course-streets-current.png",
    avatarScene: "evidence/screenshots/avatar-studio-current.png",
    mobileScene: "evidence/screenshots/course-streets-phone-current.png",
  }),
);
await browser.close();
if (errors.length) process.exitCode = 1;
