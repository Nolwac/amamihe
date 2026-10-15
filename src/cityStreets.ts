import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { cityStreets, type CityHouse } from "../shared/city-layout";
import { resourcePath } from "./rendering";
import { createSoftBox } from "./softGeometry";

/** Human-scale paved routes, crossings and kerbs remain real world geometry. */
export function createCityStreets(scene: Scene, houses: CityHouse[]) {
  const meshes: Mesh[] = [];
  const material = (name: string, color: string, textured = true) => {
    const m = new StandardMaterial("street-" + name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = Color3.FromHexString("#20272a").scale(0.15);
    if (textured)
      m.diffuseTexture = new Texture(
        resourcePath("world/limestone.webp"),
        scene,
      );
    return m;
  };
  const road = material("slate-setts", "#6b7b7b");
  const paving = material("honey-limestone", "#f8e1b8");
  const edge = material("cut-stone", "#dbc89e");
  const brass = material("brass-inlay", "#bc9554", false);
  const paint = material("crossing", "#f2dfb5", false);
  const ground = (
    name: string,
    x: number,
    z: number,
    width: number,
    length: number,
    rotation: number,
    m: StandardMaterial,
    y = 0.075,
  ) => {
    const mesh = MeshBuilder.CreateGround(
      name,
      { width, height: length },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.material = m;
    mesh.receiveShadows = true;
    const uv = mesh.getVerticesData("uv")!;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] *= width / 1.6;
      uv[i + 1] *= length / 1.6;
    }
    mesh.setVerticesData("uv", uv);
    meshes.push(mesh);
    return mesh;
  };
  for (const street of cityStreets(houses)) {
    const dx = street.to.x - street.from.x;
    const dz = street.to.z - street.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const x = (street.from.x + street.to.x) / 2;
    const z = (street.from.z + street.to.z) / 2;
    const angle = Math.atan2(dx, dz);
    ground(
      street.id + "-border",
      x,
      z,
      street.width + 0.22,
      length,
      angle,
      edge,
      0.073,
    );
    ground(
      street.id,
      x,
      z,
      street.width,
      length,
      angle,
      street.kind === "road" ? road : paving,
      street.kind === "road" ? 0.076 : 0.079,
    );
    if (street.kind === "road") {
      for (const side of [-1, 1]) {
        const kerb = createSoftBox(
          "civic-road-kerb",
          0.11,
          0.08,
          length,
          scene,
        );
        kerb.position.set(x + side * (street.width / 2 + 0.1), 0.08, z);
        kerb.material = edge;
        meshes.push(kerb);
      }
      for (let stripeZ = street.from.z + 2; stripeZ < street.to.z; stripeZ += 5)
        ground("road-brass-marker", -4, stripeZ, 0.055, 1.1, 0, brass, 0.081);
    }
  }
  for (const z of [
    -25,
    -5,
    ...new Set(houses.filter((h) => !h.pilot).map((h) => h.z - 5)),
  ])
    for (let i = 0; i < 4; i++)
      ground("pedestrian-crossing", -4.9 + i * 0.6, z, 0.3, 1, 0, paint, 0.087);
  // Brass arrival medallions emphasize the final turn into each course porch.
  for (const h of houses) {
    const disc = MeshBuilder.CreateDisc(
      "course-threshold-medallion",
      { radius: 0.34, tessellation: 32 },
      scene,
    );
    disc.rotation.x = Math.PI / 2;
    disc.position.set(h.x, 0.084, h.z - 4.9);
    disc.material = brass;
    meshes.push(disc);
  }
  return [road, paving, edge, brass, paint].flatMap((m) => {
    const group = meshes.filter((mesh) => mesh.material === m);
    const merged =
      group.length > 1
        ? Mesh.MergeMeshes(group, true, true, undefined, false, false)
        : group[0];
    m.freeze();
    if (!merged) return [];
    merged.freezeWorldMatrix();
    merged.receiveShadows = true;
    return [merged];
  });
}
