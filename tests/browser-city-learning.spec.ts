import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createAccount, signupInBrowser } from "./auth-helpers";
import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import type { CourseDraft, LearningProgress } from "../shared/course";

test("free character selection persists through verification, wardrobe changes, and course entry", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.getByRole("button", { name: "Choose Kofi", exact: true }).click();
  await signupInBrowser(page, "Character Explorer");
  const city = page.locator("canvas.world-canvas");
  await expect(city).toHaveAttribute("data-character", "kofi");
  await expect(city).toHaveAttribute("data-avatar-ready", "true", {
    timeout: 30000,
  });
  const before = (await (await context.request.get("/api/session")).json())
    .player;
  expect(before.avatar).toBe("kofi");
  await page.reload();
  await expect(city).toHaveAttribute("data-character", "kofi");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  const changed = page.waitForResponse(
    (r) => r.url().endsWith("/api/avatar") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Choose Tayo", exact: true }).click();
  expect((await changed).ok()).toBe(true);
  await expect(
    page.getByRole("button", { name: "Choose Tayo", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const after = (await (await context.request.get("/api/session")).json())
    .player;
  expect(after.avatar).toBe("tayo");
  expect(after.points).toBe(before.points);
  expect(
    (
      await context.request.post("/api/avatar", {
        data: { avatar: "unavailable" },
      })
    ).status(),
  ).toBe(400);
  await page
    .locator(".course-audience-filters")
    .getByRole("button", { name: "Children’s games", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Visit course house: Fraction Bridge",
      exact: true,
    })
    .click();
  const enrollment = page.waitForResponse(
    (response) =>
      /\/api\/courses\/[^/]+\/enroll$/.test(response.url()) &&
      response.request().method() === "POST",
    { timeout: 90000 },
  );
  await page
    .getByRole("button", { name: "Enroll & enter adventure", exact: true })
    .click();
  expect((await enrollment).ok()).toBe(true);
  await expect(page.locator("canvas.course-scene")).toHaveAttribute(
    "data-character",
    "tayo",
    { timeout: 30000 },
  );
  await expect(page.locator("canvas.course-scene")).toHaveAttribute(
    "data-avatar-ready",
    "true",
    { timeout: 30000 },
  );
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((r) => r.name.endsWith("/assets/character-tayo.glb")),
    ),
  ).toBe(true);
});

test("every publication gets a district house and a learner can walk to a distant course entrance", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "District Explorer");
  const ids: string[] = [];
  for (let i = 0; i < 7; i++) {
    const draft: CourseDraft = await (
      await context.request.post("/api/studio/courses", {
        data: { template: "fraction-bridge" },
      })
    ).json();
    expect(
      (
        await context.request.post(`/api/studio/courses/${draft.id}/publish`, {
          data: { revision: draft.revision },
        })
      ).ok(),
    ).toBe(true);
    ids.push(draft.id);
  }
  await page.goto("/");
  const city = page.locator("canvas.world-canvas");
  await expect(city).toHaveAttribute("data-avatar-ready", "true", {
    timeout: 30000,
  });
  await page.getByLabel("City districts", { exact: true }).click();
  const seen = new Set<string>();
  for (let block = 0; block < 12; block++) {
    await expect(city).toHaveAttribute("data-avatar-ready", "true", {
      timeout: 30000,
    });
    const houses = JSON.parse(
      (await city.getAttribute("data-city-house-locations")) || "[]",
    );
    houses.forEach((h: { id: string }) => seen.add(h.id));
    const next = page.getByRole("button", {
      name: "Next city block",
      exact: true,
    });
    if (await next.isDisabled()) break;
    const old = await city.getAttribute("data-course-houses");
    await next.click();
    await expect(city).not.toHaveAttribute("data-course-houses", old!);
  }
  ids.forEach((id) => expect(seen.has(id)).toBe(true));
  // Walk to an actual house in the final block; pathfinding uses the same walls as keyboard movement.
  let houses = JSON.parse(
    (await city.getAttribute("data-city-house-locations")) || "[]",
  );
  if (houses.every((h: { pilot: boolean }) => h.pilot)) {
    const old = await city.getAttribute("data-course-houses");
    await page
      .getByRole("button", { name: "Previous city block", exact: true })
      .click();
    await expect(city).not.toHaveAttribute("data-course-houses", old!);
    await expect(city).toHaveAttribute("data-avatar-ready", "true", {
      timeout: 30000,
    });
    houses = JSON.parse(
      (await city.getAttribute("data-city-house-locations")) || "[]",
    );
  }
  const destination = houses.filter((h: { pilot: boolean }) => !h.pilot).at(-1);
  expect(destination).toBeTruthy();
  await page
    .getByRole("button", { name: "Walk to " + destination.title, exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Published course house preview")).toContainText(
    destination.title,
    { timeout: 55000 },
  );
  await page.screenshot({ path: "test-results/reachable-course-house.png" });
});

