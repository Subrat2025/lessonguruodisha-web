"""App icon "A": white open book with a gradient "L" and "G" on its pages and a gold spark,
on the brand gradient (saffron -> pink -> violet). Writes the launcher set and the store icon.

Usage: python3 make_icons_lg.py <android-app dir>
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = sys.argv[1]
RES = os.path.join(ROOT, 'res')
S = 1024
FONTS = ['/home/user/tools/poppins/package/files/poppins-latin-800-normal.woff',
         '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf']
BRAND = [(0, (255, 153, 0)), (0.5, (255, 45, 120)), (1, (120, 40, 230))]
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def font(size):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    raise SystemExit('no bold font found')


def grad(stops, angle=45):
    small = 256
    img = Image.new('RGB', (small, small))
    px = img.load()
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    for y in range(small):
        for x in range(small):
            t = ((x / (small - 1)) * ca + (y / (small - 1)) * sa) / (ca + sa)
            for i in range(len(stops) - 1):
                p0, c0 = stops[i]
                p1, c1 = stops[i + 1]
                if p0 <= t <= p1:
                    k = (t - p0) / (p1 - p0)
                    px[x, y] = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                    break
    return img.resize((S, S), Image.BICUBIC).convert('RGBA')


def bez(p0, p1, p2, n=48):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


def star(cx, cy, ro, ri, pts=4):
    return [(cx + (ro if i % 2 == 0 else ri) * math.cos(-math.pi / 2 + i * math.pi / pts),
             cy + (ro if i % 2 == 0 else ri) * math.sin(-math.pi / 2 + i * math.pi / pts)) for i in range(pts * 2)]


def background():
    bg = grad(BRAND)
    g = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((-S * .3, -S * .45, S * .75, S * .45), fill=(255, 255, 255, 60))
    bg.alpha_composite(g.filter(ImageFilter.GaussianBlur(S * .08)))
    return bg


def letter(layer, txt, cx, cy, size):
    m = Image.new('L', (S, S), 0)
    f = font(size)
    b = f.getbbox(txt)
    ImageDraw.Draw(m).text((cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2), txt, font=f, fill=255)
    layer.paste(grad(BRAND, 90), (0, 0), m)


def content():
    """Book, letters and sparks on a transparent layer (no background)."""
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    cx, cy, w, h, lift = 512, 560, 640, 420, 70
    left = bez((cx - 6, cy - h / 2 + lift), (cx - w * .25, cy - h / 2 - lift * 1.2), (cx - w / 2, cy - h / 2)) + [(cx - w / 2, cy + h / 2)] \
        + bez((cx - w / 2, cy + h / 2), (cx - w * .25, cy + h / 2 - lift * .9), (cx - 6, cy + h / 2 + lift * .6))[1:]
    right = [(2 * cx - x, y) for x, y in left]
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for poly in (left, right):
        sd.polygon([(x, y + 14) for x, y in poly], fill=(40, 0, 70, 110))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(img)
    d.polygon(left, fill=(255, 255, 255, 255))
    d.polygon(right, fill=(255, 247, 240, 255))
    d.line([(512, 360), (512, 775)], fill=(255, 205, 185, 255), width=8)
    letter(img, 'L', 360, 575, 300)
    letter(img, 'G', 668, 575, 300)
    g = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((432, 150, 592, 310), fill=(255, 230, 120, 170))
    img.alpha_composite(g.filter(ImageFilter.GaussianBlur(30)))
    d = ImageDraw.Draw(img)
    d.polygon(star(512, 230, 78, 20), fill=(255, 214, 10, 255))
    d.polygon(star(680, 175, 30, 8), fill=(255, 255, 255, 230))
    d.polygon(star(345, 200, 22, 6), fill=(255, 255, 255, 200))
    return img


def scaled(layer, k):
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    a = int(S * k)
    out.alpha_composite(layer.resize((a, a), Image.LANCZOS), ((S - a) // 2, (S - a) // 2))
    return out


def masked(img, shape):
    m = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(m)
    w = img.size[0]
    if shape == 'circle':
        d.ellipse((0, 0, w - 1, w - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, w - 1, w - 1), radius=int(w * 0.22), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def save(img, path, px):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(path, optimize=True)


def main():
    bg, fg = background(), content()
    full = bg.copy()
    full.alpha_composite(fg)                 # the design as drawn (fills a 48dp legacy icon / store icon)
    adaptive_fg = scaled(fg, 0.74)           # farthest point lands inside the 66dp safe zone of the 108dp layer
    for name, mult in DENSITIES.items():
        d = os.path.join(RES, f'mipmap-{name}')
        save(masked(full, 'rounded'), os.path.join(d, 'ic_launcher.png'), int(48 * mult))
        save(masked(full, 'circle'), os.path.join(d, 'ic_launcher_round.png'), int(48 * mult))
        save(bg, os.path.join(d, 'ic_launcher_background.png'), int(108 * mult))
        save(adaptive_fg, os.path.join(d, 'ic_launcher_foreground.png'), int(108 * mult))
    out = os.path.join(ROOT, 'src', 'main', 'assets', 'app', 'img')
    os.makedirs(out, exist_ok=True)
    masked(full, 'rounded').resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'app-icon.png'))
    masked(full, 'rounded').resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'logo-mark.png'))
    dist = os.path.join(ROOT, 'dist', 'store')
    os.makedirs(dist, exist_ok=True)
    full.resize((512, 512), Image.LANCZOS).convert('RGB').save(os.path.join(dist, 'play-store-icon-512.png'))
    print('icons written (LG book)')


if __name__ == '__main__':
    main()
