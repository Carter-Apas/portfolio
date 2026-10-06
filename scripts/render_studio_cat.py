"""Create a standalone cat scene and render 4 directions × 8 frames × 2 states.
Run: blender -b --factory-startup -P scripts/render_studio_cat.py
The room scene is never opened or saved by this exporter.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art/cat/frames'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
s = bpy.context.scene
s.name = 'Studio cat sprite stage'
s.render.engine = 'CYCLES'
s.cycles.samples = 24
s.cycles.use_denoising = True
s.render.resolution_x = s.render.resolution_y = 128
s.render.resolution_percentage = 100
s.render.film_transparent = True
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.render.fps = 16
s.frame_end = 16
s.world.color = (.22, .22, .22)
s.view_settings.view_transform = 'AgX'

def material(name, color, texture=False):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .82
    if texture:
        noise = m.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 65
        ramp = m.node_tree.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*(v*.8 for v in color), 1)
        ramp.color_ramp.elements[1].color = (*(v*1.12 for v in color), 1)
        bump = m.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .007
        m.node_tree.links.new(noise.outputs['Fac'], ramp.inputs[0])
        m.node_tree.links.new(ramp.outputs[0], p.inputs['Base Color'])
        m.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs[0], p.inputs['Normal'])
    return m
fur = material('Muted ginger painted fur', (.49,.265,.115), True)
cream = material('Warm ivory muzzle and socks', (.79,.70,.53), True)
pink = material('Dusty rose ears and nose', (.43,.205,.18))
eye = material('Deep olive eyes', (.043,.064,.039))
stripe = material('Soft cinnamon markings', (.29,.135,.056))

root = bpy.data.objects.new('Cat direction control', None)
s.collection.objects.link(root)
def sphere(name, loc, scale, mat, parent=root):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=(0,0,0))
    o = bpy.context.object
    o.name = name
    o.parent = parent
    o.location = loc
    o.scale = scale
    o.data.materials.append(mat)
    for poly in o.data.polygons: poly.use_smooth = True
    return o

# Join and voxel blend the torso, chest and head into a continuous sculpt.
parts = [sphere('Torso', (0,.055,.43), (.23,.38,.245), fur),
         sphere('Chest', (0,-.22,.47), (.225,.23,.25), fur),
         sphere('Head', (0,-.36,.70), (.245,.215,.22), fur)]
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
body = bpy.context.object
body.name = 'Sculpted cat body and head'
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
remesh = body.modifiers.new('Blend sculpt masses', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = .018
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth = body.modifiers.new('Smooth sculpt', 'SMOOTH')
smooth.factor = 1.2
smooth.iterations = 5
sub = body.modifiers.new('Soft surface', 'SUBSURF')
sub.levels = 1
for poly in body.data.polygons: poly.use_smooth = True

# Rounded triangular ears, with inset pink inner surfaces.
def ear(name, x, mat, inner=False):
    y = -.38 if not inner else -.447
    verts = [(x-.105,y-.05,.81),(x+.105,y-.05,.81),(x+(.035 if x>0 else -.035),y,.995),
             (x-.08,y+.095,.81),(x+.08,y+.095,.81)]
    if inner:
        verts = [(x-.061,y,.837),(x+.061,y,.837),(x+(.028 if x>0 else -.028),y+.025,.956)]
    faces = [(0,1,2)] if inner else [(0,1,2),(1,4,2),(4,3,2),(3,0,2),(0,3,4,1)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o);o.parent=root
    o.data.materials.append(mat)
    bevel=o.modifiers.new('Rounded ear edges','BEVEL');bevel.width=.018 if not inner else .008;bevel.segments=3
    for p in mesh.polygons:p.use_smooth=True
for x in [-.17,.17]:
    ear('Ginger ear',x,fur)
    ear('Velvet inner ear',x,pink,True)
for x in [-.082,.082]:
    sphere('Cream muzzle', (x,-.555,.63),(.105,.064,.067),cream)
    sphere('Olive eye', (x*1.5,-.548,.745),(.037,.022,.041),eye)
    sphere('Eye glint', (x*1.5-.009,-.569,.76),(.009,.006,.009),cream)
sphere('Rose nose',(0,-.614,.665),(.028,.018,.020),pink)
sphere('Chin',(0,-.544,.585),(.086,.05,.034),cream)
# Discreet brow and forehead stripes.
for x in [-.065,0,.065]:
    sphere('Forehead cinnamon stripe',(x,-.526,.823),(.016,.014,.053),stripe)

legs=[]
for x in [-.145,.145]:
    for y in [-.225,.28]:
        pivot=bpy.data.objects.new('Leg swing pivot',None);s.collection.objects.link(pivot)
        pivot.parent=root;pivot.location=(x,y,.39)
        sphere('Rounded leg',(0,0,-.15),(.066,.072,.19),fur,pivot)
        sphere('Ivory paw',(0,-.018,-.335),(.079,.102,.055),cream,pivot)
        legs.append((pivot,x,y))

def tail_curve(points):
    curve=bpy.data.curves.new('Curved tail geometry','CURVE');curve.dimensions='3D'
    curve.bevel_depth=.046;curve.bevel_resolution=4;curve.resolution_u=16
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points):
        p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new('Upright curling tail',curve);s.collection.objects.link(o)
    o.parent=root;o.data.materials.append(fur)
    return o
tail=tail_curve([(0,.36,.5),(.025,.51,.64),(.06,.57,.88),(.055,.51,1.04),(.035,.42,1.055)])

# Eight idle poses, then eight walk poses. Same ground origin in every frame.
for f in range(1,17):
    walking=f>8
    phase=2*math.pi*((f-1)%8)/8
    root.location.z=.009*math.sin(phase*2) if walking else .003*math.sin(phase)
    root.keyframe_insert(data_path='location',frame=f)
    tail.rotation_euler.y=.09*math.sin(phase)
    tail.rotation_euler.x=.035*math.cos(phase)
    tail.keyframe_insert(data_path='rotation_euler',frame=f)
    for pivot,x,y in legs:
        offset=0 if ((x>0)==(y>0)) else math.pi
        p=phase+offset
        pivot.rotation_euler.x=.30*math.sin(p) if walking else 0
        pivot.location.z=.39+(.018*max(0,math.cos(p)) if walking else 0)
        pivot.keyframe_insert(data_path='rotation_euler',frame=f)
        pivot.keyframe_insert(data_path='location',frame=f)

# Exact elevation and orientation of the room's orthographic camera.
bpy.ops.object.camera_add()
cam=bpy.context.object;cam.name='Room matched isometric sprite camera'
cam.rotation_euler=(.9553165435791016,0,-.7853983044624329)
cam.location=Vector((0,0,.48))+cam.rotation_euler.to_matrix()@Vector((0,0,5))
cam.data.type='ORTHO';cam.data.ortho_scale=1.65;s.camera=cam

def area(name,loc,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,.45))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm window softbox',(-3,1.5,4),220,(1,.78,.51),3)
area('Cool soft room bounce',(1,-3,2),65,(.69,.79,1),3)
bpy.context.view_layer.update()
p=world_to_camera_view(s,cam,Vector((0,0,0)))
metadata={'frameSize':128,'framesPerDirection':8,'directions':['se','sw','nw','ne'],
          'states':['idle','walk'],'anchor':[round(p.x*128,3),round((1-p.y)*128,3)],
          'source':'art/studio_cat.blend'}
(ROOT/'art/cat/sprite-layout.json').write_text(json.dumps(metadata,indent=2)+'\n')
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/studio_cat.blend'))
# Forward is local -Y. Grid +x is world -Y; grid +y is world -X.
for direction,angle in [('se',0),('sw',-math.pi/2),('nw',math.pi),('ne',math.pi/2)]:
    root.rotation_euler.z=angle
    for frame in range(1,17):
        s.frame_set(frame)
        state='idle' if frame<=8 else 'walk'
        index=(frame-1)%8
        s.render.filepath=str(OUT/f'{state}-{direction}-{index}.png')
        bpy.ops.render.render(write_still=True)
root.rotation_euler.z=0;s.frame_set(1)
s.render.filepath=str(ROOT/'art/cat/preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/studio_cat.blend'))
print('CAT SPRITE RENDERS COMPLETE')
