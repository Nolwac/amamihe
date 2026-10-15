export type Connection = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};
/** Download choice is separate from pixel resolution and never selects a paid resource. */
export function assetTier(connection?: Connection): "low" | "standard" {
  return !connection ||
    connection.saveData ||
    /(^|-)2g|3g/.test(connection.effectiveType || "") ||
    (connection.downlink !== undefined && connection.downlink < 2)
    ? "low"
    : "standard";
}
export function nextRenderHeight(
  height: number,
  fps: number,
  minimum = 144,
  maximum = height,
): number {
  if (!Number.isFinite(fps) || fps < 0) return height;
  const tiers = [144, 360, 720, 1080].filter(
    (tier) => tier >= minimum && tier <= maximum,
  );
  if (!tiers.length) return height;
  const index = Math.max(0, tiers.indexOf(height));
  return fps < 8
    ? tiers[Math.max(0, index - 1)]
    : fps >= 24
      ? tiers[Math.min(tiers.length - 1, index + 1)]
      : height;
}
