type Point = readonly [number, number, number];
export type ChaseBounds = { min: Point; max: Point };
export type ChaseOrbit = {
  alpha: number;
  beta: number;
  radius: number;
  target: Point;
};

export function chaseEye(orbit: ChaseOrbit): Point {
  const horizontal = orbit.radius * Math.sin(orbit.beta);
  return [
    orbit.target[0] + horizontal * Math.cos(orbit.alpha),
    orbit.target[1] + orbit.radius * Math.cos(orbit.beta),
    orbit.target[2] + horizontal * Math.sin(orbit.alpha),
  ];
}

function blocked(eye: Point, point: Point, box: ChaseBounds) {
  let enter = 0,
    leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = point[axis] - eye[axis];
    const min = box.min[axis] - 0.06,
      max = box.max[axis] + 0.06;
    if (Math.abs(delta) < 1e-8) {
      if (eye[axis] < min || eye[axis] > max) return false;
      continue;
    }
    const a = (min - eye[axis]) / delta,
      b = (max - eye[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return leave > 0 && enter < 1;
}

/** Preserve the requested orbit when clear; rise above the actual pursuer bounds. */
export function resolveChaseCamera(
  requested: ChaseOrbit,
  feet: readonly Point[],
  obstacles: readonly ChaseBounds[],
): ChaseOrbit {
  if (!feet.length || !obstacles.length) return requested;
  let candidate = requested;
  // A forward target is a bounded fallback for a foot beneath the guardian's
  // projection. Raising the camera alone cannot clear that sightline.
  for (let forward = 0; forward <= 4; forward += 0.5) {
    const minimumBeta = Math.min(0.15, requested.beta);
    const steps = Math.ceil((requested.beta - minimumBeta) / 0.04);
    for (let step = 0; step <= steps; step++) {
      candidate = {
        ...requested,
        beta: Math.max(minimumBeta, requested.beta - step * 0.04),
        target: [
          requested.target[0],
          requested.target[1],
          requested.target[2] + forward,
        ],
      };
      const eye = chaseEye(candidate);
      if (
        feet.every((foot) => obstacles.every((box) => !blocked(eye, foot, box)))
      )
        return candidate;
    }
  }
  return candidate;
}
