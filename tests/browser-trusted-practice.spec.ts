import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import type { CourseDraft } from "../shared/course";
test("authored server practice check ignores client output and freezes its receipt", async ({
  page,
  context,
  browser,
}) => {
  await createAccount(context.request, "Verified Practice");
  const draft: CourseDraft = await (
    await context.request.post("/api/studio/courses", {
      data: { template: "storytelling" },
    })
  ).json();
  draft.definition.title = "Checked " + draft.id;
  draft.definition.resources.push({
    id: "arithmetic",
    kind: "javascript",
    title: "Embedding arithmetic",
    content: "return tokens * width;",
    url: "",
    source: "https://pytorch.org/docs/stable/generated/torch.nn.Embedding.html",
    practiceCheck: "embedding-parameters",
  });
  draft.definition.levels[0].resourceIds.push("arithmetic");
  const saved = await (
    await context.request.put("/api/studio/courses/" + draft.id, {
      data: { revision: draft.revision, definition: draft.definition },
    })
  ).json();
  expect(
    (
      await context.request.post(
        "/api/studio/courses/" + draft.id + "/publish",
        { data: { revision: saved.revision } },
      )
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Visit course house: " + draft.definition.title,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Enroll & enter adventure" }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Embedding arithmetic" })
    .click();
  const tool = page.getByRole("region", {
    name: "Practice: Embedding arithmetic",
  });
  await tool.getByRole("button", { name: "Open practice" }).click();
  await tool.getByRole("button", { name: "Run code" }).click();
  await expect(tool.getByRole("status")).toHaveText("16384");
  await tool.getByRole("button", { name: "Save practice evidence" }).click();
  await expect(
    tool.getByText(/Server check: verified-bounded-practice/),
  ).toBeVisible();
  const history = await (
    await context.request.get(`/api/practice/${draft.id}/history`)
  ).json();
  expect(history[0].receipt.passed).toBe(3);
  const replay = await (
    await context.request.post(`/api/practice/${history[0].id}/submit`, {
      data: { evidence: { code: "return 0", output: "forged" } },
    })
  ).json();
  expect(replay.assessment.status).toBe("verified-bounded-practice");
  const outsider = await browser.newContext();
  await createAccount(outsider.request, "Other Practice");
  expect(
    (
      await outsider.request.post(`/api/practice/${history[0].id}/submit`, {
        data: { evidence: { code: "return 0", output: "forged" } },
      })
    ).status(),
  ).toBe(409);
  const progress = await (
    await context.request.get(`/api/learning/${draft.id}`)
  ).json();
  expect(progress.completedLevelIds).toEqual([]);
  await outsider.close();
});
