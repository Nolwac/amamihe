import { expect, type Page } from "@playwright/test";

export async function openCityMenu(page: Page) {
  const menu = page.locator(".city-menu");
  if (!(await menu.getAttribute("open"))) {
    if (await menu.evaluate((el) => el.hasAttribute("open"))) return;
    await page.getByLabel("Open city menu", { exact: true }).click();
  }
}
export async function openAdventurePanels(page: Page) {
  await expect(page.getByLabel("Published course adventure")).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Show task", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Show task", exact: true }).click();
  const movement = page.locator(".movement-menu");
  if (
    (await movement.count()) &&
    !(await movement.evaluate((el) => el.hasAttribute("open")))
  )
    await page.locator(".movement-menu > summary").click();
}
