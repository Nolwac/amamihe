import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
test("isolated practice runs, stops runaway code, records drawings and keeps game progress", async ({
  page,
  context,
  browser,
}) => {
  await createAccount(context.request, "Practice Explorer");
  const d: CourseDraft = await (
    await context.request.post("/api/studio/courses", {
      data: { template: "storytelling" },
    })
  ).json();
  d.definition.title = "Practice " + d.id;
  d.definition.levels = d.definition.levels.slice(0, 1);
  d.definition.concepts = d.definition.concepts.slice(0, 1);
  d.definition.resources.push(
    {
      id: "js-practice",
      title: "JS practice",
      kind: "javascript",
      content: "return 2 + 2;",
      url: "",
      source: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    },
    {
      id: "draw-practice",
      title: "Draw practice",
      kind: "drawing",
      content: "Draw a model diagram.",
      url: "",
      source: "https://developer.mozilla.org/en-US/docs/Web/SVG",
    },
  );
  d.definition.levels[0].resourceIds.push(
    "js-practice",
    "draw-practice",
    "training-notebook",
  );
  d.definition.levels[0].widget = "javascript";
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
  await page.goto("/");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Visit course house: " + d.definition.title,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Enroll & enter adventure" }).click();
  await openAdventurePanels(page);
  await page.locator("summary").filter({ hasText: "JS practice" }).click();
  const js = page.getByRole("region", { name: "Practice: JS practice" });
  await js.getByRole("button", { name: "Open practice" }).click();
  await js.getByRole("button", { name: "Run code" }).click();
  await expect(js.getByRole("status")).toHaveText("4");
  await js.getByLabel("JavaScript workspace").fill("while (true) {}");
  await js.getByRole("button", { name: "Run code" }).click();
  await expect(js.getByRole("status")).toHaveText("Execution timed out.");
  await js.getByLabel("JavaScript workspace").fill("return typeof document;");
  await js.getByRole("button", { name: "Run code" }).click();
  await expect(js.getByRole("status")).toHaveText("undefined");
  await js
    .getByLabel("JavaScript workspace")
    .fill("return fetch('https://example.com').then(()=> 'unsafe');");
  await js.getByRole("button", { name: "Run code" }).click();
  await expect(js.getByRole("status")).toContainText("Error:");
  await js.getByLabel("JavaScript workspace").fill("return 4");
  await js.getByRole("button", { name: "Run code" }).click();
  await expect(js.getByRole("status")).toHaveText("4");
  await js.getByRole("button", { name: "Save practice evidence" }).click();
  await expect(js.getByText(/Practice saved as unverified/)).toBeVisible();
  const history = await (
    await context.request.get("/api/practice/" + d.id + "/history")
  ).json();
  expect(history[0].status).toBe("received");
  expect(history[0].version).toBe(1);
  expect(
    (
      await context.request.post("/api/practice/" + history[0].id + "/submit", {
        data: { evidence: { code: "tamper", output: "999" } },
      })
    ).ok(),
  ).toBe(true);
  const replay = await (
    await context.request.get("/api/practice/" + d.id + "/history")
  ).json();
  expect(replay[0].evidence.output).toBe("4");
  await page.locator("summary").filter({ hasText: "Draw practice" }).click();
  const draw = page.getByRole("region", { name: "Practice: Draw practice" });
  await draw.getByRole("button", { name: "Open practice" }).click();
  await draw
    .getByRole("button", { name: "Add center point with keyboard" })
    .click();
  await draw.getByRole("button", { name: "Save practice evidence" }).click();
  await expect(draw.getByText(/Practice saved as unverified/)).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "Reference Python training notebook" })
    .click();
  const notebook = page.getByRole("region", {
    name: "Practice: Reference Python training notebook",
  });
  await notebook.getByRole("button", { name: "Open practice" }).click();
  const download = page.waitForEvent("download");
  await notebook
    .getByRole("button", { name: "Download training notebook" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.ipynb$/);
  const progress = await (
    await context.request.get("/api/learning/" + d.id)
  ).json();
  expect(progress.points).toBe(0);
  expect(progress.completedLevelIds).toEqual([]);
  await page.reload();
  expect(
    (
      await (
        await context.request.get("/api/practice/" + d.id + "/history")
      ).json()
    ).length,
  ).toBe(3);
  expect(
    (
      await context.request.post("/api/practice/" + d.id + "/start", {
        data: { resourceId: "js-practice", deliveryId: "forged" },
      })
    ).status(),
  ).toBe(409);
  const outsider = await browser.newContext({
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:3000",
  });
  expect(
    (
      await outsider.request.post("/api/practice/" + d.id + "/start", {
        data: {},
      })
    ).status(),
  ).toBe(401);
  await createAccount(outsider.request, "Other Practice Explorer");
  expect(
    (
      await outsider.request.post(
        "/api/practice/" + history[0].id + "/submit",
        { data: { evidence: { code: "return 4", output: "4" } } },
      )
    ).status(),
  ).toBe(409);
  await outsider.close();
});
