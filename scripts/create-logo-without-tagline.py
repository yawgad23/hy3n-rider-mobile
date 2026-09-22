from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source_path = Path('/home/ubuntu/upload/hy3n-logo-fixed.png')
output_path = root / 'assets/images/hy3n-logo-no-tagline.png'

source = Image.open(source_path).convert('RGBA')
# Keep the black square and HY3N mark, remove the lower "Ride With Pride" tagline.
# The supplied 1254px artwork places the tagline below y=730.
without_tagline = source.crop((0, 0, source.width, 730))
canvas = Image.new('RGBA', (source.width, source.width), (0, 0, 0, 255))
without_tagline.thumbnail((source.width, 730), Image.Resampling.LANCZOS)
canvas.alpha_composite(without_tagline, (0, 0))
canvas.save(output_path)
print(output_path)
print('size:', canvas.size)
print('tagline crop boundary:', 730)
