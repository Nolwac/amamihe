import type { Scene } from "@babylonjs/core/scene";
import type { Theme } from "../shared/course";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { resourcePath } from "./rendering";

type Obstacle = {
  id: string;
  kind: string;
  lane: number;
  distance: number;
  z: number;
  cleared: boolean;
};

/** Bounded geometry streams ahead of an avatar actually traversing world space. */
export function createCourseEnvironment(scene: Scene, theme: Theme) {
  const temple = theme === "temple-chase";
  const racing = theme === "racing";
  const fighting = theme === "wrestling";
  const material = (name: string, hex: string) => {
    const value = new StandardMaterial(name, scene);
    value.diffuseColor = Color3.FromHexString(hex);
    value.specularColor = Color3.Black();
    return value;
  };
  const stone = material("sandstone", "#b29168");
  const limestone = new Texture(resourcePath("world/limestone.webp"), scene);
  limestone.uScale = 3;
  limestone.vScale = 3;
  stone.diffuseTexture = limestone;
  const teal = material("teal", "#347e76");
  const gold = material("gold", "#efba5f");
  const dark = material("track", "#34404c");
  const clay = material("terracotta", "#bd7359");
  const grass = material("ground", "#668876");
  const water = material("river", "#286d7f");
  water.alpha = 0.8;
  const light = material("warm-lantern", "#ffc06b");
  light.emissiveColor = Color3.FromHexString("#d98735");
  const leaf = material("jungle", "#285852");
  const beam = material("workshop-energy", "#7cddd0");
  beam.emissiveColor = Color3.FromHexString("#257c70");

  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    mat: StandardMaterial,
    parent?: TransformNode,
  ) {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.parent = parent ?? null;
    mesh.isPickable = false;
    return mesh;
  }

  const chunks: TransformNode[] = [];
  const animated: {
    node: TransformNode;
    kind: "flame" | "machine" | "water";
    offset: number;
  }[] = [];
  if (fighting) {
    box("arena-floor", 0, -0.25, 4, 24, 0.3, 24, dark);
    box("sparring-ring", 0, 0.25, 4, 8, 0.5, 8, teal);
    const center = MeshBuilder.CreateDisc(
      "ring-emblem",
      { radius: 1.7, tessellation: 24 },
      scene,
    );
    center.rotation.x = Math.PI / 2;
    center.position.set(0, 0.51, 4);
    center.material = gold;
    for (const x of [-4, 4])
      for (const z of [0, 8])
        box("ring-post", x, 1.7, z, 0.25, 2.4, 0.25, gold);
    for (const y of [1.1, 1.7, 2.3]) {
      for (const x of [-4, 4]) box("ring-rope", x, y, 4, 0.06, 0.06, 8, clay);
      for (const z of [0, 8]) box("ring-rope", 0, y, z, 8, 0.06, 0.06, clay);
    }
    for (const x of [-8, 8])
      for (let z = 0; z <= 12; z += 4) {
        box("arena-seat", x, 0.5, z, 3, 0.7, 2, stone);
        box("arena-lantern-post", x, 3, z, 0.2, 5, 0.2, dark);
        box("arena-lantern", x, 5.5, z, 0.8, 0.3, 0.8, light);
      }
  } else
    for (let i = 0; i < 5; i++) {
      const chunk = new TransformNode(`world-section-${i}`, scene);
      chunk.position.z = i * 18 - 18;
      chunks.push(chunk);
      box(
        "terrain",
        0,
        temple ? -2 : -0.2,
        9,
        30,
        0.3,
        18,
        temple ? water : grass,
        chunk,
      );
      box(
        "traversed-path",
        0,
        -0.08,
        9,
        6,
        0.16,
        18,
        racing ? dark : stone,
        chunk,
      );
      for (const x of [-3.2, 3.2]) {
        if (temple) {
          box("bridge-edge", x, 0.5, 9, 0.18, 1, 18, stone, chunk);
          box("bridge-edge-gold", x, 1.02, 9, 0.22, 0.12, 18, gold, chunk);
        }
        for (let z = 2; z < 18; z += 6) {
          if (racing) {
            box(
              "track-barrier",
              x,
              0.5,
              z,
              0.35,
              0.9,
              3.4,
              i % 2 ? teal : clay,
              chunk,
            );
            box(
              "track-lamp",
              x + Math.sign(x) * 0.5,
              2.4,
              z,
              0.13,
              4.5,
              0.13,
              dark,
              chunk,
            );
            box(
              "track-light",
              x + Math.sign(x) * 0.5,
              4.7,
              z,
              0.7,
              0.18,
              0.5,
              light,
              chunk,
            );
          } else if (temple) {
            const side = Math.sign(x);
            box("temple-column", side * 4.5, 2.5, z, 1, 5, 1, stone, chunk);
            box("carved-capital", side * 4.5, 5, z, 1.5, 0.4, 1.4, gold, chunk);
            // Ruined outward cornices preserve the open camera corridor.
            box("temple-cornice", side * 6.2, 5.3, z, 4, 0.45, 1, stone, chunk);
            box("temple-wall", side * 7, 2, z + 2, 2.5, 4, 4, stone, chunk);
            box(
              "jungle-trunk",
              side * 10,
              1.8,
              z + 3,
              0.6,
              5,
              0.6,
              dark,
              chunk,
            );
            const crown = MeshBuilder.CreateSphere(
              "jungle-crown",
              { diameter: 4, segments: 6 },
              scene,
            );
            crown.parent = chunk;
            crown.position.set(side * 10, 4.8, z + 3);
            crown.material = leaf;
            const flame = box(
              "temple-torch",
              side * 4.0,
              2.4,
              z - 0.4,
              0.25,
              0.45,
              0.25,
              light,
              chunk,
            );
            animated.push({ node: flame, kind: "flame", offset: i + z });
            const fall = box(
              "waterfall",
              side * 6.1,
              -0.3,
              z + 3,
              0.6,
              4,
              0.14,
              water,
              chunk,
            );
            animated.push({ node: fall, kind: "water", offset: z });
          } else {
            const side = Math.sign(x);
            box("workshop-floor", side * 5.8, 0, z, 4, 0.18, 5, stone, chunk);
            box(
              "interactive-workbench",
              side * 4.4,
              1.05,
              z,
              1.6,
              0.2,
              1.2,
              clay,
              chunk,
            );
            box("workbench-leg", side * 4.4, 0.5, z, 0.25, 1, 0.3, dark, chunk);
            box(
              "terminal-frame",
              side * 4.8,
              1.9,
              z + 0.5,
              1.2,
              0.9,
              0.15,
              dark,
              chunk,
            );
            box(
              "terminal-screen",
              side * 4.8,
              1.9,
              z + 0.4,
              1,
              0.7,
              0.03,
              beam,
              chunk,
            );
            const machine = box(
              "training-machine",
              side * 6.2,
              1.8,
              z + 1,
              1.1,
              1.1,
              1.1,
              teal,
              chunk,
            );
            animated.push({ node: machine, kind: "machine", offset: i + z });
            box(
              "workshop-support",
              side * 8,
              2.3,
              z,
              0.4,
              4.6,
              0.4,
              teal,
              chunk,
            );
            box("workshop-roof", side * 5.8, 4.6, z, 5, 0.25, 5, stone, chunk);
          }
        }
      }
      if (racing)
        for (const x of [-1, 1])
          for (let z = 0; z < 18; z += 3)
            box("track-lane-marker", x, 0.012, z, 0.08, 0.02, 1.4, gold, chunk);
      else
        for (let z = 0; z < 18; z += 3)
          box("path-inlay", 0, 0.015, z, 5.5, 0.025, 0.16, teal, chunk);
    }

  // Merge fixed geometry by material within each recyclable section. Moving
  // torches, waterfalls and training machines retain independent transforms.
  const movingNodes = new Set(animated.map((value) => value.node));
  for (const chunk of chunks) {
    const sectionZ = chunk.position.z;
    chunk.position.z = 0;
    chunk.computeWorldMatrix(true);
    const materials = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of chunk.getChildMeshes()) {
      if (
        !(mesh instanceof Mesh) ||
        movingNodes.has(mesh) ||
        !(mesh.material instanceof StandardMaterial)
      )
        continue;
      mesh.computeWorldMatrix(true);
      const group = materials.get(mesh.material) ?? [];
      group.push(mesh);
      materials.set(mesh.material, group);
    }
    for (const [mat, meshes] of materials) {
      if (meshes.length < 2) continue;
      const merged = Mesh.MergeMeshes(meshes, true, true);
      if (merged) {
        merged.name = `${chunk.name}-${mat.name}`;
        merged.parent = chunk;
        merged.isPickable = false;
      }
    }
    chunk.position.z = sectionZ;
  }

  const obstacles = new Map<string, TransformNode>();
  const clearedMaterial = material("cleared-obstacle", "#7ca697");
  const products: Mesh[] = [];
  const spark = MeshBuilder.CreateSphere(
    "task-hit-spark",
    { diameter: 0.3, segments: 6 },
    scene,
  );
  spark.material = light;
  spark.setEnabled(false);
  const finish = new TransformNode("learning-checkpoint", scene);
  for (const x of [-3.3, 3.3])
    box("checkpoint-post", x, 3, 0, 0.25, 6, 0.25, gold, finish);
  box("checkpoint-banner", 0, 6, 0, 6.8, 0.65, 0.25, teal, finish);
  finish.setEnabled(!fighting);
  function synchronizeObstacles(values: Obstacle[], distance: number) {
    const ids = new Set(
      values
        .filter((value) => value.z > -5 && value.z < 48)
        .map((value) => value.id),
    );
    for (const [id, root] of obstacles)
      if (!ids.has(id)) {
        root.dispose();
        obstacles.delete(id);
      }
    for (const obstacle of values) {
      if (!ids.has(obstacle.id)) continue;
      let root = obstacles.get(obstacle.id);
      if (!root) {
        root = new TransformNode(`hazard-${obstacle.id}`, scene);
        root.metadata = {
          id: obstacle.id,
          kind: obstacle.kind,
          lane: obstacle.lane,
        };
        if (obstacle.kind === "arch") {
          box("low-arch-post", -0.68, 1.4, 0, 0.18, 2.8, 0.4, stone, root);
          box("low-arch-post", 0.68, 1.4, 0, 0.18, 2.8, 0.4, stone, root);
          box("low-arch-contact", 0, 2.4, 0, 1.5, 0.75, 0.65, clay, root);
        } else if (obstacle.kind === "block") {
          box("fallen-stone-collider", 0, 1.2, 0, 1.4, 2.4, 1.1, stone, root);
          box(
            "fallen-stone-inlay",
            0,
            1.2,
            -0.56,
            1.15,
            0.18,
            0.04,
            gold,
            root,
          );
        } else {
          box("hurdle-collider", 0, 0.45, 0, 1.45, 0.9, 0.65, clay, root);
          box("hurdle-inlay", 0, 0.75, -0.34, 1.5, 0.12, 0.05, gold, root);
        }
        obstacles.set(obstacle.id, root);
      }
      root.position.set(obstacle.lane * 1.6, 0, distance + obstacle.z);
      root.metadata = { ...root.metadata, cleared: obstacle.cleared };
      for (const child of root.getChildMeshes())
        if (obstacle.cleared) child.material = clearedMaterial;
    }
  }
  return {
    update(
      distance: number,
      time: number,
      active: boolean,
      values: Obstacle[],
      progress: number,
      taskPulse: number,
    ) {
      for (const chunk of chunks) {
        while (chunk.position.z + 18 < distance - 12)
          chunk.position.z += chunks.length * 18;
        while (chunk.position.z > distance + 75)
          chunk.position.z -= chunks.length * 18;
      }
      if (active)
        for (const value of animated) {
          if (value.kind === "flame")
            value.node.scaling.y =
              0.8 + Math.sin(time * 8 + value.offset) * 0.2;
          if (value.kind === "machine") {
            value.node.rotation.y = time * 0.5 + value.offset;
            value.node.position.y =
              1.8 + Math.sin(time * 1.5 + value.offset) * 0.12;
          }
          if (value.kind === "water")
            value.node.scaling.y =
              0.92 + Math.sin(time * 2 + value.offset) * 0.08;
        }
      synchronizeObstacles(values, distance);
      finish.position.z = distance + 16 - progress * 9;
      if (theme === "workshop") {
        const productIndex = Math.min(4, Math.floor(progress * 4));
        while (products.length < productIndex) {
          const block = box(
            "completed-model-module",
            0,
            0.25,
            0,
            0.45,
            0.45,
            0.45,
            gold,
          );
          products.push(block);
        }
        products.forEach((product, i) =>
          product.position.set(-2.5, 0.5 + i * 0.5, distance + 2),
        );
      }
      spark.setEnabled(taskPulse > 0.05);
      spark.position.set(
        fighting ? 0 : 1.3,
        fighting ? 2.1 : 1.2,
        fighting ? 3.35 : distance + 0.7,
      );
      spark.scaling.setAll(0.5 + taskPulse * 2);
    },
    snapshot() {
      return [...obstacles.entries()].map(([id, root]) => {
        root.computeWorldMatrix(true);
        const bounds = root.getChildMeshes().map((mesh) => {
          mesh.computeWorldMatrix(true);
          const box = mesh.getBoundingInfo().boundingBox;
          return {
            min: box.minimumWorld.asArray(),
            max: box.maximumWorld.asArray(),
          };
        });
        return {
          id,
          kind: root.metadata.kind,
          lane: root.metadata.lane,
          cleared: root.metadata.cleared,
          position: root.position.asArray(),
          colliders: bounds,
        };
      });
    },
  };
}

