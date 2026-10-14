import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCourse } from "../shared/course.js";
import { playableCourses } from "../server/playable-courses.js";
import {
  changeWorldEvidence,
  emptyWorldEvidence,
  worldTaskAnswer,
  validateWorldTask,
  type CircuitTask,
} from "../shared/world-task.js";

test("bridge challenges assess an actual bounded arrangement and preserve undo/reset", () => {
  const q = playableCourses()[0].definition.levels[0].questions[0],
    task = q.worldTask!;
  let e = emptyWorldEvidence(task);
  assert.equal(worldTaskAnswer(task, e), null);
  e = changeWorldEvidence(task, e, { kind: "add-piece", units: 3 });
  e = changeWorldEvidence(task, e, { kind: "add-piece", units: 1 });
  assert.equal(worldTaskAnswer(task, e), q.answer);
  assert.equal(
    worldTaskAnswer(task, { kind: "fraction-bridge", pieces: [8] }),
    null,
    "Unavailable beams cannot supply credit.",
  );
  assert.equal(
    worldTaskAnswer(task, {
      kind: "fraction-bridge",
      pieces: Array(9).fill(1),
    }),
    null,
  );
  assert.equal(
    worldTaskAnswer(task, { kind: "fraction-bridge", pieces: ["1"] }),
    null,
  );
  assert.equal(
    worldTaskAnswer(
      task,
      changeWorldEvidence(task, e, { kind: "remove-piece" }),
    ),
    2,
  );
  assert.equal(
    worldTaskAnswer(task, changeWorldEvidence(task, e, { kind: "reset" })),
    null,
  );
});

test("relay experiments respect fixed inputs and reject ambiguous publication goals", () => {
  const q = playableCourses()[1].definition.levels[1].questions[0],
    task = q.worldTask as CircuitTask;
  const initial = emptyWorldEvidence(task);
  assert.deepEqual(
    changeWorldEvidence(task, initial, { kind: "switch", index: 0 }),
    initial,
  );
  assert.equal(
    worldTaskAnswer(
      task,
      changeWorldEvidence(task, initial, { kind: "switch", index: 1 }),
    ),
    q.answer,
  );
  assert.equal(
    worldTaskAnswer(task, { kind: "circuit", switches: [false, true] }),
    null,
  );
  assert.ok(validateWorldTask({ ...task, fixed: {} }, q.options, q.answer));
  assert.ok(
    validateWorldTask(
      { ...task, initial: [false, false] },
      q.options,
      q.answer,
    ),
  );
  assert.ok(
    validateWorldTask({ ...task, gate: "execute" }, q.options, q.answer),
  );
  assert.ok(
    validateWorldTask({ ...task, gate: { toString: 0 } }, q.options, q.answer),
  );
});

test("playable course publication requires the matching world and correctly authored goals", () => {
  for (const { definition } of playableCourses())
    assert.deepEqual(validateCourse(definition), []);
  const d = playableCourses()[0].definition;
  d.levels[0].questions[0].worldTask = undefined;
  assert.ok(validateCourse(d).some((i) => i.path.endsWith("worldTask")));
  const d2 = playableCourses()[0].definition;
  d2.levels[0].questions[0].answer = 7;
  assert.ok(validateCourse(d2).some((i) => i.path.endsWith("worldTask")));
  const q = playableCourses()[0].definition.levels[0].questions[0];
  assert.ok(
    validateWorldTask(
      { ...q.worldTask, targets: [{ numerator: 1, denominator: "2" }] },
      q.options,
      q.answer,
    ),
  );
});
