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
  await context.setOffline(true);
  expect(
    await page.evaluate(async () => {
      try {
        await fetch("/assets/world/low/wood.webp");
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await context.setOffline(false);
  expect(
    await page.evaluate(
      async () => (await fetch("/assets/world/low/wood.webp")).ok,
    ),
  ).toBe(true);
});
