import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
  await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:3000");
  await page.getByLabel("Your explorer name").fill("Performance Explorer");
  await page.getByRole("button", { name: "Enter Venture City" }).click();
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
      "CPU/network emulation is not a physical 2 GB device test. Browser process PSS is a Linux snapshot, excludes OS/background apps and hardware GPU allocations; RSS double-counts shared pages. Timing includes automated guest entry. Software rendering is not a hardware GPU benchmark. Encoded-body totals include resources reused from cache; networkEncodedBodyBytes excludes cache hits and transferBytes includes document/resource HTTP overhead, but excludes connection/TLS overhead.",
  };
  await mkdir("evidence", { recursive: true });
  await writeFile(
    "evidence/browser-audit.json",
    JSON.stringify(result, null, 2),
  );
  await page.screenshot({
    path: "evidence/venture-city-mobile.png",
    fullPage: true,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
