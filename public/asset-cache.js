/* Bounded public app shell/art only. API/account/learner responses are never cached. */
const CACHE = "amamihe-public-v2";
const LIMIT = 180;
const BYTE_LIMIT = 24 * 1024 * 1024;
const ENTRY_LIMIT = 3 * 1024 * 1024;
function publicAsset(url) { return url.origin === self.location.origin && url.pathname.startsWith("/assets/") && /\.(glb|webp|png|jpg|js|css|woff2)$/.test(url.pathname); }
async function putPublic(cache, request, response) {
  if (!response.ok || response.status !== 200) return;
  const bytes = (await response.clone().arrayBuffer()).byteLength;
  if (bytes > ENTRY_LIMIT) return;
  await cache.delete(request);
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.set("X-Amamihe-Cache-Bytes", String(bytes));
  await cache.put(request, new Response(await response.clone().arrayBuffer(), { status: 200, headers }));
  const keys = await cache.keys();
  let total = 0;
  for (const key of [...keys].reverse()) {
    const item = await cache.match(key);
    total += Number(item.headers.get("X-Amamihe-Cache-Bytes") || ENTRY_LIMIT);
    if (total > BYTE_LIMIT || keys.indexOf(key) < keys.length - LIMIT) await cache.delete(key);
  }
}
self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_PUBLIC_SHELL") return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = [self.location.origin + "/", ...(Array.isArray(event.data.assets) ? event.data.assets : []).slice(0, LIMIT)];
    for (const name of urls) {
      try {
        const url = new URL(name);
        if (url.href !== self.location.origin + "/" && !publicAsset(url)) continue;
        const request = new Request(url, { credentials: "omit", cache: "force-cache" });
        if (!await cache.match(request)) await putPublic(cache, request, await fetch(request));
      } catch { /* Partial public caches remain usable; no private data fallback. */ }
    }
    event.ports[0]?.postMessage({ done: true });
  })());
});
self.addEventListener("activate", event => event.waitUntil(Promise.all([self.clients.claim(), caches.delete("amamihe-art-v1")])));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const shell = url.origin === self.location.origin && url.pathname === "/" && event.request.mode === "navigate";
  if (event.request.method !== "GET" || (!shell && !publicAsset(url)) || event.request.headers.has("range")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Revalidate online so releases can replace artwork at stable paths.
    try {
      const response = await fetch(event.request);
      if (response.ok && response.status === 200) {
        // Shell caching is explicitly requested by a saved-public-lesson action.
        if (!shell) await putPublic(cache, event.request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      throw error;
    }
  })());
});
