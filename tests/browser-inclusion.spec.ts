import { test, expect } from "@playwright/test";
import { createAccount } from "./auth-helpers";
import { openAdventurePanels, openCityMenu } from "./game-ui-helpers";
import { UI_TRANSLATIONS } from "../shared/ui-language";
import { LANGUAGES } from "../shared/inclusion";

test("city graphics persist and accessibility settings do not obstruct the city menu", async ({
  page,
  context,
}) => {
  await createAccount(context.request, "Graphics explorer");
  await page.goto("/");
  await openCityMenu(page);
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await page
    .getByLabel("Graphics quality", { exact: true })
    .selectOption("medium");
  await page.reload();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-quality",
    "medium",
  );
  await openCityMenu(page);
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await expect(
    page.getByLabel("Graphics quality", { exact: true }),
  ).toHaveValue("medium");
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  await page.getByLabel("Reduced motion", { exact: true }).check();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-motion",
    "true",
  );
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-quality",
    "medium",
  );
});

test("seven-language account entry and keyboard access remain protected on a small screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  for (const lang of LANGUAGES) {
    await page.locator(".access-panel select").first().selectOption(lang.id);
    await expect(page.locator("html")).toHaveAttribute("lang", lang.id);
    await expect(page.locator("html")).toHaveAttribute("dir", lang.dir);
    await expect(page.locator(".access-panel h2")).toHaveText(
      UI_TRANSLATIONS["Access & language"][lang.id],
    );
  }
  await page.locator(".access-panel select").first().selectOption("en");
  await page.getByLabel("Text size", { exact: true }).selectOption("larger");
  await page.getByLabel("High contrast", { exact: true }).check();
  await page.getByLabel("Save mobile data", { exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-text",
    "larger",
  );
  expect(
    await page
      .locator(".access-panel")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
  ).toBe(true);
  await page
    .getByLabel("Type a command", { exact: true })
    .fill("enter adventure");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await expect(page.locator(".access-feedback")).toContainText("Sign in");
  expect(
    (await page.request.get("/api/learning/amamihe-number-garden")).status(),
  ).toBe(401);
  expect(
    await page.getByLabel("Allow browser speech service").isChecked(),
  ).toBe(false);
  expect(
    await page.getByLabel("Allow protected server narration").isChecked(),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator(".access-launcher")).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-access-text",
    "larger",
  );
  await expect(page.getByLabel("Create your explorer")).toBeVisible();
  expect(errors).toEqual([]);
});

test("voice navigation, version-pinned translations and public offline readings preserve account progress", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createAccount(context.request, "Inclusive explorer");
  await page.goto("/");
  await openCityMenu(page);
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await page
    .getByLabel("Graphics quality", { exact: true })
    .selectOption("medium");
  await page.reload();
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-scene-quality",
    "medium",
  );
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  async function command(value: string) {
    await page.getByLabel("Type a command", { exact: true }).fill(value);
    await page
      .getByRole("button", { name: "Run command", exact: true })
      .click();
  }
  await command("go to Number Garden");
  await expect(page.locator(".access-feedback")).toContainText("Number Garden");
  await command("enter adventure");
  await expect(page.getByLabel("Published course adventure")).toBeVisible({
    timeout: 30000,
  });
  await page.keyboard.press("Escape");
  await openAdventurePanels(page);
  await page
    .getByLabel("Adventure graphics", { exact: true })
    .selectOption("720");
  await page.reload();
  await openAdventurePanels(page);
  await expect(
    page.getByLabel("Adventure graphics", { exact: true }),
  ).toHaveValue("720");
  const original = await (
    await context.request.get("/api/learning/amamihe-number-garden")
  ).json();
  await page
    .getByRole("button", { name: "Save lesson for offline study", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved public readings" }),
  ).toBeVisible({ timeout: 30000 });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("amamihe-public-study-v1")!),
  );
  expect(saved[0].version).toBe(original.version);
  expect(
    saved[0].definition.resources.every((r: any) => r.kind === "reading"),
  ).toBe(true);
  expect(JSON.stringify(saved)).not.toMatch(
    /"answer"|"password"|"token"|"playerId"|"hint"/,
  );
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  for (const lang of ["ar", "ig", "yo", "ha"]) {
    await page.locator(".access-panel select").first().selectOption(lang);
    await expect
      .poll(async () => {
        const response = await context.request.get(
          "/api/learning/amamihe-number-garden",
          { headers: { "x-amamihe-language": lang } },
        );
        const current = await response.json();
        expect(current.question.id).toBe(original.question.id);
        expect(current.checkpoint).toBe(original.checkpoint);
        expect(current.assisted).toBe(original.assisted);
        return current.language;
      })
      .toBe(lang);
  }
  await page.locator(".access-panel select").first().selectOption("en");
  await command("write My own counting explanation");
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Practice explanation", { exact: true }),
  ).toHaveValue("My own counting explanation");
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  await command("untimed");
  await command("start");
  await expect
    .poll(
      async () =>
        (
          await (
            await context.request.get("/api/learning/amamihe-number-garden")
          ).json()
        ).game.status,
    )
    .toBe("active");
  await page.keyboard.press("Escape");
  const before = await (
    await context.request.get("/api/account/export")
  ).json();
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  await command("answer 2");
  await command("submit answer");
  const after = await (await context.request.get("/api/account/export")).json();
  expect(after.data.course_chunks).toEqual(before.data.course_chunks);
  await expect(page.locator(".access-feedback")).toContainText(
    "Confirm before submitting",
  );
  await command("answer 1");
  await command("confirm");
  expect(
    (await (await context.request.get("/api/account/export")).json()).data
      .course_chunks,
  ).toEqual(before.data.course_chunks);
  await command("submit answer");
  const submitted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/learning/amamihe-number-garden/answer") &&
      r.request().method() === "POST",
  );
  await command("confirm");
  expect((await submitted).ok()).toBe(true);
  const recorded = (
    await (await context.request.get("/api/account/export")).json()
  ).data.course_chunks;
  expect(recorded.length).toBe(before.data.course_chunks.length + 1);
  expect(recorded.at(-1).assisted).toBe(false);
  const keys = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.startsWith("amamihe-"))
          .map(async (k) =>
            (await (await caches.open(k)).keys()).map((r) => r.url),
          ),
      )
    ).flat(),
  );
  expect(keys.length).toBeGreaterThan(0);
  expect(keys.every((url) => !new URL(url).pathname.startsWith("/api/"))).toBe(
    true,
  );
  await context.setOffline(true);
  await page
    .getByRole("button", {
      name: "Number Garden · V" + original.version,
      exact: true,
    })
    .click();
  await expect(page.locator(".offline-study pre").first()).toContainText(
    "Count",
  );
  await page.reload();
  await expect(page.getByLabel("Published course adventure")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Access & language", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Number Garden · V" + original.version,
      exact: true,
    })
    .click();
  await expect(page.locator(".offline-study pre").first()).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