/** Articulated, non-graphic pursuer. Legs, elbows, jaw and eyes animate. */
export function createGuardian(scene: Scene) {
  const root = new TransformNode("temple-guardian", scene);
  const stone = new StandardMaterial("guardian-stone", scene);
  stone.diffuseColor = Color3.FromHexString("#616a60");
  stone.specularColor = Color3.Black();
  const glow = new StandardMaterial("guardian-glow", scene);
  glow.diffuseColor = Color3.FromHexString("#ffbd67");
  glow.emissiveColor = Color3.FromHexString("#f28135");
  const shadow = new StandardMaterial("guardian-shadow", scene);
  shadow.diffuseColor = Color3.FromHexString("#273c37");
  const sphere = (
    name: string,
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat = stone,
  ) => {
    const mesh = MeshBuilder.CreateSphere(
      name,
      { diameter: 1, segments: 6 },
      scene,
    );
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  };
  sphere("guardian-chest", root, 0, 2, 0, 1.7, 1.9, 1.1);
  sphere("guardian-shoulder", root, 0, 2.65, 0, 2.3, 0.65, 1);
  sphere("guardian-head", root, 0, 3.2, 0.05, 1.05, 1.05, 0.95);
  const jaw = sphere(
    "guardian-jaw",
    root,
    0,
    2.9,
    0.43,
    0.9,
    0.35,
    0.65,
    shadow,
  );
  for (const side of [-1, 1]) {
    sphere(
      "guardian-eye",
      root,
      side * 0.25,
      3.35,
      0.49,
      0.18,
      0.13,
      0.12,
      glow,
    );
    const horn = MeshBuilder.CreateCylinder(
      "guardian-horn",
      { diameterTop: 0, diameterBottom: 0.28, height: 0.65, tessellation: 5 },
      scene,
    );
    horn.parent = root;
    horn.position.set(side * 0.5, 3.8, 0);
    horn.rotation.z = side * 0.35;
    horn.material = stone;
  }
  const arms = [-1, 1].map((side) => {
    const arm = new TransformNode(`guardian-arm-${side}`, scene);
    arm.parent = root;
    arm.position.set(side * 1.05, 2.6, 0);
    sphere("guardian-upper-arm", arm, 0, -0.55, 0, 0.65, 1.15, 0.7);
    const forearm = new TransformNode(`guardian-elbow-${side}`, scene);
    forearm.parent = arm;
    forearm.position.set(0, -1.05, 0);
    sphere("guardian-forearm", forearm, 0, -0.5, 0, 0.75, 1.05, 0.7);
    sphere("guardian-fist", forearm, 0, -1, 0.1, 0.85, 0.7, 0.9);
    return { arm, forearm, side };
  });
  const legs = [-1, 1].map((side) => {
    const leg = new TransformNode(`guardian-leg-${side}`, scene);
    leg.parent = root;
    leg.position.set(side * 0.5, 1.3, 0);
    sphere("guardian-thigh", leg, 0, -0.4, 0, 0.75, 0.9, 0.8);
    const shin = new TransformNode(`guardian-knee-${side}`, scene);
    shin.parent = leg;
    shin.position.set(0, -0.8, 0);
    sphere("guardian-shin", shin, 0, -0.4, 0, 0.65, 0.8, 0.7);
    sphere("guardian-foot", shin, 0, -0.72, 0.15, 0.75, 0.3, 1.1);
    return { leg, shin, side };
  });
  return {
    root,
    update(
      time: number,
      gap: number,
      distance: number,
      playerX: number,
      active: boolean,
      caught: boolean,
      reducedMotion: boolean,
    ) {
      root.position.set(
        playerX,
        active && !reducedMotion ? Math.abs(Math.sin(time * 6)) * 0.1 : 0,
        distance - (caught ? 0.8 : gap),
      );
      if (!active && !caught) return;
      for (const value of legs) {
        const stride = Math.sin(
          time * (reducedMotion ? 3 : 7) + (value.side < 0 ? Math.PI : 0),
        );
        value.leg.rotation.x = stride * 0.65;
        value.shin.rotation.x = Math.max(0, -stride) * 0.85;
      }
      for (const value of arms) {
        value.arm.rotation.x = caught
          ? -1.5
          : -Math.sin(time * 7 + (value.side < 0 ? 0 : Math.PI)) * 0.55;
        value.arm.rotation.z = value.side * 0.12;
        value.forearm.rotation.x = caught ? -0.2 : -0.5;
      }
      jaw.position.y = 2.9 + (caught ? -0.08 : Math.sin(time * 3) * 0.035);
    },
    snapshot: () => ({
      position: root.position.asArray(),
      legs: legs.map((value) => value.leg.rotation.asArray()),
      arms: arms.map((value) => value.arm.rotation.asArray()),
    }),
  };
}
