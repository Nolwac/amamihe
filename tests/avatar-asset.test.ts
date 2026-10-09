import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function readAsset(file: string) {
  const binary = readFileSync(
    new URL(`../public/assets/${file}`, import.meta.url),
  );
  const json = JSON.parse(
    binary.subarray(20, 20 + binary.readUInt32LE(12)).toString(),
  );
  return { binary, json };
}

for (const file of ["explorer.glb", "explorer-low.glb"]) {
  const { binary, json } = readAsset(file);
  test(`${file} retains its skin, normalized vertex weights, and valid joints`, () => {
    const node = json.nodes.find(
      (n: { mesh?: number; skin?: number }) =>
        n.mesh !== undefined && n.skin !== undefined,
    );
    assert.ok(node, "A bare T-pose mesh is not a usable avatar");
    const jointCount = json.skins[node.skin].joints.length;
    const data = binary.subarray(28 + binary.readUInt32LE(12));
    for (const primitive of json.meshes[node.mesh].primitives) {
      assert.ok(
        primitive.attributes.JOINTS_0 !== undefined &&
          primitive.attributes.WEIGHTS_0 !== undefined,
      );
      const weights = json.accessors[primitive.attributes.WEIGHTS_0],
        view = json.bufferViews[weights.bufferView];
      for (let i = 0; i < weights.count; i++) {
        let sum = 0;
        for (let c = 0; c < 4; c++)
          sum += data.readFloatLE(
            (view.byteOffset || 0) + (weights.byteOffset || 0) + i * 16 + c * 4,
          );
        assert.ok(
          Math.abs(sum - 1) < 0.002,
          "Every skinned vertex must follow its bones",
        );
      }
      const joints = json.accessors[primitive.attributes.JOINTS_0],
        jView = json.bufferViews[joints.bufferView];
      for (let i = 0; i < joints.count * 4; i++) {
        const offset =
          (jView.byteOffset || 0) +
          (joints.byteOffset || 0) +
          i * (joints.componentType === 5121 ? 1 : 2);
        assert.ok(
          (joints.componentType === 5121
            ? data.readUInt8(offset)
            : data.readUInt16LE(offset)) < jointCount,
        );
      }
    }
  });
  test(`${file} ships idle and actual in-place walking motion`, () => {
    assert.ok(json.animations.some((a: { name: string }) => a.name === "Idle"));
    const walking = json.animations.find(
      (a: { name: string }) => a.name === "Walk",
    );
    assert.ok(walking);
    const leg = walking.channels.find(
      (c: { target: { node: number; path: string } }) =>
        json.nodes[c.target.node].name === "mixamorig:LeftUpLeg" &&
        c.target.path === "rotation",
    );
    assert.ok(leg);
    assert.ok(
      json.accessors[walking.samplers[leg.sampler].output].count > 2,
      "Walking must include motion, not only a static pose",
    );
    const rotation = json.accessors[walking.samplers[leg.sampler].output];
    const view = json.bufferViews[rotation.bufferView];
    const data = binary.subarray(28 + binary.readUInt32LE(12));
    const offset = (view.byteOffset || 0) + (rotation.byteOffset || 0);
    const stride = view.byteStride || 16;
    let motion = false;
    for (let sample = 1; sample < rotation.count; sample++)
      for (let axis = 0; axis < 4; axis++)
        if (
          Math.abs(
            data.readFloatLE(offset + sample * stride + axis * 4) -
              data.readFloatLE(offset + axis * 4),
          ) > 0.01
        )
          motion = true;
    assert.ok(motion, "A named Walk clip must actually move the leg");
  });
}

test("the Low derivative matches its source and remains within its geometry and rig budgets", () => {
  const full = readAsset("explorer.glb");
  const low = readAsset("explorer-low.glb");
  const node = low.json.nodes.find(
    (n: { mesh?: number; skin?: number }) =>
      n.mesh !== undefined && n.skin !== undefined,
  );
  assert.equal(
    node.extras.source_sha256,
    createHash("sha256").update(full.binary).digest("hex"),
    "Rebuild Low after changing the full explorer",
  );
  assert.ok(
    low.binary.length < 900000,
    "Low must avoid downloading the full-detail explorer",
  );
  assert.ok(
    low.json.skins[node.skin].joints.length <= 32,
    "Low keeps a smaller rig for basic GPU uniform budgets",
  );
  const triangles = low.json.meshes.reduce(
    (sum: number, mesh: { primitives: { indices: number }[] }) =>
      sum +
      mesh.primitives.reduce(
        (count, primitive) =>
          count + low.json.accessors[primitive.indices].count / 3,
        0,
      ),
    0,
  );
  assert.ok(
    triangles <= 16000,
    "Low must stay within its authored geometry budget",
  );
});
