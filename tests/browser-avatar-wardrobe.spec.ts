import { test, expect } from "@playwright/test";
import { CHARACTERS } from "../shared/avatars";
import { createAccount } from "./auth-helpers";
import { openCityMenu } from "./game-ui-helpers";

test("equipping a jacket changes every playable character's rendered fabric while preserving city uniforms and resident palettes", async ({
  page,
  context,
}) => {
  test.setTimeout(300000);
  await createAccount(context.request, "Wardrobe Explorer", "terracotta");
  // Earn the purchase through the actual checkpoint, without altering rewards
  // or substituting the classifier, inventory, material, or character assets.
  const started = await context.request.post("/api/attempts", { data: {} });
  expect(started.ok()).toBe(true);
  const attempt = await started.json();
  const answers: Record<string, number> = { tokens: 0, split: 1, scratch: 2 };
  for (const question of attempt.questions) {
    const recorded = await context.request.post(
      `/api/attempts/${attempt.id}/chunks`,
      {
        data: {
          questionId: question.id,
          answer: answers[question.id],
          assisted: false,
          elapsedMs: 1000,
        },
      },
    );
    expect(recorded.ok()).toBe(true);
  }
  const assessed = await context.request.post(
    `/api/attempts/${attempt.id}/complete`,
    { data: {}, timeout: 90000 },
  );
  expect(assessed.ok()).toBe(true);
  expect((await assessed.json()).points).toBe(60);
  await page.goto("/");
  const city = page.locator("canvas.world-canvas");
  const wardrobe = page.getByRole("region", {
    name: "Avatar wardrobe and rewards",
    exact: true,
  });
  async function openWardrobe() {
    await openCityMenu(page);
    await page
      .getByRole("button", { name: "Course houses", exact: true })
      .click();
    await expect(wardrobe).toBeVisible();
  }
  async function chooseCharacter(id: string, name: string) {
    await openWardrobe();
    if ((await city.getAttribute("data-character")) !== id) {
      const changed = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/avatar") && r.request().method() === "POST",
      );
      await wardrobe
        .getByRole("button", { name: "Choose " + name, exact: true })
        .click();
      expect((await changed).ok()).toBe(true);
    }
    await page
      .getByRole("button", { name: "Return to city", exact: true })
      .click();
    await expect(city).toHaveAttribute("data-character", id);
    await expect(city).toHaveAttribute("data-avatar-ready", "true", {
      timeout: 30000,
    });
    await expect(city).toHaveAttribute("data-residents-ready", "true", {
      timeout: 30000,
    });
  }
  type RenderedMaterial = {
    name: string;
    texture: string | null;
    color: number[];
  };
  async function jacket(id: string) {
    const materials: RenderedMaterial[] = JSON.parse(
      (await city.getAttribute("data-avatar-materials")) || "[]",
    );
    const material = materials.find((m) =>
      m.name.includes(id === "amani" ? "Explorer_Jacket" : "_WovenJacket"),
    );
    expect(material, `${id} has a rendered jacket`).toBeTruthy();
    expect(material!.color).toEqual([1, 1, 1]);
    return material!;
  }
  async function cityPalettes() {
    return {
      police: JSON.parse(
        (await city.getAttribute("data-police-materials")) || "[]",
      ),
      residents: await Promise.all(
        ["kofi", "nia", "tayo"].map(async (id) =>
          JSON.parse(
            (await city.getAttribute(`data-resident-${id}-materials`)) || "[]",
          ),
        ),
      ),
    };
  }
  const before: Record<string, string | null> = {};
  let palettes: Awaited<ReturnType<typeof cityPalettes>> | undefined;
  for (const { id, name } of CHARACTERS) {
    await chooseCharacter(id, name);
    before[id] = (await jacket(id)).texture;
    expect(before[id]).toMatch(/avatar-fabric-terracotta\.png$/);
    const observed = await cityPalettes();
    expect(observed.police.length).toBeGreaterThan(0);
    expect(observed.residents.every((materials) => materials.length > 0)).toBe(
      true,
    );
    if (palettes) expect(observed).toEqual(palettes);
    else palettes = observed;
  }
  await openWardrobe();
  const purchased = page.waitForResponse((r) =>
    r.url().endsWith("/api/rewards/buy"),
  );
  await wardrobe
    .getByRole("button", { name: "Unlock Azure explorer jacket", exact: true })
    .click();
  expect((await purchased).ok()).toBe(true);
  await expect(
    wardrobe.getByRole("button", { name: "Equipped", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  for (const { id, name } of CHARACTERS) {
    await chooseCharacter(id, name);
    const equipped = await jacket(id);
    expect(equipped.texture).toBe("outfit-fabric-azure");
    expect(equipped.texture).not.toBe(before[id]);
    expect(await cityPalettes()).toEqual(palettes);
  }
  // Exercise the PBR branch too; low quality uses converted StandardMaterials.
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await page
    .getByLabel("Graphics quality", { exact: true })
    .selectOption("medium");
  await page.getByLabel("City graphics settings", { exact: true }).click();
  await expect(city).toHaveAttribute("data-scene-quality", "medium");
  await expect(city).toHaveAttribute("data-avatar-ready", "true", {
    timeout: 30000,
  });
  expect((await jacket("tayo")).texture).toBe("outfit-fabric-azure");
});
