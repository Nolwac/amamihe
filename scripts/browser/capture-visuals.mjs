import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

async function authenticate(request) {
  const email = process.env.BROWSER_ACCOUNT_EMAIL;
  const password = process.env.BROWSER_ACCOUNT_PASSWORD;
  if (email || password) {
    if (!email || !password)
      throw new Error(
        "Set both BROWSER_ACCOUNT_EMAIL and BROWSER_ACCOUNT_PASSWORD.",
      );
    const response = await request.post("/api/auth/login", {
      data: { email, password },
    });
    if (!response.ok())
      throw new Error(`Capture sign-in failed (${response.status()}).`);
    return;
  }
  const destination = new URL(
    process.env.PREVIEW_URL || "http://127.0.0.1:3000",
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname))
    throw new Error(
      "Remote captures require BROWSER_ACCOUNT_EMAIL and BROWSER_ACCOUNT_PASSWORD; test accounts are provisioned only on loopback.",
    );
  const signup = await request.post("/api/auth/signup", {
    data: {
      name: "Amina",
      outfit: "teal",
      email: `capture-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  });
  if (!signup.ok())
    throw new Error(`Capture account setup failed (${signup.status()}).`);
  const pending = await signup.json();
  if (!/^[\w-]+$/.test(pending.challengeId || ""))
    throw new Error("Account setup returned an invalid challenge identifier.");
  let message;
  try {
    message = JSON.parse(
      await readFile(
        path.join(
          process.env.EMAIL_TEST_OUTBOX || ".data/test-outbox",
          pending.challengeId + ".json",
        ),
        "utf8",
      ),
    );
  } catch {
    throw new Error(
      "Local account setup requires EMAIL_TEST_OUTBOX. For remote captures, use BROWSER_ACCOUNT_EMAIL and BROWSER_ACCOUNT_PASSWORD.",
    );
  }
  const code = message.text.match(/\b\d{6}\b/)?.[0];
  if (!code)
    throw new Error("The local verification message contains no code.");
  const verified = await request.post("/api/auth/verify", {
    data: { challengeId: pending.challengeId, code },
  });
  if (!verified.ok())
    throw new Error(`Capture verification failed (${verified.status()}).`);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(r.status() + " " + r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("evidence/screenshots", { recursive: true });
  await page.goto("/");
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
  await authenticate(context.request);
  await page.reload();
  await page.locator('canvas[data-scene-mode="world"]').waitFor();
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
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
