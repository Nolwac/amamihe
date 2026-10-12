import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { CourseResource } from "../shared/course";

/** Small reusable objects, with authored text painted onto actual world surfaces. */
export function createResourceStations(scene: Scene) {
  let key = "";
  let roots: TransformNode[] = [];
  let materials: StandardMaterial[] = [];
  let textures: DynamicTexture[] = [];
  return (
    resources: CourseResource[],
    worldZ: number,
    selected?: string,
    phone = false,
  ) => {
    const next = resources.map((r) => r.id).join(":");
    if (next !== key) {
      roots.forEach((r) => r.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      roots = [];
      materials = [];
      textures = [];
      key = next;
      resources.slice(0, 4).forEach((resource, i) => {
        const root = new TransformNode(
          "resource-station-" + resource.id,
          scene,
        );
        const mat = new StandardMaterial("station-" + resource.id, scene);
        mat.diffuseColor = Color3.FromHexString("#e9c17b");
        mat.specularColor = Color3.Black();
        const base = MeshBuilder.CreateBox(
          "station-desk-" + resource.id,
          { width: 1.7, height: 0.15, depth: 0.9 },
          scene,
        );
        base.position.y = 0.9;
        base.parent = root;
        base.material = mat;
        const stem = MeshBuilder.CreateBox(
          "station-stem-" + resource.id,
          { width: 0.18, height: 0.9, depth: 0.18 },
          scene,
        );
        stem.position.y = 0.45;
        stem.parent = root;
        stem.material = mat;
        const screen = MeshBuilder.CreatePlane(
          "station-page-" + resource.id,
          { width: 1.9, height: 1.25 },
          scene,
        );
        screen.position.y = 1.7;
        screen.parent = root;
        const ink = new StandardMaterial("station-ink-" + resource.id, scene);
        const texture = new DynamicTexture(
          "station-text-" + resource.id,
          { width: 512, height: 336 },
          scene,
          false,
        );
        const ctx = texture.getContext();
        ctx.fillStyle = "#173d40";
        ctx.fillRect(0, 0, 512, 336);
        ctx.fillStyle = "#f9d793";
        ctx.font = "bold 25px sans-serif";
        ctx.fillText(
          resource.kind === "reading"
            ? "FIELD JOURNAL"
            : "PRACTICE WORKSTATION",
          20,
          40,
        );
        ctx.font = "22px sans-serif";
        ctx.fillStyle = "#ffffff";
        const words = (
          resource.title +
          " — " +
          resource.content.replace(/\s+/g, " ").slice(0, 170)
        ).split(" ");
        let line = "",
          y = 80;
        for (const word of words) {
          if (ctx.measureText(line + word).width > 460) {
            ctx.fillText(line, 20, y);
            y += 30;
            line = "";
          }
          if (y > 270) break;
          line += word + " ";
        }
        ctx.fillText(line, 20, y);
        ctx.fillStyle = "#f9d793";
        ctx.fillText("Select to investigate →", 20, 315);
        texture.update();
        ink.diffuseTexture = texture;
        ink.emissiveColor = new Color3(0.5, 0.5, 0.5);
        ink.backFaceCulling = false;
        screen.material = ink;
        for (const mesh of [base, stem, screen])
          mesh.metadata = { resourceId: resource.id };
        root.position.x = (i % 2 === 0 ? -1 : 1) * 3.15;
        root.rotation.y = i % 2 === 0 ? -0.3 : 0.3;
        roots.push(root);
        materials.push(mat, ink);
        textures.push(texture);
      });
    }
    roots.forEach((root, i) => {
      root.position.x = (i % 2 === 0 ? -1 : 1) * (phone ? 1.5 : 3.15);
      root.position.z = worldZ + 3 + Math.floor(i / 2) * 3;
      root.scaling.setAll(
        (phone ? 0.72 : 1) * (resources[i]?.id === selected ? 1.08 : 1),
      );
    });
  };
}
