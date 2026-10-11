import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
test("Learning Police NPC and protected breaks work without changing progress", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Policy Explorer");
  await page.goto("/");
  await expect(page.locator("canvas[data-police-ready='true']")).toBeVisible({
    timeout: 30000,
  });
  const controls = page.getByRole("region", {
    name: "Learning Police",
    exact: true,
  });
  await controls.getByRole("button", { name: "Take a break" }).click();
  await expect(
    controls.getByText("Break protected. Your progress is retained."),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await context.request.get("/api/world-policy")).json())
          .protection,
    )
    .toBe("break");
  await controls.getByRole("button", { name: "Resume learning" }).click();
  expect(
    (await (await context.request.get("/api/world-policy")).json()).status,
  ).toBe("free");
});
test("detention controls expose a free course release and an auditable appeal", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Release Explorer");
  const draft: CourseDraft = await (
    await context.request.post("/api/studio/courses", {
      data: { template: "storytelling" },
    })
  ).json();
  expect(
    (
      await context.request.post(`/api/studio/courses/${draft.id}/publish`, {
        data: { revision: draft.revision },
      })
    ).ok(),
  ).toBe(true);
  await context.request.post(`/api/courses/${draft.id}/enroll`, {
    data: { version: 1 },
  });
  let fixture: any = {
    status: "arrested",
    idleMs: 900000,
    lastSeen: Date.now(),
    protection: "",
    detentionId: "browser-ui-fixture",
  };
  // The real state machine, evidence and payments are tested in the isolated API suite.
  await page.route("**/api/world-policy", async (route) => {
    const b = route.request().postDataJSON();
    if (b?.action === "appeal") fixture.appeal = b.message;
    if (b?.action === "release-course") fixture.goalCourseId = b.courseId;
    await route.fulfill({ json: fixture });
  });
  await page.goto("/");
  const police = page.getByRole("region", {
    name: "Learning Police",
    exact: true,
  });
  await expect(
    police.getByRole("heading", { name: /temporary city eviction/ }),
  ).toBeVisible();
  await police
    .getByLabel("Appeal this warning")
    .fill("The browser was suspended while reading.");
  await police.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    police.getByRole("button", { name: "Appeal submitted" }),
  ).toBeDisabled();
  await police.getByLabel("Release course").selectOption(draft.id);
  await police.getByRole("button", { name: "Continue release course" }).click();
  await expect(
    page.getByRole("button", { name: "Return to city" }),
  ).toBeVisible();
  await expect(
    police.getByText(
      "Complete two independent questions or finish your selected course for release.",
    ),
  ).toBeVisible();
  expect(fixture.goalCourseId).toBe(draft.id);
});
