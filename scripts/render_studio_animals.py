"""Create matching fox, bunny, frog or kiwi sprites in separate Blender scenes.
Run: blender -b --factory-startup -P scripts/render_studio_animals.py -- fox
The room scene is never opened or saved by this exporter.
"""
import sys
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
KIND = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'fox'
assert KIND in ('fox', 'bunny', 'frog', 'kiwi')
OUT = ROOT / f'art/{KIND}/frames'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
s = bpy.context.scene
s.name = f'Studio {KIND} sprite stage'
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

fur = material('Muted fox russet', (.48,.225,.085), True)
cream = material('Warm ivory', (.78,.71,.58), True)
pink = material('Dusty rose', (.46,.24,.23))
eye = material('Espresso eyes and nose', (.022,.031,.023))
olive = material('Moss green frog skin', (.22,.34,.105), True)
belly = material('Warm pale frog belly', (.53,.57,.28), True)
root = bpy.data.objects.new('Animal direction control', None)
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

legs=[]
animated=[]
def pivot(name,loc):
    o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.parent=root;o.location=loc
    return o

def four_legs(mat, paws, front=-.23, back=.26):
    for x in [-.145,.145]:
        for y in [front,back]:
            p=pivot('Leg animation pivot',(x,y,.35))
            sphere('Rounded leg',(0,0,-.14),(.061,.068,.17),mat,p)
            sphere('Soft paw',(0,-.019,-.29),(.071,.093,.056),paws,p)
            legs.append((p,x,y))

def sculpt(parts):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
    o=bpy.context.object;o.name=f'{KIND.title()} blended sculpt'
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=o.modifiers.new('Blend sculpted forms','REMESH');m.mode='VOXEL';m.voxel_size=.018
    bpy.ops.object.modifier_apply(modifier=m.name)
    m=o.modifiers.new('Soft sculpt smoothing','SMOOTH');m.factor=1.1;m.iterations=5
    m=o.modifiers.new('Smooth finish','SUBSURF');m.levels=1
    for poly in o.data.polygons:poly.use_smooth=True

def face(y,z,spacing, muzzle_mat, snout=False):
    for x in [-spacing,spacing]:
        sphere('Gentle dark eye',(x,y,z),(.032,.018,.038),eye)
        sphere('Eye highlight',(x-.008,y-.016,z+.011),(.008,.004,.009),cream)
    for x in [-.053,.053]:
        sphere('Ivory cheek',(x,y-.025,z-.104),(.087,.070 if snout else .041,.05),muzzle_mat)
    sphere('Small nose',(0,y-(.10 if snout else .06),z-.095),(.025,.017,.018),eye if snout else pink)

if KIND=='fox':
    sculpt([sphere('Long fox torso',(0,.06,.39),(.195,.36,.205),fur),
            sphere('Upright fox chest',(0,-.23,.46),(.185,.20,.235),fur),
            sphere('Fox head',(0,-.35,.68),(.203,.20,.20),fur)])
    for x in [-.145,.145]:
        ear('Pointed fox ear',x,fur)
        ear('Velvet ear inset',x,pink,True)
    sphere('Ivory chest bib',(0,-.34,.41),(.127,.075,.18),cream)
    # A tapered muzzle gives the fox a distinct profile.
    sphere('Tapered ivory snout',(0,-.547,.585),(.106,.143,.074),cream)
    sphere('Black nose',(0,-.671,.605),(.032,.023,.024),eye)
    face(-.526,.727,.102,cream,True)
    four_legs(fur,eye)
    tail=pivot('Bushy tail sway',(0,.31,.42))
    sphere('Bushy fox tail',(.045,.26,-.025),(.135,.31,.13),fur,tail)
    sphere('Ivory tail tip',(.044,.493,-.01),(.105,.13,.104),cream,tail)
    animated.append((tail,'tail'))
elif KIND=='bunny':
    sculpt([sphere('Rounded rabbit body',(0,.10,.35),(.255,.32,.255),cream),
            sphere('Rabbit chest',(0,-.14,.41),(.20,.20,.23),cream),
            sphere('Rabbit head',(0,-.30,.61),(.212,.192,.19),cream)])
    for x in [-.105,.105]:
        p=pivot('Rabbit ear sway',(x,-.30,.72))
        sphere('Long rabbit ear',(0,.009,.205),(.059,.042,.235),cream,p)
        sphere('Rose ear lining',(0,-.03,.214),(.032,.014,.177),pink,p)
        animated.append((p,'ear'))
    face(-.477,.638,.089,cream)
    sphere('Cotton tail',(0,.398,.39),(.113,.108,.108),cream)
    for x in [-.155,.155]:sphere('Rounded rabbit haunch',(x,.20,.245),(.088,.12,.12),cream)
    four_legs(cream,cream,front=-.20,back=.21)
