import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createAccount } from "./auth-helpers";
import { storytellingCourse } from "../server/course-template";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue";
import type { LearningProgress } from "../shared/course";

test("Model Makers enters the published six-level pilot, saves practice and a notebook, and resumes to completion", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createAccount(context.request, "Pilot Learner");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Visit Model Makers", exact: true })
    .click({ timeout: 30000 });
  const preview = page.getByLabel("Published course house preview");
  await expect(preview.getByText("6 levels", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Course learning path").locator("li"),
  ).toHaveCount(6);
  await preview
    .getByRole("button", { name: "Enroll & enter adventure" })
    .click();
  await openAdventurePanels(page);
  const definition = storytellingCourse();
  let progress: LearningProgress = await (
    await context.request.get(`/api/learning/${STORYTELLING_COURSE_ID}`)
  ).json();
  let submitted = 0;
  let downloadChecked = false;
  let practiceChecked = false;
  while (!progress.finished) {
    const level = definition.levels.find((l) => l.id === progress.levelId)!;
    const question = level.questions[progress.questionIndex];
    await expect(
      page.getByRole("heading", { name: question.prompt, exact: true }),
    ).toBeVisible();
    if (level.id === "parameters-level" && !practiceChecked) {
      await page
        .locator("summary")
        .filter({ hasText: "Check embedding parameter arithmetic" })
        .click();
      const practice = page.getByRole("region", {
        name: "Practice: Check embedding parameter arithmetic",
      });
      await practice.getByRole("button", { name: "Open practice" }).click();
      await practice
        .getByLabel("JavaScript workspace")
        .fill("return tokens * width;");
      await practice.getByRole("button", { name: "Run code" }).click();
      await expect(practice.getByRole("status")).toHaveText("16384");
      await practice
        .getByRole("button", { name: "Save practice evidence" })
        .click();
      await expect(
        practice.getByText(/Server check: verified-bounded-practice/),
      ).toBeVisible();
      practiceChecked = true;
    }
    if (level.id === "training-level" && !downloadChecked) {
      await page
        .locator("summary")
        .filter({ hasText: "Reference Python training notebook" })
        .click();
      const practice = page.getByRole("region", {
        name: "Practice: Reference Python training notebook",
      });
      await practice.getByRole("button", { name: "Open practice" }).click();
      const event = page.waitForEvent("download");
      await practice
        .getByRole("button", { name: "Download training notebook" })
        .click();
      const downloaded = await event;
      const notebook = JSON.parse(
        await readFile((await downloaded.path())!, "utf8"),
      );
      const code = notebook.cells
        .filter((c: { cell_type: string }) => c.cell_type === "code")
        .map((c: { source: string[] }) => c.source.join(""))
        .join("\n");
      expect(code).toContain("1_040_768");
      expect(code).toContain("loss.backward()");
      expect(code).toContain("story-model.pt");
      downloadChecked = true;
    }
    await page
      .getByRole("button", {
        name: question.options[question.answer],
        exact: false,
      })
      .click();
    await page
      .getByRole("button", { name: "Start section", exact: true })
      .click({ timeout: 30000 });
    const answered = page.waitForResponse((r) =>
      r.url().endsWith(`/api/learning/${STORYTELLING_COURSE_ID}/answer`),
    );
    await page
      .getByRole("button", { name: "Submit task", exact: true })
      .click();
    const response = await answered;
    expect(response.ok()).toBe(true);
    const before = progress.completedLevelIds.length;
    progress = await response.json();
    submitted++;
    if (progress.completedLevelIds.length > before && !progress.finished) {
      await page
        .getByRole("button", { name: "Continue adventure", exact: true })
        .click();
      await openAdventurePanels(page);
    }
    if (submitted === 2) {
      await page.reload();
      await openAdventurePanels(page);
      await expect(
        page.getByRole("heading", {
          name: definition.levels.find((l) => l.id === progress.levelId)!
            .questions[progress.questionIndex].prompt,
          exact: true,
        }),
      ).toBeVisible();
    }
    expect(submitted).toBeLessThanOrEqual(12);
  }
  expect(submitted).toBe(12);
  expect(progress.completedLevelIds).toHaveLength(6);
  expect(progress.points).toBe(240);
  expect(practiceChecked && downloadChecked).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "Course checkpoints complete",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/pilot-six-level-complete.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("phone Model Makers entrance opens the actual pilot rather than the foundations checkpoint", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(context.request, "Phone Pilot");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Visit Model Makers", exact: true })
    .click({ timeout: 30000 });
  await expect(
    page.getByLabel("Course learning path").locator("li"),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "Enroll & enter adventure" }).click();
  await openAdventurePanels(page);
  await expect(page.getByLabel("Published course adventure")).toBeVisible();
  const progress = await (
    await context.request.get(`/api/learning/${STORYTELLING_COURSE_ID}`)
  ).json();
  expect(progress.levelId).toBe("data-level");
  expect(progress.completedLevelIds).toEqual([]);
});
