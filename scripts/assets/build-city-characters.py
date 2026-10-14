"""Build distinct human faces and transport poses on the verified explorer rig.

blender -b -t 4 -P scripts/assets/build-city-characters.py
The body/rig retains the explorer's Michelle/Mixamo provenance. New heads,
hairstyles, uniform details and seated/restrained poses are project-authored.
"""
import hashlib
import json
import math
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
builder = (ROOT / "scripts/assets/build-adventure-avatar.py").read_text()
setup = builder.split("# Clip sampling is independent")[0]
assert hashlib.sha256((ROOT / "public/assets/explorer-low.glb").read_bytes()).hexdigest() == "b128411df5e3933880a9e357f7ff1e9ed2a753047c71a77391a1c4a1479656e9", "Use the verified Low explorer source"
profiles = [
    ("amani", False, (.34, .18, .10), 1.0, "braids"),
    ("kofi", True, (.30, .14, .07), 1.18, "crop"),
    ("nia", True, (.46, .26, .15), .94, "curls"),
    ("tayo", True, (.60, .37, .21), 1.12, "short"),
    ("officer", True, (.30, .14, .07), 1.18, "cap"),
]

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = .88
    return m

for profile, new_head, skin, shoulder, hairstyle in profiles:
    # Reuse the same tested articulated action definitions without rewriting
    # the existing assets or changing the original adventure clip contract.
    exec(compile(setup, str(ROOT / "scripts/assets/build-adventure-avatar.py"), "exec"), globals())
    original_pose = pose
    parts = []
    skin_material = material("Character_Skin", skin)
    hair_material = material("Character_Hair", (.025, .016, .012))
    eye_material = material("Character_Eyes", (.025, .018, .016))
    white_material = material("Character_EyeWhite", (.82, .79, .70))
    lip_material = material("Character_Lips", tuple(c * .63 for c in skin))
    shirt = material("Uniform_Shirt", (.025, .07, .14))
    metal = material("Uniform_Badge", (.86, .63, .20))

    def ellipsoid(name, position, scale, mat, bone="Head", segments=20):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, location=position)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        obj.data.materials.append(mat)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for face in obj.data.polygons:
            face.use_smooth = True
        obj.vertex_groups.new(name="mixamorig:" + bone).add(range(len(obj.data.vertices)), 1, "REPLACE")
        parts.append(obj)
        return obj

    if new_head:
        # Remove only head-weighted geometry, preserving the neck, shirt and
        # anatomical shoulder/arm surfaces and their existing joint weights.
        head_groups = {g.index for g in body.vertex_groups if g.name.endswith(":Head")}
        removed = [v.index for v in body.data.vertices
                   if (body.matrix_world @ v.co).z > 1.37
                   and any(w.group in head_groups and w.weight > .45 for w in v.groups)]
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in removed], context="VERTS")
        bm.to_mesh(body.data)
        bm.free()
        inverse = body.matrix_world.inverted()
        for v in body.data.vertices:
            p = body.matrix_world @ v.co
            if .87 < p.z < 1.39:
                p.x *= shoulder
                v.co = inverse @ p
        width = .089 if profile == "nia" else .110 if profile == "tayo" else .103
        neck = ellipsoid(profile + "-neck", (0,.012,1.40), (.049,.044,.15), skin_material, "Neck")
        # Connect the collar to the moving jaw instead of moving the whole neck
        # rigidly with its lower joint. The overlap stays inside head and shirt.
        head_group = neck.vertex_groups.new(name="mixamorig:Head")
        neck_group = neck.vertex_groups.get("mixamorig:Neck")
        for vertex in neck.data.vertices:
            head_weight = max(0, min(1, (vertex.co.z + neck.location.z - 1.32) / .22))
            neck_group.add([vertex.index], 1 - head_weight, "REPLACE")
            head_group.add([vertex.index], head_weight, "REPLACE")
        ellipsoid(profile + "-face", (0, -.003, 1.51), (width, .088, .132), skin_material)
        ellipsoid(profile + "-jaw", (0, -.007, 1.435), (width * (.62 if profile=="nia" else .87), .075, .052), skin_material)
        for side in [-1, 1]:
            ellipsoid(profile + "-ear", (side * width, 0, 1.495), (.017, .018, .029), skin_material, segments=12)
            ellipsoid(profile + "-eye", (side * .039, -.082, 1.537), (.020, .009, .012), white_material, segments=12)
            ellipsoid(profile + "-pupil", (side * .039, -.091, 1.537), (.008, .004, .008), eye_material, segments=12)
            ellipsoid(profile + "-brow", (side * .039, -.086, 1.558), (.026, .005, .004), hair_material, segments=12)
        ellipsoid(profile + "-nose", (0, -.091, 1.505), (.013 if profile=="nia" else .021, .020 if profile=="nia" else .026, .020 if profile=="tayo" else .026), skin_material, segments=12)
        ellipsoid(profile + "-mouth", (0, -.080, 1.463), (.025, .006, .006), lip_material, segments=12)
        if hairstyle == "curls":
            for i in range(10):
                angle = i * math.tau / 10
                ellipsoid("curly-hair", (math.cos(angle) * .075, math.sin(angle) * .065, 1.612), (.039, .035, .038), hair_material, segments=12)
        elif hairstyle != "cap":
            ellipsoid("short-hair", (0, .012, 1.614), (width * .96, .076, .042 if hairstyle == "crop" else .024), hair_material)
        # The hands retain modeled fingers but match the new authored face.
        body.data.materials.append(skin_material)
        hand_groups = {g.index for g in body.vertex_groups if g.name.endswith("Hand")}
        for face in body.data.polygons:
            if all(any(w.group in hand_groups and w.weight > .55 for w in body.data.vertices[i].groups) for i in face.vertices):
                face.material_index = len(body.data.materials) - 1

    if profile == "officer":
        removed_materials={i for i,m in enumerate(body.data.materials) if any(n in m.name for n in ["Backpack","Brass","Stitching"])}
        bm=bmesh.new();bm.from_mesh(body.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in removed_materials],context="FACES")
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context="VERTS");bm.to_mesh(body.data);bm.free()
        for m in body.data.materials:
            if any(name in m.name for name in ["Jacket", "Trousers", "Cotton", "Backpack", "Stitch"]):
                p = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
                if p:
                    for link in list(m.node_tree.links):
                        if link.to_node == p:
                            m.node_tree.links.remove(link)
                    p.inputs["Base Color"].default_value = (.025, .07, .14, 1)
        ellipsoid("Uniform_Cap", (0, .005, 1.644), (.111, .092, .035), shirt)
        ellipsoid("Uniform_CapPeak", (0, -.080, 1.624), (.102, .070, .008), shirt)
        ellipsoid("Uniform_CapBadge", (0, -.086, 1.65), (.014, .004, .018), metal, segments=12)
        ellipsoid("Uniform_ChestBadge", (-.085, -.19, 1.26), (.019, .004, .027), metal, "Spine2", 12)
        ellipsoid("Uniform_Belt", (0, .0, .97), (.151, .090, .025), shirt, "Hips")

    if parts:
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        for obj in parts:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.join()

    def city_pose(label, t):
        if label == "WalkRestrained":
            original_pose("Walk", t)
            for name in ["Left", "Right"]:
                rotate(name + "Arm", (1, 0, 0), -.35)
                rotate(name + "ForeArm", (1, 0, 0), -.85)
        elif label in {"Sit", "Restrained"}:
            reset()
            arms(-.65, -.65, -.92, -.92)
            if label == "Sit":
                legs(-1.55, -1.55, 1.50, 1.50)
                bones["mixamorig:Hips"].location.y = -45
            else:
                legs()
        else:
            original_pose(label, t)

    clips = {"Idle": 36, "Walk": 24, "Run": 18, "Jump": 24, "Slide": 24,
             "Guard": 36, "Jab": 16, "Hit": 12, "Build": 36,
             "Sit": 24, "Restrained": 24, "WalkRestrained": 24}
    bpy.context.scene.render.fps = FPS
    for label, duration in clips.items():
        arm.animation_data_create()
        action = bpy.data.actions.new(label)
        arm.animation_data.action = action
        for frame in range(1, duration + 2, 2):
            city_pose(label, (frame - 1) / duration)
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
    body["profile"] = profile
    body["authored_detail"] = "Distinct face/hair and city transport poses; explorer body and rig provenance retained"
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    target = ROOT / f"public/assets/character-{profile}.glb"
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_image_format="JPEG",
        export_jpeg_quality=80, export_morph=False, export_extras=True)
    raw = target.read_bytes()
    doc = json.loads(raw[20:20 + struct.unpack_from("<I", raw, 12)[0]])
    assert len(doc["skins"][0]["joints"]) == 25
    assert set(clips) == {a["name"] for a in doc["animations"]}
    assert len(raw) < 1_500_000
    print(json.dumps({"profile": profile, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "source_sha256": SOURCE_SHA}))
