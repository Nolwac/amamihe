import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
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

test("rounded architectural surfaces retain Babylon's exterior face winding and smooth normals", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const direction = (mesh: Mesh) => {
      const p = mesh.getVerticesData("position")!,
        n = mesh.getVerticesData("normal")!,
        ix = mesh.getIndices()!;
      const products: number[] = [];
      for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3,
          b = ix[i + 1] * 3,
          c = ix[i + 2] * 3;
        const u = [0, 1, 2].map((j) => p[b + j] - p[a + j]),
          v = [0, 1, 2].map((j) => p[c + j] - p[a + j]);
        const cross = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
        if (Math.hypot(...cross) > 1e-9)
          products.push(
            Math.sign(cross.reduce((sum, v, j) => sum + v * n[a + j], 0)),
          );
      }
      for (let i = 0; i < n.length; i += 3)
        assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 0.001);
      return products;
    };
    const standard = direction(MeshBuilder.CreateBox("reference", {}, scene));
    assert.ok(standard.every((value) => value === standard[0]));
    for (const [w, h, d] of [
      [2, 2, 2],
      [2.7, 0.16, 3.1],
      [3, 0.3, 4],
      [2, 0.05, 1],
    ]) {
      const rounded = direction(createSoftBox("rounded", w, h, d, scene));
      assert.ok(rounded.length);
      assert.ok(
        rounded.every((value) => value === standard[0]),
        "Exterior faces must not be culled while inward surfaces remain visible.",
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
