import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { createAccount } from "./auth-helpers";
import { writeFile } from "node:fs/promises";
import type { CourseDraft, LearningProgress, Theme } from "../shared/course";

type RenderedHuman = {
  position: number[];
  rotation: number[];
  bones: Record<string, number[]>;
};
type VisibilityPoint = {
  screen: number[];
  inFrame: boolean;
  occluded: boolean;
  occluder: string | null;
};
type ProjectedBounds = { min: number[]; max: number[]; viewport: number[] };
type RenderedAdventure = {
  theme: Theme;
  status: string;
  distance: number;
  speed: number;
  taskPulse: number;
  projectedActor: ProjectedBounds;
  projectedOpponent: ProjectedBounds | null;
  actorVisibility: Record<string, VisibilityPoint>;
  opponentVisibility: Record<string, VisibilityPoint> | null;
  guardianVisibility: VisibilityPoint | null;
  obstacleVisibility: {
    id: string;
    kind: string;
    position: number[];
    cleared: boolean;
    visibility: VisibilityPoint;
  }[];
  gateVisibility: {
    index: number;
    enabled: boolean;
    position: number[];
    visibility: VisibilityPoint;
  }[];
  actor: RenderedHuman & { action?: string };
  opponent?: RenderedHuman;
  guardian?: {
    position: number[];
    legs: number[][];
    arms: number[][];
    [key: string]: unknown;
  };
  obstacles: {
    id: string;
    kind: string;
    position: number[];
    colliders: { min: number[]; max: number[] }[];
  }[];
  collision: { id: string; kind: string } | null;
  events: { type: string; id?: string }[];
  [key: string]: unknown;
};
type RenderedAudio = {
  enabled: boolean;
  muted: boolean;
  contextState: string;
  masterGain: number;
  rms: number;
  theme: string;
};

async function audioSnapshot(page: Page): Promise<RenderedAudio | null> {
  return page.evaluate(() => {
    const observed = window as Window & {
      getAmamiheAudioSnapshot?: () => unknown;
    };
    return observed.getAmamiheAudioSnapshot?.() ?? null;
  }) as Promise<RenderedAudio | null>;
}

async function openAudioControls(page: Page) {
  const controls = page.locator(".audio-controls");
  if ((await controls.getAttribute("open")) === null) {
    await controls.locator("summary").click({ timeout: 10000 });
  }
}

async function peakAudioRms(page: Page, durationMs = 2000) {
  return page.evaluate(async (duration) => {
    const observed = window as Window & {
      getAmamiheAudioSnapshot?: () => { rms: number };
    };
    let peak = 0;
    const end = performance.now() + duration;
    while (performance.now() < end) {
      peak = Math.max(peak, observed.getAmamiheAudioSnapshot?.().rms ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return peak;
  }, durationMs);
}

async function snapshot(page: Page): Promise<RenderedAdventure | null> {
  return page.locator("canvas[data-course-theme]").evaluate((canvas) => {
    // This getter reads the rendered Babylon nodes and bone matrices. It does
    // not move actors, advance clocks, or fabricate an animation counter.
    const rendered = canvas as HTMLCanvasElement & {
      getAdventureSnapshot?: () => unknown;
    };
    return rendered.getAdventureSnapshot?.() ?? null;
  }) as Promise<RenderedAdventure | null>;
}

function limbPose(human: RenderedHuman): number[] {
  function axes(name: string) {
    const matrix = human.bones[name];
    expect(matrix, `${name} must be an actual rig transform`).toHaveLength(16);
    return [0, 4, 8].map((column) => {
      const length = Math.hypot(
        matrix[column],
        matrix[column + 1],
        matrix[column + 2],
      );
      expect(length).toBeGreaterThan(0.00000001);
      return [0, 1, 2].map((offset) => {
        expect(Number.isFinite(matrix[column + offset])).toBe(true);
        return matrix[column + offset] / length;
      });
    });
  }
  const hips = axes("Hips");
  const orientations: number[] = [];
  for (const name of [
    "LeftArm",
    "RightArm",
    "LeftLeg",
    "RightLeg",
    "RightHand",
  ]) {
    // Normalize centimetre-to-metre scale, exclude translation, and express
    // each limb axis in the actual Hips basis. A static rig transported or
    // turned toward a workstation cannot pass as skeletal articulation.
    for (const axis of axes(name))
      for (const hipAxis of hips)
        orientations.push(
          axis.reduce((dot, value, index) => dot + value * hipAxis[index], 0),
        );
  }
  return orientations;
}

function difference(a: number[], b: number[]) {
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])));
}

