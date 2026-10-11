import { useEffect, useState } from "react";
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
export type Billboard = {
  id: string;
  title: string;
  description: string;
  destination: string;
};
export function useBillboards(
  courseId?: string,
  version?: number,
  levelId?: string,
) {
  const [ads, setAds] = useState<Billboard[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setAds([]);
    const load = () => {
      if (document.hidden || (courseId && (!version || !levelId))) return;
      void fetch(
        "/api/billboards" +
          (courseId
            ? `?courseId=${encodeURIComponent(courseId)}&version=${version}&levelId=${encodeURIComponent(levelId || "")}`
            : ""),
        { signal: controller.signal, cache: "no-store" },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then(setAds)
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [courseId, version, levelId]);
  return ads;
}
export function createBillboards(
  scene: Scene,
  ads: () => Billboard[],
  course = false,
) {
  let signature = "",
    root: TransformNode | undefined;
  const clear = () => {
    if (root) {
      for (const mesh of root.getChildMeshes()) {
        const material = mesh.material as StandardMaterial | null;
        material?.diffuseTexture?.dispose();
        material?.dispose();
      }
      root.dispose();
      root = undefined;
    }
  };
  scene.onDisposeObservable.addOnce(clear);
  return () => {
    const visible = ads().slice(0, course ? 2 : 3);
    const key = JSON.stringify(visible);
    if (key === signature) return;
    signature = key;
    clear();
    root = new TransformNode("authorized-billboards", scene);
    visible.forEach((ad, i) => {
      const x = course ? (i ? -4 : 4) : 7.6,
        z = course ? 3 : -4 + i * 5;
      const pole = MeshBuilder.CreateBox(
        "ad-post-" + ad.id,
        { width: 0.15, height: 3, depth: 0.15 },
        scene,
      );
      pole.parent = root!;
      pole.position.set(x, 1.5, z);
      const postMaterial = new StandardMaterial(
        "ad-post-material-" + ad.id,
        scene,
      );
      postMaterial.diffuseColor = Color3.FromHexString("#334344");
      pole.material = postMaterial;
      pole.isPickable = false;
      const plane = MeshBuilder.CreatePlane(
        "authorized-ad-" + ad.id,
        { width: 3.3, height: 1.4 },
        scene,
      );
      plane.parent = root!;
      plane.position.set(x, 3, z);
      plane.isPickable = false;
      const texture = new DynamicTexture(
        "approved-ad-" + ad.id,
        { width: 512, height: 192 },
        scene,
        false,
      );
      const ctx = texture.getContext();
      ctx.fillStyle = "#193d3b";
      ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = "#edd7a4";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("ADVERTISEMENT", 20, 35);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 25px sans-serif";
      ctx.fillText(ad.title.slice(0, 32), 20, 88);
      ctx.font = "18px sans-serif";
      ctx.fillText(ad.description.slice(0, 46), 20, 130);
      texture.update();
      const material = new StandardMaterial(
        "approved-ad-material-" + ad.id,
        scene,
      );
      material.diffuseTexture = texture;
      material.emissiveColor = Color3.White();
      material.disableLighting = true;
      plane.material = material;
    });
    const canvas = scene.getEngine().getRenderingCanvas();
    if (canvas) canvas.dataset.billboardCount = String(visible.length);
  };
}
