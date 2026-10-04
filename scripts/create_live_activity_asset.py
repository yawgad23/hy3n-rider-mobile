"""Create the transparent HY3N Dynamic Island wordmark from project artwork.

The result preserves the original HY3N pixels while removing only the connected
near-black backdrop. Interior black details, such as the Ghana star, remain.
"""
from collections import deque
from pathlib import Path
from PIL import Image

project = Path(__file__).resolve().parents[1]
source = project / "assets/images/hy3n-logo-no-tagline.png"
target = project / "assets/liveActivity/hy3n_wordmark.png"
image = Image.open(source).convert("RGBA")
width, height = image.size
pixels = image.load()
visited = bytearray(width * height)
queue: deque[tuple[int, int]] = deque()


def is_connected_backdrop(x: int, y: int) -> bool:
    red, green, blue, alpha = pixels[x, y]
    return alpha > 0 and max(red, green, blue) <= 22


def add_if_backdrop(x: int, y: int) -> None:
    key = y * width + x
    if not visited[key] and is_connected_backdrop(x, y):
        visited[key] = 1
        queue.append((x, y))


for x in range(width):
    add_if_backdrop(x, 0)
    add_if_backdrop(x, height - 1)
for y in range(height):
    add_if_backdrop(0, y)
    add_if_backdrop(width - 1, y)

while queue:
    x, y = queue.popleft()
    pixels[x, y] = (0, 0, 0, 0)
    for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= next_x < width and 0 <= next_y < height:
            add_if_backdrop(next_x, next_y)

bounds = image.getchannel("A").getbbox()
if not bounds:
    raise RuntimeError("The HY3N wordmark extraction was empty.")
left, top, right, bottom = bounds
wordmark = image.crop((max(0, left - 16), max(0, top - 16), min(width, right + 16), min(height, bottom + 16)))
wordmark.thumbnail((620, 160), Image.Resampling.LANCZOS)
canvas = Image.new("RGBA", (620, 160), (0, 0, 0, 0))
canvas.alpha_composite(wordmark, ((620 - wordmark.width) // 2, (160 - wordmark.height) // 2))
target.parent.mkdir(parents=True, exist_ok=True)
canvas.save(target, optimize=True)
print(target)
