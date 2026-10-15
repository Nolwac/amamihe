"""Build city profiles from the connected, textured explorer anatomy.

blender -b -t 4 -P scripts/assets/build-city-characters.py
The checked explorer's Michelle/Mixamo anatomy, UVs and rig are retained.
Facial contour edits, fitted hairstyles, clothing and officer tailoring are
project-authored. Facial anatomy is never replaced with primitive shapes.
"""
import hashlib
import json
import math
import random
import struct
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
builder = (ROOT / "scripts/assets/build-adventure-avatar.py").read_text()
setup = builder.split("# Clip sampling is independent")[0]
assert hashlib.sha256((ROOT / "public/assets/explorer-low.glb").read_bytes()).hexdigest() == "b128411df5e3933880a9e357f7ff1e9ed2a753047c71a77391a1c4a1479656e9", "Use the verified Low explorer source"
profiles = ["amani", "kofi", "nia", "tayo", "officer"]


def material(name, color, roughness=.78, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return m


for profile in profiles:
    exec(compile(setup, str(ROOT / "scripts/assets/build-adventure-avatar.py"), "exec"), globals())
    original_pose = pose
    parts = []
    rng = random.Random(1404 + profiles.index(profile))
    hair = material("Character_Hair", (.004, .0025, .0015), .94)
    warm_hair = material("Character_HairHighlight", (.024, .014, .008), .92)
    uniform = material("Uniform_Shirt", (.012, .027, .057), .76)
    trim = material("Uniform_Trim", (.014, .026, .047), .66)
    pale_blue = material("Uniform_Collar", (.28, .43, .59), .80)
    gold = material("Uniform_Badge", (.71, .44, .12), .34, .48)
    ivory = material("Uniform_Lettering", (.83, .83, .73), .65)

    def mesh(name, vertices, faces, mat, bone="Head", uvs=None):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        data.materials.append(mat)
        for face in data.polygons:
            face.use_smooth = True
        obj.vertex_groups.new(name="mixamorig:" + bone).add(range(len(vertices)), 1, "REPLACE")
        if uvs:
            uv = data.uv_layers.new(name="UVMap")
            for poly in data.polygons:
                for loop in poly.loop_indices:
                    uv.data[loop].uv = uvs[data.loops[loop].vertex_index]
        parts.append(obj)
        return obj

    def tube(name, points, radius, mat=hair, bone="Head", taper=False):
        curve = bpy.data.curves.new(name, "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 1
        curve.bevel_depth = radius
        curve.bevel_resolution = 1
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for i, (point, coordinate) in enumerate(zip(spline.points, points)):
            point.co = (*coordinate, 1)
            point.radius = max(.12, 1 - .88 * (i / max(1, len(points) - 1)) ** 3) if taper else 1
        obj = bpy.data.objects.new(name, curve)
        bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.object
        obj.data.materials.append(mat)
        obj.vertex_groups.new(name="mixamorig:" + bone).add(range(len(obj.data.vertices)), 1, "REPLACE")
        for face in obj.data.polygons:
            face.use_smooth = True
        parts.append(obj)
        return obj

    def rounded(name, center, dimensions, mat, bone="Spine2", bevel=.004):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center)
        obj = bpy.context.object
        obj.name = name
        obj.scale = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        modifier = obj.modifiers.new("Tailored edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for face in obj.data.polygons:
            face.use_smooth = True
        obj.data.materials.append(mat)
        obj.vertex_groups.new(name="mixamorig:" + bone).add(range(len(obj.data.vertices)), 1, "REPLACE")
        parts.append(obj)
        return obj

    def loft(name, rings, mat, bone="Head", segments=40):
        vertices, faces = [], []
        for z, rx, ry, cx, cy in rings:
            for j in range(segments):
                angle = math.tau * j / segments
                vertices.append((cx + rx * math.cos(angle), cy + ry * math.sin(angle), z))
        for row in range(len(rings) - 1):
            for j in range(segments):
                k = row * segments + j
                n = row * segments + (j + 1) % segments
                faces.append((k, n, n + segments, k + segments))
        faces.append(tuple(reversed(range(segments))))
        faces.append(tuple((len(rings) - 1) * segments + j for j in range(segments)))
        return mesh(name, vertices, faces, mat, bone)

    # Keep the source face, eyelids, lips, ears, neck, UVs and smooth weights.
    # Remove only separately authored hair/jewelry, never skin or head vertices.
    if profile != "amani":
        removed_materials = {i for i, mat in enumerate(body.data.materials) if "Braided_Hair" in mat.name or "Brass" in mat.name}
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in removed_materials and ("Braided_Hair" in body.data.materials[f.material_index].name or min((body.matrix_world @ v.co).z for v in f.verts) > 1.36)], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(body.data)
        bm.free()

    masculine = profile in {"kofi", "tayo", "officer"}
    inverse = body.matrix_world.inverted()
    skin_indices = {i for i, mat in enumerate(body.data.materials) if "Ch03_Body" in mat.name}
    skin_vertices = {index for face in body.data.polygons if face.material_index in skin_indices for index in face.vertices}
    for vertex in body.data.vertices:
        p = body.matrix_world @ vertex.co
        if masculine:
            if p.z > 1.33 and vertex.index in skin_vertices:
                jaw = max(0, 1 - abs(p.z - 1.389) / .080)
                p.x *= (1.08 if profile == "tayo" else 1.11) + .24 * jaw
                p.z = 1.33 + (p.z - 1.33) * (1.065 if profile == "tayo" else 1.09)
                # Broaden the bridge and jaw rather than adding detached features.
                if p.y < -.06 and 1.44 < p.z < 1.49:
                    p.x *= 1.04
                if 1.34 < p.z < 1.39:
                    p.y -= .006
            if .96 < p.z < 1.32:
                # Broader shoulders and a less pinched waist remain on the original rig.
                p.x *= 1.14 if profile != "tayo" else 1.08
                if abs(p.x) < .13:
                    p.y *= .94
        elif profile == "nia" and p.z > 1.35 and vertex.index in skin_vertices:
            p.x *= .96
            p.z = 1.35 + (p.z - 1.35) * 1.02
        if profile != "amani" and p.z > 1.50 and p.y > .055 and vertex.index in skin_vertices:
            # The cleaned source retains two tiny rear-skull triangles beyond
            # the original braids. Keep them inside the fitted new scalp.
            radius=.090*math.sqrt(max(.03,1-((p.z-1.475)/.13)**2))
            p.x=max(-radius,min(radius,p.x))
            p.y=min(p.y,.085)
        vertex.co = inverse @ p

    # Preserve diffuse facial detail; a glTF factor provides a modest complexion
    # variation without painting over eye whites, brows, nostrils or lip anatomy.
    base = body.data.materials[0]
    shader = base.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .80
    tint = {"amani": (1, 1, 1, 1), "kofi": (.77, .77, .75, 1), "nia": (1.04, 1.01, .96, 1), "tayo": (1.12, 1.04, .93, 1), "officer": (.82, .81, .78, 1)}[profile]
    shader.inputs["Base Color"].default_value = tint

    if profile != "amani":
        # A continuous fitted scalp follows the existing skull and forehead.
        # Small coiled ridges supply actual silhouette detail rather than large spheres.
        scalp_raise = .009 if profile in {"kofi", "officer"} else .015
        center_z = 1.483 if masculine else 1.478
        width = .105 if masculine else .114
        vertices, faces = [], []
        for row in range(15):
            for col in range(49):
                theta = math.tau * col / 48
                end = 1.50 + .34 * math.sin(theta)
                phi = .015 + row / 14 * (end - .015)
                wave = .0014 * math.sin(theta * 31 + phi * 19)
                vertices.append(((width + wave) * math.sin(phi) * math.cos(theta), ((.132 if profile == "nia" else .114) + wave) * math.sin(phi) * math.sin(theta), center_z + (.146 if profile == "nia" else .108 + scalp_raise) * math.cos(phi)))
        for row in range(14):
            for col in range(48):
                k = row * 49 + col
                faces.append((k, k + 49, k + 50, k + 1))
        top = len(vertices)
        vertices.append((0, 0, center_z + .108 + scalp_raise))
        for col in range(48):
            faces.append((top, col, col + 1))
        mesh("Fitted sculpted scalp", vertices, faces, hair)

        if profile in {"kofi", "officer"}:
            # Tapered crop: fine waves follow the skull instead of a flat cap.
            for row in range(9 if profile == "kofi" else 0):
                phi = .15 + row * .14
                for col in range(14):
                    theta = math.tau * col / 14 + row * .14
                    if phi > 1.48 + .34 * math.sin(theta):
                        continue
                    points = []
                    for j in range(7):
                        t = theta + (j / 6 - .5) * .18
                        p = phi + .012 * math.sin(j * math.pi / 3)
                        points.append(((width + .002) * math.sin(p) * math.cos(t), .116 * math.sin(p) * math.sin(t), center_z + .12 * math.cos(p) + .0015))
                    tube("Close crop coil", points, .0022, warm_hair if col % 6 == 0 else hair)
        elif profile == "nia":
            # A rounded natural curl bob: compact overlapping coils are arranged
            # on a head-shaped volume, with an exposed forehead and temple taper.
            for row in range(7):
                phi = .12 + row * .22
                for col in range(18):
                    theta = math.tau * col / 18 + row * .16
                    if phi > 1.55 + .39 * math.sin(theta):
                        continue
                    radius = .112 + .012 * rng.random()
                    center = Vector((radius * math.sin(phi) * math.cos(theta), (radius + .02) * math.sin(phi) * math.sin(theta), 1.485 + .146 * math.cos(phi)))
                    tangent = Vector((-math.sin(theta), math.cos(theta), 0))
                    vertical = Vector((math.cos(phi)*math.cos(theta), math.cos(phi)*math.sin(theta), -math.sin(phi)))
                    points = [tuple(center + tangent * (.010 * math.cos(j / 10 * math.tau)) + vertical * (.009 * math.sin(j / 10 * math.tau))) for j in range(11)]
                    tube("Natural hair coil", points, .0058, warm_hair if col % 8 == 0 else hair)
        else:
            # Swept short locs, each a bent tapered strand with fine ridges.
            for row in range(5):
                for col in range(7):
                    x = (col - 3) * .026
                    y = -.076 + row * .034
                    points = []
                    for j in range(13):
                        t = j / 12
                        xx = x + .038 * math.sin(math.pi * t / 2)
                        yy = y + .074 * t
                        zz = 1.566 + .047 * math.sin(math.pi * t) - .013 * abs(col - 3) - .008 * row
                        points.append((xx, yy, zz))
                    tube("Swept tapered loc", points, .009, warm_hair if col % 4 == 0 else hair, taper=True)

    # Masculine facial hair is a thin conforming jaw surface. It does not replace
    # cheeks, chin, mouth or their original smoothly shaded anatomical geometry.
    if masculine:
        beard_vertices, beard_faces, beard_indices = [], [], {}
        beard_mat = material("Character_FacialHair", (.008,.0045,.0025) if profile != "tayo" else (.028,.016,.009), .96)
        # Clip the actual cheek/jaw anatomy to a clean hairline and weld its
        # shared positions, preserving smooth normals instead of faceted patches.
        def clipped(poly, signed_distance):
            output=[]
            for a,b in zip(poly, poly[1:]+poly[:1]):
                da,db=signed_distance(a),signed_distance(b)
                if da >= 0:
                    output.append(a)
                if (da >= 0) != (db >= 0):
                    output.append(a.lerp(b, da/(da-db)))
            return output
        for face in body.data.polygons:
            if face.material_index not in skin_indices:
                continue
            coords = [body.matrix_world @ body.data.vertices[i].co for i in face.vertices]
            center = sum(coords, Vector()) / len(coords)
            if not (1.33 < center.z < 1.50 and center.y < .025 and abs(center.x) < .12):
                continue
            for boundary in [lambda p: p.z-1.355, lambda p: .018-p.y,
                             lambda p: 1.397+.65*abs(p.x)-p.z]:
                coords=clipped(coords,boundary)
                if len(coords)<3:
                    break
            if len(coords)<3:
                continue
            if profile == "kofi":
                coords=clipped(coords, lambda p: .060-abs(p.x))
            if len(coords)<3:
                continue
            indices=[]
            for p in coords:
                p.y-=.0016
                p.x*=1.006
                key=tuple(round(value,6) for value in p)
                if key not in beard_indices:
                    beard_indices[key]=len(beard_vertices)
                    beard_vertices.append(tuple(p))
                indices.append(beard_indices[key])
            beard_faces.append(tuple(indices))
        for face in body.data.polygons:
            if face.material_index not in skin_indices:
                continue
            coords=[body.matrix_world @ body.data.vertices[i].co for i in face.vertices]
            center=sum(coords,Vector())/len(coords)
            if not (1.40 < center.z < 1.45 and center.y < -.070 and abs(center.x)<.045):
                continue
            for boundary in [lambda p: .034-abs(p.x), lambda p: p.z-1.417,
                             lambda p: 1.430-.22*abs(p.x)-p.z]:
                coords=clipped(coords,boundary)
                if len(coords)<3:
                    break
            if len(coords)<3:
                continue
            indices=[]
            for p in coords:
                p.y-=.0018
                key=tuple(round(value,6) for value in p)
                if key not in beard_indices:
                    beard_indices[key]=len(beard_vertices)
                    beard_vertices.append(tuple(p))
                indices.append(beard_indices[key])
            beard_faces.append(tuple(indices))
        hair_vertices,hair_faces=[],[]
        fiber_rng=random.Random(4401+profiles.index(profile))
        for polygon in beard_faces:
            for offset in range(1,len(polygon)-1):
                a,b,c=[Vector(beard_vertices[i]) for i in [polygon[0],polygon[offset],polygon[offset+1]]]
                normal=(b-a).cross(c-a)
                area=normal.length/2
                if area<1e-10:
                    continue
                normal.normalize()
                if normal.y>0:
                    normal=-normal
                # Individual short tapered fibers leave the anatomical skin
                # visible between hairs; there is no opaque beard shell.
                for _ in range(max(1,round(area*18000))):
                    u,v=fiber_rng.random(),fiber_rng.random()
                    if u+v>1:
                        u,v=1-u,1-v
                    root=a+(b-a)*u+(c-a)*v+normal*.0005
                    length=fiber_rng.uniform(.0023,.0046)
                    tangent=Vector((fiber_rng.uniform(-.13,.13),0,-1))
                    tangent=(tangent-normal*tangent.dot(normal)).normalized()
                    across=normal.cross(tangent).normalized()
                    width=fiber_rng.uniform(.0006,.0010)
                    tip=root+tangent*length+normal*.0004
                    index=len(hair_vertices)
                    hair_vertices.extend([tuple(root-across*width),tuple(root+across*width),tuple(tip+across*width*.10),tuple(tip-across*width*.10)])
                    hair_faces.append((index,index+1,index+2,index+3))
        mesh("Individual fitted beard fibers",hair_vertices,hair_faces,beard_mat)

    # Different authored garment colors preserve each profile's identity instead
    # of asking the runtime to recolor every resident with the player's palette.
    palettes = {"kofi": ((.46,.22,.045), (.045,.075,.095)), "nia": ((.075,.22,.22),(.17,.20,.16)), "tayo": ((.20,.095,.035),(.085,.12,.17))}
    if profile in palettes:
        coat, trousers = palettes[profile]
        for mat in body.data.materials:
            if "Explorer_Trousers" in mat.name:
                mat.name = profile.title() + "_TailoredTrousers"
                mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (*trousers, 1)
            if "Explorer_Jacket" in mat.name:
                mat.name = profile.title() + "_WovenJacket"
                # Keep the checked-in textile UVs and map, with a subtle tint.
                mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (1, 1, 1, 1)
                texture = next((node for node in mat.node_tree.nodes if node.type == "TEX_IMAGE"), None)
                if texture:
                    fabric = "gold" if profile == "kofi" else "terracotta" if profile == "tayo" else "teal"
                    texture.image = bpy.data.images.load(str(ROOT / f"public/assets/avatar-fabric-{fabric}.png"), check_existing=True)
                    texture.image.pack()
        if masculine:
            # A full-length knit under the open jacket removes the crop-top gap.
            knit = material(profile.title() + "_KnitShirt", (.70,.65,.51) if profile == "kofi" else (.16,.24,.25))
            loft("Full length tailored shirt", [(1.025,.122,.076,0,0),(1.10,.123,.080,0,0),(1.20,.128,.085,0,0),(1.27,.122,.070,0,0),(1.305,.047,.041,0,0)], knit, "Spine2")

    if profile == "officer":
        # Remove casual backpack, jewelry and cargo pocket piping entirely.
        removed_materials = {i for i,m in enumerate(body.data.materials) if any(n in m.name for n in ["Backpack", "Brass", "Stitching"])}
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in removed_materials], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(body.data)
        bm.free()
        for mat in body.data.materials:
            if any(name in mat.name for name in ["Jacket", "Trousers", "Cotton"]):
                p = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
                if p:
                    for link in list(mat.node_tree.links):
                        if link.to_node == p:
                            mat.node_tree.links.remove(link)
                    p.inputs["Base Color"].default_value = (.012, .027, .057, 1)
                    p.inputs["Roughness"].default_value = .78
        # Closed waistcoat, shirt collar, shoulder boards, belt, pockets and
        # readable back lettering make the officer recognizable at city scale.
        loft("Fitted uniform vest", [(1.02,.143,.087,0,0),(1.07,.151,.092,0,0),(1.18,.166,.104,0,0),(1.265,.171,.097,0,0),(1.305,.118,.067,0,0)], uniform, "Spine2")
        loft("Duty belt", [(1.018,.147,.091,0,0),(1.045,.149,.093,0,0)], trim, "Hips")
        rounded("Belt buckle", (0,-.095,1.033), (.030,.009,.026), gold, "Hips")
        for side, name in [(1,"Left"),(-1,"Right")]:
            rounded("Shoulder board", (side*.154,-.002,1.315), (.069,.076,.014), trim, name+"Arm", .003)
            rounded("Vest pocket", (side*.087,-.100,1.188), (.066,.013,.083), trim)
            rounded("Pocket flap", (side*.087,-.109,1.219), (.068,.010,.018), uniform)
            rounded("Belt pouch", (side*.119,-.064,1.026), (.046,.037,.065), trim, "Hips")
            # Folded collar fabric, lying against the upper chest.
            mesh("Shirt collar", [(side*.009,-.075,1.316),(side*.053,-.058,1.313),(side*.071,-.088,1.271),(side*.028,-.105,1.272)], [(0,1,2,3)], pale_blue, "Spine2")
        mesh("Uniform tie", [(-.012,-.086,1.306),(.012,-.086,1.306),(.008,-.109,1.243),(0,-.111,1.232),(-.008,-.109,1.243)], [(0,1,2,3,4)], trim, "Spine2")
        # A properly shaped service cap: smooth tapered crown and curved peak.
        loft("Service cap band", [(1.556,.103,.110,0,.006),(1.579,.107,.114,0,.006)], trim)
        loft("Service cap crown", [(1.574,.109,.116,0,.006),(1.598,.117,.121,0,.010),(1.619,.108,.108,0,.014),(1.630,.075,.076,0,.014),(1.634,.003,.003,0,.014)], uniform)
        peak_vertices=[]
        for row in range(3):
            for col in range(21):
                t=-math.pi*.40+math.pi*.80*col/20
                radius=.109+.043*row/2
                peak_vertices.append((radius*math.sin(t),.004-radius*math.cos(t),1.565-.008*row/2-.004*math.cos(t)))
        peak_faces=[]
        for row in range(2):
            for col in range(20):
                k=row*21+col
                peak_faces.append((k,k+21,k+22,k+1))
        mesh("Curved service cap peak",peak_vertices,peak_faces,trim)
        # Shield outline uses actual geometry and a small center star.
        def badge(name, center, size, bone):
            x,y,z=center
            outline=[(-.65,1),(.65,1),(.82,.25),(.58,-.55),(0,-1),(-.58,-.55),(-.82,.25)]
            mesh(name,[(x+a*size,y,z+b*size) for a,b in outline], [tuple(range(7))],gold,bone)
            rounded(name+" inset",(x,y-.001,z+.001),(size*.40,.0015,size*.55),trim,bone,.001)
        badge("Cap service shield",(0,-.110,1.596),.014,"Head")
        badge("Chest service shield",(-.082,-.111,1.268),.020,"Spine2")
        for z in [1.258,1.205,1.153,1.101]:
            rounded("Vest fastener", (0,-.106,z), (.005,.003,.005), gold, bevel=.001)
        def lettering(label, position, size, back=False):
            bpy.ops.object.text_add(location=position)
            obj=bpy.context.object
            obj.name="Uniform "+label
            obj.data.body=label
            obj.data.align_x="CENTER"
            obj.data.align_y="CENTER"
            obj.data.size=size
            obj.data.extrude=.00035
            obj.rotation_euler=(math.pi/2 if not back else math.pi/2,0,0 if not back else math.pi)
            bpy.ops.object.convert(target="MESH")
            obj=bpy.context.object
            obj.data.materials.append(ivory)
            obj.vertex_groups.new(name="mixamorig:Spine2").add(range(len(obj.data.vertices)),1,"REPLACE")
            parts.append(obj)
        lettering("POLICE",(.078,-.113,1.267),.016)
        lettering("LEARNING",(0,.107,1.267),.021,True)
        lettering("POLICE",(0,.108,1.237),.032,True)

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
    body["authored_detail"] = "Connected textured anatomical face; sculpted contour variations, fitted detailed hair, tailored clothing and uniform; explorer body/rig provenance retained"
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    target = ROOT / f"public/assets/character-{profile}.glb"
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_image_format="JPEG",
        export_jpeg_quality=80, export_morph=False, export_extras=True)
    raw = target.read_bytes()
    json_length = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    # glTF's native base-color factor preserves the detailed diffuse atlas. A
    # directly linked Blender image can otherwise erase its socket's tint.
    for mat in doc.get("materials", []):
        if mat["name"].startswith("Ch03_Body"):
            mat["pbrMetallicRoughness"]["baseColorFactor"] = list(tint)
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary_chunk = raw[20 + json_length:]
    target.write_bytes(struct.pack("<III", 0x46546c67, 2, 20 + len(encoded) + len(binary_chunk)) + struct.pack("<II", len(encoded), 0x4e4f534a) + encoded + binary_chunk)
    raw = target.read_bytes()
    assert len(doc["skins"][0]["joints"]) == 25
    assert set(clips) == {a["name"] for a in doc["animations"]}
    assert len(raw) < 1_500_000
    print(json.dumps({"profile": profile, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "source_sha256": SOURCE_SHA}))
