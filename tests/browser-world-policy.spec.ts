import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
import { CITY_STATION } from "../shared/city-layout";
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
  await page.getByLabel("Learning Police controls", { exact: true }).click();
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
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await page
    .getByLabel("Graphics quality", { exact: true })
    .selectOption("medium");
  await page.getByLabel("City graphics settings", { exact: true }).click();
  const city = page.locator("canvas[data-scene-mode='world']");
  await expect(city).toHaveAttribute("data-police-station", "permanent");
  await expect(city).toHaveAttribute(
    "data-police-uniform",
    "navy-cap-badge-belt",
    { timeout: 30000 },
  );
  await expect(city).toHaveAttribute("data-arrest-phase", "approach", {
    timeout: 30000,
  });
  const materials = JSON.parse(
    (await city.getAttribute("data-police-materials")) || "[]",
  );
  for (const part of ["Explorer_Jacket", "Explorer_Trousers", "Cotton"]) {
    const material = materials.find((m: { name: string }) =>
      m.name.includes(part),
    );
    expect(material).toBeTruthy();
    expect(material.texture).toBe(false);
    expect(material.color[2]).toBeGreaterThan(material.color[1]);
  }
  const stride = () =>
    city.getAttribute("data-arrest-actors").then((raw) => {
      const a = JSON.parse(raw || "{}");
      return a.officerBones.map((b: any) =>
        b.matrix.slice(12, 15).map((v: number, i: number) => v - a.officer[i]),
      );
    });
  const legA = await stride();
  await expect.poll(stride, { timeout: 10000 }).not.toEqual(legA);
  await expect
    .poll(() => city.getAttribute("data-arrest-phase"), {
      timeout: 20000,
      intervals: [100],
    })
    .toBe("restrained");
  // GPU readback can outlast a moving phase on software WebGL. Observe the
  // real actors first; take the retained capture at the stable station endpoint.
  await expect
    .poll(() => city.getAttribute("data-arrest-phase"), {
      timeout: 30000,
      intervals: [100],
    })
    .toBe("transport");
  const seated = JSON.parse(
    (await city.getAttribute("data-arrest-actors")) || "{}",
  );
  expect(seated.learnerSeated).toBe(true);
  expect(seated.officerSeated).toBe(true);
  await expect(
    page.locator("canvas[data-arrest-phase='detained']"),
  ).toBeVisible({ timeout: 45000 });
  const actors = JSON.parse(
    (await page
      .locator("canvas[data-arrest-phase='detained']")
      .getAttribute("data-arrest-actors")) || "{}",
  );
  expect(actors.cuffs).toBe(true);
  expect(actors.learner[2]).toBe(CITY_STATION.cell.z);
  expect(Math.abs(actors.learner[0] - actors.officer[0])).toBeLessThan(1);
  await expect(
    page.locator("canvas[data-arrest-phase='detained']"),
  ).toHaveAttribute("data-police-uniform", "navy-cap-badge-belt", {
    timeout: 30000,
  });
  await expect(
    page.locator("canvas[data-arrest-phase='detained']"),
  ).toHaveAttribute("data-station-interior", "true");
  await page.screenshot({ path: "test-results/immersive-police-escort.png" });
  await page.getByLabel("Learning Police controls", { exact: true }).click();
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
