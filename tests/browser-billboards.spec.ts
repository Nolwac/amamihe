import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
test("billboard submission stays pending and the world renders a bounded approved-list fixture", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Billboard Creator");
  await page.goto("/");
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  const desk = page.getByRole("region", { name: "Billboard submissions" });
  await desk.getByLabel("Billboard title").fill("Python learning opportunity");
  await desk
    .getByLabel("Advertisement description")
    .fill("A credible reference for learners.");
  await desk.getByLabel("HTTPS destination").fill("https://pytorch.org/docs");
  await desk.getByRole("button", { name: "Submit billboard" }).click();
  await expect(desk.getByRole("status")).toContainText("submitted for review");
  expect(
    (await (await context.request.get("/api/billboards")).json()).length,
  ).toBe(0);
  await desk
    .getByRole("button", { name: "Withdraw Python learning opportunity" })
    .click();
  await expect(desk.getByText(/withdrawn · City placement/)).toBeVisible();
  // Authorization is covered by the real API fixture; this fixture isolates 3D rendering.
  await page.route("**/api/billboards", (route) =>
    route.fulfill({
      json: [
        {
          id: "approved-fixture",
          title: "Python reference",
          description: "Authored opportunity",
          destination: "https://pytorch.org/docs",
        },
      ],
    }),
  );
  await page.reload();
  await expect(page.locator("canvas[data-billboard-count]")).toHaveAttribute(
    "data-billboard-count",
    "1",
  );
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Approved advertisements" })
      .getByRole("link"),
  ).toHaveAttribute("href", "https://pytorch.org/docs");
  await page
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  await page.screenshot({ path: "test-results/step13-billboard-city.png" });
});
