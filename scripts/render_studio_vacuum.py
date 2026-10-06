"""Create a standalone vacuum scene with four directions and spinning brush frames.
Run: blender -b --factory-startup -P scripts/render_studio_vacuum.py
The room scene is never opened or saved by this exporter.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art/vacuum/frames'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
s = bpy.context.scene
s.name = 'Studio vacuum sprite stage'
s.render.engine = 'CYCLES'
s.cycles.samples = 24
s.cycles.use_denoising = True
s.render.resolution_x = s.render.resolution_y = 128
s.render.resolution_percentage = 100
s.render.film_transparent = True
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGBA'
s.render.fps = 16
s.frame_end = 4
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
root = bpy.data.objects.new('Vacuum direction control', None)
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


shell = material('Warm ivory matte casing', (.68,.65,.56), True)
rubber = material('Charcoal rubber bumper', (.035,.042,.043))
metal = material('Brushed graphite lidar', (.075,.087,.086))
glass = material('Front infrared sensor', (.009,.023,.028))
led = material('Sage green power indicator', (.18,.57,.28))
p = next(n for n in led.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
p.inputs['Emission Color'].default_value=(.18,.57,.28,1)
p.inputs['Emission Strength'].default_value=1.5

def cylinder(name, radius, depth, z, mat, loc=(0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth)
    o=bpy.context.object;o.name=name;o.parent=root;o.location=(*loc,z)
    o.data.materials.append(mat)
    bevel=o.modifiers.new('Soft manufactured edges','BEVEL');bevel.width=.016;bevel.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    for p in o.data.polygons:p.use_smooth=True
    return o
cylinder('Lower rubber bumper',.255,.075,.065,rubber)
cylinder('Ivory circular casing',.247,.065,.118,shell)
cylinder('Inset graphite lid',.213,.009,.154,metal)
cylinder('Ivory lid panel',.201,.009,.160,shell)
cylinder('Lidar turret base',.068,.022,.177,metal,loc=(0,.05))
cylinder('Lidar cap',.062,.026,.196,shell,loc=(0,.05))
cylinder('Power button',.023,.004,.168,metal,loc=(0,-.088))
cylinder('Power status light',.008,.003,.172,led,loc=(0,-.088))
sphere('Dark front sensor strip',(0,-.25,.090),(.096,.014,.027),glass)
for x in [-.065,.065]:
    sphere('Sensor reflection',(x,-.263,.093),(.009,.003,.008),metal)
# Low-profile wheels are partially enclosed by the bumper.
for x in [-.19,.19]:sphere('Rubber wheel',(x,0,.035),(.042,.068,.031),rubber)
brush=bpy.data.objects.new('Spinning side brush',None);s.collection.objects.link(brush)
brush.parent=root;brush.location=(.19,-.16,.018)
cylinder('Side brush hub',.026,.012,.018,rubber,loc=(.19,-.16))
for a in [0,2*math.pi/3,4*math.pi/3]:
    for spread in [-.075,0,.075]:
        curve=bpy.data.curves.new('Flexible sweeping bristle','CURVE');curve.dimensions='3D'
        curve.bevel_depth=.003;curve.bevel_resolution=2
        line=curve.splines.new('POLY');line.points.add(2)
        for point, radius, angle in zip(line.points,[.018,.065,.108],[a,a+.15+spread,a+.27+spread]):
            point.co=(radius*math.cos(angle),radius*math.sin(angle),0,1)
        o=bpy.data.objects.new('Side brush bristle',curve);s.collection.objects.link(o);o.parent=brush;o.data.materials.append(rubber)
for f in range(1,5):
    brush.rotation_euler.z=(f-1)*math.pi/6
    brush.keyframe_insert(data_path='rotation_euler',frame=f)
# Exact elevation and orientation of the room's orthographic camera.
bpy.ops.object.camera_add()
cam=bpy.context.object;cam.name='Room matched isometric sprite camera'
cam.rotation_euler=(.9553165435791016,0,-.7853983044624329)
cam.location=Vector((0,0,.16))+cam.rotation_euler.to_matrix()@Vector((0,0,5))
cam.data.type='ORTHO';cam.data.ortho_scale=.95;s.camera=cam

def area(name,loc,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,.45))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm window softbox',(-3,1.5,4),220,(1,.78,.51),3)
area('Cool soft room bounce',(1,-3,2),65,(.69,.79,1),3)

bpy.context.view_layer.update()
p=world_to_camera_view(s,cam,Vector((0,0,0)))
metadata={'frameSize':128,'framesPerDirection':4,'directions':['se','sw','nw','ne'],
          'anchor':[round(p.x*128,3),round((1-p.y)*128,3)],'source':'art/studio_vacuum.blend'}
(ROOT/'art/vacuum/sprite-layout.json').write_text(json.dumps(metadata,indent=2)+'\n')
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/studio_vacuum.blend'))
for direction,angle in [('se',0),('sw',-math.pi/2),('nw',math.pi),('ne',math.pi/2)]:
    root.rotation_euler.z=angle
    for frame in range(1,5):
        s.frame_set(frame)
        s.render.filepath=str(OUT/f'{direction}-{frame-1}.png')
        bpy.ops.render.render(write_still=True)
root.rotation_euler.z=0;s.frame_set(1)
s.render.filepath=str(ROOT/'art/vacuum/preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/studio_vacuum.blend'))
print('VACUUM SPRITES COMPLETE')
