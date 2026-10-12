"""Bake course-action clips into the existing low-cost human explorer.

Run: blender -b -t 4 -P scripts/assets/build-adventure-avatar.py
No download, service, new character source, or change to the city avatar is used.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/assets/explorer-low.glb"
TARGET = ROOT / "public/assets/explorer-adventure-low.glb"
SOURCE_SHA = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
FPS = 24

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
assert len(arm.data.bones) == 25, "Build action clips from the low explorer rig"
arm.animation_data_clear()
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
arm.data.pose_position = "POSE"
bones = arm.pose.bones
rest = {bone.name: bone.bone.matrix_local.to_quaternion() for bone in bones}


def reset():
    for bone in bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def delta(bone):
    """The ancestor rotation relative to its bind-space orientation."""
    if bone is None:
        return Quaternion((1, 0, 0, 0))
    return (delta(bone.parent) @ rest[bone.name] @ bone.rotation_quaternion
            @ rest[bone.name].inverted())


def rotate(name, axis, angle):
    """Rotate around an armature-space axis after the parent's current pose.

    The source is Y-up in armature space: X is left/right and Z faces forward.
    Conjugating by the ancestor pose keeps elbows and knees on their actual
    sagittal hinge after the upper arm has been lowered from its bind T-pose.
    """
    bone = bones["mixamorig:" + name]
    q = rest[bone.name]
    parent = delta(bone.parent)
    bone.rotation_quaternion = (q.inverted() @ parent.inverted()
                                @ Quaternion(axis, angle) @ parent @ q
                                @ bone.rotation_quaternion)


def arms(left=-0.10, right=-0.10, elbow_left=-0.17, elbow_right=-0.17,
         lowered=math.radians(77)):
    for side, name, pitch, elbow in [(1, "Left", left, elbow_left),
                                    (-1, "Right", right, elbow_right)]:
        rotate(name + "Arm", (0, 0, 1), -side * lowered)
        rotate(name + "Arm", (1, 0, 0), pitch)
        rotate(name + "ForeArm", (1, 0, 0), elbow)


def legs(left=0, right=0, knee_left=0.04, knee_right=0.04):
    rotate("LeftUpLeg", (1, 0, 0), left)
    rotate("RightUpLeg", (1, 0, 0), right)
    rotate("LeftLeg", (1, 0, 0), knee_left)
    rotate("RightLeg", (1, 0, 0), knee_right)
    rotate("LeftFoot", (1, 0, 0), -(left + knee_left) * 0.32)
    rotate("RightFoot", (1, 0, 0), -(right + knee_right) * 0.32)


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def guard(t):
    breath = math.sin(t * math.tau)
    rotate("Spine", (1, 0, 0), -0.06)
    rotate("Spine2", (0, 1, 0), -0.20)
    rotate("Hips", (0, 1, 0), -0.10)
    legs(-0.17, -0.08, 0.26, 0.17)
    arms(-0.66 + breath * 0.025, -0.90 - breath * 0.025, -1.95, -1.98)
    rotate("LeftHand", (1, 0, 0), 0.15)
    rotate("RightHand", (1, 0, 0), 0.15)
    bones["mixamorig:Hips"].location.y = -1.5 + 0.25 * breath


def pose(label, t):
    reset()
    phase = t * math.tau
    swing = math.sin(phase)
    if label == "Idle":
        arms()
        legs()
        rotate("Spine2", (1, 0, 0), math.sin(phase) * 0.018)
        bones["mixamorig:Hips"].location.y = 0.16 * math.sin(phase)
    elif label in {"Walk", "Run"}:
        run = label == "Run"
        stride = 0.90 if run else 0.42
        bend = 1.25 if run else 0.48
        rotate("Hips", (0, 1, 0), swing * (0.075 if run else 0.045))
        rotate("Spine", (1, 0, 0), 0.17 if run else 0.025)
        rotate("Spine2", (0, 1, 0), -swing * (0.12 if run else 0.06))
        # Negative thigh pitch moves the knee forward; positive knee flexion
        # folds the heel behind it instead of hyperextending the knee.
        legs(-swing * stride, swing * stride,
             0.12 + max(0, -swing) * bend,
             0.12 + max(0, swing) * bend)
        arms(swing * (0.68 if run else 0.31),
             -swing * (0.68 if run else 0.31),
             -1.12 if run else -0.24, -1.12 if run else -0.24)
        bones["mixamorig:Hips"].location.y = (
            (1.8 if run else 0.65) * abs(math.sin(phase))
        )
    elif label == "Jump":
        tuck = math.sin(math.pi * t) ** 2
        crouch = math.sin(math.pi * min(1, t * 3)) if t < 1 / 3 else 0
        legs(-0.90 * tuck - 0.28 * crouch,
             -0.78 * tuck - 0.28 * crouch,
             0.07 + 1.15 * tuck + 0.40 * crouch,
             0.07 + 1.08 * tuck + 0.40 * crouch)
        arms(-0.12 - tuck * 1.85, -0.12 - tuck * 1.85,
             -0.18 - tuck * 0.45, -0.18 - tuck * 0.45)
        rotate("Spine", (1, 0, 0), tuck * 0.13)
        bones["mixamorig:Hips"].location.y = -4.5 * crouch
    elif label == "Slide":
        settle = ease(min(t * 4, (1 - t) * 4))
        rotate("Hips", (1, 0, 0), -0.22 * settle)
        rotate("Spine", (1, 0, 0), 0.72 * settle)
        rotate("Spine2", (1, 0, 0), 0.15 * settle)
        legs(-1.24 * settle, -1.07 * settle,
             0.04 + 1.95 * settle, 0.04 + 1.72 * settle)
        arms(-0.18 - 0.62 * settle, -0.18 - 0.62 * settle,
             -0.17 - 0.70 * settle, -0.17 - 0.70 * settle)
        bones["mixamorig:Hips"].location.y = -42 * settle
    elif label in {"Guard", "Jab", "Hit"}:
        guard(t)
        if label == "Jab":
            strike = math.sin(math.pi * min(1, t / 0.70)) ** 2
            rotate("Spine2", (0, 1, 0), strike * 0.43)
            rotate("RightArm", (1, 0, 0), -strike * 0.64)
            # Extend the elbow towards the opponent while retaining a small
            # bend, then retract to the same guard pose in the recovery phase.
            rotate("RightForeArm", (1, 0, 0), strike * 1.86)
            rotate("RightHand", (1, 0, 0), -strike * 0.12)
        elif label == "Hit":
            recoil = math.sin(math.pi * t) ** 2
            rotate("Hips", (1, 0, 0), -recoil * 0.17)
            rotate("Spine", (1, 0, 0), -recoil * 0.38)
            rotate("Head", (1, 0, 0), -recoil * 0.23)
            rotate("LeftArm", (1, 0, 0), recoil * 0.18)
            rotate("RightArm", (1, 0, 0), recoil * 0.18)
    elif label == "Build":
        lift = (1 + math.sin(phase)) / 2
        strike = max(0, math.sin(phase + 0.55))
        rotate("Spine", (1, 0, 0), 0.10 + strike * 0.16)
        rotate("Spine2", (0, 1, 0), math.sin(phase) * 0.11)
        legs(-0.08, -0.06, 0.15, 0.12)
        arms(-0.53, -0.25 - lift * 0.97, -1.05, -0.42 - lift * 0.58)
        bones["mixamorig:Hips"].location.y = -0.8 - strike * 0.4


# Clip sampling is independent of the device's rendering rate. Full joint
# rotations/translations are keyed so pause/seek never accumulates pose offsets.
CLIPS = {"Idle": 36, "Walk": 24, "Run": 18, "Jump": 24, "Slide": 24,
         "Guard": 36, "Jab": 16, "Hit": 12, "Build": 36}
bpy.context.scene.render.fps = FPS
for label, duration in CLIPS.items():
    arm.animation_data_create()
    action = bpy.data.actions.new(label)
    arm.animation_data.action = action
    frames = list(range(1, duration + 2, 2))
    if frames[-1] != duration + 1:
        frames.append(duration + 1)
    for frame in frames:
        pose(label, (frame - 1) / duration)
        for bone in bones:
            bone.keyframe_insert("rotation_quaternion", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    track = arm.animation_data.nla_tracks.new()
    track.name = label
    track.strips.new(label, 1, action)
    arm.animation_data.action = None
    for other in arm.animation_data.nla_tracks:
        other.mute = True

for track in arm.animation_data.nla_tracks:
    track.mute = False
reset()
body["source_sha256"] = SOURCE_SHA
body["motion_source"] = "Project-authored adventure clips; 24 Hz skeletal sampling"
body["lod"] = "low-adventure"
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=str(TARGET), export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="NLA_TRACKS",
    export_image_format="JPEG", export_jpeg_quality=80,
    export_morph=False, export_extras=True,
)
binary = TARGET.read_bytes()
length = struct.unpack_from("<I", binary, 12)[0]
document = json.loads(binary[20:20 + length])
assert set(CLIPS) == {a["name"] for a in document.get("animations", [])}
assert len(document["skins"][0]["joints"]) == 25
assert len(binary) <= 1_500_000, "Adventure motion must retain a bounded download"
print(json.dumps({"bytes": len(binary), "joints": 25, "clips": list(CLIPS),
                  "source_sha256": SOURCE_SHA}))
