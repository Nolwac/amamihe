# Game Assets

## Explorer

`public/assets/explorer.glb` contains the live, skinned explorer: body and fingers, curved cornrows and coil bun, earrings, fitted light top, patterned jacket with cuffs and piping, tailored cargo trousers with flap pockets, light sneakers and laces, and a rounded daypack. `Idle` and `Walk` are in-place skeletal clips. Low graphics uses simpler materials. The player retains skeletal animation on every preset; background residents use static poses on Low and a mix of animated and static assets on Medium and High.

The revised explorer preserves 65 joints and eight material groups while reducing its geometry to 28,946 triangles. The GLB is approximately 1.3 MB. Source headset shells and painted side locks are removed; the hair and clothing additions use opaque surfaces instead of expensive transparency. A small rear-skull surface closes the opening previously hidden by the source hair shell, preventing facial polygons from showing through the back of the head. It uses the existing neck-skin UV island without repainting the diffuse atlas. The anatomy and face remain stylized.

The three `avatar-fabric-{terracotta,teal,gold}.png` files are local 256-pixel cloth palettes. Only the selected palette is needed in the live scene. Their limited thread colors keep download sizes small; the outfit thumbnails use those same images rather than unrelated illustrations.

The body, base skin texture, and original rig derive from the Michelle sample distributed in the [three.js examples](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Michelle.glb), originating from Adobe Mixamo. Mixamo permits royalty-free use of its characters and animations in games; see its [usage FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html). This is an embedded game asset, not an independently licensed character pack. Authored additions and animation changes are recorded in `scripts/assets/build-avatar.py`; third-party source content is not claimed as original work or covered by three.js's code license.

Source SHA-256: `7a87e15a99ccbc5e5877be66e1e4ecae0a581adcafa0cce1a5569f49909e968e`. The build script rejects mismatched input. The upstream URL is mutable; preserve the verified input when rebuilding.

## Low Animated Explorer

`explorer-low.glb` is a separate derivative of the complete explorer, retaining the same skin UVs, eight named material groups, authored clothing, closed rear skull, and `Idle`/`Walk` clips. It contains **14,473 triangles**, **25 joints**, and **720,764 bytes**. Embedded diffuse images are at most 512 pixels; unused normal and metallic/roughness maps are omitted.

`scripts/assets/build-explorer-low.py` reduces geometry in bind space and merges forty finger joints into their nearest hand ancestors. Fingers keep their modeled shape and follow the wrist as rigid geometry; the current clips do not articulate them independently. Torso, head, shoulders, elbows, wrists, hips, knees, feet, and toes remain animated. Fine hair, pocket, and surface details are reduced; this asset is a performance tier rather than a claim of equal visual detail.

The Low GLB records its source explorer's SHA-256. Tests validate both rigs' normalized weights and joint indices, actual walking motion, Low geometry/download budgets, and derivative freshness after a source change. Rebuild Low whenever the full explorer changes. It inherits the source provenance and usage terms above.

## Course Action Explorer

`explorer-adventure-low.glb` is the course-specific human rig. It preserves the Low explorer's **14,473 triangles**, **25 joints**, skin UVs and eight material groups while adding project-authored skeletal actions: `Idle`, `Walk`, `Run`, `Jump`, `Slide`, `Guard`, `Jab`, `Hit` and `Build`. The **873,508-byte** download is shared by the player and sparring opponent; their skeletons and deforming geometry are independent. The city explorer is unchanged.

`scripts/assets/build-adventure-avatar.py` imports the checked-in Low explorer without downloading another character or animation. It bakes 24 Hz joint transforms with articulated hips, knees, feet, shoulders and elbows. Running uses a wider stride, flexed elbows and heel recovery. Jumping tucks the knees; sliding lowers the pelvis; sparring includes a raised guard, a forward arm strike and recoil; building alternates a raised working arm with its downward stroke. These are stylized animations on the existing human anatomy. Fingers remain rigid to each wrist as in the Low rig.

The scene controls forward travel, lanes, airborne height and collision outcomes; the clips provide articulated body movement rather than translating a rigid mesh. Their sampling frequency is independent of the rendering frame rate. Every clip explicitly keys all retained joints so switching, pausing and seeking cannot accumulate procedural pose offsets. Asset checks verify joint coverage, real action motion, normalized skin weights, source freshness and download/geometry bounds. The derivative inherits the Michelle/Mixamo provenance and usage terms above; the authored action poses are recorded in the build script.

