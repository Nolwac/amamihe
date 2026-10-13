import { createResourceStations } from "./resourceStations";
import { configureCameraControls } from "./cameraControls";
import { useEffect, useRef } from "react";
import { createBillboards } from "./billboards";
import type { Billboard } from "./billboardPresence";
import { createPeerRenderer } from "./peerScene";
import { publishPosition } from "./socialPresence";
import { gameAudio } from "./gameAudio";
import type { Presence } from "../shared/social";
import { nextRenderHeight } from "../shared/rendering";
import type { CourseResource, Theme } from "../shared/course";
import {
  advanceAdventureRuntime,
  adventureFrame,
  applyAdventureTask,
  createAdventureRuntime,
  type AdventureState,
} from "../shared/adventure-runtime";
import {
  loadCourseHumans,
  type CourseHuman,
  type HumanPose,
} from "./courseActors";
import { createCourseEnvironment, createGuardian } from "./courseEnvironment";
import "@babylonjs/core/Culling/ray";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

export type SceneGame = {
  status: string;
  remaining: number;
  budget: number;
  progress: number;
  choice: number | null;
  boost: number;
  reducedMotion: boolean;
  adventure?: AdventureState;
  stepKey?: string;
  run?: number;
  elapsedMs?: number;
  activity?: { id: string; correct: boolean; independent: boolean };
};
/** Tutor preview and published adventures share real rigs, geometry and physics. */
export default function CourseScene({
  theme,
  worldStyle,
  outfit = "terracotta",
  game,
  onReady,
  renderHeight = 360,
  onChoose,
  peers = [],
  billboards = [],
  presenceSpace,
  resources = [],
  selectedResource,
  onResource,
}: {
  resources?: CourseResource[];
  selectedResource?: string;
  onResource?: (id: string) => void;
  worldStyle?: import("../shared/course").WorldStyle;
  theme: Theme;
  outfit?: string;
  game?: SceneGame;
  onReady?: () => void;
  renderHeight?: number;
  onChoose?: (index: number) => void;
  peers?: Presence[];
  billboards?: Billboard[];
  presenceSpace?: { courseId: string; levelId: string };
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({
    game,
    onReady,
    renderHeight,
    onChoose,
    peers,
    billboards,
    presenceSpace,
    resources,
    selectedResource,
    onResource,
  });
  live.current = {
    game,
    onReady,
    renderHeight,
    onChoose,
    peers,
    billboards,
    presenceSpace,
    resources,
    selectedResource,
    onResource,
  };
  const resizeLive = useRef<() => void>(() => {});
  useEffect(() => resizeLive.current(), [renderHeight]);
  useEffect(() => {
    const element = canvas.current!;
    let disposed = false;
    let release: (() => void) | undefined;
    const initialize = () => {
      if (disposed) return;
      const engine = new Engine(element, true, {
        preserveDrawingBuffer: false,
        stencil: false,
        powerPreference: "low-power",
      });
      const scene = new Scene(engine);
      if (live.current.game) gameAudio.setTheme(theme);
      const temple = theme === "temple-chase",
        boxing = theme === "wrestling";
      scene.clearColor = Color4.FromHexString(
        worldStyle
          ? "#c6e3d6ff"
          : temple
            ? "#142b2fff"
            : boxing
              ? "#26383fff"
              : "#adc9ceff",
      );
      const camera = new ArcRotateCamera(
        "adventure-follow-camera",
        temple ? -Math.PI / 2 + 0.3 : boxing ? 0.15 : -Math.PI / 2,
        temple ? 1.35 : boxing ? 1.25 : 1.24,
        temple ? 12 : boxing ? 8.5 : 9,
        new Vector3(0, 1.8, boxing ? 3.3 : 2.3),
        scene,
      );
      camera.lowerRadiusLimit = 7;
      if (temple) camera.fov = 0.9;
      camera.upperRadiusLimit = 15;
      camera.lowerBetaLimit = 0.55;
      camera.upperBetaLimit = 1.45;
      configureCameraControls(camera);
      camera.attachControl(element, true);
      camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
      const light = new HemisphericLight(
        "adventure-sky",
        new Vector3(0.3, 1, -0.4),
        scene,
      );
      light.intensity = temple ? 1.25 : 1.1;
      light.groundColor = Color3.FromHexString("#6b6860");
      const environment = createCourseEnvironment(scene, theme, worldStyle);
      const stations = createResourceStations(scene);
      const guardian = createGuardian(scene);
      guardian.root.setEnabled(temple && worldStyle !== "story-trail");
      const guardianMeshes = new Set(guardian.root.getChildMeshes());
      const synchronizeAds = createBillboards(
        scene,
        () => live.current.billboards,
        true,
      );
      const synchronizePeers = createPeerRenderer(
        scene,
        () => live.current.peers,
        boxing ? 0.5 : 0.02,
      );
      const gold = new StandardMaterial("answer-gold", scene);
      gold.diffuseColor = Color3.FromHexString("#eab759");
      gold.emissiveColor = Color3.FromHexString("#5b3a16");
      const teal = new StandardMaterial("answer-teal", scene);
      teal.diffuseColor = Color3.FromHexString("#408d86");
      const fill = new StandardMaterial("answer-gate-fill", scene);
      fill.diffuseColor = Color3.FromHexString("#3b9689");
      fill.alpha = 0.14;
      const gates = [-1.7, 0, 1.7].map((x, index) => {
        const ring = MeshBuilder.CreateTorus(
          `answer-gate-${index}`,
          { diameter: 1.3, thickness: 0.07, tessellation: 16 },
          scene,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, 1.1, 7);
        ring.material = teal;
        ring.metadata = { answerIndex: index };
        const surface = MeshBuilder.CreateDisc(
          `answer-gate-surface-${index}`,
          { radius: 0.6, tessellation: 16, sideOrientation: Mesh.DOUBLESIDE },
          scene,
        );
        surface.position.copyFrom(ring.position);
        surface.material = fill;
        surface.metadata = { answerIndex: index };
        return { ring, surface };
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
        const bounds = element.getBoundingClientRect();
        const picked = scene.pick(
          event.clientX - bounds.left,
          event.clientY - bounds.top,
          (mesh) =>
            Number.isInteger(mesh.metadata?.answerIndex) ||
            Boolean(mesh.metadata?.resourceId),
          false,
          camera,
        );
        const resourceId = picked?.pickedMesh?.metadata?.resourceId;
        if (resourceId) {
          live.current.onResource?.(resourceId);
          return;
        }
        if (live.current.game?.status !== "active") return;
        const index = picked?.pickedMesh?.metadata?.answerIndex;
        element.dataset.lastGatePick = picked?.pickedMesh?.name || "none";
        element.dataset.gateChoiceIndex = String(index);
        element.dataset.gateCallback = String(Boolean(live.current.onChoose));
        if (Number.isInteger(index)) live.current.onChoose?.(index);
      };
      element.addEventListener("pointerdown", press);
      element.addEventListener("pointerup", choose);
      let adaptiveHeight = 360;
      const resize = () => {
        engine.setHardwareScalingLevel(
          Math.max(
            1,
            element.clientHeight /
              (live.current.renderHeight || adaptiveHeight),
          ),
        );
        camera.viewport = new Viewport(0, 0, 1, 1);
        engine.resize();
      };
      resizeLive.current = resize;
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      let player: CourseHuman | undefined, opponent: CourseHuman | undefined;
      let state = createAdventureRuntime(theme, { assist: true });
      let received: AdventureState | undefined,
        receivedAt = performance.now();
      let motionTime = 0,
        trackOrigin = 0;
      let followYaw = 0.3;
      let followBeta = 1.35;
      let previousStep = live.current.game?.stepKey,
        previousRun = live.current.game?.run;
      let lastActivity: string | undefined,
        activityAt = -Infinity,
        activityCorrect = false;
      let lastActionSerial = -1,
        collisionId: string | undefined,
        previewTask = 0;
      let pose: HumanPose = {
        active: false,
        time: 0,
        mode: "idle",
        speed: 0,
        strike: 0,
        recoil: 0,
        reducedMotion: false,
      };
      let lastFrame = performance.now(),
        lastRender = 0,
        sampleStart = performance.now(),
        sampleFrames = 0;
      const events: { type: string; time: number; id?: string }[] = [];
      const event = (type: string, id?: string) => {
        events.push({ type, time: motionTime, ...(id ? { id } : {}) });
        if (events.length > 12) events.shift();
      };
      let hiddenAt = 0;
      const visibility = () => {
        if (document.hidden) {
          hiddenAt = performance.now();
          if (live.current.game)
            gameAudio.setMovement({ active: false, speed: 0, theme });
        } else {
          receivedAt += hiddenAt ? performance.now() - hiddenAt : 0;
          hiddenAt = 0;
          lastFrame = performance.now();
        }
      };
      document.addEventListener("visibilitychange", visibility);
      let audioStatus = live.current.game?.status;
      let renderedStatus = live.current.game?.status ?? "preview";
      let clearedAt = -Infinity;
      type DiagnosticCanvas = HTMLCanvasElement & {
        getAdventureSnapshot?: () => unknown;
      };
      const identity = Matrix.Identity();
      const projectPoint = (
        point: Vector3,
        transform = scene.getTransformMatrix(),
        viewport = camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        ),
      ) => {
        const projected = Vector3.Project(point, identity, transform, viewport);
        return [
          (projected.x / engine.getRenderWidth()) * element.clientWidth,
          (projected.y / engine.getRenderHeight()) * element.clientHeight,
          projected.z,
        ];
      };
      const projectActor = (
        root: import("@babylonjs/core/Meshes/transformNode").TransformNode,
        deformed = false,
      ) => {
        const points: number[][] = [];
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        const worldPoint = new Vector3();
        const transform = scene.getTransformMatrix();
        const viewport = camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        );
        for (const mesh of root.getChildMeshes()) {
          if (!mesh.isEnabled() || !mesh.isVisible) continue;
          mesh.computeWorldMatrix(true);
          if (deformed && mesh instanceof Mesh) {
            // Measure the drawn, deformed geometry instead of imported rest-pose
            // bounds. Projecting its eight world corners avoids repeatedly
            // allocating projection matrices for every skinned vertex.
            const positions = mesh.getVerticesData("position");
            if (positions) {
              const matrix = mesh.getWorldMatrix();
              for (let i = 0; i < positions.length; i += 3) {
                Vector3.TransformCoordinatesFromFloatsToRef(
                  positions[i],
                  positions[i + 1],
                  positions[i + 2],
                  matrix,
                  worldPoint,
                );
                min.minimizeInPlace(worldPoint);
                max.maximizeInPlace(worldPoint);
              }
              continue;
            }
          }
          for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
            points.push(projectPoint(corner, transform, viewport));
        }
        if (Number.isFinite(min.x))
          for (const x of [min.x, max.x])
            for (const y of [min.y, max.y])
              for (const z of [min.z, max.z])
                points.push(
                  projectPoint(new Vector3(x, y, z), transform, viewport),
                );
        if (!points.length) return null;
        return {
          min: [
            Math.min(...points.map((point) => point[0])),
            Math.min(...points.map((point) => point[1])),
          ],
          max: [
            Math.max(...points.map((point) => point[0])),
            Math.max(...points.map((point) => point[1])),
          ],
          viewport: [element.clientWidth, element.clientHeight],
        };
      };
      const visibilityPoint = (
        point: Vector3,
        excludedHazard?: string,
        includeGuardian = false,
      ) => {
        const screen = projectPoint(point);
        const direction = point.subtract(camera.position);
        const length = direction.length();
        const ray = new Ray(
          camera.position,
          direction.normalize(),
          Math.max(0, length - 0.1),
        );
        const hit = scene.pickWithRay(
          ray,
          (mesh) =>
            mesh.isEnabled() &&
            mesh.isVisible &&
            (mesh.name.startsWith("world-section-") ||
              (mesh.parent?.name.startsWith("hazard-") === true &&
                mesh.parent.name !== `hazard-${excludedHazard}`) ||
              (includeGuardian && guardianMeshes.has(mesh))),
        );
        return {
          screen,
          inFrame:
            screen[0] >= 0 &&
            screen[0] <= element.clientWidth &&
            screen[1] >= 0 &&
            screen[1] <= element.clientHeight &&
            screen[2] >= 0 &&
            screen[2] <= 1,
          occluded: Boolean(hit?.hit),
          occluder: hit?.pickedMesh?.name ?? null,
        };
      };
      (element as DiagnosticCanvas).getAdventureSnapshot = () => {
        const frame = adventureFrame(state);
        return {
          theme,
          worldStyle,
          gardenFlowers: environment.productCount(),
          status: renderedStatus,
          distance: frame.distance,
          speed: frame.speed,
          animation: pose.mode,
          active: pose.active,
          motionTime,
          actor: player ? { ...player.snapshot(), action: pose.mode } : null,
          opponent: opponent
            ? { ...opponent.snapshot(), health: frame.opponentHealth }
            : null,
          projectedActor: player ? projectActor(player.root, true) : null,
          projectedOpponent: opponent
            ? projectActor(opponent.root, true)
            : null,
          projectedGuardian:
            temple && worldStyle !== "story-trail"
              ? projectActor(guardian.root)
              : null,
          actorVisibility: player
            ? Object.fromEntries(
                ["Head", "Spine2", "Hips", "LeftFoot", "RightFoot"].map(
                  (name) => {
                    const joint = player!.joints.get(name);
                    return [
                      name,
                      joint
                        ? visibilityPoint(
                            joint.getAbsolutePosition(),
                            undefined,
                            true,
                          )
                        : null,
                    ];
                  },
                ),
              )
            : null,
          opponentVisibility: opponent
            ? Object.fromEntries(
                ["Head", "Spine2", "Hips"].map((name) => {
                  const joint = opponent!.joints.get(name);
                  return [
                    name,
                    joint ? visibilityPoint(joint.getAbsolutePosition()) : null,
                  ];
                }),
              )
            : null,
          guardianVisibility:
            temple && worldStyle !== "story-trail"
              ? visibilityPoint(
                  guardian.root.position.add(new Vector3(0, 3.2, 0)),
                )
              : null,
          guardian:
            temple && worldStyle !== "story-trail" ? guardian.snapshot() : null,
          environmentMaterials: scene.meshes
            .filter((mesh) => mesh.name.startsWith("world-section-"))
            .slice(0, 8)
            .map((mesh) => {
              const material = mesh.material as StandardMaterial | null;
              const normals = mesh.getVerticesData("normal");
              const lengths: number[] = [];
              if (normals)
                for (let i = 0; i < Math.min(300, normals.length); i += 3)
                  lengths.push(
                    Math.hypot(normals[i], normals[i + 1], normals[i + 2]),
                  );
              return {
                mesh: mesh.name,
                material: material?.name,
                color: material?.diffuseColor?.asArray(),
                normalLength: lengths.length
                  ? [Math.min(...lengths), Math.max(...lengths)]
                  : null,
                lights: mesh.lightSources.map((light) => light.name),
                effectError:
                  mesh.subMeshes?.[0]?.effect?.getCompilationError() ?? null,
              };
            }),
          obstacles: environment.snapshot(),
          obstacleVisibility: environment.snapshot().map((obstacle) => {
            const min = new Vector3(
              Math.min(...obstacle.colliders.map((box) => box.min[0])),
              Math.min(...obstacle.colliders.map((box) => box.min[1])),
              Math.min(...obstacle.colliders.map((box) => box.min[2])),
            );
            const max = new Vector3(
              Math.max(...obstacle.colliders.map((box) => box.max[0])),
              Math.max(...obstacle.colliders.map((box) => box.max[1])),
              Math.max(...obstacle.colliders.map((box) => box.max[2])),
            );
            return {
              id: obstacle.id,
              kind: obstacle.kind,
              position: obstacle.position,
              cleared: obstacle.cleared,
              visibility: visibilityPoint(min.add(max).scale(0.5), obstacle.id),
            };
          }),
          gateVisibility: gates.map(({ ring }, index) => ({
            index,
            enabled: ring.isEnabled(),
            position: ring.position.asArray(),
            visibility: visibilityPoint(ring.position),
          })),
          camera: {
            position: camera.position.asArray(),
            target: camera.target.asArray(),
          },
          runtime: {
            ...state,
            collision: state.collision ? { ...state.collision } : null,
          },
          frame,
          collision: state.collision ? { ...state.collision } : null,
          strikes: state.strikes,
          obstaclesCleared: state.obstaclesCleared,
          taskProgress: Math.max(
            frame.taskProgress,
            live.current.game?.progress || 0,
          ),
          taskPulse: pose.strike,
          events: events.map((entry) => ({ ...entry })),
        };
      };
      engine.runRenderLoop(() => {
        const now = performance.now();
        if (disposed || document.hidden || now - lastRender < 100) return;
        const dt = Math.min(250, Math.max(0, now - lastFrame));
        lastFrame = now;
        lastRender = now;
        const g = live.current.game;
        if (g?.status === "cleared" && renderedStatus !== "cleared")
          clearedAt = now;
        const active = !g || g.status === "active";
        if (g?.stepKey && g.stepKey !== previousStep) {
          previousStep = g.stepKey;
          previousRun = g.run;
          collisionId = undefined;
        } else if (g && previousRun !== g.run) {
          previousRun = g.run;
          received = undefined;
          collisionId = undefined;
          lastActionSerial = -1;
          event("retry");
        }
        if (g?.adventure !== received && g?.adventure) {
          received = g.adventure;
          receivedAt = now;
          state = received;
        }
        if (g?.activity && g.activity.id !== lastActivity) {
          lastActivity = g.activity.id;
          activityAt = now;
          activityCorrect = g.activity.correct && g.activity.independent;
          event(
            activityCorrect ? "task-correct" : "task-incorrect",
            lastActivity,
          );
          if (g) gameAudio.effect(activityCorrect ? "correct" : "wrong");
        }
        if (received) {
          if (active)
            state = advanceAdventureRuntime(
              received,
              Math.min(5000, now - receivedAt),
            );
        } else if (active) {
          state = advanceAdventureRuntime(state, dt);
          if (!g && Math.floor(state.elapsedMs / 6500) > previewTask) {
            previewTask = Math.floor(state.elapsedMs / 6500);
            state = applyAdventureTask(state, {
              correct: true,
              independent: true,
            });
            if (theme === "wrestling" && state.opponentHealth === 0) {
              state = createAdventureRuntime(theme);
              previewTask = 0;
            }
          }
        }
        const frame = adventureFrame(state),
          activityAge = now - activityAt;
        const activityPulse =
          g?.status !== "paused" && activityAge >= 0 && activityAge < 1100
            ? Math.sin((activityAge / 1100) * Math.PI)
            : 0;
        const celebrating = g?.status === "cleared" && now - clearedAt < 3000;
        const motionActive = active || activityPulse > 0 || celebrating;
        const correctTask =
          activityPulse > 0 ? activityCorrect : state.lastTaskCorrect === true;
        if (motionActive) motionTime += dt / 1000;
        const worldZ = trackOrigin + frame.distance;
        const caught = g?.status === "game-over" || Boolean(frame.collision);
        if (g) {
          gameAudio.setMovement({
            active: active && !caught,
            speed: frame.speed,
            theme,
          });
          if (g.status !== audioStatus) {
            if (g.status === "active") gameAudio.effect("start");
            else if (g.status === "paused") gameAudio.effect("pause");
            else if (g.status === "cleared") gameAudio.effect("clear");
            else if (g.status === "game-over") gameAudio.effect("game-over");
            audioStatus = g.status;
          }
        }
        let mode: HumanPose["mode"] =
          g?.status === "paused"
            ? pose.mode
            : !active
              ? "idle"
              : frame.animation === "jump"
                ? "jump"
                : frame.animation === "slide"
                  ? "slide"
                  : boxing
                    ? "fight"
                    : "run";
        if (caught) mode = "caught";
        else if (activityPulse > 0)
          mode = activityCorrect
            ? boxing
              ? "fight"
              : theme === "workshop"
                ? "work"
                : "jump"
            : "caught";
        else if (g?.status === "cleared") mode = "celebrate";
        if (theme === "workshop" && active && activityPulse <= 0)
          mode = state.elapsedMs % 5000 > 3100 ? "work" : "run";
        pose = {
          active: motionActive,
          time: motionTime,
          mode,
          speed: frame.speed,
          strike: Math.max(
            frame.strikePhase,
            activityCorrect ? activityPulse : 0,
          ),
          recoil: correctTask
            ? Math.max(frame.recoilPhase, activityPulse)
            : frame.recoilPhase,
          reducedMotion: g?.reducedMotion ?? false,
        };
        if (player) {
          player.root.position.set(
            frame.avatar.x,
            // The native Slide rig already lowers its pelvis and feet.
            // Crouch remains authoritative for collision clearance only.
            (boxing ? 0.5 : 0.03) + frame.avatar.y,
            boxing ? 2.4 + pose.strike * 0.18 : worldZ,
          );
          if (
            activityPulse > 0 &&
            activityCorrect &&
            !pose.reducedMotion &&
            !boxing &&
            theme !== "workshop"
          )
            player.root.position.y += activityPulse * 0.7;
          if (theme === "workshop") {
            player.root.position.x =
              mode === "work" ? -2.2 : Math.sin(worldZ / 5) * 0.7;
            player.root.rotation.y = mode === "work" ? -Math.PI / 2 : 0;
          } else player.root.rotation.y = 0;
          player.root.rotation.x = caught ? 0.2 : 0;
          player.setPose(pose);
        }
        if (opponent) {
          const recoil = correctTask
            ? Math.max(frame.recoilPhase, activityPulse)
            : 0;
          opponent.root.position.set(
            boxing ? 0 : 1.65,
            boxing ? 0.5 : 0.03,
            boxing ? 3.6 + recoil * 0.6 : trackOrigin + frame.rivalDistance,
          );
          opponent.root.rotation.y = boxing ? Math.PI : 0;
          opponent.root.rotation.x = boxing ? -recoil * 0.18 : 0;
          opponent.setPose({
            ...pose,
            mode: boxing ? "fight" : "run",
            speed: 6.15,
            strike: boxing && !correctTask ? frame.recoilPhase : 0,
            recoil,
          });
        }
        guardian.update(
          motionTime,
          frame.guardianGap,
          worldZ,
          frame.avatar.x,
          motionActive,
          caught,
          pose.reducedMotion,
        );
        environment.update(
          worldZ,
          motionTime,
          motionActive,
          frame.obstacles,
          Math.max(g?.progress ?? 0, frame.taskProgress),
          pose.strike,
        );
        stations(
          live.current.resources,
          worldZ,
          live.current.selectedResource,
          element.clientWidth < 600,
        );
        element.dataset.resourceScreens = JSON.stringify(
          live.current.resources.slice(0, 4).map((r) => {
            const m = scene.getMeshByName("station-page-" + r.id);
            return {
              id: r.id,
              screen: m ? projectPoint(m.getAbsolutePosition()) : null,
            };
          }),
        );
        element.dataset.resourceStations = JSON.stringify(
          live.current.resources.slice(0, 4).map((r) => r.id),
        );
        camera.target.set(
          boxing
            ? 0
            : temple && element.clientWidth < 600
              ? frame.avatar.x - Math.max(0, frame.guardianGap - 10) * 0.35
              : frame.avatar.x * 0.35,
          1.75,
          boxing ? 3.3 : temple ? worldZ - frame.guardianGap / 2 : worldZ + 2.3,
        );
        if (temple) {
          // A rear quarter view shows the route ahead and the pursuing guardian.
          // On a narrow canvas, a gradual zoom keeps the distant player readable
          // as correct tasks increase the actual separation from the guardian.
          const phone = element.clientWidth < 600;
          const closingGap = Math.max(0, 10 - frame.guardianGap);
          // Rise above the guardian as it closes, with extra elevation when
          // the right lane leaves less room for a clear quarter-view angle.
          const nextFollowBeta = phone
            ? Math.max(
                camera.lowerBetaLimit ?? 0.75,
                1.35 -
                  Math.min(0.3, closingGap * 0.052) -
                  Math.min(0.08, closingGap * 0.015) -
                  // Preserve room above the moving shoulder for the feet as
                  // the player lands after a hurdle, including the stride pose.
                  Math.min(0.18, Math.max(0, closingGap - 3) * 0.09) -
                  Math.max(0, frame.avatar.x) * 0.22,
              )
            : 1.35;
          // A wide closing-gap orbit puts the phone camera behind the gold
          // capitals. Keep its lateral offset inside their open corridor while
          // retaining enough quarter-view separation to see past the guardian.
          const maximumFollowYaw = Math.asin(
            Math.min(
              1,
              Math.max(0, 3.6 - camera.target.x) /
                (camera.radius * Math.sin(nextFollowBeta)),
            ),
          );
          const nextFollowYaw = phone
            ? Math.min(0.3 + closingGap * 0.06, maximumFollowYaw)
            : 0.3;
          // Apply only the chase offset so dragging to orbit remains available.
          camera.alpha += nextFollowYaw - followYaw;
          // The wider closing-gap view rises above the surrounding temple walls.
          camera.beta += nextFollowBeta - followBeta;
          followYaw = nextFollowYaw;
          followBeta = nextFollowBeta;
          camera.fov = phone
            ? 0.82 -
              Math.max(0, frame.guardianGap - 10) * 0.025 -
              Math.min(0.06, closingGap * 0.01)
            : 0.9;
        }
        for (const [index, gate] of gates.entries()) {
          const enabled = Boolean(g) && !boxing && theme !== "workshop";
          gate.ring.setEnabled(enabled);
          gate.surface.setEnabled(enabled);
          gate.ring.position.z = worldZ + 7;
          gate.surface.position.copyFrom(gate.ring.position);
          gate.ring.material =
            g?.choice !== null &&
            g?.choice !== undefined &&
            g.choice % 3 === index
              ? gold
              : teal;
        }
        if (state.actionSerial !== lastActionSerial) {
          if (state.lastAction && state.elapsedMs - state.lastActionMs < 1000) {
            event(state.lastAction);
            if (g && ["jump", "slide", "strike"].includes(state.lastAction))
              gameAudio.effect(state.lastAction as "jump" | "slide" | "strike");
          }
          lastActionSerial = state.actionSerial;
        }
        if (state.collision && state.collision.id !== collisionId) {
          collisionId = state.collision.id;
          event("collision", collisionId);
          if (g) gameAudio.effect("impact");
        }
        synchronizePeers();
        synchronizeAds();
        if (player && live.current.presenceSpace)
          publishPosition({
            space: live.current.presenceSpace.courseId,
            levelId: live.current.presenceSpace.levelId,
            position: {
              x: player.root.position.x,
              z: player.root.position.z,
              heading: player.root.rotation.y,
            },
          });
        scene.render();
        renderedStatus = g?.status ?? "preview";
        sampleFrames++;
        if (now - sampleStart > 3000) {
          const fps = (sampleFrames * 1000) / (now - sampleStart);
          if (!live.current.renderHeight) {
            adaptiveHeight = nextRenderHeight(adaptiveHeight, fps);
            resize();
          }
          element.dataset.fps = String(Math.round(fps));
          sampleStart = now;
          sampleFrames = 0;
        }
        element.dataset.renderHeight = String(engine.getRenderHeight());
        element.dataset.gameStatus = g?.status ?? "preview";
        element.dataset.gameProgress = String(g?.progress || 0);
        element.dataset.gameBoost = String(g?.boost || 0);
        element.dataset.avatarAction = pose.mode;
        const point = Vector3.Project(
          gates[0].ring.position,
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
        element.dataset.sceneReady = "true";
      });
      const reportAssetError = (error: unknown) => {
        if (disposed) return;
        element.dataset.assetError = "true";
        element.dataset.assetErrorMessage =
          error instanceof Error
            ? error.message
            : "The adventure character could not be loaded.";
        console.error(
          "Adventure character loading failed:",
          element.dataset.assetErrorMessage,
        );
      };
      scene.onReadyTimeoutObservable.addOnce(() =>
        reportAssetError(
          new Error(
            "The adventure character and world did not finish preparing within the scene readiness timeout.",
          ),
        ),
      );
      const loaded = loadCourseHumans(
        scene,
        outfit,
        boxing || theme === "racing",
      )
        .then((actors) => {
          if (disposed) return;
          player = actors.player;
          opponent = actors.opponent;
          element.dataset.avatarReady = "true";
          // Readiness may never resolve after a shader error or timeout. Only
          // asset creation must finish before this scene can be disposed.
          void scene
            .whenReadyAsync()
            .then(() => {
              if (!disposed) live.current.onReady?.();
            })
            .catch(reportAssetError);
        })
        .catch(reportAssetError);
      release = () => {
        if (live.current.game)
          gameAudio.setMovement({ active: false, speed: 0, theme });
        delete (element as DiagnosticCanvas).getAdventureSnapshot;
        element.removeEventListener("pointerdown", press);
        element.removeEventListener("pointerup", choose);
        document.removeEventListener("visibilitychange", visibility);
        observer.disconnect();
        engine.stopRenderLoop();
        camera.detachControl();
        void loaded.finally(() => {
          let released = false;
          const finish = () => {
            if (released) return;
            released = true;
            scene.dispose();
            engine.dispose();
          };
          // Pending shader preparation still references this engine. Release
          // after readiness or a bounded timeout, even if readiness never
          // resolves, rather than retaining the scene indefinitely.
          scene.onReadyTimeoutDuration = 15000;
          scene.onReadyTimeoutObservable.addOnce(finish);
          void scene.whenReadyAsync().then(finish, finish);
        });
      };
    };
    // StrictMode's discarded setup must not allocate a context which its
    // delayed loader cleanup could release after the real setup begins.
    queueMicrotask(initialize);
    return () => {
      disposed = true;
      release?.();
    };
  }, [theme, outfit, worldStyle]);
  return (
    <canvas
      key={`${theme}:${outfit}:${worldStyle || "default"}`}
      ref={canvas}
      className="course-scene"
      data-course-theme={theme}
      data-world-style={worldStyle || theme}
      data-geometry-style="soft-bevels"
      aria-label={`3D ${theme.replaceAll("-", " ")} ${game ? "adventure" : "playable theme preview"}. Drag to orbit; use the movement controls during play.`}
      tabIndex={0}
    />
  );
}
