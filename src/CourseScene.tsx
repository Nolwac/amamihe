import { useEffect, useRef } from "react";
import "@babylonjs/core/Culling/ray";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
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

export type SceneGame = {
  status: string;
  remaining: number;
  budget: number;
  progress: number;
  choice: number | null;
  boost: number;
  reducedMotion: boolean;
};
/** Shared tutor preview and genuine 3D task-driven adventure. */
export default function CourseScene({
  theme,
  outfit = "terracotta",
  game,
  onReady,
  renderHeight = 360,
  onChoose,
}: {
  theme: Theme;
  outfit?: string;
  game?: SceneGame;
  onReady?: () => void;
  renderHeight?: number;
  onChoose?: (index: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ game, onReady, renderHeight, onChoose });
  live.current = { game, onReady, renderHeight, onChoose };
  const resizeLive = useRef<() => void>(() => {});
  useEffect(() => resizeLive.current(), [renderHeight]);
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
      game ? -Math.PI / 2 : -Math.PI / 2 - 0.35,
      game ? 1.38 : 1.13,
      game ? 9 : 14,
      new Vector3(0, game ? 1.5 : 1.8, game ? 2 : 3),
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
    const stoneTile = new Texture("/assets/world/limestone.webp", scene);
    stoneTile.uScale = 2;
    stoneTile.vScale = 2;
    stone.diffuseTexture = stoneTile;
    const floor = material("floor", temple ? "#52625b" : "#dbc7a6");
    if (temple) floor.diffuseTexture = stoneTile;
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
    const movingScenery: Mesh[] = [];
    box("ground", 0, temple ? -3 : -0.18, 5, 28, 0.35, 35, floor);
    if (temple) {
      const water = material("river", "#3b9eaa");
      box("temple-bridge", 0, -0.3, 5, 6, 0.6, 30, stone);
      box("river", 0, -2.65, 5, 28, 0.08, 35, water);
      for (const x of [-6, 6]) {
        for (let z = 0; z < 20; z += 5) {
          box("temple-terrace", x, 0.3, z, 4, 1, 3, stone);
          box("temple-wall", x, 3, z, 3, 5, 2, stone);
          box("lintel", x, 5.6, z, 3.7, 0.4, 2.4, gold);
          for (const side of [-1, 1])
            box(
              "carved-border",
              x + side * 1.3,
              3,
              z - 1.1,
              0.16,
              4.5,
              0.1,
              teal,
            );
          box("waterfall", x - 1.5, -1.3, z + 1.6, 0.7, 3, 0.12, water);
        }
      }
      for (const x of [-2.8, 2.8])
        for (let z = -7; z < 20; z += 3) {
          box("bridge-post", x, 0.7, z, 0.3, 1.3, 0.3, stone);
          box("bridge-rail", x, 1, z + 1.5, 0.15, 0.15, 3, gold);
        }
    }
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
        movingScenery.push(
          box("lane-stripe", 0, 0.095, z, 0.12, 0.02, 1.3, gold),
        );
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
    let actor: TransformNode | undefined;
    let walk:
      | import("@babylonjs/core/Animations/animationGroup").AnimationGroup
      | undefined;
    let idle:
      | import("@babylonjs/core/Animations/animationGroup").AnimationGroup
      | undefined;
    let opponent: TransformNode | undefined;
    let rightArm: TransformNode | undefined;
    const guardian = new TransformNode("temple-guardian", scene);
    guardian.setEnabled(temple && Boolean(game));
    const guardianStone = material("guardian-stone", "#675b51");
    const eye = material("guardian-eyes", "#ffc15c");
    eye.emissiveColor = Color3.FromHexString("#f8a342");
    function orb(
      name: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      mat: StandardMaterial,
    ) {
      const m = MeshBuilder.CreateSphere(
        name,
        { diameter: 1, segments: 8 },
        scene,
      );
      m.position.set(x, y, z);
      m.scaling.set(sx, sy, sz);
      m.material = mat;
      m.parent = guardian;
      return m;
    }
    orb("guardian-torso", 0, 1.6, 0, 1.8, 2, 1, guardianStone);
    orb("guardian-head", 0, 2.8, -0.15, 1.2, 1, 1, guardianStone);
    for (const side of [-1, 1]) {
      orb(
        "guardian-fist",
        side * 1.2,
        1.3,
        -0.4,
        0.65,
        0.8,
        0.6,
        guardianStone,
      );
      orb("guardian-leg", side * 0.5, 0.5, 0, 0.55, 1.1, 0.65, guardianStone);
      orb("guardian-eye", side * 0.25, 2.9, -0.58, 0.17, 0.13, 0.1, eye);
    }
    guardian.position.set(0, 0, -7);
    if (temple)
      for (let z = 5; z < 23; z += 6)
        movingScenery.push(
          box(
            "task-obstacle",
            z % 2 ? 1.4 : -1.4,
            0.35,
            z,
            1.1,
            0.7,
            0.8,
            dark,
          ),
        );
    const runner = box("race-rival", 1.3, 0.45, 8, 0.7, 0.9, 1.2, clay);
    runner.setEnabled(false);
    const gateFill = material("answer-gate-fill", "#33867b");
    gateFill.alpha = 0.12;
    const stationLights = [-1.7, 0, 1.7].map((x, i) => {
      const m = MeshBuilder.CreateTorus(
        "answer-gate-" + i,
        { diameter: 1.4, thickness: 0.08, tessellation: 16 },
        scene,
      );
      m.position.set(x, 1.1, 7);
      m.metadata = { answerIndex: i };
      const surface = MeshBuilder.CreateDisc(
        "answer-gate-surface-" + i,
        { radius: 0.66, tessellation: 16, sideOrientation: Mesh.DOUBLESIDE },
        scene,
      );
      surface.position.copyFrom(m.position);
      surface.material = gateFill;
      surface.metadata = { answerIndex: i };
      surface.setEnabled(Boolean(game));
      m.rotation.x = Math.PI / 2;
      m.material = teal;
      m.setEnabled(Boolean(game));
      return m;
    });
    let down: { x: number; y: number } | undefined;
    const press = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const choose = (event: PointerEvent) => {
      if (
        !down ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8
      )
        return;
      down = undefined;
      if (live.current.game?.status !== "active") return;
      const rect = element.getBoundingClientRect();
      const picked = scene.pick(
        event.clientX - rect.left,
        event.clientY - rect.top,
        (mesh) => Number.isInteger(mesh.metadata?.answerIndex),
        false,
        camera,
      );
      element.dataset.lastGatePick = picked?.pickedMesh?.name || "none";
      const index = picked?.pickedMesh?.metadata?.answerIndex;
      element.dataset.gateChoiceIndex = String(index);
      element.dataset.gateCallback = String(Boolean(live.current.onChoose));
      if (Number.isInteger(index)) live.current.onChoose?.(index);
    };
    element.addEventListener("pointerdown", press);
    element.addEventListener("pointerup", choose);
    const resize = () => {
      engine.setHardwareScalingLevel(
        Math.max(1, element.clientHeight / live.current.renderHeight),
      );
      camera.viewport = new Viewport(
        0,
        0,
        live.current.game && element.clientWidth > 720
          ? Math.max(0.58, (element.clientWidth - 440) / element.clientWidth)
          : 1,
        1,
      );
      engine.resize();
    };
    resizeLive.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    scene.onAfterAnimationsObservable.add(() => {
      const g = live.current.game;
      if (
        rightArm &&
        g?.status === "active" &&
        theme === "wrestling" &&
        !g.reducedMotion
      ) {
        rightArm.rotationQuaternion = null;
        rightArm.rotation.z =
          -0.8 -
          Math.max(0, Math.sin(performance.now() / 200)) *
            Math.max(0.2, g.boost);
      }
    });
    let last = 0;
    engine.runRenderLoop(() => {
      if (disposed || document.hidden || performance.now() - last < 1000 / 15)
        return;
      last = performance.now();
      const g = live.current.game;
      const t = performance.now() / 1000;
      if (g && actor) {
        const moving = g.status === "active" && !g.reducedMotion;
        const targetX = g.choice === null ? 0 : ((g.choice % 3) - 1) * 1.5;
        actor.position.x += (targetX - actor.position.x) * 0.22;
        actor.position.z = theme === "wrestling" ? 2 : 0;
        actor.position.y =
          (theme === "wrestling" ? 0.65 : 0.1) +
          (moving && temple ? Math.abs(Math.sin(t * 5)) * 0.07 : 0);
        if (moving && walk && !walk.isPlaying) {
          idle?.stop();
          walk.start(true, Math.min(2.5, 1 + g.boost));
        }
        if (!moving && idle && !idle.isPlaying) {
          walk?.stop();
          idle.start(true);
        }
        if (walk) walk.speedRatio = 1 + g.boost;
        guardian.position.z =
          g.status === "game-over"
            ? -0.4
            : -6 +
              (g.budget ? (1 - g.remaining / g.budget) * 4 : 0) -
              Math.min(2, g.progress * 2);
        guardian.position.x =
          g.status === "game-over"
            ? 0
            : -2.1 + (moving ? Math.sin(t * 2) * 0.15 : 0);
        for (const m of movingScenery) {
          if (moving) {
            m.position.z -= (1 + g.boost) * 0.16;
            if (m.position.z < -6) m.position.z = 22;
          }
          if (temple) m.position.y = g.boost > 0.2 ? 0.15 : 0.35;
        }
        runner.position.z = 7 - g.progress * 6 - g.boost * 2;
        if (opponent) {
          opponent.position.z =
            theme === "racing"
              ? 7 - g.progress * 6 - g.boost * 2
              : 4.3 + g.progress * 1.2;
          opponent.rotation.z = g.status === "game-over" ? 0 : -g.boost * 0.12;
        }

        stationLights.forEach(
          (m, i) =>
            (m.material =
              g.choice !== null && g.choice % 3 === i ? gold : teal),
        );
        element.dataset.gameStatus = g.status;
        element.dataset.gameProgress = String(g.progress);
        element.dataset.gameBoost = String(g.boost);
      }
      scene.render();
      element.dataset.renderHeight = String(engine.getRenderHeight());
      if (g) {
        const point = Vector3.Project(
          stationLights[0].position,
          Matrix.Identity(),
          scene.getTransformMatrix(),
          camera.viewport.toGlobal(
            engine.getRenderWidth(),
            engine.getRenderHeight(),
          ),
        );
        element.dataset.answerGateA = JSON.stringify({
          x: (point.x / engine.getRenderWidth()) * element.clientWidth,
          y: (point.y / engine.getRenderHeight()) * element.clientHeight,
        });
      }
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
        actor = root;
        root.position.set(0, theme === "wrestling" ? 0.65 : 0.1, 0);
        root.rotation.y = live.current.game ? 0 : Math.PI;
        root.scaling.setAll(1.65);
        const palette: Record<string, string> = {
          terracotta: "#b76b50",
          teal: "#348b82",
          gold: "#ce9f4d",
          azure: "#478ccc",
          plum: "#9964ba",
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
        idle = asset.animationGroups.find((group) => /idle/i.test(group.name));
        walk = asset.animationGroups.find((group) => /walk/i.test(group.name));
        idle?.start(true);
        rightArm = root
          .getChildTransformNodes()
          .find((n) => n.name.includes("RightArm"));
        if (
          (theme === "wrestling" || theme === "racing") &&
          live.current.game
        ) {
          const clone = asset.instantiateModelsToScene(
            (n) => "opponent-" + n,
            true,
            { doNotInstantiate: true },
          );
          opponent = new TransformNode("sparring-opponent", scene);
          clone.rootNodes.forEach((n) => (n.parent = opponent!));
          opponent.position.set(
            theme === "racing" ? 1.3 : 0,
            theme === "racing" ? 0.1 : 0.65,
            4.3,
          );
          if (theme === "wrestling") opponent.rotation.y = Math.PI;
          opponent.scaling.setAll(1.65);
          clone.animationGroups.find((g) => /idle/i.test(g.name))?.start(true);
        }
        element.dataset.avatarReady = "true";
        live.current.onReady?.();
      })
      .catch(() => {
        if (!disposed) element.dataset.assetError = "true";
      });
    return () => {
      disposed = true;
      element.removeEventListener("pointerdown", press);
      element.removeEventListener("pointerup", choose);
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
      aria-label={`3D ${theme.replaceAll("-", " ")} ${game ? "adventure" : "scenery preview"}. Drag to orbit.`}
      tabIndex={0}
    />
  );
}
