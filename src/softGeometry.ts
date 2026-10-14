import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

/** A small bevel has shared smooth normals; the flat faces stay architectural. */
export function createSoftBox(
  name: string,
  width: number,
  height: number,
  depth: number,
  scene: Scene,
) {
  const half = [width / 2, height / 2, depth / 2];
  if (Math.min(...half) < 0.04)
    return MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  const radius = Math.min(0.18, Math.min(...half) * 0.35);
  const inner = half.map((h) => h - radius);
  const coordinates = (h: number) => [
    -h,
    -h + radius * 0.3,
    -h + radius,
    h - radius,
    h - radius * 0.3,
    h,
  ];
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      const start = positions.length / 3;
      for (const y of coordinates(half[v]))
        for (const x of coordinates(half[u])) {
          const p = [0, 0, 0];
          p[axis] = sign * half[axis];
          p[u] = x;
          p[v] = y;
          const center = p.map((value, i) =>
            Math.max(-inner[i], Math.min(inner[i], value)),
          );
          const delta = p.map((value, i) => value - center[i]);
          const length = Math.hypot(...delta);
          positions.push(
            ...center.map((value, i) => value + (delta[i] / length) * radius),
          );
          normals.push(...delta.map((value) => value / length));
          uvs.push((x / half[u] + 1) / 2, (y / half[v] + 1) / 2);
        }
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) {
          const a = start + y * 6 + x;
          const face = [a, a + 1, a + 6, a + 1, a + 7, a + 6];
          indices.push(
            ...(sign < 0
              ? face
              : [face[0], face[2], face[1], face[3], face[5], face[4]]),
          );
        }
    }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  Object.assign(data, { positions, normals, uvs, indices });
  data.applyToMesh(mesh);
  return mesh;
}
