import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

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
  20 * 60_000,
  Math.max(0, Number(process.env.DEPLOY_WAIT_MS || 20 * 60_000)),
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
      candidate.features?.cosmeticRewards &&
      candidate.features?.adaptiveResources &&
      candidate.features?.practiceEnvironments &&
      candidate.features?.reviewScheduling &&
      candidate.features?.sharedWorld &&
      candidate.features?.teamBattles &&
      candidate.features?.authorizedBillboards &&
      candidate.features?.learningPolice &&
      candidate.features?.worldOperations &&
      candidate.storage === "PostgreSQL"
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
  assert.ok(["mock", "openrouter"].includes((await decisions.json()).mode));
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
