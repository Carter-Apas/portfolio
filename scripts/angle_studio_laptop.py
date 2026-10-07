"""Rest the closed laptop on an inclined arm tray in a new scene variant.

blender -b art/isometric_studio_warm_bedside.blend -P scripts/angle_studio_laptop.py
"""
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
tray = bpy.data.objects['Laptop holding tray']
if tray.get('resting_laptop'):
    raise RuntimeError('The laptop tray is already inclined')

# Local Z follows the long edge of the formerly upright tray. A -65-degree
# X rotation makes the supporting plane slope 25 degrees above the desktop.
old_center = tray.location.copy()
new_center = Vector((-1.12, 1.13, 1.07))
rotation = Matrix.Rotation(math.radians(-65), 4, 'X')
delta = rotation @ tray.rotation_euler.to_matrix().to_4x4().inverted()
transform = Matrix.Translation(new_center) @ delta @ Matrix.Translation(-old_center)
for name in ['Laptop holding tray', 'Closed MacBook lid',
             'MacBook emblem left', 'MacBook emblem right', 'MacBook emblem leaf',
             'Arm hinge.002']:
    obj = bpy.data.objects[name]
    obj.matrix_world = transform @ obj.matrix_world

# Position both retaining lips at the low front edge of the tray.
for name, x in [('Laptop tray lip', -.14), ('Laptop tray lip.001', .14)]:
    obj = bpy.data.objects[name]
    obj.matrix_world = Matrix.Translation(new_center) @ rotation @ Matrix.Translation(Vector((x, -.029, -.116)))

# Reconnect the final articulated segment to the mount below the tilted tray.
start = bpy.data.objects['Arm hinge.001'].location.copy()
end = bpy.data.objects['Arm hinge.002'].location.copy()
segment = end - start
arm = bpy.data.objects['Laptop articulated arm.002']
original_length = max(v.co.z for v in arm.data.vertices) - min(v.co.z for v in arm.data.vertices)
arm.location = (start + end) / 2
arm.rotation_euler = segment.to_track_quat('Z', 'Y').to_euler()
arm.scale.z = segment.length / original_length
tray['resting_laptop'] = True

bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
tray.select_set(True)
bpy.context.view_layer.objects.active = tray
bpy.context.scene.render.filepath = str(ROOT / 'art/isometric_studio_warm_laptop.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art/isometric_studio_warm_laptop.blend'))
print('Saved inclined laptop scene', flush=True)
