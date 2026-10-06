"""Pack transparent Blender frames. Run after render_studio_cat.py (requires Pillow)."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
SIZE = 128
sheet = Image.new('RGBA', (SIZE * 32, SIZE * 2))
for row, state in enumerate(['idle', 'walk']):
    for direction_index, direction in enumerate(['se', 'sw', 'nw', 'ne']):
        for frame in range(8):
            image = Image.open(ROOT / f'art/cat/frames/{state}-{direction}-{frame}.png').convert('RGBA')
            sheet.paste(image, ((direction_index * 8 + frame) * SIZE, row * SIZE))
sheet.save(ROOT / 'public/assets/animals/cat/studio-cat-spritesheet.png', optimize=True)
preview = Image.new('RGBA', (512, 256), (53, 76, 96, 255))
for row, state in enumerate(['idle', 'walk']):
    for column, direction in enumerate(['se', 'sw', 'nw', 'ne']):
        frame = Image.open(ROOT / f'art/cat/frames/{state}-{direction}-0.png').convert('RGBA')
        preview.alpha_composite(frame, (column * SIZE, row * SIZE))
preview.save(ROOT / 'art/cat/preview.png')