function readableActors(rendered: RenderedAdventure) {
  const bounds = rendered.projectedActor;
  const mobile = bounds.viewport[0] < 600;
  expect(
    bounds.max[1] - bounds.min[1],
    "avatar must occupy a readable part of the live canvas",
  ).toBeGreaterThan(mobile ? 60 : 100);
  for (const name of ["Head", "Spine2"]) {
    const point = rendered.actorVisibility[name];
    expect(
      point?.inFrame,
      `${name} must be inside the actual camera viewport`,
    ).toBe(true);
    expect(point?.occluded, `${name} is hidden by ${point?.occluder}`).toBe(
      false,
    );
  }
  if (rendered.theme === "temple-chase") {
    expect(
      rendered.guardianVisibility?.inFrame,
      "the pursuing monster must be in view",
    ).toBe(true);
    expect(
      rendered.guardianVisibility?.occluded,
      "world geometry must not hide the monster",
    ).toBe(false);
  }
  if (rendered.theme === "wrestling") {
    for (const name of ["Head", "Spine2", "Hips"]) {
      const point = rendered.opponentVisibility?.[name];
      expect(
        point?.inFrame,
        `opponent ${name} must be visible in the ring`,
      ).toBe(true);
      expect(
        point?.occluded,
        `opponent ${name} is hidden by ${point?.occluder}`,
      ).toBe(false);
    }
  }
}

async function coloredAvatarFrame(page: Page, path: string) {
  // Response animations are verified separately. Sample the real compositor
  // after the task burst settles so native rig anchors and PNG share a pose.
  await expect
    .poll(async () => (await snapshot(page))!.taskPulse, {
      timeout: 5000,
      intervals: [100, 150],
    })
    .toBeLessThan(0.001);
  await page.waitForTimeout(200);
  const rendered = (await snapshot(page))!;
  const canvas = await page.locator("canvas[data-course-theme]").boundingBox();
  expect(canvas).not.toBeNull();
  const frame = await page.screenshot({ path });
  const screen = rendered.actorVisibility.Spine2.screen;
  const colors = await page.evaluate(
    async ({ png, x, y, feet, jacketOffset, opponent }) => {
      const bytes = Uint8Array.from(atob(png), (character) =>
        character.charCodeAt(0),
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const image = new OffscreenCanvas(bitmap.width, bitmap.height);
      const pixels = image.getContext("2d")!;
      pixels.drawImage(bitmap, 0, 0);
      let teal = 0,
        garmentPixels = 0;
      // The open jacket has a white undershirt down its centre. Target its
      // bilateral garment panels rather than counting white cotton as wrong.
      for (const side of [-1, 1]) {
        const data = pixels.getImageData(
          Math.round(x + side * jacketOffset) - 6,
          Math.round(y + 4) - 8,
          13,
          17,
        ).data;
        for (let index = 0; index < data.length; index += 4) {
          const channels = [data[index], data[index + 1], data[index + 2]];
          if (
            channels[1] > 25 &&
            channels[2] > 25 &&
            channels[1] > channels[0] * 1.2 &&
            channels[2] > channels[0] * 1.05
          )
            teal++;
          garmentPixels++;
        }
      }
      let neutral = 0;
      for (const foot of feet) {
        // A foot bone marks the ankle rather than the shoe's pixel centre.
        // Cover the bounded footwear area and the one-frame animation drift;
        // retain the same neutral-color criterion and require >40 real pixels.
        const patch = pixels.getImageData(
          Math.round(foot[0]) - 18,
          Math.round(foot[1]) - 30,
          37,
          61,
        ).data;
        for (let index = 0; index < patch.length; index += 4) {
          const channels = [patch[index], patch[index + 1], patch[index + 2]];
          if (
            Math.max(...channels) > 100 &&
            Math.max(...channels) - Math.min(...channels) < 55
          )
            neutral++;
        }
      }
      let blue = 0;
      if (opponent) {
        // The opponent wears a fixed blue outfit. Reading its own real skin
        // projection ensures a foreground player cannot hide the second body
        // while its offscreen bone animation continues to satisfy assertions.
        for (const side of [-1, 1]) {
          const data = pixels.getImageData(
            Math.round(opponent.x + side * opponent.offset) - 6,
            Math.round(opponent.y + 4) - 8,
            13,
            17,
          ).data;
          for (let index = 0; index < data.length; index += 4) {
            const [red, green, blueChannel] = data.slice(index, index + 3);
            if (
              blueChannel > 30 &&
              blueChannel > green * 1.1 &&
              blueChannel > red * 1.2
            )
              blue++;
          }
        }
      }
      bitmap.close();
      return {
        teal: teal / garmentPixels,
        neutralFootPixels: neutral,
        opponentBlue: opponent ? blue / (13 * 17 * 2) : null,
      };
    },
    {
      png: frame.toString("base64"),
      x: canvas!.x + screen[0],
      y: canvas!.y + screen[1],
      jacketOffset: Math.max(
        8,
        Math.min(
          16,
          (rendered.projectedActor.max[0] - rendered.projectedActor.min[0]) *
            0.16,
        ),
      ),
      feet: ["LeftFoot", "RightFoot"].map((name) => [
        canvas!.x + rendered.actorVisibility[name].screen[0],
        canvas!.y + rendered.actorVisibility[name].screen[1],
      ]),
      opponent:
        rendered.theme === "wrestling" &&
        rendered.opponentVisibility &&
        rendered.projectedOpponent
          ? {
              x: canvas!.x + rendered.opponentVisibility.Spine2.screen[0],
              y: canvas!.y + rendered.opponentVisibility.Spine2.screen[1],
              offset: Math.max(
                8,
                Math.min(
                  16,
                  (rendered.projectedOpponent.max[0] -
                    rendered.projectedOpponent.min[0]) *
                    0.16,
                ),
              ),
            }
          : null,
    },
  );
  await writeFile(
    path.replace(/\.png$/, ".json"),
    JSON.stringify(
      {
        colors,
        torso: rendered.actorVisibility.Spine2.screen,
        feet: [
          rendered.actorVisibility.LeftFoot.screen,
          rendered.actorVisibility.RightFoot.screen,
        ],
        viewport: rendered.projectedActor.viewport,
        projectedActor: rendered.projectedActor,
        actorVisibility: rendered.actorVisibility,
        canvas,
        opponentVisibility: rendered.opponentVisibility,
        projectedOpponent: rendered.projectedOpponent,
        obstacleVisibility: rendered.obstacleVisibility,
        gateVisibility: rendered.gateVisibility,
      },
      null,
      2,
    ),
  );
  expect
    .soft(
      colors.teal,
      "the screenshot must show the registered teal outfit at the actual torso, not black or incorrectly tinted material",
    )
    .toBeGreaterThan(0.2);
  expect
    .soft(
      colors.neutralFootPixels,
      "the screenshot must show neutral light shoes, not the pink material binding regression",
    )
    .toBeGreaterThan(40);
  if (rendered.theme === "wrestling") {
    expect
      .soft(
        colors.opponentBlue,
        "the screenshot must visibly show the blue opponent torso alongside the player",
      )
      .toBeGreaterThan(0.2);
  }
}

async function visibleWorldFrame(page: Page, path: string) {
  const canvas = await page.locator("canvas[data-course-theme]").boundingBox();
  expect(canvas).not.toBeNull();
  const frame = await page.screenshot({ path, fullPage: true });
  const visible = await page.evaluate(
    async ({ png, x, y, width, height }) => {
      const bytes = Uint8Array.from(atob(png), (character) =>
        character.charCodeAt(0),
      );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
      );
      const image = new OffscreenCanvas(bitmap.width, bitmap.height);
      const pixels = image.getContext("2d")!;
      pixels.drawImage(bitmap, 0, 0);
      const data = pixels.getImageData(x, y, width, height).data;
      let world = 0;
      for (let index = 0; index < data.length; index += 4) {
        const channels = [data[index], data[index + 1], data[index + 2]];
        if (
          Math.max(...channels) > 70 &&
          Math.max(...channels) - Math.min(...channels) > 10
        )
          world++;
      }
      bitmap.close();
      return world / (data.length / 4);
    },
    {
      png: frame.toString("base64"),
      // Avoid text/HUD and the movement pad: a blank WebGL surface cannot pass
      // because React continues to draw its status labels over the empty scene.
      x: Math.round(canvas!.x + canvas!.width * 0.25),
      y: Math.round(canvas!.y + canvas!.height * 0.45),
      width: Math.round(canvas!.width * 0.35),
      height: Math.round(canvas!.height * 0.25),
    },
  );
  expect(
    visible,
    "the phone compositor must show the 3D world, not only a HUD over a blank canvas",
  ).toBeGreaterThan(0.3);
}

