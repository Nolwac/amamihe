import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Authenticate before measuring the game. A test outbox is required when
// provisioning a local account; a remote audit can use explicit credentials.
async function authenticate(request) {
  const email = process.env.BROWSER_ACCOUNT_EMAIL;
  const password = process.env.BROWSER_ACCOUNT_PASSWORD;
  if (email || password) {
    if (!email || !password)
      throw new Error(
        "Set both BROWSER_ACCOUNT_EMAIL and BROWSER_ACCOUNT_PASSWORD.",
      );
    const response = await request.post("/api/auth/login", {
      data: { email, password },
    });
    if (!response.ok())
      throw new Error(`Audit sign-in failed (${response.status()}).`);
    return "existing account";
  }
  const destination = new URL(
    process.env.PREVIEW_URL || "http://127.0.0.1:3000",
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname))
    throw new Error(
      "Remote audits require BROWSER_ACCOUNT_EMAIL and BROWSER_ACCOUNT_PASSWORD; test accounts are provisioned only on loopback.",
    );
  const response = await request.post("/api/auth/signup", {
    data: {
      name: "Performance Explorer",
      outfit: "teal",
      email: `audit-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
  });
  if (!response.ok())
    throw new Error(`Audit account setup failed (${response.status()}).`);
  const pending = await response.json();
  if (!/^[\w-]+$/.test(pending.challengeId || ""))
    throw new Error("Account setup returned an invalid challenge identifier.");
  let message;
  try {
    message = JSON.parse(
      await readFile(
        path.join(
          process.env.EMAIL_TEST_OUTBOX || ".data/test-outbox",
          pending.challengeId + ".json",
        ),
        "utf8",
      ),
    );
  } catch {
    throw new Error(
      "Local account setup requires EMAIL_TEST_OUTBOX. For a remote audit, use BROWSER_ACCOUNT_EMAIL and BROWSER_ACCOUNT_PASSWORD.",
    );
  }
  const code = message.text.match(/\b\d{6}\b/)?.[0];
  if (!code)
    throw new Error("The local verification message contains no code.");
  const verified = await request.post("/api/auth/verify", {
    data: { challengeId: pending.challengeId, code },
  });
  if (!verified.ok())
    throw new Error(`Audit verification failed (${verified.status()}).`);
  return "local verified test account";
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({
    baseURL: process.env.PREVIEW_URL || "http://127.0.0.1:3000",
    viewport: { width: 390, height: 844 },
  });
  const accountSetup = await authenticate(context.request);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 100,
    downloadThroughput: 250000,
    uploadThroughput: 125000,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const start = Date.now();
  await page.goto("/");
  await page.locator('canvas[data-scene-mode="world"]').waitFor();
  await page
    .locator(".engine-status b")
    .filter({ hasNotText: "Loading" })
    .waitFor();
  await page.locator("canvas[data-avatar-ready=true]").waitFor();
  const firstPlayableMs = Date.now() - start;
  await page.waitForTimeout(4500);
  await page.locator("canvas[data-residents-ready=true]").waitFor();
  const fpsSamples = [];
  for (let sample = 0; sample < 3; sample++) {
    await page.waitForTimeout(1000);
    fpsSamples.push(await page.locator(".engine-status b").innerText());
  }
  const browserCdp = await browser.newBrowserCDPSession();
  const processInfo = await browserCdp.send("SystemInfo.getProcessInfo");
  const sampledMemory = await Promise.all(
    processInfo.processInfo.map(async (process) => {
      try {
        const rollup = await readFile(
          `/proc/${process.id}/smaps_rollup`,
          "utf8",
        );
        return {
          type: process.type,
          rss: Number(rollup.match(/^Rss:\s+(\d+)\s+kB/m)?.[1] || 0) * 1024,
          pss: Number(rollup.match(/^Pss:\s+(\d+)\s+kB/m)?.[1] || 0) * 1024,
        };
      } catch {
        return null;
      }
    }),
  );
  const processMemory = sampledMemory.filter((sample) => sample !== null);
  const metrics = await page.evaluate(() => ({
    navigationTransferBytes:
      performance.getEntriesByType("navigation")[0]?.transferSize || 0,
    resources: performance.getEntriesByType("resource").map((r) => ({
      name: r.name,
      transferSize: r.transferSize,
      encodedBodySize: r.encodedBodySize,
    })),
    heap: performance.memory?.usedJSHeapSize || null,
  }));
  const fps = await page.locator(".engine-status b").innerText();
  const result = {
    date: new Date().toISOString(),
    browser: "Chromium, software WebGL",
    viewport: "390 x 844",
    throttle: "2 Mbps down / 100ms latency / 4x CPU slowdown",
    accountSetup,
    firstPlayableMs,
    fps,
    fpsSamples,
    renderHeight: Number(
      await page.locator("canvas").getAttribute("data-render-height"),
    ),
    activeTriangles: Number(
      await page.locator("canvas").getAttribute("data-active-triangles"),
    ),
    activeMaterialTypes: JSON.parse(
      (await page.locator("canvas").getAttribute("data-active-materials")) ||
        "{}",
    ),
    renderCpuMs: Number(
      await page.locator("canvas").getAttribute("data-render-ms"),
    ),
    encodedBodyBytes: metrics.resources.reduce(
      (n, r) => n + r.encodedBodySize,
      0,
    ),
    networkEncodedBodyBytes: metrics.resources.reduce(
      (n, r) => n + (r.transferSize > 0 ? r.encodedBodySize : 0),
      0,
    ),
    transferBytes:
      metrics.navigationTransferBytes +
      metrics.resources.reduce((n, r) => n + r.transferSize, 0),
    jsHeapBytes: metrics.heap,
    browserProcessPssBytes: processMemory.length
      ? processMemory.reduce((n, p) => n + p.pss, 0)
      : null,
    browserProcessRssBytes: processMemory.length
      ? processMemory.reduce((n, p) => n + p.rss, 0)
      : null,
    rendererAndGpuPssBytes: processMemory.length
      ? processMemory
          .filter((p) => /renderer|gpu/i.test(p.type))
          .reduce((n, p) => n + p.pss, 0)
      : null,
    processMemory,
    memorySampledProcesses: processMemory.length,
    limitations:
      "CPU/network emulation is not a physical 2 GB device test. Browser process PSS is a Linux snapshot, excludes OS/background apps and hardware GPU allocations; RSS double-counts shared pages. Timing measures authenticated game navigation and excludes account creation, verification, and email-provider latency. Software rendering is not a hardware GPU benchmark. Encoded-body totals include resources reused from cache; networkEncodedBodyBytes excludes cache hits and transferBytes includes document/resource HTTP overhead, but excludes connection/TLS overhead.",
  };
  await mkdir("evidence/reports", { recursive: true });
  await mkdir("evidence/screenshots", { recursive: true });
  await writeFile(
    "evidence/reports/browser-audit.json",
    JSON.stringify(result, null, 2),
  );
  await page.screenshot({
    path: "evidence/screenshots/venture-city-mobile.png",
    fullPage: true,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
