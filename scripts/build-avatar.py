"""Build the in-game explorer asset from the Michelle sample's skinned body.
Run with Blender 4.3: blender -b -t 4 -P scripts/build-avatar.py -- /path/to/Michelle.glb
Source/usage information and checksum are recorded in ASSETS.md.
"""
import bpy, bmesh, math, sys, hashlib, json, struct
from collections import defaultdict
from mathutils import Vector, Quaternion
from pathlib import Path
source=Path(sys.argv[sys.argv.index('--')+1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '7a87e15a99ccbc5e5877be66e1e4ecae0a581adcafa0cce1a5569f49909e968e'
root=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
arm=bpy.data.objects['Character']; body=bpy.data.objects['Ch03']
arm.animation_data_clear(); arm.data.pose_position='POSE'
for bone in arm.pose.bones: bone.rotation_mode='QUATERNION'; bone.rotation_quaternion=Quaternion((1,0,0,0)); bone.location=(0,0,0); bone.scale=(1,1,1)
for o in list(bpy.context.scene.objects):
 if o not in [arm,body]: bpy.data.objects.remove(o,do_unlink=True)
if body.data.shape_keys: body.shape_key_clear()
# Connected surfaces identify accessories without deleting facial anatomy.
parent=list(range(len(body.data.vertices)))
def find(i):
 while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
 return i
for e in body.data.edges: parent[find(e.vertices[0])]=find(e.vertices[1])
groups=defaultdict(list)
for v in body.data.vertices: groups[find(v.index)].append(v.index)
inverse=body.matrix_world.inverted()
# Soften the source's very thick cartoon eyebrows while keeping its facial
# topology and expression. The eyes, nose, lips and fingers remain intact.
for gid in [12015,12035,12279,12079]:
 for i in groups.get(gid,[]):
  v=body.data.vertices[i];p=body.matrix_world@v.co
  p.z=1.493+(p.z-1.493)*.68;v.co=inverse@p
removed=set()
for group,ids in groups.items():
 p=[body.matrix_world@body.data.vertices[i].co for i in ids]
 mn=[min(v[a] for v in p) for a in range(3)]; mx=[max(v[a] for v in p) for a in range(3)]
 # Side hair tufts and headphone shells; original mesh has a full face underneath.
 if mn[2]>1.39 and (mx[0]>.119 or mn[0]<-.119): removed.update(ids)
 if mn[1]<-.080 and .008<abs((mn[0]+mx[0])/2)<.080 and mn[2]>1.419 and mx[2]<1.49: removed.update(ids)
 if mn[2]>1.41 and mx[2]<1.493 and abs((mn[0]+mx[0])/2)>.093: removed.update(ids)
 # Remove the original headset's central band and the long side-lock shells.
 # Their front polygons carried red headphone paint even after the outer cups
 # were removed. Hair is rebuilt below around the actual face and ears.
 if group in [5544,4927,7595,7843,15624,14395,12683,13419,9247,9279,9303,9559,9881,9626,9434,9948,9756,14139,14659,14707,15777]: removed.update(ids)
bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=[bm.verts[i] for i in removed],context='VERTS'); bm.to_mesh(body.data); bm.free()
# Retain the authored anatomical mesh and weights, but tailor the lower-leg
# cloth silhouette. The source trousers were deliberately oversized cartoon
# bloomers; this narrows their radius without moving the hips or knee joints.
inverse=body.matrix_world.inverted()
for v in body.data.vertices:
 p=body.matrix_world@v.co
 if .19<p.z<.91:
  t=max(0,min(1,(p.z-.19)/.72))
  factor=.76+.19*t
  center=(1 if p.x>0 else -1)*(.104-.034*t)
  p.x=center+(p.x-center)*factor
  p.y*=factor
  v.co=inverse@p
base=body.data.materials[0]
bs=next(n for n in base.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); bs.inputs['Roughness'].default_value=.8
# Remove glossy original inputs. Keep the diffuse and normal map for skin/facial detail.
for label in ['Roughness','Metallic']:
 for link in list(base.node_tree.links):
  if link.to_node==bs and link.to_socket==bs.inputs[label]:base.node_tree.links.remove(link)
bs.inputs['Metallic'].default_value=0

def material(name,color,rough=.8,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
 return m
teal=material('Explorer_Jacket',(.035,.29,.255))
pants=material('Explorer_Trousers',(.40,.285,.13)); white=material('Cotton',(.82,.80,.72))
hair=material('Braided_Hair',(.006,.004,.003),.94)
leather=material('Backpack',(.035,.033,.028),.72); golden=material('Brass',(.72,.39,.105),.32,.55)
thread=material('Stitching',(.7,.47,.19),.8)
# A dense, woven geometric print with teal ground, warm orange ribbons and
# cream accents. The same local texture is used in the live low-cost shader.
def fabric(label,ground,ribbon):
 size=256; im=bpy.data.images.new('Ankara_'+label,width=size,height=size); pix=[]
 for y in range(size):
  for x in range(size):
   u,v=x%64,y%64; a=(u-32)/32; b=(v-32)/32
   diagonal=(x+y+((x//64)%2)*12)%80
   c=ground
   if diagonal<14:c=ribbon
   if diagonal<3:c=(.035,.075,.065)
   diamond=abs(a)+abs(b)
   if .66<diamond<.88:c=(.89,.65,.23)
   if .78<diamond<.82:c=(.07,.12,.08)
   if abs(a-.30*math.sin(v/8))<.065 and v<49:c=(.9,.83,.58)
   if (u-14)**2+(v-17)**2<15:c=(.93,.73,.29)
   # Fine warp/weft variation stays visible in an offline close-up without
   # requiring a second normal/roughness texture at runtime.
   # Two thread shades keep these PNGs compact on a slow connection.
   weave=.90 if x%3==0 or y%3==0 else .99
   pix.extend((*(k*weave for k in c),1))
 im.pixels=pix;im.filepath_raw=str(root/f'public/assets/avatar-fabric-{label}.png');im.file_format='PNG';im.save();im.pack();return im
im=fabric('teal',(.025,.26,.235),(.82,.38,.065))
fabric('terracotta',(.44,.095,.035),(.065,.22,.19))
fabric('gold',(.57,.35,.08),(.04,.21,.16))
im.filepath_raw=str(root/'public/assets/ankara.png');im.save()
tex=teal.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=im
teal.node_tree.links.new(tex.outputs['Color'],teal.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
# Replace only clothing surfaces; preserve the original skinned facial structure.
body.data.materials.append(pants); body.data.materials.append(white);body.data.materials.append(hair)
for p in body.data.polygons:
 c=body.matrix_world@p.center
 if .205<c.z<1.043:p.material_index=1
 if c.z<.135:p.material_index=2
 if 1.115<c.z<1.318 and abs(c.x)<.103:p.material_index=2
 # The separate scalp supplies the hairline. Coloring whole facial triangles
 # black made an uneven saw-tooth fringe in the live close-up.
 if c.z>1.54 and c.y>.045:p.material_index=3

parts=[body]
def skin(o,bone):
 vg=o.vertex_groups.new(name='mixamorig:'+bone); vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
 mod=o.modifiers.new('Explorer_Skin','ARMATURE'); mod.object=arm
 parts.append(o); return o

def mesh(name,verts,faces,m,bone,uvs=None):
 d=bpy.data.meshes.new(name); d.from_pydata(verts,[],faces); d.update(); o=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(o); d.materials.append(m)
 for p in d.polygons:p.use_smooth=True
 if uvs:
  uv=d.uv_layers.new(name='UVMap')
  for p in d.polygons:
   for li in p.loop_indices:uv.data[li].uv=uvs[d.loops[li].vertex_index]
 skin(o,bone); return o

def loft(name,rings,m,bone,axis='z',segments=24,open_front=False):
 v=[];f=[];uv=[]
 for i,(along,rx,ry,cx,cy) in enumerate(rings):
  for j in range(segments+1):
   a=(-math.pi/2+.38)+(math.tau-.76)*j/segments if open_front else math.tau*j/segments
   v.append((cx+rx*math.cos(a),cy+ry*math.sin(a),along) if axis=='z' else (along,cx+rx*math.cos(a),cy+ry*math.sin(a)))
   uv.append((j/segments*3,i/(len(rings)-1)*3))
 for i in range(len(rings)-1):
  for j in range(segments):
   a=i*(segments+1)+j; b=a+segments+1;f.append((a,a+1,b+1,b))
 return mesh(name,v,f,m,bone,uv)

# The sample's original hair/headphone shell covered an open rear face mesh.
# Once that shell is removed, double-sided eyes and facial polygons are visible
# from behind. Close the anatomical skull with a small opaque skin surface,
# mapped to the existing neck-skin UV island rather than repainting the atlas.
rear_vertices=[];rear_faces=[];rear_uv=[]
for row in range(13):
 phi=math.pi*row/12
 for col in range(17):
  theta=math.pi*col/16
  rear_vertices.append((.090*math.sin(phi)*math.cos(theta),-.005+.086*math.sin(phi)*math.sin(theta),1.461+.112*math.cos(phi)))
  rear_uv.append((.855+.060*col/16,.32-.08*row/12))
for row in range(12):
 for col in range(16):
  k=row*17+col;rear_faces.append((k,k+17,k+18,k+1))
mesh('Anatomical_Rear_Head',rear_vertices,rear_faces,base,'Head',rear_uv)

loft('Cotton_Crop_Top',[(1.111,.094,.073,0,0),(1.15,.102,.083,0,0),(1.195,.112,.086,0,0),(1.242,.115,.084,0,0),(1.272,.102,.067,0,0),(1.295,.040,.037,0,0)],white,'Spine2',segments=24)
loft('Tailored_Jacket',[(1.035,.123,.078,0,0),(1.07,.132,.082,0,0),(1.15,.141,.089,0,0),(1.235,.154,.094,0,0),(1.275,.150,.081,0,0),(1.298,.114,.065,0,0)],teal,'Spine2',open_front=True)
for side,name in [(1,'Left'),(-1,'Right')]:
 o=loft(name+'_Sleeve',[(side*.095,.063,.065,.005,1.27),(side*.145,.067,.065,.002,1.274),(side*.215,.057,.054,0,1.269),(side*.28,.051,.051,0,1.266),(side*.34,.046,.047,0,1.263),(side*.385,.043,.045,-.003,1.263)],teal,name+'Arm',axis='x',segments=16)
 for v in o.data.vertices:
  t=max(0,min(1,(abs(v.co.x)-.30)/.07))
  if t:
   o.vertex_groups['mixamorig:'+name+'Arm'].add([v.index],1-t,'REPLACE')
   if 'mixamorig:'+name+'ForeArm' not in o.vertex_groups:o.vertex_groups.new(name='mixamorig:'+name+'ForeArm')
   o.vertex_groups['mixamorig:'+name+'ForeArm'].add([v.index],t,'REPLACE')

def rounded(name,loc,scale,m,bone,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Soft_Edges','BEVEL');mod.width=bevel;mod.segments=3
 bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=True
 o.data.materials.append(m);skin(o,bone);return o

def tube(name,points,radius,m,bone):
 bpy.ops.object.select_all(action='DESELECT')
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=1;c.bevel_depth=radius;c.bevel_resolution=1
 s=c.splines.new('POLY');s.points.add(len(points)-1)
 for index,(p,co) in enumerate(zip(s.points,points)):
  p.co=(*co,1)
  if name.startswith('Crown_Braid'):
   p.radius=min(1,.25+(len(points)-1-index)/3)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False);o.data.materials.append(m);skin(o,bone);return o
# A close-fitting scalp, curved cornrows and an oval coil bun. Keeping each
# braid to eight radial vertices gives the hair a readable silhouette on low
# graphics without thousands of tiny strands or alpha hair cards.
verts=[];faces=[]
for row in range(9):
 for col in range(33):
  t=math.tau*col/32
  edge=1.49+.33*math.sin(t)
  a=.12+row/8*(edge-.12)
  verts.append((.095*math.sin(a)*math.cos(t),.113*math.sin(a)*math.sin(t),1.475+.101*math.cos(a)))
for row in range(8):
 for col in range(32):
  k=row*33+col;faces.append((k,k+33,k+34,k+1))
# Close the crown's first ring; an open ring exposed a small scalp patch
# between the hairline and the bun during the live front view.
top=len(verts);verts.append((0,0,1.577))
for col in range(32):faces.append((top,col,col+1))
mesh('Braided_Scalp',verts,faces,hair,'Head')
for i in range(13):
 a=math.tau*i/13;pts=[]
 for j in range(22):
  t=j/21;angle=.12+t*(1.49+.33*math.sin(a)-.12)
  radius=math.sin(angle)
  # A gentle rope ripple creates a braid texture in the actual geometry.
  wave=.0014*math.sin(t*math.tau*8+i)
  pts.append(((.097+wave)*radius*math.cos(a),(.115+wave)*radius*math.sin(a),1.475+.103*math.cos(angle)))
 tube('Crown_Braid_'+str(i),pts,.0065,hair,'Head')
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=(0,.025,1.612))
bun=bpy.context.object;bun.name='Bun_Core';bun.scale=(.055,.052,.048)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for p in bun.data.polygons:p.use_smooth=True
bun.data.materials.append(hair);skin(bun,'Head')
for i in range(9):
 pts=[]
 for j in range(42):
  a=math.tau*j/41;phi=math.tau*i/9
  radius=.054+.004*math.sin(a*5+i)
  pts.append((radius*math.cos(a)*math.cos(phi), .025+radius*math.cos(a)*math.sin(phi),1.61+.048*math.sin(a)))
 tube('Bun_Braid_'+str(i),pts,.0067,hair,'Head')
for side in [-1,1]:
 tube('Gold_Hoop',[(side*.103,-.008+.019*math.cos(math.tau*j/20),1.398+.025*math.sin(math.tau*j/20)) for j in range(21)],.0025,golden,'Head')
for side in [-1,1]:
 tube('Jacket_Piping',[(side*.044,-.073,1.042),(side*.050,-.081,1.12),(side*.060,-.09,1.23),(side*.047,-.067,1.296)],.0024,thread,'Spine2')
 loft('Sleeve_Cuff',[(side*.371,.043,.045,-.003,1.263),(side*.388,.041,.043,-.003,1.263)],teal,('Left' if side==1 else 'Right')+'ForeArm',axis='x',segments=16)
 # A subtle bracelet and geometric pendant give the skin/clothing boundary
 # readable detail without creating extra shader materials.
 tube('Wrist_Bangle',[(side*.494,-.002+.023*math.cos(math.tau*j/16),1.266+.026*math.sin(math.tau*j/16)) for j in range(17)],.002,golden,('Left' if side==1 else 'Right')+'ForeArm')
tube('Necklace',[(-.042,-.048,1.312),(-.034,-.073,1.289),(0,-.086,1.272),(.034,-.073,1.289),(.042,-.048,1.312)],.0014,golden,'Spine2')
# The bag has a rounded silhouette, stitched pocket and real shoulder straps.
rounded('Daypack',(0,.139,1.172),(.234,.135,.31),leather,'Spine2',.035)
rounded('Front_Pocket',(0,.214,1.10),(.188,.035,.104),leather,'Spine2',.012)
for side in [-1,1]:
 tube('Shoulder_Strap',[(side*.074,.21,1.075),(side*.085,.173,1.26),(side*.10,.04,1.31),(side*.095,-.073,1.265),(side*.08,-.075,1.18),(side*.085,-.044,1.10)],.012,leather,'Spine2')
 tube('Pocket_Seam',[(side*.084,.235,1.15),(side*.089,.237,1.1),(side*.084,.235,1.052)],.0018,thread,'Spine2')
tube('Zipper',[(x,.237,1.149) for x in [-.075,-.04,0,.04,.075]],.0022,golden,'Spine2')
# Diamond insignia.
tube('Backpack_Insignia',[(0,.212,1.27),(.022,.219,1.245),(0,.217,1.219),(-.022,.219,1.245),(0,.212,1.27)],.003,golden,'Spine2')
for side,name in [(1,'Left'),(-1,'Right')]:
 rounded('Cargo_Pocket',(side*.137,-.054,.73),(.082,.042,.126),pants,name+'UpLeg',.006)
 rounded('Pocket_Flap',(side*.137,-.078,.783),(.082,.013,.028),pants,name+'UpLeg',.004)
 tube('Cargo_Seam',[(side*.098,-.08,.72),(side*.098,-.08,.678),(side*.176,-.08,.678),(side*.176,-.08,.72)],.0012,thread,name+'UpLeg')
 # Light upper and dark laces preserve the original shoe anatomy.
 for i in range(3):
  tube('Sneaker_Laces',[(side*.079,-.058-i*.014,.076),(side*.104,-.061-i*.014,.085),(side*.127,-.058-i*.014,.076)],.0018,leather,name+'Foot')
# A shared skin mesh keeps per-character draw calls bounded by material.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body=bpy.context.object;body.name='Explorer';body.parent=arm
print('BODYMODIFIERS',[(m.name,m.type) for m in body.modifiers], 'WEIGHTS',len(body.vertex_groups))
if not any(m.type=='ARMATURE' for m in body.modifiers):
 mod=body.modifiers.new('Explorer_Rig','ARMATURE');mod.object=arm
# Bake an idle pose and an in-place walk, including knees and elbows.
arm.data.pose_position='POSE'
bones=arm.pose.bones
rest={b.name:b.bone.matrix_local.to_quaternion() for b in bones}
def rotate(name,axis,angle):
 b=bones.get('mixamorig:'+name)
 if not b:return
 q=rest[b.name];b.rotation_quaternion=q.inverted()@Quaternion(axis,angle)@q

def pose(phase,walk):
 for b in bones:b.rotation_quaternion=Quaternion((1,0,0,0));b.location=(0,0,0)
 for side,name in [(1,'Left'),(-1,'Right')]:
  swing=math.sin(phase+(0 if side==1 else math.pi))
  rotate(name+'Arm',(0,0,1),-side*math.radians(76))
  q=rest['mixamorig:'+name+'Arm']; b=bones['mixamorig:'+name+'Arm']
  b.rotation_quaternion=(q.inverted()@Quaternion((1,0,0),-swing*.27*walk)@q)@b.rotation_quaternion
  rotate(name+'ForeArm',(0,0,1),-side*.10)
  rotate(name+'UpLeg',(1,0,0),swing*.33*walk)
  rotate(name+'Leg',(1,0,0),-max(0,-swing)*.48*walk)
  rotate(name+'Foot',(1,0,0),max(0,-swing)*.15*walk)
 rotate('Spine2',(0,1,0),math.sin(phase)*.028)
 bones['mixamorig:Hips'].location.y=.22*abs(math.sin(phase)) if walk else .07*math.sin(phase)

scene=bpy.context.scene; scene.render.fps=24
for label,amount in [('Idle',0),('Walk',1)]:
 arm.animation_data_create(); arm.animation_data.action=bpy.data.actions.new(label)
 for frame in range(1,26,3):
  phase=(frame-1)/24*math.tau;pose(phase,amount)
  for b in bones:
   b.keyframe_insert('rotation_quaternion',frame=frame);b.keyframe_insert('location',frame=frame)
 pose(0,amount)
 for b in bones:b.keyframe_insert('rotation_quaternion',frame=25);b.keyframe_insert('location',frame=25)
 track=arm.animation_data.nla_tracks.new();track.name=label;track.strips.new(label,1,arm.animation_data.action);arm.animation_data.action=None
 for t in arm.animation_data.nla_tracks:t.mute=True
for t in arm.animation_data.nla_tracks:t.mute=False
pose(0,0)
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);arm.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(root/'public/assets/explorer.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_image_format='JPEG',export_jpeg_quality=85,export_morph=False,export_extras=True)
print('EXPORTED',root/'public/assets/explorer.glb')

# Extract the sRGB skin texture for the mobile StandardMaterial shader.
raw=(root/'public/assets/explorer.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0]
doc=json.loads(raw[20:20+length]);payload=raw[28+length:]
assert any('mesh' in n and 'skin' in n for n in doc['nodes']), 'Skin export was lost'
for m in doc['materials']:
 if m['name']=='Ch03_Body':
  image=doc['images'][doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
  view=doc['bufferViews'][image['bufferView']]
  (root/'public/assets/avatar-skin.jpg').write_bytes(payload[view['byteOffset']:view['byteOffset']+view['byteLength']])
