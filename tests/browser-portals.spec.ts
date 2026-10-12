import { openCityMenu, openAdventurePanels } from "./game-ui-helpers";
import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
test("3D search portals preview a published doorstep and preserve enrollment on return", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Portal Explorer");
  const draft: CourseDraft = await (
    await context.request.post("/api/studio/courses", {
      data: { template: "storytelling" },
    })
  ).json();
  draft.definition.title = "Portal " + draft.id;
  const saved = await (
    await context.request.put(`/api/studio/courses/${draft.id}`, {
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openCityMenu(page);
  await page
    .getByRole("button", { name: "Search portals", exact: true })
    .click();
  await page.getByLabel("Find a course").fill(draft.definition.title);
  await page.getByRole("button", { name: "Open search portals" }).click();
  const canvas = page.getByLabel("3D course portal universe");
  await expect(canvas).toHaveAttribute("data-portal-ready", "true");
  await expect(canvas).toHaveAttribute("data-portal-count", "1");
  await page
    .getByRole("button", { name: "Teleport to " + draft.definition.title })
    .click();
  await expect(
    page.getByRole("region", { name: "Published course house preview" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close course preview", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Search portal universe" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Teleport to " + draft.definition.title })
    .click();
  await page.getByRole("button", { name: "Enroll & enter adventure" }).click();
  await openAdventurePanels(page);
  await expect(
    page.getByRole("button", { name: "Return to city" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to city" }).click();
  await expect(
    page.getByRole("button", { name: "Search portals", exact: true }),
  ).toBeVisible();
  expect(
    (await (await context.request.get(`/api/learning/${draft.id}`)).json())
      .version,
  ).toBe(1);
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});
