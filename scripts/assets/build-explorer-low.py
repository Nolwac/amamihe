"""Derive the animated Low explorer from the authored explorer asset.

Run: blender -b -t 4 -P scripts/assets/build-explorer-low.py
The source and its Michelle/Mixamo provenance are documented in docs/assets/ASSETS.md.
"""
import hashlib
import json
import struct
from pathlib import Path

import bpy

root = Path(__file__).resolve().parents[2]
source = root / "public/assets/explorer.glb"
target = root / "public/assets/explorer-low.glb"
source_digest = hashlib.sha256(source.read_bytes()).hexdigest()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
assert len(armature.data.bones) == 65, "Build Low from the complete authored rig"

# Both clips keep fingers rigid relative to the hand. Merge those weights into
# the same nearest hand ancestor, preserving finger anatomy without evaluating
# forty independent finger/end-finger transforms on every rendered frame.
finger_names = {
    bone.name
    for bone in armature.data.bones
    if "Hand" in bone.name and not bone.name.endswith("Hand")
}
groups_by_index = {group.index: group.name for group in body.vertex_groups}
for vertex in body.data.vertices:
    existing = {groups_by_index[weight.group]: weight.weight for weight in vertex.groups}
    additions = {"mixamorig:LeftHand": 0.0, "mixamorig:RightHand": 0.0}
    for weight in list(vertex.groups):
        name = groups_by_index[weight.group]
        if name in finger_names:
            ancestor = "mixamorig:LeftHand" if ":Left" in name else "mixamorig:RightHand"
            additions[ancestor] += weight.weight
    for name, amount in additions.items():
        if amount <= 0:
            continue
        group = body.vertex_groups.get(name) or body.vertex_groups.new(name=name)
        group.add([vertex.index], existing.get(name, 0.0) + amount, "REPLACE")
for name in finger_names:
    group = body.vertex_groups.get(name)
    if group:
        body.vertex_groups.remove(group)

# Keep the bind mesh in rest space while the topology is reduced. Applying an
# armature-deformed pose before re-export would deform it a second time at play.
armature.data.pose_position = "REST"
bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="EDIT")
for bone in list(armature.data.edit_bones):
    if bone.name in finger_names:
        armature.data.edit_bones.remove(bone)
bpy.ops.object.mode_set(mode="OBJECT")
for action in bpy.data.actions:
    for curve in list(action.fcurves):
        if any(f'pose.bones["{name}"]' in curve.data_path for name in finger_names):
            action.fcurves.remove(curve)

bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
decimate = body.modifiers.new("Low_Surface_Budget", "DECIMATE")
decimate.ratio = 0.50
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_move_to_index(modifier=decimate.name, index=0)
bpy.ops.object.modifier_apply(modifier=decimate.name)

# The Low renderer uses opaque diffuse materials. Preserve the same material
# names, color palettes and skin UVs while excluding unused normal/ORM images.
for material in body.data.materials:
    material.use_backface_culling = True
    if not material.use_nodes:
        continue
    principal = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principal:
        for link in list(material.node_tree.links):
            if link.to_node == principal and link.to_socket.name != "Base Color":
                material.node_tree.links.remove(link)
        principal.inputs["Metallic"].default_value = 0
        principal.inputs["Roughness"].default_value = 0.85
for image in bpy.data.images:
    if max(image.size) > 512:
        scale = 512 / max(image.size)
        image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))

armature.data.pose_position = "POSE"
body["lod"] = "low"
body["source_sha256"] = source_digest
body["finger_weights"] = "merged into nearest hand ancestor"
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(
    filepath=str(target),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_image_format="JPEG",
    export_jpeg_quality=80,
    export_morph=False,
    export_extras=True,
)

binary = target.read_bytes()
length = struct.unpack_from("<I", binary, 12)[0]
document = json.loads(binary[20:20 + length])
assert {"Idle", "Walk"}.issubset({a["name"] for a in document.get("animations", [])})
assert any("mesh" in n and "skin" in n for n in document["nodes"])
assert len(document["skins"][0]["joints"]) == 25
triangles = sum(
    document["accessors"][primitive["indices"]]["count"] // 3
    for mesh in document["meshes"]
    for primitive in mesh["primitives"]
)
assert 12000 <= triangles <= 16000, f"Unexpected Low geometry budget: {triangles}"
print(json.dumps({"bytes": len(binary), "triangles": triangles, "joints": 25, "source_sha256": source_digest}))
