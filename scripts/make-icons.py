#!/usr/bin/env python3
"""
Generates the PWA icon PNGs: a coffee bean.

A script rather than four committed binaries so the icons stay reproducible —
change a colour here and re-run, instead of wondering which long-lost tool
produced icon-192.png.

Deps: Pillow. Run: python3 scripts/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (23, 17, 13, 255)      # --bg (espresso)
ACCENT = (200, 138, 74, 255)  # --accent (crema)

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

SS = 4  # supersample: PIL has no antialiased vector drawing


def draw_icon(size: int, padding_ratio: float) -> Image.Image:
    """padding_ratio leaves the maskable safe zone: Android crops to a circle
    that can eat the outer ~10% per side, so art must sit inside it."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)

    pad = s * padding_ratio
    inner = s - 2 * pad
    cx = cy = s / 2

    # The bean: an ellipse rotated 45°, drawn oversized on its own layer then
    # rotated, because PIL can't draw a rotated ellipse directly.
    bw, bh = inner * 0.78, inner * 0.58
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.ellipse([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], fill=ACCENT)

    # The crease: one narrow BG lens down the bean's long axis. An earlier
    # attempt subtracted offset ellipses to fake a curved split and left two
    # disconnected nicks — at 34px a straight slit reads as a bean and a broken
    # curve reads as a potato.
    ld.ellipse(
        [cx - bw * 0.40, cy - bh * 0.085, cx + bw * 0.40, cy + bh * 0.085],
        fill=BG,
    )

    layer = layer.rotate(-38, resample=Image.BICUBIC, center=(cx, cy))
    img.alpha_composite(layer)

    return img.resize((size, size), Image.LANCZOS)


for size in (192, 512):
    draw_icon(size, 0.16).save(OUT / f"icon-{size}.png")
    print(f"wrote icon-{size}.png")

draw_icon(512, 0.26).save(OUT / "icon-maskable-512.png")
print("wrote icon-maskable-512.png")

draw_icon(180, 0.16).save(OUT / "apple-touch-icon.png")
print("wrote apple-touch-icon.png")
