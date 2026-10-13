import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import { openCityMenu } from "./game-ui-helpers";
import type { CourseDraft } from "../shared/course";

test("phone adventure restores the paused draft and exposes world study and practice through collapsed icons", async ({
  page,
  context,
}) => {
  // Teaching-role choices and final clearance use repeated real CPU decisions.
  test.setTimeout(300000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(context.request, "World Reader");
  const draft: CourseDraft = await (
    await context.request.post("/api/studio/courses", {
      data: { template: "storytelling" },
    })
  ).json();
  draft.definition.title = "Immersive " + draft.id;
  draft.definition.levels = draft.definition.levels.slice(0, 1);
  draft.definition.concepts = draft.definition.concepts.slice(0, 1);
  const level = draft.definition.levels[0];
  level.theme = "workshop";
  level.timeLimitSeconds = 0;
  draft.definition.resources.push({
    id: "arithmetic",
    title: "Workshop arithmetic",
    kind: "javascript",
    content: "return 2+2;",
    url: "",
    source: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  });
  level.resourceIds.push("arithmetic");
  const reading = draft.definition.resources.find(
    (r) => level.resourceIds.includes(r.id) && r.kind === "reading",
  )!;
  reading.content +=
    "\n\n" +
    "Trace story ownership and reserve unseen examples before training. ".repeat(
      20,
    );
  const saved = await (
    await context.request.put("/api/studio/courses/" + draft.id, {
      data: { revision: draft.revision, definition: draft.definition },
    })
  ).json();
  expect(
    (
      await context.request.post(`/api/studio/courses/${draft.id}/publish`, {
        data: { revision: saved.revision },
      })
    ).ok(),
  ).toBe(true);
  await context.request.post(`/api/courses/${draft.id}/enroll`, {
    data: { version: 1 },
  });
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeHidden();
  await openCityMenu(page);
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Resume " + draft.definition.title,
      exact: true,
    })
    .click();
  await expect(page.locator("#adventure-task-panel")).toBeHidden();
  const canvas = page.locator("canvas.course-scene");
  await expect(canvas).toHaveAttribute("data-avatar-ready", "true", {
    timeout: 30000,
  });
  const bounds = await canvas.boundingBox();
  expect(bounds!.width).toBeGreaterThan(380);
  expect(bounds!.height).toBeGreaterThan(600);
  await expect(canvas).toHaveAttribute("data-resource-stations", /arithmetic/);
  const resources = JSON.parse(
    (await canvas.getAttribute("data-resource-stations")) || "[]",
  );
  expect(resources).toContain("arithmetic");
  const cameraAngle = () =>
    canvas.evaluate((el: any) => {
      const c = el.getAdventureSnapshot().camera;
      return Math.atan2(
        c.position[0] - c.target[0],
        c.position[2] - c.target[2],
      );
    });
  const beforeAngle = await cameraAngle();
  await page.mouse.move(bounds!.x + 195, bounds!.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 315, bounds!.y + 180, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const delta = (await cameraAngle()) - beforeAngle;
  const turn = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  expect(turn).toBeGreaterThan(0.01);
  expect(turn).toBeLessThan(0.35);
  await page.locator(".audio-controls summary").click();
  await page
    .getByRole("button", { name: "Enable game audio", exact: true })
    .click();
  await page.getByLabel("Game volume", { exact: true }).press("End");
  await page.getByLabel("Music volume", { exact: true }).press("End");
  await page.getByLabel("Sound effects volume", { exact: true }).press("Home");
  const peak = await page.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      const s = (window as any).getAmamiheAudioSnapshot();
      peak = Math.max(peak, s.rms);
      await new Promise((r) => setTimeout(r, 40));
    }
    return peak;
  });
  expect(peak).toBeGreaterThan(0.07);
  expect(peak).toBeLessThan(0.75);
  await page
    .getByRole("button", { name: "Mute game audio", exact: true })
    .click();
  await page.locator(".audio-controls summary").click();
  const read = draft.definition.resources.find(
    (r) => level.resourceIds.includes(r.id) && r.kind === "reading",
  )!;
  const resourceScreen = JSON.parse(
    (await canvas.getAttribute("data-resource-screens")) || "[]",
  ).find((r: any) => r.id === read.id).screen;
  expect(resourceScreen[0]).toBeGreaterThan(0);
  expect(resourceScreen[0]).toBeLessThan(bounds!.width);
  await canvas.click({
    position: { x: resourceScreen[0], y: resourceScreen[1] },
  });
  const journal = page.getByLabel("Field journal: " + read.title, {
    exact: true,
  });
  await expect(journal).toBeVisible();
  await expect(journal.locator(".journal-page")).toContainText(
    read.content.slice(0, 50),
  );
  const recordJourney = async (
    activity: string,
    role: string,
    click: () => Promise<void>,
  ) => {
    const saving = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/learning/${draft.id}/journey`) &&
        r.request().method() === "POST" &&
        r.request().postDataJSON()?.activity === activity,
      { timeout: 90000 },
    );
    await click();
    const response = await saving;
    expect(response.ok()).toBe(true);
    const saved = await response.json();
    expect(saved.progress.journey.observed).toContain(role);
    expect(saved.progress.selection.status).toBe("ready");
  };
  await recordJourney("study", "Explainer", () =>
    journal.getByRole("button", { name: "Record field study" }).click(),
  );
  await journal.getByRole("button", { name: "Next page", exact: true }).click();
  await page.screenshot({ path: "test-results/immersive-field-journal.png" });
  await page.getByLabel("Close field journal").click();
  await page.getByLabel("World resources", { exact: true }).click();
  await page
    .getByRole("button", { name: "Read: " + read.title, exact: true })
    .click();
  await expect(journal.getByLabel("Journal pages").locator("span")).toHaveText(
    new RegExp("^2 /"),
  );
  await page.getByLabel("Close field journal").click();
  await page.getByLabel("World resources", { exact: true }).click();
  await page
    .getByRole("button", { name: "Practise: Workshop arithmetic", exact: true })
    .click();
  const practice = page.getByLabel("Practice: Workshop arithmetic", {
    exact: true,
  });
  await practice.getByRole("button", { name: "Open practice" }).click();
  await practice.getByRole("button", { name: "Run code" }).click();
  await expect(practice.getByRole("status")).toHaveText("4");
  await practice
    .getByRole("button", { name: "Save practice evidence" })
    .click();
  await expect(
    practice.getByText(/Practice saved as unverified/),
  ).toBeVisible();
  await practice.getByLabel("JavaScript workspace").fill("return 7;");
  await page.getByLabel("Close field journal").click();
  await page.getByRole("button", { name: "Show task", exact: true }).click();
  const delivered = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  const firstTask = level.questions[delivered.questionIndex];
  await page
    .getByRole("button", { name: firstTask.options[0], exact: false })
    .click();
  await page
    .getByRole("button", { name: "Start section", exact: true })
    .click();
  await page.reload();
  await expect(page.getByLabel("Published course adventure")).toBeVisible();
  await expect(page.locator("#adventure-task-panel")).toBeHidden();
  await page.getByRole("button", { name: "Show task", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: firstTask.options[0],
      exact: false,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Resume section", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/immersive-phone-resume.png" });
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: firstTask.options[firstTask.answer],
      exact: false,
    })
    .click();
  const answering = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/learning/${draft.id}/answer`) &&
      r.request().method() === "POST",
    { timeout: 90000 },
  );
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  const answered = await answering;
  expect(answered.ok()).toBe(true);
  const nextTaskProgress = await answered.json();
  const nextTask = level.questions[nextTaskProgress.questionIndex];
  await page
    .getByRole("button", {
      name: nextTask.options[nextTask.answer],
      exact: false,
    })
    .click();
  await page
    .getByRole("button", { name: "Start section", exact: true })
    .click();
  const clearing = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/learning/${draft.id}/answer`) &&
      r.request().method() === "POST",
    { timeout: 90000 },
  );
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  const clearedResponse = await clearing;
  expect(clearedResponse.ok()).toBe(true);
  const completed = await clearedResponse.json();
  expect(completed.assessment.status).toBe("confirmed");
  expect(completed.finished).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "Course checkpoints complete",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish learning journey", exact: true })
    .click();
  const journey = page.getByLabel("Learning journey", { exact: true });
  const open = async (text: string) =>
    journey.locator("summary").filter({ hasText: text }).click();
  await open("Mapmaker");
  await recordJourney("map", "Mapmaker", () =>
    journey.getByRole("button", { name: "Record route review" }).click(),
  );
  await open("Interviewer");
  await journey
    .getByLabel("My learning goal")
    .fill("Build and evaluate an honest story model.");
  await recordJourney("goal", "Interviewer", () =>
    journey.getByRole("button", { name: "Save learning goal" }).click(),
  );
  await open("Socratic Questioner");
  await journey
    .getByLabel("My reasoning")
    .fill("Keep held-out data outside the optimizer to test generalisation.");
  await recordJourney("reasoning", "Socratic Questioner", () =>
    journey.getByRole("button", { name: "Save reasoning" }).click(),
  );
  await open("Diagnostician");
  await recordJourney("diagnosis", "Diagnostician", () =>
    journey.getByRole("button", { name: "Record evidence review" }).click(),
  );
  await open("Sparring Partner");
  await journey
    .getByRole("button", {
      name: level.retryQuestions[0].options[level.retryQuestions[0].answer],
      exact: true,
    })
    .click();
  await recordJourney("rehearsal", "Sparring Partner", () =>
    journey.getByRole("button", { name: "Check rehearsal" }).click(),
  );
  await open("Clerk");
  await journey
    .getByLabel("My course takeaway")
    .fill("Trace story rights and reserve held-out stories before training.");
  await recordJourney("reflection", "Clerk", () =>
    journey.getByRole("button", { name: "Save course takeaway" }).click(),
  );
  await expect(
    journey
      .getByRole("status")
      .filter({ hasText: "All ten teaching roles visited" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/immersive-learning-journey.png",
  });
  await page.getByLabel("Close learning journey").click();
  await page.getByLabel("World resources", { exact: true }).click();
  await page
    .getByRole("button", { name: "Practise: Workshop arithmetic", exact: true })
    .click();
  const restored = page.getByLabel("Practice: Workshop arithmetic", {
    exact: true,
  });
  await restored.getByRole("button", { name: "Open practice" }).click();
  await expect(restored.getByLabel("JavaScript workspace")).toHaveValue(
    "return 7;",
  );
});
