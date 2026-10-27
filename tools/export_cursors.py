"""Курсоры «Фермы Айрис» (data/cursors, X.jpg + X_.png) → web/public/cursors/<имя>.png.

Запуск: python3 export_cursors.py "<папка игры>" <папка web>
"""
import sys
from pathlib import Path

from PIL import Image

NAMES = ["attack", "buy", "gather_product", "normal", "pour", "sell", "talk"]


def main():
    src = Path(sys.argv[1]) / "data" / "cursors"
    out = Path(sys.argv[2]) / "public" / "cursors"
    out.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        jpg, mask, png = src / f"{name}.jpg", src / f"{name}_.png", src / f"{name}.png"
        if jpg.exists():
            img = Image.open(jpg).convert("RGBA")
            if mask.exists():
                img.putalpha(Image.open(mask).convert("L").resize(img.size))
        else:
            img = Image.open(png).convert("RGBA")
        img.save(out / f"{name}.png")
        print(name, img.size)


if __name__ == "__main__":
    main()
