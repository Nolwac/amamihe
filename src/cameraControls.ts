import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

/** A full-width swipe turns about 20 degrees on a phone, with a short coast. */
export function configureCameraControls(camera: ArcRotateCamera) {
  camera.angularSensibilityX = 4200;
  camera.angularSensibilityY = 4200;
  camera.panningSensibility = 1800;
  camera.inertia = 0.82;
  camera.panningInertia = 0.82;
  camera.wheelPrecision = 65;
  camera.pinchPrecision = 140;
}
