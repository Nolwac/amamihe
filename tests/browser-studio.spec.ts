import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft, LearningProgress } from "../shared/course";

const baseURL = process.env.PREVIEW_URL || "http://127.0.0.1:3000";

async function starter(request: APIRequestContext): Promise<CourseDraft> {
  const response = await request.post("/api/studio/courses", {
    data: { template: "storytelling" },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function enterPublishedHouse(page: Page, title: string) {
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Visit course house: ${title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enroll & enter adventure", exact: true })
    .click();
  await openAdventurePanels(page);
  await expect(page.getByLabel("Published course adventure")).toBeVisible({
    timeout: 30000,
  });
}

test("tutor publishes an authored 3D course and a separate learner resumes and clears its versioned checkpoints", async ({
  page,
  context,
  browser,
}) => {
  const errors: string[] = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await createAccount(context.request, "Storytelling Tutor");
  await page.goto("/");
  await openCityMenu(page);
  await page.getByRole("button", { name: "Tutor studio", exact: true }).click();
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/studio/courses") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /Start storytelling course/ })
    .first()
    .click();
  const original: CourseDraft = await (await created).json();
  const title = "Storytelling workshop " + randomUUID().slice(0, 8);
  await page.getByLabel("Course title", { exact: true }).fill(title);
  await page
    .locator(".studio-theme-chooser")
    .getByRole("button", { name: /Temple chase/ })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Preview course", exact: true })
    .click();
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-course-theme",
    "temple-chase",
  );
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-scene-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(page.locator(".studio-preview-question")).toContainText(
    original.definition.levels[0].questions[0].prompt,
  );
  await page.screenshot({
    path: "test-results/tutor-studio-desktop.png",
    fullPage: true,
  });
  expect(
    (await (await context.request.get("/api/session")).json()).player.points,
  ).toBe(0);
  await page.getByRole("button", { name: /Publish course/ }).click();
  await expect(page.getByText(/Version 1 published\./)).toBeVisible();
  const authored: CourseDraft = await (
    await context.request.get(`/api/studio/courses/${original.id}`)
  ).json();
  expect(authored.definition.title).toBe(title);
  expect(authored.definition.levels).toHaveLength(6);
  await page
    .getByRole("button", { name: "Return to game", exact: true })
    .click();

  await page.close();
  const learner = await browser.newContext({ baseURL });
  try {
    await createAccount(learner.request, "Storytelling Learner", "gold");
    const learnerPage = await learner.newPage();
    learnerPage.on("pageerror", (error) =>
      errors.push(error.stack || error.message),
    );
    await learnerPage.goto("/");
    await enterPublishedHouse(learnerPage, title);
    let progress: LearningProgress = await (
      await learner.request.get(`/api/learning/${original.id}`)
    ).json();
    let refreshed = false;
    let submissionCount = 0;
    const expectedPoints = authored.definition.levels.reduce(
      (sum, level) => sum + level.points,
      0,
    );
    while (!progress.finished) {
      const clearedBefore = progress.completedLevelIds.length;
      const level = authored.definition.levels.find(
        (item) => item.id === progress.levelId,
      )!;
      const question = level.questions[progress.questionIndex];
      expect(progress.retry).toBe(false);
      await expect(
        learnerPage.getByRole("heading", {
          name: question.prompt,
          exact: true,
        }),
      ).toBeVisible();
      await learnerPage
        .getByRole("button", {
          name: question.options[question.answer],
          exact: false,
        })
        .click();
      await learnerPage
        .getByRole("button", { name: "Start section", exact: true })
        .click({ timeout: 30000 });
      const answered = learnerPage.waitForResponse((response) =>
        response.url().endsWith(`/api/learning/${original.id}/answer`),
      );
      await learnerPage
        .getByRole("button", { name: "Submit task", exact: true })
        .click();
      const response = await answered;
      expect(response.ok()).toBe(true);
      progress = await response.json();
      if (progress.completedLevelIds.length > clearedBefore) {
        expect(progress.assessment?.status).toBe("confirmed");
        expect(progress.assessment?.criteria.every((c) => c.independent)).toBe(
          true,
        );
        expect(progress.assessment?.grades.length).toBeGreaterThan(0);
        expect(progress.assessment?.taskIds).toEqual(
          progress.finished
            ? []
            : authored.definition.levels
                .find((l) => l.id === progress.levelId)!
                .questions.map((q) => q.id),
        );
      }
      submissionCount++;
      if (!refreshed) {
        const savedQuestionId = progress.question?.id;
        await learnerPage.reload();
        await openAdventurePanels(learnerPage);
        const restored: LearningProgress = await (
          await learner.request.get(`/api/learning/${original.id}`)
        ).json();
        expect(restored.version).toBe(1);
        expect(restored.question?.id).toBe(savedQuestionId);
        expect(restored.questionIndex).toBe(progress.questionIndex);
        refreshed = true;
      } else if (
        progress.completedLevelIds.length > clearedBefore &&
        !progress.finished
      ) {
        await learnerPage
          .getByRole("button", { name: "Continue adventure", exact: true })
          .click();
        await openAdventurePanels(learnerPage);
      }
      expect(submissionCount).toBeLessThanOrEqual(12);
    }
    await expect(
      learnerPage.getByRole("heading", {
        name: "Course checkpoints complete",
        exact: true,
      }),
    ).toBeVisible();
    expect(progress.completedLevelIds).toHaveLength(6);
    expect(progress.points).toBe(expectedPoints);
    expect(progress.result?.provider).toBe("ollama:tev1:0.8b");
    expect(
      (await (await learner.request.get("/api/session")).json()).player.points,
    ).toBe(expectedPoints);
    await learnerPage.reload();
    const persisted: LearningProgress = await (
      await learner.request.get(`/api/learning/${original.id}`)
    ).json();
    expect(persisted.finished).toBe(true);
    expect(persisted.points).toBe(expectedPoints);
  } finally {
    await learner.close();
  }
  expect(errors).toEqual([]);
});

test("mobile studio supports keyboard editing, theme preview, and actionable publication errors without horizontal overflow", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(context.request, "Mobile Tutor");
  await page.goto("/");
  await openCityMenu(page);
  await page.getByRole("button", { name: "Tutor studio", exact: true }).click();
  await page.getByRole("button", { name: "New course", exact: true }).click();
  const title = page.getByLabel("Course title", { exact: true });
  await title.fill("Mobile course draft");
  await title.press("Tab");
  await expect(title).not.toBeFocused();
  await page.getByRole("button", { name: /Add level/ }).click();
  await page.getByRole("button", { name: "Edit details", exact: true }).click();
  await page
    .getByLabel("Level title", { exact: true })
    .fill("Story data workshop");
  await page
    .locator(".studio-theme-chooser")
    .getByRole("button", { name: /Racing/ })
    .click();
  await page.getByLabel("Practice points", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Publish course/ }).click();
  const issues = page.getByLabel("Publication issues", { exact: true });
  await expect(issues).toBeVisible();
  await expect(issues).toContainText(/retry|question|task/i);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Close publication issues", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Learning path", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Preview course", exact: true })
    .click();
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-course-theme",
    "racing",
  );
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 30000 },
  );
  await page.screenshot({
    path: "test-results/tutor-studio-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("drafts remain owner-only, stale edits conflict, and public versions exclude grading fields", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  try {
    await createAccount(owner, "Draft Owner");
    await createAccount(other, "Other Tutor", "gold");
    const draft = await starter(owner);
    expect((await other.get(`/api/studio/courses/${draft.id}`)).status()).toBe(
      404,
    );
    const saved = await owner.put(`/api/studio/courses/${draft.id}`, {
      data: {
        revision: draft.revision,
        definition: {
          ...draft.definition,
          title: "Versioned storytelling workshop",
        },
      },
    });
    expect(saved.ok()).toBe(true);
    const current: CourseDraft = await saved.json();
    const stale = await owner.put(`/api/studio/courses/${draft.id}`, {
      data: { revision: draft.revision, definition: draft.definition },
    });
    expect(stale.status()).toBe(409);
    const published = await owner.post(
      `/api/studio/courses/${draft.id}/publish`,
      {
        data: { revision: current.revision },
      },
    );
    expect(published.ok()).toBe(true);
    const previewResponse = await other.get(
      `/api/courses/${draft.id}?version=1`,
    );
    expect(previewResponse.ok()).toBe(true);
    const preview = await previewResponse.json();
    for (const level of preview.definition.levels)
      for (const question of [...level.questions, ...level.retryQuestions]) {
        expect(Object.keys(question).sort()).toEqual([
          "id",
          "options",
          "prompt",
        ]);
      }
    const invalid = structuredClone(current.definition);
    invalid.levels[0].retryQuestions = [];
    const invalidSave = await owner.put(`/api/studio/courses/${draft.id}`, {
      data: { revision: current.revision, definition: invalid },
    });
    expect(invalidSave.ok()).toBe(true);
    const invalidDraft: CourseDraft = await invalidSave.json();
    const rejected = await owner.post(
      `/api/studio/courses/${draft.id}/publish`,
      {
        data: { revision: invalidDraft.revision },
      },
    );
    expect(rejected.status()).toBe(422);
    expect((await rejected.json()).issues.length).toBeGreaterThan(0);
    const unchanged = await (
      await other.get(`/api/courses/${draft.id}?version=1`)
    ).json();
    expect(unchanged).toEqual(preview);
  } finally {
    await owner.dispose();
    await other.dispose();
  }
});
