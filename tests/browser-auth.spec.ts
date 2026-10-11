import { test, expect } from "@playwright/test";
import { deliveredCode, signupInBrowser } from "./auth-helpers";

test("authentication gates gameplay and password/email-code login restores the same progress", async ({
  page,
  context,
}) => {
  await page.goto("/");
  expect(
    (await context.request.post("/api/attempts", { data: {} })).status(),
  ).toBe(401);
  expect(
    (
      await context.request.post("/api/session", {
        data: { name: "Bypass", outfit: "teal" },
      })
    ).status(),
  ).toBe(401);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-mode",
    "avatar",
    { timeout: 30000 },
  );
  const credentials = await signupInBrowser(page, "Account Explorer");
  await expect(page.locator("canvas[data-scene-mode=world]")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 60000 },
  );
  const original = await (await context.request.get("/api/session")).json();
  const attempt = await (
    await context.request.post("/api/attempts", { data: {} })
  ).json();
  await context.request.post(`/api/attempts/${attempt.id}/chunks`, {
    data: { questionId: "tokens", answer: 0, elapsedMs: 1000 },
  });
  await page.getByRole("button", { name: "Account settings" }).click();
  await expect(
    page.getByText(credentials.email, { exact: true }),
  ).toBeVisible();
  // A slow session restore must not weaken logout authorization or fail a UI race.
  let delayedSession = false;
  await page.route("**/api/session", async (route) => {
    if (delayedSession && route.request().method() === "GET") {
      delayedSession = false;
      await new Promise((resolve) => setTimeout(resolve, 6500));
    }
    await route.continue();
  });
  delayedSession = true;
  const signedOut = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/logout") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await signedOut).ok()).toBe(true);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByLabel("Create your explorer")).toBeVisible({
    timeout: 30000,
  });
  expect(
    (await context.request.post("/api/attempts", { data: {} })).status(),
  ).toBe(401);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in & enter" }).click();
  await expect(page.getByLabel("Create your explorer")).toHaveCount(0);
  const restored = await (await context.request.get("/api/session")).json();
  expect(restored.player.id).toBe(original.player.id);
  expect(restored.active.answered).toBe(1);
  await context.request.post("/api/auth/logout", { data: {} });
  await page.reload();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Forgot password? Use an email code" })
    .click();
  await page.getByLabel("Email address").fill(credentials.email);
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/code"),
  );
  await page.getByRole("button", { name: "Send login code" }).click();
  const challenge = await (await response).json();
  await page
    .getByLabel("Verification code")
    .fill(await deliveredCode(challenge.challengeId));
  await page.getByRole("button", { name: "Verify code & sign in" }).click();
  await expect(page.getByLabel("Create your explorer")).toHaveCount(0);
  const recovered = await (await context.request.get("/api/session")).json();
  expect(recovered.player.id).toBe(original.player.id);
  expect(recovered.active.answered).toBe(1);
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === "amamihe")?.httpOnly).toBe(
    true,
  );
});
