import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
test("authored recall encounters resume, mark help, and keep early practice separate from scheduled recall", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Recall Explorer");
  const d: CourseDraft = await (
    await context.request.post("/api/studio/courses", {
      data: { template: "storytelling" },
    })
  ).json();
  d.definition.title = "Recall " + d.id;
  d.definition.levels = d.definition.levels.slice(0, 1);
  d.definition.concepts = d.definition.concepts.slice(0, 1);
  const l = d.definition.levels[0];
  l.questions = l.questions.slice(0, 1);
  l.retryQuestions = l.retryQuestions.filter(
    (q) => q.retryFor === l.questions[0].id,
  );
  const saved = await context.request.put("/api/studio/courses/" + d.id, {
    data: { revision: d.revision, definition: d.definition },
  });
  expect(saved.ok()).toBe(true);
  expect(
    (
      await context.request.post("/api/studio/courses/" + d.id + "/publish", {
        data: { revision: (await saved.json()).revision },
      })
    ).ok(),
  ).toBe(true);
  await context.request.post("/api/courses/" + d.id + "/enroll", {
    data: { version: 1 },
  });
  const current = await (
    await context.request.get("/api/learning/" + d.id)
  ).json();
  await context.request.post("/api/learning/" + d.id + "/play", {
    data: { questionId: current.question.id, multiplier: 0 },
  });
  expect(
    (
      await context.request.post("/api/learning/" + d.id + "/answer", {
        data: {
          questionId: current.question.id,
          answer: l.questions[0].answer,
          elapsedMs: 0,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  const desk = page.getByRole("region", { name: "Review encounters" });
  await expect(desk.getByText(/1 confirmed checkpoints/)).toBeVisible();
  await desk.getByLabel("Review timezone").selectOption("Africa/Lagos");
  await desk
    .getByRole("button", { name: "Practice early: " + l.title, exact: true })
    .click();
  await expect(desk.getByText(/Early practice:/)).toBeVisible();
  await expect(desk.locator("canvas")).toHaveAttribute(
    "data-scene-ready",
    "true",
  );
  const initial = await context.request.post("/api/reviews/start", {
    data: { courseId: d.id, version: 1, levelId: l.id },
  });
  expect(initial.ok()).toBe(true);
  const id = (await initial.json()).id;
  await page.reload();
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await desk
    .getByRole("button", { name: "Practice early: " + l.title, exact: true })
    .click();
  expect(
    (
      await (
        await context.request.post("/api/reviews/start", {
          data: { courseId: d.id, version: 1, levelId: l.id },
        })
      ).json()
    ).id,
  ).toBe(id);
  await desk
    .getByRole("button", { name: "Show review explanation", exact: true })
    .click();
  await desk
    .getByRole("button", {
      name: l.retryQuestions[0].options[l.retryQuestions[0].answer],
      exact: true,
    })
    .click();
  await desk
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(desk.getByRole("status")).toHaveText(
    l.retryQuestions[0].explanation,
  );
  const progress = await (
    await context.request.get("/api/learning/" + d.id)
  ).json();
  expect(progress.completedLevelIds).toEqual([l.id]);
  expect(progress.points).toBe(l.points);
});
