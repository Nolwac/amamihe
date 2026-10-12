import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

type Accessor = {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
};
type Channel = { sampler: number; target: { node: number; path: string } };
type Clip = {
  name: string;
  channels: Channel[];
  samplers: { input: number; output: number }[];
};
type Asset = {
  nodes: {
    name: string;
    mesh?: number;
    skin?: number;
    extras?: { source_sha256: string; motion_source: string };
  }[];
  skins: { joints: number[] }[];
  materials: { name: string }[];
  meshes: {
    primitives: { indices: number; attributes: Record<string, number> }[];
  }[];
  accessors: Accessor[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  animations: Clip[];
};

function readAsset(file: string) {
  const binary = readFileSync(
    new URL(`../public/assets/${file}`, import.meta.url),
  );
  const length = binary.readUInt32LE(12);
  const doc: Asset = JSON.parse(binary.subarray(20, 20 + length).toString());
  const payload = binary.subarray(28 + length);
  function floats(accessorIndex: number) {
    const accessor = doc.accessors[accessorIndex];
    assert.equal(accessor.componentType, 5126);
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
    assert.ok(width);
    const view = doc.bufferViews[accessor.bufferView];
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const stride = view.byteStride || width * 4;
    return Array.from({ length: accessor.count }, (_, index) =>
      Array.from({ length: width }, (_, axis) =>
        payload.readFloatLE(start + index * stride + axis * 4),
      ),
    );
  }
  function samples(label: string, bone: string, path = "rotation") {
    const clip = doc.animations.find((item) => item.name === label);
    assert.ok(clip, `${label} must be a baked action clip`);
    const channel = clip.channels.find(
      (item) =>
        doc.nodes[item.target.node].name === `mixamorig:${bone}` &&
        item.target.path === path,
    );
    assert.ok(channel, `${label} must key ${bone}'s ${path}`);
    return floats(clip.samplers[channel.sampler].output);
  }
  return { binary, doc, floats, samples };
}

const adventure = readAsset("explorer-adventure-low.glb");
const original = readAsset("explorer-low.glb");

function range(samples: number[][]) {
  return Math.max(
    ...samples[0].map((_, axis) => {
      const values = samples.map((sample) => sample[axis]);
      return Math.max(...values) - Math.min(...values);
    }),
  );
}

test("the adventure rig preserves its human skin, material groups and low geometry budget", () => {
  const { binary, doc, floats } = adventure;
  const node = doc.nodes.find(
    (item) => item.mesh !== undefined && item.skin !== undefined,
  );
  assert.ok(node?.mesh !== undefined && node.skin !== undefined);
  assert.equal(
    node.extras?.source_sha256,
    createHash("sha256").update(original.binary).digest("hex"),
    "Rebuild action clips after changing the low explorer",
  );
  assert.match(node.extras?.motion_source || "", /Project-authored/);
  assert.ok(binary.length <= 1_000_000);
  assert.equal(doc.skins[node.skin].joints.length, 25);
  assert.deepEqual(
    doc.materials.map((material) => material.name),
    original.doc.materials.map((material) => material.name),
  );
  let triangles = 0;
  for (const primitive of doc.meshes[node.mesh].primitives) {
    triangles += doc.accessors[primitive.indices].count / 3;
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined);
    assert.ok(primitive.attributes.JOINTS_0 !== undefined);
    for (const weights of floats(primitive.attributes.WEIGHTS_0)) {
      assert.ok(
        Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 0.002,
      );
    }
  }
  assert.equal(triangles, 14473);
});

test("every adventure action fully keys the retained joints and has a bounded duration", () => {
  const labels = [
    "Idle",
    "Walk",
    "Run",
    "Jump",
    "Slide",
    "Guard",
    "Jab",
    "Hit",
    "Build",
  ];
  assert.deepEqual(
    adventure.doc.animations.map((clip) => clip.name).sort(),
    labels.sort(),
  );
  const joints = adventure.doc.skins[0].joints;
  for (const clip of adventure.doc.animations) {
    for (const joint of joints) {
      for (const path of ["rotation", "translation", "scale"]) {
        assert.ok(
          clip.channels.some(
            (channel) =>
              channel.target.node === joint && channel.target.path === path,
          ),
          `${clip.name} must reset ${adventure.doc.nodes[joint].name}'s ${path} on a seek`,
        );
      }
    }
    const duration = Math.max(
      ...clip.samplers.map((sampler) => {
        const times = adventure.floats(sampler.input);
        return times.at(-1)![0] - times[0][0];
      }),
    );
    assert.ok(duration >= 0.5 && duration <= 1.51);
  }
});

test("Run, Jump and Slide articulate legs and arms instead of renaming a standing pose", () => {
  for (const label of ["Run", "Jump", "Slide"]) {
    for (const bone of [
      "LeftUpLeg",
      "RightUpLeg",
      "LeftLeg",
      "RightLeg",
      "LeftArm",
      "RightArm",
    ]) {
      assert.ok(
        range(adventure.samples(label, bone)) > 0.1,
        `${label} must visibly articulate ${bone}`,
      );
    }
  }
  assert.ok(
    range(adventure.samples("Run", "LeftUpLeg")) >
      range(adventure.samples("Walk", "LeftUpLeg")) * 1.5,
  );
  assert.ok(
    range(adventure.samples("Slide", "Hips", "translation")) > 30,
    "Sliding must lower the pelvis, not simply rotate a standing character",
  );
});

test("sparring and building contain distinct guard, extended punch, recoil and working motion", () => {
  assert.ok(range(adventure.samples("Guard", "LeftArm")) > 0.01);
  assert.ok(range(adventure.samples("Jab", "RightForeArm")) > 0.3);
  assert.ok(range(adventure.samples("Jab", "Spine2")) > 0.1);
  assert.ok(range(adventure.samples("Hit", "Spine")) > 0.1);
  assert.ok(range(adventure.samples("Build", "RightArm")) > 0.2);
  assert.ok(range(adventure.samples("Build", "RightForeArm")) > 0.1);
});
