"""Export camera-aligned masks from the organic studio; never save scene changes.

blender -b art/isometric_studio_warm_organic.blend -P scripts/export_studio_masks.py
"""
import json
import shutil
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/studio'
OUT.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
width, height = scene.render.resolution_x, scene.render.resolution_y
scene.render.resolution_percentage = 100
shutil.copyfile(ROOT / 'art/isometric_studio_warm_organic.png', OUT / 'organic-room.png')


def project(point):
    p = world_to_camera_view(scene, scene.camera, Vector(point))
    return [round(p.x * width, 3), round((1 - p.y) * height, 3)]


def hull(points):
    points = sorted(set(tuple(p) for p in points))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

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
    ('certificate', ['Framed University of Auckland degree'], 'education', 'Education', (2.435, .23, 1.57), 0),
    ('surfboard', ['10 Surfboard'], 'surfboard', 'Surfing', (2.17, 1.40, 1.30), 2.7),
    ('printer', ['08 Toolbox', '09 A1 mini printer'], 'printer', 'Maker’s lab', (1.1, 1.22, 1.36), 6.0),
    ('desk', ['01 PC tower', '02 Standing desk', '03 Monitor and MacBook', '04 Split keyboard and mouse'], 'computer', 'Coding', (0, 1.00, 1.44), 12.9),
    ('chair', ['05 Aeron style chair'], None, None, (-.67, .34, .5), 14.7),
]
props = []
for key, collections, inspect_id, label, anchor, depth in groups:
    objects = {o for name in collections for o in bpy.data.collections[name].all_objects if o.type == 'MESH'}
    vertices = [project(o.matrix_world @ Vector(corner)) for o in objects for corner in o.bound_box]
    props.append({
        'id': key, 'src': '/assets/studio/organic-room.png',
        'maskSrc': f'/assets/studio/organic-{key}-mask.png',
        'depth': depth, 'inspectId': inspect_id, 'label': label,
        'anchor': project(anchor), 'polygon': hull(vertices),
    })

blocked = []
for y in range(13):
    for x in range(10):
        wx, wy = 2.5 - (y + .5) * .3, 1.55 - (x + .5) * .3
        desk = -1.40 < wx < .51 and .57 < wy < 1.53
        chair = ((wx + .67) / .40) ** 2 + ((wy - .34) / .39) ** 2 < 1
        cabinet = .69 < wx < 1.67 and .92 < wy < 1.60
        board = 1.78 < wx < 2.48 and 1.17 < wy < 1.65
        if desk or chair or cabinet or board:
            blocked.append(f'{x},{y}')

metadata = {
    'width': width, 'height': height, 'viewBox': f'0 0 {width} {height}',
    'background': '/assets/studio/organic-room.png', 'gridWidth': 10, 'gridDepth': 13,
    'floorCorners': [project(p) for p in [(2.5, 1.55, .02), (2.5, -1.45, .02), (-1.4, -1.45, .02), (-1.4, 1.55, .02)]],
    'blocked': blocked, 'props': props,
    'sourceNote': 'Render and visible-surface masks from art/isometric_studio_warm_organic.blend; floor grid projected through the same orthographic camera.',
}
(OUT / 'organic-scene.json').write_text(json.dumps(metadata, indent=2) + '\n')

# Flat white target geometry against black occluders yields luminance masks with
# true mesh openings, matching the source camera without relighting the render.
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'BW'
scene.render.dither_intensity = 0
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
shading = scene.display.shading
shading.light = 'FLAT'
shading.color_type = 'OBJECT'
shading.background_type = 'VIEWPORT'
shading.background_color = (0, 0, 0)
shading.show_shadows = False
shading.show_cavity = False
shading.show_specular_highlight = False
shading.show_object_outline = False
for o in scene.objects:
    if o.type == 'MESH':
        o.hide_render = o.hide_render or not o.visible_camera

for key, collections, *_ in groups:
    keep = {o for name in collections for o in bpy.data.collections[name].all_objects}
    for o in scene.objects:
        o.color = (1, 1, 1, 1) if o in keep else (0, 0, 0, 1)
    scene.render.filepath = str(OUT / f'organic-{key}-mask.png')
    bpy.ops.render.render(write_still=True)
    print(f'EXPORTED {key} mask', flush=True)
