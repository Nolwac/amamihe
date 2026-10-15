import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createSoftBox } from "./softGeometry";

/** Authored scenery uses a handful of merged material batches, including on phones. */
export function createWorldChallengeArt(
  scene: Scene,
  root: TransformNode,
  kind: "fraction-bridge" | "circuit",
  bridgeLength = 6.4,
) {
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const batches = new Map<StandardMaterial, Mesh[]>();
  const material = (name: string, color: string, shine = 0) => {
    const value = new StandardMaterial(`mission-art-${name}`, scene);
    value.diffuseColor = Color3.FromHexString(color);
    value.specularColor = new Color3(shine, shine, shine);
    value.specularPower = 48;
    materials.push(value);
    return value;
  };
  const limestone = material("limestone", "#d8c7a3"),
    paleStone = material("cut-stone", "#eddfbd"),
    shadowStone = material("stone-shade", "#a79273"),
    slate = material("slate", "#405b5b"),
    sand = material("sand", "#d0b891"),
    wood = material("timber", "#ad7547"),
    deck = material("deck", "#ceaa6c"),
    teal = material("enamel", "#2d7a79", 0.12),
    darkTeal = material("deep-enamel", "#244f51", 0.08),
    brass = material("brass", "#d3ab5f", 0.3),
    rope = material("rope", "#d9c49a"),
    leaf = material("leaves", "#598d63"),
    leafLight = material("sunlit-leaves", "#86a26a"),
    water = material("water", "#318e9b", 0.3),
    foam = material("foam", "#b2e2db", 0.08),
    glass = material("glass", "#65c6c0", 0.3),
    warmLight = material("lantern", "#ffe4a0", 0.2);
  glass.emissiveColor = Color3.FromHexString("#204948");
  warmLight.emissiveColor = Color3.FromHexString("#59411d");

  const pattern = (
    name: string,
    base: string,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) => {
    const texture = new DynamicTexture(name, 256, scene, false);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    draw(ctx);
    texture.update(false);
    textures.push(texture);
    return texture;
  };
  const stoneTexture = pattern("mission-limestone-grain", "#eee5cf", (ctx) => {
    for (let i = 0; i < 420; i++) {
      const x = (i * 73.13) % 256,
        y = (i * 41.91) % 256;
      ctx.fillStyle = i % 3 ? "#d5c9b180" : "#fff7e33d";
      ctx.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
    }
    ctx.strokeStyle = "#b4a48a45";
    ctx.lineWidth = 2;
    for (const y of [64, 192]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    for (const [x, y] of [
      [78, 0],
      [197, 64],
      [78, 192],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 64);
      ctx.stroke();
    }
  });
  limestone.diffuseTexture = stoneTexture;
  paleStone.diffuseTexture = stoneTexture;
  shadowStone.diffuseTexture = stoneTexture;
  const timberTexture = pattern("mission-timber-grain", "#f3d7a4", (ctx) => {
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = i % 3 ? "#88603728" : "#fff4ce6e";
      ctx.lineWidth = 1 + (i % 2);
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 8) {
        const y = i * 9 + Math.sin(x * 0.045 + i) * 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#80613b60";
    ctx.lineWidth = 3;
    for (const y of [1, 128, 255]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  });
  wood.diffuseTexture = timberTexture;
  deck.diffuseTexture = timberTexture;
  const waterTexture = pattern("mission-water-current", "#88c6c1", (ctx) => {
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = i % 3 ? "#d7f6e525" : "#e1fff76e";
      ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath();
      for (let x = -10; x < 270; x += 8) {
        const y = i * 17 + Math.sin(x * 0.025 + i * 2) * 5;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  waterTexture.uScale = 3;
  waterTexture.vScale = 5;
  water.diffuseTexture = waterTexture;
  const keep = (mesh: Mesh, mat: StandardMaterial) => {
    mesh.parent = root;
    mesh.material = mat;
    mesh.isPickable = false;
    const group = batches.get(mat) || [];
    group.push(mesh);
    batches.set(mat, group);
    return mesh;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
  ) => {
    const mesh = keep(createSoftBox(name, w, h, d, scene), mat);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const round = (
    name: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    height: number,
    mat: StandardMaterial,
    top = diameter,
  ) => {
    const mesh = keep(
      MeshBuilder.CreateCylinder(
        name,
        {
          height,
          diameterBottom: diameter,
          diameterTop: top,
          tessellation: 20,
        },
        scene,
      ),
      mat,
    );
    mesh.position.set(x, y, z);
    return mesh;
  };
  const ellipsoid = (
    name: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    mat: StandardMaterial,
  ) => {
    const mesh = keep(
      MeshBuilder.CreateSphere(name, { diameter: 1, segments: 12 }, scene),
      mat,
    );
    mesh.position.set(x, y, z);
    mesh.scaling.set(sx, sy, sz);
    return mesh;
  };
  const cable = (
    name: string,
    points: Vector3[],
    mat: StandardMaterial,
    radius = 0.045,
  ) =>
    keep(
      MeshBuilder.CreateTube(
        name,
        { path: points, radius, tessellation: 8 },
        scene,
      ),
      mat,
    );
  const stonePlanter = (x: number, z: number, scale = 1) => {
    round(
      "terracotta-planter",
      x,
      0.23 * scale,
      z,
      0.62 * scale,
      0.46 * scale,
      shadowStone,
      0.85 * scale,
    );
    round(
      "planter-rim",
      x,
      0.48 * scale,
      z,
      0.89 * scale,
      0.09 * scale,
      paleStone,
    );
    round(
      "planter-earth",
      x,
      0.52 * scale,
      z,
      0.71 * scale,
      0.04 * scale,
      wood,
    );
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const foliage = ellipsoid(
        "planter-leaf",
        x + Math.cos(angle) * 0.18 * scale,
        0.82 * scale,
        z + Math.sin(angle) * 0.18 * scale,
        0.23 * scale,
        0.9 * scale,
        0.19 * scale,
        i % 2 ? leaf : leafLight,
      );
      foliage.rotation.z = Math.sin(angle) * 0.4;
      foliage.rotation.x = Math.cos(angle) * 0.4;
    }
  };
  const tree = (x: number, z: number, scale: number) => {
    round(
      "river-tree-trunk",
      x,
      1.05 * scale,
      z,
      0.24 * scale,
      2.1 * scale,
      wood,
      0.16 * scale,
    );
    for (let i = 0; i < 4; i++)
      ellipsoid(
        "river-tree-crown",
        x + Math.sin(i * 2.1) * 0.38 * scale,
        (2.1 + (i % 2) * 0.42) * scale,
        z + Math.cos(i * 2.1) * 0.34 * scale,
        1.4 * scale,
        1.25 * scale,
        1.35 * scale,
        i % 2 ? leaf : leafLight,
      );
  };
  const bollard = (x: number, z: number, baseY = 0.22) => {
    round("harbor-bollard-foot", x, baseY + 0.08, z, 0.32, 0.15, darkTeal);
    round("harbor-bollard", x, baseY + 0.32, z, 0.16, 0.48, brass);
    box("harbor-bollard-cap", x, baseY + 0.58, z, 0.42, 0.11, 0.17, darkTeal);
  };
  const fence = (x1: number, x2: number, z: number, y: number) => {
    for (let i = 0; i <= 4; i++) {
      const x = x1 + ((x2 - x1) * i) / 4;
      round("riverside-fence-post", x, y + 0.5, z, 0.13, 1, darkTeal);
      round("riverside-fence-finial", x, y + 1.02, z, 0.2, 0.09, brass);
    }
    for (const railY of [y + 0.45, y + 0.86])
      cable(
        "riverside-rope-rail",
        [new Vector3(x1, railY, z), new Vector3(x2, railY - 0.08, z)],
        rope,
        0.035,
      );
  };
  const lantern = (x: number, y: number, z: number) => {
    round("lantern-foot", x, y, z, 0.3, 0.12, darkTeal);
    round("lantern-glass", x, y + 0.25, z, 0.2, 0.4, warmLight);
    round("lantern-roof", x, y + 0.5, z, 0.42, 0.16, darkTeal, 0.05);
    for (const dx of [-0.105, 0.105])
      for (const dz of [-0.105, 0.105])
        box(
          "lantern-corner",
          x + dx,
          y + 0.25,
          z + dz,
          0.035,
          0.47,
          0.035,
          brass,
        );
  };

  // A real ground silhouette, rather than a beige plane ending at the horizon.
  box("mission-land-mass", 0, -0.8, 4, 28, 1.2, 28, shadowStone);
  box("mission-front-apron", 0, -0.04, -1.9, 20, 0.22, 7.5, sand);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 9; column++)
      box(
        "apron-cut-stone",
        -5.6 + column * 1.4 + (row % 2) * 0.3,
        0.075,
        -3.5 + row * 0.9,
        1.32,
        0.035,
        0.82,
        (row + column) % 3 ? limestone : paleStone,
      );

  if (kind === "fraction-bridge") {
    const start = -3.2,
      end = start + bridgeLength;
    // Water extends past both ends of the gorge; its lower bank walls remain visible.
    box("river-bed", 0, -0.3, 7.4, 16, 0.18, 19, slate);
    box("river-flowing-surface", 0, -0.14, 7.4, 15.8, 0.06, 19, water);
    for (let i = 0; i < 5; i++) {
      const x = start + (bridgeLength * (i + 0.5)) / 5;
      cable(
        "river-current-highlight",
        Array.from(
          { length: 7 },
          (_, step) =>
            new Vector3(
              x + Math.sin(step * 1.3 + i) * 0.11,
              -0.1,
              6.7 + i * 0.4 + step * 0.6,
            ),
        ),
        foam,
        0.017,
      );
    }
    for (const [x, width] of [
      [start - 3.8, 7.5],
      [end + 3.8, 7.5],
    ]) {
      box("river-bank-limestone", x, 0.13, 5.3, width, 0.7, 15, limestone);
      box(
        "river-bank-cut-cap",
        x,
        0.51,
        5.3,
        width + 0.18,
        0.12,
        15,
        paleStone,
      );
      box(
        "river-bank-weathered-course",
        x,
        -0.1,
        5.3,
        width + 0.25,
        0.2,
        15,
        shadowStone,
      );
    }
    // Front apron ends at the launch dock instead of spanning the river.
    box("launch-platform", 0, 0.17, 0.35, 8.8, 0.34, 2.45, deck);
    for (let i = 0; i < 12; i++)
      box(
        "launch-platform-plank-joint",
        -4.2 + i * 0.76,
        0.35,
        0.35,
        0.025,
        0.015,
        2.3,
        wood,
      );
    for (const x of [-4.1, 4.1]) {
      bollard(x, 1.25, 0.34);
      round("dock-pile", x, -0.06, 1.25, 0.23, 1.6, wood);
    }
    for (const x of [start - 0.21, end + 0.21]) {
      for (const z of [3.55, 5.45]) {
        box("bridge-abutment-pier", x, 0.14, z, 0.48, 1.1, 0.55, shadowStone);
        box("bridge-abutment-cap", x, 0.7, z, 0.62, 0.2, 0.68, paleStone);
        round("bridge-abutment-bolt", x, 0.84, z, 0.12, 0.035, brass);
      }
      box("bridge-end-header", x, 0.48, 4.5, 0.28, 0.28, 2.2, wood);
    }
    for (const z of [3.76, 5.24]) {
      cable(
        "bridge-support-cable",
        [
          new Vector3(start - 0.4, 0.61, z),
          new Vector3((start + end) / 2, 0.45, z),
          new Vector3(end + 0.4, 0.61, z),
        ],
        darkTeal,
        0.055,
      );
    }
    // The measuring rail is deliberately continuous: eight equal intervals per whole span.
    box("brass-survey-rule", 0, 0.57, 6.04, 6.65, 0.13, 0.28, darkTeal);
    for (let i = 0; i <= 8; i++) {
      box(
        "survey-major-tick",
        start + i * 0.8,
        0.66,
        6.04,
        0.055,
        0.08,
        i % 2 ? 0.16 : 0.26,
        brass,
      );
      if (i < 8)
        box(
          "survey-minor-tick",
          start + i * 0.8 + 0.4,
          0.65,
          6.04,
          0.025,
          0.04,
          0.12,
          paleStone,
        );
    }
    // Shoreline rocks and reeds follow the water edge, leaving the task silhouette clear.
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? end + 0.15 : start - 0.15;
      const z = 7.1 + Math.floor(i / 2) * 1.15;
      const rock = ellipsoid(
        "river-edge-rock",
        side,
        0.23,
        z,
        0.65 + (i % 3) * 0.16,
        0.52,
        0.8,
        i % 3 ? shadowStone : paleStone,
      );
      rock.rotation.z = (i % 3) * 0.17;
      if (i % 3 === 0)
        for (let reed = 0; reed < 3; reed++)
          round(
            "river-edge-reed",
            side + Math.sin(reed * 2) * 0.2,
            0.68,
            z + Math.cos(reed * 2) * 0.2,
            0.045,
            0.85 + reed * 0.12,
            leaf,
            0.015,
          );
    }
    fence(start - 5.2, start - 0.7, 9.5, 0.57);
    fence(end + 0.7, end + 5.1, 9.5, 0.57);
    tree(start - 2.1, 8.3, 1.25);
    tree(Math.max(end + 2.2, 5.3), 10.4, 1.1);
    tree(start - 4.3, 13, 1.6);
    tree(end + 4.2, 13.5, 1.7);
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const cliff = ellipsoid(
          "distant-river-gorge",
          side * (6.8 + i * 2.4),
          1.1 + (i % 2) * 0.4,
          16.7 + i * 1.8,
          6.2,
          4.2 + i * 0.6,
          4.5,
          i % 2 ? limestone : shadowStone,
        );
        cliff.rotation.z = side * 0.16;
      }
    stonePlanter(start - 1.15, 2.1, 0.9);
    stonePlanter(end + 1.15, 2.1, 0.9);
    // Small moored rescue launch: rounded hull, deck, gunwales, seats, buoy and paddle.
    const boatX = (start + end) / 2;
    ellipsoid("rescue-launch-hull", boatX, 0.02, 9.4, 1.45, 0.6, 2.65, teal);
    ellipsoid(
      "rescue-launch-gunwale",
      boatX,
      0.25,
      9.4,
      1.39,
      0.17,
      2.55,
      brass,
    );
    ellipsoid(
      "rescue-launch-interior",
      boatX,
      0.29,
      9.4,
      1.14,
      0.12,
      2.22,
      darkTeal,
    );
    for (const z of [8.86, 9.73])
      box("rescue-launch-seat", boatX, 0.39, z, 1.05, 0.13, 0.28, wood);
    const buoy = keep(
      MeshBuilder.CreateTorus(
        "rescue-life-ring",
        { diameter: 0.57, thickness: 0.15, tessellation: 24 },
        scene,
      ),
      rope,
    );
    buoy.rotation.x = Math.PI / 2;
    buoy.position.set(boatX + 0.58, 0.36, 9.6);
    cable(
      "rescue-launch-mooring",
      [
        new Vector3(boatX, 0.35, 8.15),
        new Vector3(boatX - 0.15, 0.1, 7.35),
        new Vector3(end + 0.3, 0.6, 6.9),
      ],
      rope,
      0.025,
    );
    // The construction tray has feet and inset brass divisions, not loose blocks on a slab.
    box("beam-selection-cabinet", 0, 0.25, 0.7, 6.9, 0.48, 1.52, darkTeal);
    box("beam-selection-lip", 0, 0.5, -0.05, 7.08, 0.13, 0.12, brass);
    for (const x of [-3.3, 3.3])
      box("beam-selection-end", x, 0.57, 0.7, 0.12, 0.2, 1.5, brass);
    for (const x of [-2.8, 2.8])
      box("beam-selection-foot", x, 0.04, 0.7, 0.36, 0.38, 1.1, wood);
  } else {
    // A coastal rescue yard: slate paving, a waterline and a service pavilion.
    box("circuit-island-platform", 0, 0.1, 4.2, 12.7, 0.48, 14.1, limestone);
    box("circuit-island-cut-cap", 0, 0.36, 4.2, 13.0, 0.09, 14.3, paleStone);
    box("coastal-water", 0, -0.13, 9, 32, 0.06, 28, water);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 7; col++)
        box(
          "yard-slate-paving",
          -4.5 + col * 1.5 + (row % 2) * 0.25,
          0.42,
          0.8 + row * 1.5,
          1.39,
          0.04,
          1.38,
          (row + col) % 4 ? limestone : paleStone,
        );
    // Curved roof awning and turned columns frame the apparatus without hiding it.
    for (const x of [-4.35, 4.35]) {
      round("workshop-column-base", x, 0.57, 10.1, 0.54, 0.25, shadowStone);
      round("workshop-column", x, 1.9, 10.1, 0.25, 2.65, teal, 0.21);
      round("workshop-column-capital", x, 3.28, 10.1, 0.45, 0.16, brass);
    }
    box("workshop-awning-front", 0, 3.48, 10.0, 9.3, 0.2, 0.5, teal);
    box("workshop-awning-brass-edge", 0, 3.62, 9.8, 9.45, 0.09, 0.13, brass);
    for (let i = 0; i < 12; i++)
      box(
        "workshop-awning-rib",
        -4.4 + i * 0.8,
        3.5,
        10.5,
        0.06,
        0.16,
        1.5,
        wood,
      );
    box("relay-bench-carcass", 0, 0.72, 4, 6.65, 0.55, 3.4, darkTeal);
    box("relay-bench-inset-face", 0, 0.73, 2.28, 6.0, 0.33, 0.06, teal);
    box("relay-bench-face-trim", 0, 0.61, 2.21, 6.16, 0.04, 0.035, brass);
    for (const x of [-2.7, 2.7]) {
      box("relay-bench-leg", x, 0.52, 4, 0.2, 0.95, 2.9, wood);
      round("relay-bench-bolt", x, 1.01, 2.58, 0.1, 0.035, brass);
    }
    // Two solid switchgear enclosures with visible terminal pads and cable conduits.
    for (const x of [-1.65, 1.65]) {
      box("relay-machine-housing", x, 1.03, 3.5, 1.24, 0.34, 1.65, teal);
      box("relay-machine-top", x, 1.21, 3.5, 1.16, 0.06, 1.55, brass);
      for (const dx of [-0.48, 0.48])
        for (const z of [2.88, 4.12])
          round(
            "relay-enclosure-screw",
            x + dx,
            1.26,
            z,
            0.08,
            0.035,
            darkTeal,
          );
      for (let i = 0; i < 4; i++)
        box(
          "relay-cooling-fin",
          x - 0.4 + i * 0.26,
          1.05,
          4.35,
          0.11,
          0.23,
          0.09,
          darkTeal,
        );
      round("relay-lamp-socket", x, 1.1, 4.8, 0.43, 0.4, darkTeal);
      round("relay-lamp-brass-ring", x, 1.32, 4.8, 0.46, 0.07, brass);
      cable(
        "relay-ground-cable",
        [
          new Vector3(x, 1.05, 4.34),
          new Vector3(x, 1.05, 4.8),
          new Vector3(x, 1.05, 5.25),
          new Vector3(0, 1.05, 5.25),
        ],
        darkTeal,
        0.075,
      );
    }
    box("relay-logic-unit", 0, 1.12, 4.05, 1.25, 0.45, 1.4, darkTeal);
    box("relay-logic-face", 0, 1.38, 4.05, 1.12, 0.08, 1.27, teal);
    round("test-lamp-collar", 0, 1.44, 4.7, 0.68, 0.23, brass);
    // A tapered lighthouse with a real lantern room and balcony.
    round("lighthouse-island-footing", 3.6, 0.58, 8.1, 2.25, 0.42, shadowStone);
    round("lighthouse-plinth", 3.6, 0.85, 8.1, 1.8, 0.24, paleStone);
    round("lighthouse-tower", 3.6, 2.15, 8.1, 1.3, 2.5, limestone, 0.92);
    for (const y of [1.2, 2.4, 3.23])
      round(
        "lighthouse-stone-course",
        3.6,
        y,
        8.1,
        y > 3 ? 1.14 : 1.34 - y * 0.09,
        0.12,
        teal,
      );
    box("lighthouse-door-recess", 3.6, 1.4, 7.43, 0.47, 0.8, 0.06, darkTeal);
    box("lighthouse-door-inset", 3.6, 1.4, 7.39, 0.34, 0.65, 0.05, wood);
    round("lighthouse-balcony", 3.6, 3.47, 8.1, 1.7, 0.15, paleStone);
    round("lighthouse-lantern-base", 3.6, 3.62, 8.1, 1.15, 0.16, brass);
    round("lighthouse-lantern-glass", 3.6, 3.98, 8.1, 0.97, 0.6, glass);
    round("lighthouse-roof", 3.6, 4.43, 8.1, 1.55, 0.36, darkTeal, 0.08);
    round("lighthouse-finial", 3.6, 4.7, 8.1, 0.09, 0.3, brass);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const x = 3.6 + Math.cos(angle) * 0.71,
        z = 8.1 + Math.sin(angle) * 0.71;
      round("lighthouse-balcony-stanchion", x, 3.76, z, 0.045, 0.53, brass);
    }
    const rail = keep(
      MeshBuilder.CreateTorus(
        "lighthouse-balcony-rail",
        { diameter: 1.43, thickness: 0.045, tessellation: 32 },
        scene,
      ),
      brass,
    );
    rail.position.set(3.6, 4.02, 8.1);
    // The service hatch belongs to a limestone maintenance building, not an isolated rectangle.
    box("maintenance-building", -3.8, 1.28, 8.0, 2.8, 1.75, 2.5, limestone);
    box("maintenance-roof", -3.8, 2.2, 8.0, 3.1, 0.2, 2.8, teal);
    box("maintenance-brass-cornice", -3.8, 2.08, 6.72, 2.95, 0.08, 0.12, brass);
    box(
      "maintenance-door-opening",
      -3.8,
      1.23,
      6.72,
      1.12,
      1.55,
      0.12,
      darkTeal,
    );
    for (const x of [-4.46, -3.14])
      box("maintenance-door-jamb", x, 1.25, 6.59, 0.16, 1.7, 0.24, paleStone);
    box(
      "maintenance-door-lintel",
      -3.8,
      2.11,
      6.59,
      1.47,
      0.18,
      0.24,
      paleStone,
    );
    box("maintenance-step", -3.8, 0.47, 6.48, 1.55, 0.18, 0.58, shadowStone);
    cable(
      "lighthouse-power-conduit",
      [
        new Vector3(0, 1.05, 5.25),
        new Vector3(2.55, 1.05, 5.25),
        new Vector3(2.55, 0.49, 5.9),
        new Vector3(3.6, 0.49, 6.9),
        new Vector3(3.6, 0.95, 7.4),
      ],
      darkTeal,
      0.065,
    );
    fence(-6.15, -0.8, 10.7, 0.4);
    fence(0.8, 6.15, 10.7, 0.4);
    stonePlanter(-5.4, 5.4, 0.95);
    stonePlanter(5.4, 5.4, 0.95);
    lantern(-4.35, 2.2, 10.1);
    lantern(4.35, 2.2, 10.1);
    for (let i = 0; i < 8; i++)
      ellipsoid(
        "coastal-breakwater-rock",
        (i % 2 ? -7.2 : 7.2) + Math.sin(i) * 0.2,
        0.1,
        3 + i * 1.1,
        1.5,
        1.0,
        1.3,
        i % 3 ? shadowStone : paleStone,
      );
  }
  // Merge only static scenery. Levers, beam answers, labels and accepted outcomes stay real meshes.
  for (const [mat, meshes] of batches) {
    for (const mesh of meshes) mesh.computeWorldMatrix(true);
    const merged = Mesh.MergeMeshes(
      meshes,
      true,
      true,
      undefined,
      false,
      false,
    );
    if (merged) {
      merged.name = `mission-scenery-${kind}-${mat.name}`;
      merged.parent = root;
      merged.material = mat;
      merged.isPickable = false;
    }
  }
  return {
    materials: {
      limestone,
      paleStone,
      wood,
      deck,
      teal,
      darkTeal,
      brass,
      water,
      glass,
    },
    dispose() {
      for (const texture of textures) texture.dispose();
      for (const mat of materials) mat.dispose(false, false);
    },
  };
}
