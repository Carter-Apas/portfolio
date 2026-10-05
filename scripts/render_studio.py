"""Run with blender -b /path/to/isometric_studio.blend -P scripts/render_studio.py.

Export aligned room/furniture layers and camera-derived navigation metadata.
The editable Blender source is kept outside the website's public directory.
"""
import bpy
import json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/studio'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 1600
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.film_transparent = True
ground = bpy.data.objects.get('Studio ground')
if ground:
    ground.hide_render = True

def project(point):
    p = world_to_camera_view(scene, scene.camera, Vector(point))
    return [round(p.x * 1600, 3), round((1 - p.y) * 1600, 3)]

def hull(points):
    points = sorted(set(tuple(p) for p in points))
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]

groups = [
    ('surfboard', ['10 Surfboard'], 'surfboard', 'Surfing', (2.17,1.40,1.30), 2.7),
    ('printer', ['08 Toolbox','09 A1 mini printer'], 'printer', '3D printing', (1.1,1.22,1.36), 6.0),
    ('desk', ['01 PC tower','02 Standing desk','03 Monitor and MacBook','04 Split keyboard and mouse'], 'computer', 'Coding', (.0,1.00,1.44), 12.9),
    ('chair', ['05 Aeron style chair'], None, None, (0,0,0), 14.7),
]
props = []
furniture = set()
for key, collections, inspect_id, label, anchor, depth in groups:
    objects = {o for c in collections for o in bpy.data.collections[c].objects}
    furniture |= objects
    vertices = [project(o.matrix_world @ Vector(corner)) for o in objects for corner in o.bound_box]
    props.append({'id':key, 'src':f'/assets/studio/{key}.png', 'depth':depth,
                  'inspectId':inspect_id, 'label':label, 'anchor':project(anchor),
                  'polygon':hull(vertices)})

origin = project((2.50,1.55,.018))
a = project((2.50,1.25,.018))
b = project((2.20,1.55,.018))
blocked = []
for y in range(13):
    for x in range(10):
        wx, wy = 2.5-(y+.5)*.3, 1.55-(x+.5)*.3
        desk = -1.40 < wx < .51 and .57 < wy < 1.53
        chair = ((wx+.67)/.40)**2 + ((wy-.34)/.39)**2 < 1
        cabinet = .69 < wx < 1.67 and .92 < wy < 1.60
        board = 1.78 < wx < 2.48 and 1.17 < wy < 1.65
        if desk or chair or cabinet or board:
            blocked.append(f'{x},{y}')
metadata = {'width':1600, 'height':1600, 'gridWidth':10, 'gridDepth':13,
            'origin':origin, 'stepX':[a[0]-origin[0],a[1]-origin[1]],
            'stepY':[b[0]-origin[0],b[1]-origin[1]],
            'blocked':blocked, 'props':props}
(OUT/'scene.json').write_text(json.dumps(metadata, indent=2)+'\n')

def render(path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f'EXPORTED {path}', flush=True)

render(OUT/'room.png')
# Keep cast shadows on the architecture while hiding furniture from camera rays.
for o in furniture:
    o.visible_camera = False
render(OUT/'background.png')
for o in furniture:
    o.visible_camera = True
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for key, collections, _, _, _, _ in groups:
    keep = {o for c in collections for o in bpy.data.collections[c].objects}
    for o in meshes:
        o.hide_render = o not in keep
    render(OUT/f'{key}.png')
# This background process never saves visibility changes to the Blender source.
