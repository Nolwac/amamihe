import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import { cityCameraWalls } from "../src/cityCamera";
import type { CityHouse } from "../shared/city-layout";
import type { CourseDraft } from "../shared/course";

test("phone follow camera stays outside the pilot walls on an upper-district return", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Camera route explorer");
  // Keep the upper row present even on a fresh catalogue with no prior tests.
  for (let i = 0; i < 6; i++) {
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
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const canvas = page.locator("canvas.world-canvas");
  await expect(canvas).toHaveAttribute("data-avatar-ready", "true", {
    timeout: 30000,
  });
  const houses: CityHouse[] = JSON.parse(
    (await canvas.getAttribute("data-city-house-locations"))!,
  );
  const house = houses.filter((h) => !h.pilot && h.x > 0 && h.z >= 24).at(-1)!;
  expect(house).toBeTruthy();
  await page.getByLabel("City districts", { exact: true }).click();
  await page
    .getByRole("button", { name: "Walk to " + house.title, exact: true })
    .last()
    .click();
  await page.getByLabel("City districts", { exact: true }).click();
  await expect(page.getByLabel("Published course house preview")).toContainText(
    house.title,
    { timeout: 55000 },
  );
  await page
    .getByRole("button", { name: "Close course preview", exact: true })
    .click();
  await page.getByLabel("City districts", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Walk to Learning Police station",
      exact: true,
    })
    .click();
  await page.getByLabel("City districts", { exact: true }).click();
  await expect
    .poll(
      async () => {
        const frame = JSON.parse(
          (await canvas.getAttribute("data-movement-frame"))!,
        );
        const camera = JSON.parse(
          (await canvas.getAttribute("data-city-camera"))!,
        );
        return frame.z >= 18 && frame.z <= 27 && camera.adjusted;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  const camera = JSON.parse((await canvas.getAttribute("data-city-camera"))!);
  const point = {
    x: camera.position[0],
    y: camera.position[1],
    z: camera.position[2],
  };
  for (const wall of cityCameraWalls(houses))
    expect(
      (Object.keys(point) as (keyof typeof point)[]).every(
        (axis) =>
          point[axis] >= wall.min[axis] && point[axis] <= wall.max[axis],
      ),
    ).toBe(false);
  await page.screenshot({
    path: "test-results/city-camera-wall-clearance.png",
  });
});
