import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { createAccount, signupInBrowser } from "./auth-helpers";
import { test, expect } from "@playwright/test";
test("3D browser journey: verified account, recorded chunks, clearance, classification, persistence and idempotency", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await signupInBrowser(page, "Browser Explorer", "teal");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-mode",
    "world",
  );
  await expect(page.getByLabel("Create your explorer")).toHaveCount(0);
  await expect(page.getByText("LIVE 3D")).toBeVisible();
  await expect(page.locator(".engine-status b")).not.toHaveText("Loading", {
    timeout: 30000,
  });
  const mapPosition = page.locator('.district-map g[transform^="translate"]');
  const before = await mapPosition.getAttribute("transform");
  await page.keyboard.down("w");
  await expect(mapPosition).not.toHaveAttribute("transform", before!);
  await page.keyboard.up("w");
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await page.getByLabel("Graphics quality").selectOption("medium");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-quality",
    "medium",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 30000 },
  );
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Try foundations checkpoint", exact: true })
    .click();
  const entering = page.waitForResponse(
    (r) => r.url().endsWith("/api/attempts") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enter course adventure" }).click();
  const entryResponse = await entering;
  expect(entryResponse.ok()).toBe(true);
  const activeFoundation = await entryResponse.json();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-render-state",
    "paused",
  );
  const foundationAnswers: Record<string, string> = {
    tokens: "Turns text into token IDs",
    split: "To test how well it generalizes",
    scratch: "Start with newly initialized weights",
  };
  for (const question of activeFoundation.questions) {
    const choice = foundationAnswers[question.id];
    await page.getByRole("button", { name: new RegExp(choice) }).click();
    await page
      .getByRole("button", { name: /Record response|Clear the level/ })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Assess learning checkpoint" }),
  ).toBeVisible();
  const pre = await context.request.get("/api/session");
  expect((await pre.json()).player.points).toBe(0);
  let completeURL = "";
  page.on("request", (r) => {
    if (r.url().endsWith("/complete")) completeURL = r.url();
  });
  const assessed = page.waitForResponse(
    (r) => r.url().endsWith("/complete") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Assess learning checkpoint" })
    .click();
  const assessedResponse = await assessed;
  expect(assessedResponse.ok()).toBe(true);
  expect((await assessedResponse.json()).provider).toBe("ollama:tev1:0.8b");
  await expect(page.getByText("Data Workshop", { exact: true })).toBeVisible();
  await expect(page.getByText("+60", { exact: true })).toBeVisible();
  await context.request.post(completeURL, { data: {} });
  const session = await context.request.get("/api/session");
  expect((await session.json()).player.points).toBe(60);
  await page.getByLabel("Return to city").click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-render-state",
    "active",
    { timeout: 30000 },
  );
  await page.reload();
  await expect(page.locator(".player-chip")).toContainText("Browser Explorer");
  await openCityMenu(page);
  await page.getByRole("button", { name: /My learning/ }).click();
  await page
    .getByRole("button", { name: "View foundations checkpoint progress" })
    .click();
  await expect(page.getByText("Data Workshop", { exact: true })).toBeVisible();
  // Visual captures run separately; this journey verifies progress and recovery.
  expect(errors).toEqual([]);
});
test("mobile browser and touch controls, assistance tracking, and incomplete boundary rejection", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await signupInBrowser(page, "Mobile Explorer", "terracotta");
  await expect(page.getByRole("button", { name: "Walk Up" })).toBeVisible();
  const a = await context.request.post("/api/attempts", { data: {} });
  const d = await a.json();
  const incomplete = await context.request.post(
    "/api/attempts/" + d.id + "/complete",
    { data: {} },
  );
  expect(incomplete.status()).toBe(400);
  await context.request.post("/api/attempts/" + d.id + "/help", {
    data: { questionId: "tokens" },
  });
  const answers: Record<string, number> = { tokens: 0, split: 1, scratch: 2 };
  for (const { id: questionId } of d.questions)
    await context.request.post("/api/attempts/" + d.id + "/chunks", {
      data: {
        questionId,
        answer: answers[questionId],
        assisted: false,
        elapsedMs: 1000,
      },
    });
  const result = await context.request.post(
    "/api/attempts/" + d.id + "/complete",
    { data: {} },
  );
  const r = await result.json();
  expect(["retry", "review_prerequisite"]).toContain(r.route);
  expect(r.provider).toBe("ollama:tev1:0.8b");
  expect(r.independent).toBe(2);
  expect(
    r.assessments.find((x: { questionId: string }) => x.questionId === "tokens")
      .assisted,
  ).toBe(true);
  await page.screenshot({
    path: "test-results/venture-city-mobile.png",
    fullPage: true,
  });
});
test("player isolation and cross-origin mutation guard", async ({
  playwright,
}) => {
  const base = process.env.PREVIEW_URL || "http://127.0.0.1:3000";
  const a = await playwright.request.newContext({ baseURL: base });
  const b = await playwright.request.newContext({ baseURL: base });
  await createAccount(a, "Owner");
  const attempt = await (await a.post("/api/attempts", { data: {} })).json();
  await createAccount(b, "Other", "gold");
  expect(
    (
      await b.post("/api/attempts/" + attempt.id + "/complete", { data: {} })
    ).status(),
  ).toBe(404);
  expect(
    (
      await a.post("/api/session", {
        headers: { origin: "https://untrusted.example" },
        data: { name: "Changed", outfit: "gold" },
      })
    ).status(),
  ).toBe(403);
  await a.dispose();
  await b.dispose();
});

