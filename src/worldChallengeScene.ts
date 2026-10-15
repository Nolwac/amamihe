import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { PublicCourseQuestion } from "../shared/course";
import {
  circuitOutput,
  emptyWorldEvidence,
  type WorldTask,
  type WorldEvidence,
  type WorldAction,
} from "../shared/world-task";
import { createSoftBox } from "./softGeometry";
import { createWorldChallengeArt } from "./worldChallengeArt";

/** The manipulable objects are the answer; only a server-accepted result commits the mission. */
export function createWorldChallenge(scene: Scene) {
  let root: TransformNode | undefined,
    key = "",
    currentEvidence = "";
  let task: WorldTask | undefined;
  let lamps: Mesh[] = [];
  let levers: TransformNode[] = [];
  let output: Mesh | undefined;
  let committed: Mesh | undefined;
  let pieces: TransformNode | undefined;
  let art: ReturnType<typeof createWorldChallengeArt> | undefined;
  let beacon: Mesh | undefined;
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
  const green = material("power-on", "#5ad098"),
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
    plane.rotation.x = name === "mission-authored-prompt" ? 0 : 0.1;
    const texture = new DynamicTexture(
      name,
      { width: 768, height: Math.max(96, Math.round((768 * h) / w)) },
      scene,
      false,
    );
    textures.push(texture);
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    const height = texture.getSize().height;
    context.clearRect(0, 0, 768, height);
    context.fillStyle = action === "submit" ? "#ddb66b" : "#204e51";
    context.beginPath();
    context.roundRect(4, 4, 760, height - 8, 20);
    context.fill();
    context.strokeStyle = action === "submit" ? "#f6deb1" : "#baaa7b";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = action === "submit" ? "#183e42" : "#fff0d2";
    context.textAlign = "center";
    const words = text.split(/\s+/);
    let lines: string[] = [];
    let size = Math.min(88, height * 0.62);
    do {
      context.font = `600 ${size}px sans-serif`;
      lines = [];
      let line = "";
      for (const word of words) {
        if (context.measureText(line + " " + word).width > 708 && line) {
          lines.push(line);
          line = word;
        } else line += (line ? " " : "") + word;
      }
      if (line) lines.push(line);
      if (lines.length * size * 1.2 <= height - 28) break;
      size -= 2;
    } while (size > 18);
    context.font = `600 ${size}px sans-serif`;
    context.textBaseline = "middle";
    lines.forEach((l, i) =>
      context.fillText(
        l,
        384,
        height / 2 + (i - (lines.length - 1) / 2) * size * 1.2,
      ),
    );
    texture.update();
    texture.hasAlpha = true;
    const mat = new StandardMaterial(name, scene);
    mat.diffuseTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
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
    art?.dispose();
    art = undefined;
    for (const texture of textures.splice(0)) texture.dispose();
    while (materials.length > reusableMaterialCount)
      materials.pop()?.dispose(false, false);
    pieces = undefined;
    lamps = [];
    levers = [];
    output = undefined;
    committed = undefined;
    beacon = undefined;
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
      scene.getMeshByName("mission-rest-ground")?.setEnabled(!next);
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
        const length =
          next.kind === "fraction-bridge"
            ? next.targets.reduce(
                (sum, t) => sum + t.numerator / t.denominator,
                0,
              ) * 6.4
            : 6.4;
        art = createWorldChallengeArt(scene, root, next.kind, length);
        const palette = art.materials;
        // The prompt is a physical framed notice at the far side of the workshop.
        const noticeX = next.kind === "circuit" ? -0.9 : 0;
        const noticeWidth = next.kind === "circuit" ? 6.3 : 7.12;
        box(
          "mission-notice-frame",
          noticeX,
          3.45,
          8.85,
          noticeWidth,
          1.55,
          0.14,
          palette.brass,
        );
        for (const x of [
          noticeX - noticeWidth / 2 + 0.16,
          noticeX + noticeWidth / 2 - 0.16,
        ])
          box(
            "mission-notice-post",
            x,
            2.05,
            8.95,
            0.16,
            3.8,
            0.18,
            palette.darkTeal,
          );
        label(
          "mission-authored-prompt",
          question!.prompt,
          noticeX,
          3.45,
          8.74,
          noticeWidth - 0.26,
          1.31,
        );
        if (next.kind === "fraction-bridge") {
          const ghost = material("target-span", "#d1eee1");
          ghost.alpha = 0.14;
          box(
            "target-span",
            -3.2 + length / 2,
            0.7,
            4.5,
            length,
            0.04,
            1.35,
            ghost,
          );
          tube(
            "target-span-outline",
            [
              new Vector3(-3.2, 0.74, 3.8),
              new Vector3(-3.2 + length, 0.74, 3.8),
              new Vector3(-3.2 + length, 0.74, 5.2),
              new Vector3(-3.2, 0.74, 5.2),
              new Vector3(-3.2, 0.74, 3.8),
            ],
            palette.brass,
          );
          for (let i = 0; i <= 4; i++)
            label(
              `survey-label-${i}`,
              ["0", "1/4", "1/2", "3/4", "1"][i],
              -3.2 + i * 1.6,
              0.9,
              6.12,
              0.63,
              0.28,
            );
          next.pieces.forEach((units, i) => {
            const x = (i - (next.pieces.length - 1) / 2) * 2;
            const m = box(
              `beam-piece-${units}`,
              x,
              0.69,
              0.72,
              units * 0.55,
              0.22,
              0.7,
              palette.deck,
            );
            m.isPickable = true;
            m.metadata = { worldAction: { kind: "add-piece", units } };
            for (let j = 1; j < units; j++)
              box(
                `beam-piece-${units}-division-${j}`,
                x - units * 0.275 + j * 0.55,
                0.807,
                0.72,
                0.018,
                0.012,
                0.68,
                palette.darkTeal,
              );
            label(
              `beam-label-${units}`,
              `${units}/8 beam`,
              x,
              1.12,
              0.56,
              1.6,
              0.45,
              { kind: "add-piece", units },
            );
          });
          pieces = new TransformNode("learner-bridge-pieces", scene);
          pieces.parent = root;
          const stationX = -3.2 + length + 1.2;
          box(
            "rescue-signal-post",
            stationX,
            1.02,
            6.6,
            0.12,
            0.92,
            0.12,
            palette.darkTeal,
          );
          box(
            "rescue-signal-base",
            stationX,
            0.62,
            6.6,
            0.4,
            0.14,
            0.4,
            palette.brass,
          );
          committed = MeshBuilder.CreateSphere(
            "bridge-progress-station",
            { diameter: 0.35, segments: 16 },
            scene,
          );
          committed.parent = root;
          committed.position.set(stationX, 1.55, 6.6);
          committed.material = green;
          committed.isPickable = false;
          label("undo-beam", "Undo beam", -2.1, 1.0, -0.25, 1.7, 0.4, {
            kind: "remove-piece",
          });
        } else {
          box("relay-board", 0, 1.015, 4, 6.5, 0.08, 3.5, palette.deck);
          label(
            "relay-rule",
            `${next.gate.toUpperCase()} relay · goal: power ${next.goal ? "on" : "off"}`,
            0,
            2.7,
            5.55,
            4.8,
            0.6,
          );
          for (const index of [0, 1] as const) {
            const x = index ? 1.65 : -1.65;
            const pivot = MeshBuilder.CreateCylinder(
              `relay-${index}-pivot`,
              { height: 0.17, diameter: 0.48, tessellation: 20 },
              scene,
            );
            pivot.parent = root;
            pivot.position.set(x, 1.3, 3.1);
            pivot.material = palette.darkTeal;
            pivot.isPickable = false;
            const lever = new TransformNode(`relay-${index}-lever`, scene);
            lever.parent = root;
            lever.position.set(x, 1.35, 3.1);
            const stem = box(
              `relay-${index}-stem`,
              0,
              0.22,
              0,
              0.12,
              0.48,
              0.12,
              palette.brass,
              lever,
            );
            const knob = MeshBuilder.CreateSphere(
              `relay-${index}-switch`,
              { diameter: 0.35, segments: 16 },
              scene,
            );
            knob.parent = lever;
            knob.position.y = 0.47;
            knob.scaling.set(1, 0.8, 1);
            knob.material = palette.darkTeal;
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
              { diameter: 0.34, segments: 16 },
              scene,
            );
            lamp.parent = root;
            lamp.position.set(x, 1.53, 4.8);
            lamp.material = red;
            lamp.isPickable = false;
            lamps.push(lamp);
            label(
              `relay-label-${index}`,
              `Relay ${index ? "B" : "A"}${fixed ? " · fixed" : ""}`,
              x,
              2.07,
              2.95,
              1.6,
              0.4,
              fixed ? undefined : { kind: "switch", index },
            );
            tube(
              `relay-wire-${index}`,
              [
                new Vector3(x, 1.1, 4.8),
                new Vector3(x, 1.1, 5.0),
                new Vector3(0, 1.1, 5.0),
              ],
              palette.brass,
            );
          }
          output = MeshBuilder.CreateSphere(
            "circuit-test-lamp",
            { diameter: 0.6, segments: 20 },
            scene,
          );
          output.parent = root;
          output.position.set(0, 1.82, 4.7);
          output.material = red;
          output.isPickable = false;
          label("test-signal-label", "TEST SIGNAL", 0, 2.28, 4.6, 1.8, 0.38);
          if (next.goal) {
            // The lantern lens is the accepted outcome; the bench preview cannot light it.
            committed = MeshBuilder.CreateSphere(
              "accepted-mission-light",
              { diameter: 1.02, segments: 20 },
              scene,
            );
            committed.position.set(3.6, 3.99, 8.1);
            committed.scaling.y = 0.7;
            beacon = MeshBuilder.CreateCylinder(
              "accepted-mission-beam",
              {
                height: 3.5,
                diameterBottom: 0.08,
                diameterTop: 1.4,
                tessellation: 20,
              },
              scene,
            );
            beacon.parent = root;
            beacon.position.set(5.35, 3.99, 8.1);
            beacon.rotation.z = -Math.PI / 2;
            const glow = material("beacon-glow", "#f9dda0");
            glow.alpha = 0.12;
            glow.alphaMode = Constants.ALPHA_ADD;
            glow.emissiveColor = Color3.FromHexString("#f9dda0");
            glow.disableLighting = true;
            beacon.material = glow;
            beacon.isPickable = false;
          } else {
            // A hinge at the jamb makes the service door open into the actual building.
            committed = createSoftBox(
              "maintenance-hatch",
              1.03,
              1.45,
              0.12,
              scene,
            );
            committed.position.set(-3.8, 1.23, 6.57);
            box(
              "maintenance-hatch-handle",
              0.32,
              0.02,
              -0.1,
              0.07,
              0.26,
              0.08,
              palette.brass,
              committed,
            );
          }
          committed.parent = root;
          committed.material = palette.teal;
          committed.isPickable = false;
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
            complete
              ? art!.materials.deck
              : i % 2
                ? art!.materials.wood
                : art!.materials.teal,
            pieces,
          );
          // Equal eighth divisions remain visible even on a multi-unit piece.
          for (let part = 1; part < units; part++)
            box(
              `placed-beam-${i}-division-${part}`,
              -3.2 + (span + part) * 0.8,
              0.768,
              4.5,
              0.018,
              0.012,
              1.3,
              art!.materials.darkTeal,
              pieces,
            );
          for (const x of [
            -3.2 + span * 0.8 + 0.1,
            -3.2 + (span + units) * 0.8 - 0.1,
          ])
            for (const z of [3.97, 5.03]) {
              const bolt = MeshBuilder.CreateCylinder(
                `placed-beam-${i}-bolt`,
                { diameter: 0.055, height: 0.025, tessellation: 8 },
                scene,
              );
              bolt.parent = pieces;
              bolt.position.set(x, 0.78, z);
              bolt.material = art!.materials.brass;
              bolt.isPickable = false;
            }
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
          committed.material = complete ? green : art!.materials.teal;
          if (!task!.goal) {
            committed.rotation.y = complete ? -Math.PI / 2 : 0;
            committed.position.x = complete ? -4.32 : -3.8;
            committed.position.z = complete ? 7.08 : 6.57;
          }
          if (beacon) beacon.setEnabled(complete);
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
