import { chromium, request, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createAccount } from "../../tests/auth-helpers.ts";

// Synthetic accounts are allowed only on loopback with a private test outbox.
const baseURL = process.env.PREVIEW_URL || "http://127.0.0.1:3000";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname),
);
assert.ok(
  process.env.EMAIL_TEST_OUTBOX,
  "Use an isolated local test-email server.",
);
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
const viewer = await browser.newContext({
  baseURL,
  viewport: { width: 390, height: 844 },
});
const peers = [];
let timer,
  pending = false,
  movement = 0,
  pulseError = "";
try {
  await createAccount(viewer.request, "Capacity Viewer");
  for (let i = 0; i < 7; i++) {
    const peer = await request.newContext({ baseURL });
    peers.push(peer);
    await createAccount(peer, "Capacity Peer " + (i + 1));
  }
  const pulse = async () => {
    if (pending) return;
    pending = true;
    movement = movement ? 0 : 0.15;
    try {
      for (let i = 0; i < peers.length; i++) {
        const r = await peers[i].post("/api/social/presence", {
          data: {
            space: "city",
            position: {
              x: [-3, -2, -1, 1, 2, 3, 4][i] + movement,
              z: -3,
              heading: 0,
            },
          },
        });
        assert.equal(r.status(), 200);
      }
    } catch {
      pulseError = "Synthetic peer heartbeat failed.";
    } finally {
      pending = false;
    }
  };
  await pulse();
  timer = setInterval(() => void pulse(), 3000);
  const page = await viewer.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Course houses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Join shared room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to city", exact: true })
    .click();
  const canvas = page.locator("canvas[data-scene-mode=world]");
  await expect(canvas).toHaveAttribute("data-peer-count", "7", {
    timeout: 60000,
  });
  await expect(canvas).toHaveAttribute("data-animated-peer-count", "3", {
    timeout: 60000,
  });
  const fps = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(5000);
    fps.push(await page.locator(".engine-status b").innerText());
  }
  assert.equal(pulseError, "");
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    browser: "Chromium, software WebGL",
    viewport: "390 x 844",
    throttle: "none",
    simulatedPlayers: 8,
    browserClients: 1,
    apiOnlyPeers: 7,
    visiblePeers: Number(await canvas.getAttribute("data-peer-count")),
    animatedPeers: Number(
      await canvas.getAttribute("data-animated-peer-count"),
    ),
    fpsSamples: fps,
    renderHeight: Number(await canvas.getAttribute("data-render-height")),
    activeTriangles: Number(await canvas.getAttribute("data-active-triangles")),
    jsHeapBytes: await page.evaluate(
      () => performance.memory?.usedJSHeapSize || null,
    ),
    pageErrors: errors,
    limitations:
      "Seven API-only synthetic peers and one software-rendered browser exercise the room and animation caps. This does not measure eight browser clients, real human behavior, physical 2 GB devices, hardware GPU performance or total process/device memory.",
  };
  await mkdir("evidence/reports", { recursive: true });
  await mkdir("evidence/screenshots", { recursive: true });
  await writeFile(
    "evidence/reports/step15-shared-world.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await page.screenshot({
    path: "evidence/screenshots/step15-shared-world-mobile.png",
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearInterval(timer);
  for (const peer of peers) {
    await peer.post("/api/social/leave", { data: {} }).catch(() => {});
    await peer.dispose();
  }
  await viewer.request.post("/api/social/leave", { data: {} }).catch(() => {});
  await browser.close();
}