test("in-progress responses survive a browser refresh", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await signupInBrowser(page, "Resuming Explorer", "terracotta");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Try foundations checkpoint", exact: true })
    .click();
  const entering = page.waitForResponse(
    (r) => r.url().endsWith("/api/attempts") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enter course adventure" }).click();
  const entry = await entering;
  expect(entry.ok()).toBe(true);
  const plan = await entry.json();
  await page
    .getByRole("button", { name: plan.questions[0].options[0], exact: false })
    .click();
  const recording = page.waitForResponse(
    (r) => r.url().endsWith("/chunks") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Record response & continue" })
    .click();
  expect((await recording).ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: plan.questions[1].prompt, exact: true }),
  ).toBeVisible();
  const state = await (await context.request.get("/api/session")).json();
  expect(state.active.answered).toBe(1);
});

test("rigged avatars load and the HUD remains aligned at desktop, tablet, and phone widths", async ({
  page,
}) => {
  // Asset loading is a functional check; cold-start timing has a separate audit.
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 60000 },
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-avatar-animation",
    /Idle/,
  );
  expect(
    Number(await page.locator("canvas").getAttribute("data-avatar-bones")),
  ).toBeGreaterThan(10);
  for (const image of await page.locator(".outfit img").all())
    expect(
      await image.evaluate(
        (i: HTMLImageElement) => i.complete && i.naturalWidth > 0,
      ),
    ).toBe(true);
  await signupInBrowser(page, "Visual Explorer", "terracotta");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 60000 },
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-mode",
    "world",
  );
  await page.locator("canvas").focus();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-residents-ready",
    "true",
    { timeout: 60000 },
  );
  await page.keyboard.down("w");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-avatar-animation",
    /Walk/,
  );
  await page.keyboard.up("w");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-avatar-animation",
    /Idle/,
  );
  const overlap = async (a: string, b: string) =>
    page.evaluate(
      ([first, second]) => {
        const firstElement = document.querySelector(first)!,
          secondElement = document.querySelector(second)!;
        if (!firstElement.checkVisibility() || !secondElement.checkVisibility())
          return false;
        const x = firstElement.getBoundingClientRect(),
          y = secondElement.getBoundingClientRect();
        return (
          x.left < y.right &&
          x.right > y.left &&
          x.top < y.bottom &&
          x.bottom > y.top
        );
      },
      [a, b],
    );
  for (const width of [1920, 1440, 768, 640, 390, 320]) {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
    await page.waitForTimeout(900);
    expect(await overlap(".player-chip", ".points-chip")).toBe(false);
    await page.getByLabel("Show district map", { exact: true }).click();
    await expect(
      page.getByLabel("Workshop District map", { exact: true }),
    ).toBeVisible();
    expect(await overlap(".points-chip", ".district-map")).toBe(false);
    await page.getByLabel("Show district map", { exact: true }).click();
    expect(await overlap(".scene-bottom", ".topbar nav")).toBe(false);
    await expect(
      page.getByRole("button", { name: "Visit Model Makers" }),
    ).toBeVisible();
    if (width > 900) {
      await page.getByLabel("Show skill categories", { exact: true }).click();
      await expect(
        page.getByLabel("Skill categories", { exact: true }),
      ).toBeVisible();
      expect(await overlap(".player-chip", ".skills-hud")).toBe(false);
      await page.getByLabel("Show skill categories", { exact: true }).click();
    }
    if (width < 600) {
      expect(await overlap(".touch-controls", ".topbar nav")).toBe(false);
      const canvas = await page.locator("canvas").boundingBox();
      expect(canvas?.width).toBe(width);
      expect(canvas?.height).toBe(844);
    }
    // Resolution changes must leave a rendered world in the framebuffer.
    const colors = await page.locator("canvas").evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return 0;
      const sampled = new Set<string>();
      for (const x of [0.25, 0.5, 0.75])
        for (const y of [0.25, 0.5, 0.75]) {
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.floor(canvas.width * x),
            Math.floor(canvas.height * y),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel,
          );
          sampled.add(Array.from(pixel).join(","));
        }
      return sampled.size;
    });
    expect(colors).toBeGreaterThan(2);
  }
});
