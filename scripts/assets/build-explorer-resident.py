"""Freeze the final explorer as a lighter, static street resident.

Run after build-avatar.py: blender -b -t 4 -P scripts/assets/build-explorer-resident.py
Retains the same skin UVs/material names so runtime cloth palettes are shared.
No animation or skeleton evaluation is needed for this background LOD.
"""
import bpy, bmesh, math, json, struct, hashlib
from pathlib import Path
from mathutils import Vector, Quaternion
root=Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/explorer.glb'))
arm=bpy.data.objects['Character'];body=bpy.data.objects['Explorer'];arm.animation_data_clear()
for o in list(bpy.context.scene.objects):
    if o not in [arm,body]:bpy.data.objects.remove(o,do_unlink=True)
if body.data.shape_keys:body.shape_key_clear()
for b in arm.pose.bones:
    b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion((1,0,0,0));b.location=(0,0,0);b.scale=(1,1,1)
for side,name in [(1,'Left'),(-1,'Right')]:
    for bone,angle in [(name+'Arm',-side*math.radians(76)),(name+'ForeArm',-side*.10)]:
        b=arm.pose.bones['mixamorig:'+bone];q=b.bone.matrix_local.to_quaternion();b.rotation_quaternion=q.inverted()@Quaternion((0,0,1),angle)@q
# Remove the bag and straps; keep the complete human head, hair and costume.
pack_indices={i for i,m in enumerate(body.data.materials)if m.name=='Backpack'}
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in pack_indices],context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(body.data);bm.free()
# Small JPEGs and diffuse-only material inputs avoid extra street NPC shaders.
for m in body.data.materials:
    if not m.use_nodes:continue
    p=m.node_tree.nodes.get('Principled BSDF')
    if p:
        for link in list(m.node_tree.links):
            if link.to_node==p and link.to_socket.name!='Base Color':m.node_tree.links.remove(link)
        p.inputs['Roughness'].default_value=.88;p.inputs['Metallic'].default_value=0
    for node in m.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image:
            if max(node.image.size)>512:node.image.scale(512,512)
bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.object.convert(target='MESH');body=bpy.context.object;body.name='Explorer_Resident';world=body.matrix_world.copy();body.parent=None;body.matrix_world=world
bpy.data.objects.remove(arm,do_unlink=True)
mod=body.modifiers.new('Street_Resident_Lod','DECIMATE');mod.ratio=.56;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
body['source']='Explorer derivative of Michelle / Mixamo, three.js sample';body['pose']='Frozen standing idle; no runtime skeleton'
bpy.ops.export_scene.gltf(filepath=str(root/'public/assets/explorer-resident.glb'),export_format='GLB',use_selection=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=72,export_morph=False,export_extras=True)
raw=(root/'public/assets/explorer-resident.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
print('STATIC_EXPLORER_BYTES',len(raw),'TRIANGLES',sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes']for p in m['primitives']),'SHA256',hashlib.sha256(raw).hexdigest())
assert not doc.get('skins') and not doc.get('animations')
# Inspect the exported asset from both sides, including the closed rear skull.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/explorer-resident.glb'))
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.film_transparent=True;s.world.color=(.2,.2,.2)
for pos,energy in [((2,-3,3),260),((-3,-2,2),190),((0,2,3),190)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=energy;o.data.size=3;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.3,-3.5,1.08));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.84))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.90;s.camera=cam
s.render.resolution_x=240;s.render.resolution_y=400;s.render.resolution_percentage=100;s.render.filepath=str(root/'public/assets/explorer-resident-preview.png');bpy.ops.render.render(write_still=True)
cam.location=(.3,3.5,1.08);cam.rotation_euler=(Vector((0,0,.84))-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.filepath=str(root/'public/assets/explorer-resident-preview-back.png');bpy.ops.render.render(write_still=True)
