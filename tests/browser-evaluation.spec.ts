import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createAccount } from "./auth-helpers";
import { readFile } from "node:fs/promises";
for (const width of [390, 1440])
  test(`evaluation checks WCAG controls and private local reports at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const scan = async () => {
      const report = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        report.violations
          .filter((v) => ["critical", "serious"].includes(v.impact || ""))
          .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
    };
    await page.goto("/");
    await scan();
    await createAccount(context.request, "Evaluation Explorer");
    await page.reload();
    await page
      .getByRole("button", { name: "Course houses", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Device evaluation" });
    await expect(
      panel.getByRole("heading", { name: "Check this device" }),
    ).toBeVisible();
    await scan();
    await panel
      .getByLabel("Device RAM (from your device settings)")
      .selectOption("2");
    await panel.getByLabel("How did the game feel?").selectOption("slow");
    await panel
      .getByLabel("Activity and problem")
      .fill("Walking was slow on this test device.");
    const downloading = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download device report" }).click();
    const file = await downloading;
    const report = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(report.physicalRamGbReportedByLearner).toBe("2");
    expect(report.experienceReportedByLearner).toBe("slow");
    expect(report).not.toHaveProperty("email");
    await page
      .getByRole("button", { name: "Return to city", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tutor studio", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Start storytelling course/ })
      .first()
      .waitFor();
    await scan();
  });
