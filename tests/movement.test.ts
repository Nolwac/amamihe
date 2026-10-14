import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraRelativeMovement } from "../shared/movement.js";

test("manual movement follows every camera heading while preserving input magnitude", () => {
  for (const [alpha, forward, right] of [
    [-Math.PI / 2, [0, 1], [1, 0]],
    [0, [-1, 0], [0, 1]],
    [Math.PI / 2, [0, -1], [-1, 0]],
    [Math.PI, [1, 0], [0, -1]],
  ] as const) {
    for (const turns of [-3, 0, 5]) {
      for (const [input, expected] of [
        [[0, 1], forward],
        [[1, 0], right],
        [[0, -1], forward.map((v) => -v)],
        [[-1, 0], right.map((v) => -v)],
      ] as const) {
        const actual = cameraRelativeMovement(
          input[0],
          input[1],
          alpha + turns * 2 * Math.PI,
        );
        assert.ok(Math.abs(actual.x - expected[0]) < 1e-12);
        assert.ok(Math.abs(actual.z - expected[1]) < 1e-12);
      }
    }
    const diagonal = cameraRelativeMovement(1, 1, alpha);
    assert.ok(
      Math.abs(Math.hypot(diagonal.x, diagonal.z) - Math.SQRT2) < 1e-12,
    );
    const stopped = cameraRelativeMovement(0, 0, alpha);
    assert.equal(Math.hypot(stopped.x, stopped.z), 0);
  }
  assert.deepEqual(cameraRelativeMovement(1, 0, NaN), { x: 0, z: 0 });
});