async function animatedPose(page: Page, initial: RenderedHuman) {
  const before = limbPose(initial);
  await expect
    .poll(
      async () => {
        const current = await snapshot(page);
        return current ? difference(before, limbPose(current.actor)) : 0;
      },
      { timeout: 10000, intervals: [150, 250, 350] },
    )
    .toBeGreaterThan(0.1);
}

async function publishThemes(request: APIRequestContext, themes: Theme[]) {
  const created = await request.post("/api/studio/courses", {
    data: { template: "storytelling" },
  });
  expect(created.ok()).toBe(true);
  const draft: CourseDraft = await created.json();
  draft.definition.title = `Motion encounters ${draft.id.slice(0, 8)}`;
  draft.definition.levels = draft.definition.levels.slice(0, themes.length);
  draft.definition.concepts = draft.definition.concepts.slice(0, themes.length);
  draft.definition.levels.forEach((level, index) => {
    level.theme = themes[index];
    level.timeLimitSeconds = 15;
  });
  const saved = await request.put(`/api/studio/courses/${draft.id}`, {
    data: { revision: draft.revision, definition: draft.definition },
  });
  expect(saved.ok()).toBe(true);
  const publication = await request.post(
    `/api/studio/courses/${draft.id}/publish`,
    {
      data: { revision: (await saved.json()).revision },
    },
  );
  expect(publication.ok()).toBe(true);
  return draft;
}

