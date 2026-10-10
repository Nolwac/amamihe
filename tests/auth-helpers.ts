import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
export async function deliveredCode(challengeId: string) {
  const message = JSON.parse(
    await readFile(
      path.join(
        process.env.EMAIL_TEST_OUTBOX || ".data/test-outbox",
        challengeId + ".json",
      ),
      "utf8",
    ),
  );
  return message.text.match(/\b\d{6}\b/)![0] as string;
}
export async function createAccount(
  request: APIRequestContext,
  name: string,
  outfit = "teal",
) {
  const email = `browser-${randomUUID()}@example.test`;
  const password = "browser-test-password";
  const signup = await request.post("/api/auth/signup", {
    data: { name, outfit, email, password },
  });
  expect(signup.ok()).toBe(true);
  const pending = await signup.json();
  const verified = await request.post("/api/auth/verify", {
    data: {
      challengeId: pending.challengeId,
      code: await deliveredCode(pending.challengeId),
    },
  });
  expect(verified.ok()).toBe(true);
  return { email, password };
}
export async function signupInBrowser(
  page: Page,
  name: string,
  outfit = "terracotta",
) {
  const email = `ui-${randomUUID()}@example.test`;
  await page.getByLabel("Your explorer name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await page.getByLabel(outfit + " outfit").click();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/signup"),
  );
  await page.getByRole("button", { name: "Send verification code" }).click();
  const pending = await (await response).json();
  await page
    .getByLabel("Verification code")
    .fill(await deliveredCode(pending.challengeId));
  await page.getByRole("button", { name: "Verify email & enter" }).click();
  await expect(page.getByLabel("Create your explorer")).toHaveCount(0);
  return { email, password: "browser-test-password" };
}
