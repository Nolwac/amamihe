"""Build a static civilian resident from the Michelle/Mixamo anatomical mesh.

Run: blender -b -t 4 -P scripts/assets/build-resident.py -- /path/to/Michelle.glb
Run build-avatar.py first; this resident uses its cleaned explorer.glb anatomy.
Official source: github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Michelle.glb
Source SHA256 is pinned below. Mixamo characters may be used in games under
Adobe's royalty-free terms. The exported character is an NPC, not a model store.
The frozen natural standing pose removes runtime skeleton work on low-end devices.
"""
import bpy, bmesh, math, sys, hashlib, json, struct
from collections import defaultdict
from mathutils import Vector, Quaternion
from pathlib import Path
root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[sys.argv.index('--') + 1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '7a87e15a99ccbc5e5877be66e1e4ecae0a581adcafa0cce1a5569f49909e968e'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/explorer.glb'))
arm = bpy.data.objects['Character']; body = bpy.data.objects['Explorer']
arm.animation_data_clear()
for o in list(bpy.context.scene.objects):
    if o not in [arm, body]: bpy.data.objects.remove(o, do_unlink=True)
if body.data.shape_keys: body.shape_key_clear()
for b in arm.pose.bones:
    b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = Quaternion((1,0,0,0)); b.location=(0,0,0); b.scale=(1,1,1)
# The player builder has cleaned the anatomical face. Remove its wardrobe,
# braided bun, jewelry and backpack while retaining the actual human mesh.
bm=bmesh.new();bm.from_mesh(body.data)
remove=[f for f in bm.faces if f.material_index>=3]
bmesh.ops.delete(bm,geom=remove,context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.to_mesh(body.data);bm.free()
inverse=body.matrix_world.inverted()
for v in body.data.vertices:
    p=body.matrix_world@v.co
    if .19<p.z<.91:
        t=max(0,min(1,(p.z-.19)/.72));center=(1 if p.x>0 else -1)*(.104-.034*t)
        p.x=center+(p.x-center)*(.66+.18*t);p.y*=.80
    # A slightly wider lower face and neck vary the resident's silhouette.
    if 1.405<p.z<1.49: p.x*=1.08
    v.co=inverse@p
base=body.data.materials[0];base.name='Resident_Skin'
body.data.materials.clear();body.data.materials.append(base)
bs=next(n for n in base.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
for link in list(base.node_tree.links):
    if link.to_node==bs and link.to_socket.name in ['Roughness','Metallic','Normal']:base.node_tree.links.remove(link)
bs.inputs['Roughness'].default_value=.9;bs.inputs['Metallic'].default_value=0
for node in base.node_tree.nodes:
    if node.type=='TEX_IMAGE' and node.image:
        node.image.scale(512,512)
def mat(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.86
    return m
shirt=mat('Resident_Shirt',(.028,.14,.16));pants=mat('Resident_Trousers',(.25,.18,.12));shoes=mat('Resident_Sneakers',(.78,.75,.69));hair=mat('Resident_Hair',(.006,.004,.003))
for m in [shirt,pants,shoes,hair]: body.data.materials.append(m)
for p in body.data.polygons:
    c=body.matrix_world@p.center
    if .205<c.z<1.043:p.material_index=2
    if c.z<.135:p.material_index=3
    if .99<c.z<1.30 and abs(c.x)<.41:p.material_index=1
    if c.z>1.53 and c.y>.02:p.material_index=4
parts=[body]
def mesh(name,verts,faces,material,bone):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);d.materials.append(material)
    for p in d.polygons:p.use_smooth=True
    vg=o.vertex_groups.new(name='mixamorig:'+bone);vg.add(list(range(len(d.vertices))),1,'REPLACE')
    mod=o.modifiers.new('Resident_Skin','ARMATURE');mod.object=arm;parts.append(o)
    return o
def loft(name,rings,material,bone,axis='z'):
    verts=[];faces=[];n=20
    for along,rx,ry,cx,cy in rings:
        for j in range(n):
            a=math.tau*j/n
            verts.append((cx+rx*math.cos(a),cy+ry*math.sin(a),along)if axis=='z' else(along,cx+rx*math.cos(a),cy+ry*math.sin(a)))
    for i in range(len(rings)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    return mesh(name,verts,faces,material,bone)
loft('Resident_Cotton_Shirt',[(1.00,.124,.080,0,0),(1.06,.137,.087,0,0),(1.16,.146,.09,0,0),(1.24,.154,.091,0,0),(1.278,.149,.08,0,0),(1.292,.040,.037,0,0)],shirt,'Spine2')
for side,name in [(1,'Left'),(-1,'Right')]:
    loft(name+'_Rolled_Sleeve',[(side*.13,.061,.064,0,1.272),(side*.20,.058,.060,0,1.270),(side*.28,.052,.055,0,1.266),(side*.34,.046,.048,0,1.263)],shirt,name+'Arm',axis='x')
# Short close-cropped hair cap, sharing the original head's anatomical position.
verts=[];faces=[];n=32;rings=9
for i in range(rings):
    latitude=(.10+(math.pi/2-.10)*i/(rings-1))
    for j in range(n):
        angle=math.tau*j/n
        verts.append((.095*math.cos(latitude)*math.cos(angle),.015+.087*math.cos(latitude)*math.sin(angle),1.522+.104*math.sin(latitude)))
for i in range(rings-1):
    for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
mesh('Resident_Cropped_Hair',verts,faces,hair,'Head')
bones=arm.pose.bones
for side,name in [(1,'Left'),(-1,'Right')]:
    for bone,angle in [(name+'Arm',-side*math.radians(76)),(name+'ForeArm',-side*.10)]:
        b=bones['mixamorig:'+bone];q=b.bone.matrix_local.to_quaternion();b.rotation_quaternion=q.inverted()@Quaternion((0,0,1),angle)@q
bpy.context.view_layer.update()
# Freeze after skin deformation: nearby residents keep human anatomy while low
# quality never has to evaluate their 65-bone skeletons every frame.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.convert(target='MESH');bpy.ops.object.join();body=bpy.context.object;body.name='Civilian_Resident';body.data.name='Civilian_Resident'
body.parent=None;body.matrix_world=body.matrix_world.copy()
bpy.data.objects.remove(arm,do_unlink=True)
# Reduce the original mesh for an NPC viewed at street distance.
mod=body.modifiers.new('Resident_Lod','DECIMATE');mod.ratio=.65
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
body['source']='Michelle / Mixamo sample, three.js';body['pose']='Frozen casual standing pose'
bpy.ops.export_scene.gltf(filepath=str(root/'public/assets/resident.glb'),export_format='GLB',use_selection=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=75,export_morph=False,export_extras=True)
print('EXPORTED_RESIDENT',len(body.data.polygons),root/'public/assets/resident.glb')
# Export an exact local texture for the low-cost StandardMaterial runtime path.
raw=(root/'public/assets/resident.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);payload=raw[28+length:]
for m in doc['materials']:
    if m['name']=='Resident_Skin':
        image=doc['images'][doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];view=doc['bufferViews'][image['bufferView']]
        (root/'public/assets/resident-skin.jpg').write_bytes(payload[view['byteOffset']:view['byteOffset']+view['byteLength']])
# Render the exported GLB itself as proof; this is not a generated concept image.
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(root/'public/assets/resident.glb'))
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=False;s.render.film_transparent=True;s.world.color=(.20,.20,.20)
for pos,energy in [((2,-3,3),260),((-3,-2,2),190),((0,2,3),190)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=energy;o.data.size=3;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.30,-3.5,1.08));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.84))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=1.90;s.camera=cam
s.render.resolution_x=240;s.render.resolution_y=400;s.render.resolution_percentage=100;s.render.filepath=str(root/'public/assets/resident-preview.png');bpy.ops.render.render(write_still=True)

# Rear view checks that removal of the original hair leaves a closed skull.
cam.location=(.30,3.5,1.08);cam.rotation_euler=(Vector((0,0,.84))-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.filepath=str(root/'public/assets/resident-preview-back.png');bpy.ops.render.render(write_still=True)
