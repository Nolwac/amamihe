"""Create bounded low-detail resident derivatives; preserve source rigs and animations."""
from pathlib import Path
import bpy
root = Path(__file__).resolve().parents[2] / 'public/assets'
for name in ['resident', 'explorer-resident']:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(root / (name + '.glb')))
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'ARMATURE':
            obj.data.pose_position = 'REST'
        if obj.type == 'MESH':
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new('Low resident detail', 'DECIMATE')
            mod.ratio = 0.22
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            obj.data.pose_position = 'POSE'
    bpy.ops.export_scene.gltf(filepath=str(root / (name + '-low.glb')), export_format='GLB', export_animations=True)
