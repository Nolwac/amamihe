import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
test("two browsers share real 3D avatars, course rooms and a consented team battle without granting mastery", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const other = await browser.newContext({
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 900 },
  });
  const beta = await other.newPage();
  beta.on("pageerror", (e) => errors.push(e.message));
  try {
    await createAccount(context.request, "Social Alpha");
    await createAccount(other.request, "Social Beta");
    const draft: CourseDraft = await (
      await context.request.post("/api/studio/courses", {
        data: { template: "storytelling" },
      })
    ).json();
    draft.definition.title = "Social course " + draft.id;
    draft.definition.levels = draft.definition.levels.slice(0, 1);
    draft.definition.levels[0].theme = "temple-chase";
    draft.definition.concepts = draft.definition.concepts.slice(0, 1);
    const saved = await context.request.put("/api/studio/courses/" + draft.id, {
      data: { revision: draft.revision, definition: draft.definition },
    });
    expect(saved.ok()).toBe(true);
    expect(
      (
        await context.request.post(
          "/api/studio/courses/" + draft.id + "/publish",
          { data: { revision: (await saved.json()).revision } },
        )
      ).ok(),
    ).toBe(true);
    for (const r of [context.request, other.request])
      expect(
        (
          await r.post("/api/courses/" + draft.id + "/enroll", {
            data: { version: 1 },
          })
        ).ok(),
      ).toBe(true);
    await page.goto("/");
    await beta.goto("/");
    for (const p of [page, beta]) {
      await openCityMenu(p);
      await p
        .getByRole("button", { name: "Course houses", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Join shared room", exact: true })
        .click();
    }
    const alphaPanel = page.getByRole("region", {
        name: "Teams and shared world",
      }),
      betaPanel = beta.getByRole("region", { name: "Teams and shared world" });
    await expect(
      alphaPanel.locator("article").filter({ hasText: "Social Beta" }),
    ).toBeVisible();
    await betaPanel.getByLabel("Preset message").selectOption("Ready to learn");
    await expect(
      alphaPanel.locator("article").filter({ hasText: "Social Beta" }),
    ).toContainText("Ready to learn", { timeout: 15000 });
    for (const p of [page, beta])
      await p
        .getByRole("button", { name: "Return to city", exact: true })
        .click();
    await expect(page.locator("canvas[data-scene-mode=world]")).toHaveAttribute(
      "data-peer-count",
      "1",
      { timeout: 60000 },
    );
    await expect(beta.locator("canvas[data-scene-mode=world]")).toHaveAttribute(
      "data-peer-count",
      "1",
      { timeout: 60000 },
    );
    await expect(page.locator("canvas[data-scene-mode=world]")).toHaveAttribute(
      "data-animated-peer-count",
      "1",
      { timeout: 60000 },
    );
    await openCityMenu(beta);
    await beta
      .getByRole("button", { name: "Course houses", exact: true })
      .click();
    await expect(
      betaPanel.getByText("Shared connection: connected", { exact: true }),
    ).toBeVisible();
    await other.setOffline(true);
    await expect(
      betaPanel.getByText("Shared connection: reconnecting", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await other.setOffline(false);
    await expect(
      betaPanel.getByText("Shared connection: connected", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await beta
      .getByRole("button", { name: "Return to city", exact: true })
      .click();
    for (const p of [page, beta])
      await expect(p.locator("canvas[data-scene-mode=world]")).toHaveAttribute(
        "data-avatar-ready",
        "true",
        { timeout: 60000 },
      );
    const initial = (
      await (await other.request.get("/api/social")).json()
    ).presence.find((p: any) => p.name === "Social Alpha").x;
    await page.keyboard.down("d");
    await page.waitForTimeout(700);
    await page.keyboard.up("d");
    await expect
      .poll(
        async () => {
          const data = await (await other.request.get("/api/social")).json();
          return data.presence.find((p: any) => p.name === "Social Alpha")?.x;
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(initial);
    await beta.screenshot({ path: "test-results/step8-shared-city.png" });
    for (const p of [page, beta]) {
      await openCityMenu(p);
      await p
        .getByRole("button", { name: "Course houses", exact: true })
        .click();
      await p
        .getByRole("button", {
          name: "Visit course house: " + draft.definition.title,
          exact: true,
        })
        .click();
      await p
        .getByRole("button", { name: "Enroll & enter adventure", exact: true })
        .click();
      await openAdventurePanels(p);
    }
    await expect
      .poll(
        async () => {
          const d = await (await context.request.get("/api/social")).json();
          return d.presence[0]?.room || "";
        },
        { timeout: 30000 },
      )
      .toContain("course:" + draft.id + ":");
    await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-peer-count",
      "1",
      { timeout: 30000 },
    );
    await expect(beta.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-peer-count",
      "1",
      { timeout: 30000 },
    );
    for (const p of [page, beta])
      await expect(p.locator("canvas[data-course-theme]")).toHaveAttribute(
        "data-avatar-ready",
        "true",
        { timeout: 60000 },
      );
    // Answer selection highlights a gate; movement comes from the physical
    // controls. Move early in an untimed run, before obstacle assistance acts.
    await page.getByLabel("Section timing", { exact: true }).selectOption("0");
    await page
      .getByRole("button", { name: "Start section", exact: true })
      .click();
    await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-game-status",
      "active",
    );
    await page.getByRole("button", { name: "Move left", exact: true }).click();
    await expect
      .poll(
        async () => {
          const d = await (await other.request.get("/api/social")).json();
          return d.presence.find((p: any) => p.name === "Social Alpha")?.x;
        },
        { timeout: 15000 },
      )
      .toBeLessThan(-0.5);
    await page
      .getByRole("button", { name: "Pause section", exact: true })
      .click();
    await expect(page.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-game-status",
      "paused",
    );
    await expect(beta.locator("canvas[data-course-theme]")).toHaveAttribute(
      "data-game-status",
      "ready",
    );
    // Both learners are stationary while the receiving browser polls and
    // interpolates the final paused position before the room capture.
    await beta.waitForTimeout(4000);
    await beta.screenshot({ path: "test-results/step8-shared-course.png" });
    for (const p of [page, beta]) {
      await p
        .getByRole("button", { name: "Return to city", exact: true })
        .click();
      await openCityMenu(p);
      await p
        .getByRole("button", { name: "Course houses", exact: true })
        .click();
    }
    // Opening the directory pauses the city before its first rendered frame.
    // Both learners must leave their course room even while that scene is paused.
    for (const [request, peerName] of [
      [context.request, "Social Beta"],
      [other.request, "Social Alpha"],
    ] as const) {
      await expect
        .poll(
          async () => {
            const data = await (await request.get("/api/social")).json();
            return data.presence.find((p: any) => p.name === peerName)?.room;
          },
          { timeout: 15000 },
        )
        .toMatch(/^city:/);
    }
    await alphaPanel.getByLabel("Team name").fill("Alpha learners");
    await alphaPanel
      .getByRole("button", { name: "Create team", exact: true })
      .click();
    await betaPanel.getByLabel("Team name").fill("Beta learners");
    await betaPanel
      .getByRole("button", { name: "Create team", exact: true })
      .click();
    const opponent = (await (await other.request.get("/api/social")).json())
      .team.invite;
    await alphaPanel.getByLabel("Opponent team invite").fill(opponent);
    await alphaPanel
      .getByLabel("Battle course", { exact: true })
      .selectOption(draft.id);
    await alphaPanel
      .getByRole("button", { name: "Invite learning battle", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await other.request.get("/api/social")).json()).battles
            .length,
      )
      .toBe(1);
    await betaPanel
      .getByRole("button", {
        name: "Open battle: " + draft.definition.title + " · pending",
        exact: true,
      })
      .click();
    await betaPanel
      .getByRole("button", { name: "Accept battle", exact: true })
      .click();
    const aBattle = alphaPanel.getByRole("article", {
        name: "Learning battle",
      }),
      bBattle = betaPanel.getByRole("article", { name: "Learning battle" });
    for (const q of draft.definition.levels[0].questions.slice(0, 2)) {
      await expect(
        aBattle.getByRole("heading", { name: q.prompt, exact: true }),
      ).toBeVisible();
      await aBattle
        .getByRole("button", { name: q.options[q.answer], exact: true })
        .click();
      await aBattle
        .getByRole("button", { name: "Submit battle answer", exact: true })
        .click();
      await expect(
        bBattle.getByRole("heading", { name: q.prompt, exact: true }),
      ).toBeVisible();
      await bBattle
        .getByRole("button", {
          name: q.options[(q.answer + 1) % q.options.length],
          exact: true,
        })
        .click();
      await bBattle
        .getByRole("button", { name: "Submit battle answer", exact: true })
        .click();
    }
    await expect(aBattle.getByText(/Battle complete/)).toContainText(
      "20 team activity points",
    );
    await expect(bBattle.getByText(/Battle complete/)).toContainText(
      "5 team activity points",
    );
    await expect(
      page.getByRole("region", { name: "Avatar wardrobe and rewards" }),
    ).toContainText("20 available activity points");
    await page.screenshot({
      path: "test-results/step8-team-battle.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await alphaPanel
      .getByRole("heading", { name: "Learn together" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/step8-mobile-team.png" });
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(
      (await (await context.request.get("/api/learning/" + draft.id)).json())
        .completedLevelIds,
    ).toEqual([]);
    expect(
      (await (await context.request.get("/api/session")).json()).player.points,
    ).toBe(20);
    expect(
      (await (await other.request.get("/api/session")).json()).player.points,
    ).toBe(5);
    await expect(
      alphaPanel.getByRole("button", {
        name: "Report Social Beta",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await alphaPanel
      .getByRole("button", { name: "Report Social Beta", exact: true })
      .click();
    await expect(
      alphaPanel
        .getByRole("status")
        .filter({ hasText: "Report saved for moderator review." }),
    ).toHaveText("Report saved for moderator review.");
    await alphaPanel
      .getByRole("button", { name: "Block Social Beta", exact: true })
      .click();
    await expect(
      alphaPanel.locator("article").filter({ hasText: "Social Beta" }),
    ).toHaveCount(0);
    await alphaPanel
      .getByRole("button", { name: "Unblock Social Beta", exact: true })
      .click();
    await expect(
      alphaPanel.locator("article").filter({ hasText: "Social Beta" }),
    ).toBeVisible();
    await page.reload();
    await openCityMenu(page);
    await page
      .getByRole("button", { name: "Course houses", exact: true })
      .click();
    await expect(
      alphaPanel.getByRole("heading", { name: "Alpha learners", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await other.close();
  }
});
