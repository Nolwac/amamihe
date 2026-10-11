import { assetTier, type Connection } from "../shared/rendering";
export function resourcePath(file: string) {
  const connection = (navigator as Navigator & { connection?: Connection })
    .connection;
  const low = assetTier(connection) === "low";
  return `${import.meta.env.BASE_URL}assets/${low && file.startsWith("world/") ? file.replace("world/", "world/low/") : file}`;
}
export async function initializeAssetCache() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}asset-cache.js`,
        { scope: import.meta.env.BASE_URL },
      );
    } catch {
      /* Private browsing can disallow caches; normal downloads remain available. */
    }
  }
}
