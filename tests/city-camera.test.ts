import assert from "node:assert/strict";
import test from "node:test";
import {
  cityHouses,
  cityPath,
  followCityRoute,
  CITY_STATION,
} from "../shared/city-layout";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue";
import {
  cityCameraWalls,
  resolveCityCamera,
  type CameraWall,
} from "../src/cityCamera";

const houses = cityHouses([
  { id: STORYTELLING_COURSE_ID, title: "Pilot" },
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `course-${i}`,
    title: `Course ${i}`,
  })),
]);
const walls = cityCameraWalls(houses);
const contains = (
  wall: CameraWall,
  point: { x: number; y: number; z: number },
) =>
  point.x > wall.min.x &&
  point.x < wall.max.x &&
  point.y > wall.min.y &&
  point.y < wall.max.y &&
  point.z > wall.min.z &&
  point.z < wall.max.z;
const viewAt = (x: number, z: number) => ({
  target: { x, y: 2.45, z: z + 1.5 },
  anchor: { x, y: 1.4, z },
  alpha: -Math.PI / 2,
  beta: 1.46,
  radius: 9,
});

test("phone camera behind the pilot stays outside the tower and frames the learner", () => {
  const view = viewAt(0, 19);
  const result = resolveCityCamera(view, walls);
  assert.ok(Math.abs(result.alpha - view.alpha) > 0.1);
  assert.ok(result.radius >= 4.5);
  assert.ok(!walls.some((wall) => contains(wall, result.position)));
  // Project the learner's chest into the actual narrow phone field of view.
  const forward = {
    x: (result.target.x - result.position.x) / result.radius,
    y: (result.target.y - result.position.y) / result.radius,
    z: (result.target.z - result.position.z) / result.radius,
  };
  const flatLength = Math.hypot(forward.x, forward.z);
  const right = { x: forward.z / flatLength, z: -forward.x / flatLength };
  const delta = {
    x: view.anchor.x - result.position.x,
    y: view.anchor.y - result.position.y,
    z: view.anchor.z - result.position.z,
  };
  const depth = delta.x * forward.x + delta.y * forward.y + delta.z * forward.z;
  const across = delta.x * right.x + delta.z * right.z;
  assert.ok(depth > 0);
  assert.ok(Math.abs(across) < depth * Math.tan(0.87 / 2) * (390 / 844));
});

test("requested orbit and zoom recover after clearing a building without accumulating offsets", () => {
  const requested = viewAt(0, -5);
  let previous = resolveCityCamera(viewAt(0, 19), walls);
  const initialDifference = Math.abs(previous.alpha - requested.alpha);
  previous = resolveCityCamera(requested, walls, previous, 1 / 12);
  assert.ok(Math.abs(previous.alpha - requested.alpha) > 0);
  assert.ok(Math.abs(previous.alpha - requested.alpha) < initialDifference);
  for (let frame = 0; frame < 100; frame++)
    previous = resolveCityCamera(requested, walls, previous, 1 / 12);
  assert.ok(Math.abs(previous.alpha - requested.alpha) < 0.00001);
  assert.equal(previous.radius, requested.radius);
  assert.equal(requested.alpha, -Math.PI / 2);
  assert.deepEqual(previous.target, requested.target);
});

test("phone avoidance turn centers the full learner at the captured westbound tower position", () => {
  const view = viewAt(-1.5564, 19);
  const previousAlpha = -2.821;
  const result = resolveCityCamera(
    view,
    walls,
    {
      target: { ...view.target },
      alpha: previousAlpha,
      radius: 9,
      position: {
        x: view.target.x + Math.cos(previousAlpha) * Math.sin(view.beta) * 9,
        y: view.target.y + Math.cos(view.beta) * 9,
        z: view.target.z + Math.sin(previousAlpha) * Math.sin(view.beta) * 9,
      },
    },
    1 / 12,
  );
  assert.deepEqual(result.target, view.anchor);
  assert.notEqual(result.target, view.anchor);
  const forward = {
    x: (result.target.x - result.position.x) / result.radius,
    y: (result.target.y - result.position.y) / result.radius,
    z: (result.target.z - result.position.z) / result.radius,
  };
  const flatLength = Math.hypot(forward.x, forward.z);
  const right = { x: forward.z / flatLength, y: 0, z: -forward.x / flatLength };
  const up = {
    x: -right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y,
  };
  for (const x of [-0.75, 0.75])
    for (const y of [0, 1.9]) {
      const delta = {
        x: view.anchor.x + x - result.position.x,
        y: y - result.position.y,
        z: view.anchor.z - result.position.z,
      };
      const depth =
        delta.x * forward.x + delta.y * forward.y + delta.z * forward.z;
      const across = delta.x * right.x + delta.z * right.z;
      const vertical = delta.x * up.x + delta.y * up.y + delta.z * up.z;
      assert.ok(depth > 0);
      assert.ok(Math.abs(across) < depth * Math.tan(0.87 / 2) * (390 / 844));
      assert.ok(Math.abs(vertical) < depth * Math.tan(0.87 / 2));
    }
});

test("saved rendered target stays independent of the next moving follow target", () => {
  const view = viewAt(0, -5);
  const result = resolveCityCamera(view, walls);
  view.target.z += 1;
  assert.equal(result.target.z, -3.5);
  assert.notEqual(result.target.z, view.target.z);
});

test("distant porch to station keeps the camera and learner sightline outside building walls", () => {
  let position = { x: 10, z: 39 };
  let route = cityPath(
    position,
    { x: CITY_STATION.door.x, z: CITY_STATION.door.z + 1 },
    houses,
  );
  let previous: ReturnType<typeof resolveCityCamera> | undefined;
  for (let frame = 0; frame < 1500 && route.length; frame++) {
    const next = followCityRoute(position, route, 1 / 12, houses);
    position = next.position;
    route = next.remaining;
    const view = viewAt(position.x, position.z);
    const result = resolveCityCamera(view, walls, previous, 1 / 12);
    assert.ok(
      !walls.some((wall) => contains(wall, result.position)),
      JSON.stringify({ position, result }),
    );
    for (let sample = 0; sample <= 100; sample++) {
      const amount = sample / 100;
      const point = {
        x: view.anchor.x + (result.position.x - view.anchor.x) * amount,
        y: view.anchor.y + (result.position.y - view.anchor.y) * amount,
        z: view.anchor.z + (result.position.z - view.anchor.z) * amount,
      };
      assert.ok(
        !walls.some((wall) => contains(wall, point)),
        JSON.stringify({ position, point, result }),
      );
    }
    previous = result;
  }
  assert.equal(route.length, 0);
});
