import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { assetTier, nextRenderHeight } from "../shared/rendering.js";
test("bandwidth tiers and render resolution are independent", () => {
  assert.equal(assetTier(), "low");
  assert.equal(assetTier({ saveData: true, downlink: 10 }), "low");
  assert.equal(assetTier({ effectiveType: "3g" }), "low");
  assert.equal(assetTier({ downlink: 10, effectiveType: "4g" }), "standard");
  assert.equal(nextRenderHeight(720, 6), 360);
  assert.equal(nextRenderHeight(144, 2), 144);
  assert.equal(nextRenderHeight(360, 10), 360);
});
test("every low world texture transfers fewer bytes", async () => {
  for (const file of [
    "plaster.webp",
    "wood.webp",
    "leaf.webp",
    "limestone.webp",
  ]) {
    assert.ok(
      (await stat("public/assets/world/low/" + file)).size <
        (await stat("public/assets/world/" + file)).size,
    );
  }
});

test("Low residents reduce geometry and bytes without replacing human meshes", async () => {
  for (const name of ["resident", "explorer-resident"]) {
    const parse = async (file: string) => {
      const b = await readFile("public/assets/" + file + ".glb");
      return {
        bytes: b.length,
        json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()),
      };
    };
    const original = await parse(name),
      low = await parse(name + "-low");
    const triangles = (j: any) =>
      j.meshes.reduce(
        (n: number, m: any) =>
          n +
          m.primitives.reduce(
            (v: number, p: any) => v + j.accessors[p.indices].count / 3,
            0,
          ),
        0,
      );
    assert.ok(triangles(low.json) < triangles(original.json) * 0.3);
    assert.ok(low.bytes < original.bytes * 0.5);
    assert.ok(low.json.meshes.length > 0);
  }
});
