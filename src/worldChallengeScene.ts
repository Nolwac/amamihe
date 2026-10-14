import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PublicCourseQuestion } from "../shared/course";
import {
  circuitOutput,
  emptyWorldEvidence,
  type WorldTask,
  type WorldEvidence,
  type WorldAction,
} from "../shared/world-task";
import { createSoftBox } from "./softGeometry";

/** The manipulable objects are the answer; only a server-accepted result commits the mission. */
export function createWorldChallenge(scene: Scene) {
  let root: TransformNode | undefined,
    key = "",
    currentEvidence = "";
  let board: TransformNode | undefined;
  let task: WorldTask | undefined;
  let lamps: Mesh[] = [];
  let levers: TransformNode[] = [];
  let output: Mesh | undefined;
  let committed: Mesh | undefined;
  let pieces: TransformNode | undefined;
  let built = 0;
  const textures: DynamicTexture[] = [];
  const materials: StandardMaterial[] = [];
  const material = (name: string, hex: string) => {
    const m = new StandardMaterial("mission-" + name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    materials.push(m);
    return m;
  };
  const stone = material("stone", "#d6c5a5"),
    wood = material("wood", "#bd8659"),
    teal = material("teal", "#246f75"),
    gold = material("gold", "#e7be67"),
    ink = material("ink", "#173b4b"),
    green = material("power-on", "#5ad098"),
    red = material("power-off", "#da986c");
  green.emissiveColor = new Color3(0.08, 0.32, 0.19);
  const reusableMaterialCount = materials.length;
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    parent = root!,
  ) => {
    const m = createSoftBox(name, w, h, d, scene);
    m.parent = parent;
    m.position.set(x, y, z);
    m.material = mat;
    m.isPickable = false;
    return m;
  };
  const label = (
    name: string,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    action?: WorldAction | "submit",
    parent = root!,
  ) => {
    const plane = MeshBuilder.CreatePlane(
      name,
      { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    plane.parent = parent;
    plane.position.set(x, y, z);
    plane.rotation.x = 0.1;
    const texture = new DynamicTexture(
      name,
      { width: 768, height: Math.max(96, Math.round((768 * h) / w)) },
      scene,
      false,
    );
    textures.push(texture);
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    const height = texture.getSize().height;
    context.fillStyle = "#173b4b";
    context.fillRect(0, 0, 768, height);
    context.fillStyle = "#fff0c9";
    context.textAlign = "center";
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    context.font = "600 35px sans-serif";
    for (const word of words) {
      if (context.measureText(line + " " + word).width > 708 && line) {
        lines.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    const size = Math.min(
      42,
      ((height - 20) / Math.max(1, lines.length)) * 0.74,
    );
    context.font = `600 ${size}px sans-serif`;
    lines.forEach((l, i) =>
      context.fillText(l, 384, 12 + ((i + 0.8) * (height - 18)) / lines.length),
    );
    texture.update();
    const mat = new StandardMaterial(name, scene);
    mat.diffuseTexture = texture;
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    materials.push(mat);
    plane.material = mat;
    plane.isPickable = Boolean(action);
    if (action) plane.metadata = { worldAction: action };
    return plane;
  };
  const tube = (name: string, points: Vector3[], m: StandardMaterial) => {
    const mesh = MeshBuilder.CreateTube(
      name,
      { path: points, radius: 0.05, tessellation: 12 },
      scene,
    );
    mesh.parent = root!;
    mesh.material = m;
    mesh.isPickable = false;
    return mesh;
  };
  const reset = () => {
    root?.dispose(false, false);
    for (const texture of textures.splice(0)) texture.dispose();
    while (materials.length > reusableMaterialCount)
      materials.pop()?.dispose(false, false);
    board = undefined;
    pieces = undefined;
    lamps = [];
    levers = [];
    output = undefined;
    committed = undefined;
    currentEvidence = "";
    built = 0;
  };
  return {
    update(
      question: PublicCourseQuestion | undefined,
      evidence: WorldEvidence | undefined,
      accepted: number,
      mobile: boolean,
      complete = false,
    ) {
      const next = question?.worldTask;
      if (!next) {
        if (root) {
          reset();
          root = undefined;
          key = "";
        }
        return;
      }
      if (key !== question!.id + ":" + complete) {
        reset();
        key = question!.id + ":" + complete;
        task = next;
        root = new TransformNode("playable-learning-mission", scene);
        board = new TransformNode("mission-control-board", scene);
        board.parent = root;
        box("mission-ground", 0, -0.18, 4, 24, 0.25, 24, stone);
        label(
          "mission-authored-prompt",
          question!.prompt,
          0,
          3.4,
          6.8,
          6.8,
          1.3,
        );
        if (next.kind === "fraction-bridge") {
          const river = material("river", "#4eabc0");
          river.alpha = 0.78;
          const length =
            next.targets.reduce(
              (sum, t) => sum + t.numerator / t.denominator,
              0,
            ) * 6.4;
          box(
            "fraction-river",
            -3.2 + length / 2,
            0.02,
            4.5,
            length + 0.3,
            0.1,
            5.4,
            river,
          );
          for (const x of [-4.5, -3.2 + length + 1.25])
            box("bridge-bank", x, 0.12, 4.5, 2.5, 0.32, 6, stone);
          const ghost = material("target-span", "#d1eee1");
          ghost.alpha = 0.23;
          box(
            "target-span",
            -3.2 + length / 2,
            0.8,
            4.5,
            length,
            0.1,
            1.4,
            ghost,
          );
          tube(
            "target-span-outline",
            [
              new Vector3(-3.2, 0.85, 3.8),
              new Vector3(-3.2 + length, 0.85, 3.8),
              new Vector3(-3.2 + length, 0.85, 5.2),
              new Vector3(-3.2, 0.85, 5.2),
            ],
            gold,
          );
          for (let i = 0; i <= 8; i++)
            box(
              "eighth-measure",
              -3.2 + i * 0.8,
              0.25,
              7,
              0.04,
              0.45,
              0.1,
              ink,
            );
          box("beam-tray", 0, 0.16, 0.8, 6.5, 0.32, 1.4, wood);
          next.pieces.forEach((units, i) => {
            const x = (i - (next.pieces.length - 1) / 2) * 2;
            const m = box(
              `beam-piece-${units}`,
              x,
              0.45,
              0.8,
              units * 0.55,
              0.2,
              0.7,
              teal,
            );
            m.isPickable = true;
            m.metadata = { worldAction: { kind: "add-piece", units } };
            label(
              `beam-label-${units}`,
              `${units}/8 beam`,
              x,
              0.88,
              0.7,
              1.6,
              0.45,
              { kind: "add-piece", units },
            );
          });
          pieces = new TransformNode("learner-bridge-pieces", scene);
          pieces.parent = root;
          committed = box(
            "bridge-progress-station",
            -3.2 + length + 1.25,
            0.8,
            6.6,
            0.6,
            1.2,
            0.6,
            gold,
          );
          label("undo-beam", "Undo last beam", -2.1, 1.0, -0.25, 1.7, 0.4, {
            kind: "remove-piece",
          });
        } else {
          box("relay-workbench", 0, 0.35, 4, 6.5, 0.7, 3.6, teal);
          box("relay-board", 0, 0.77, 4, 6.0, 0.12, 3.1, stone);
          label(
            "relay-rule",
            `${next.gate.toUpperCase()} relay · goal: power ${next.goal ? "on" : "off"}`,
            0,
            2.5,
            5.4,
            4.8,
            0.6,
          );
          for (const index of [0, 1] as const) {
            const x = index ? 1.65 : -1.65;
            box("switch-base", x, 0.91, 3.1, 0.9, 0.2, 0.9, ink);
            const lever = new TransformNode(`relay-${index}-lever`, scene);
            lever.parent = root;
            lever.position.set(x, 1.01, 3.1);
            const stem = box(
              `relay-${index}-stem`,
              0,
              0.22,
              0,
              0.1,
              0.48,
              0.1,
              gold,
              lever,
            );
            const knob = MeshBuilder.CreateSphere(
              `relay-${index}-switch`,
              { diameter: 0.35, segments: 16 },
              scene,
            );
            knob.parent = lever;
            knob.position.y = 0.47;
            knob.material = gold;
            const fixed =
              (index === 0 ? next.fixed?.a : next.fixed?.b) !== undefined;
            if (!fixed) {
              stem.isPickable = true;
              knob.metadata = { worldAction: { kind: "switch", index } };
              stem.metadata = knob.metadata;
            } else knob.isPickable = false;
            levers.push(lever);
            const lamp = MeshBuilder.CreateSphere(
              `relay-${index}-lamp`,
              { diameter: 0.22, segments: 12 },
              scene,
            );
            lamp.parent = root;
            lamp.position.set(x, 0.96, 4.8);
            lamp.material = red;
            lamps.push(lamp);
            label(
              `relay-label-${index}`,
              `Relay ${index ? "B" : "A"}${fixed ? " · fixed" : ""}`,
              x,
              1.7,
              3.0,
              1.6,
              0.4,
              fixed ? undefined : { kind: "switch", index },
            );
            tube(
              `relay-wire-${index}`,
              [
                new Vector3(x, 0.95, 4.8),
                new Vector3(x, 0.95, 5.0),
                new Vector3(0, 0.95, 5.0),
              ],
              gold,
            );
          }
          output = MeshBuilder.CreateSphere(
            "circuit-test-lamp",
            { diameter: 0.6, segments: 20 },
            scene,
          );
          output.parent = root;
          output.position.set(0, 1.7, 4.7);
          output.material = red;
          label("test-signal-label", "TEST SIGNAL", 0, 2.2, 4.6, 1.8, 0.38);
          box("lighthouse-base", 3.6, 0.15, 6.4, 1.8, 0.3, 1.8, stone);
          const tower = MeshBuilder.CreateCylinder(
            "lighthouse-tower",
            {
              height: 2.7,
              diameterBottom: 1.1,
              diameterTop: 0.7,
              tessellation: 20,
            },
            scene,
          );
          tower.parent = root;
          tower.position.set(3.6, 1.5, 6.4);
          tower.material = stone;
          tower.isPickable = false;
          committed = next.goal
            ? MeshBuilder.CreateSphere(
                "accepted-mission-light",
                { diameter: 0.65, segments: 20 },
                scene,
              )
            : createSoftBox("maintenance-hatch", 1.3, 1.9, 0.12, scene);
          committed.parent = root;
          committed.position.set(
            next.goal ? 3.6 : 2.8,
            next.goal ? 3.1 : 1.2,
            6.4,
          );
          committed.material = gold;
        }
        label(
          "mission-submit",
          complete
            ? "CONTINUE"
            : next.kind === "fraction-bridge"
              ? "TEST BRIDGE"
              : "TEST CIRCUIT",
          0,
          1.08,
          -0.35,
          2.0,
          0.48,
          "submit",
        );
        label("mission-reset", "Reset", 2.1, 1.0, -0.25, 1.2, 0.4, {
          kind: "reset",
        });
      }
      root!.scaling.setAll(mobile ? 0.78 : 1);
      const state =
        evidence?.kind === task!.kind ? evidence : emptyWorldEvidence(task!);
      const signature = JSON.stringify(state);
      if (
        task!.kind === "fraction-bridge" &&
        state.kind === "fraction-bridge" &&
        signature !== currentEvidence &&
        pieces
      ) {
        pieces.getChildren().forEach((n) => n.dispose());
        let span = 0;
        for (const [i, units] of state.pieces.entries()) {
          box(
            `placed-beam-${i}`,
            -3.2 + (span + units / 2) * 0.8,
            0.65,
            4.5,
            units * 0.8 - 0.035,
            0.22,
            1.35,
            complete ? gold : i % 2 ? wood : teal,
            pieces,
          );
          span += units;
        }
        built = span;
      }
      if (task!.kind === "circuit" && state.kind === "circuit") {
        levers.forEach(
          (lever, i) => (lever.rotation.x = state.switches[i] ? -0.55 : 0.55),
        );
        lamps.forEach(
          (lamp, i) => (lamp.material = state.switches[i] ? green : red),
        );
        if (output)
          output.material = circuitOutput(task!.gate, state.switches)
            ? green
            : red;
      }
      if (committed) {
        if (task!.kind === "fraction-bridge")
          committed.scaling.y =
            0.25 + 0.75 * Math.max(0, Math.min(1, accepted));
        else {
          committed.material = complete ? green : stone;
          if (!task!.goal) committed.rotation.y = complete ? Math.PI / 2 : 0;
          else committed.scaling.setAll(complete ? 1 : 0.6);
        }
      }
      currentEvidence = signature;
      const canvas = scene.getEngine().getRenderingCanvas();
      if (canvas) {
        canvas.dataset.worldTask = task!.kind;
        canvas.dataset.worldEvidence = signature;
        canvas.dataset.learningEffect =
          task!.kind === "fraction-bridge"
            ? `bridge:${accepted}`
            : `power:${accepted}`;
        canvas.dataset.builtUnits = String(built);
      }
    },
    positions() {
      return (
        root
          ?.getChildMeshes()
          .filter((m) => m.metadata?.worldAction)
          .map((m) => ({
            name: m.name,
            action: m.metadata.worldAction,
            position: m.getAbsolutePosition(),
          })) || []
      );
    },
    dispose() {
      reset();
      for (const m of materials) m.dispose(false, false);
    },
  };
}
