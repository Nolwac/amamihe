"""Freeze natural standing LODs and render portraits from the actual character assets.
blender -b -t 4 -P scripts/assets/build-city-residents.py
"""
import bpy
import hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[2]
for profile in ["amani","kofi","nia","tayo","officer"]:
    bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    bpy.ops.import_scene.gltf(filepath=str(root/f"public/assets/character-{profile}.glb"))
    arm=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
    body=next(o for o in bpy.context.scene.objects if o.type=="MESH")
    arm.animation_data_create()
    for track in arm.animation_data.nla_tracks:track.mute=True
    action=next(a for a in bpy.data.actions if a.name.startswith("Idle"))
    arm.animation_data.action=action
    bpy.context.scene.frame_set(8)
    bpy.context.view_layer.update()
    if profile in ["kofi","nia","tayo"]:
        bpy.ops.object.select_all(action="DESELECT");body.select_set(True);bpy.context.view_layer.objects.active=body
        bpy.ops.object.convert(target="MESH");body=bpy.context.object
        world=body.matrix_world.copy();body.parent=None;body.matrix_world=world
        bpy.data.objects.remove(arm,do_unlink=True)
        modifier=body.modifiers.new("standing-resident-budget","DECIMATE");modifier.ratio=.60
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        body["profile"]=profile;body["pose"]="Baked natural standing Idle; no runtime skeleton"
        body["character_source_sha256"]=hashlib.sha256((root/f"public/assets/character-{profile}.glb").read_bytes()).hexdigest()
        bpy.ops.export_scene.gltf(filepath=str(root/f"public/assets/character-{profile}-resident.glb"),export_format="GLB",use_selection=True,export_animations=False,export_morph=False,export_extras=True,export_image_format="JPEG",export_jpeg_quality=75)
    scene=bpy.context.scene;scene.render.engine="CYCLES";scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.world.color=(.16,.16,.16)
    for position,energy in [((2,-3,3),220),((-2,-2,2),150),((0,2,3),160)]:
        bpy.ops.object.light_add(type="AREA",location=position);light=bpy.context.object;light.data.energy=energy;light.data.size=3;light.rotation_euler=(Vector((0,0,1.45))-light.location).to_track_quat("-Z","Y").to_euler()
    bpy.ops.object.camera_add(location=(.8,-3,1.49));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1.43))-camera.location).to_track_quat("-Z","Y").to_euler();camera.data.type="ORTHO";camera.data.ortho_scale=.60;scene.camera=camera
    scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100
    scene.render.filepath=str(root/f"public/assets/character-{profile}-portrait.png");bpy.ops.render.render(write_still=True)
    print("CHARACTER_PORTRAIT",profile)
