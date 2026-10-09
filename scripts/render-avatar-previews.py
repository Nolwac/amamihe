"""Render UI thumbnails from the same rigged GLB used in the live game."""
import bpy, math
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/explorer.glb'))
for o in bpy.context.scene.objects:
 if o.type=='ARMATURE':
  o.animation_data_create();o.animation_data.action=bpy.data.actions.get('Idle')
  for t in o.animation_data.nla_tracks:t.mute=True
bpy.context.scene.frame_set(1)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=False
scene.render.film_transparent=True;scene.world.color=(.22,.22,.22)
for pos,energy,size,color in [((1.8,-3,3.2),210,3,(1,.94,.86)),((-2,-2,2),120,3,(.78,.9,1)),((0,2,2.5),180,2,(1,.79,.55))]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.09,-3.4,1.12));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.90;scene.camera=cam
scene.render.resolution_percentage=100;scene.render.resolution_x=200;scene.render.resolution_y=340
jacket=next(m for m in bpy.data.materials if m.name=='Explorer_Jacket');p=jacket.node_tree.nodes.get('Principled BSDF')
# Swap the same local cloth palettes used in the live game so selection
# thumbnails show a visible change rather than almost identical tints.
tex=next(n for n in jacket.node_tree.nodes if n.type=='TEX_IMAGE')
for label in ['terracotta','teal','gold']:
 tex.image=bpy.data.images.load(str(root/f'public/assets/avatar-fabric-{label}.png'))
 scene.render.filepath=str(root/f'public/assets/outfit-{label}.png');bpy.ops.render.render(write_still=True)
tex.image=bpy.data.images.load(str(root/'public/assets/avatar-fabric-teal.png'))
cam.location=(.38,-2,1.56);cam.rotation_euler=(Vector((0,0,1.48))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.43
scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.filepath=str(root/'public/assets/explorer-portrait.png');bpy.ops.render.render(write_still=True)
