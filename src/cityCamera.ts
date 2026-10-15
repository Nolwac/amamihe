import type { CityHouse } from "../shared/city-layout";

type Point = { x: number; y: number; z: number };
export type CameraWall = { min: Point; max: Point };
export type CityCameraView = {
  target: Point;
  anchor: Point;
  alpha: number;
  beta: number;
  radius: number;
};
export type ResolvedCityCamera = {
  target: Point;
  position: Point;
  alpha: number;
  radius: number;
};

/** Match the solid building parts, leaving the ground-floor entrance open. */
export function cityCameraWalls(houses: CityHouse[]): CameraWall[] {
  const walls: CameraWall[] = [];
  const add = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
  ) => {
    const clearance = 0.3;
    walls.push({
      min: { x: minX - clearance, y: minY - clearance, z: minZ - clearance },
      max: { x: maxX + clearance, y: maxY + clearance, z: maxZ + clearance },
    });
  };
  for (const h of houses) {
    add(h.x - h.width / 2, h.x - 1.8, 0.05, 3.55, h.z - 4, h.z + 4);
    add(h.x + 1.8, h.x + h.width / 2, 0.05, 3.55, h.z - 4, h.z + 4);
    add(h.x - h.width / 2, h.x + h.width / 2, 0, 3.5, h.z + 3.65, h.z + 3.85);
    add(
      h.x - h.width / 2,
      h.x + h.width / 2,
      3.65,
      h.pilot ? 12.8 : 9.8,
      h.z - 4.4,
      h.z + 4.4,
    );
  }
  return walls;
}

/** First intersection along a finite segment; no scene meshes or picking needed. */
function obstruction(from: Point, to: Point, walls: CameraWall[]) {
  let first = 1;
  for (const wall of walls) {
    let enter = 0;
    let exit = 1;
    for (const axis of ["x", "y", "z"] as const) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 0.00001) {
        if (from[axis] < wall.min[axis] || from[axis] > wall.max[axis]) {
          exit = -1;
          break;
        }
      } else {
        const a = (wall.min[axis] - from[axis]) / delta;
        const b = (wall.max[axis] - from[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit) first = Math.min(first, enter);
  }
  return first;
}

const angleDelta = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Keep the requested orbit; use a temporary clear view only around solid walls. */
export function resolveCityCamera(
  view: CityCameraView,
  walls: CameraWall[],
  previous?: ResolvedCityCamera,
  elapsed = 1,
): ResolvedCityCamera {
  // The forward look target can enter a wall while the learner stays in the doorway.
  const source =
    obstruction(view.anchor, view.target, walls) < 1
      ? view.anchor
      : view.target;
  const target = { x: source.x, y: source.y, z: source.z };
  const position = (alpha: number, radius: number): Point => ({
    x: target.x + Math.cos(alpha) * Math.sin(view.beta) * radius,
    y: target.y + Math.cos(view.beta) * radius,
    z: target.z + Math.sin(alpha) * Math.sin(view.beta) * radius,
  });
  const radiusAt = (alpha: number) => {
    const distance =
      obstruction(target, position(alpha, view.radius), walls) * view.radius;
    const radius = Math.max(
      0.2,
      Math.min(view.radius, distance - (distance < view.radius ? 0.05 : 0)),
    );
    return obstruction(view.anchor, position(alpha, radius), walls) < 1
      ? 0
      : radius;
  };
  const readable = Math.min(6.5, view.radius);
  let alpha = view.alpha;
  let radius = radiusAt(alpha);
  if (radius < readable) {
    for (let step = 1; step <= 12; step++) {
      const candidates = [-1, 1].map(
        (side) => view.alpha + (side * step * Math.PI) / 12,
      );
      if (previous)
        candidates.sort(
          (a, b) =>
            Math.abs(angleDelta(previous.alpha, a)) -
            Math.abs(angleDelta(previous.alpha, b)),
        );
      const clear = candidates.find(
        (candidate) => radiusAt(candidate) >= readable,
      );
      if (clear !== undefined) {
        alpha = clear;
        radius = radiusAt(alpha);
        break;
      }
    }
    // Keep the same side around a corner instead of alternating equal candidates.
    if (
      previous &&
      radiusAt(previous.alpha) >= readable &&
      Math.abs(angleDelta(view.alpha, previous.alpha)) <=
        Math.abs(angleDelta(view.alpha, alpha)) + Math.PI / 12
    ) {
      alpha = previous.alpha;
      radius = radiusAt(alpha);
    }
  }
  if (previous) {
    const amount = 1 - Math.exp(-Math.max(0, Math.min(elapsed, 1)) * 5);
    const eased = previous.alpha + angleDelta(previous.alpha, alpha) * amount;
    const easedRadius = radiusAt(eased);
    // Every intermediate view must clear the wall, including during recovery.
    if (easedRadius >= readable) {
      alpha = eased;
      radius = easedRadius;
    }
    radius = Math.min(radius, previous.radius + Math.max(0, elapsed) * 6);
  }
  if (obstruction(view.anchor, position(alpha, radius), walls) < 1)
    radius = radiusAt(alpha);
  // Turning around a wall changes the side of the forward look offset. Aim at
  // the learner during that temporary turn so narrow screens retain the body.
  if (
    Math.abs(angleDelta(view.alpha, alpha)) > 0.01 &&
    (target.x !== view.anchor.x ||
      target.y !== view.anchor.y ||
      target.z !== view.anchor.z)
  )
    return resolveCityCamera(
      { ...view, target: view.anchor },
      walls,
      previous,
      elapsed,
    );
  return { target, position: position(alpha, radius), alpha, radius };
}
