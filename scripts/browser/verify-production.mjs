import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { KIDS_COURSES } from "../../shared/catalogue.ts";
import {
  DECISION_MODEL,
  DECISION_MODEL_DIGEST,
  DECISION_IDENTITY,
} from "../../shared/decision.ts";

// This is a permanent deployment smoke check, not an account-creation script.
// Public checks never send mail, submit learner evidence, or modify production data.
const base = process.env.PRODUCTION_URL || "https://amamihe.online";
const commit = process.env.EXPECTED_RELEASE;
assert.equal(
  new URL(base).protocol,
  "https:",
  "Production checks require HTTPS.",
);
assert.match(
  commit || "",
  /^[a-f0-9]{40}$/,
  "Supply the approved full commit.",
);
const index = await readFile("dist/index.html", "utf8");
const entry =
  index.match(/src="([^\"]+\/assets\/index-[^\"]+\.js)"/)?.[1] ||
  index.match(/src="(\/assets\/index-[^\"]+\.js)"/)?.[1];
assert.ok(entry, "Build the expected client before checking production.");
const waitMs = Math.min(
  30 * 60_000,
  Math.max(0, Number(process.env.DEPLOY_WAIT_MS || 30 * 60_000)),
);
const deadline = Date.now() + waitMs;
let health;
while (true) {
  try {
    const response = await fetch(base + "/api/health", {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const candidate = await response.json();
    if (
      response.ok &&
      candidate.release === commit &&
      candidate.features?.courseStudio &&
      candidate.features?.learningAssessment &&
      candidate.features?.playableThemes &&
      candidate.features?.physicalAdventure &&
      candidate.features?.gameAudio &&
      candidate.features?.cosmeticRewards &&
      candidate.features?.adaptiveResources &&
      candidate.features?.practiceEnvironments &&
      candidate.features?.reviewScheduling &&
      candidate.features?.sharedWorld &&
      candidate.features?.teamBattles &&
      candidate.features?.authorizedBillboards &&
      candidate.features?.learningPolice &&
      candidate.features?.worldOperations &&
      candidate.storage === "PostgreSQL" &&
      candidate.classifier === DECISION_IDENTITY &&
      candidate.decisionService?.ready === true &&
      candidate.decisionService?.modelDigest === DECISION_MODEL_DIGEST
    ) {
      const html = await fetch(base + "/", {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (html.ok && (await html.text()).includes(entry)) {
        health = candidate;
        break;
      }
    }
  } catch {
    /* Promotion can temporarily restart this app; keep the old services untouched. */
  }
  if (Date.now() >= deadline)
    throw new Error(
      "The approved server revision and expected client were not promoted within the deployment window.",
    );
  console.log(`Waiting for public release ${commit.slice(0, 12)}…`);
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
await mkdir("test-results/production", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_MANAGED_BROWSER
    ? undefined
    : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const evidence = {
  commit,
  clientEntry: entry,
  health,
  verifiedAt: new Date().toISOString(),
  checks: [],
  passed: false,
  boundaries:
    "Public, read-only production smoke. Full authenticated authoring/learner flows run against isolated storage in the verify job; no synthetic signup emails are sent to production.",
};
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  const insecure = await context.request.get(
    base.replace(/^https:/, "http:") + "/",
    { maxRedirects: 0 },
  );
  assert.ok(
    [301, 302, 307, 308].includes(insecure.status()),
    "HTTP must redirect to HTTPS.",
  );
  assert.ok(
    insecure.headers().location?.startsWith(base),
    "The redirect must retain the secure game origin.",
  );
  const response = await context.request.get(base + "/api/health");
  assert.equal(response.status(), 200);
  const actionAsset = await context.request.get(
    base + "/assets/explorer-adventure-low.glb",
  );
  assert.equal(actionAsset.status(), 200);
  const assetBytes = await actionAsset.body();
  assert.equal(
    createHash("sha256").update(assetBytes).digest("hex"),
    createHash("sha256")
      .update(await readFile("dist/assets/explorer-adventure-low.glb"))
      .digest("hex"),
    "Production must serve the exact approved action avatar.",
  );
  assert.ok(
    assetBytes.length < 1_000_000,
    "The Low action avatar must remain a bounded download.",
  );
  assert.equal(assetBytes.toString("ascii", 0, 4), "glTF");
  const avatarDocument = JSON.parse(
    assetBytes.toString("utf8", 20, 20 + assetBytes.readUInt32LE(12)).trim(),
  );
  for (const name of ["Run", "Jump", "Slide", "Guard", "Jab", "Hit", "Build"])
    assert.ok(
      avatarDocument.animations.some(
        (clip) => clip.name === name && clip.channels.length > 0,
      ),
      `Public course avatar must include baked ${name} motion.`,
    );
  evidence.checks.push(
    "public bounded action avatar with seven skeletal gameplay clips",
  );
  assert.ok(
    response.headers()["strict-transport-security"],
    "HTTPS must publish HSTS.",
  );
  assert.equal(
    (await context.request.get(base + "/api/studio/courses")).status(),
    401,
  );
  assert.equal(
    (await context.request.get(base + "/api/rewards")).status(),
    401,
  );
  for (const endpoint of [
    "/api/reviews",
    "/api/social",
    "/api/practice/missing/history",
  ])
    assert.equal((await context.request.get(base + endpoint)).status(), 401);
  assert.equal(
    (await context.request.get(base + "/api/world-policy")).status(),
    401,
  );
  assert.equal(
    (await context.request.get(base + "/api/operations")).status(),
    401,
  );
  const ads = await context.request.get(base + "/api/billboards");
  assert.equal(ads.status(), 200);
  assert.ok(Array.isArray(await ads.json()));
  const decisions = await context.request.get(base + "/api/decision-status");
  assert.equal(decisions.status(), 200);
  const decisionStatus = await decisions.json();
  assert.equal(decisionStatus.mode, "ollama");
  assert.equal(decisionStatus.ready, true);
  assert.equal(decisionStatus.model, DECISION_MODEL);
  assert.equal(decisionStatus.modelDigest, DECISION_MODEL_DIGEST);
  evidence.checks.push(
    "local tev1:0.8b typed inference ready with the exact verified model manifest",
  );
  const catalogue = await context.request.get(
    base + "/api/courses?limit=4&offset=0",
  );
  assert.equal(catalogue.status(), 200);
  const catalogueData = await catalogue.json();
  assert.ok(Array.isArray(catalogueData.courses));
  assert.ok(catalogueData.courses.length <= 4);
  const pilotResponse = await context.request.get(
    base + "/api/courses/amamihe-story-model",
  );
  assert.equal(
    pilotResponse.status(),
    200,
    "The pilot must actually be published.",
  );
  const pilot = await pilotResponse.json();
  assert.equal(pilot.definition.levels.length, 6);
  assert.equal(
    pilot.definition.levels.reduce(
      (total, level) => total + level.questions.length,
      0,
    ),
    12,
  );
  assert.ok(
    pilot.definition.resources.some((resource) => resource.kind === "notebook"),
  );
  for (const level of pilot.definition.levels)
    for (const question of [...level.questions, ...level.retryQuestions])
      assert.equal(
        question.answer,
        undefined,
        "Published previews must hide answer keys.",
      );
  evidence.checks.push(
    "exact promoted revision and client bundle",
    "verified TLS, HTTPS redirect and HSTS",
    "private studio requires authentication",
    "published course catalogue responds",
    "maintained storytelling pilot is published with six levels, twelve tasks and a training notebook",
  );
  const childrenResponse = await context.request.get(
    base + "/api/courses?audience=kids&limit=4",
  );
  assert.equal(childrenResponse.status(), 200);
  const children = await childrenResponse.json();
  assert.equal(children.total, KIDS_COURSES.length);
  assert.deepEqual(
    children.courses.map((course) => course.id).sort(),
    KIDS_COURSES.map((course) => course.id).sort(),
    "The children’s finder must expose all maintained age bands.",
  );
  for (const [index, course] of KIDS_COURSES.entries()) {
    const response = await context.request.get(
      base + "/api/courses/" + course.id,
    );
    assert.equal(response.status(), 200);
    const published = await response.json();
    assert.equal(published.definition.title, course.title);
    assert.ok(published.definition.summary.includes("Ages " + course.ages));
    assert.equal(published.definition.levels.length, 2);
    assert.equal(
      published.definition.levels.reduce((n, l) => n + l.questions.length, 0),
      4,
    );
    assert.equal(
      published.definition.levels.reduce(
        (n, l) => n + l.retryQuestions.length,
        0,
      ),
      4,
    );
    for (const level of published.definition.levels) {
      assert.equal(level.timeLimitSeconds, 0);
      assert.equal(
        level.worldStyle,
        ["garden", "story-trail", "pattern-track"][index],
      );
      for (const question of [...level.questions, ...level.retryQuestions]) {
        for (const field of ["answer", "hint", "explanation", "rubric"])
          assert.equal(
            question[field],
            undefined,
            "Public children’s previews must hide grading fields.",
          );
      }
    }
  }
  evidence.checks.push(
    "three maintained children’s games: age bands, bounded finder, two levels/four challenges/fresh retries, untimed compatible worlds and private grading fields",
  );
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByLabel("Create your explorer").waitFor({ timeout: 60_000 });
    await page
      .locator('canvas[data-scene-mode="avatar"][data-avatar-ready="true"]')
      .waitFor({ timeout: 60_000 });
    assert.equal(
      await page.locator("canvas").getAttribute("data-asset-error"),
      null,
    );
    if (viewport.width === 1280) {
      await page.locator(".audio-controls summary").click();
      await page
        .getByRole("button", { name: "Enable game audio", exact: true })
        .click();
      await page.waitForFunction(() => {
        const audio = window.getAmamiheAudioSnapshot?.();
        return audio?.contextState === "running" && audio.rms > 0.0001;
      });
      await page
        .getByRole("button", { name: "Mute game audio", exact: true })
        .click();
      await page.waitForFunction(() => {
        const audio = window.getAmamiheAudioSnapshot?.();
        return audio?.masterGain === 0 && audio.rms < 0.0001;
      });
      await page.locator(".audio-controls summary").click();
      evidence.checks.push("public audio gesture, actual waveform and mute");
    }
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email address").waitFor();
    await page.getByLabel("Password", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "The game must not overflow horizontally.",
    );
    assert.deepEqual(
      errors,
      [],
      "The live browser must not raise JavaScript errors.",
    );
    await page.screenshot({
      path: `test-results/production/game-${viewport.width}.png`,
      fullPage: true,
    });
    evidence.checks.push(
      `live ${viewport.width}px browser: rigged 3D avatar, account gate, aligned layout, no page errors`,
    );
    await page.close();
  }
  await context.close();
  evidence.passed = true;
  console.log("Public release and live browser checks passed.");
} finally {
  await writeFile(
    "test-results/production/verification.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await browser.close();
}
