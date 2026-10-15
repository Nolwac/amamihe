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
    ...(pilot ? [{ ...pilot, x: 2.5, z: 14, width: 10, pilot: true }] : []),
    ...regular.map((c, i) => ({
      ...c,
      x: i % 2 ? 10 : -10,
      z: 4 + Math.floor(i / 2) * 20,
      width: 7,
      pilot: false,
    })),
  ];
}
export type CityStreet = {
  id: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
  width: number;
  kind: "road" | "walk";
};
/** The rendered paving and district map share this connected street plan. */
export function cityStreets(houses: CityHouse[]): CityStreet[] {
  const end = cityExtent(houses).maxZ - 1;
  const segment = (
    id: string,
    x: number,
    z: number,
    toX: number,
    toZ: number,
    width: number,
    kind: CityStreet["kind"] = "walk",
  ): CityStreet => ({
    id,
    from: { x, z },
    to: { x: toX, z: toZ },
    width,
    kind,
  });
  const streets = [
    segment("civic-road", -4, -39, -4, end, 2.6, "road"),
    segment("arrival-promenade", 0, -17, 0, 9, 4),
    segment("upper-promenade", 0, 19, 0, end, 3.2),
    segment("arrival-crossing", -4, -5, 0, -5, 2.4),
    segment("tower-bypass", -4, 19, 0, 19, 1.2),
    segment("east-plaza-lane", 0, 9, 9, 9, 1.2),
    segment("east-tower-walk", 8.8, 9, 8.8, 19, 2),
    segment("station-courtyard", -4, -25, -11, -25, 2.8),
    segment("station-door", -11, -25, -11, CITY_STATION.door.z, 2.2),
  ];
  const rows = new Map<number, CityHouse[]>();
  for (const house of houses) {
    if (house.pilot) {
      streets.push(
        segment("pilot-approach", 0, 5.5, house.x, 5.5, 2.4),
        segment("door:" + house.id, house.x, 5.5, house.x, house.z - 4.1, 2.4),
      );
    } else rows.set(house.z, [...(rows.get(house.z) || []), house]);
  }
  for (const [z, row] of rows) {
    const front = z - 5;
    streets.push(
      segment(
        "course-lane:" + z,
        Math.min(-4, ...row.map((h) => h.x)),
        front,
        Math.max(0, ...row.map((h) => h.x)),
        front,
        z === 24 ? 1.2 : 2.2,
      ),
    );
    for (const house of row)
      streets.push(
        segment("door:" + house.id, house.x, front, house.x, z - 4.1, 1.8),
      );
  }
  return streets;
}
export function cityExtent(houses: CityHouse[]) {
  return {
    minX: -16,
    maxX: 16,
    minZ: -42,
    maxZ: Math.max(30, ...houses.map((h) => h.z + 6)),
  };
}
export function coursePorchSteps(house: { x: number; z: number }) {
  return Array.from({ length: 3 }, (_, i) => ({
    x: house.x,
    y: 0.11 + i * 0.12,
    z: house.z - 4.75 + i * 0.22,
    width: 3.7,
    height: 0.16,
    depth: 1.2 - i * 0.22,
  }));
}
/** Visible floor support for standing actors; seated actors use the vehicle seat. */
export function cityStandingHeight(
  point: { x: number; z: number },
  houses: CityHouse[],
) {
  let height = 0.079;
  for (const house of houses) {
    if (
      Math.abs(point.x - house.x) <= house.width / 2 &&
      Math.abs(point.z - house.z) <= 4
    )
      height = Math.max(height, 0.34);
    for (const step of coursePorchSteps(house))
      if (
        Math.abs(point.x - step.x) <= step.width / 2 &&
        Math.abs(point.z - step.z) <= step.depth / 2
      )
        height = Math.max(height, step.y + step.height / 2);
  }
  if (
    Math.abs(point.x - CITY_STATION.x) <= 5.25 &&
    Math.abs(point.z - CITY_STATION.z) <= 6.25
  )
    height = Math.max(height, 0.1);
  if (
    Math.abs(point.x - CITY_STATION.cell.x) <= 2.4 &&
    Math.abs(point.z - CITY_STATION.cell.z) <= 1.9
  )
    height = Math.max(height, 0.1475);
  return height;
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

/** Prefer visible streets while retaining wall-safe access from any starting point. */
export function cityPath(
  from: { x: number; z: number },
  target: { x: number; z: number },
  houses: CityHouse[],
) {
  const start = { x: Math.round(from.x), z: Math.round(from.z) };
  const goal = { x: Math.round(target.x), z: Math.round(target.z) };
  const key = (p: { x: number; z: number }) => `${p.x}:${p.z}`;
  const streets = cityStreets(houses);
  const paved = (point: { x: number; z: number }) =>
    streets.some((street) => {
      const dx = street.to.x - street.from.x;
      const dz = street.to.z - street.from.z;
      const lengthSquared = dx * dx + dz * dz;
      const along = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - street.from.x) * dx +
                (point.z - street.from.z) * dz) /
                lengthSquared,
            ),
          )
        : 0;
      return (
        Math.hypot(
          point.x - street.from.x - along * dx,
          point.z - street.from.z - along * dz,
        ) <=
        street.width / 2 + 0.01
      );
    });
  const estimate = (p: { x: number; z: number }) =>
    Math.abs(p.x - goal.x) + Math.abs(p.z - goal.z);
  const queue = [{ point: start, cost: 0, rank: estimate(start) }];
  const costs = new Map([[key(start), 0]]);
  const previous = new Map<string, { x: number; z: number } | null>([
    [key(start), null],
  ]);
  let found = false;
  for (let i = 0; queue.length && i < 12000; i++) {
    let nearest = 0;
    for (let j = 1; j < queue.length; j++)
      if (queue[j].rank < queue[nearest].rank) nearest = j;
    const { point, cost } = queue.splice(nearest, 1)[0];
    if (cost !== costs.get(key(point))) continue;
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
      const permitted = walkCity(point, candidate, houses);
      if (permitted.x !== candidate.x || permitted.z !== candidate.z) continue;
      const nextCost = cost + (paved(candidate) ? 1 : 3);
      if (nextCost >= (costs.get(key(candidate)) ?? Infinity)) continue;
      costs.set(key(candidate), nextCost);
      previous.set(key(candidate), point);
      queue.push({
        point: candidate,
        cost: nextCost,
        rank: nextCost + estimate(candidate),
      });
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

/** Consume a bounded frame without overshooting or waiting a frame at every metre. */
export function followCityRoute(
  from: { x: number; z: number },
  route: { x: number; z: number }[],
  elapsed: number,
  houses: CityHouse[],
) {
  const position = { x: from.x, z: from.z };
  const remaining = route.slice();
  let budget = Number.isFinite(elapsed)
    ? Math.min(1, Math.max(0, elapsed)) * 3
    : 0;
  let direction = { x: 0, z: 0 };
  while (budget > 0 && remaining.length) {
    const point = remaining[0];
    const distance = Math.hypot(point.x - position.x, point.z - position.z);
    if (distance < 0.001) {
      remaining.shift();
      continue;
    }
    const amount = Math.min(distance, budget, 0.3);
    const dx = (point.x - position.x) / distance;
    const dz = (point.z - position.z) / distance;
    const next = walkCity(
      position,
      {
        x: position.x + dx * amount,
        z: position.z + dz * amount,
      },
      houses,
    );
    if (next.x === position.x && next.z === position.z) break;
    position.x = next.x;
    position.z = next.z;
    direction = { x: dx, z: dz };
    budget -= amount;
    if (distance - amount < 0.001) remaining.shift();
  }
  return { position, remaining, direction };
}