async function enter(page: Page, draft: CourseDraft) {
  await page.goto("/");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Visit course house: ${draft.definition.title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Enroll & enter adventure", exact: true })
    .click();
  await openAdventurePanels(page);
  await expect
    .poll(async () => Boolean((await snapshot(page))?.actor?.bones), {
      timeout: 30000,
    })
    .toBe(true);
}

async function answer(
  page: Page,
  draft: CourseDraft,
  level: number,
  question: number,
) {
  const task = draft.definition.levels[level].questions[question];
  await page
    .getByRole("button", { name: task.options[task.answer], exact: false })
    .click();
  const answered = page.waitForResponse((response) =>
    response.url().endsWith(`/api/learning/${draft.id}/answer`),
  );
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  const response = await answered;
  expect(response.ok()).toBe(true);
  const result = (await response.json()) as LearningProgress;
  const questionId = response.request().postDataJSON().questionId as string;
  // The HTTP response can arrive before React commits its feedback and the
  // next 3D frame. A previous task's strike pulse must not satisfy this wait.
  await expect
    .poll(
      async () =>
        (await snapshot(page))?.events.some(
          (event) =>
            event.type === "task-correct" &&
            event.id?.startsWith(`${questionId}:`),
        ),
      { timeout: 3000, intervals: [50, 100] },
    )
    .toBe(true);
  return result;
}

test("all adventure themes animate real limb poses and task-driven scene encounters", async ({
  page,
  context,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await createAccount(context.request, "Motion Explorer");
  const themes: Theme[] = ["temple-chase", "racing", "wrestling", "workshop"];
  const draft = await publishThemes(context.request, themes);
  await enter(page, draft);
  await openAudioControls(page);
  await page
    .getByRole("button", { name: "Enable game audio", exact: true })
    .click();
  await expect
    .poll(async () => (await audioSnapshot(page))?.contextState)
    .toBe("running");
  await page.getByLabel("Music volume", { exact: true }).press("Home");
  await page.getByLabel("Sound effects volume", { exact: true }).press("End");
  await page.locator(".audio-controls summary").click();

  for (let index = 0; index < themes.length; index++) {
    const canvas = page.locator("canvas[data-course-theme]");
    await expect(canvas).toHaveAttribute("data-course-theme", themes[index]);
    await expect
      .poll(async () => Boolean((await snapshot(page))?.actor?.bones), {
        timeout: 30000,
      })
      .toBe(true);
    await page
      .getByLabel("Adventure graphics", { exact: true })
      .selectOption("360");
    await page.getByLabel("Section timing", { exact: true }).selectOption("0");
    await page
      .getByRole("button", { name: "Start section", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(page))?.status)
      .toBe("active");
    const before = (await snapshot(page))!;
    readableActors(before);
    if (themes[index] === "wrestling") {
      await canvas.focus();
      await page.keyboard.press("f");
    }
    await animatedPose(page, before.actor);
    await expect
      .poll(async () => (await audioSnapshot(page))?.theme)
      .toBe(themes[index]);
    if (index === 0) {
      expect(await peakAudioRms(page)).toBeGreaterThan(0.0001);
    } else {
      await expect
        .poll(async () => (await audioSnapshot(page))?.rms ?? 0)
        .toBeGreaterThan(0.0001);
    }
    if (themes[index] !== "wrestling") {
      await expect
        .poll(async () => (await snapshot(page))!.actor.position[2], {
          timeout: 10000,
        })
        .toBeGreaterThan(before.actor.position[2] + 0.25);
    }
    if (themes[index] === "temple-chase") {
      for (const gate of before.gateVisibility) {
        expect(gate.enabled).toBe(true);
        expect(
          gate.visibility.inFrame,
          `answer gate ${gate.index} must be ahead in view`,
        ).toBe(true);
        expect(
          gate.visibility.occluded,
          `answer gate ${gate.index} is hidden by ${gate.visibility.occluder}`,
        ).toBe(false);
      }
      expect(before.guardian?.position).toHaveLength(3);
      const hurdle = before.obstacles.find(
        (obstacle) => obstacle.kind === "hurdle",
      );
      expect(hurdle?.colliders.length).toBeGreaterThan(0);
      for (const collider of hurdle!.colliders) {
        for (const axis of [0, 1, 2]) {
          expect(collider.max[axis]).toBeGreaterThan(collider.min[axis]);
        }
      }
      await expect
        .poll(async () => (await snapshot(page))!.guardian!.position[2])
        .toBeGreaterThan(before.guardian!.position[2] + 0.1);
      await expect
        .poll(async () =>
          difference(
            before.guardian!.legs.flat(),
            (await snapshot(page))!.guardian!.legs.flat(),
          ),
        )
        .toBeGreaterThan(0.015);
      // Drive far enough to encounter an actual collider; a pre-obstacle
      // running loop is insufficient evidence of an adventure mechanic.
      await expect
        .poll(async () => (await snapshot(page))!.actor.position[2], {
          timeout: 15000,
          intervals: [100, 150],
        })
        .toBeGreaterThan(28);
      await expect
        .poll(async () => (await snapshot(page))!.actor.position[1], {
          timeout: 5000,
          intervals: [100, 150],
        })
        .toBeGreaterThan(0.7);
      await expect
        .poll(async () => (await snapshot(page))!.actor.position[2], {
          timeout: 5000,
          intervals: [100, 150],
        })
        .toBeGreaterThan(37);
      expect((await snapshot(page))!.status).toBe("active");
      readableActors((await snapshot(page))!);
    }
    if (themes[index] === "temple-chase") {
      await canvas.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(async () => (await snapshot(page))!.actor.position[0])
        .toBeGreaterThan(0.3);
      await page.keyboard.press("ArrowLeft");
      await expect
        .poll(async () => Math.abs((await snapshot(page))!.actor.position[0]))
        .toBeLessThan(0.1);
      expect(await peakAudioRms(page)).toBeGreaterThan(0.0001);
    }
    if (themes[index] === "racing" || themes[index] === "wrestling") {
      expect(before.opponent?.bones.RightArm).toHaveLength(16);
    }

    await page
      .getByRole("button", { name: "Pause section", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(page))?.status)
      .toBe("paused");
    const paused = (await snapshot(page))!;
    await page.waitForTimeout(500);
    const afterPause = (await snapshot(page))!;
    expect(
      difference(paused.actor.position, afterPause.actor.position),
    ).toBeLessThan(0.01);
    expect(
      difference(limbPose(paused.actor), limbPose(afterPause.actor)),
    ).toBeLessThan(0.01);
    if (paused.guardian && afterPause.guardian) {
      expect(
        difference(paused.guardian.position, afterPause.guardian.position),
      ).toBeLessThan(0.01);
    }
    if (paused.opponent && afterPause.opponent) {
      expect(
        difference(paused.opponent.position, afterPause.opponent.position),
      ).toBeLessThan(0.01);
    }
    if (index === 0) {
      // With music muted through its real native range control, movement
      // produces footsteps; pausing drains the effect voices to silence.
      expect(await peakAudioRms(page)).toBeLessThan(0.0001);
      await openAudioControls(page);
      await page.getByLabel("Music volume", { exact: true }).press("End");
      await page.locator(".audio-controls summary").click();
    }
    await page
      .getByRole("button", { name: "Resume section", exact: true })
      .click();

    const beforeTask = (await snapshot(page))!;
    const first = await answer(page, draft, index, 0);
    expect(first.levelProgress?.cleared).toBe(1);
    expect(first.completedLevelIds).toHaveLength(index);
    expect(first.game?.adventure?.lastTaskCorrect).toBe(true);
    if (themes[index] === "wrestling") {
      expect(first.game?.adventure?.strikes).toBe(1);
      expect(first.game?.adventure?.opponentHealth).toBe(50);
    }
    await expect
      .poll(async () => (await snapshot(page))!.taskPulse, {
        timeout: 3000,
        intervals: [100, 150],
      })
      .toBeGreaterThan(0.08);
    const responseScene = (await snapshot(page))!;
    readableActors(responseScene);
    expect(
      responseScene.events.some((event) => event.type === "task-correct"),
    ).toBe(true);
    await animatedPose(page, beforeTask.actor);
    if (themes[index] === "wrestling") {
      await expect
        .poll(async () => (await snapshot(page))!.opponent!.position[2], {
          timeout: 3000,
          intervals: [100, 150],
        })
        .toBeGreaterThan(beforeTask.opponent!.position[2] + 0.1);
    }
    if (themes[index] === "racing") {
      expect(responseScene.speed).toBeGreaterThan(beforeTask.speed + 0.5);
    }
    await coloredAvatarFrame(
      page,
      `test-results/adventure-motion-${themes[index]}.png`,
    );
    if (themes[index] === "workshop") {
      await page
        .getByRole("checkbox", { name: "Reduced motion", exact: true })
        .check();
    }
    await page
      .getByRole("button", { name: "Start section", exact: true })
      .click();
    const second = await answer(page, draft, index, 1);
    expect(second.completedLevelIds).toHaveLength(index + 1);
    await expect
      .poll(async () => (await snapshot(page))?.theme)
      .toBe(themes[index]);
    if (index < themes.length - 1) {
      await page
        .getByRole("button", { name: "Continue adventure", exact: true })
        .click();
      await openAdventurePanels(page);
    }
  }
  await expect(
    page.getByRole("heading", {
      name: "Course checkpoints complete",
      exact: true,
    }),
  ).toBeVisible();
  await openAudioControls(page);
  await page
    .getByRole("button", { name: "Mute game audio", exact: true })
    .click();
  await expect
    .poll(async () => Math.abs((await audioSnapshot(page))?.masterGain ?? 1))
    .toBeLessThan(0.0001);
  await expect
    .poll(async () => (await audioSnapshot(page))?.rms ?? 1)
    .toBeLessThan(0.0001);
  await page.reload();
  await openAudioControls(page);
  await expect(
    page.getByRole("button", { name: "Unmute game audio", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("amamihe-audio-v1")!).muted,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("manual actions queued before pause cannot leak into the resumed run", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Queued Motion Explorer");
  const draft = await publishThemes(context.request, ["temple-chase"]);
  await enter(page, draft);
  await page.getByLabel("Section timing", { exact: true }).selectOption("0");
  await page
    .getByRole("button", { name: "Start section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");

  const actionPath = `/api/learning/${draft.id}/action`;
  const actionRoute = `**${actionPath}`;
  const commands: { action: string; sequence: number }[] = [];
  let releaseFirst!: () => void;
  let firstReceived!: () => void;
  const held = new Promise<void>((resolve) => (releaseFirst = resolve));
  const received = new Promise<void>((resolve) => (firstReceived = resolve));
  await page.route(actionRoute, async (route) => {
    const body = route.request().postDataJSON();
    commands.push({ action: body.action, sequence: body.sequence });
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    if (commands.length === 1) {
      const accepted: LearningProgress = await response.json();
      expect(accepted.game!.actionSequence).toBe(1);
      expect(accepted.game!.adventure!.targetLane).toBe(1);
      firstReceived();
      await held;
    }
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Move right", exact: true }).click();
    await received;
    // This input is waiting behind the first response; it has not reached the
    // server when the learner pauses and resumes this same run.
    await page.getByRole("button", { name: "Move left", exact: true }).click();
    await page
      .getByRole("button", { name: "Pause section", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(page))?.status)
      .toBe("paused");
    await page
      .getByRole("button", { name: "Resume section", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(page))?.status)
      .toBe("active");

    releaseFirst();
    // A distinct fresh action gives a positive response to await after the
    // queue drains, without relying on a timeout to prove the old input vanished.
    const freshResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(actionPath) &&
        response.request().postDataJSON()?.action === "jump",
    );
    await page.getByRole("button", { name: "Jump", exact: true }).click();
    const response = await freshResponse;
    expect(response.ok()).toBe(true);
    const fresh: LearningProgress = await response.json();
    expect(fresh.game!.actionSequence).toBe(2);
    expect(fresh.game!.adventure!.targetLane).toBe(1);
    expect(commands).toEqual([
      { action: "right", sequence: 1 },
      { action: "jump", sequence: 2 },
    ]);
    const saved: LearningProgress = await (
      await context.request.get(`/api/learning/${draft.id}`)
    ).json();
    expect(saved.game!.status).toBe("active");
    expect(saved.game!.actionSequence).toBe(2);
    expect(saved.game!.adventure!.targetLane).toBe(1);
  } finally {
    releaseFirst();
    await page.unroute(actionRoute);
  }
});

test("phone manual controls cause actual jump, obstacle Game Over and a checkpoint-preserving retry", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(context.request, "Phone Motion Explorer");
  const draft = await publishThemes(context.request, [
    "workshop",
    "temple-chase",
  ]);
  await enter(page, draft);
  for (let question = 0; question < 2; question++) {
    await page.getByLabel("Section timing", { exact: true }).selectOption("0");
    await page
      .getByRole("button", { name: "Start section", exact: true })
      .click();
    await answer(page, draft, 0, question);
  }
  await page
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  await openAdventurePanels(page);
  await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
    "data-course-theme",
    "temple-chase",
  );
  await expect
    .poll(async () => Boolean((await snapshot(page))?.actor?.bones), {
      timeout: 30000,
    })
    .toBe(true);
  await page.getByLabel("Section timing", { exact: true }).selectOption("1");
  await page.getByLabel("Manual obstacle controls", { exact: true }).check();
  const prior: LearningProgress = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  expect(prior.completedLevelIds).toHaveLength(1);
  await page
    .getByRole("button", { name: "Start section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("paused");
  readableActors((await snapshot(page))!);
  await coloredAvatarFrame(
    page,
    "test-results/adventure-phone-avatar-readable.png",
  );
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");
  const initial = (await snapshot(page))!;
  readableActors(initial);
  await page.getByRole("button", { name: "Jump", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page))!.actor.position[1], {
      timeout: 5000,
      intervals: [100, 150],
    })
    .toBeGreaterThan(initial.actor.position[1] + 0.15);
  await animatedPose(page, initial.actor);
  readableActors((await snapshot(page))!);
  await visibleWorldFrame(page, "test-results/adventure-phone-jump.png");
  await expect
    .poll(async () => (await snapshot(page))!.actor.action, {
      timeout: 3000,
      intervals: [100, 150],
    })
    .toBe("run");
  const standing = (await snapshot(page))!;
  await page.getByRole("button", { name: "Slide", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page))!.actor.action, {
      timeout: 2000,
      intervals: [100, 150],
    })
    .toBe("slide");
  await animatedPose(page, standing.actor);
  await page.waitForTimeout(400);
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("paused");
  const sliding = (await snapshot(page))!;
  expect(sliding.actor.action).toBe("slide");
  expect(
    sliding.actor.bones.Hips[13],
    "the actual Slide rig must lower its pelvis into a crouch",
  ).toBeLessThan(standing.actor.bones.Hips[13] - 0.3);
  expect(
    sliding.actor.bones.LeftFoot[13],
    "the Slide clip must keep the actual foot above the path rather than lower the body twice through the floor",
  ).toBeGreaterThanOrEqual(-0.1);
  await writeFile(
    "test-results/adventure-phone-slide.json",
    JSON.stringify(sliding, null, 2),
  );
  await visibleWorldFrame(page, "test-results/adventure-phone-slide.png");
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");
  await expect(
    page.getByRole("heading", { name: "Game Over", exact: true }),
  ).toBeVisible({ timeout: 25000 });
  // The React notice can precede the capped 3D frame that applies the collision.
  await expect
    .poll(async () => (await snapshot(page))?.status)
    .toBe("game-over");
  const caught = (await snapshot(page))!;
  expect(caught.status).toBe("game-over");
  expect(caught.actor.position[2]).toBeGreaterThan(initial.actor.position[2]);
  const failed: LearningProgress = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  expect(failed.completedLevelIds).toEqual(prior.completedLevelIds);
  expect(failed.points).toBe(prior.points);
  expect(failed.levelId).toBe(prior.levelId);
  expect(failed.game?.adventure?.collision?.kind).toBe("hurdle");
  expect(caught.collision?.id).toBe(failed.game?.adventure?.collision?.id);
  const collidedMesh = caught.obstacles.find(
    (obstacle) => obstacle.id === caught.collision!.id,
  );
  expect(collidedMesh?.kind).toBe("hurdle");
  expect(
    collidedMesh!.colliders.some(
      (collider) =>
        collider.min[2] < caught.actor.position[2] + 0.85 &&
        collider.max[2] > caught.actor.position[2] - 0.85,
    ),
  ).toBe(true);
  await visibleWorldFrame(page, "test-results/adventure-phone-collision.png");
  await page
    .getByRole("button", { name: "Retry this step", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");
  const restarted: LearningProgress = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  expect(restarted.game!.run).toBeGreaterThan(failed.game!.run);
  expect(restarted.completedLevelIds).toEqual(prior.completedLevelIds);
  expect(restarted.points).toBe(prior.points);
  // A retry gets a new delivery ID to prevent a prior run's answer replay;
  // it retains the authored task and previously earned learning evidence.
  expect(restarted.question!.id).not.toBe(failed.question!.id);
  expect(restarted.question!.prompt).toBe(failed.question!.prompt);
  expect(restarted.questionIndex).toBe(failed.questionIndex);
  expect((await snapshot(page))!.actor.position[2]).toBeLessThan(
    caught.actor.position[2],
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  let releaseAction!: () => void;
  let actionReceived!: () => void;
  const held = new Promise<void>((resolve) => (releaseAction = resolve));
  const received = new Promise<void>((resolve) => (actionReceived = resolve));
  let oldAction: LearningProgress | undefined;
  await page.route(`**/api/learning/${draft.id}/action`, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    oldAction = await response.json();
    actionReceived();
    await held;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Move right", exact: true }).click();
  await received;
  expect(oldAction!.game!.status).toBe("active");
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("paused");
  const paused = (await snapshot(page))!;
  const lateResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/learning/${draft.id}/action`),
  );
  releaseAction();
  await lateResponse;
  await page.waitForTimeout(2200);
  const stillPaused = (await snapshot(page))!;
  expect(stillPaused.status).toBe("paused");
  expect(
    difference(paused.actor.position, stillPaused.actor.position),
  ).toBeLessThan(0.01);
  expect(
    difference(limbPose(paused.actor), limbPose(stillPaused.actor)),
  ).toBeLessThan(0.01);
  const savedPause: LearningProgress = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  expect(savedPause.game!.status).toBe("paused");
  await page.unroute(`**/api/learning/${draft.id}/action`);
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");
  // The previous delayed command moved toward the right lane. Return to the
  // centre so this success must come from a real timed jump over the hurdle.
  await page.getByRole("button", { name: "Move left", exact: true }).click();
  await expect
    .poll(async () => Math.abs((await snapshot(page))!.actor.position[0]))
    .toBeLessThan(0.1);
  await expect
    .poll(async () => (await snapshot(page))!.distance, {
      timeout: 15000,
      intervals: [50, 100],
    })
    .toBeGreaterThan(29);
  const approach = (await snapshot(page))!;
  const upcoming = approach.obstacleVisibility.find(
    (hazard) => hazard.kind === "hurdle" && !hazard.cleared,
  );
  expect(upcoming).toBeDefined();
  expect(
    upcoming!.visibility.inFrame,
    "the manual player must see the upcoming hurdle before contact",
  ).toBe(true);
  expect(
    upcoming!.visibility.occluded,
    `the hurdle is hidden by ${upcoming!.visibility.occluder}`,
  ).toBe(false);
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("paused");
  await visibleWorldFrame(
    page,
    "test-results/adventure-phone-hurdle-approach.png",
  );
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("active");
  let commanded!: RenderedAdventure;
  await expect
    .poll(
      async () => {
        commanded = (await snapshot(page))!;
        return commanded.distance;
      },
      {
        timeout: 5000,
        intervals: [50, 75],
      },
    )
    // This launch distance leaves enough room for a real touch/request delay
    // while keeping the 1.4-second jump over both collider contact boundaries.
    .toBeGreaterThan(31.8);
  const jumpResponse = page.waitForResponse(
    (response) => response.url().endsWith(`/api/learning/${draft.id}/action`),
    { timeout: 10000 },
  );
  const commandAt = Date.now();
  await writeFile(
    "test-results/adventure-phone-manual-jump-before.json",
    JSON.stringify(commanded, null, 2),
  );
  await page
    .getByRole("button", { name: "Jump", exact: true })
    .click({ timeout: 10000 });
  const receivedJump = await jumpResponse;
  expect(receivedJump.ok()).toBe(true);
  const jumped: LearningProgress = await receivedJump.json();
  await writeFile(
    "test-results/adventure-phone-manual-jump.json",
    JSON.stringify(
      {
        before: commanded,
        response: jumped.game,
        commandLatencyMs: Date.now() - commandAt,
        after: await snapshot(page),
      },
      null,
      2,
    ),
  );
  await expect
    .poll(async () => (await snapshot(page))!.actor.position[1], {
      timeout: 2500,
      intervals: [50, 75],
    })
    .toBeGreaterThan(0.7);
  await expect
    .poll(async () => (await snapshot(page))!.distance, {
      timeout: 3500,
      intervals: [50, 75],
    })
    .toBeGreaterThan(37);
  const clearedHurdle = (await snapshot(page))!;
  expect(clearedHurdle.status).toBe("active");
  expect(clearedHurdle.collision).toBeNull();
  expect(
    clearedHurdle.obstacleVisibility.find(
      (hazard) => hazard.id === upcoming!.id,
    )?.cleared,
  ).toBe(true);
  await visibleWorldFrame(
    page,
    "test-results/adventure-phone-hurdle-cleared.png",
  );
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("paused");
  const readableHurdle = (await snapshot(page))!;
  readableActors(readableHurdle);
  for (const name of ["LeftFoot", "RightFoot"]) {
    const point = readableHurdle.actorVisibility[name];
    expect(point.inFrame, `${name} must remain in the phone viewport`).toBe(
      true,
    );
    expect(
      point.occluded,
      `${name} is hidden by ${point.occluder} after clearing the hurdle`,
    ).toBe(false);
  }
  await coloredAvatarFrame(
    page,
    "test-results/adventure-phone-hurdle-readable.png",
  );
  const successful: LearningProgress = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  expect(successful.game!.status).toBe("paused");
  expect(successful.game!.adventure!.collision).toBeNull();
  expect(successful.completedLevelIds).toEqual(prior.completedLevelIds);
  expect(successful.points).toBe(prior.points);
  await page
    .getByRole("button", { name: "Resume section", exact: true })
    .click();
  await page.getByRole("button", { name: "Move right", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page))!.actor.position[0])
    .toBeGreaterThan(1.5);
  await page
    .getByRole("button", { name: "Pause section", exact: true })
    .click();
  await expect.poll(async () => (await snapshot(page))?.status).toBe("paused");
  const rightLane = (await snapshot(page))!;
  readableActors(rightLane);
  for (const name of ["Hips", "LeftFoot", "RightFoot"]) {
    const point = rightLane.actorVisibility[name];
    expect(point.inFrame, `${name} must remain visible in the right lane`).toBe(
      true,
    );
    expect(
      point.occluded,
      `${name} is hidden by ${point.occluder} in the right lane`,
    ).toBe(false);
  }
  await coloredAvatarFrame(page, "test-results/adventure-phone-right-lane.png");
  expect(errors).toEqual([]);
});
