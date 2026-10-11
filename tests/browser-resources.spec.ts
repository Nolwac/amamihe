import { test, expect } from "@playwright/test";
test("art cache recovers interrupted/offline downloads without caching private data", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  const size = await page.evaluate(async () => {
    const r = await fetch("/assets/world/low/limestone.webp");
    return (await r.arrayBuffer()).byteLength;
  });
  expect(size).toBeGreaterThan(0);
  await context.setOffline(true);
  expect(
    await page.evaluate(
      async () =>
        (await (await fetch("/assets/world/low/limestone.webp")).arrayBuffer())
          .byteLength,
    ),
  ).toBe(size);
  await context.setOffline(false);
  const cached = await page.evaluate(async () => {
    const c = await caches.open("amamihe-art-v1");
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached.every((p) => p.startsWith("/assets/"))).toBe(true);
  const probe = "/assets/world/low/wood.webp?recovery=" + Date.now();
  await context.setOffline(true);
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return false;
      } catch {
        return true;
      }
    }, probe),
  ).toBe(true);
  await context.setOffline(false);
  expect(await page.evaluate(async (url) => (await fetch(url)).ok, probe)).toBe(
    true,
  );
});
