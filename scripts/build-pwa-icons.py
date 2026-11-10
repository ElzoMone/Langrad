#!/usr/bin/env python3
"""Rebuild the Langrad PWA PNG icons from the committed SVG source.

Usage:
    python -m pip install cairosvg pillow
    python scripts/build-pwa-icons.py

PNG files are committed to GitHub. The generator is retained for reproducing
or adjusting them when the brand SVG changes.
"""
from pathlib import Path
import cairosvg
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "icons/langrad.svg"
target = root / "icons"
target.mkdir(parents=True, exist_ok=True)

for name, size in (
    ("langrad-192.png", 192),
    ("langrad-512.png", 512),
    ("langrad-maskable-512.png", 512),
    ("apple-touch-icon.png", 180),
):
    output = target / name
    cairosvg.svg2png(
        url=str(source),
        write_to=str(output),
        output_width=size,
        output_height=size,
    )
    # 32-color palette keeps icons sharp and reduces download/cache cost.
    icon = Image.open(output).convert("RGB").quantize(colors=32)
    icon.save(output, optimize=True)
    print(f"Built {output.relative_to(root)} ({size}×{size})")
