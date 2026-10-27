"""Чистая копия комикса без нарисованной «лужи» кнопки: на её месте зеркальная трава слева с мягкими краями."""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(float)
H, W = a.shape[:2]
x0, y0, feather = 700, 556, 7  # левый и верхний край заплатки; ширина размытия краёв
out = a.copy()
for y in range(y0, H):
    for x in range(x0, W):
        sx = 2 * x0 - 1 - x  # зеркало вокруг x0: у стыка пиксели совпадают
        w = min(1.0, (x - x0 + 1) / feather, (y - y0 + 1) / feather)
        out[y, x] = a[y, sx] * w + a[y, x] * (1 - w)
Image.fromarray(out.round().astype("uint8")).save(dst, lossless=True)