test("world bridge controls preserve unfinished work and verified construction on return", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await createAccount(context.request, "Bridge Builder");
  const id = "amamihe-fraction-bridge";
  await page.goto("/");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Children’s games", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Visit course house: Fraction Bridge",
      exact: true,
    })
    .click();
  const enrollment = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/courses/${id}/enroll`) &&
      response.request().method() === "POST",
    { timeout: 90000 },
  );
  await page
    .getByRole("button", { name: "Enroll & enter adventure", exact: true })
    .click();
  expect((await enrollment).ok()).toBe(true);
  await openAdventurePanels(page);
  const canvas = page.locator("canvas.course-scene");
  await expect(canvas).toHaveAttribute("data-avatar-ready", "true", {
    timeout: 30000,
  });
  await page
    .getByRole("button", { name: "Start section", exact: true })
    .click();
  const served: LearningProgress = await (
    await context.request.get(`/api/learning/${id}`)
  ).json();
  const goal = served.question!.worldTask!;
  const targetUnits =
    goal.kind === "fraction-bridge"
      ? goal.targets.reduce((n, t) => n + (t.numerator * 8) / t.denominator, 0)
      : 0;
  // Physical ray picking and accessible controls edit the same state; no reward is optimistic.
  await page.getByRole("button", { name: "Hide task", exact: true }).click();
  await expect
    .poll(() =>
      canvas.evaluate(
        (c: any) =>
          c
            .getAdventureSnapshot()
            .worldControls.find((v: any) => v.name === "beam-label-1")?.picked
            ?.units,
      ),
    )
    .toBe(1);
  const control = await canvas.evaluate((c: any) =>
    c
      .getAdventureSnapshot()
      .worldControls.find((v: any) => v.name === "beam-label-1"),
  );
  const box = await canvas.boundingBox();
  expect(control).toBeTruthy();
  await page.mouse.click(
    box!.x + control.screen[0],
    box!.y + control.screen[1],
  );
  await expect(canvas).toHaveAttribute("data-built-units", "1");
  await page.getByRole("button", { name: "Show task", exact: true }).click();
  const paused = page.waitForResponse((r) =>
    r.url().endsWith(`/api/learning/${id}/pause`),
  );
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await paused;
  await page
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Children’s games", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume Fraction Bridge", exact: true })
    .click();
  await openAdventurePanels(page);
  await expect(canvas).toHaveAttribute("data-built-units", "1");
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  for (let n = 1; n < targetUnits; n++)
    await page
      .getByRole("button", { name: "Add 1/8 beam", exact: true })
      .click();
  // Check high-resolution rendering while the task's graphics control is open.
  // Return to a fixed 360p for the short gait sample under software WebGL.
  await page
    .getByLabel("Adventure graphics", { exact: true })
    .selectOption("720");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-height")))
    .toBeGreaterThanOrEqual(600);
  const highFrame = Number(await canvas.getAttribute("data-render-frame"));
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frame")))
    .toBeGreaterThan(highFrame + 2);
  await page.screenshot({
    path: "test-results/fraction-bridge-workbench-720.png",
  });
  await page
    .getByLabel("Adventure graphics", { exact: true })
    .selectOption("360");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-height")))
    .toBe(360);
  // Observe rendered frames before submitting: a short crossing can finish
  // between remote browser polls under software WebGL.
  // Keep actual root and bone poses so an idle actor or a sliding rig fails.
  await canvas.evaluate((c: any) => {
    const frames: {
      animation: string;
      animationFrame?: number;
      capturedAt: number;
      position: number[];
      legs: number[];
    }[] = [];
    const observer = new MutationObserver(() => {
      const actor = c.getAdventureSnapshot({ actorOnly: true }).actor;
      if (!actor || (!frames.length && !/Walk$/.test(actor.animation))) return;
      frames.push({
        animation: actor.animation,
        animationFrame: actor.animationFrame,
        capturedAt: performance.now(),
        position: actor.position,
        legs: ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"].flatMap(
          (name) =>
            [0, 4, 8].flatMap((column) => {
              const axis = actor.bones[name].slice(column, column + 3);
              const length = Math.hypot(...axis);
              return axis.map((value: number) => value / length);
            }),
        ),
      });
      if (frames.length > 80) frames.shift();
      if (frames.length === 2) {
        // A busy main thread must not skip the entire crossing between two
        // rendered poses. Keep real time, real frames and real skeletal motion.
        const resumeAt = performance.now() + 3500;
        while (performance.now() < resumeAt) {
          /* Simulate a rendering stall, as seen on the shared CI runner. */
        }
      }
    });
    const timer = setTimeout(() => observer.disconnect(), 60000);
    c.bridgeMotion = {
      frames,
      stop: () => {
        clearTimeout(timer);
        observer.disconnect();
      },
    };
    observer.observe(c, {
      attributes: true,
      attributeFilter: ["data-render-frame"],
    });
  });
  const answered = page.waitForResponse((r) =>
    r.url().endsWith(`/api/learning/${id}/answer`),
  );
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  const result: LearningProgress = await (await answered).json();
  expect(result.activity?.independent).toBe(true);
  expect(result.points).toBe(0);
  expect(result.worldAchievement?.evidence).toEqual({
    kind: "fraction-bridge",
    pieces: Array(targetUnits).fill(1),
  });
  await expect(canvas).toHaveAttribute(
    "data-learning-effect",
    `bridge:${result.levelProgress!.cleared / result.levelProgress!.total}`,
  );
  try {
    await expect
      .poll(() =>
        canvas.evaluate(
          (c: any) =>
            c.bridgeMotion.frames.filter((frame: any) =>
              /Walk$/.test(frame.animation),
            ).length,
        ),
      )
      .toBeGreaterThanOrEqual(2);
    // Walk starts during the take-off stance. Wait for the crossing before
    // inspecting its retained motion, rather than sampling two stationary frames.
    await expect
      .poll(
        () =>
          canvas.evaluate(
            (c: any) =>
              c.getAdventureSnapshot({ actorOnly: true }).actor.position[0],
          ),
        // Bounded visual time needs several actual frames after the forced stall.
        { timeout: 20000 },
      )
      .toBeCloseTo(-3.2 + targetUnits * 0.8, 1);
    const frames = await canvas.evaluate((c: any) => c.bridgeMotion.frames);
    const walking = frames.filter((frame: any) =>
      /Walk$/.test(frame.animation),
    );
    const first = walking[0],
      last = walking.at(-1)!;
    expect(last.position[0] - first.position[0]).toBeGreaterThan(0.03);
    // Compare both leg chains; a single shin may stay straight during stance.
    // Root translation alone cannot pass.
    expect(
      Math.max(
        ...walking.flatMap((frame: any) =>
          frame.legs.map((v: number, i: number) => Math.abs(v - first.legs[i])),
        ),
      ),
    ).toBeGreaterThan(0.01);
    // At 2.4 m/s, a bounded 250 ms frame can advance at most 0.6 m, including
    // the final step into celebration. A wall-clock teleport fails this check.
    expect(
      Math.max(
        ...frames
          .slice(1)
          .map((frame: any, i: number) =>
            Math.abs(frame.position[0] - frames[i].position[0]),
          ),
      ),
    ).toBeLessThanOrEqual(0.600001);
  } finally {
    const frames = await canvas.evaluate((c: any) => {
      c.bridgeMotion.stop();
      return c.bridgeMotion.frames;
    });
    const gaitPath = test.info().outputPath("bridge-gait.json");
    await writeFile(gaitPath, JSON.stringify({ targetUnits, frames }, null, 2));
    await test.info().attach("bridge-gait", {
      path: gaitPath,
      contentType: "application/json",
    });
  }
  await page.getByRole("button", { name: "Hide task", exact: true }).click();
  const frame = Number(await canvas.getAttribute("data-render-frame"));
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-frame")))
    .toBeGreaterThan(frame + 2);
  await page.screenshot({ path: "test-results/fraction-bridge-world.png" });
});
