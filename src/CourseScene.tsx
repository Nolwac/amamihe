import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_ior";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular";
import type { Theme } from "../shared/course";

/** A bounded, genuine 3D preset preview; action mechanics are a later milestone. */
export default function CourseScene({
  theme,
  outfit = "terracotta",
}: {
  theme: Theme;
  outfit?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!;
    let disposed = false;
    const engine = new Engine(element, false, {
      preserveDrawingBuffer: false,
      stencil: false,
      powerPreference: "low-power",
    });
    const scene = new Scene(engine);
    const temple = theme === "temple-chase";
    scene.clearColor = Color4.FromHexString(temple ? "#162d32ff" : "#aec5c7ff");
    const camera = new ArcRotateCamera(
      "preview-camera",
      -Math.PI / 2 - 0.35,
      1.13,
      14,
      new Vector3(0, 1.8, 3),
      scene,
    );
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 20;
    camera.attachControl(element, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    new HemisphericLight("sky", new Vector3(0.3, 1, -0.4), scene).intensity =
      1.1;
    function material(name: string, hex: string) {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black();
      return m;
    }
    const stone = material("sandstone", "#b99167");
    const floor = material("floor", temple ? "#52625b" : "#dbc7a6");
    const gold = material("gold", "#e9b85e");
    const teal = material("teal", "#33867b");
    const dark = material("dark", "#283c46");
    const clay = material("clay", "#ba7158");
    function box(
      name: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      mat = stone,
    ) {
      const mesh = MeshBuilder.CreateBox(
        name,
        { width: w, height: h, depth: d },
        scene,
      );
      mesh.position.set(x, y, z);
      mesh.material = mat;
      return mesh;
    }
    box("ground", 0, -0.18, 5, 28, 0.35, 35, floor);
    box("path", 0, 0.03, 5, 5, 0.1, 26, theme === "racing" ? dark : stone);
    if (theme === "wrestling") {
      box("ring", 0, 0.35, 4, 8, 0.6, 8, teal);
      for (const x of [-4, 4])
        for (const z of [0, 8]) box("post", x, 1.3, z, 0.2, 2.1, 0.2, gold);
      for (const y of [0.9, 1.5, 2.1]) {
        for (const x of [-4, 4]) box("rope", x, y, 4, 0.08, 0.08, 8, clay);
        for (const z of [0, 8]) box("rope", 0, y, z, 8, 0.08, 0.08, clay);
      }
    } else if (theme === "racing") {
      for (let z = -6; z < 19; z += 3)
        box("lane-stripe", 0, 0.095, z, 0.12, 0.02, 1.3, gold);
      for (const x of [-3.3, 3.3])
        for (let z = -3; z < 20; z += 4)
          box("barrier", x, 0.65, z, 0.3, 0.9, 2.5, z % 8 ? clay : teal);
      box("finish-banner", 0, 5.2, 15, 7, 0.9, 0.3, teal);
      for (const x of [-3.5, 3.5])
        box("finish-post", x, 2.6, 15, 0.2, 5.2, 0.2, gold);
    } else {
      for (let z = 1; z <= 17; z += 5) {
        for (const x of [-3.8, 3.8]) {
          box("column", x, 2.2, z, 0.8, 4.4, 0.8, temple ? stone : teal);
          box("capital", x, 4.35, z, 1.2, 0.25, 1.2, gold);
        }
        if (temple) box("arch", 0, 4.8, z, 8.8, 0.6, 1, stone);
      }
      if (!temple) {
        for (const x of [-5.8, 5.8])
          for (const z of [3, 9, 15]) {
            box("workbench", x, 1, z, 2.6, 0.2, 1.5, stone);
            box("terminal", x, 1.65, z + 0.1, 1.25, 1, 0.15, dark);
            box("screen", x, 1.65, z, 1.05, 0.8, 0.03, teal);
          }
      }
    }
    const goal = MeshBuilder.CreateTorus(
      "checkpoint",
      { diameter: 2.5, thickness: 0.13, tessellation: 24 },
      scene,
    );
    goal.position.set(0, 1.8, 12);
    goal.rotation.x = Math.PI / 2;
    goal.material = gold;
    const resize = () => {
      engine.setHardwareScalingLevel(Math.max(1, element.clientHeight / 360));
      engine.resize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let last = 0;
    engine.runRenderLoop(() => {
      if (disposed || document.hidden || performance.now() - last < 1000 / 15)
        return;
      last = performance.now();
      scene.render();
      element.dataset.sceneReady = "true";
    });
    const avatarLoad = LoadAssetContainerAsync(
      "/assets/explorer-low.glb",
      scene,
    )
      .then((asset) => {
        if (disposed) {
          asset.dispose();
          return;
        }
        asset.addAllToScene();
        const root = new TransformNode("course-explorer", scene);
        asset.rootNodes.forEach((node) => {
          node.parent = root;
        });
        root.position.set(0, theme === "wrestling" ? 0.65 : 0.1, 0);
        root.rotation.y = Math.PI;
        root.scaling.setAll(1.65);
        const palette: Record<string, string> = {
          terracotta: "#b76b50",
          teal: "#348b82",
          gold: "#ce9f4d",
        };
        const converted = new Map<PBRMaterial, StandardMaterial>();
        for (const mesh of root.getChildMeshes()) {
          if (mesh instanceof Mesh && mesh.skeleton)
            mesh.computeBonesUsingShaders = false;
          if (mesh.material instanceof PBRMaterial) {
            const original = mesh.material;
            let simple = converted.get(original);
            if (!simple) {
              simple = new StandardMaterial(original.name + "-preview", scene);
              simple.diffuseColor = original.name.includes("Explorer_Jacket")
                ? Color3.FromHexString(palette[outfit] || palette.terracotta)
                : original.albedoColor.clone();
              simple.diffuseTexture = original.albedoTexture;
              simple.specularColor = Color3.Black();
              converted.set(original, simple);
            }
            mesh.material = simple;
          }
        }
        asset.animationGroups
          .find((group) => /idle/i.test(group.name))
          ?.start(true);
        element.dataset.avatarReady = "true";
      })
      .catch(() => {
        if (!disposed) element.dataset.assetError = "true";
      });
    return () => {
      disposed = true;
      observer.disconnect();
      engine.stopRenderLoop();
      camera.detachControl();
      // Shader preparation can outlive the mounted canvas. Let pending asset and
      // material work settle before releasing the pipeline it still references.
      const release = () => {
        scene.dispose();
        engine.dispose();
      };
      scene.onReadyTimeoutDuration = 15000;
      scene.onReadyTimeoutObservable.addOnce(release);
      void avatarLoad.then(() => scene.whenReadyAsync()).then(release, release);
    };
  }, [theme, outfit]);
  return (
    <canvas
      ref={canvas}
      className="course-scene"
      data-course-theme={theme}
      aria-label={`3D ${theme.replaceAll("-", " ")} scenery preview. Drag to orbit.`}
      tabIndex={0}
    />
  );
}
