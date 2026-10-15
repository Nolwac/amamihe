import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { character, characterAsset, type CharacterId } from "../shared/avatars";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_ior";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular";

export type HumanPose = {
  active: boolean;
  time: number;
  mode:
    | "idle"
    | "walk"
    | "run"
    | "jump"
    | "slide"
    | "fight"
    | "work"
    | "caught"
    | "celebrate";
  speed: number;
  strike: number;
  recoil: number;
  reducedMotion: boolean;
};

export type CourseHuman = {
  root: TransformNode;
  joints: Map<string, TransformNode>;
  setPose: (pose: HumanPose) => void;
  snapshot: () => {
    position: number[];
    rotation: number[];
    bones: Record<string, number[]>;
  };
};

/** One downloaded rig is reused for the player and opponent, with separate bones. */
export async function loadCourseHumans(
  scene: Scene,
  outfit: string,
  withOpponent: boolean,
  avatar: CharacterId = "amani",
) {
  const source = await LoadAssetContainerAsync(characterAsset(avatar), scene);
  if (scene.isDisposed) {
    source.dispose();
    throw new Error("Scene was released while the character loaded.");
  }
  const palette: Record<string, string> = {
    terracotta: "#b76b50",
    teal: "#348b82",
    gold: "#ce9f4d",
    azure: "#478ccc",
    plum: "#9964ba",
  };
  function human(
    name: string,
    color: string,
    asset: AssetContainer,
  ): CourseHuman {
    const instances = asset.instantiateModelsToScene(
      (node) => `${name}-${node}`,
      true,
      { doNotInstantiate: true },
    );
    const root = new TransformNode(name, scene);
    root.scaling.setAll(
      character(
        name === "course-explorer"
          ? avatar
          : avatar === "kofi"
            ? "nia"
            : "kofi",
      ).height,
    );
    instances.rootNodes.forEach((node) => (node.parent = root));
    const converted = new Map<PBRMaterial, StandardMaterial>();
    for (const mesh of root.getChildMeshes()) {
      mesh.isPickable = false;
      if (mesh instanceof Mesh && mesh.skeleton) {
        // CPU skinning is reliable on basic WebGL devices. Each actor owns its
        // geometry so an opponent's deformation cannot overwrite the player.
        mesh.makeGeometryUnique();
        mesh.computeBonesUsingShaders = false;
        // There are at most two local action actors. Their deformed vertices
        // can extend beyond imported rest-pose bounds, especially during jumps.
        mesh.alwaysSelectAsActiveMesh = true;
      }
      if (mesh.material instanceof PBRMaterial) {
        const original = mesh.material;
        let simple = converted.get(original);
        if (!simple) {
          simple = new StandardMaterial(`${name}-${original.name}`, scene);
          simple.diffuseColor = original.name.includes("Jacket")
            ? Color3.FromHexString(color)
            : original.name.includes("Backpack")
              ? Color3.FromHexString(color).scale(0.75)
              : original.albedoColor.clone();
          simple.diffuseTexture = original.albedoTexture;
          simple.specularColor = Color3.Black();
          // A subtle fill keeps clothing readable at 144p without removing
          // directional shading or replacing the human with a silhouette.
          simple.emissiveColor = simple.diffuseColor.scale(
            original.name.includes("Body") ? 0.035 : 0.12,
          );
          converted.set(original, simple);
        }
        mesh.material = simple;
      }
    }
    for (const original of converted.keys()) original.dispose(false, false);
    const joints = new Map<string, TransformNode>();
    for (const node of root.getChildTransformNodes()) {
      const match = node.name.match(/mixamorig:(.+)$/);
      if (match) joints.set(match[1], node);
    }
    const gloves: Mesh[] = [];
    const gloveMaterial = new StandardMaterial(
      `${name}-sparring-gloves`,
      scene,
    );
    gloveMaterial.diffuseColor = Color3.FromHexString(color);
    gloveMaterial.specularColor = Color3.Black();
    for (const hand of ["LeftHand", "RightHand"]) {
      const joint = joints.get(hand);
      if (!joint) continue;
      // The source armature uses centimetres beneath its metre-scale root.
      const glove = MeshBuilder.CreateSphere(
        `${name}-${hand}-glove`,
        { diameter: 17, segments: 6 },
        scene,
      );
      glove.parent = joint;
      glove.position.set(0, 6, 1);
      glove.material = gloveMaterial;
      glove.isPickable = false;
      glove.setEnabled(false);
      gloves.push(glove);
    }
    // AnimationGroup names retain source clip names in Babylon instantiation.
    const clip = (name: string) =>
      instances.animationGroups.find((group) =>
        group.name.toLowerCase().endsWith(name.toLowerCase()),
      );
    let current: AnimationGroup | undefined;
    let pose: HumanPose = {
      active: false,
      time: 0,
      mode: "idle",
      speed: 1,
      strike: 0,
      recoil: 0,
      reducedMotion: false,
    };
    const celebrationBase = new Map<TransformNode, Quaternion>();
    const restoreCelebration = () => {
      for (const [arm, baseline] of celebrationBase)
        arm.rotationQuaternion = baseline.clone();
      celebrationBase.clear();
    };
    scene.onAfterAnimationsObservable.add(() => {
      if (!pose.active || pose.mode !== "celebrate") return;
      for (const [name, direction] of [
        ["LeftArm", -1],
        ["RightArm", 1],
      ] as const) {
        const arm = joints.get(name);
        if (arm?.rotationQuaternion) {
          // Cache the sampled Idle pose once. Seeking, a paused clip or a
          // finished animation must never compound the previous frame's pose.
          let baseline = celebrationBase.get(arm);
          if (!baseline) {
            baseline = arm.rotationQuaternion.clone();
            celebrationBase.set(arm, baseline);
          }
          arm.rotationQuaternion = baseline.multiply(
            Quaternion.RotationAxis(Vector3.Forward(), direction * 2),
          );
        }
      }
    });
    return {
      root,
      joints,
      setPose(next) {
        if (pose.mode === "celebrate" && next.mode !== "celebrate")
          restoreCelebration();
        pose = next;
        gloves.forEach((glove) => glove.setEnabled(next.mode === "fight"));
        const clipName =
          next.mode === "walk"
            ? "Walk"
            : next.mode === "run"
              ? "Run"
              : next.mode === "jump"
                ? "Jump"
                : next.mode === "slide"
                  ? "Slide"
                  : next.mode === "work"
                    ? "Build"
                    : next.mode === "caught"
                      ? "Hit"
                      : next.mode === "fight"
                        ? next.strike > 0.02
                          ? "Jab"
                          : next.recoil > 0.02
                            ? "Hit"
                            : "Guard"
                        : "Idle";
        const desired = clip(clipName);
        const loop = ["Run", "Walk", "Idle", "Guard", "Build"].includes(
          clipName,
        );
        if (desired !== current) {
          current?.stop();
          current = desired;
          current?.start(loop, 1);
          current?.goToFrame(current.from);
          if (next.mode === "caught" && !next.active)
            current?.goToFrame(
              current.from + (current.to - current.from) * 0.65,
            );
        }
        if (current) {
          current.speedRatio =
            next.mode === "walk"
              ? Math.max(0.7, Math.min(1.6, next.speed / 2.4))
              : next.mode === "run"
                ? next.reducedMotion
                  ? 0.65
                  : Math.max(0.75, Math.min(1.8, next.speed / 4.6))
                : next.mode === "jump"
                  ? 1 / 1.4
                  : next.mode === "slide"
                    ? 1 / 1.3
                    : 1;
          if (next.active && !current.isPlaying) current.play(loop);
          if (!next.active && current.isPlaying) current.pause();
        }
      },
      snapshot() {
        root.computeWorldMatrix(true);
        const bones: Record<string, number[]> = {};
        for (const name of [
          "Hips",
          "Spine",
          "LeftArm",
          "RightArm",
          "LeftUpLeg",
          "RightUpLeg",
          "LeftLeg",
          "RightLeg",
          "LeftFoot",
          "RightHand",
        ]) {
          const node = joints.get(name);
          if (node)
            bones[name] = Array.from(node.computeWorldMatrix(true).asArray());
        }
        return {
          position: root.position.asArray(),
          animation: current?.name,
          animationFrame: current?.getCurrentFrame(),
          rotation: root.rotation.asArray(),
          bones,
          materials: root
            .getChildMeshes()
            .filter((mesh) => mesh.material instanceof StandardMaterial)
            .map((mesh) => {
              const material = mesh.material as StandardMaterial;
              const normals = mesh.getVerticesData("normal");
              const normalLengths: number[] = [];
              if (normals)
                for (let i = 0; i < Math.min(normals.length, 300); i += 3)
                  normalLengths.push(
                    Math.hypot(normals[i], normals[i + 1], normals[i + 2]),
                  );
              return {
                mesh: mesh.name,
                material: material.name,
                color: material.diffuseColor.asArray(),
                textureReady: material.diffuseTexture?.isReady() ?? true,
                normalLength: normalLengths.length
                  ? [Math.min(...normalLengths), Math.max(...normalLengths)]
                  : null,
                lights: mesh.lightSources.map((light) => light.name),
                effectError:
                  mesh.subMeshes?.[0]?.effect?.getCompilationError() ?? null,
                visible: mesh.isEnabled(),
              };
            }),
        };
      },
    };
  }
  const player = human(
    "course-explorer",
    palette[outfit] || palette.terracotta,
    source,
  );
  const opponentSource = withOpponent
    ? await LoadAssetContainerAsync(
        characterAsset(avatar === "kofi" ? "nia" : "kofi"),
        scene,
      )
    : undefined;
  if (scene.isDisposed) {
    source.dispose();
    opponentSource?.dispose();
    throw new Error("Scene was released while the opponent loaded.");
  }
  const opponent = opponentSource
    ? human("course-opponent", "#597da7", opponentSource)
    : undefined;
  scene.onDisposeObservable.addOnce(() => {
    source.dispose();
    opponentSource?.dispose();
  });
  return { player, opponent };
}