elif KIND=='frog':
    sculpt([sphere('Squat frog body',(0,.065,.29),(.28,.28,.215),olive),
            sphere('Broad frog head',(0,-.17,.43),(.29,.235,.185),olive)])
    sphere('Pale throat',(0,-.352,.353),(.224,.056,.095),belly)
    for x in [-.173,.173]:
        sphere('Raised eye mound',(x,-.19,.584),(.10,.11,.10),olive)
        sphere('Golden eye',(x,-.274,.60),(.062,.025,.060),belly)
        sphere('Dark eye pupil',(x,-.297,.60),(.031,.012,.043),eye)
        sphere('Eye glint',(x-.008,-.308,.619),(.010,.004,.01),cream)
    # A gently curved smile, rather than a flat painted face.
    curve=bpy.data.curves.new('Frog smile','CURVE');curve.dimensions='3D';curve.bevel_depth=.006;curve.bevel_resolution=2
    sp=curve.splines.new('BEZIER');sp.bezier_points.add(2)
    for point,co in zip(sp.bezier_points,[(-.145,-.366,.40),(0,-.405,.382),(.145,-.366,.40)]):
        point.co=co;point.handle_left_type=point.handle_right_type='AUTO'
    o=bpy.data.objects.new('Quiet frog smile',curve);s.collection.objects.link(o);o.parent=root;o.data.materials.append(eye)
    for x in [-.245,.245]:
        sphere('Folded frog haunch',(x,.15,.19),(.16,.205,.14),olive)
    for x in [-.235,.235]:
        for y in [-.20,.24]:
            p=pivot('Frog foot animation',(x,y,.20))
            sphere('Frog forearm',(0,-.025,-.081),(.056,.069,.114),olive,p)
            sphere('Webbed frog foot',(0,-.04,-.163),(.105,.115,.035),olive,p)
            for toe in [-.055,0,.055]:sphere('Rounded toe',(toe,-.13,-.169),(.027,.061,.022),olive,p)
            legs.append((p,x,y))
    # Sparse, subtle skin spots remain readable without looking noisy.
    for x,y,z in [(-.12,.07,.488),(.09,.10,.49),(.16,.19,.45),(-.06,.24,.44)]:
        sphere('Moss skin spot',(x,y,z),(.026,.035,.006),olive)

else:
    plumage=material('Warm brown kiwi plumage',(.245,.16,.085),True)
    beak=material('Soft horn beak and feet',(.40,.30,.18))
    sculpt([sphere('Pear shaped kiwi body',(0,.055,.37),(.25,.285,.28),plumage),
            sphere('Small kiwi head',(0,-.20,.56),(.142,.155,.145),plumage)])
    for x in [-.113,.113]:
        sphere('Kiwi dark eye',(x,-.279,.595),(.026,.016,.028),eye)
        sphere('Kiwi eye glint',(x-.006,-.291,.603),(.006,.004,.007),cream)
    curve=bpy.data.curves.new('Long tapered kiwi beak','CURVE');curve.dimensions='3D'
    curve.bevel_depth=.031;curve.bevel_resolution=4;curve.resolution_u=24
    sp=curve.splines.new('BEZIER');sp.bezier_points.add(2)
    for point,co,radius in zip(sp.bezier_points,[(0,-.331,.54),(0,-.51,.452),(0,-.70,.37)],[1,.65,.12]):
        point.co=co;point.radius=radius;point.handle_left_type=point.handle_right_type='AUTO'
    o=bpy.data.objects.new('Kiwi probing beak',curve);s.collection.objects.link(o);o.parent=root;o.data.materials.append(beak)
    for x in [-.105,.105]:
        p=pivot('Kiwi stepping leg',(x,0,.24))
        sphere('Kiwi lower leg',(0,0,-.12),(.025,.030,.108),beak,p)
        sphere('Kiwi foot',(0,-.025,-.205),(.052,.075,.025),beak,p)
        for toe in [-.04,0,.04]:
            sphere('Kiwi rounded toe',(toe,-.090,-.217),(.014,.059,.014),beak,p)
        legs.append((p,x,.01))

for f in range(1,17):
    walking=f>8
    phase=2*math.pi*((f-1)%8)/8
    hop = .018*(1-math.cos(phase*2)) if walking and KIND in ('bunny','frog') else 0
    root.location.z=hop+(.007*math.sin(phase*2) if walking and KIND in ('fox','kiwi') else 0)
    root.keyframe_insert(data_path='location',frame=f)
    for p,x,y in legs:
        offset=0 if ((x>0)==(y>0)) else math.pi
        angle=phase+offset
        p.rotation_euler.x=(.30 if KIND!='frog' else .23)*math.sin(angle) if walking else 0
        p.keyframe_insert(data_path='rotation_euler',frame=f)
    for p,kind in animated:
        p.rotation_euler.y=(.09 if kind=='tail' else .045)*math.sin(phase)
        p.keyframe_insert(data_path='rotation_euler',frame=f)
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
          'source':f'art/studio_{KIND}.blend'}
(ROOT/f'art/{KIND}/sprite-layout.json').write_text(json.dumps(metadata,indent=2)+'\n')
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'art/studio_{KIND}.blend'))
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
s.render.filepath=str(ROOT/f'art/{KIND}/preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'art/studio_{KIND}.blend'))
print(KIND.upper()+' SPRITE RENDERS COMPLETE')