## Rebuilding

The compiled assets are stored in `public/assets/`; ordinary installation and development do not require Blender. For asset changes, use Blender 4.3:

```sh
blender -b -t 4 -P scripts/assets/build-avatar.py -- /path/to/Michelle.glb
blender -b -t 4 -P scripts/assets/build-explorer-low.py
blender -b -t 4 -P scripts/assets/build-adventure-avatar.py
blender -b -t 4 -P scripts/assets/render-avatar-previews.py
blender -b -t 4 -P scripts/assets/build-resident.py -- /path/to/Michelle.glb
blender -b -t 4 -P scripts/assets/build-explorer-resident.py
npm test
```

The explorer builders preserve vertex weights and emit both animation clips. Explorer asset tests check both rigs' skin linkage, normalized weights, valid joint indices, and motion data. Portrait and outfit thumbnails are offline renders of the actual explorer model, not generated concept illustrations.

## World and Interface

Buildings, entrance interiors, furniture, palms, plants, paving, signs, and the wardrobe room are procedural meshes and local textures in `src/World.tsx`. Icons are inline SVG. Fonts are bundled locally. The minimap plots the player against the district's house positions; the course button projects its 3D sign position into screen coordinates. Scene references in `docs/design/previews/` remain visual targets, not backgrounds in the running game.

The current assets are stylized and the world is still less detailed than the reference renders. Physical-device performance and finished visual fidelity remain unverified.

## Street Residents

Two static derivatives of the cleaned explorer anatomy provide character variety without evaluating NPC skeletons on low settings. Their natural standing poses are baked after skin deformation; both retain the closed rear skull, face and modeled fingers. They share the Michelle/Mixamo provenance and usage terms above.

| Asset                   |       File size | Triangles | Runtime skeleton     |
| ----------------------- | --------------: | --------: | -------------------- |
| `explorer.glb`          | 1,309,840 bytes |    28,946 | 65 joints; Idle/Walk |
| `explorer-low.glb`      |   720,764 bytes |    14,473 | 25 joints; Idle/Walk |
| `resident.glb`          |   376,152 bytes |    12,126 | None                 |
| `explorer-resident.glb` |   500,140 bytes |    15,850 | None                 |

`resident.glb` adds short hair, a casual teal shirt, canvas cargo trousers and light sneakers. Its five `Resident_*` materials include an embedded 512-pixel skin texture. `scripts/assets/build-resident.py` reads the cleaned explorer and verifies the original Michelle input checksum.

`explorer-resident.glb` keeps the braids, patterned jacket and cargo outfit while removing the daypack and straps. Its seven existing material names and skin UVs allow the live cloth palettes and low-cost skin shader to be shared with the player. `scripts/assets/build-explorer-resident.py` decimates the mesh and removes animation, skinning and non-diffuse texture inputs.

Low renders two residents from each static asset. Medium and High use two animated explorer residents and two static short-haired residents. The player remains animated throughout. Both static builders emit front and rear proof images from the exported GLBs (`resident-preview*.png` and `explorer-resident-preview*.png`); these are asset checks rather than concept illustrations.

## Baked Material Tiles

`scripts/assets/build-world-materials.py` generates original tiling plaster, limestone, wood, and leaf textures in `public/assets/world/`. The four WebP files total approximately 16 KB. They are applied to geometry; they do not replace the rendered world with an illustration. Rebuilding requires Python and Pillow; runtime installation uses the checked-in files.


## Course Adventure Geometry

`src/CourseScene.tsx` builds temple bridges, stone guardians, checkpoint rings,
race markers, and sparring rings as original procedural meshes. Temple stone uses
the existing local limestone tile. Human course rivals reuse the existing explorer
rig and Idle/Walk clips; no new third-party assets or services are introduced.
The avatar wardrobe adds Azure and Plum material palettes to the existing jacket.

## Adaptive texture derivatives

`public/assets/world/low/` contains 128-pixel WebP derivatives of the original project-authored world textures. Regenerate with Pillow by thumbnailing each source to 128×128 and saving at quality 65. These preserve source provenance and are selected from connection hints independently of rendering resolution.

Low background residents are generated by `blender -b -t 2 --python scripts/assets/build-npc-low.py`. The originals are project-authored static human residents, separate from the rigged playable explorer. A rest-space 22% decimation produces the two `*-resident-low.glb`/`resident-low.glb` derivatives; no external asset is introduced.
