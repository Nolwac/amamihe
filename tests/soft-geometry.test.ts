import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { createSoftBox } from "../src/softGeometry";

test("soft surfaces retain collision extents, continuous bevel normals and a bounded mesh", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const mesh = createSoftBox("furniture", 4, 2, 3, scene);
    const b = mesh.getBoundingInfo().boundingBox;
    assert.deepEqual(b.minimum.asArray(), [-2, -1, -1.5]);
    assert.deepEqual(b.maximum.asArray(), [2, 1, 1.5]);
    assert.ok(mesh.getTotalVertices() <= 216);
    assert.ok(mesh.getTotalIndices() <= 900);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    const seen = new Map<string, number[]>();
    for (let i = 0; i < positions.length; i += 3) {
      const n = normals.slice(i, i + 3);
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.00001);
      const key = Array.from(positions.slice(i, i + 3))
        .map((v) => v.toFixed(5))
        .join(",");
      if (seen.has(key))
        n.forEach((v, j) =>
          assert.ok(Math.abs(v - seen.get(key)![j]) < 0.00001),
        );
      seen.set(key, [...n]);
    }
    assert.ok(
      createSoftBox("thin-rail", 4, 0.03, 0.03, scene).getTotalVertices() < 30,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
