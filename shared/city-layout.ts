import { STORYTELLING_COURSE_ID } from "./catalogue.js";

export const CITY_DISTRICT_SIZE = 6;
export const CITY_STATION = {
  x: -11,
  z: -34,
  door: { x: -11, z: -28 },
  parking: { x: -4, z: -29 },
  cell: { x: -11, z: -35 },
};
export type CityHouse = {
  id: string;
  title: string;
  x: number;
  z: number;
  width: number;
  pilot: boolean;
};
/** Bounded districts keep every catalogue page walkable without loading a city at once. */
export function cityHouses(
  courses: { id: string; title: string }[],
): CityHouse[] {
  const unique = [...new Map(courses.map((c) => [c.id, c])).values()];
  const pilot = unique.find((c) => c.id === STORYTELLING_COURSE_ID);
  const regular = unique
    .filter((c) => c.id !== STORYTELLING_COURSE_ID)
    .slice(0, CITY_DISTRICT_SIZE);
  return [
    ...(pilot ? [{ ...pilot, x: 2.5, z: 15, width: 10, pilot: true }] : []),
    ...regular.map((c, i) => ({
      ...c,
      x: i % 2 ? 10 : -10,
      z: 4 + Math.floor(i / 2) * 20,
      width: 7,
      pilot: false,
    })),
  ];
}
export function cityExtent(houses: CityHouse[]) {
  return {
    minX: -16,
    maxX: 16,
    minZ: -42,
    maxZ: Math.max(30, ...houses.map((h) => h.z + 6)),
  };
}
export function walkCity(
  from: { x: number; z: number },
  to: { x: number; z: number },
  houses: CityHouse[],
) {
  const extent = cityExtent(houses);
  const next = {
    x: Math.max(extent.minX, Math.min(extent.maxX, to.x)),
    z: Math.max(extent.minZ, Math.min(extent.maxZ, to.z)),
  };
  for (const h of houses) {
    const inWalls =
      Math.abs(next.x - h.x) < h.width / 2 + 0.35 &&
      Math.abs(next.z - h.z) < 4.35;
    const entrance = Math.abs(next.x - h.x) < 1.15 && next.z < h.z + 2;
    if (inWalls && !entrance) return from;
  }
  // The permanent station is entered through its north doorway.
  if (
    Math.abs(next.x - CITY_STATION.x) < 5.25 &&
    Math.abs(next.z - CITY_STATION.z) < 6.25 &&
    !(Math.abs(next.x - CITY_STATION.x) < 1.2 && next.z > CITY_STATION.z - 2)
  )
    return from;
  return next;
}

/** Bounded cardinal paths use the same wall/entrance constraints as manual walking. */
export function cityPath(
  from: { x: number; z: number },
  target: { x: number; z: number },
  houses: CityHouse[],
) {
  const start = { x: Math.round(from.x), z: Math.round(from.z) };
  const goal = { x: Math.round(target.x), z: Math.round(target.z) };
  const key = (p: { x: number; z: number }) => `${p.x}:${p.z}`;
  const queue = [start];
  const previous = new Map<string, { x: number; z: number } | null>([
    [key(start), null],
  ]);
  let found = false;
  for (let i = 0; i < queue.length && i < 4000; i++) {
    const point = queue[i];
    if (key(point) === key(goal)) {
      found = true;
      break;
    }
    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const candidate = { x: point.x + dx, z: point.z + dz };
      if (previous.has(key(candidate))) continue;
      const permitted = walkCity(point, candidate, houses);
      if (permitted.x !== candidate.x || permitted.z !== candidate.z) continue;
      previous.set(key(candidate), point);
      queue.push(candidate);
    }
  }
  if (!found) return [];
  const path = [goal];
  let point = previous.get(key(goal));
  while (point) {
    path.unshift(point);
    point = previous.get(key(point));
  }
  const route = path.slice(1);
  if (goal.x !== target.x || goal.z !== target.z) route.push({ ...target });
  return route;
}
