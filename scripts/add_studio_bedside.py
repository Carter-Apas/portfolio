"""Add the Elliot bedside, fern and Nest Mini to a new studio variant.

Run in the organic room via Blender MCP or with:
blender -b art/isometric_studio_warm_organic.blend -P scripts/add_studio_bedside.py
The original room is preserved. Render the saved variant before exporting masks.
"""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
COLLECTION = '11 Elliot bedside with fern and Nest Mini'
if bpy.data.collections.get(COLLECTION):
    raise RuntimeError('The bedside collection already exists in this scene')
collection = bpy.data.collections.new(COLLECTION)
bpy.context.scene.collection.children.link(collection)


def material(name, color, roughness=.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def move(obj, name, mat):
    obj.name = name
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def box(name, location, dimensions, mat, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = move(bpy.context.object, name, mat)
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return obj


def cylinder(name, location, radius, depth, mat, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=location)
    obj = move(bpy.context.object, name, mat)
    if rotation:
        obj.rotation_euler = rotation
    mod = obj.modifiers.new('Rounded edge', 'BEVEL')
    mod.width = .0015
    mod.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def curve(name, points, radius, mat):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 2
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, coord in zip(spline.points, points):
        p.co = (*coord, 1)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    return obj


# Grain runs horizontally across drawer fronts and vertically down the sides.
def oak(name, stretch):
    mat = material(name, (.48, .29, .13), .48)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    tex = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = stretch
    links.new(tex.outputs['Generated'], mapping.inputs[0])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3
    noise.inputs['Detail'].default_value = 3
    noise.inputs['Roughness'].default_value = .65
    links.new(mapping.outputs[0], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .2
    ramp.color_ramp.elements[0].color = (.27, .145, .063, 1)
    ramp.color_ramp.elements[1].position = .8
    ramp.color_ramp.elements[1].color = (.62, .405, .205, 1)
    links.new(noise.outputs['Fac'], ramp.inputs[0])
    bsdf = nodes.get('Principled BSDF')
    links.new(ramp.outputs[0], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .13
    bump.inputs['Distance'].default_value = .0008
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return mat


front_oak = oak('Elliot wild oak horizontal drawer grain', (18, .7, 15))
side_oak = oak('Elliot wild oak vertical side grain', (16, 14, .7))
top_oak = oak('Elliot wild oak top grain', (14, .7, 16))
black = material('Elliot satin charcoal round knobs', (.025, .027, .025), .38)
shadow = material('Elliot recessed drawer shadow', (.055, .033, .018))

# Real product: W46 x D40 x H59 cm. Front faces into the room (-X).
cx, cy = 2.23, -1.16
box('Elliot dark interior', (cx, cy, .307), (.375, .423, .55), shadow)
for y in [cy - .221, cy + .221]:
    box('Elliot full height oak side', (cx, y, .29), (.4, .018, .58), side_oak)
box('Elliot overhanging oak top', (cx, cy, .58), (.412, .472, .02), top_oak)
box('Elliot inset oak plinth', (cx + .013, cy, .033), (.365, .424, .066), front_oak)
box('Elliot oak back', (cx + .19, cy, .3), (.015, .43, .55), side_oak)
for i in range(3):
    z = .074 + .164 * (i + .5)
    box(f'Elliot drawer {i + 1} oak face', (cx - .192, cy, z), (.018, .419, .16), front_oak)
    cylinder(f'Elliot drawer {i + 1} knob stem', (cx - .209, cy, z), .0045, .015, black, (0, math.pi / 2, 0))
    cylinder(f'Elliot drawer {i + 1} round black knob', (cx - .219, cy, z), .01, .008, black, (0, math.pi / 2, 0))

# A small matte ceramic planter, open rim and visible soil.
ceramic = material('Fern warm ivory ceramic', (.62, .58, .48), .78)
soil = material('Fern dark potting soil', (.037, .022, .012), .95)
px, py, base = 2.19, -1.035, .59
bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=.052, radius2=.073, depth=.116, location=(px, py, base + .058))
pot = move(bpy.context.object, 'Fern tapered ceramic planter', ceramic)
pot.modifiers.new('Ceramic softened edge', 'BEVEL').width = .003
pot.modifiers.new('Ceramic normals', 'WEIGHTED_NORMAL')
cylinder('Fern visible soil', (px, py, base + .116), .065, .004, soil)
bpy.ops.mesh.primitive_torus_add(major_radius=.069, minor_radius=.004, major_segments=48, minor_segments=12, location=(px, py, base + .117))
move(bpy.context.object, 'Fern ceramic rim', ceramic)

# Arching pinnate fronds: paired tapered leaflets with a raised midrib.
stem = material('Fern green rachis', (.085, .16, .026), .75)
greens = [material(f'Fern leaflet green {i}', color, .58) for i, color in enumerate([
    (.045, .16, .022), (.068, .23, .027), (.095, .285, .036), (.12, .25, .042)])]
random.seed(23)
verts, faces, colors = [], [], []
origin = Vector((px, py, base + .116))
for n in range(19):
    angle = n * 2.39996 + random.uniform(-.13, .13)
    direction = Vector((math.cos(angle), math.sin(angle), 0))
    tangent = Vector((-math.sin(angle), math.cos(angle), 0))
    inner = n >= 13
    spread = random.uniform(.075, .14) if inner else random.uniform(.17, .255)
    rise = random.uniform(.30, .40) if inner else random.uniform(.20, .29)
    def point(t):
        return origin + direction * (spread * t ** 1.3) + Vector((0, 0, rise * math.sin(t * 2.05)))
    curve(f'Fern arching frond {n + 1}', [point(k / 24) for k in range(25)], .0011, stem)
    for k in range(1, 15):
        t = .10 + k * .058
        length = (.043 if inner else .062) * math.sin(math.pi * t) ** .65
        for sign in [-1, 1]:
            root = point(t)
            axis = (tangent * sign + direction * .30 + Vector((0, 0, .08))).normalized()
            side = direction * (length * .145)
            tip = root + axis * length + Vector((0, 0, -.009 * t))
            middle = root.lerp(tip, .44)
            idx = len(verts)
            verts.extend([root, middle + side, tip, middle - side, middle + Vector((0, 0, .0025))])
            faces.extend([(idx, idx + 1, idx + 4), (idx + 1, idx + 2, idx + 4), (idx + 2, idx + 3, idx + 4), (idx + 3, idx, idx + 4)])
            colors.extend([random.randrange(len(greens))] * 4)
mesh = bpy.data.meshes.new('Fern pinnate leaflets geometry')
mesh.from_pydata(verts, [], faces)
mesh.update()
foliage = bpy.data.objects.new('Fern delicate paired leaflets', mesh)
collection.objects.link(foliage)
for mat in greens:
    mesh.materials.append(mat)
for face, color in zip(mesh.polygons, colors):
    face.material_index = color

# Nest Mini in Chalk: low fabric pebble, rubber base, four subtle status dots.
fabric = material('Nest Mini chalk woven fabric', (.53, .55, .53), .92)
nodes, links = fabric.node_tree.nodes, fabric.node_tree.links
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 230
noise.inputs['Detail'].default_value = 2
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .28
bump.inputs['Distance'].default_value = .0005
links.new(noise.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs[0], nodes.get('Principled BSDF').inputs['Normal'])
rubber = material('Nest Mini pale rubber base and power lead', (.48, .48, .45), .8)
nx, ny = 2.12, -1.295
cylinder('Nest Mini rubber underside', (nx, ny, .594), .047, .008, rubber)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=(nx, ny, .606))
speaker = move(bpy.context.object, 'Google Nest Mini chalk fabric pebble', fabric)
speaker.scale = (.049, .049, .020)
for face in speaker.data.polygons:
    face.use_smooth = True
led = material('Nest Mini softly lit status dots', (.78, .8, .74), .4)
bsdf = led.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Emission Color'].default_value = (.8, .85, .8, 1)
bsdf.inputs['Emission Strength'].default_value = .25
for i in range(4):
    y = ny + (i - 1.5) * .008
    z = .606 + .020 * math.sqrt(1 - ((y - ny) / .049) ** 2)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.0016, location=(nx, y, z))
    move(bpy.context.object, f'Nest Mini status light {i + 1}', led)
curve('Nest Mini discreet power lead', [(nx + .046, ny, .603), (2.22, ny, .596), (2.36, -1.25, .593), (2.435, -1.20, .58), (2.44, -1.18, .38), (2.44, -1.18, .045)], .002, rubber)

# Let the existing window sun illuminate the new furnishings too.
receivers = bpy.data.collections.get('Window sun receivers')
if receivers:
    for obj in collection.objects:
        if obj.name not in receivers.objects:
            receivers.objects.link(obj)

bpy.context.scene.render.filepath = str(ROOT / 'art/isometric_studio_warm_bedside.png')
bpy.ops.object.select_all(action='DESELECT')
pot.select_set(True)
bpy.context.view_layer.objects.active = pot
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art/isometric_studio_warm_bedside.blend'))
print('Saved bedside scene with', len(collection.objects), 'objects', flush=True)
