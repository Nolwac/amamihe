import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft, LearningProgress } from "../shared/course";
test("playable themes, step Game Over, badge and cosmetic purchase survive reload", async ({
  page,
  context,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await createAccount(context.request, "Adventure Explorer");
  const created = await context.request.post("/api/studio/courses", {
    data: { template: "storytelling" },
  });
  const draft: CourseDraft = await created.json();
  const title = "Playable adventures " + draft.id.slice(0, 8);
  draft.definition.title = title;
  draft.definition.levels = draft.definition.levels.slice(0, 4);
  draft.definition.concepts = draft.definition.concepts.slice(0, 4);
  const themes = ["temple-chase", "racing", "wrestling", "workshop"] as const;
  draft.definition.levels.forEach((l, i) => {
    l.theme = themes[i];
    l.timeLimitSeconds = 15;
    l.questions = l.questions.slice(0, 1);
    l.retryQuestions = l.retryQuestions.filter(
      (q) => q.retryFor === l.questions[0].id,
    );
  });
  const saved = await context.request.put("/api/studio/courses/" + draft.id, {
    data: { revision: draft.revision, definition: draft.definition },
  });
  expect(saved.ok()).toBe(true);
  const publication = await context.request.post(
    "/api/studio/courses/" + draft.id + "/publish",
    { data: { revision: (await saved.json()).revision } },
  );
  expect(publication.ok()).toBe(true);
  await page.goto("/");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Visit course house: " + title, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enroll & enter adventure", exact: true })
    .click();
  await openAdventurePanels(page);
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 30000 },
  );
  await page
    .getByLabel("Adventure graphics", { exact: true })
    .selectOption("720");
  await expect
    .poll(async () =>
      Number(
        await page
          .locator("canvas[data-course-theme]")
          .getAttribute("data-render-height"),
      ),
    )
    .toBeGreaterThan(700);
  await page
    .getByRole("button", { name: "Start section", exact: true })
    .click();
  const canvas = page.locator("canvas[data-course-theme]");
  await expect(canvas).toHaveAttribute("data-game-status", "active");
  const gate = JSON.parse((await canvas.getAttribute("data-answer-gate-a"))!);
  await canvas.click({ position: gate });
  await expect(canvas).toHaveAttribute(
    "data-last-gate-pick",
    "answer-gate-surface-0",
  );
  await expect(canvas).toHaveAttribute("data-gate-choice-index", "0");
  await expect(canvas).toHaveAttribute("data-gate-callback", "true");
  await expect(page.locator(".answers button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Game Over", exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-game-status",
    "game-over",
  );
  const failed: LearningProgress = await (
    await context.request.get("/api/learning/" + draft.id)
  ).json();
  expect(failed.completedLevelIds).toEqual([]);
  expect(failed.points).toBe(0);
  await page.screenshot({ path: "test-results/step4-temple-game-over.png" });
  await page
    .getByRole("button", { name: "Retry this step", exact: true })
    .click();
  for (let i = 0; i < 4; i++) {
    await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-course-theme",
      themes[i],
    );
    await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-avatar-ready",
      "true",
      { timeout: 30000 },
    );
    if (i > 0) {
      await page
        .getByLabel("Section timing", { exact: true })
        .selectOption("0");
      await page
        .getByRole("button", { name: "Start section", exact: true })
        .click();
    }
    await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-game-status",
      "active",
    );
    await page.screenshot({ path: `test-results/step4-${themes[i]}.png` });
    if (i === 2) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByLabel("Adventure graphics", { exact: true })
        .selectOption("144");
      await page.screenshot({
        path: "test-results/step4-mobile-adventure.png",
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    const q = draft.definition.levels[i].questions[0];
    await page
      .getByRole("button", { name: q.options[q.answer], exact: false })
      .click();
    const assessment = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/learning/${draft.id}/answer`) &&
        response.request().method() === "POST",
      { timeout: 90000 },
    );
    await page
      .getByRole("button", { name: "Submit task", exact: true })
      .click();
    expect((await assessment).ok()).toBe(true);
    if (i < 3)
      await page
        .getByRole("button", { name: "Continue adventure", exact: true })
        .click();
    await openAdventurePanels(page);
  }
  await expect(
    page.getByText(/Checkpoint finisher badge earned/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save & return to Venture City", exact: true })
    .click();
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unlock Azure explorer jacket", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Equipped", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Avatar wardrobe and rewards")).toContainText(
    "checkpoint finisher",
  );
  const before = await (await context.request.get("/api/rewards")).json();
  expect(before.inventory).toContain("azure");
  expect(before.outfit).toBe("azure");
  await context.request.post("/api/rewards/buy", { data: { gearId: "azure" } });
  expect(
    (await (await context.request.get("/api/rewards")).json()).points,
  ).toBe(before.points);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/step4-mobile-wardrobe.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  const after = await (await context.request.get("/api/rewards")).json();
  expect(after.outfit).toBe("azure");
  expect(after.badges).toHaveLength(1);
  expect(errors).toEqual([]);
});
