from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/home/ubuntu/rider-build27-recovery/extracted/Payload/HY3N.app/assets/assets/images/icon.png')
ASSETS = ROOT / 'assets/images'

# Preserve the original HY3N and AKWAABA pixels from the recovered app, but
# remove the nearly-black circular field behind them. This is a color-key
# operation only: no text or logo artwork is generated or redrawn.
source = Image.open(SOURCE).convert('RGBA')
artwork = source.copy()
pixels = artwork.load()

for y in range(artwork.height):
    for x in range(artwork.width):
        r, g, b, a = pixels[x, y]
        # The unwanted circle and the surrounding square are near-black;
        # retain the metallic, Ghana-flag, and gold AKWAABA artwork.
        if max(r, g, b) < 36:
            pixels[x, y] = (r, g, b, 0)

bbox = artwork.getbbox()
if not bbox:
    raise RuntimeError('Could not detect the HY3N / AKWAABA artwork.')

# Keep the full composition centered with safe margins. Its transparent
# background lets Expo's configured #000000 splash backdrop show seamlessly.
canvas_size = 1248
scale = min((canvas_size * 0.70) / artwork.width, (canvas_size * 0.70) / artwork.height)
resized = artwork.resize((round(artwork.width * scale), round(artwork.height * scale)), Image.Resampling.LANCZOS)
transparent_splash = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
transparent_splash.alpha_composite(
    resized,
    ((canvas_size - resized.width) // 2, (canvas_size - resized.height) // 2),
)
transparent_splash.save(ASSETS / 'rider-splash-logo.png')
transparent_splash.save(ASSETS / 'splash-icon.png')

# A full-black preview makes the edge test deterministic and mirrors iOS.
preview = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 255))
preview.alpha_composite(transparent_splash)
preview.save(ASSETS / 'rider-splash-preview.png')

print('Created seamless Rider splash assets from the recovered HY3N AKWAABA artwork.')
print('Artwork bounds:', bbox)
