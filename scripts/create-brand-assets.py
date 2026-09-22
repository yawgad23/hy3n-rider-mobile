from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
brand = Image.open(ROOT / 'assets/images/hy3n-logo-no-tagline.png').convert('RGBA')

# iOS app icons must be fully opaque. Keep the black HY3N brand backdrop for
# them instead of reusing the transparent splash/adaptive foreground artwork.
def opaque_brand_icon(size: int) -> Image.Image:
    return brand.resize((size, size), Image.Resampling.LANCZOS).convert('RGB')

source = brand.copy()
pixels = source.load()
# Turn the black square backdrop transparent while preserving the colored logo.
for y in range(source.height):
    for x in range(source.width):
        r, g, b, a = pixels[x, y]
        if max(r, g, b) < 16:
            pixels[x, y] = (r, g, b, 0)

bbox = source.getbbox()
if not bbox:
    raise RuntimeError('Logo artwork could not be detected')
logo = source.crop(bbox)


def padded_square(size: int, target_fraction: float) -> Image.Image:
    scale = min(size * target_fraction / logo.width, size * target_fraction / logo.height)
    resized = logo.resize((round(logo.width * scale), round(logo.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas

assets = ROOT / 'assets/images'
# Splash: a generous transparent safe area against the configured black background.
splash = padded_square(1248, 0.82)
splash.save(assets / 'rider-splash-logo.png')
# Adaptive foreground: smaller still because Android applies a circular/squircle mask.
padded_square(1248, 0.56).save(assets / 'rider-adaptive-foreground.png')
# Android themed icons use the alpha channel as the mask; keep the same safe area
# and render the artwork as a single-color mark.
monochrome = padded_square(432, 0.56)
mono_pixels = monochrome.load()
for y in range(monochrome.height):
    for x in range(monochrome.width):
        alpha = mono_pixels[x, y][3]
        mono_pixels[x, y] = (255, 255, 255, alpha)
monochrome.save(assets / 'rider-adaptive-monochrome.png')
# Solid black adaptive background replaces the default Expo placeholder artwork.
background = Image.new('RGBA', (512, 512), (10, 10, 10, 255))
background.save(assets / 'rider-adaptive-background.png')

# iOS and web icons retain the opaque black backdrop. The transparent source is
# used only where Expo/Android provides a separate background layer.
opaque_brand_icon(1024).save(assets / 'rider-ios-icon.png')
for filename, size in [('icon.png', 1248), ('favicon.png', 1248), ('icon-120.png', 120),
                       ('icon-152.png', 152), ('icon-180.png', 180), ('icon-192.png', 192),
                       ('icon-512.png', 512), ('icon-76.png', 76)]:
    opaque_brand_icon(size).save(assets / filename)
splash.save(assets / 'splash-icon.png')
padded_square(1248, 0.56).save(assets / 'android-icon-foreground.png')
background.save(assets / 'android-icon-background.png')
monochrome.save(assets / 'android-icon-monochrome.png')
print('created rider-splash-logo.png, rider-adaptive-foreground.png, rider-adaptive-monochrome.png, rider-adaptive-background.png')
print('source artwork bbox:', bbox)
print('splash dimensions:', (1248, 1248), 'adaptive foreground dimensions:', (1248, 1248))
