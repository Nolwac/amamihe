import { test, expect, type Page } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import { openCityMenu } from "./game-ui-helpers";
import { kidsCourses } from "../server/kids-courses";
import type { LearningProgress } from "../shared/course";

test.use({ hasTouch: true });
async function clearHud(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            "[data-hud-item], [data-hud-obstacle], .hud-arrange",
          ),
        ]
          .filter(
            (e) =>
              getComputedStyle(e).visibility !== "hidden" &&
              e.getBoundingClientRect().width > 0 &&
              getComputedStyle(e).display !== "none",
          )
          .map((e) => ({
            id: e.dataset.hudItem || e.dataset.hudObstacle || "arrange",
            r: e.getBoundingClientRect().toJSON(),
          }));
        const outside = items
          .filter(
            ({ r }) =>
              r.left < -0.5 ||
              r.top < -0.5 ||
              r.right > innerWidth + 0.5 ||
              r.bottom > innerHeight + 0.5,
          )
          .map((i) => i.id);
        const collisions: string[] = [];
        items.forEach((a, i) =>
          items.slice(i + 1).forEach((b) => {
            if (
              a.r.left < b.r.right - 1 &&
              a.r.right > b.r.left + 1 &&
              a.r.top < b.r.bottom - 1 &&
              a.r.bottom > b.r.top + 1
            )
              collisions.push(a.id + "/" + b.id);
          }),
        );
        return { outside, collisions };
      }),
    )
    .toEqual({ outside: [], collisions: [] });
}
test("phone controls do not overlap, touch dragging persists, panels fit, and reset and rotation recover", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Mobile Layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".world-canvas")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(
    page.getByLabel("Learning Police controls", { exact: true }),
  ).toBeVisible();
  await clearHud(page);
  await page.getByLabel("City graphics settings").click();
  const panel = await page.locator(".quality-control").boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
  await page.getByLabel("City graphics settings").click();
  await expect(page.locator(".quality-control")).toBeHidden();
  await page.getByLabel("City graphics settings").click();
  await page.getByLabel("Show skill categories").click();
  await expect(page.locator(".quality-control")).toBeHidden();
  await page.getByLabel("Show skill categories").click();
  const original = await page.locator(".hud-map").boundingBox();
  await page
    .getByRole("button", { name: "Arrange controls", exact: true })
    .click();
  const cdp = await context.newCDPSession(page);
  const x = original!.x + 22,
    y = original!.y + 22;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 120, y: 330 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const moved = await page.locator(".hud-map").boundingBox();
  expect(moved!.x).toBeLessThan(original!.x - 100);
  await clearHud(page);
  await page.reload();
  await expect(page.locator(".hud-map")).toHaveCSS("left", `${moved!.x}px`);
  await page.getByLabel("Show district map").click();
  await expect(page.getByLabel("Workshop District map")).toBeVisible();
  await page.getByLabel("Show district map").click();
  await page.setViewportSize({ width: 320, height: 520 });
  await clearHud(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await clearHud(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Arrange controls", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move district map", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 360, height: 520 },
    { width: 568, height: 320 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await clearHud(page);
  }
  await page.screenshot({ path: "test-results/mobile-clear-controls.png" });
});

for (const { id, definition } of kidsCourses())
  test(`${definition.title} publishes an age-specific 3D world and completes four challenges`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await createAccount(context.request, "Family Explorer");
    await page.goto("/");
    await openCityMenu(page);
    await page
      .getByRole("button", { name: "Children’s games", exact: true })
      .click();
    if (id === "amamihe-number-garden")
      await expect(
        page.getByRole("heading", { name: "Number Garden", exact: true }),
      ).toBeInViewport();
    await page
      .getByRole("button", {
        name: "Visit course house: " + definition.title,
        exact: true,
      })
      .click();
    const preview = page.getByLabel("Published course house preview");
    await expect(preview).toContainText(definition.summary);
    await preview
      .getByRole("button", { name: "Enroll & enter adventure", exact: true })
      .click();
    const canvas = page.locator("canvas.course-scene");
    await expect(canvas).toHaveAttribute("data-avatar-ready", "true", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute(
      "data-world-style",
      definition.levels[0].worldStyle!,
    );
    await clearHud(page);
    await page.getByLabel("World resources", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "Read: " + definition.resources[0].title,
        exact: true,
      })
      .click();
    await expect(page.locator(".journal-page")).toContainText(
      definition.resources[0].content.slice(0, 60),
    );
    await page
      .getByRole("button", { name: "Put this discovery to work", exact: true })
      .click();
    let progress: LearningProgress = await (
      await context.request.get(`/api/learning/${id}`)
    ).json();
    let count = 0;
    while (!progress.finished && count < 10) {
      const l = definition.levels.find((l) => l.id === progress.levelId)!;
      const q = [...l.questions, ...l.retryQuestions].find(
        (q) => q.prompt === progress.question!.prompt,
      )!;
      await expect(
        page.getByRole("heading", { name: q.prompt, exact: true }),
      ).toBeVisible();
      const play = page
        .locator(".adventure-header-actions")
        .getByRole("button", { name: /Start section|Resume section/ });
      if (await play.isVisible()) await play.click();
      if (q.worldTask?.kind === "fraction-bridge") {
        for (let i = 0; i < q.answer + 1; i++)
          await page
            .getByRole("button", { name: "Add 1/8 beam", exact: true })
            .click();
      } else if (q.worldTask?.kind === "circuit") {
        for (const i of [0, 1])
          if (q.worldTask.initial[i] !== Boolean(q.answer & (1 << i)))
            await page
              .getByRole("button", {
                name: new RegExp(`Relay ${i === 0 ? "A" : "B"}:`),
              })
              .click();
      } else
        await page
          .getByRole("button", { name: q.options[q.answer], exact: false })
          .click();
      const before = progress.completedLevelIds.length;
      const answered = page.waitForResponse((r) =>
        r.url().endsWith(`/api/learning/${id}/answer`),
      );
      await page
        .getByRole("button", { name: "Submit task", exact: true })
        .click();
      const response = await answered;
      expect(response.ok()).toBe(true);
      progress = await response.json();
      count++;
      if (
        !progress.finished &&
        (q.worldTask || progress.completedLevelIds.length > before)
      ) {
        await page
          .getByRole("button", { name: "Continue adventure", exact: true })
          .click();
      }
    }
    expect(count).toBe(4);
    expect(progress.finished).toBe(true);
    expect(progress.points).toBe(20);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/${id}-completed.png` });
    if (progress.worldAchievement) {
      await page
        .getByRole("button", { name: "Return to city", exact: true })
        .click();
      await page.reload();
      await openCityMenu(page);
      await page
        .getByRole("button", { name: "Children’s games", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Resume " + definition.title,
          exact: true,
        })
        .click();
      await expect(canvas).toHaveAttribute("data-avatar-ready", "true", {
        timeout: 30000,
      });
      await expect(canvas).toHaveAttribute(
        "data-world-task",
        progress.worldAchievement.evidence.kind,
      );
      await expect(canvas).toHaveAttribute(
        "data-world-evidence",
        JSON.stringify(progress.worldAchievement.evidence),
      );
      const restored: LearningProgress = await (
        await context.request.get(`/api/learning/${id}`)
      ).json();
      expect(restored.points).toBe(20);
      expect(restored.worldAchievement).toEqual(progress.worldAchievement);
    }
  });
