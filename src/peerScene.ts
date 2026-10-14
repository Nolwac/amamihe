import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Presence } from "../shared/social";
import { characterAsset, character, characterId } from "../shared/avatars";
/** Rigged human peers use bounded animation and time-based interpolation. */
export function createPeerRenderer(
  scene: Scene,
  peers: () => Presence[],
  floor = 0,
) {
  let disposed = false;
  const sources = new Map<string, AssetContainer>();
  const loading = new Set<string>();
  const retryAfter = new Map<string, number>();
  const retries = new Map<string, number>();
  const models = new Map<string, TransformNode>();
  const clips = new Map<
    string,
    {
      groups: AnimationGroup[];
      idle?: AnimationGroup;
      walk?: AnimationGroup;
      current?: string;
    }
  >();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = scene.getEngine().getRenderingCanvas();
  if (canvas) canvas.dataset.peerCount = "0";
  scene.onDisposeObservable.addOnce(() => {
    disposed = true;
    for (const source of sources.values()) source.dispose();
  });
  return () => {
    if (disposed) return;
    const visible = peers().slice(0, 7);
    if (!visible.length && !models.size) return;
    const ids = new Set(visible.map((p) => p.id));
    for (const [id, root] of models) {
      const peer = visible.find((p) => p.id === id);
      if (
        !ids.has(id) ||
        root.metadata?.outfit !== peer?.outfit ||
        root.metadata?.name !== peer?.name ||
        root.metadata?.avatar !== characterId(peer?.avatar)
      ) {
        for (const mesh of root.getChildMeshes()) {
          const material = mesh.material;
          if (
            material instanceof StandardMaterial &&
            material.diffuseTexture instanceof DynamicTexture
          )
            material.diffuseTexture.dispose();
          material?.dispose(false, false);
        }
        clips.get(id)?.groups.forEach((group) => group.dispose());
        clips.delete(id);
        root.dispose();
        models.delete(id);
      }
    }
    for (const p of visible) {
      const avatar = characterId(p.avatar);
      const source = sources.get(avatar);
      if (!source) {
        if (
          !loading.has(avatar) &&
          performance.now() >= (retryAfter.get(avatar) || 0)
        ) {
          loading.add(avatar);
          void LoadAssetContainerAsync(characterAsset(avatar), scene)
            .then((asset) => {
              if (disposed) {
                asset.dispose();
                return;
              }
              sources.set(avatar, asset);
              loading.delete(avatar);
            })
            .catch(() => {
              loading.delete(avatar);
              const attempts = (retries.get(avatar) || 0) + 1;
              retries.set(avatar, attempts);
              retryAfter.set(
                avatar,
                performance.now() + Math.min(30000, 5000 * attempts),
              );
            });
        }
        continue;
      }
      let root = models.get(p.id);
      if (!root) {
        root = new TransformNode("peer-" + p.id, scene);
        root.metadata = { outfit: p.outfit, name: p.name, avatar };
        root.position.set(p.x, floor, p.z);
        const instances = source.instantiateModelsToScene(
          (n) => "peer-" + p.id + "-" + n,
          true,
          { doNotInstantiate: true },
        );
        for (const node of instances.rootNodes) {
          node.parent = root;
          if (node instanceof TransformNode)
            node.scaling.scaleInPlace(character(avatar).height);
        }
        const palette: Record<string, string> = {
          terracotta: "#b7603c",
          teal: "#288f83",
          gold: "#d9ab4e",
          azure: "#478ccc",
          plum: "#9964ba",
        };
        const converted = new Map<PBRMaterial, StandardMaterial>();
        for (const m of root.getChildMeshes()) {
          m.isPickable = false;
          if (m instanceof Mesh && m.skeleton) {
            m.makeGeometryUnique();
            m.computeBonesUsingShaders = false;
          }
          if (m.material instanceof PBRMaterial) {
            const original = m.material;
            let simple = converted.get(original);
            if (!simple) {
              simple = new StandardMaterial(
                "peer-material-" + p.id + "-" + original.name,
                scene,
              );
              simple.diffuseColor = original.name.includes("Jacket")
                ? Color3.FromHexString(palette[p.outfit] || palette.teal)
                : original.albedoColor;
              simple.diffuseTexture = original.albedoTexture;
              simple.specularColor = Color3.Black();
              converted.set(original, simple);
            }
            m.material = simple;
          }
        }
        // Instantiation clones PBR materials. Keep shared textures, but release
        // the replaced clones so repeated room changes do not accumulate them.
        for (const original of converted.keys()) original.dispose(false, false);
        const label = MeshBuilder.CreatePlane(
          "peer-label-" + p.id,
          { width: 1.8, height: 0.35 },
          scene,
        );
        label.parent = root;
        label.position.y = 3.3;
        label.billboardMode = Mesh.BILLBOARDMODE_ALL;
        label.isPickable = false;
        const texture = new DynamicTexture(
          "peer-name-" + p.id,
          { width: 256, height: 48 },
          scene,
          false,
        );
        texture.hasAlpha = true;
        texture.drawText(
          p.name,
          8,
          32,
          "bold 24px sans-serif",
          "#fff",
          "#173e3c",
          true,
        );
        const material = new StandardMaterial(
          "peer-name-material-" + p.id,
          scene,
        );
        material.diffuseTexture = texture;
        material.emissiveColor = Color3.White();
        material.disableLighting = true;
        label.material = material;
        const shadow = MeshBuilder.CreateDisc(
          "peer-contact-" + p.id,
          { radius: 0.5, tessellation: 12 },
          scene,
        );
        shadow.parent = root;
        shadow.rotation.x = Math.PI / 2;
        shadow.position.y = 0.05;
        shadow.isPickable = false;
        const shade = new StandardMaterial(
          "peer-contact-material-" + p.id,
          scene,
        );
        shade.diffuseColor = Color3.Black();
        shade.alpha = 0.2;
        shade.disableLighting = true;
        shadow.material = shade;
        clips.set(p.id, {
          groups: instances.animationGroups,
          idle: instances.animationGroups.find((g) => /idle/i.test(g.name)),
          walk: instances.animationGroups.find((g) => /walk/i.test(g.name)),
        });
        models.set(p.id, root);
      }
      const distance = Math.hypot(p.x - root.position.x, p.z - root.position.z);
      const clip = clips.get(p.id)!;
      // At most three peer skeletons animate. Farther peers retain a human pose.
      const focused = visible
        .slice()
        .sort((a, b) => {
          const focus = scene.activeCamera?.position;
          return focus
            ? Math.hypot(a.x - focus.x, a.z - focus.z) -
                Math.hypot(b.x - focus.x, b.z - focus.z)
            : a.id.localeCompare(b.id);
        })
        .slice(0, 3)
        .some((peer) => peer.id === p.id);
      const desired =
        reducedMotion.matches || !focused
          ? "still"
          : distance > 0.08
            ? "walk"
            : "idle";
      if (clip.current !== desired) {
        clip.groups.forEach((g) => g.stop());
        if (desired === "walk") clip.walk?.start(true);
        else if (desired === "idle") clip.idle?.start(true);
        clip.current = desired;
      }
      const alpha =
        1 - Math.exp(-Math.min(scene.getEngine().getDeltaTime(), 250) / 140);
      root.position.x += (p.x - root.position.x) * alpha;
      root.position.z += (p.z - root.position.z) * alpha;
      root.rotation.y +=
        Math.atan2(
          Math.sin(p.heading - root.rotation.y),
          Math.cos(p.heading - root.rotation.y),
        ) * alpha;
    }
    const canvas = scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.dataset.peerCount = String(models.size);
      canvas.dataset.animatedPeerCount = String(
        [...clips.values()].filter((c) => c.current !== "still").length,
      );
    }
  };
}
