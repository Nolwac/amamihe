/* Public, reusable art only. No HTML, account, API, or learner data enters this cache. */
const CACHE = "amamihe-art-v1";
const LIMIT = 32;
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/assets/") || !/\.(glb|webp|png|jpg)$/.test(url.pathname) || event.request.headers.has("range")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Revalidate online so releases can replace artwork at stable paths.
    try {
      const response = await fetch(event.request);
      if (response.ok && response.status === 200) {
        await cache.put(event.request, response.clone());
        const keys = await cache.keys();
        for (const key of keys.slice(0, Math.max(0, keys.length - LIMIT))) await cache.delete(key);
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
