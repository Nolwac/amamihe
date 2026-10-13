import { configureCameraControls } from "./cameraControls";
import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import "@babylonjs/core/Culling/ray";
import type { CourseSummary } from "../shared/course";
/** Search results inhabit a bounded, genuine 3D portal space. */
export default function PortalScene({
  courses,
  onDoor,
}: {
  courses: CourseSummary[];
  onDoor: (course: CourseSummary) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    choose = useRef(onDoor);
  choose.current = onDoor;
  useEffect(() => {
    const element = canvas.current!;
    const engine = new Engine(element, false, {
      preserveDrawingBuffer: true,
      stencil: false,
      antialias: true,
      powerPreference: "low-power",
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.025, 0.035, 0.09, 1);
    const camera = new ArcRotateCamera(
      "portal-camera",
      -Math.PI / 2,
      1.05,
      15,
      new Vector3(0, 1.5, 0),
      scene,
    );
    configureCameraControls(camera);
    camera.attachControl(element, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 20;
    const light = new HemisphericLight(
      "portal-light",
      new Vector3(0, 1, 0),
      scene,
    );
    light.intensity = 0.85;
    const material = (name: string, hex: string, glow = false) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black();
      if (glow) m.emissiveColor = m.diffuseColor;
      return m;
    };
    const stone = material("portal-stone", "#334255"),
      violet = material("portal-glow", "#9d72ee", true),
      teal = material("portal-inner", "#4fbcc2", true);
    const platform = MeshBuilder.CreateCylinder(
      "arrival-platform",
      { diameter: 17, height: 0.35, tessellation: 24 },
      scene,
    );
    platform.material = stone;
    courses.slice(0, 4).forEach((course, i) => {
      const x = (i % 2 === 0 ? -1 : 1) * (i < 2 ? 3 : 6),
        z = i < 2 ? -1 : 3;
      const ring = MeshBuilder.CreateTorus(
        "portal-" + course.id,
        { diameter: 3.4, thickness: 0.28, tessellation: 20 },
        scene,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 2.1, z);
      ring.material = violet;
      ring.metadata = { course };
      const door = MeshBuilder.CreateDisc(
        "door-" + course.id,
        { radius: 1.55, tessellation: 20 },
        scene,
      );
      door.position.set(x, 2.1, z);
      door.material = teal;
      door.metadata = { course };
      const stairs = MeshBuilder.CreateBox(
        "doorstep-" + course.id,
        { width: 3.5, height: 0.3, depth: 2 },
        scene,
      );
      stairs.position.set(x, 0.4, z - 1);
      stairs.material = stone;
      const sign = MeshBuilder.CreatePlane(
        "preview-" + course.id,
        { width: 3.5, height: 0.7 },
        scene,
      );
      sign.position.set(x, 4.35, z);
      sign.metadata = { course };
      const texture = new DynamicTexture(
        "portal-title-" + course.id,
        { width: 512, height: 100 },
        scene,
        false,
      );
      texture.drawText(
        course.title.slice(0, 34),
        12,
        58,
        "bold 22px sans-serif",
        "#fff",
        "#172139",
        true,
      );
      const label = material("portal-label-" + course.id, "#ffffff", true);
      label.diffuseTexture = texture;
      sign.material = label;
    });
    for (let i = 0; i < 32; i++) {
      const star = MeshBuilder.CreateSphere(
        "star-" + i,
        { diameter: 0.08, segments: 4 },
        scene,
      );
      star.position.set(
        Math.sin(i * 2.4) * 18,
        4 + (i % 8),
        Math.cos(i * 2.4) * 18,
      );
      star.material = teal;
      star.isPickable = false;
    }
    scene.onPointerObservable.add((event) => {
      if (event.type === 1 && event.pickInfo?.pickedMesh?.metadata?.course)
        choose.current(event.pickInfo.pickedMesh.metadata.course);
    });
    const resize = () => {
      const width = element.clientWidth;
      engine.setSize(
        Math.max(
          1,
          Math.round(width * Math.min(1, 240 / element.clientHeight)),
        ),
        240,
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    element.dataset.portalCount = String(Math.min(courses.length, 4));
    let rendered = 0;
    engine.runRenderLoop(() => {
      if (document.hidden || performance.now() - rendered < 100) return;
      rendered = performance.now();
      scene.render();
      element.dataset.portalReady = "true";
    });
    return () => {
      observer.disconnect();
      scene.dispose();
      engine.dispose();
    };
  }, [courses]);
  return (
    <canvas
      ref={canvas}
      aria-label="3D course portal universe"
      style={{
        width: "100%",
        height: 300,
        display: "block",
        touchAction: "none",
      }}
    />
  );
}
