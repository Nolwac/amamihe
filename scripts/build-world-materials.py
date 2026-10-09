"""Bake small, original tiling materials for the real-time neighborhood."""

from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "public/assets/world"
OUT.mkdir(parents=True, exist_ok=True)
rng = random.Random(481)


def save(image, name):
    image.save(OUT / name, "WEBP", quality=82, method=6)


# Neutral plaster can be tinted by the course-house material without more files.
plaster = Image.new("RGB", (256, 256))
pixels = plaster.load()
for y in range(256):
    for x in range(256):
        grain = rng.gauss(0, 4)
        mottling = 3 * math.sin(x * math.tau / 64) * math.sin(y * math.tau / 128)
        tone = max(195, min(255, round(238 + grain + mottling)))
        pixels[x, y] = (tone, tone, tone)
save(plaster, "plaster.webp")

# Broad, staggered limestone flags; soft bevels read correctly even without PBR.
paving = Image.new("RGB", (512, 512), (145, 127, 101))
draw = ImageDraw.Draw(paving)
for row in range(4):
    for col in range(-1, 5):
        x = col * 128 + (row % 2) * 64
        y = row * 128
        variation = rng.randint(-8, 8)
        base = (213 + variation, 187 + variation, 147 + variation)
        draw.rounded_rectangle((x + 2, y + 2, x + 126, y + 126), 5, fill=base)
        draw.line((x + 7, y + 5, x + 120, y + 5), fill=(239, 215, 177), width=2)
        draw.line((x + 125, y + 8, x + 125, y + 122), fill=(183, 157, 120), width=2)
        draw.line((x + 8, y + 125, x + 122, y + 125), fill=(183, 157, 120), width=2)
pixels = paving.load()
for y in range(512):
    for x in range(512):
        d = rng.randint(-5, 5)
        pixels[x, y] = tuple(max(0, min(255, c + d)) for c in pixels[x, y])
save(paving, "limestone.webp")

wood = Image.new("RGB", (256, 256))
pixels = wood.load()
for y in range(256):
    for x in range(256):
        grain = 6 * math.sin(x / 4 + math.sin(y / 45)) + rng.gauss(0, 2)
        pixels[x, y] = tuple(round(c + grain) for c in (192, 162, 117))
save(wood, "wood.webp")

leaves = Image.new("RGB", (128, 128))
pixels = leaves.load()
for y in range(128):
    for x in range(128):
        vein = 12 * math.exp(-abs(x - 64) / 2)
        ribs = 5 * math.cos((y + abs(x - 64) * 0.45) * math.tau / 15)
        tone = int(210 + vein + ribs + rng.gauss(0, 2))
        pixels[x, y] = (tone, min(255, tone + 15), tone)
save(leaves, "leaf.webp")

print("World material bytes:", sum(p.stat().st_size for p in OUT.glob("*.webp")))
