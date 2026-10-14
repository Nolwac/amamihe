import {
  CITY_STATION,
  cityPath,
  walkCity,
  type CityHouse,
} from "./city-layout.js";

export type Point = { x: number; z: number };
export type PolicePhase =
  | "dispatch"
  | "approach"
  | "restrained"
  | "boarding"
  | "transport"
  | "arrival"
  | "securing"
  | "detained"
  | "released";
export type PoliceActor =
  "idle" | "walk" | "run" | "restrained" | "walk-restrained" | "sit";
export type PoliceTransport = {
  route: Point[];
  phase: PolicePhase;
  time: number;
  origin: Point;
  learner: Point;
  officer: Point;
  vehicle: Point;
  heading: number;
  learnerHeading: number;
  officerHeading: number;
  learnerPose: PoliceActor;
  officerPose: PoliceActor;
  cuffs: boolean;
  doorOpen: boolean;
  learnerSeated: boolean;
  officerSeated: boolean;
  travelled: number;
  enteredStation: boolean;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
function towards(from: Point, to: Point, amount: number): Point {
  const length = distance(from, to);
  return length <= amount
    ? { ...to }
    : {
        x: from.x + ((to.x - from.x) * amount) / length,
        z: from.z + ((to.z - from.z) * amount) / length,
      };
}
const heading = (from: Point, to: Point) =>
  Math.atan2(to.x - from.x, to.z - from.z);
export function createPoliceTransport(origin: Point): PoliceTransport {
  return {
    route: [],
    phase: "dispatch",
    time: 0,
    origin: { x: origin.x, z: origin.z },
    learner: { x: origin.x, z: origin.z },
    officer: { ...CITY_STATION.parking },
    vehicle: { ...CITY_STATION.parking },
    heading: 0,
    learnerHeading: 0,
    officerHeading: 0,
    learnerPose: "idle",
    officerPose: "sit",
    cuffs: false,
    doorOpen: false,
    learnerSeated: false,
    officerSeated: true,
    travelled: 0,
    enteredStation: false,
  };
}
/** Presentation follows a server-authorized detention; it never issues a fine or clearance. */
export function advancePoliceTransport(
  s: PoliceTransport,
  elapsed: number,
  houses: CityHouse[] = [],
): PoliceTransport {
  // Keep presentation speed tied to elapsed time on slow renderers. Small
  // movement steps preserve paths; a suspended frame cannot skip the encounter.
  let remaining = Number.isFinite(elapsed)
    ? Math.max(0, Math.min(1, elapsed))
    : 0;
  let state = s;
  while (remaining > 0) {
    const step = Math.min(0.1, remaining);
    state = advancePoliceStep(state, step, houses);
    remaining -= step;
  }
  return state;
}
function advancePoliceStep(
  s: PoliceTransport,
  dt: number,
  houses: CityHouse[],
): PoliceTransport {
  const next = { ...s, time: s.time + dt };
  const pickup = { x: -4, z: Math.max(-8, s.origin.z - 2) };
  const seat = { x: pickup.x + 1, z: pickup.z };
  const setPhase = (phase: PolicePhase) => {
    next.phase = phase;
    next.time = 0;
    next.route = [];
  };
  const walkRoute = (from: Point, target: Point, speed: number) => {
    const route = s.route.length ? s.route : cityPath(from, target, houses);
    const waypoint = route[0] ?? target;
    const position = towards(from, waypoint, speed * dt);
    next.route = distance(position, waypoint) < 0.02 ? route.slice(1) : route;
    return { position, heading: heading(from, waypoint) };
  };
  if (s.phase === "dispatch" || s.phase === "transport") {
    const destination = s.phase === "dispatch" ? pickup : CITY_STATION.parking;
    const before = s.vehicle;
    next.vehicle = towards(before, destination, 7 * dt);
    next.heading = heading(before, destination);
    next.travelled += distance(before, next.vehicle);
    next.officer = { ...next.vehicle };
    next.officerSeated = true;
    next.officerPose = "sit";
    if (s.phase === "transport") {
      next.learner = { ...next.vehicle };
      next.learnerSeated = true;
      next.learnerPose = "sit";
    }
    if (distance(next.vehicle, destination) < 0.02) {
      next.heading = 0;
      next.doorOpen = true;
      next.officerSeated = false;
      next.officer = { x: next.vehicle.x - 1.3, z: next.vehicle.z };
      if (s.phase === "dispatch") setPhase("approach");
      else {
        next.learnerSeated = false;
        next.learner = { x: next.vehicle.x + 1.3, z: next.vehicle.z };
        setPhase("arrival");
      }
    }
  } else if (s.phase === "approach") {
    const target = [
      { x: s.origin.x - 0.85, z: s.origin.z },
      { x: s.origin.x + 0.85, z: s.origin.z },
      { x: s.origin.x, z: s.origin.z - 0.85 },
      s.origin,
    ].find((point) => {
      const allowed = walkCity(s.origin, point, houses);
      return allowed.x === point.x && allowed.z === point.z;
    })!;
    const walked = walkRoute(s.officer, target, 2.3);
    next.officer = walked.position;
    next.officerHeading = walked.heading;
    next.officerPose = "walk";
    if (distance(next.officer, target) < 0.02) {
      next.officerPose = "idle";
      next.cuffs = true;
      next.learnerPose = "restrained";
      setPhase("restrained");
    }
  } else if (s.phase === "restrained") {
    if (next.time >= 1.5) {
      next.learnerPose = "walk-restrained";
      next.officerPose = "walk";
      setPhase("boarding");
    }
  } else if (s.phase === "boarding") {
    const walked = walkRoute(s.learner, seat, 1.8);
    next.learner = walked.position;
    next.learnerHeading = walked.heading;
    next.officer = { x: next.learner.x - 0.8, z: next.learner.z };
    next.officerHeading = next.learnerHeading;
    next.learnerPose = "walk-restrained";
    next.officerPose = "walk";
    if (distance(next.learner, seat) < 0.02) {
      next.learnerSeated = true;
      next.officerSeated = true;
      next.learnerPose = "sit";
      next.officerPose = "sit";
      next.doorOpen = false;
      setPhase("transport");
    }
  } else if (s.phase === "arrival") {
    // Enter the real north doorway before walking to the interior waiting cell.
    const target = s.enteredStation ? CITY_STATION.cell : CITY_STATION.door;
    const walked = walkRoute(s.learner, target, 1.8);
    next.learner = walked.position;
    next.learnerHeading = walked.heading;
    next.officer = { x: next.learner.x - 0.75, z: next.learner.z + 0.35 };
    next.officerHeading = next.learnerHeading;
    next.learnerPose = "walk-restrained";
    next.officerPose = "walk";
    if (!s.enteredStation && distance(next.learner, CITY_STATION.door) < 0.02) {
      next.enteredStation = true;
      next.route = [];
    }
    if (s.enteredStation && distance(next.learner, CITY_STATION.cell) < 0.02) {
      next.learner = { ...CITY_STATION.cell };
      next.learnerPose = "restrained";
      next.officerPose = "walk";
      next.doorOpen = false;
      setPhase("securing");
    }
  } else if (s.phase === "securing") {
    const target = { x: CITY_STATION.cell.x - 0.75, z: CITY_STATION.z + 2 };
    next.officer = towards(s.officer, target, 1.8 * dt);
    next.officerHeading = heading(s.officer, target);
    next.officerPose = "walk";
    if (distance(next.officer, target) < 0.02) {
      next.officerHeading = Math.PI;
      next.officerPose = "idle";
      setPhase("detained");
    }
  }
  return next;
}
