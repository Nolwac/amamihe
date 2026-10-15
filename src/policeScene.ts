import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { CITY_STATION } from "../shared/city-layout";
import type { PoliceTransport } from "../shared/police-transport";
import { createSoftBox } from "./softGeometry";
import { resourcePath } from "./rendering";

/** A permanent civic building and a four-seat patrol car, in the city's warm palette. */
export function createPoliceScene(scene: Scene) {
  const material = (name: string, color: string, alpha = 1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = new Color3(0.07, 0.07, 0.07);
    m.alpha = alpha;
    return m;
  };
  const stone = material("station-limestone", "#e3c99d");
  const trim = material("station-cut-stone", "#f4dfb5");
  const clay = material("station-terracotta", "#af5636");
  const floor = material("station-sandstone-floor", "#f2e4c8");
  const timber = material("station-teak", "#805334");
  const teal = material("station-painted-teal", "#245d52");
  const navy = material("police-navy", "#17364b");
  const gold = material("police-brass", "#caa45d");
  const glass = material("police-window", "#466e78", 0.84);
  glass.specularColor.set(0.85, 0.92, 0.98);
  glass.specularPower = 128;
  if (scene.environmentTexture) {
    glass.reflectionTexture = scene.environmentTexture;
    glass.reflectionFresnelParameters = new FresnelParameters({
      bias: 0.18,
      power: 2,
      leftColor: new Color3(0.55, 0.65, 0.7),
      rightColor: new Color3(0.12, 0.18, 0.2),
    });
  }
  const window = material("station-window", "#3d7272");
  const black = material("police-tyres", "#263237");
  const cream = material("police-ivory-paint", "#f5efdb");
  cream.specularColor.set(0.32, 0.32, 0.3);
  cream.specularPower = 64;
  const chrome = material("police-brushed-metal", "#a5b6b1");
  const foliage = material("station-planting", "#527d42");
  const lamp = material("police-warm-lamps", "#ffe2a0");
  lamp.emissiveColor = new Color3(0.55, 0.36, 0.12);
  const blue = material("police-blue-beacon", "#4caed0");
  blue.emissiveColor = new Color3(0.05, 0.25, 0.34);
  const red = material("police-rear-lamp", "#b85445");
  red.emissiveColor = new Color3(0.16, 0.02, 0.015);

  const plaster = new Texture(resourcePath("world/plaster.webp"), scene);
  const limestone = new Texture(resourcePath("world/limestone.webp"), scene);
  const wood = new Texture(resourcePath("world/wood.webp"), scene);
  for (const m of [stone, trim, clay, teal]) m.diffuseTexture = plaster;
  floor.diffuseTexture = limestone;
  timber.diffuseTexture = wood;
  const masonry = material("station-limestone-blocks", "#c8ac7c");
  masonry.diffuseTexture = limestone;
  const textureScale = new Map<StandardMaterial, number>([
    [stone, 0.5],
    [trim, 0.5],
    [clay, 0.5],
    [teal, 0.5],
    [floor, 0.3],
    [masonry, 0.3],
    [timber, 1],
  ]);
  const owned: Mesh[] = [];
  const station = new TransformNode("learning-police-station", scene);
  station.position.set(CITY_STATION.x, 0, CITY_STATION.z);
  const finish = (mesh: Mesh, m: StandardMaterial, parent: TransformNode) => {
    mesh.parent = parent;
    mesh.material = m;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    owned.push(mesh);
    return mesh;
  };
  const box = (
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    m: StandardMaterial,
    parent = station,
  ) => {
    const mesh = finish(
      createSoftBox(name, width, height, depth, scene),
      m,
      parent,
    );
    mesh.position.set(x, y, z);
    const scale = textureScale.get(m);
    if (scale) {
      const p = mesh.getVerticesData("position")!;
      const n = mesh.getVerticesData("normal")!;
      const uv = mesh.getVerticesData("uv")!;
      for (let i = 0; i < p.length / 3; i++) {
        const [nx, ny, nz] = n.slice(i * 3, i * 3 + 3).map(Math.abs);
        const axis = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
        uv[i * 2] = p[i * 3 + (axis === 0 ? 2 : 0)] * scale;
        uv[i * 2 + 1] = p[i * 3 + (axis === 1 ? 2 : 1)] * scale;
      }
      mesh.setVerticesData("uv", uv);
    }
    return mesh;
  };
  const cylinder = (
    name: string,
    diameter: number,
    height: number,
    x: number,
    y: number,
    z: number,
    m: StandardMaterial,
    parent = station,
    diameterTop = diameter,
  ) => {
    const mesh = finish(
      MeshBuilder.CreateCylinder(
        name,
        { diameterBottom: diameter, diameterTop, height, tessellation: 24 },
        scene,
      ),
      m,
      parent,
    );
    mesh.position.set(x, y, z);
    const scale = textureScale.get(m);
    if (scale) {
      const uv = mesh.getVerticesData("uv")!;
      for (let i = 0; i < uv.length; i += 2) {
        uv[i] *= Math.PI * diameter * scale;
        uv[i + 1] *= height * scale;
      }
      mesh.setVerticesData("uv", uv);
    }
    return mesh;
  };
  const beam = (
    name: string,
    from: Vector3,
    to: Vector3,
    width: number,
    m: StandardMaterial,
    parent: TransformNode,
  ) => {
    const mesh = cylinder(
      name,
      width,
      Vector3.Distance(from, to),
      0,
      0,
      0,
      m,
      parent,
    );
    mesh.position.copyFrom(from.add(to).scale(0.5));
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      to.subtract(from).normalize(),
      new Quaternion(),
    );
    return mesh;
  };
  const surface = (
    name: string,
    points: number[][],
    m: StandardMaterial,
    parent: TransformNode,
  ) => {
    const mesh = new Mesh(name, scene);
    const positions = points.flat();
    const indices = [0, 1, 2, 0, 2, 3];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    Object.assign(data, {
      positions,
      normals,
      indices,
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    });
    data.applyToMesh(mesh);
    // Glazing and thin trim are seen from both the pavement and the cabin.
    mesh.material = m;
    m.backFaceCulling = false;
    return finish(mesh, m, parent);
  };
  const arch = (
    name: string,
    inner: number,
    outer: number,
    spring: number,
    depth: number,
    x: number,
    z: number,
    m: StandardMaterial,
    parent = station,
  ) => {
    const positions: number[] = [];
    const indices: number[] = [];
    // Extruded stone arch: curved soffit, visible voussoirs, never a blocked doorway.
    for (let i = 0; i <= 24; i++) {
      const angle = (i / 24) * Math.PI;
      for (const offset of [-depth / 2, depth / 2])
        for (const radius of [inner, outer])
          positions.push(
            Math.cos(angle) * radius,
            spring + Math.sin(angle) * radius,
            offset,
          );
    }
    for (let i = 0; i < 24; i++) {
      const a = i * 4,
        b = a + 4;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      indices.push(a, a + 2, b, a + 2, b + 2, b);
      indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
    }
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    Object.assign(data, { positions, normals, indices });
    data.applyToMesh(mesh);
    const scale = textureScale.get(m) ?? 1;
    const uv: number[] = [];
    for (let i = 0; i < positions.length; i += 3)
      uv.push(positions[i] * scale, positions[i + 1] * scale);
    mesh.setVerticesData("uv", uv);
    mesh.position.set(x, 0, z);
    return finish(mesh, m, parent);
  };
  const sign = (
    name: string,
    words: string,
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    reverse = false,
  ) => {
    const label = MeshBuilder.CreatePlane(name, { width, height }, scene);
    label.parent = parent;
    label.position.set(x, y, z);
    label.rotation.y = reverse ? Math.PI : 0;
    label.isPickable = false;
    const texture = new DynamicTexture(
      name,
      { width: 1024, height: 160 },
      scene,
      false,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#173f3c";
    ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = "#cda95e";
    ctx.lineWidth = 3;
    ctx.strokeRect(9, 9, 1006, 142);
    ctx.font = "600 52px sans-serif";
    ctx.fillStyle = "#f8e8bd";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(words, 512, 82, 970);
    texture.update();
    const m = new StandardMaterial(name, scene);
    m.diffuseTexture = texture;
    m.emissiveColor = new Color3(0.22, 0.22, 0.22);
    m.specularColor = Color3.Black();
    label.material = m;
    owned.push(label);
    return label;
  };

  // Low foundations meet the street; the central north doorway stays unobstructed.
  box("station-foundation", 10.5, 0.16, 12.5, 0, 0.02, 0, floor);
  box("station-entry-paving", 4.4, 0.08, 2, 0, 0.02, 6.5, floor);
  box("station-west-wall", 0.3, 5.65, 12, -5, 2.9, 0, stone);
  box("station-east-wall", 0.3, 5.65, 12, 5, 2.9, 0, stone);
  box("station-back-wall", 10, 5.65, 0.3, 0, 2.9, -6, stone);
  for (const side of [-1, 1]) {
    box("station-masonry-base", 0.38, 0.72, 12, side * 5.03, 0.47, 0, masonry);
    box(
      "station-stone-watercourse",
      0.43,
      0.12,
      12.2,
      side * 5.03,
      0.91,
      0,
      trim,
    );
  }
  box("station-rear-masonry-base", 10, 0.72, 0.38, 0, 0.47, -6.03, masonry);
  box("station-rear-watercourse", 10.2, 0.12, 0.43, 0, 0.91, -6.03, trim);
  for (const side of [-1, 1]) {
    box("station-front-wing", 3.55, 5.55, 0.36, side * 3.25, 2.85, 6, stone);
    box(
      "station-front-plinth",
      3.5,
      0.72,
      0.46,
      side * 3.25,
      0.47,
      6.05,
      masonry,
    );
    box(
      "station-front-watercourse",
      3.5,
      0.12,
      0.5,
      side * 3.25,
      0.91,
      6.05,
      trim,
    );
    box(
      "station-window-teal-apron",
      2.03,
      0.28,
      0.1,
      side * 3.2,
      1.1,
      6.28,
      teal,
    );
    box("station-corner-pier", 0.38, 5.7, 0.48, side * 4.85, 2.9, 6.08, trim);
    box("station-column-base", 0.65, 0.22, 0.7, side * 1.7, 0.2, 6.47, trim);
    cylinder(
      "station-entry-column",
      0.36,
      2.75,
      side * 1.7,
      1.68,
      6.45,
      trim,
      station,
      0.3,
    );
    box(
      "station-column-capital",
      0.62,
      0.22,
      0.65,
      side * 1.7,
      3.15,
      6.45,
      trim,
    );
    box("station-arch-jamb", 0.25, 3, 0.45, side * 1.34, 1.6, 6.15, teal);
    // Arched glazed windows sit in deep stone surrounds rather than on blank facades.
    const x = side * 3.2;
    box("station-window-recess", 1.9, 2.3, 0.1, x, 2.4, 6.22, teal);
    box("station-window-glazing", 1.53, 1.75, 0.08, x, 2.35, 6.29, window);
    arch("station-window-arch", 0.77, 0.94, 3.15, 0.18, x, 6.3, trim);
    for (const edge of [-1, 1])
      box(
        "station-window-jamb",
        0.16,
        1.95,
        0.16,
        x + edge * 0.86,
        2.22,
        6.3,
        trim,
      );
    box("station-window-mullion", 0.055, 1.76, 0.12, x, 2.35, 6.36, gold);
    box("station-window-transom", 1.52, 0.055, 0.12, x, 2.7, 6.36, gold);
    box("station-window-sill", 2.12, 0.16, 0.42, x, 1.28, 6.35, trim);
    // Brass sconces with warm glass, no extra shadow-casting lights on phones.
    box(
      "station-lantern-backplate",
      0.2,
      0.65,
      0.08,
      side * 2.03,
      2.65,
      6.27,
      teal,
    );
    box(
      "station-lantern-glass",
      0.25,
      0.44,
      0.25,
      side * 2.03,
      2.7,
      6.46,
      lamp,
    );
    for (const y of [2.44, 2.96])
      box("station-lantern-cap", 0.35, 0.09, 0.35, side * 2.03, y, 6.46, gold);
    cylinder(
      "station-entry-planter",
      0.8,
      0.65,
      side * 4.22,
      0.38,
      6.8,
      clay,
      station,
      0.95,
    );
    for (const [dx, dy, dz] of [
      [0, 1.06, 0],
      [0.18, 0.82, 0.06],
    ]) {
      const bush = finish(
        MeshBuilder.CreateSphere(
          "station-courtyard-plant",
          { diameter: 1, segments: 10 },
          scene,
        ),
        foliage,
        station,
      );
      bush.position.set(side * 4.22 + dx, dy, 6.8 + dz);
      bush.scaling.set(0.7, 0.65, 0.7);
    }
    for (const z of [-3, 1.5]) {
      box("station-side-window-trim", 0.12, 2, 1.7, side * 5.18, 2.9, z, trim);
      box("station-side-window", 0.15, 1.65, 1.35, side * 5.23, 2.9, z, window);
    }
  }
  arch("station-entrance-arch", 1.3, 1.6, 3.05, 0.55, 0, 6.25, teal);
  arch("station-portico-arch", 1.46, 1.73, 3.2, 0.35, 0, 6.48, trim);
  const upperWall = box(
    "station-front-upper",
    10,
    1.12,
    0.36,
    0,
    5.2,
    6,
    stone,
  );
  const roofAssembly = new TransformNode("station-roof-assembly", scene);
  roofAssembly.parent = station;
  box("station-cornice-shadow", 10.5, 0.2, 12.5, 0, 5.7, 0, clay, roofAssembly);
  box(
    "station-carved-cornice",
    10.75,
    0.2,
    12.75,
    0,
    5.87,
    0,
    trim,
    roofAssembly,
  );
  box(
    "station-terracotta-roof",
    10.65,
    0.2,
    12.65,
    0,
    6.02,
    0,
    clay,
    roofAssembly,
  );
  for (const x of [-5.07, 5.07])
    box(
      "station-roof-parapet",
      0.22,
      0.4,
      12.3,
      x,
      6.22,
      0,
      stone,
      roofAssembly,
    );
  for (const z of [-5.95, 5.95])
    box(
      "station-roof-parapet",
      10.3,
      0.4,
      0.22,
      0,
      6.22,
      z,
      stone,
      roofAssembly,
    );
  const exteriorSign = sign(
    "police-station-sign",
    "LEARNING POLICE",
    station,
    0,
    5.12,
    6.27,
    5.6,
    0.65,
    true,
  );

  // Finished reception: a rounded counter, an inset waiting area, timber furniture.
  box("station-reception-rug", 3.4, 0.035, 2.5, 2.8, 0.13, 3.05, teal);
  box("station-reception-base", 2.7, 1.05, 0.85, 2.8, 0.67, 2.8, clay);
  box("station-reception-top", 3.05, 0.16, 1.08, 2.8, 1.3, 2.8, trim);
  box("station-desk-inlay", 2.3, 0.33, 0.055, 2.8, 0.94, 3.25, teal);
  sign(
    "station-welcome-sign",
    "WELCOME · LEARN · RETURN",
    station,
    2.8,
    2.5,
    5.75,
    3.1,
    0.5,
  );
  for (const x of [-3.7, -1.8]) {
    box("station-bench-leg", 0.14, 0.58, 0.6, x, 0.42, 3.8, navy);
    box("station-bench-back-post", 0.12, 1.15, 0.12, x, 0.9, 3.49, navy);
  }
  for (const z of [3.56, 3.8, 4.04])
    box("station-bench-seat-slat", 2.7, 0.1, 0.18, -2.75, 0.76, z, timber);
  for (const y of [1.04, 1.32])
    box("station-bench-back-slat", 2.7, 0.19, 0.1, -2.75, y, 3.46, timber);
  // A glazed rear window gives the indoor learning room daylight and a clear backdrop.
  box("station-rear-window-frame", 3.4, 2.2, 0.15, 0, 3.7, -5.78, trim);
  box("station-rear-window", 3.05, 1.85, 0.17, 0, 3.7, -5.66, window);
  for (const x of [-0.52, 0.52])
    box("station-rear-mullion", 0.06, 1.9, 0.2, x, 3.7, -5.54, gold);

  // The learning room is always built into the station, with a real hinged grille.
  box("detention-floor-inset", 4.8, 0.035, 3.8, 0, 0.13, -1, floor);
  box("detention-west-wall", 0.2, 3.15, 4, -2.5, 1.7, -1, stone);
  box("detention-back-wall", 5, 3.15, 0.2, 0, 1.7, -3, stone);
  box("detention-east-wall", 0.2, 3.15, 4, 2.5, 1.7, -1, stone);
  for (const x of [-2.5, 2.5])
    box("detention-stone-doorpost", 0.3, 3.2, 0.32, x, 1.7, 1, trim);
  box("detention-lintel", 5.1, 0.22, 0.32, 0, 3.3, 1, trim);
  const cellDoor = new TransformNode("station-cell-door", scene);
  cellDoor.parent = station;
  cellDoor.position.set(-0.75, 0, 1);
  for (let i = 0; i < 17; i++) {
    const x = -2.4 + i * 0.3;
    const inDoor = x > -0.75 && x < 0.75;
    cylinder(
      `station-cell-bar-${i}`,
      0.045,
      2.85,
      inDoor ? x + 0.75 : x,
      1.7,
      inDoor ? 0 : 1,
      navy,
      inDoor ? cellDoor : station,
    );
  }
  for (const y of [0.28, 1.12, 3.12]) {
    box("cell-door-horizontal", 1.5, 0.055, 0.07, 0.75, y, 0, navy, cellDoor);
    for (const side of [-1, 1])
      box("cell-fixed-horizontal", 1.65, 0.055, 0.07, side * 1.62, y, 1, navy);
  }
  for (const x of [0, 1.5])
    box("cell-door-frame", 0.06, 2.94, 0.07, x, 1.7, 0, navy, cellDoor);
  box("cell-door-lock", 0.12, 0.18, 0.14, 1.39, 1.6, 0, gold, cellDoor);
  for (const x of [-0.95, 0.95])
    box("cell-seat-leg", 0.12, 0.53, 0.5, x, 0.41, -2.18, navy);
  for (const z of [-2.42, -2.19, -1.96])
    box("cell-seat-timber", 2.6, 0.11, 0.18, 0, 0.74, z, timber);
  box("cell-seat-back", 2.6, 0.3, 0.11, 0, 1.1, -2.55, timber);
  sign(
    "cell-learning-sign",
    "LEARN · REFLECT · RETURN",
    station,
    0,
    2.72,
    -2.86,
    3.35,
    0.46,
    true,
  );

  const vehicle = new TransformNode("learning-police-car", scene);
  vehicle.position.set(CITY_STATION.parking.x, 0, CITY_STATION.parking.z);
  vehicle.scaling.x = 0.75;
  // Lofted oval shoulders taper into the bonnet and boot. This is a single smooth
  // painted shell, rather than stacked rectangular body/cabin blocks.
  const carShell = (
    name: string,
    sections: number[][],
    m: StandardMaterial,
  ) => {
    const bodyPositions: number[] = [];
    const bodyIndices: number[] = [];
    for (const [z, w, bottom, top] of sections) {
      const bevel = Math.min(0.13, (top - bottom) * 0.35);
      const ring = [
        [-w * 0.83, bottom],
        [-w, bottom + bevel],
        [-w, top - bevel],
        [-w * 0.9, top],
        [w * 0.9, top],
        [w, top - bevel],
        [w, bottom + bevel],
        [w * 0.83, bottom],
      ];
      for (const [x, y] of ring) bodyPositions.push(x, y, z);
    }
    for (let row = 0; row < sections.length - 1; row++)
      for (let i = 0; i < 8; i++) {
        const a = row * 8 + i,
          b = row * 8 + ((i + 1) % 8);
        bodyIndices.push(a, a + 8, b, b, a + 8, b + 8);
      }
    for (let i = 1; i < 7; i++) {
      bodyIndices.push(0, i, i + 1);
      const last = (sections.length - 1) * 8;
      bodyIndices.push(last, last + i + 1, last + i);
    }
    for (let i = 0; i < bodyIndices.length; i += 3)
      [bodyIndices[i + 1], bodyIndices[i + 2]] = [
        bodyIndices[i + 2],
        bodyIndices[i + 1],
      ];
    const bodyNormals: number[] = [];
    VertexData.ComputeNormals(bodyPositions, bodyIndices, bodyNormals);
    const body = new Mesh(name, scene);
    const bodyData = new VertexData();
    Object.assign(bodyData, {
      positions: bodyPositions,
      normals: bodyNormals,
      indices: bodyIndices,
      uvs: bodyPositions.flatMap((_, i) =>
        i % 3 === 0 ? [bodyPositions[i] / 3, bodyPositions[i + 2] / 5] : [],
      ),
    });
    bodyData.applyToMesh(body);
    return finish(body, m, vehicle);
  };
  const sections = [
    [-2.72, 1.02, 0.73, 0.93],
    [-2.5, 1.25, 0.58, 1.16],
    [-1.82, 1.39, 0.57, 1.3],
    [-1.22, 1.4, 0.57, 1.29],
    [0.85, 1.4, 0.57, 1.27],
    [1.55, 1.37, 0.58, 1.24],
    [2.39, 1.25, 0.64, 1.12],
    [2.72, 1.08, 0.75, 0.98],
  ];
  carShell("police-car-sculpted-body", sections, cream);
  box("car-lower-sill", 2.52, 0.18, 4.15, 0, 0.56, -0.04, navy, vehicle);
  surface(
    "car-bonnet-inlay",
    [
      [-0.85, 1.275, 1.27],
      [0.85, 1.275, 1.27],
      [0.78, 1.14, 2.36],
      [-0.78, 1.14, 2.36],
    ],
    navy,
    vehicle,
  );
  box("car-boot-inlay", 1.9, 0.065, 0.55, 0, 1.32, -2.02, navy, vehicle);
  carShell(
    "car-curved-roof",
    [
      [-1.39, 0.56, 2.12, 2.16],
      [-1.23, 1.02, 2.13, 2.24],
      [-0.98, 1.12, 2.13, 2.28],
      [0.56, 1.12, 2.13, 2.28],
      [0.81, 1.03, 2.13, 2.24],
      [0.98, 0.6, 2.12, 2.16],
    ],
    cream,
  );
  for (const side of [-1, 1]) {
    beam(
      "car-sloped-front-pillar",
      new Vector3(side * 1.2, 1.3, 1.35),
      new Vector3(side * 1.01, 2.13, 0.71),
      0.11,
      cream,
      vehicle,
    );
    beam(
      "car-sloped-rear-pillar",
      new Vector3(side * 1.25, 1.31, -1.78),
      new Vector3(side * 1.02, 2.13, -1.17),
      0.14,
      cream,
      vehicle,
    );
    beam(
      "car-centre-pillar",
      new Vector3(side * 1.29, 1.32, -0.14),
      new Vector3(side * 1.06, 2.13, -0.14),
      0.1,
      navy,
      vehicle,
    );
    box(
      "car-mirror-stem",
      0.2,
      0.07,
      0.08,
      side * 1.34,
      1.51,
      0.99,
      navy,
      vehicle,
    );
    box(
      "car-wing-mirror",
      0.28,
      0.17,
      0.3,
      side * 1.44,
      1.55,
      1.04,
      cream,
      vehicle,
    );
  }
  surface(
    "car-sloping-windshield",
    [
      [-1.17, 1.35, 1.33],
      [1.17, 1.35, 1.33],
      [0.99, 2.1, 0.72],
      [-0.99, 2.1, 0.72],
    ],
    glass,
    vehicle,
  );
  surface(
    "car-sloping-rear-window",
    [
      [1.19, 1.36, -1.72],
      [-1.19, 1.36, -1.72],
      [-0.99, 2.1, -1.18],
      [0.99, 2.1, -1.18],
    ],
    glass,
    vehicle,
  );
  box(
    "car-windscreen-lower-seal",
    2.28,
    0.055,
    0.07,
    0,
    1.34,
    1.34,
    navy,
    vehicle,
  );
  for (const x of [-0.62, 0.62])
    for (const z of [-0.7, 0.65]) {
      for (const [name, y, dz, w, h, d] of [
        ["cushion", 1.01, 0, 0.8, 0.24, 0.7],
        ["back", 1.35, -0.32, 0.78, 0.7, 0.24],
        ["headrest", 1.77, -0.32, 0.42, 0.26, 0.22],
      ] as const) {
        const seat = finish(
          MeshBuilder.CreateSphere(
            "car-seat-" + name,
            { diameter: 1, segments: 12 },
            scene,
          ),
          navy,
          vehicle,
        );
        seat.position.set(x, y, z + dz);
        seat.scaling.set(w, h, d);
      }
    }
  const steering = MeshBuilder.CreateTorus(
    "car-steering-wheel",
    { diameter: 0.43, thickness: 0.055, tessellation: 20 },
    scene,
  );
  finish(steering, navy, vehicle);
  steering.position.set(-0.62, 1.45, 0.98);
  steering.rotation.x = -0.9;
  const doors: TransformNode[] = [];
  for (const side of [-1, 1])
    for (const row of [-1, 1]) {
      const front = row === 1;
      const door = new TransformNode(`police-car-door-${side}-${row}`, scene);
      door.parent = vehicle;
      door.position.set(side * 1.33, 0, front ? 1.23 : -0.12);
      box("car-door-panel", 0.075, 0.54, 1.21, 0, 1.07, -0.64, cream, door);
      box(
        "car-door-stripe",
        0.085,
        0.19,
        1.19,
        side * 0.02,
        1.13,
        -0.64,
        navy,
        door,
      );
      surface(
        "car-tapered-side-window",
        [
          [0, 1.37, -0.06],
          [0, 1.37, -1.22],
          [-side * 0.24, 2.09, front ? -1.2 : -1.02],
          [-side * 0.24, 2.09, front ? -0.52 : -0.06],
        ],
        glass,
        door,
      );
      const windowCorners = [
        new Vector3(0, 1.37, -0.06),
        new Vector3(0, 1.37, -1.22),
        new Vector3(-side * 0.24, 2.09, front ? -1.2 : -1.02),
        new Vector3(-side * 0.24, 2.09, front ? -0.52 : -0.06),
      ];
      for (let i = 0; i < windowCorners.length; i++)
        beam(
          "car-door-window-seal",
          windowCorners[i],
          windowCorners[(i + 1) % 4],
          0.035,
          navy,
          door,
        );
      box(
        "car-door-handle",
        0.11,
        0.055,
        0.22,
        side * 0.065,
        1.37,
        -1.03,
        chrome,
        door,
      );
      if (front) {
        const crest = cylinder(
          "car-door-civic-crest",
          0.27,
          0.045,
          side * 0.07,
          1.12,
          -0.58,
          gold,
          door,
        );
        crest.rotation.z = Math.PI / 2;
      }
      doors.push(door);
    }
  const wheels: Mesh[] = [];
  for (const side of [-1, 1])
    for (const z of [-1.7, 1.7]) {
      // Turn the whole wheel assembly around its axle; the five spokes make travel readable.
      const axle = new TransformNode("police-wheel-axle", scene);
      axle.parent = vehicle;
      axle.position.set(side * 1.38, 0.53, z);
      const tyre = cylinder(
        "police-car-wheel",
        1.04,
        0.32,
        0,
        0,
        0,
        black,
        axle,
      );
      tyre.rotation.z = Math.PI / 2;
      const hub = cylinder(
        "police-car-wheel-hub",
        0.69,
        0.34,
        0,
        0,
        0,
        chrome,
        axle,
      );
      hub.rotation.z = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        beam(
          "police-wheel-spoke",
          new Vector3(
            side * 0.18,
            Math.sin(angle) * 0.1,
            Math.cos(angle) * 0.1,
          ),
          new Vector3(
            side * 0.18,
            Math.sin(angle) * 0.29,
            Math.cos(angle) * 0.29,
          ),
          0.065,
          navy,
          axle,
        );
      }
      const centre = cylinder(
        "police-wheel-centre",
        0.17,
        0.36,
        0,
        0,
        0,
        gold,
        axle,
      );
      centre.rotation.z = Math.PI / 2;
      // A narrow curved arch trims the body shoulder without a square fender block.
      const fender = arch(
        "police-wheel-arch",
        0.54,
        0.62,
        0.53,
        0.08,
        side * 1.39,
        z,
        cream,
        vehicle,
      );
      fender.rotation.y = Math.PI / 2;
      wheels.push(tyre);
    }
  box("car-front-bumper", 2.53, 0.17, 0.22, 0, 0.75, 2.65, chrome, vehicle);
  box("car-rear-bumper", 2.52, 0.16, 0.2, 0, 0.75, -2.65, chrome, vehicle);
  box("car-front-grille", 1.04, 0.3, 0.06, 0, 1.02, 2.7, navy, vehicle);
  for (const y of [0.93, 1.02, 1.11])
    box("car-grille-slat", 0.94, 0.025, 0.075, 0, y, 2.74, chrome, vehicle);
  for (const side of [-1, 1]) {
    box(
      "car-headlamp",
      0.53,
      0.22,
      0.08,
      side * 0.91,
      1.02,
      2.6,
      lamp,
      vehicle,
    );
    box(
      "car-rear-lamp",
      0.48,
      0.2,
      0.09,
      side * 0.96,
      1.04,
      -2.59,
      red,
      vehicle,
    );
  }
  sign(
    "police-car-front-label",
    "LEARNING POLICE",
    vehicle,
    0,
    0.68,
    2.79,
    1.42,
    0.22,
    true,
  );
  box("car-lightbar-mount", 1.48, 0.08, 0.3, 0, 2.35, -0.19, navy, vehicle);
  const lights = [
    box("car-blue-light", 0.58, 0.16, 0.28, -0.4, 2.44, -0.19, blue, vehicle),
    box("car-gold-light", 0.58, 0.16, 0.28, 0.4, 2.44, -0.19, lamp, vehicle),
  ];
  // Merge only children of the same transform and material. Detach without
  // changing local transforms while baking so vehicle scaling is applied once;
  // door hinges, wheel axles and the separate roof cutaway keep their own roots.
  const unbatched = new Set<Mesh>([
    upperWall,
    exteriorSign,
    ...lights,
    ...wheels,
  ]);
  const groups = new Map<string, Mesh[]>();
  for (const mesh of owned) {
    if (
      unbatched.has(mesh) ||
      !mesh.parent ||
      !mesh.material ||
      mesh.material.alpha < 1
    )
      continue;
    const key = `${mesh.parent.uniqueId}:${mesh.material.uniqueId}:${mesh.sideOrientation}`;
    const group = groups.get(key) ?? [];
    group.push(mesh);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const parent = group[0].parent;
    const parts = group.map((mesh) => mesh.name);
    for (const mesh of group) mesh.parent = null;
    const merged = Mesh.MergeMeshes(group, true, true, undefined, false, false);
    if (!merged) {
      for (const mesh of group) mesh.parent = parent;
      continue;
    }
    merged.name = `police-detail-batch-${parent!.name}-${merged.material!.name}`;
    merged.parent = parent;
    merged.isPickable = false;
    merged.receiveShadows = true;
    merged.metadata = { parts };
  }
  scene
    .getEngine()
    .getRenderingCanvas()
    ?.setAttribute("data-police-station", "permanent");
  return {
    vehicle,
    station,
    seat(driver: boolean) {
      vehicle.computeWorldMatrix(true);
      return Vector3.TransformCoordinates(
        new Vector3(driver ? -0.62 : 0.62, 0.12, driver ? 0.65 : -0.7),
        vehicle.getWorldMatrix(),
      );
    },
    update(state: PoliceTransport | undefined) {
      const inside =
        (state?.phase === "arrival" && state.enteredStation) ||
        state?.phase === "detained" ||
        state?.phase === "securing";
      // A proper cutaway removes the roof rather than putting a translucent dark sheet
      // between the camera and the room. The building stays intact outside detention.
      roofAssembly.setEnabled(!inside);
      upperWall.setEnabled(!inside);
      exteriorSign.setEnabled(!inside);
      cellDoor.rotation.y =
        state?.phase === "arrival" || state?.phase === "securing" ? -1.1 : 0;
      if (!state) {
        vehicle.position.set(CITY_STATION.parking.x, 0, CITY_STATION.parking.z);
        vehicle.rotation.y = 0;
        doors.forEach((d) => (d.rotation.y = 0));
        lights.forEach((l) => (l.visibility = 1));
        return;
      }
      vehicle.position.set(state.vehicle.x, 0, state.vehicle.z);
      vehicle.rotation.y = state.heading;
      wheels.forEach((wheel) => {
        const axle = wheel.parent as TransformNode;
        axle.rotation.x = state.travelled / 0.52;
      });
      doors.forEach(
        (d, i) => (d.rotation.y = state.doorOpen ? (i < 2 ? -0.9 : 0.9) : 0),
      );
      lights.forEach((l) => (l.visibility = 1));
      const canvas = scene.getEngine().getRenderingCanvas();
      if (canvas) {
        canvas.dataset.policeVehicle = JSON.stringify({
          position: vehicle.position.asArray(),
          heading: state.heading,
          travelled: state.travelled,
          doorOpen: state.doorOpen,
        });
        canvas.dataset.stationInterior = String(Boolean(inside));
      }
    },
  };
}
