import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { CourseResource } from "../shared/course";
import { createSoftBox } from "./softGeometry";

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
        mat.diffuseColor = Color3.FromHexString("#b88650");
        mat.specularColor = Color3.Black();
        const base = MeshBuilder.CreateBox(
          "station-desk-" + resource.id,
          { width: 1.15, height: 0.12, depth: 0.7 },
          scene,
        );
        base.position.y = 0.76;
        base.parent = root;
        base.material = mat;
        const stem = MeshBuilder.CreateCylinder(
          "station-stem-" + resource.id,
          { diameter: 0.17, height: 0.7, tessellation: 16 },
          scene,
        );
        stem.position.y = 0.35;
        stem.parent = root;
        stem.material = mat;
        const screen = MeshBuilder.CreatePlane(
          "station-page-" + resource.id,
          { width: 1.3, height: 0.67 },
          scene,
        );
        screen.position.set(0, 1.22, 0.15);
        screen.rotation.x = 0.12;
        screen.parent = root;
        const ink = new StandardMaterial("station-ink-" + resource.id, scene);
        const texture = new DynamicTexture(
          "station-text-" + resource.id,
          { width: 512, height: 264 },
          scene,
          false,
        );
        const ctx = texture.getContext();
        ctx.fillStyle = "#173d40";
        ctx.fillRect(0, 0, 512, 264);
        ctx.strokeStyle = "#b78c46";
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 500, 252);
        ctx.fillStyle = "#f9d793";
        ctx.font = "bold 27px sans-serif";
        ctx.fillText(
          resource.kind === "reading" ? "FIELD NOTES" : "PRACTICE BENCH",
          20,
          40,
        );
        ctx.font = "bold 32px sans-serif";
        ctx.fillStyle = "#ffffff";
        const words = resource.title.split(" ");
        let line = "",
          y = 93;
        for (const word of words) {
          if (ctx.measureText(line + word).width > 460) {
            ctx.fillText(line, 20, y);
            y += 38;
            line = "";
          }
          if (y > 175) break;
          line += word + " ";
        }
        ctx.fillText(line, 20, y);
        ctx.fillStyle = "#f9d793";
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("OPEN  →", 20, 237);
        texture.update();
        ink.diffuseTexture = texture;
        ink.emissiveColor = new Color3(0.5, 0.5, 0.5);
        ink.backFaceCulling = false;
        screen.material = ink;
        const pages = new StandardMaterial(
          "station-pages-" + resource.id,
          scene,
        );
        pages.diffuseColor = Color3.FromHexString("#fff1ce");
        pages.specularColor = Color3.Black();
        for (const side of [-1, 1]) {
          const book = createSoftBox(
            "station-open-book",
            0.43,
            0.055,
            0.5,
            scene,
          );
          book.parent = root;
          book.position.set(side * 0.22, 0.85, -0.04);
          book.rotation.z = side * 0.07;
          book.material = pages;
        }
        const foot = MeshBuilder.CreateCylinder(
          "station-foot",
          { diameter: 0.48, height: 0.07, tessellation: 24 },
          scene,
        );
        foot.parent = root;
        foot.position.y = 0.04;
        foot.material = mat;
        for (const mesh of root.getChildMeshes())
          mesh.metadata = { resourceId: resource.id };
        root.position.x = (i % 2 === 0 ? -1 : 1) * 3.15;
        root.rotation.y = i % 2 === 0 ? -0.3 : 0.3;
        roots.push(root);
        materials.push(mat, ink, pages);
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
