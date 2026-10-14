import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CITY_STATION } from "../shared/city-layout";
import type { PoliceTransport } from "../shared/police-transport";
import { createSoftBox } from "./softGeometry";

/** Permanent civic architecture and an actual moving, door-opening vehicle. */
export function createPoliceScene(scene: Scene) {
  const material = (name: string, color: string, alpha = 1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = Color3.Black();
    m.alpha = alpha;
    return m;
  };
  const plaster = material("station-stone", "#d8d1bd");
  const navy = material("police-navy", "#193c57");
  const gold = material("police-gold", "#edc363");
  const glass = material("police-window", "#a4d1d8", 0.22);
  const black = material("police-tyres", "#222d35");
  const cream = material("police-body", "#eef1e6");
  const station = new TransformNode("learning-police-station", scene);
  station.position.set(CITY_STATION.x, 0, CITY_STATION.z);
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
    const mesh = createSoftBox(name, width, height, depth, scene);
    mesh.position.set(x, y, z);
    mesh.parent = parent;
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  };
  box("station-foundation", 10.5, 0.25, 12.5, 0, 0.1, 0, plaster);
  box("station-west-wall", 0.28, 5.8, 12, -5, 3, 0, plaster);
  box("station-east-wall", 0.28, 5.8, 12, 5, 3, 0, plaster);
  box("station-back-wall", 10, 5.8, 0.28, 0, 3, -6, plaster);
  for (const side of [-1, 1])
    box("station-front-wing", 3.7, 3.4, 0.3, side * 3.15, 1.9, 6, plaster);
  const upperWall = box("station-front-upper", 10, 2.2, 0.3, 0, 4.7, 6, navy);
  const roof = box("station-roof", 10.6, 0.35, 12.6, 0, 6, 0, navy);
  box("station-canopy", 5, 0.18, 2, 0, 3.5, 6.6, navy);
  for (const x of [-4, 4]) {
    box("station-window", 1.65, 1.5, 0.1, x, 2, 6.2, glass);
    box("station-window-sill", 1.8, 0.12, 0.3, x, 1.25, 6.2, gold);
  }
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
      { width: 512, height: 128 },
      scene,
      false,
    );
    texture.drawText(
      words,
      null,
      82,
      "bold 38px sans-serif",
      "#ffe6a1",
      "#193c57",
      true,
    );
    const m = new StandardMaterial(name, scene);
    m.diffuseTexture = texture;
    m.emissiveColor = new Color3(0.3, 0.3, 0.3);
    m.specularColor = Color3.Black();
    label.material = m;
    return label;
  };
  const exteriorSign = sign(
    "police-station-sign",
    "LEARNING POLICE",
    station,
    0,
    4.8,
    6.2,
    7.3,
    1.1,
    true,
  );
  sign(
    "station-release-sign",
    "LEARNING & RELEASE",
    station,
    0,
    2.8,
    -2.85,
    4.8,
    0.7,
    true,
  );
  box("station-reception-desk", 3.4, 0.25, 1.1, 2.6, 1.5, 3, navy);
  box("station-reception-base", 2.8, 1.25, 0.8, 2.6, 0.8, 3, plaster);
  box("station-bench", 2.8, 0.22, 0.85, -2.7, 0.8, 3.5, navy);
  for (const x of [-3.7, -1.7])
    box("station-bench-leg", 0.18, 0.65, 0.7, x, 0.35, 3.5, navy);
  // The waiting cell is always part of the station, never spawned around a player.
  box("detention-west-wall", 0.2, 3.2, 4, -2.5, 1.7, -1, plaster);
  box("detention-back-wall", 5, 3.2, 0.2, 0, 1.7, -3, plaster);
  box("detention-east-wall", 0.2, 3.2, 4, 2.5, 1.7, -1, plaster);
  const cellDoor = new TransformNode("station-cell-door", scene);
  cellDoor.parent = station;
  cellDoor.position.set(-0.75, 0, 1);
  for (let i = 0; i < 11; i++) {
    const bar = MeshBuilder.CreateCylinder(
      `station-cell-bar-${i}`,
      { diameter: 0.055, height: 3, tessellation: 12 },
      scene,
    );
    const x = -2.5 + i * 0.5;
    bar.parent = Math.abs(x) <= 0.5 ? cellDoor : station;
    bar.position.set(
      Math.abs(x) <= 0.5 ? x + 0.75 : x,
      1.6,
      Math.abs(x) <= 0.5 ? 0 : 1,
    );
    bar.material = navy;
    bar.isPickable = false;
  }
  box("cell-door-top", 1.5, 0.08, 0.08, 0.75, 3.1, 0, navy, cellDoor);
  box("cell-door-bottom", 1.5, 0.08, 0.08, 0.75, 0.1, 0, navy, cellDoor);
  box("cell-seat", 2.7, 0.2, 0.8, 0, 0.75, -2, navy);
  sign(
    "cell-learning-sign",
    "REST • LEARN • RETURN",
    station,
    0,
    2.4,
    -2.85,
    4,
    0.6,
    true,
  );

  const vehicle = new TransformNode("learning-police-car", scene);
  vehicle.position.set(CITY_STATION.parking.x, 0, CITY_STATION.parking.z);
  box("car-lower-body", 2.8, 0.65, 5.5, 0, 0.78, 0, cream, vehicle);
  box("car-bonnet", 2.65, 0.3, 1.4, 0, 1.25, 1.9, navy, vehicle);
  box("car-boot", 2.65, 0.35, 1.1, 0, 1.28, -2, navy, vehicle);
  box("car-cabin-roof", 2.7, 0.16, 3.1, 0, 2.18, -0.15, cream, vehicle);
  for (const side of [-1, 1])
    for (const z of [-1.55, 1.25])
      box("car-pillar", 0.12, 1, 0.14, side * 1.26, 1.68, z, cream, vehicle);
  box("car-windshield", 2.45, 0.82, 0.05, 0, 1.72, 1.25, glass, vehicle);
  box("car-rear-window", 2.45, 0.82, 0.05, 0, 1.72, -1.55, glass, vehicle);
  for (const x of [-0.62, 0.62])
    for (const z of [-0.7, 0.65]) {
      box("car-seat", 0.8, 0.2, 0.7, x, 1.01, z, navy, vehicle);
      box("car-seat-back", 0.8, 0.65, 0.16, x, 1.35, z - 0.32, navy, vehicle);
    }
  const doors: TransformNode[] = [];
  for (const side of [-1, 1])
    for (const row of [-1, 1]) {
      const door = new TransformNode(`police-car-door-${side}-${row}`, scene);
      door.parent = vehicle;
      door.position.set(side * 1.32, 0, row === 1 ? 1.2 : -0.2);
      box("car-door-panel", 0.1, 0.54, 1.25, 0, 1.12, -0.65, cream, door);
      box("car-door-window", 0.055, 0.68, 1.15, 0, 1.72, -0.65, glass, door);
      box("car-door-stripe", 0.13, 0.2, 1.27, 0, 1.17, -0.65, navy, door);
      box(
        "car-door-handle",
        0.15,
        0.055,
        0.23,
        side * 0.045,
        1.48,
        -0.94,
        gold,
        door,
      );
      doors.push(door);
    }
  const wheels: Mesh[] = [];
  for (const x of [-1.4, 1.4])
    for (const z of [-1.7, 1.7]) {
      const wheel = MeshBuilder.CreateCylinder(
        "police-car-wheel",
        { height: 0.3, diameter: 1.04, tessellation: 24 },
        scene,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.parent = vehicle;
      wheel.position.set(x, 0.53, z);
      wheel.material = black;
      wheel.isPickable = false;
      wheels.push(wheel);
      const hub = MeshBuilder.CreateCylinder(
        "police-car-wheel-hub",
        { height: 0.32, diameter: 0.46, tessellation: 16 },
        scene,
      );
      hub.rotation.z = Math.PI / 2;
      hub.parent = vehicle;
      hub.position.copyFrom(wheel.position);
      hub.material = gold;
      hub.isPickable = false;
    }
  const lights = [
    box(
      "car-blue-light",
      0.6,
      0.18,
      0.35,
      -0.46,
      2.38,
      0,
      material("blue-light", "#349bd5"),
      vehicle,
    ),
    box("car-gold-light", 0.6, 0.18, 0.35, 0.46, 2.38, 0, gold, vehicle),
  ];
  for (const x of [-0.88, 0.88])
    box("car-headlamp", 0.6, 0.22, 0.12, x, 1.0, 2.77, gold, vehicle);
  sign(
    "police-car-front-label",
    "LEARNING POLICE",
    vehicle,
    0,
    1.05,
    2.82,
    2.2,
    0.38,
    true,
  );
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
      roof.visibility = inside ? 0.16 : 1;
      upperWall.visibility = inside ? 0.1 : 1;
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
      wheels.forEach((w) => (w.rotation.x = state.travelled / 0.52));
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
