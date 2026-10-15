import { configureCameraControls } from "./cameraControls";
import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import "@babylonjs/core/Culling/ray";
import type { CourseSummary } from "../shared/course";
import { createSoftBox } from "./softGeometry";
import { resourcePath } from "./rendering";
import { useAccess } from "./Access";
import { useVisualPreference } from "./visualPreferences";

export const PORTAL_COLORS = ["#efa82c", "#22bfd0", "#ad72f5", "#48c99a"];

/** One bounded plaza: four physical, open arches reveal separate course houses. */
export default function PortalScene({
  courses,
  activeCourseId,
  onDoor,
  onClose,
}: {
  courses: CourseSummary[];
  activeCourseId?: string;
  onDoor: (course: CourseSummary) => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const actions = useRef({ onDoor, onClose, activeCourseId });
  actions.current = { onDoor, onClose, activeCourseId };
  const { preferences, t } = useAccess();
  const access = useRef(preferences);
  access.current = preferences;
  const [quality] = useVisualPreference("cityQuality", "low");
  useEffect(() => {
    const element = canvas.current!;
    const engine = new Engine(element, true, {
      preserveDrawingBuffer: true,
      stencil: false,
      powerPreference: "low-power",
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.73, 0.8, 0.87, 1);
    scene.ambientColor = new Color3(0.34, 0.31, 0.28);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(0.79, 0.8, 0.84);
    scene.fogStart = 30;
    scene.fogEnd = 95;
    const camera = new ArcRotateCamera(
      "portal-camera",
      -Math.PI / 2,
      1.15,
      18,
      new Vector3(0, 2, 1),
      scene,
    );
    configureCameraControls(camera);
    camera.attachControl(element, true);
    element.tabIndex = 0;
    camera.lowerBetaLimit = 0.91;
    camera.upperBetaLimit = 1.3;
    camera.lowerAlphaLimit = -1.95;
    camera.upperAlphaLimit = -1.2;
    camera.lowerRadiusLimit = 14;
    camera.upperRadiusLimit = 24;
    camera.panningSensibility = 0;
    camera.fov = 0.68;
    const ambient = new HemisphericLight(
      "portal-skylight",
      new Vector3(0, 1, 0),
      scene,
    );
    ambient.intensity = 0.72;
    ambient.groundColor = Color3.FromHexString("#a9815c");
    const sun = new DirectionalLight(
      "portal-sunset",
      new Vector3(-0.6, -1, 0.6),
      scene,
    );
    sun.diffuse = Color3.FromHexString("#fff0ca");
    sun.intensity = 0.62;
    const glow =
      quality === "low"
        ? null
        : new GlowLayer("portal-halos", scene, {
            mainTextureFixedSize: 512,
            blurKernelSize: 32,
          });
    if (glow) glow.intensity = 0.42;
    const materials: StandardMaterial[] = [];
    function material(name: string, color: string, emissive = 0) {
      const result = new StandardMaterial(name, scene);
      result.diffuseColor = Color3.FromHexString(color);
      result.specularColor = new Color3(0.08, 0.07, 0.05);
      result.emissiveColor = result.diffuseColor.scale(emissive);
      materials.push(result);
      return result;
    }
    const limestone = material("warm-cut-limestone", "#e8cba3");
    const stoneTexture = new Texture(
      resourcePath("world/limestone.webp"),
      scene,
    );
    stoneTexture.uScale = stoneTexture.vScale = 2;
    limestone.diffuseTexture = stoneTexture;
    const edge = material("sandstone-recesses", "#b89369");
    const cream = material("ivory-arch-inlay", "#fff1d0");
    const gold = material("brushed-brass-details", "#c78e37");
    gold.specularColor.set(0.23, 0.16, 0.06);
    gold.specularPower = 70;
    const dark = material("deep-petrol-wood", "#174952");
    const wood = material("carved-warm-wood", "#845632");
    wood.diffuseTexture = new Texture(resourcePath("world/wood.webp"), scene);
    const leaf = material("garden-leaves", "#3e7951");
    const leafLight = material("sunlit-leaves", "#849b4e");
    const terracotta = material("terracotta-planters", "#b86142");
    const lantern = material("lantern-warm-light", "#ffe8a2", 1.1);
    const tile = material("terrace-paving", "#ffffff");
    const paving = new DynamicTexture(
      "stone-paving-pattern",
      { width: 512, height: 512 },
      scene,
      false,
    );
    const context = paving.getContext();
    context.fillStyle = "#a78c6b";
    context.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 8; col++) {
        const x = col * 80 + (row % 2) * 40;
        context.fillStyle = ["#d4bd99", "#ddc7a5", "#cdb590", "#e2cdad"][
          (row * 7 + col + 8) % 4
        ];
        context.fillRect(x + 1, row * 64 + 1, 77, 61);
        context.fillStyle = "#efe0c22a";
        context.fillRect(x + 2, row * 64 + 2, 75, 2);
      }
    paving.update(false);
    paving.wrapU = paving.wrapV = Texture.WRAP_ADDRESSMODE;
    paving.uScale = paving.vScale = 6;
    tile.diffuseTexture = paving;
    const groups = new Map<
      string,
      { meshes: Mesh[]; course?: CourseSummary; returnCity?: boolean }
    >();
    function add(
      mesh: Mesh,
      mat: StandardMaterial,
      course?: CourseSummary,
      returnCity = false,
    ) {
      mesh.material = mat;
      const key = `${mat.uniqueId}:${course?.id || "plaza"}:${returnCity}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { meshes: [], course, returnCity }));
      group.meshes.push(mesh);
      return mesh;
    }
    function box(
      name: string,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat = limestone,
      course?: CourseSummary,
    ) {
      const mesh = createSoftBox(name, w, h, d, scene);
      mesh.position.set(x, y, z);
      return add(mesh, mat, course);
    }
    function cylinder(
      name: string,
      top: number,
      bottom: number,
      h: number,
      x: number,
      y: number,
      z: number,
      mat: StandardMaterial,
      tessellation = 20,
      course?: CourseSummary,
    ) {
      const mesh = MeshBuilder.CreateCylinder(
        name,
        { diameterTop: top, diameterBottom: bottom, height: h, tessellation },
        scene,
      );
      mesh.position.set(x, y, z);
      return add(mesh, mat, course);
    }
    function tube(
      name: string,
      path: Vector3[],
      radius: number,
      mat: StandardMaterial,
      course?: CourseSummary,
    ) {
      return add(
        MeshBuilder.CreateTube(
          name,
          { path, radius, tessellation: 8, cap: Mesh.CAP_ALL },
          scene,
        ),
        mat,
        course,
      );
    }
    function ring(
      name: string,
      diameter: number,
      y: number,
      mat: StandardMaterial,
      thickness = 0.035,
    ) {
      const mesh = MeshBuilder.CreateTorus(
        name,
        { diameter, thickness, tessellation: 72 },
        scene,
      );
      mesh.position.y = y;
      return add(mesh, mat);
    }
    function plant(x: number, z: number, size = 1) {
      cylinder(
        "handmade-garden-pot",
        0.64 * size,
        0.42 * size,
        0.66 * size,
        x,
        0.35 * size,
        z,
        terracotta,
      );
      cylinder(
        "planter-rim",
        0.71 * size,
        0.71 * size,
        0.12 * size,
        x,
        0.67 * size,
        z,
        cream,
      );
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const frond = MeshBuilder.CreateSphere(
          "broad-garden-leaf",
          { diameter: 1, segments: 8 },
          scene,
        );
        frond.scaling.set(0.2 * size, 0.9 * size, 0.27 * size);
        frond.position.set(
          x + Math.cos(angle) * 0.23 * size,
          1.05 * size,
          z + Math.sin(angle) * 0.23 * size,
        );
        frond.rotation.set(
          Math.sin(angle) * 0.55,
          angle,
          Math.cos(angle) * 0.55,
        );
        add(frond, i % 2 ? leaf : leafLight);
      }
    }
    function lamp(x: number, z: number) {
      cylinder("lantern-foot", 0.35, 0.45, 0.14, x, 0.1, z, gold);
      box("lantern-base", 0.33, 0.1, 0.33, x, 0.24, z, dark);
      box("lantern-glass", 0.26, 0.42, 0.26, x, 0.49, z, lantern);
      for (const dx of [-0.15, 0.15])
        for (const dz of [-0.15, 0.15])
          box("lantern-frame", 0.035, 0.5, 0.035, x + dx, 0.49, z + dz, gold);
      cylinder(
        "lantern-roof",
        0.02,
        0.48,
        0.19,
        x,
        0.82,
        z,
        gold,
        4,
      ).rotation.y = Math.PI / 4;
    }
    function sign(
      text: string,
      detail: string,
      x: number,
      y: number,
      z: number,
      width: number,
      course?: CourseSummary,
    ) {
      const texture = new DynamicTexture(
        "course-gateway-label",
        { width: 768, height: 224 },
        scene,
        false,
      );
      const ctx = texture.getContext();
      ctx.fillStyle = "#153b40";
      ctx.fillRect(0, 0, 768, 224);
      ctx.strokeStyle = "#d9b973";
      ctx.lineWidth = 6;
      ctx.strokeRect(9, 9, 750, 206);
      ctx.font = "600 40px sans-serif";
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        if (ctx.measureText(`${line} ${word}`).width > 690 && line) {
          lines.push(line);
          line = word;
        } else line = `${line} ${word}`.trim();
      }
      if (line) lines.push(line);
      const visible = lines.slice(0, 2);
      ctx.fillStyle = "#fff0c9";
      visible.forEach((value, index) =>
        ctx.fillText(
          value,
          (768 - ctx.measureText(value).width) / 2,
          visible.length === 1 ? 101 : 76 + index * 48,
        ),
      );
      ctx.font = "26px sans-serif";
      ctx.fillStyle = "#b9d7cc";
      ctx.fillText(detail, (768 - ctx.measureText(detail).width) / 2, 180);
      texture.update(true);
      const labelMaterial = material("gateway-lettering", "#ffffff", 0.45);
      labelMaterial.diffuseTexture = texture;
      const label = MeshBuilder.CreatePlane(
        "published-course-label",
        { width, height: (width * 224) / 768 },
        scene,
      );
      label.position.set(x, y, z);
      return add(label, labelMaterial, course);
    }
    function archPath(x: number, z: number, radius: number, spring = 2.7) {
      const path = [
        new Vector3(x - radius, 0.25, z),
        new Vector3(x - radius, spring, z),
      ];
      for (let step = 1; step <= 24; step++) {
        const angle = Math.PI - (step / 24) * Math.PI;
        path.push(
          new Vector3(
            x + Math.cos(angle) * radius,
            spring + Math.sin(angle) * radius,
            z,
          ),
        );
      }
      path.push(new Vector3(x + radius, 0.25, z));
      return path;
    }
    // An actual stone island, with a mosaic arrival court and broad entry steps.
    cylinder("floating-plaza-rock", 27, 14, 3.4, 0, -2, 0, edge, 64);
    cylinder(
      "terrace-stone-foundation",
      27,
      27,
      0.42,
      0,
      -0.24,
      0,
      limestone,
      80,
    );
    const floor = cylinder(
      "sunlit-plaza-paving",
      26.4,
      26.4,
      0.12,
      0,
      -0.015,
      0,
      tile,
      80,
    );
    floor.receiveShadows = true;
    for (const diameter of [5.4, 6, 11.8, 12.2, 20, 20.3])
      ring("brass-mosaic-inlay", diameter, 0.065, gold);
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      const spoke = box(
        "mosaic-compass-petal",
        0.25,
        0.035,
        1.35,
        Math.sin(angle) * 2,
        0.072,
        Math.cos(angle) * 2,
        i % 2 ? dark : gold,
      );
      spoke.rotation.y = angle;
    }
    for (let i = 0; i < 3; i++)
      box(
        "arrival-stone-step",
        7 + i * 0.6,
        0.2,
        1.1,
        0,
        -0.13 - i * 0.2,
        -12.4 - i * 0.8,
      );
    // Low balustrades keep the horizon open; shrubs and lanterns frame the paths.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = -7 + i * 3.2;
        box("terrace-balustrade-post", 0.5, 1.1, 0.5, side * 11.6, 0.55, z);
        box(
          "terrace-balustrade-cap",
          0.68,
          0.14,
          0.68,
          side * 11.6,
          1.17,
          z,
          cream,
        );
        if (i < 4)
          box(
            "terrace-balustrade-rail",
            0.23,
            0.22,
            2.9,
            side * 11.6,
            0.85,
            z + 1.6,
          );
      }
      plant(side * 10.3, -6.2, 1.4);
      plant(side * 10.4, 6.2, 1.3);
      lamp(side * 8.9, -4.5);
      lamp(side * 9.4, 7.2);
    }
    const positions = courses.slice(0, 4).map((course, index) => {
      const x = (index - (Math.min(courses.length, 4) - 1) / 2) * 4.65;
      const z = 3.5 - Math.abs(x) * 0.12;
      const color = PORTAL_COLORS[index];
      const portalGlow = material(`gateway-energy-${index}`, color, 0.72);
      const stucco = material(
        `course-house-stucco-${index}`,
        ["#f0d19b", "#b9dad0", "#d1bbdf", "#d6d7a4"][index],
      );
      const roof = material(
        `course-house-tile-${index}`,
        ["#b66c42", "#347d86", "#7c558f", "#458b75"][index],
      );
      const arch = archPath(x, z, 1.72);
      tube("carved-stone-gateway", arch, 0.25, limestone, course);
      tube(
        "gateway-brass-inner-trim",
        archPath(x, z - 0.12, 1.52),
        0.045,
        gold,
        course,
      );
      tube(
        "luminous-course-arch",
        archPath(x, z - 0.24, 1.68),
        0.065,
        portalGlow,
        course,
      );
      tube(
        "luminous-outer-trace",
        archPath(x, z + 0.06, 1.88),
        0.025,
        portalGlow,
        course,
      );
      for (const side of [-1, 1]) {
        box(
          "gateway-column-foot",
          0.7,
          0.3,
          0.82,
          x + side * 1.72,
          0.21,
          z,
          edge,
          course,
        );
        box(
          "gateway-column-crown",
          0.62,
          0.2,
          0.75,
          x + side * 1.72,
          2.72,
          z,
          cream,
          course,
        );
        for (let mark = 0; mark < 5; mark++) {
          const rune = box(
            "inlaid-gateway-rune",
            0.12,
            0.12,
            0.04,
            x + side * 1.73,
            0.7 + mark * 0.35,
            z - 0.255,
            gold,
            course,
          );
          rune.rotation.z = Math.PI / 4;
        }
      }
      for (let mark = 0; mark < 9; mark++) {
        const angle = (mark / 8) * Math.PI;
        const key = box(
          "arch-carving",
          0.12,
          0.28,
          0.55,
          x + Math.cos(angle) * 1.73,
          2.7 + Math.sin(angle) * 1.73,
          z,
          mark === 4 ? gold : cream,
          course,
        );
        key.rotation.z = angle - Math.PI / 2;
      }
      for (let step = 0; step < 3; step++)
        box(
          "course-doorstep",
          3.65 - step * 0.22,
          0.16,
          1.1,
          x,
          0.12 + step * 0.14,
          z - 0.7 + step * 0.5,
          limestone,
          course,
        );
      box(
        "portal-light-on-stone",
        3.22,
        0.026,
        0.11,
        x,
        0.23,
        z - 1.12,
        portalGlow,
        course,
      );
      // A real little courtyard sits behind each arch, rather than a flat screen.
      box(
        "preview-house-wall",
        3.1,
        3.05,
        0.38,
        x,
        1.98,
        z + 1.45,
        stucco,
        course,
      );
      box(
        "preview-house-base",
        3.36,
        0.24,
        0.64,
        x,
        0.55,
        z + 1.35,
        edge,
        course,
      );
      box(
        "preview-door-carving",
        1.5,
        2.45,
        0.19,
        x,
        1.72,
        z + 1.19,
        cream,
        course,
      );
      box(
        "preview-recessed-door",
        1.18,
        2.18,
        0.12,
        x,
        1.61,
        z + 1.06,
        roof,
        course,
      );
      for (const dx of [-0.36, 0.36]) {
        box(
          "door-carved-panel",
          0.38,
          1.46,
          0.08,
          x + dx,
          1.72,
          z + 0.97,
          dark,
          course,
        );
        box(
          "door-panel-inlay",
          0.27,
          1.28,
          0.03,
          x + dx,
          1.72,
          z + 0.92,
          gold,
          course,
        );
        box(
          "door-panel-center",
          0.22,
          1.2,
          0.035,
          x + dx,
          1.72,
          z + 0.89,
          roof,
          course,
        );
      }
      box(
        "door-brass-handle",
        0.035,
        0.23,
        0.09,
        x + 0.12,
        1.62,
        z + 0.89,
        gold,
        course,
      );
      box(
        "preview-house-cornice",
        3.5,
        0.2,
        0.9,
        x,
        3.57,
        z + 1.4,
        cream,
        course,
      );
      box(
        "preview-house-roof",
        3.65,
        0.18,
        1.05,
        x,
        3.75,
        z + 1.4,
        roof,
        course,
      );
      for (let stripe = 0; stripe < 11; stripe++) {
        const tile = cylinder(
          "individual-roof-tile",
          0.19,
          0.19,
          1.05,
          x - 1.65 + stripe * 0.33,
          3.86,
          z + 1.4,
          roof,
          8,
          course,
        );
        tile.rotation.x = Math.PI / 2;
      }
      for (const side of [-1, 1]) {
        box(
          "house-geometric-trim",
          0.2,
          0.8,
          0.07,
          x + side * 1.28,
          2.28,
          z + 1.19,
          gold,
          course,
        ).rotation.z = Math.PI / 4;
        plant(x + side * 1.18, z + 0.5, 0.62);
      }
      lamp(x - 1.98, z - 1.15);
      sign(
        course.title,
        `${course.levelCount} ${t("authored levels")} · ${course.language.toUpperCase()}`,
        x,
        5.14,
        z - 0.08,
        3.92,
        course,
      );
      return { x, z };
    });
    // A smaller blue gateway is an actual pointer target and has a button equivalent.
    const returnGlow = material("city-return-blue", "#7ed6f4", 1.1);
    const returnX = 10.35,
      returnZ = 1.5;
    const returnArch = tube(
      "small-city-return-gateway",
      archPath(returnX, returnZ, 0.86, 1.12),
      0.13,
      returnGlow,
    );
    const returnGroup = groups.get(`${returnGlow.uniqueId}:plaza:false`)!;
    returnGroup.returnCity = true;
    box("city-return-plinth", 2.3, 0.2, 1.3, returnX, 0.13, returnZ, limestone);
    const returnSign = sign(
      t("Return to city"),
      "↶",
      returnX,
      2.5,
      returnZ,
      2.3,
    );
    for (const group of groups.values()) {
      if (group.meshes.includes(returnSign)) group.returnCity = true;
    }
    returnArch.metadata = { returnCity: true };
    // A miniature skyline through that small arch makes its destination recognizable.
    for (let i = 0; i < 5; i++)
      box(
        "return-city-skyline",
        0.25,
        0.6 + (i % 3) * 0.3,
        0.2,
        returnX - 0.64 + i * 0.32,
        0.7,
        returnZ + 0.25,
        i % 2 ? cream : dark,
      );
    // Soft sky gradient and bounded distant islands add depth without network assets.
    const skyTexture = new DynamicTexture(
      "sunset-sky-gradient",
      { width: 32, height: 512 },
      scene,
      false,
    );
    const skyContext = skyTexture.getContext();
    const gradient = skyContext.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#658da9");
    gradient.addColorStop(0.48, "#b5d0df");
    gradient.addColorStop(0.7, "#f5d5b8");
    gradient.addColorStop(1, "#f7e8d1");
    skyContext.fillStyle = gradient;
    skyContext.fillRect(0, 0, 32, 512);
    skyTexture.update(true);
    const skyMaterial = material("painted-evening-sky", "#ffffff", 1);
    skyMaterial.disableLighting = true;
    skyMaterial.useEmissiveAsIllumination = true;
    skyMaterial.fogEnabled = false;
    skyMaterial.diffuseColor = Color3.Black();
    skyMaterial.emissiveColor = Color3.Black();
    skyMaterial.emissiveTexture = skyTexture;
    skyMaterial.backFaceCulling = false;
    const sky = MeshBuilder.CreateSphere(
      "portal-universe-sky",
      { diameter: 180, segments: 16 },
      scene,
    );
    sky.material = skyMaterial;
    sky.isPickable = false;
    sky.infiniteDistance = true;
    const distantStone = material("horizon-island-rock", "#998d8a");
    const distantHouses = material("horizon-sandstone-city", "#d4ad7c");
    for (let i = 0; i < 6; i++) {
      const x = [-29, -17, 22, 35, -42, 7][i],
        z = [24, 40, 30, 54, 64, 58][i],
        y = [0, 3, 1, 6, 4, 2][i];
      const island = cylinder(
        "distant-floating-island",
        8 + (i % 2) * 3,
        0.6,
        7,
        x,
        y,
        z,
        distantStone,
        9,
      );
      island.rotation.y = i * 0.9;
      cylinder(
        "floating-island-garden",
        8 + (i % 2) * 3,
        8 + (i % 2) * 3,
        0.3,
        x,
        y + 3.5,
        z,
        leafLight,
        12,
      );
      for (let house = 0; house < 4; house++) {
        const h = 1.6 + ((house + i) % 3) * 0.8;
        box(
          "sky-island-house",
          1.1,
          h,
          1.3,
          x - 2.5 + house * 1.55,
          y + 3.6 + h / 2,
          z,
          distantHouses,
        );
        cylinder(
          "sky-island-dome",
          1.3,
          1.3,
          0.38,
          x - 2.5 + house * 1.55,
          y + 3.8 + h,
          z,
          terracotta,
          12,
        );
      }
    }
    // Merge by material and destination, retaining genuine pickable course identities.
    for (const { meshes, course, returnCity } of groups.values()) {
      const merged = Mesh.MergeMeshes(meshes, true, true);
      if (!merged) continue;
      merged.metadata = course
        ? { course }
        : returnCity
          ? { returnCity: true }
          : null;
      merged.isPickable = Boolean(course || returnCity);
      merged.freezeWorldMatrix();
      if (
        merged.material instanceof StandardMaterial &&
        merged.material.emissiveColor.r +
          merged.material.emissiveColor.g +
          merged.material.emissiveColor.b >
          1.4
      )
        glow?.addIncludedOnlyMesh(merged);
    }
    scene.onPointerObservable.add((event) => {
      if (event.type !== PointerEventTypes.POINTERTAP) return;
      // The scene resolution can differ from its CSS size at every quality.
      // Pick in render pixels so the visible doorway is the pointer target.
      const pointer = event.event as PointerEvent;
      const bounds = element.getBoundingClientRect();
      const pick = scene.pick(
        ((pointer.clientX - bounds.left) / bounds.width) *
          engine.getRenderWidth(),
        ((pointer.clientY - bounds.top) / bounds.height) *
          engine.getRenderHeight(),
      );
      const destination = pick?.pickedMesh?.metadata;
      if (destination?.course) actions.current.onDoor(destination.course);
      else if (destination?.returnCity) actions.current.onClose();
    });
    let portrait = false;
    let snapFocus = true;
    function resize() {
      const width = element.clientWidth,
        height = element.clientHeight;
      portrait = width < 680 && height > width * 0.85;
      snapFocus = true;
      const renderHeight = Math.min(
        height * Math.min(devicePixelRatio || 1, 1.4),
        quality === "low" ? 360 : quality === "medium" ? 720 : 1080,
      );
      engine.setSize(
        Math.max(1, Math.round((width / height) * renderHeight)),
        Math.max(1, Math.round(renderHeight)),
      );
      camera.radius = portrait ? 16 : 18;
      camera.lowerRadiusLimit = portrait ? 12 : 14;
      camera.upperRadiusLimit = portrait ? 20 : 24;
      camera.fov = portrait ? 0.65 : 0.68;
      element.dataset.portalLayout = portrait ? "focused-arch" : "terrace";
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    element.dataset.portalCount = String(Math.min(courses.length, 4));
    element.dataset.portalArchitecture = "open-stone-arches";
    element.dataset.portalMeshCount = String(scene.meshes.length);
    let rendered = 0;
    const identity = Matrix.Identity();
    engine.runRenderLoop(() => {
      const now = performance.now();
      if (document.hidden || now - rendered < (quality === "low" ? 80 : 32))
        return;
      const seconds = Math.min(0.5, (now - rendered) / 1000);
      rendered = now;
      const selected = Math.max(
        0,
        courses.findIndex(
          (course) => course.id === actions.current.activeCourseId,
        ),
      );
      const focus =
        portrait && positions[selected]
          ? new Vector3(positions[selected].x, 3, positions[selected].z)
          : new Vector3(0, 2.05, 1);
      const amount =
        snapFocus || access.current.reducedMotion
          ? 1
          : 1 - Math.exp(-seconds * 5);
      camera.setTarget(
        Vector3.Lerp(camera.target, focus, amount),
        false,
        true,
        true,
      );
      snapFocus = false;
      scene.render();
      const viewport = camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      );
      const project = (point: Vector3) => {
        const position = Vector3.Project(
          point,
          identity,
          scene.getTransformMatrix(),
          viewport,
        );
        return {
          x: (position.x * element.clientWidth) / engine.getRenderWidth(),
          y: (position.y * element.clientHeight) / engine.getRenderHeight(),
        };
      };
      element.dataset.portalTargets = JSON.stringify(
        positions.map((position, index) => ({
          courseId: courses[index].id,
          ...project(new Vector3(position.x, 1.7, position.z + 0.9)),
        })),
      );
      // A visible point on the return plaque, including its partial side view.
      element.dataset.portalReturnTarget = JSON.stringify(
        project(new Vector3(returnX - 0.75, 2.5, returnZ)),
      );
      element.dataset.portalReady = "true";
      element.dataset.portalFocus = portrait
        ? courses[selected]?.id || ""
        : "all";
      element.dataset.portalFocusTarget = JSON.stringify({
        x: camera.target.x,
        y: camera.target.y,
        z: camera.target.z,
      });
    });
    return () => {
      observer.disconnect();
      scene.dispose();
      engine.dispose();
    };
  }, [courses, quality, preferences.language]);
  return (
    <canvas
      ref={canvas}
      className="portal-world-canvas"
      aria-label="3D course portal universe"
    />
  );
}
