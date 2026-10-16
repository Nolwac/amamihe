import assert from "node:assert/strict";
import test from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createGuardian } from "../src/courseEnvironment";
import {
  chaseEye,
  resolveChaseCamera,
  type ChaseOrbit,
} from "../shared/chase-camera";

test("clear chase framing preserves the requested orbit and zoom", () => {
  const orbit: ChaseOrbit = {
    alpha: -1.2,
    beta: 1.1,
    radius: 9,
    target: [0, 1.75, 0],
  };
  assert.equal(resolveChaseCamera(orbit, [[0, 0.1, 0]], []), orbit);
  assert.deepEqual(
    resolveChaseCamera(
      orbit,
      [[0, 0.1, 0]],
      [{ min: [30, 0, 30], max: [31, 5, 31] }],
    ),
    orbit,
  );
});

test("phone chase clears actual guardian geometry for both feet across lanes and strides", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const guardian = createGuardian(scene);
  const meshes = guardian.root.getChildMeshes();
  let blockedOriginal = 0;
  try {
    for (const lane of [-2.4, -1.65, 0, 1.65, 2.4])
      for (const gap of [2.4, 2.8, 4, 7, 10])
        for (const stride of [-1.2, 0, 0.8]) {
          guardian.update(1.7, gap, 0, lane, false, false, false);
          const feet = [
            [lane - 0.22, 0.12, stride],
            [lane + 0.22, 0.12, -stride],
          ] as const;
          const beta = 0.55;
          const yaw = Math.min(
            0.7,
            Math.asin(Math.min(1, (3.6 - lane) / (12 * Math.sin(beta)))),
          );
          const orbit: ChaseOrbit = {
            alpha: -Math.PI / 2 + yaw,
            beta,
            radius: 12,
            target: [lane, 1.75, -gap / 2],
          };
          const boxes = meshes.map((mesh) => {
            mesh.computeWorldMatrix(true);
            const b = mesh.getBoundingInfo().boundingBox;
            return {
              min: [
                b.minimumWorld.x,
                b.minimumWorld.y,
                b.minimumWorld.z,
              ] as const,
              max: [
                b.maximumWorld.x,
                b.maximumWorld.y,
                b.maximumWorld.z,
              ] as const,
            };
          });
          const hit = (eye: readonly number[], foot: readonly number[]) => {
            const origin = Vector3.FromArray(eye),
              target = Vector3.FromArray(foot);
            const ray = new Ray(
              origin,
              target.subtract(origin).normalize(),
              Vector3.Distance(origin, target) - 0.05,
            );
            return meshes.some((mesh) => ray.intersectsMesh(mesh, false).hit);
          };
          if (feet.some((foot) => hit(chaseEye(orbit), foot)))
            blockedOriginal++;
          const resolved = resolveChaseCamera(orbit, feet, boxes);
          assert.equal(resolved.alpha, orbit.alpha);
          assert.equal(resolved.radius, orbit.radius);
          assert.ok(resolved.beta >= 0.15 && resolved.beta <= orbit.beta);
          assert.ok(resolved.target[2] - orbit.target[2] <= 4);
          for (const foot of feet)
            assert.equal(
              hit(chaseEye(resolved), foot),
              false,
              `lane ${lane}, gap ${gap}, stride ${stride}`,
            );
        }
    assert.ok(
      blockedOriginal > 0,
      "The real guardian must occlude the old view in this regression grid.",
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
