import { createSoftBox } from "./softGeometry";
import { usesEquippedFabric } from "./avatarMaterials";
import { createCityStreets } from "./cityStreets";
import {
  cityCameraWalls,
  resolveCityCamera,
  type ResolvedCityCamera,
} from "./cityCamera";
import { character, characterAsset, type CharacterId } from "../shared/avatars";
import {
  cityHouses,
  cityPath,
  followCityRoute,
  coursePorchSteps,
  cityStandingHeight,
  walkCity,
  CITY_STATION,
} from "../shared/city-layout";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue";
import { createPoliceScene } from "./policeScene";
import {
  createPoliceTransport,
  advancePoliceTransport,
  type PoliceTransport,
} from "../shared/police-transport";
import { configureCameraControls } from "./cameraControls";
import { cameraRelativeMovement } from "../shared/movement";
import { createBillboards } from "./billboards";
import { gameAudio } from "./gameAudio";
import { useBillboards, type Billboard } from "./billboardPresence";
import { createPeerRenderer } from "./peerScene";
import { publishPosition } from "./socialPresence";
import type { Presence } from "../shared/social";
import { resourcePath } from "./rendering";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_ior";
import "@babylonjs/loaders/glTF/2.0/Extensions/KHR_materials_specular";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

type Props = {
  onAdvertisement?: (advertisement: Billboard) => void;
  peers?: Presence[];
  mode?: "world" | "avatar";
  paused?: boolean;
  enforcementStatus?: string;
  detentionId?: string;
  outfit: string;
  avatar?: CharacterId;
  quality: string;
  courses?: { id: string; title: string }[];
  destination?: string | null;
  onNavigationEnd?: (id: string, arrived: boolean) => void;
  onHouse: (name: string) => void;
  onReady: (stats: {
    fps: number;
    meshes: number;
    x: number;
    z: number;
    heading: number;
    avatarReady: boolean;
    gateX: number;
    gateY: number;
    gateWidth: number;
    gateVisible: boolean;
  }) => void;
};
export default function World({
  mode = "world",
  paused = false,
  enforcementStatus,
  detentionId,
  outfit,
  avatar = "amani",
  quality,
  courses = [],
  destination,
  onNavigationEnd,
  onHouse,
  onReady,
  onAdvertisement,
  peers = [],
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    houseCb = useRef(onHouse),
    adCb = useRef(onAdvertisement),
    statsCb = useRef(onReady),
    pausedRef = useRef(paused);
  const enforcement = useRef({ status: enforcementStatus, id: detentionId });
  const navigation = useRef({ destination, onNavigationEnd });
  navigation.current = { destination, onNavigationEnd };
  enforcement.current = { status: enforcementStatus, id: detentionId };
  const ads = useBillboards();
  const adRef = useRef(ads);
  adRef.current = ads;
  const peerRef = useRef(peers);
  peerRef.current = peers;
  houseCb.current = onHouse;
  adCb.current = onAdvertisement;
  statsCb.current = onReady;
  useLayoutEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    let disposed = false;
    let release = () => {};
    const houses = cityHouses([
      { id: STORYTELLING_COURSE_ID, title: "Build a Small Language Model" },
      ...courses,
    ]);
    // Room changes must not depend on rendering: a directory can pause the
    // city as soon as it mounts after a learner leaves a course.
    if (mode === "world")
      publishPosition({
        space: "city",
        position: { x: 0, z: -5, heading: 0 },
      });
    const yieldToInterface = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));
    canvas.current!.dataset.sceneMode = mode;
    canvas.current!.dataset.sceneQuality = quality;
    canvas.current!.dataset.geometryStyle = "soft-bevels";
    canvas.current!.dataset.courseHouses = JSON.stringify(
      houses.map((course) => course.id),
    );
    canvas.current!.dataset.character = avatar;
    canvas.current!.dataset.cityHouseLocations = JSON.stringify(houses);
    canvas.current!.dataset.avatarReady = "false";
    canvas.current!.dataset.avatarAnimation = "Loading";
    canvas.current!.dataset.avatarBones = "0";
    canvas.current!.dataset.residentsReady =
      mode === "avatar" ? "true" : "false";
    const initialize = async () => {
      await yieldToInterface();
      if (disposed) return;
      const engine = new Engine(canvas.current!, true, {
        stencil: false,
        // Retain the last frame between capped renders and browser snapshots.
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      });
      const softwareRendering = /swiftshader|llvmpipe|software/i.test(
        engine.getGlInfo().renderer,
      );
      canvas.current!.dataset.softwareRendering = String(softwareRendering);
      const targetRenderHeight =
        quality === "low"
          ? mode === "avatar"
            ? 540
            : 360
          : quality === "medium"
            ? 720
            : 1080;
      const scaleResolution = () => {
        const preferredHeight =
          quality === "low" &&
          document.documentElement.dataset.dataSaver === "true" &&
          mode === "world"
            ? 144
            : targetRenderHeight;
        engine.setHardwareScalingLevel(
          Math.max(1, canvas.current!.clientHeight / preferredHeight),
        );
        canvas.current!.dataset.renderHeight = String(engine.getRenderHeight());
      };
      scaleResolution();
      const scene = new Scene(engine);
      const synchronizeAds = createBillboards(scene, () =>
        mode === "world" ? adRef.current : [],
      );
      const synchronizePeers = createPeerRenderer(scene, () => peerRef.current);
      scene.onPointerObservable.add((event) => {
        if (
          event.type === 1 &&
          event.pickInfo?.pickedMesh?.metadata?.advertisement
        )
          adCb.current?.(event.pickInfo.pickedMesh.metadata.advertisement);
      });
      const releaseScene = () => {
        engine.stopRenderLoop();
        scene.detachControl();
        const finish = () => {
          scene.dispose();
          engine.dispose();
        };
        // Pending shader preparation still references the engine pipeline.
        scene.onReadyTimeoutDuration = 15000;
        scene.onReadyTimeoutObservable.addOnce(finish);
        void scene.whenReadyAsync().then(finish, finish);
      };
      release = releaseScene;
      scene.skipPointerMovePicking = true;
      scene.pointerDownPredicate = scene.pointerUpPredicate = (mesh) =>
        Boolean(mesh.metadata?.course && mesh.isEnabled() && mesh.isVisible);
      // Low uses contact shadows and static lighting, preserving the same 3D world.
      scene.shadowsEnabled = quality !== "low" && !softwareRendering;

      scene.clearColor = new Color4(0.72, 0.83, 0.88, 1);
      scene.ambientColor = new Color3(0.18, 0.2, 0.22);
      scene.imageProcessingConfiguration.toneMappingEnabled = quality !== "low";
      scene.imageProcessingConfiguration.toneMappingType = 1;
      scene.imageProcessingConfiguration.contrast = 1.08;
      const envFaces = Array.from({ length: 6 }, (_, face) => {
        const bytes = new Uint8Array(16 * 16 * 4);
        for (let i = 0; i < 256; i++) {
          const intensity =
            face === 2
              ? 0.8
              : face === 3
                ? 0.23
                : 0.5 + ((15 - Math.floor(i / 16)) / 15) * 0.16;
          bytes.set(
            [intensity * 240, intensity * 238, intensity * 225, 255],
            i * 4,
          );
        }
        return bytes;
      });
      scene.environmentTexture = new RawCubeTexture(
        scene,
        envFaces,
        16,
        Constants.TEXTUREFORMAT_RGBA,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
        true,
      );
      scene.environmentTexture.gammaSpace = false;
      scene.environmentIntensity = 0.45;
      scene.fogMode = Scene.FOGMODE_LINEAR;
      scene.fogStart = 45;
      scene.fogEnd = 110;
      scene.fogColor = new Color3(0.85, 0.86, 0.81);
      const ambient = new HemisphericLight(
        "warm-sky",
        new Vector3(0, 1, 0),
        scene,
      );
      ambient.intensity = quality === "low" ? 0.8 : 0.66;
      ambient.groundColor = new Color3(0.26, 0.22, 0.19);
      const sun = new DirectionalLight(
        "late-afternoon",
        new Vector3(0.65, -1.3, 0.5),
        scene,
      );
      sun.intensity = quality === "low" ? 0.68 : 0.92;
      sun.position.set(-18, 28, -18);
      const shadows = new ShadowGenerator(quality === "low" ? 1024 : 2048, sun);
      shadows.usePercentageCloserFiltering = quality !== "low";
      shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
      shadows.bias = 0.002;
      shadows.normalBias = 0.025;
      shadows.setDarkness(0.22);
      const shadowMap = shadows.getShadowMap()!;
      if (quality === "low") shadowMap.refreshRate = 0;
      sun.diffuse = new Color3(1, 0.92, 0.79);
      const camera = new ArcRotateCamera(
        "third-person",
        -Math.PI / 2,
        1.46,
        8.2,
        new Vector3(0, 2, -2),
        scene,
      );
      configureCameraControls(camera);
      camera.attachControl(canvas.current!, true);
      // Arrow keys belong to walking; keep pointer orbit without double input.
      camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
      camera.lowerRadiusLimit = 6.5;
      camera.upperRadiusLimit = 18;
      camera.lowerBetaLimit = 0.85;
      camera.upperBetaLimit = 1.48;
      camera.panningSensibility = 0;
      camera.wheelPrecision = 45;
      camera.minZ = 0.2;
      camera.fov = 0.87;
      let smallScreen =
        canvas.current!.clientWidth < (mode === "avatar" ? 721 : 600);
      if (smallScreen) camera.radius = 9;
      const asset = (file: string) => resourcePath(file);
      const skinTexture = new Texture(
        asset("avatar-skin.jpg"),
        scene,
        false,
        false,
      );
      const fabricTexture = new DynamicTexture(
        "outfit-fabric-" + outfit,
        { width: 256, height: 256 },
        scene,
        true,
      );
      const fabricCtx =
        fabricTexture.getContext() as unknown as CanvasRenderingContext2D;
      fabricCtx.fillStyle =
        outfit === "azure"
          ? "#478ccc"
          : outfit === "plum"
            ? "#9964ba"
            : outfit === "teal"
              ? "#288f83"
              : outfit === "gold"
                ? "#d9ab4e"
                : "#b7603c";
      fabricCtx.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) {
          const x = col * 64,
            y = row * 64;
          fabricCtx.fillStyle = "#e9b75c";
          fabricCtx.beginPath();
          fabricCtx.moveTo(x + 4, y + 4);
          fabricCtx.lineTo(x + 48, y + 4);
          fabricCtx.lineTo(x + 4, y + 45);
          fabricCtx.fill();
          fabricCtx.fillStyle = "#1e4b42";
          fabricCtx.beginPath();
          fabricCtx.moveTo(x + 60, y + 60);
          fabricCtx.lineTo(x + 17, y + 60);
          fabricCtx.lineTo(x + 60, y + 17);
          fabricCtx.fill();
          fabricCtx.strokeStyle = "#f7e0a3";
          fabricCtx.lineWidth = 1.5;
          fabricCtx.beginPath();
          fabricCtx.moveTo(x + 22, y + 15);
          fabricCtx.lineTo(x + 45, y + 38);
          fabricCtx.stroke();
        }
      fabricTexture.update();
      fabricTexture.wrapU = Texture.WRAP_ADDRESSMODE;
      fabricTexture.wrapV = Texture.WRAP_ADDRESSMODE;
      const selectedOutfit = ["terracotta", "teal", "gold"].includes(outfit)
        ? outfit
        : "teal";
      const playerFabric = new Texture(
        asset(`avatar-fabric-${selectedOutfit}.png`),
        scene,
        false,
        false,
      );
      playerFabric.wrapU = playerFabric.wrapV = Texture.WRAP_ADDRESSMODE;
      const materials = new Map<string, StandardMaterial>();
      function mat(name: string, color: string) {
        if (materials.has(name)) return materials.get(name)!;
        const m = new StandardMaterial(name, scene);
        m.diffuseColor = Color3.FromHexString(color);
        m.specularColor = new Color3(0.06, 0.05, 0.035);
        if (quality === "low") {
          m.maxSimultaneousLights = 1;
          m.specularColor = Color3.Black();
        }
        materials.set(name, m);
        return m;
      }
      const stone = mat("sunlit-stone", "#efd0a0"),
        clay = mat("clay", "#cd7044"),
        ochre = mat("ochre", "#dea05a"),
        teal = mat("deep-teal", "#328f86"),
        dark = mat("dark-wood", "#453c2d"),
        gold = mat("gold", "#efb74d"),
        roof = mat("roof", "#b95c3f"),
        pale = mat("cream-trim", "#ffe1a8"),
        glass = mat("window", "#546d70"),
        leaf = mat("leaves", "#708944"),
        leaf2 = mat("leaf-light", "#92a34d"),
        soil = mat("planter", "#a34c32"),
        path = mat("paving", "#d8b37b");
      const plasterTexture = new Texture(asset("world/plaster.webp"), scene);
      for (const wall of [stone, clay, ochre, teal, pale, soil])
        wall.diffuseTexture = plasterTexture;
      dark.diffuseTexture = new Texture(asset("world/wood.webp"), scene);
      const leafTexture = new Texture(asset("world/leaf.webp"), scene);
      leaf.diffuseTexture = leaf2.diffuseTexture = leafTexture;
      const statics: Mesh[] = [];
      function box(
        n: string,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        m: StandardMaterial,
        merge = true,
      ) {
        const b = createSoftBox(n, w, h, d, scene);
        b.position.set(x, y, z);
        b.material = m;
        b.receiveShadows = true;
        if (!merge && n !== "shadow") shadows.addShadowCaster(b);
        if (merge) statics.push(b);
        return b;
      }
      function cylinder(
        n: string,
        x: number,
        y: number,
        z: number,
        diameter: number,
        height: number,
        m: StandardMaterial,
        top = diameter,
        merge = true,
      ) {
        const b = MeshBuilder.CreateCylinder(
          n,
          {
            diameterBottom: diameter,
            diameterTop: top,
            height,
            tessellation: quality === "low" ? 20 : 32,
          },
          scene,
        );
        b.position.set(x, y, z);
        b.material = m;
        b.receiveShadows = true;
        if (!merge && n !== "shadow") shadows.addShadowCaster(b);
        if (merge) statics.push(b);
        return b;
      }
      function sphere(
        n: string,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        m: StandardMaterial,
        merge = true,
      ) {
        const b = MeshBuilder.CreateSphere(
          n,
          { diameter: 1, segments: quality === "low" ? 12 : 20 },
          scene,
        );
        b.scaling.set(w, h, d);
        b.position.set(x, y, z);
        b.material = m;
        b.receiveShadows = true;
        if (!merge && n !== "shadow") shadows.addShadowCaster(b);
        if (merge) statics.push(b);
        return b;
      }
      function label(
        n: string,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        lines: string[],
        bg: string,
        course?: string,
      ) {
        const plane = MeshBuilder.CreatePlane(
          n,
          { width: w, height: h },
          scene,
        );
        plane.position.set(x, y, z);
        const texture = new DynamicTexture(
          n,
          { width: 768, height: Math.max(128, Math.round((768 * h) / w)) },
          scene,
          false,
        );
        const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
        const th = texture.getSize().height;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 768, th);
        ctx.fillStyle = "#ffebc3";
        ctx.textAlign = "center";
        if (n === "ModelMakerssign") {
          ctx.strokeStyle = "#d9bc79";
          ctx.lineWidth = 3;
          ctx.strokeRect(15, 15, 738, th - 30);
          ctx.beginPath();
          ctx.arc(384, 76, 45, 0, Math.PI * 2);
          ctx.stroke();
          ctx.save();
          ctx.translate(357, 46);
          ctx.strokeStyle = "#ffebc3";
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(28, 53);
          ctx.lineTo(28, 44);
          ctx.bezierCurveTo(5, 41, 0, 29, 8, 18);
          ctx.bezierCurveTo(6, 4, 24, -1, 32, 7);
          ctx.bezierCurveTo(48, 1, 62, 16, 53, 32);
          ctx.lineTo(49, 42);
          ctx.lineTo(41, 42);
          ctx.lineTo(40, 54);
          ctx.stroke();
          for (const [x, y] of [
            [19, 13],
            [37, 14],
            [22, 28],
          ]) {
            ctx.beginPath();
            ctx.arc(x, y, 7, 0.1, Math.PI * 1.7);
            ctx.stroke();
          }
          ctx.restore();
          ctx.font = "700 53px Manrope, sans-serif";
          ctx.fillText("Build a Small", 384, 179);
          ctx.fillText("Language Model", 384, 244);
          ctx.textAlign = "left";
          ctx.font = "400 30px DM Sans, sans-serif";
          [
            "Understand the foundations",
            "Explore tokens and training",
            "Learn by doing",
            "Grow your skills",
          ].forEach((line, i) => {
            ctx.fillStyle = "#efbf63";
            ctx.beginPath();
            ctx.roundRect(131, 272 + i * 52, 29, 29, 6);
            ctx.fill();
            ctx.fillStyle = "#f4ecd2";
            ctx.fillText(line, 182, 295 + i * 52);
          });
          // The entrance button is a DOM control projected onto this exact panel.
        } else {
          lines.forEach((l, i) => {
            ctx.font = `${i === 0 ? "600 " : "400 "}${Math.round(Math.min(72, ((th - 32) / lines.length) * 0.78))}px Manrope, sans-serif`;
            while (ctx.measureText(l).width > 690) {
              const fontSize = parseInt(ctx.font.match(/(\d+)px/)![1]);
              ctx.font = `${i === 0 ? "600 " : "400 "}${fontSize - 1}px Manrope, sans-serif`;
            }
            ctx.fillText(l, 384, 32 + ((th - 32) / lines.length) * (i + 0.72));
          });
        }
        texture.update();
        const m = new StandardMaterial(n, scene);
        m.diffuseTexture = texture;
        m.emissiveColor = new Color3(0.34, 0.3, 0.22);
        m.specularColor = Color3.Black();
        plane.material = m;
        if (course) plane.metadata = { course };
        return plane;
      }
      if (mode === "world") {
        box("land", 0, -0.3, 20, 130, 0.6, 160, mat("ground", "#b7ac78"));
        statics.push(...createCityStreets(scene, houses));
        for (let i = 0; i < 13; i++) {
          const x = (i % 2 === 0 ? -1 : 1) * (14 + (i % 3) * 3),
            z = 40 + Math.floor(i / 2) * 7;
          const h = 9 + (i % 4) * 5;
          box("skyline", x, h / 2, z, 6, h, 7, i % 2 ? ochre : stone);
          box("skyline-cap", x, h + 0.15, z, 6.4, 0.3, 7.4, pale);
        }
        async function building(
          name: string,
          x: number,
          z: number,
          w: number,
          h: number,
          m: StandardMaterial,
          course: string,
          title: string[],
          tag: string,
        ) {
          await yieldToInterface();
          if (disposed) return;
          const body = box(
            name,
            x,
            (h + 3.4) / 2 + 0.25,
            z,
            w,
            h - 3.4,
            8,
            m,
            false,
          );
          body.metadata = { course };
          for (const side of [-1, 1]) {
            const wing = box(
              name + "-ground-wing",
              x + side * (w / 4 + 0.9),
              1.8,
              z,
              w / 2 - 1.8,
              3.5,
              8,
              m,
              false,
            );
            wing.metadata = { course };
          }
          box("interior-back-wall", x, 1.75, z + 3.75, w, 3.5, 0.2, pale);
          box("interior-floor", x, 0.28, z, w, 0.12, 8, stone);
          box("studio-desk", x, 1.1, z + 1.5, 2.1, 0.12, 0.8, dark);
          for (const side of [-1, 1])
            box("desk-leg", x + side * 0.8, 0.7, z + 1.5, 0.1, 0.8, 0.7, teal);
          const interiorLamp = mat("interior-lamp", "#ffdf96");
          interiorLamp.emissiveColor = new Color3(0.7, 0.45, 0.15);
          box("pendant", x, 2.65, z + 0.1, 0.5, 0.25, 0.5, interiorLamp);
          cylinder("pendant-cord", x, 3, z + 0.1, 0.025, 0.4, dark);
          const front = z - 4.1;
          box("roof-cornice", x, h + 0.3, z, w + 0.8, 0.45, 8.8, pale);
          box("roof-trim", x, h + 0.65, z, w + 0.3, 0.23, 8.3, roof);
          box(
            "cornice-shadow",
            x,
            h + 0.04,
            front - 0.12,
            w + 0.45,
            0.12,
            0.7,
            mat("recess-shadow", "#7a654d"),
          );
          for (const side of [-1, 1]) {
            box(
              "wall-base",
              x + side * (w / 4 + 0.9),
              0.62,
              front - 0.06,
              w / 2 - 1.8,
              0.55,
              0.32,
              mat("weathered-sandstone", "#c2a175"),
            );
            box(
              "base-cap",
              x + side * (w / 4 + 0.9),
              0.94,
              front - 0.14,
              w / 2 - 1.8,
              0.1,
              0.4,
              pale,
            );
          }
          for (const dx of [-w / 2 + 0.3, w / 2 - 0.3])
            box(
              "facade-column",
              x + dx,
              h / 2,
              front - 0.1,
              0.55,
              h,
              0.38,
              pale,
            );
          if (course === "MODEL MAKERS") {
            // The carved bands are geometry on the facade, not a flattened scene image.
            for (const side of [-1, 1]) {
              const cx = x + side * (w / 2 - 0.3);
              for (let y = 0.5; y < h - 0.7; y += 0.58) {
                for (const direction of [-1, 1]) {
                  const detail = box(
                    "carved-chevron",
                    cx + direction * 0.08,
                    y,
                    front - 0.32,
                    0.07,
                    0.4,
                    0.07,
                    ochre,
                  );
                  detail.rotation.z = direction * 0.57;
                }
              }
              box("column-foot", cx, 0.2, front - 0.1, 0.75, 0.4, 0.6, stone);
            }
          }
          for (let y = 3.5; y < h - 0.5; y += 3) {
            box("floor-trim", x, y, front, w, 0.16, 0.3, pale);
            for (const dx of [-w * 0.29, w * 0.29]) {
              box(
                "window-frame",
                x + dx,
                y + 1.3,
                front - 0.05,
                1.8,
                2,
                0.22,
                pale,
              );
              box(
                "window-glass",
                x + dx,
                y + 1.3,
                front - 0.18,
                1.45,
                1.7,
                0.1,
                glass,
              );
              box(
                "window-bar",
                x + dx,
                y + 1.3,
                front - 0.26,
                0.06,
                1.7,
                0.1,
                gold,
              );
              box(
                "window-sill",
                x + dx,
                y + 0.28,
                front - 0.22,
                2.05,
                0.12,
                0.55,
                pale,
              );
              box(
                "window-crossbar",
                x + dx,
                y + 1.2,
                front - 0.26,
                1.45,
                0.05,
                0.1,
                gold,
              );
              box(
                "window-reflection",
                x + dx + 0.32,
                y + 1.5,
                front - 0.245,
                0.15,
                1.1,
                0.025,
                mat("reflected-sky", "#9ebbb2"),
              );
            }
          }
          for (const dx of [-1.45, 1.45])
            box("door-pillar", x + dx, 1.65, front - 0.4, 0.18, 3.3, 0.5, pale);
          box("door-cap", x, 3.3, front - 0.4, 3.2, 0.3, 0.6, pale);
          for (const side of [-1, 1]) {
            box(
              "entry-wood-frame",
              x + side * 1.18,
              1.72,
              front - 0.42,
              0.1,
              2.95,
              0.14,
              dark,
            );
            box(
              "entry-glass-panel",
              x + side * 1.32,
              1.73,
              front - 0.36,
              0.2,
              2.83,
              0.05,
              glass,
            );
            box(
              "entry-gold-handle",
              x + side * 1.17,
              1.6,
              front - 0.51,
              0.05,
              0.5,
              0.05,
              gold,
            );
          }
          for (const step of coursePorchSteps({ x, z }))
            box(
              "entrance-step",
              step.x,
              step.y,
              step.z,
              step.width,
              step.height,
              step.depth,
              stone,
            );
          box("awning", x, 3.65, front - 0.65, 4, 0.25, 1.5, gold);
          const warmLamp = mat("warm-facade-light", "#ffd788");
          warmLamp.emissiveColor = new Color3(0.8, 0.55, 0.22);
          for (const dx of [-1.4, 0, 1.4])
            box(
              "canopy-downlight",
              x + dx,
              3.48,
              front - 0.88,
              0.14,
              0.03,
              0.18,
              warmLamp,
            );
          const signWidth = course === "MODEL MAKERS" ? w * 0.82 : w * 0.7;
          const signHeight = course === "MODEL MAKERS" ? 6.1 : h * 0.44;
          const signY = course === "MODEL MAKERS" ? 7 : h * 0.64;
          box(
            "sign-border",
            x,
            signY,
            front - 0.4,
            signWidth,
            signHeight,
            0.22,
            gold,
          );
          label(
            name + "sign",
            x,
            signY,
            front - 0.55,
            signWidth - 0.2,
            signHeight - 0.2,
            [...title, tag],
            "#285b52",
            course,
          );
          for (const dx of [-w / 2 + 0.8, w / 2 - 0.8]) {
            cylinder("pot", x + dx, 0.48, front - 0.85, 0.8, 0.72, soil, 0.98);
            broadPlant(x + dx, front - 0.85, 0.85);
          }
          // A recessed roof terrace and climbing greenery add scale and depth.
          for (let dx = -w / 2 + 0.8; dx < w / 2; dx += 1.05)
            box(
              "terrace-baluster",
              x + dx,
              h + 1.12,
              front + 0.1,
              0.055,
              0.84,
              0.055,
              pale,
            );
          box(
            "terrace-handrail",
            x,
            h + 1.55,
            front + 0.1,
            w - 1.1,
            0.075,
            0.075,
            pale,
          );
          for (const side of [-1, 1]) {
            box(
              "roof-planter",
              x + side * (w / 2 - 1.15),
              h + 0.86,
              front + 0.3,
              1.5,
              0.32,
              0.7,
              soil,
            );
            for (let i = 0; i < 5; i++) {
              const vx = x + side * (w / 2 - 1.15) + (i - 2) * 0.27;
              const vy = h + 0.9 - (i % 3) * 0.3;
              sphere(
                "trailing-vine",
                vx,
                vy,
                front - 0.07,
                0.36,
                0.4 + (i % 3) * 0.27,
                0.24,
                i % 2 ? leaf : leaf2,
              );
            }
          }
        }
        for (const house of houses) {
          const title: string[] = [];
          for (const word of house.title.split(/\s+/)) {
            const lastLine = title.length - 1;
            if (lastLine < 0 || title[lastLine].length + word.length > 24)
              title.push(word);
            else title[lastLine] += " " + word;
          }
          await building(
            house.pilot ? "ModelMakers" : "house-" + house.id,
            house.x,
            house.z,
            house.width,
            house.pilot ? 12 : 9,
            house.pilot
              ? teal
              : [clay, stone, ochre][houses.indexOf(house) % 3],
            house.pilot ? "MODEL MAKERS" : "course:" + house.id,
            title,
            "Enter Course →",
          );
        }
        if (disposed) return;
        function foliage(
          name: string,
          leaves: { base: Vector3; tip: Vector3; width: number }[],
          material: StandardMaterial,
        ) {
          const positions: number[] = [],
            indices: number[] = [],
            normals: number[] = [],
            uvs: number[] = [];
          for (const l of leaves) {
            const along = l.tip.subtract(l.base);
            const across = Vector3.Cross(along, new Vector3(0, 1, 0))
              .normalize()
              .scale(l.width);
            const mid = l.base.add(along.scale(0.52));
            mid.y += 0.07;
            const start = positions.length / 3;
            for (const point of [
              l.base,
              mid.add(across),
              l.tip,
              mid.subtract(across),
              mid.add(new Vector3(0, 0.055, 0)),
            ])
              positions.push(point.x, point.y, point.z);
            for (const tri of [
              [0, 4, 1],
              [1, 4, 2],
              [2, 4, 3],
              [3, 4, 0],
            ])
              indices.push(...tri.map((i) => start + i));
            uvs.push(0, 0.5, 0.5, 0, 1, 0.5, 0.5, 1, 0.5, 0.5);
          }
          VertexData.ComputeNormals(positions, indices, normals);
          const data = new VertexData();
          data.positions = positions;
          data.indices = indices;
          data.normals = normals;
          data.uvs = uvs;
          const mesh = new Mesh(name, scene);
          data.applyToMesh(mesh);
          mesh.material = material;
          material.backFaceCulling = false;
          mesh.receiveShadows = true;
          statics.push(mesh);
        }
        function palm(x: number, z: number, scale = 1) {
          const h = 6.2 * scale;
          cylinder(
            "palm-trunk",
            x,
            h / 2,
            z,
            0.3 * scale,
            h,
            dark,
            0.18 * scale,
          );
          for (let i = 0; i < 10; i++)
            cylinder(
              "trunk-ring",
              x,
              (0.8 + i * 0.5) * scale,
              z,
              0.315 * scale,
              0.045 * scale,
              mat("trunk-band", "#8a6b43"),
              0.31 * scale,
            );
          const leaves: { base: Vector3; tip: Vector3; width: number }[] = [];
          for (let i = 0; i < 9; i++) {
            const angle = (i * Math.PI * 2) / 9;
            const radial = new Vector3(Math.cos(angle), 0, Math.sin(angle));
            const side = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
            for (let j = 1; j <= 12; j++) {
              const t = j / 12;
              const stem = new Vector3(
                x,
                h + 0.35 * Math.sin(t * Math.PI) - 0.75 * t * t,
                z,
              ).add(radial.scale(2.7 * t * scale));
              for (const direction of [-1, 1]) {
                const tip = stem
                  .add(
                    side.scale(
                      direction * (0.65 * Math.sin(t * Math.PI) + 0.08) * scale,
                    ),
                  )
                  .add(radial.scale(0.25 * scale));
                tip.y -= 0.13 + t * 0.2;
                leaves.push({ base: stem, tip, width: 0.08 * scale });
              }
            }
          }
          foliage("palm-fronds", leaves, leaf);
          cylinder("tree-bed", x, 0.16, z, 1.2, 0.2, soil, 1.3);
        }
        function broadPlant(x: number, z: number, size = 1) {
          const leaves: { base: Vector3; tip: Vector3; width: number }[] = [];
          for (let i = 0; i < 9; i++) {
            const a = i * 2.399;
            const r = (0.5 + (i % 3) * 0.2) * size;
            leaves.push({
              base: new Vector3(x, 0.55, z),
              tip: new Vector3(
                x + Math.cos(a) * r,
                (1.15 + (i % 3) * 0.25) * size,
                z + Math.sin(a) * r,
              ),
              width: 0.13 * size,
            });
          }
          foliage("broad-leaf-plant", leaves, leaf2);
        }
        for (const [x, z] of [
          [-5.8, -4.7],
          [5.8, -1],
        ]) {
          box("community-planter", x, 0.4, z, 2.1, 0.8, 1.3, pale);
          box("planter-soil", x, 0.82, z, 1.95, 0.05, 1.14, soil);
          for (let i = 0; i < 4; i++) broadPlant(x - 0.7 + i * 0.45, z, 0.7);
        }
        for (const [x, z] of [
          [-6.9, -1],
          [7, 0],
          [-7, 13],
          [7, 16],
          [-7, 30],
          [8, 37],
          [-14, 34],
          [15, 40],
        ])
          palm(x, z, z < 2 ? 0.85 : 1);
        for (const [x, z] of [
          [-5.6, 5],
          [5.8, 13],
          [-5.8, 24],
        ]) {
          cylinder("lamp-post", x, 1.7, z, 0.12, 3.4, dark);
          cylinder("lamp-base", x, 0.24, z, 0.4, 0.35, dark);
          box(
            "lamp-glow",
            x,
            3.4,
            z,
            0.5,
            0.65,
            0.5,
            mat("lantern", "#ffcf70"),
          );
          const top = MeshBuilder.CreateCylinder(
            "lamp-cap",
            {
              diameterBottom: 0.8,
              diameterTop: 0.05,
              height: 0.4,
              tessellation: 4,
            },
            scene,
          );
          top.position.set(x, 3.9, z);
          top.material = teal;
          statics.push(top);
        }
        for (const [x, z] of [
          [-7, 8],
          [7, 20],
        ]) {
          box("bench-seat", x, 0.6, z, 2.5, 0.17, 0.65, dark);
          box("bench-back", x, 1, z + 0.34, 2.5, 0.65, 0.15, dark);
          for (const dx of [-0.9, 0.9])
            box("bench-leg", x + dx, 0.3, z, 0.12, 0.6, 0.5, teal);
        }
        box("billboard-post", 7.6, 4, 18, 0.3, 8, 0.3, dark);
        box("billboard-border", 7.6, 7, 18, 4.5, 3.5, 0.25, gold);
        label(
          "ad",
          7.6,
          7,
          17.84,
          4.3,
          3.3,
          ["COMMUNITY", "A BRIGHTER FUTURE", "STARTS WITH A SKILL"],
          "#b65c38",
        );
        const portal = MeshBuilder.CreateTorus(
          "search-portal",
          { diameter: 4, thickness: 0.22, tessellation: 32 },
          scene,
        );
        portal.position.set(-7, 2.7, 38);
        portal.rotation.x = Math.PI / 2;
        portal.material = mat("portal", "#4ab9b3");
        portal.metadata = { course: "search-portals" };
      }
      if (disposed) return;
      // Contact shadows are inexpensive geometry, not downloaded scene backdrops.
      const shadowMat = mat("contact-shadow", "#443324");
      shadowMat.alpha = 0.55;
      shadowMat.disableLighting = true;
      const contactTexture = new DynamicTexture(
        "soft-contact",
        64,
        scene,
        false,
      );
      const contactCtx =
        contactTexture.getContext() as unknown as CanvasRenderingContext2D;
      const gradient = contactCtx.createRadialGradient(32, 32, 8, 32, 32, 32);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(0.6, "rgba(255,255,255,0.38)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      contactCtx.fillStyle = gradient;
      contactCtx.fillRect(0, 0, 64, 64);
      contactTexture.hasAlpha = true;
      contactTexture.update();
      shadowMat.opacityTexture = contactTexture;
      function contact(x: number, z: number, size: number) {
        const disc = MeshBuilder.CreateDisc(
          "contact-shadow",
          { radius: size, tessellation: 16 },
          scene,
        );
        disc.rotation.x = Math.PI / 2;
        disc.position.set(x, 0.085, z);
        disc.material = shadowMat;
        disc.isPickable = false;
      }
      let avatarLoaded = false;
      let avatarReady = false;
      const player = {
        root: new TransformNode("player-controller", scene),
        animations: [] as AnimationGroup[],
      };
      player.root.position.set(0, 0, -5);
      const contactDisc = MeshBuilder.CreateDisc(
        "player-contact",
        { radius: 0.5, tessellation: 24 },
        scene,
      );
      contactDisc.rotation.x = Math.PI / 2;
      contactDisc.material = shadowMat;
      contactDisc.isPickable = false;
      const residents: { root: TransformNode; animations: AnimationGroup[] }[] =
        [];
      let moving = false;
      const playing = new WeakMap<AnimationGroup[], AnimationGroup>();
      function animate(groups: AnimationGroup[], walking: boolean | string) {
        const name =
          typeof walking === "string" ? walking : walking ? "Walk" : "Idle";
        const selected = groups.find((g) =>
          g.name.toLowerCase().endsWith(name.toLowerCase()),
        );
        if (selected && playing.get(groups) !== selected) {
          playing.get(groups)?.stop();
          selected.start(true, 1);
          playing.set(groups, selected);
        }
        if (selected?.name.startsWith("explorer-"))
          canvas.current?.setAttribute("data-avatar-animation", selected.name);
        if (selected?.name.startsWith("learning-police-"))
          canvas.current?.setAttribute("data-police-animation", selected.name);
      }
      LoadAssetContainerAsync(characterAsset(avatar), scene)
        .then(async (container) => {
          if (disposed) {
            container.dispose();
            return;
          }
          const create = (
            id: string,
            target: TransformNode,
            color: string,
            scale: number,
            backpack: boolean,
            source = container,
          ) => {
            const instance = source.instantiateModelsToScene(
              (n) => id + "-" + n,
              true,
              { doNotInstantiate: true },
            );
            const root = new TransformNode(id + "-model", scene);
            instance.rootNodes.forEach((n) => (n.parent = root));
            root.parent = target;
            root.scaling.setAll(scale);
            // The GLB is right-handed; Babylon's conversion root preserves its forward direction.
            root.rotation.y = 0;
            for (const mesh of root.getChildMeshes()) {
              mesh.isPickable = false;
              if (
                (quality === "low" || softwareRendering) &&
                mesh instanceof Mesh &&
                mesh.skeleton
              ) {
                // A bounded CPU skinning pass avoids expensive shader bone reads.
                // Isolate the geometry before deforming it so source data stays intact.
                mesh.makeGeometryUnique();
                mesh.computeBonesUsingShaders = false;
              }
              if (!backpack && mesh.material?.name.includes("Backpack"))
                mesh.setEnabled(false);
              mesh.receiveShadows = quality !== "low";
              const mats =
                mesh.material && "subMaterials" in mesh.material
                  ? (
                      mesh.material as unknown as {
                        subMaterials: PBRMaterial[];
                      }
                    ).subMaterials
                  : [mesh.material as PBRMaterial];
              for (const m of mats)
                if (m instanceof PBRMaterial) {
                  m.environmentIntensity = 0.55;
                  if (usesEquippedFabric(id, m.name)) {
                    m.albedoColor = Color3.White();
                    m.albedoTexture = ["azure", "plum"].includes(outfit)
                      ? fabricTexture
                      : playerFabric;
                  } else if (
                    m.name.includes("Explorer_Jacket") &&
                    id !== "learning-police"
                  ) {
                    m.albedoColor = Color3.FromHexString(
                      backpack ? "#ffffff" : color,
                    );
                    m.albedoTexture = backpack ? playerFabric : fabricTexture;
                  }
                  if (
                    m.name.includes("Explorer_Trousers") &&
                    id !== "learning-police"
                  )
                    m.albedoColor = Color3.FromHexString(
                      backpack ? "#bb873b" : "#315c54",
                    );
                  if (m.name.includes("Resident_Shirt"))
                    m.albedoColor = Color3.FromHexString(color);
                  m.directIntensity = 0.9;
                }
              if (quality !== "low" || mode === "avatar")
                shadows.addShadowCaster(mesh);
            }
            if (quality === "low") {
              const converted = new Map<PBRMaterial, StandardMaterial>();
              for (const mesh of root.getChildMeshes()) {
                const original = mesh.material;
                if (original instanceof PBRMaterial) {
                  let simple = converted.get(original);
                  if (!simple) {
                    simple = new StandardMaterial(
                      original.name + "-mobile",
                      scene,
                    );
                    simple.diffuseColor = original.albedoColor;
                    simple.diffuseTexture = original.albedoTexture
                      ? original.name.includes("Ch03_Body")
                        ? skinTexture
                        : original.albedoTexture
                      : null;
                    simple.specularColor = new Color3(0.07, 0.07, 0.06);
                    simple.specularPower = 32;
                    simple.maxSimultaneousLights = 1;
                    simple.specularColor = Color3.Black();
                    simple.emissiveColor = new Color3(0.06, 0.06, 0.05);
                    converted.set(original, simple);
                  }
                  mesh.material = simple;
                }
              }
            }
            const renderedMaterials = root.getChildMeshes().flatMap((mesh) => {
              const material = mesh.material;
              return material instanceof PBRMaterial
                ? [
                    {
                      name: material.name,
                      color: material.albedoColor.asArray(),
                      texture: material.albedoTexture?.name || null,
                    },
                  ]
                : material instanceof StandardMaterial
                  ? [
                      {
                        name: material.name,
                        color: material.diffuseColor.asArray(),
                        texture: material.diffuseTexture?.name || null,
                      },
                    ]
                  : [];
            });
            canvas.current?.setAttribute(
              id === "explorer"
                ? "data-avatar-materials"
                : "data-" + id + "-materials",
              JSON.stringify(renderedMaterials),
            );
            animate(instance.animationGroups, false);
            if (backpack)
              canvas.current?.setAttribute(
                "data-avatar-bones",
                String(instance.skeletons[0]?.bones.length || 0),
              );
            return instance.animationGroups;
          };
          player.animations = create(
            "explorer",
            player.root,
            outfit === "azure"
              ? "#78b8ed"
              : outfit === "plum"
                ? "#bf94da"
                : outfit === "teal"
                  ? "#e4fff3"
                  : outfit === "gold"
                    ? "#ffd273"
                    : "#ffa783",
            character(avatar).height,
            true,
          );
          avatarLoaded = true;
          if (mode === "world") {
            const officerAsset = await LoadAssetContainerAsync(
              "/assets/character-officer.glb",
              scene,
            );
            if (disposed) {
              officerAsset.dispose();
              return;
            }
            const officerRoot = new TransformNode(
              "learning-police-officer",
              scene,
            );
            officerRoot.position.set(-3.4, 0, -2.1);
            residents.push({
              root: officerRoot,
              animations: create(
                "learning-police",
                officerRoot,
                "#193c57",
                1.7,
                false,
                officerAsset,
              ),
            });
            canvas.current!.dataset.policeMaterials = JSON.stringify(
              officerRoot
                .getChildMeshes()
                .map((mesh) => {
                  const material = mesh.material;
                  return material instanceof PBRMaterial
                    ? {
                        name: material.name,
                        color: material.albedoColor.asArray(),
                        texture: Boolean(material.albedoTexture),
                      }
                    : material instanceof StandardMaterial
                      ? {
                          name: material.name,
                          color: material.diffuseColor.asArray(),
                          texture: Boolean(material.diffuseTexture),
                        }
                      : null;
                })
                .filter(Boolean),
            );
            const badgeLabel = label(
              "learning-police",
              0,
              3.3,
              0,
              1.8,
              0.4,
              ["LEARNING POLICE"],
              "#19374d",
            );
            badgeLabel.parent = officerRoot;
            badgeLabel.billboardMode = Mesh.BILLBOARDMODE_ALL;
            canvas.current?.setAttribute("data-police-ready", "true");
            canvas.current?.setAttribute(
              "data-police-uniform",
              "navy-cap-badge-belt",
            );
            scene.onDisposeObservable.addOnce(() => officerAsset.dispose());
            for (const [id, x, z, heading] of [
              ["kofi", -2.6, -1.2, -0.9],
              ["nia", 3.8, 4.6, 2.7],
              ["tayo", 1.8, 10, Math.PI],
            ] as const) {
              const source = await LoadAssetContainerAsync(
                `/assets/character-${id}-resident.glb`,
                scene,
              );
              if (disposed) {
                source.dispose();
                return;
              }
              const root = new TransformNode("resident-" + id, scene);
              root.position.set(x, 0, z);
              root.rotation.y = heading;
              const animations = create(
                "resident-" + id,
                root,
                id === "nia" ? "#b76544" : "#e3d0a1",
                character(id).height,
                false,
                source,
              );
              residents.push({ root, animations });
              contact(x, z, 0.45);
              scene.onDisposeObservable.addOnce(() => source.dispose());
            }
            canvas.current?.setAttribute("data-residents-ready", "true");
            canvas.current?.setAttribute(
              "data-resident-characters",
              JSON.stringify(["kofi", "nia", "tayo"]),
            );
          }
          shadowMap.resetRefreshCounter();
        })
        .catch((err) => {
          if (!disposed) {
            console.error("Unable to load explorer asset", err);
            canvas.current?.setAttribute("data-asset-error", "true");
          }
        });
      if (mode === "avatar") {
        const studioKey = new DirectionalLight(
          "studio-key",
          new Vector3(-0.3, -0.55, -1),
          scene,
        );
        studioKey.intensity = 0.65;
        studioKey.diffuse = new Color3(1, 0.91, 0.77);
        camera.radius = smallScreen ? 6.6 : 4.7;
        camera.alpha = Math.PI / 2 - 0.13;
        camera.beta = 1.4;
        camera.lowerRadiusLimit = smallScreen ? 5.5 : 4.0;
        camera.upperRadiusLimit = smallScreen ? 8 : 6;
        player.root.position.set(-1.3, 0.18, -5);
        cylinder("avatar-platform", -1.3, 0.12, -5, 3.4, 0.22, dark, 3.4);
        const platformRim = mat("platform-glow", "#efc578");
        platformRim.emissiveColor = new Color3(0.6, 0.38, 0.1);
        const rim = MeshBuilder.CreateTorus(
          "platform-rim",
          { diameter: 3.25, thickness: 0.045, tessellation: 64 },
          scene,
        );
        rim.position.set(-1.3, 0.25, -5);
        rim.material = platformRim;
      }
      if (mode === "avatar") {
        const roomWall = mat("dressing-room", "#d9b88b"),
          roomFloor = mat("wood-floor", "#a8774e");
        box("room-wall-left", -5.65, 2.8, -8.8, 4.7, 5.6, 0.3, roomWall);
        box("room-wall-right", 3.55, 2.8, -8.8, 8.9, 5.6, 0.3, roomWall);
        box("window-sill-wall", -2.1, 0.6, -8.8, 2.4, 1.2, 0.3, roomWall);
        box("window-top-wall", -2.1, 5.5, -8.8, 2.4, 0.2, 0.3, roomWall);
        for (const x of [-3.34, -0.86])
          box("window-frame", x, 3.15, -8.62, 0.09, 3.9, 0.1, gold);
        box("window-sill", -2.1, 1.21, -8.55, 2.6, 0.15, 0.6, pale);
        const arch = MeshBuilder.CreateTube(
          "arched-window",
          {
            path: Array.from(
              { length: 25 },
              (_, i) =>
                new Vector3(
                  -2.1 + 1.23 * Math.cos((i * Math.PI) / 24),
                  4.05 + 1.23 * Math.sin((i * Math.PI) / 24),
                  -8.61,
                ),
            ),
            radius: 0.06,
            tessellation: 8,
          },
          scene,
        );
        arch.material = gold;
        statics.push(arch);
        for (let i = 0; i < 5; i++) {
          const x = -6 + i * 2,
            h = 3 + (i % 3);
          box(
            "window-city",
            x,
            h / 2,
            -24 - (i % 2) * 3,
            1.8,
            h,
            2,
            i % 2 ? clay : ochre,
          );
          box(
            "window-city-cap",
            x,
            h + 0.1,
            -24 - (i % 2) * 3,
            2,
            0.2,
            2.2,
            pale,
          );
        }
        const studioPoster = label(
          "studio-poster",
          1.5,
          3,
          -8.61,
          1.8,
          2.75,
          ["BUILD YOUR", "NEXT CHAPTER", "ONE SKILL", "AT A TIME"],
          "#255d56",
        );
        studioPoster.rotation.y = Math.PI;
        box("poster-frame", 1.5, 3, -8.67, 1.97, 2.92, 0.08, gold);
        box("wood-floor", 0, 0.04, -5.4, 16, 0.06, 9, roomFloor);
        for (let x = -7; x <= 7; x += 0.65)
          box("floor-inlay", x, 0.075, -5.4, 0.016, 0.01, 9, dark);
        box("wardrobe-side-wall", -7.9, 2.8, -5.4, 0.3, 5.6, 8, roomWall);
        box("wardrobe-panel", -5.4, 2.5, -8.5, 4.1, 4.4, 0.25, teal);
        for (const y of [0.45, 3.8])
          box("wardrobe-shelf", -5.4, y, -7.85, 4.4, 0.16, 1.3, stone);
        box("clothes-rail", -5.4, 3.35, -7.7, 4, 0.08, 0.08, gold);
        for (let i = 0; i < 3; i++) {
          const x = -6.6 + i * 1.15,
            cloth = mat("rack-" + i, ["#b8623f", "#2c8174", "#dba74b"][i]);
          box("hanging-jacket", x, 2.3, -7.72, 0.65, 1.15, 0.22, cloth);
          for (const side of [-1, 1])
            box(
              "hanging-sleeve",
              x + side * 0.45,
              2.55,
              -7.72,
              0.3,
              0.65,
              0.22,
              cloth,
            );
          box("hanger-hook", x, 3.13, -7.7, 0.06, 0.35, 0.05, gold);
        }
        const roomTitle = label(
          "wardrobe-title",
          -5.4,
          4.7,
          -8.3,
          4.3,
          0.65,
          ["YOUR STARTER WARDROBE"],
          "#285b52",
        );
        roomTitle.rotation.y = Math.PI;
        box("mirror-frame", 4.9, 2.4, -8.5, 2.1, 4.5, 0.22, gold);
        box("mirror", 4.9, 2.4, -8.34, 1.85, 4.2, 0.1, glass);
        box("studio-bench", -5, 0.65, -5.5, 2.5, 0.28, 0.8, teal);
        for (const x of [-5.95, -4.05])
          box("studio-bench-leg", x, 0.3, -5.5, 0.14, 0.6, 0.7, dark);
      }
      // Merge reusable static geometry by material to keep draw calls bounded.
      for (const m of materials.values()) {
        await yieldToInterface();
        if (disposed) return;
        const group = statics.filter((s) => s.material === m);
        if (group.length > 1) {
          const merged = Mesh.MergeMeshes(
            group,
            true,
            true,
            undefined,
            false,
            false,
          );
          if (merged) {
            merged.freezeWorldMatrix();
            merged.receiveShadows = true;
            if (m !== path && m.name !== "ground" && m.name !== "grout")
              shadows.addShadowCaster(merged);
          }
        }
        m.freeze();
      }
      let arrestKey: string | undefined;
      let transport: PoliceTransport | undefined;
      const police = mode === "world" ? createPoliceScene(scene) : undefined;
      const cuffs = [-1, 1].map((side) => {
        const cuff = MeshBuilder.CreateTorus(
          "learner-restraint-" + side,
          { diameter: 0.16, thickness: 0.03, tessellation: 16 },
          scene,
        );
        cuff.parent = player.root;
        cuff.position.set(side * 0.26, 1.12, 0.33);
        cuff.rotation.x = Math.PI / 2;
        cuff.material = mat("restraint-metal-" + side, "#a8c0cf");
        cuff.setEnabled(false);
        cuff.isPickable = false;
        return cuff;
      });
      let attachedCuffs = false;
      const cameraWalls = cityCameraWalls(houses);
      const requestedCamera = {
        alpha: camera.alpha,
        radius: camera.radius,
        target: camera.target.clone(),
      };
      let renderedCamera: ResolvedCityCamera | undefined;
      let cameraCheckedAt = performance.now();
      // Temporary wall avoidance must not become the next frame's orbit/zoom input.
      scene.onBeforeAnimationsObservable.add(() => {
        if (!renderedCamera) return;
        if (camera.alpha === renderedCamera.alpha)
          camera.alpha = requestedCamera.alpha;
        if (camera.radius === renderedCamera.radius)
          camera.radius = requestedCamera.radius;
        if (
          camera.target.x === renderedCamera.target.x &&
          camera.target.y === renderedCamera.target.y &&
          camera.target.z === renderedCamera.target.z
        )
          camera.target.copyFrom(requestedCamera.target);
      });
      camera.onAfterCheckInputsObservable.add(() => {
        const now = performance.now();
        const elapsed = (now - cameraCheckedAt) / 1000;
        cameraCheckedAt = now;
        requestedCamera.alpha = camera.alpha;
        requestedCamera.radius = camera.radius;
        requestedCamera.target.copyFrom(camera.target);
        // The station has its own interior cutaway and detention framing.
        if (mode !== "world" || enforcement.current.status === "arrested") {
          renderedCamera = undefined;
          return;
        }
        renderedCamera = resolveCityCamera(
          {
            target: camera.target,
            anchor: {
              x: player.root.position.x,
              y: player.root.position.y + 1.4,
              z: player.root.position.z,
            },
            alpha: camera.alpha,
            beta: camera.beta,
            radius: camera.radius,
          },
          cameraWalls,
          renderedCamera,
          elapsed,
        );
        camera.alpha = renderedCamera.alpha;
        camera.radius = renderedCamera.radius;
        camera.target.set(
          renderedCamera.target.x,
          renderedCamera.target.y,
          renderedCamera.target.z,
        );
      });
      const keys = new Set<string>();
      let destinationKey: string | null | undefined;
      let cityRoute: { x: number; z: number }[] = [];
      const updateWalking = () => {
        const horizontal =
          Number(keys.has("d") || keys.has("arrowright")) -
          Number(keys.has("a") || keys.has("arrowleft"));
        const forward =
          Number(keys.has("w") || keys.has("arrowup")) -
          Number(keys.has("s") || keys.has("arrowdown"));
        const walking =
          mode === "world" &&
          !pausedRef.current &&
          Boolean(horizontal || forward);
        if (walking !== moving && avatarReady) {
          moving = walking;
          animate(player.animations, moving);
        }
      };
      const down = (e: KeyboardEvent) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement
        )
          return;
        if (
          cityRoute.length &&
          /^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/i.test(e.key)
        ) {
          cityRoute = [];
          if (destinationKey)
            navigation.current.onNavigationEnd?.(destinationKey, false);
          destinationKey = null;
        }
        keys.add(e.key.toLowerCase());
        updateWalking();
        if (e.key.startsWith("Arrow")) e.preventDefault();
      };
      const up = (e: KeyboardEvent) => {
          keys.delete(e.key.toLowerCase());
          updateWalking();
        },
        clear = () => {
          keys.clear();
          moving = false;
          animate(player.animations, false);
        };
      window.addEventListener("keydown", down);
      window.addEventListener("keyup", up);
      window.addEventListener("blur", clear);
      scene.onPointerObservable.add((info) => {
        if (
          info.type === PointerEventTypes.POINTERPICK &&
          info.pickInfo?.hit &&
          info.pickInfo.pickedMesh?.metadata?.course
        )
          houseCb.current(info.pickInfo.pickedMesh.metadata.course);
      });
      let last = 0,
        audioSceneActive = false,
        tick = performance.now(),
        frames = 0;
      engine.runRenderLoop(() => {
        const now = performance.now();
        const arrested =
          mode === "world" && enforcement.current.status === "arrested";
        if ((pausedRef.current && !arrested) || document.hidden) {
          audioSceneActive = false;
          if (mode === "world")
            gameAudio.setMovement({ active: false, speed: 0, theme: "city" });
          if (canvas.current?.dataset.renderState !== "paused")
            canvas.current?.setAttribute("data-render-state", "paused");
          last = now;
          tick = now;
          frames = 0;
          return;
        }
        if (canvas.current?.dataset.renderState !== "active")
          canvas.current?.setAttribute("data-render-state", "active");
        if (mode === "world" && !audioSceneActive) {
          gameAudio.setTheme("city");
          audioSceneActive = true;
        }
        if (quality === "low" && now - last < 100) return;
        const frameElapsed = last ? Math.max(0, (now - last) / 1000) : 0;
        const dt = Math.min(frameElapsed, 0.25);
        last = now;
        if (arrested && avatarReady && residents[0] && police) {
          const officer = residents[0];
          if (!transport || arrestKey !== enforcement.current.id) {
            arrestKey = enforcement.current.id;
            transport = createPoliceTransport(player.root.position);
            try {
              const saved = JSON.parse(
                sessionStorage.getItem(
                  "amamihe-detention-scene:" + arrestKey,
                ) || "null",
              );
              if (saved?.phase === "detained")
                transport = {
                  ...transport,
                  phase: "detained",
                  learner: { ...CITY_STATION.cell },
                  officer: {
                    x: CITY_STATION.cell.x - 0.75,
                    z: CITY_STATION.z + 2,
                  },
                  vehicle: { ...CITY_STATION.parking },
                  cuffs: true,
                  learnerPose: "restrained",
                  officerPose: "idle",
                  officerSeated: false,
                  enteredStation: true,
                };
            } catch {
              /* Presentation storage is optional; server detention remains authoritative. */
            }
            keys.clear();
          }
          const previous = transport!.phase;
          transport = advancePoliceTransport(transport!, frameElapsed, houses);
          police.update(transport);
          player.root.position.copyFrom(
            transport.learnerSeated
              ? police.seat(false)
              : new Vector3(transport.learner.x, 0, transport.learner.z),
          );
          officer.root.position.copyFrom(
            transport.officerSeated
              ? police.seat(true)
              : new Vector3(
                  transport.officer.x,
                  cityStandingHeight(transport.officer, houses),
                  transport.officer.z,
                ),
          );
          player.root.rotation.y = transport.learnerSeated
            ? transport.heading
            : transport.learnerHeading;
          officer.root.rotation.y = transport.officerSeated
            ? transport.heading
            : transport.officerHeading;
          const clip = (pose: string) =>
            pose === "walk-restrained"
              ? "WalkRestrained"
              : pose[0].toUpperCase() + pose.slice(1);
          animate(player.animations, clip(transport.learnerPose));
          animate(officer.animations, clip(transport.officerPose));
          if (!attachedCuffs) {
            const hands = player.root
              .getChildTransformNodes()
              .filter((n) => /mixamorig:(Left|Right)Hand$/.test(n.name));
            if (hands.length === 2) {
              cuffs.forEach((c, i) => {
                c.parent = hands[i];
                c.scaling.setAll(65);
                c.position.set(0, 1, 0);
              });
              attachedCuffs = true;
            }
          }
          cuffs.forEach((c) => c.setEnabled(transport!.cuffs));
          if (previous !== transport.phase)
            try {
              sessionStorage.setItem(
                "amamihe-detention-scene:" + arrestKey,
                JSON.stringify({ phase: transport.phase }),
              );
            } catch {
              /* Optional device storage. */
            }
          canvas.current!.dataset.arrestPhase = transport.phase;
          canvas.current!.dataset.arrestActors = JSON.stringify({
            learner: player.root.position.asArray(),
            officer: officer.root.position.asArray(),
            cuffs: transport.cuffs,
            learnerSeated: transport.learnerSeated,
            officerSeated: transport.officerSeated,
            officerClip: playing.get(officer.animations)?.name,
            officerBones: officer.root
              .getChildTransformNodes()
              .filter((n) =>
                /mixamorig:(LeftLeg|RightLeg|LeftFoot)$/.test(n.name),
              )
              .map((n) => ({
                name: n.name,
                matrix: Array.from(n.computeWorldMatrix(true).asArray()),
              })),
          });
          if (
            transport.phase === "transport" ||
            transport.phase === "boarding"
          ) {
            camera.radius = 12;
            camera.beta = 1.15;
          }
          if (transport.phase === "detained") {
            camera.alpha = Math.PI / 2 - 0.16;
            camera.beta = 1.15;
            camera.radius = 6.5;
          }
        } else if (arrestKey) {
          cuffs.forEach((c) => c.setEnabled(false));
          animate(player.animations, false);
          animate(residents[0].animations, false);
          player.root.position.set(
            CITY_STATION.door.x,
            0,
            CITY_STATION.door.z + 1,
          );
          residents[0].root.position.set(-3.4, 0, -2.1);
          try {
            sessionStorage.removeItem("amamihe-detention-scene:" + arrestKey);
          } catch {
            /* Optional device storage. */
          }
          arrestKey = undefined;
          transport = undefined;
          police?.update(undefined);
          canvas.current!.dataset.arrestPhase = "released";
        }
        let dx = 0,
          dz = 0;
        if (keys.has("w") || keys.has("arrowup")) dz += 1;
        if (keys.has("s") || keys.has("arrowdown")) dz -= 1;
        if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
        if (keys.has("d") || keys.has("arrowright")) dx += 1;
        // Manual controls follow the live orbit, including its inertial coast.
        // Route waypoints below already use world coordinates.
        const manual = cameraRelativeMovement(dx, dz, camera.alpha);
        dx = manual.x;
        dz = manual.z;
        let routed = false;
        if (!arrested && mode === "world" && avatarReady) {
          if (destinationKey !== navigation.current.destination) {
            destinationKey = navigation.current.destination;
            const h = houses.find((h) => h.id === destinationKey);
            const target =
              destinationKey === "police-station"
                ? { x: CITY_STATION.door.x, z: CITY_STATION.door.z + 1 }
                : h
                  ? { x: h.x, z: h.z - 5 }
                  : undefined;
            cityRoute = target
              ? cityPath(player.root.position, target, houses)
              : [];
            if (destinationKey && !cityRoute.length)
              navigation.current.onNavigationEnd?.(destinationKey, false);
          }
          if (cityRoute.length) {
            routed = true;
            const walked = followCityRoute(
              player.root.position,
              cityRoute,
              frameElapsed,
              houses,
            );
            player.root.position.x = walked.position.x;
            player.root.position.z = walked.position.z;
            cityRoute = walked.remaining;
            dx = walked.direction.x;
            dz = walked.direction.z;
            if (!cityRoute.length && destinationKey)
              navigation.current.onNavigationEnd?.(destinationKey, true);
          }
          canvas.current!.dataset.cityNavigation = JSON.stringify({
            destination: destinationKey,
            remaining: cityRoute.length,
          });
        }
        if (arrested) {
          dx = 0;
          dz = 0;
        }
        if (dx || dz) {
          if (mode === "world" && !routed) {
            const length = Math.hypot(dx, dz);
            const next = walkCity(
              player.root.position,
              {
                x: player.root.position.x + (dx / length) * dt * 3,
                z: player.root.position.z + (dz / length) * dt * 3,
              },
              houses,
            );
            player.root.position.x = next.x;
            player.root.position.z = next.z;
          }
          if (mode === "world") player.root.rotation.y = Math.atan2(dx, dz);
        }
        if (mode === "world") {
          if (!transport?.learnerSeated)
            player.root.position.y = cityStandingHeight(
              player.root.position,
              houses,
            );
        }
        const shouldMove =
          mode === "world" &&
          (arrested
            ? transport?.learnerPose === "walk-restrained"
            : Boolean(dx || dz));
        if (mode === "world")
          gameAudio.setMovement({
            active: shouldMove,
            speed: shouldMove ? 3 : 0,
            theme: "city",
          });
        if (!arrested && shouldMove !== moving && avatarReady) {
          moving = shouldMove;
          animate(player.animations, moving);
        }
        camera.target.copyFrom(
          player.root.position.add(
            mode === "avatar"
              ? new Vector3(
                  smallScreen ? 0 : 0.25,
                  smallScreen ? 0.58 : 1.53,
                  0,
                )
              : transport?.phase === "detained" ||
                  transport?.phase === "securing"
                ? new Vector3(0, 1.7, 0)
                : new Vector3(0, smallScreen ? 2.45 : 2.65, 1.5),
          ),
        );
        contactDisc.position.set(
          player.root.position.x,
          transport?.learnerSeated ? 0.09 : player.root.position.y + 0.01,
          player.root.position.z,
        );
        synchronizePeers();
        synchronizeAds();
        if (mode === "world")
          publishPosition({
            space: "city",
            position: {
              x: player.root.position.x,
              z: player.root.position.z,
              heading: player.root.rotation.y,
            },
          });
        const renderStart = performance.now();
        scene.render();
        if (mode === "world")
          canvas.current?.setAttribute(
            "data-city-camera",
            JSON.stringify({
              position: camera.position.asArray(),
              target: camera.target.asArray(),
              requestedAlpha: requestedCamera.alpha,
              requestedRadius: requestedCamera.radius,
              alpha: camera.alpha,
              beta: camera.beta,
              radius: camera.radius,
              adjusted: Boolean(
                renderedCamera &&
                (Math.abs(camera.alpha - requestedCamera.alpha) > 0.001 ||
                  Math.abs(camera.radius - requestedCamera.radius) > 0.001),
              ),
            }),
          );
        if (
          avatarLoaded &&
          !avatarReady &&
          player.root
            .getChildMeshes()
            .every(
              (mesh) =>
                !mesh.isEnabled() ||
                (mesh.isReady() &&
                  (!mesh.material || mesh.material.isReady(mesh))),
            )
        ) {
          avatarReady = true;
          // Start frame-rate sampling after the avatar's shaders are ready.
          tick = performance.now();
          frames = 0;
        }
        canvas.current?.setAttribute("data-avatar-ready", String(avatarReady));
        if (mode === "world")
          canvas.current?.setAttribute(
            "data-movement-frame",
            JSON.stringify({
              x: player.root.position.x,
              z: player.root.position.z,
              alpha: camera.alpha,
            }),
          );
        canvas.current?.setAttribute(
          "data-render-ms",
          String(Math.round(performance.now() - renderStart)),
        );
        frames++;
        if (now - tick > 500) {
          const activeMeshes = scene.getActiveMeshes();
          const materialCounts: Record<string, number> = {};
          let activeTriangles = 0;
          for (let i = 0; i < activeMeshes.length; i++) {
            const mesh = activeMeshes.data[i];
            const type = mesh.material?.getClassName() || "none";
            materialCounts[type] = (materialCounts[type] || 0) + 1;
            activeTriangles += mesh.getTotalIndices() / 3;
          }
          canvas.current?.setAttribute(
            "data-active-triangles",
            String(Math.round(activeTriangles)),
          );
          canvas.current?.setAttribute(
            "data-active-materials",
            JSON.stringify(materialCounts),
          );
          const measuredFps = Math.round((frames * 1000) / (now - tick));
          const viewport = camera.viewport.toGlobal(
            engine.getRenderWidth(),
            engine.getRenderHeight(),
          );
          const gate = Vector3.Project(
            new Vector3(2.5, 4.45, 10.3),
            Matrix.Identity(),
            scene.getTransformMatrix(),
            viewport,
          );
          const gateLeft = Vector3.Project(
            new Vector3(0, 4.45, 10.3),
            Matrix.Identity(),
            scene.getTransformMatrix(),
            viewport,
          );
          const gateRight = Vector3.Project(
            new Vector3(5, 4.45, 10.3),
            Matrix.Identity(),
            scene.getTransformMatrix(),
            viewport,
          );
          statsCb.current({
            fps: avatarReady ? measuredFps : 0,
            meshes: scene.meshes.length,
            x: player.root.position.x,
            z: player.root.position.z,
            heading: player.root.rotation.y,
            avatarReady,
            gateX: gate.x / engine.getRenderWidth(),
            gateY: gate.y / engine.getRenderHeight(),
            gateWidth:
              Math.abs(gateRight.x - gateLeft.x) *
              engine.getHardwareScalingLevel(),
            gateVisible:
              mode === "world" &&
              gate.z > 0 &&
              gate.z < 1 &&
              gate.x > 0 &&
              gate.x < engine.getRenderWidth() &&
              gate.y > 0 &&
              gate.y < engine.getRenderHeight(),
          });
          tick = now;
          frames = 0;
        }
      });
      const resize = () => {
        engine.resize();
        scaleResolution();
        const small =
          canvas.current!.clientWidth < (mode === "avatar" ? 721 : 600);
        if (small !== smallScreen) {
          smallScreen = small;
          camera.radius =
            mode === "avatar" ? (small ? 6.6 : 4.7) : small ? 9 : 8.2;
        }
        scene.render();
      };
      window.addEventListener("resize", resize);
      release = () => {
        if (mode === "world")
          gameAudio.setMovement({ active: false, speed: 0, theme: "city" });
        window.removeEventListener("keydown", down);
        window.removeEventListener("keyup", up);
        window.removeEventListener("blur", clear);
        window.removeEventListener("resize", resize);
        releaseScene();
      };
    };
    void initialize().catch((error) => {
      if (!disposed) {
        console.error("Unable to initialize the scene", error);
        canvas.current?.setAttribute("data-asset-error", "true");
      }
    });
    return () => {
      disposed = true;
      release();
    };
  }, [outfit, quality, mode, avatar]);
  return (
    <canvas
      key={`${outfit}:${quality}:${mode}:${avatar}`}
      ref={canvas}
      className="world-canvas"
      aria-label="Interactive 3D Venture City. Move with WASD or arrow keys, drag to orbit, click a course house."
      tabIndex={0}
    />
  );
}
