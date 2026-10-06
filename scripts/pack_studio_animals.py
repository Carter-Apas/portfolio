"""Pack Blender fox/bunny/frog frames and identity thumbnails (requires Pillow)."""
from pathlib import Path
from shutil import copyfile
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
for kind in ['fox', 'bunny', 'frog', 'kiwi']:
    output = ROOT / f'public/assets/animals/{kind}'
    output.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGBA', (4096, 256))
    preview = Image.new('RGBA', (512, 256), (53, 76, 96, 255))
    for row, state in enumerate(['idle', 'walk']):
        for column, direction in enumerate(['se', 'sw', 'nw', 'ne']):
            for index in range(8):
                frame = Image.open(ROOT / f'art/{kind}/frames/{state}-{direction}-{index}.png').convert('RGBA')
                sheet.paste(frame, ((column * 8 + index) * 128, row * 128))
                if index == 0:
                    preview.alpha_composite(frame, (column * 128, row * 128))
    sheet.save(output / f'studio-{kind}-spritesheet.png', optimize=True)
    preview.save(ROOT / f'art/{kind}/preview.png')
for kind in ['fox', 'cat', 'bunny', 'frog', 'kiwi']:
    copyfile(ROOT / f'art/{kind}/frames/idle-se-0.png', ROOT / f'public/assets/animals/{kind}/studio-{kind}-preview.png')
