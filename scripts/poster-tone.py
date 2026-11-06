# Usage: python -I scripts/poster-tone.py <poster> <out.png> <compare.jpg>  (then cover.webp/cover.jpg/share.jpg are made from out.png)
# Poster tone: less orange skin. Only the orange/skin hues lose saturation and turn a little
# browner; then a slight cool white balance. Purples, blues and greens are left alone.
import sys
import site
sys.path.insert(0, site.getusersitepackages())  # (python -I skips the user site, where Pillow and numpy live)
import numpy as np
from PIL import Image
src, out, cmp_out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
hsv = np.asarray(im.convert('HSV')).astype(np.float32)
h = hsv[..., 0] * 360 / 255
s = hsv[..., 1] / 255
v = hsv[..., 2] / 255
def ramp(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
# orange band: full strength 8-38 deg, fading out by 0 and 55 deg
w = ramp(h, 0, 8) * (1 - ramp(h, 38, 55))
w *= ramp(s, 0.18, 0.4)  # only coloured pixels, not near-greys
# keep house colours: very bright, very saturated oranges are banners and logos, not skin
w *= 1 - ramp(v, 0.8, 0.9) * ramp(s, 0.68, 0.82)
# and the Kingsway banner itself (orange and black), top right of the poster
Hh, Ww = h.shape
ys, xs = np.mgrid[0:Hh, 0:Ww]
w *= 1 - ((xs > Ww * 0.865) & (ys < Hh * 0.17))
s2 = s * (1 - 0.34 * w)
h2 = h + 4.0 * w  # red-orange -> brown
v2 = v * (1 - 0.03 * w)
hsv2 = np.stack([(h2 % 360) * 255 / 360, s2 * 255, v2 * 255], -1).clip(0, 255).astype(np.uint8)
rgb = np.asarray(Image.fromarray(hsv2, 'HSV').convert('RGB')).astype(np.float32)
# a slightly cooler white balance overall
rgb[..., 0] *= 0.975
rgb[..., 2] *= 1.03
fixed = Image.fromarray(rgb.clip(0, 255).astype(np.uint8), 'RGB')
fixed.save(out, 'PNG')
a = np.asarray(fixed).astype(float)
for name, (x, y) in {'031 girl': (590, 470), 'top-left girl': (180, 300), 'kingsway girl': (790, 560)}.items():
    print(name, a[y:y+20, x:x+20].reshape(-1, 3).mean(0).round(0))
# before | after, for a look
W, H = im.size
both = Image.new('RGB', (W * 2 + 12, H), (20, 20, 20))
both.paste(im, (0, 0)); both.paste(fixed, (W + 12, 0))
both.resize(((W * 2 + 12) // 2, H // 2), Image.LANCZOS).save(cmp_out, 'JPEG', quality=88)
