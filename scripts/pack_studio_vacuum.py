"""Pack Blender vacuum frames. Requires Pillow; the cat assets are preserved."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
output = ROOT / 'public/assets/residents/vacuum'
output.mkdir(parents=True, exist_ok=True)
sheet = Image.new('RGBA', (2048, 128))
preview = Image.new('RGBA', (512, 128), (53, 76, 96, 255))
for column, direction in enumerate(['se', 'sw', 'nw', 'ne']):
    for index in range(4):
        frame = Image.open(ROOT / f'art/vacuum/frames/{direction}-{index}.png').convert('RGBA')
        sheet.paste(frame, ((column * 4 + index) * 128, 0))
        if index == 0:
            preview.alpha_composite(frame, (column * 128, 0))
sheet.save(output / 'studio-vacuum-spritesheet.png', optimize=True)
preview.save(ROOT / 'art/vacuum/preview.png')
