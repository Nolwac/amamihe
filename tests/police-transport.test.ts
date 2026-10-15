import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPoliceTransport,
  advancePoliceTransport,
} from "../shared/police-transport.js";
import {
  CITY_STATION,
  cityHouses,
  walkCity,
  cityPath,
  cityStreets,
  followCityRoute,
  cityStandingHeight,
} from "../shared/city-layout.js";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue.js";

test("authorized detention has walking, boarding, seated vehicle travel and an interior station arrival", () => {
  let s = createPoliceTransport({ x: 0, z: -5 });
  const phases = new Set<string>();
  let boarded = false;
  let droveWithLearner = false;
  let walkedThroughDoor = false;
  for (let i = 0; i < 3000 && s.phase !== "detained"; i++) {
    const before = s;
    s = advancePoliceTransport(s, 0.1);
    phases.add(s.phase);
    if (s.phase === "boarding") {
      boarded = true;
      assert.equal(s.cuffs, true);
      assert.equal(s.learnerPose, "walk-restrained");
    }
    if (s.phase === "transport" && before.phase === "transport") {
      droveWithLearner = true;
      assert.equal(s.learnerSeated, true);
      assert.equal(s.officerSeated, true);
      assert.equal(s.learnerPose, "sit");
      assert.ok(
        Math.hypot(
          s.vehicle.x - before.vehicle.x,
          s.vehicle.z - before.vehicle.z,
        ) <= 0.701,
      );
    }
    if (!before.enteredStation && s.enteredStation) {
      walkedThroughDoor = true;
      assert.deepEqual(s.learner, CITY_STATION.door);
    }
    if (s.phase === "approach" && before.phase === "approach")
      assert.ok(
        Math.hypot(
          s.officer.x - before.officer.x,
          s.officer.z - before.officer.z,
        ) <= 0.231,
      );
  }
  assert.ok(boarded && droveWithLearner && walkedThroughDoor);
  assert.deepEqual(
    [...phases],
    [
      "dispatch",
      "approach",
      "restrained",
      "boarding",
      "transport",
      "arrival",
      "securing",
      "detained",
    ],
  );
  assert.deepEqual(s.learner, CITY_STATION.cell);
  assert.equal(s.phase, "detained");
  const after = advancePoliceTransport(s, 0.1);
  assert.deepEqual(after.learner, s.learner);
});
test("scene vector accessors are copied as actual coordinates", () => {
  class Position {
    constructor(
      private _x: number,
      private _z: number,
    ) {}
    get x() {
      return this._x;
    }
    get z() {
      return this._z;
    }
  }
  const s = createPoliceTransport(new Position(2, -5));
  assert.deepEqual(s.origin, { x: 2, z: -5 });
  assert.deepEqual(s.learner, { x: 2, z: -5 });
  assert.ok(Number.isFinite(advancePoliceTransport(s, 0.1).vehicle.z));
});

test("police travel keeps its real-time speed at one FPS and still completes the station journey", () => {
  for (const fps of [1, 3, 10, 60]) {
    let state = createPoliceTransport({ x: 0, z: -5 });
    for (let frame = 0; frame < fps; frame++)
      state = advancePoliceTransport(state, 1 / fps);
    assert.ok(Math.abs(state.vehicle.z - (CITY_STATION.parking.z + 7)) < 0.001);
    for (let frame = 0; frame < 60 * fps && state.phase !== "detained"; frame++)
      state = advancePoliceTransport(state, 1 / fps);
    assert.equal(state.phase, "detained");
    assert.deepEqual(state.learner, CITY_STATION.cell);
  }
  const delayed = advancePoliceTransport(
    createPoliceTransport({ x: 0, z: -5 }),
    60,
  );
  assert.equal(delayed.phase, "dispatch");
  assert.ok(Math.abs(delayed.vehicle.z - (CITY_STATION.parking.z + 7)) < 0.001);
});

