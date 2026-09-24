from pathlib import Path
from PIL import Image

source = Path('assets/images/map-car-marker@2x.png')
target_dir = Path('assets/liveActivity')
target_dir.mkdir(parents=True, exist_ok=True)
target = target_dir / 'hy3n_car.png'

with Image.open(source).convert('RGBA') as image:
    image.thumbnail((56, 56), Image.Resampling.LANCZOS)
    alpha = image.getchannel('A')
    rgb = Image.new('RGB', image.size, (0, 0, 0))
    rgb.paste(image, mask=alpha)
    paletted = rgb.quantize(colors=64, method=Image.Quantize.FASTOCTREE)
    paletted.save(target, optimize=True)

if target.stat().st_size > 4096:
    raise SystemExit(f'Live Activity asset is {target.stat().st_size} bytes; expected at most 4096 bytes')
print(f'Created {target} ({target.stat().st_size} bytes)')
