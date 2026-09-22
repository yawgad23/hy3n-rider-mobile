from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/home/ubuntu/rider-build27-recovery/extracted/Payload/HY3N.app/assets/assets/images/icon.png')
ASSETS = ROOT / 'assets/images'

# Preserve the original HY3N and AKWAABA pixels, but blend every near-black
# pixel into the same pure black as the native splash background. The recovered
# image contains a subtly lighter circular/rectangular field; normalising that
# field removes the visible cut-and-paste edge without redrawing the artwork.
source = Image.open(SOURCE).convert('RGBA')
artwork = source.copy()
pixels = artwork.load()

for y in range(artwork.height):
    for x in range(artwork.width):
        r, g, b, a = pixels[x, y]
        if max(r, g, b) < 92:
            pixels[x, y] = (0, 0, 0, 255)

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