test("officers and escorted learners go around course walls and enter the station doorway", () => {
  const houses = cityHouses([
    { id: STORYTELLING_COURSE_ID, title: "Model Makers" },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `house-${i}`,
      title: `House ${i}`,
    })),
  ]);
  for (const origin of [
    { x: 9.01, z: 24 },
    { x: 10.99, z: 24 },
    { x: 10, z: 24 },
    { x: -10, z: 44 },
    { x: 2.5, z: 15 },
  ]) {
    let state = createPoliceTransport(origin);
    for (let i = 0; i < 4000 && state.phase !== "detained"; i++) {
      const before = state;
      state = advancePoliceTransport(state, 0.1, houses);
      if (before.phase === "approach" && state.phase === "approach")
        assert.deepEqual(
          walkCity(before.officer, state.officer, houses),
          state.officer,
        );
      if (
        (before.phase === "boarding" && state.phase === "boarding") ||
        (before.phase === "arrival" && state.phase === "arrival")
      )
        assert.deepEqual(
          walkCity(before.learner, state.learner, houses),
          state.learner,
        );
    }
    assert.equal(state.phase, "detained");
    assert.deepEqual(state.learner, CITY_STATION.cell);
  }
});
test("all houses in a bounded district have real entrances beyond the old movement limits", () => {
  const entries = [
    { id: STORYTELLING_COURSE_ID, title: "Model Makers" },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `course-${i}`,
      title: `Learning ${i}`,
    })),
  ];
  const houses = cityHouses(entries);
  assert.equal(houses.length, 7);
  assert.equal(new Set(houses.map((h) => h.id)).size, 7);
  for (const house of houses) {
    const from = { x: house.x, z: house.z - 6 };
    const to = { x: house.x, z: house.z - 3.5 };
    assert.deepEqual(walkCity(from, to, houses), to);
    const wall = { x: house.x + 2, z: house.z };
    assert.deepEqual(walkCity(from, wall, houses), from);
    const path = cityPath(
      { x: 0, z: -5 },
      { x: house.x, z: house.z - 5 },
      houses,
    );
    assert.ok(path.length, `Reach ${house.id} around the existing buildings`);
    assert.deepEqual(path.at(-1), { x: house.x, z: house.z - 5 });
  }
  assert.ok(houses.some((h) => h.z > 30));
});

test("visible paving follows the walkable routes to every district house", () => {
  const houses = cityHouses([
    { id: STORYTELLING_COURSE_ID, title: "Model Makers" },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `course-${i}`,
      title: `Course ${i}`,
    })),
  ]);
  const paving = cityStreets(houses);
  const onPaving = (point: { x: number; z: number }) =>
    paving.some((street) => {
      const dx = street.to.x - street.from.x,
        dz = street.to.z - street.from.z;
      const along = Math.max(
        0,
        Math.min(
          1,
          ((point.x - street.from.x) * dx + (point.z - street.from.z) * dz) /
            (dx * dx + dz * dz),
        ),
      );
      return (
        Math.hypot(
          point.x - street.from.x - along * dx,
          point.z - street.from.z - along * dz,
        ) <=
        street.width / 2 + 0.01
      );
    });
  for (const house of houses) {
    const route = cityPath(
      { x: 0, z: -5 },
      { x: house.x, z: house.z - 5 },
      houses,
    );
    assert.ok(route.length);
    for (const point of route)
      assert.ok(
        onPaving(point),
        `Visible path to ${house.id} at ${point.x},${point.z}`,
      );
    assert.ok(paving.some((street) => street.id === "door:" + house.id));
  }
});

test("automatic walking reaches a distant porch without waypoint oscillation at one FPS", () => {
  const houses = cityHouses([
    { id: STORYTELLING_COURSE_ID, title: "Model Makers" },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `course-${i}`,
      title: `Course ${i}`,
    })),
  ]);
  const target = { x: 10, z: 39 };
  for (const fps of [1, 3, 60]) {
    let position = { x: 0, z: -5 };
    let route = cityPath(position, target, houses);
    for (let frame = 0; frame < 40 * fps && route.length; frame++) {
      const next = followCityRoute(position, route, 1 / fps, houses);
      assert.ok(
        Math.hypot(
          next.position.x - position.x,
          next.position.z - position.z,
        ) <=
          3 / fps + 0.001,
      );
      position = next.position;
      route = next.remaining;
    }
    assert.equal(route.length, 0);
    assert.ok(Math.hypot(position.x - target.x, position.z - target.z) < 0.001);
  }
});

test("standing actors follow the visible course steps and station floors", () => {
  const houses = cityHouses([{ id: "course", title: "Course" }]);
  const house = houses[0];
  assert.equal(cityStandingHeight({ x: 0, z: -5 }, houses), 0.079);
  assert.ok(
    Math.abs(
      cityStandingHeight({ x: house.x, z: house.z - 5 }, houses) - 0.31,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(
      cityStandingHeight({ x: house.x, z: house.z - 4.4 }, houses) - 0.43,
    ) < 0.001,
  );
  assert.equal(cityStandingHeight({ x: house.x, z: house.z }, houses), 0.34);
  assert.equal(cityStandingHeight(CITY_STATION.door, houses), 0.1);
  assert.equal(cityStandingHeight(CITY_STATION.cell, houses), 0.1475);
});
