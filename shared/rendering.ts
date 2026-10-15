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
/** A 30 FPS ceiling leaves automatic quality's 24 FPS recovery reachable. */
export function courseRenderDeadline(
  now: number,
  previous: number,
  force = false,
): number | undefined {
  if (force) return now;
  const interval = 1000 / 30;
  const ticks = Math.floor((now - previous + 0.001) / interval);
  if (ticks < 1) return undefined;
  // Preserve cadence across different display refresh rates, without replaying
  // frames after a stall or a hidden tab.
  return previous + ticks * interval;
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
