import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import { openAdventurePanels, openCityMenu } from "./game-ui-helpers";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue";

test("Automatic course graphics recover detail while explicit 144p stays fixed", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  await createAccount(context.request, "Graphics Explorer");
  const course = await (
    await context.request.get(`/api/courses/${STORYTELLING_COURSE_ID}`)
  ).json();
  await page.setViewportSize({ width: 1440, height: 900 });
  // Control RAF time, not model responses or rendering: software WebGL cannot
  // establish a physical device's available frame rate on a shared CI runner.
  await page.clock.install();
  await page.goto("/");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Visit course house: ${course.definition.title}`,
      exact: true,
    })
    .click();
  const enrollment = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/courses/${STORYTELLING_COURSE_ID}/enroll`) &&
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
  const graphics = page.getByLabel("Adventure graphics", { exact: true });
  await expect(graphics).toHaveValue("0");
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
  try {
    // Two complete sampling windows remove earlier real-time asset-loading
    // delays from the FPS estimate; every simulated RAF still renders the scene.
    await page.clock.runFor(6500);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-render-height")))
      .toBe(720);
    await expect(graphics).toHaveValue("0");
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-fps")))
      .toBeGreaterThanOrEqual(24);
    await graphics.selectOption("144");
    await page.clock.runFor(3500);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-render-height")))
      .toBe(144);
    await expect(graphics).toHaveValue("144");
  } finally {
    await page.clock.resume();
  }
});
