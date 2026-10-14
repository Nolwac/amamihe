/** ArcRotateCamera looks inward from (cos(alpha), sin(alpha)) on the X/Z plane. */
export function cameraRelativeMovement(
  right: number,
  forward: number,
  alpha: number,
): { x: number; z: number } {
  if (![right, forward, alpha].every(Number.isFinite)) return { x: 0, z: 0 };
  return {
    x: -right * Math.sin(alpha) - forward * Math.cos(alpha),
    z: right * Math.cos(alpha) - forward * Math.sin(alpha),
  };
}
