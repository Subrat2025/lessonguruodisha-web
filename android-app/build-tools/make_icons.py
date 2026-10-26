"""Generates the launcher icon set (legacy, round, adaptive layers) and store art.

Usage: python3 make_icons.py <android-app dir>
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = sys.argv[1]
RES = os.path.join(ROOT, 'res')
S = 1728  # supersampled canvas for a 108dp adaptive layer

DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def gradient(size, stops):
    """Diagonal multi-stop gradient (top-left -> bottom-right)."""
    w = h = size
    small = 256
    img = Image.new('RGB', (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            for i in range(len(stops) - 1):
                p0, c0 = stops[i]
                p1, c1 = stops[i + 1]
                if p0 <= t <= p1:
                    px[x, y] = lerp(c0, c1, (t - p0) / (p1 - p0))
                    break
    return img.resize((w, h), Image.BICUBIC)


STOPS = [(0.0, (255, 145, 0)), (0.45, (255, 45, 120)), (1.0, (109, 40, 217))]


def background(size):
    bg = gradient(size, STOPS).convert('RGBA')
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    r = size * 0.55
    d.ellipse((-r * 0.35, -r * 0.45, r * 1.2, r * 1.0), fill=(255, 255, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.08))
    bg.alpha_composite(glow)
    # subtle decorative rings
    rings = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(rings)
    for k, a in ((0.95, 28), (1.25, 18)):
        rr = size * k / 2
        cx, cy = size * 0.92, size * 0.95
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 255, 255, a), width=int(size * 0.012))
    bg.alpha_composite(rings)
    return bg


def bezier(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


def star(cx, cy, r_out, r_in, points=4, rot=-math.pi / 2):
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + i * math.pi / points
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def foreground(size, scale=1.0):
    """White open book with a golden spark: sits inside the 66dp safe zone."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = size / 2
    u = size / 108 * scale  # 1dp in px

    def P(x, y):  # dp offsets from centre -> px
        return (c + x * u, c + y * u)

    # shadow layer
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    left = bezier(P(-1, -6), P(-12, -14), P(-26, -9)) + [P(-26, 19)] + bezier(P(-26, 19), P(-12, 14), P(-1, 22))[1:]
    right = bezier(P(1, -6), P(12, -14), P(26, -9)) + [P(26, 19)] + bezier(P(26, 19), P(12, 14), P(1, 22))[1:]
    off = 2.2 * u
    sd.polygon([(x, y + off) for x, y in left], fill=(60, 0, 80, 110))
    sd.polygon([(x, y + off) for x, y in right], fill=(60, 0, 80, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(2.2 * u))
    img.alpha_composite(shadow)

    d = ImageDraw.Draw(img)
    d.polygon(left, fill=(255, 255, 255, 255))
    d.polygon(right, fill=(255, 244, 236, 255))
    # page lines
    for i, yy in enumerate((-2, 3.5, 9)):
        ln = bezier(P(-5, yy), P(-13, yy - 6), P(-21, yy - 3.2), 20)
        d.line(ln, fill=(255, 120, 60, 200), width=max(1, int(1.6 * u)), joint='curve')
        rn = bezier(P(5, yy), P(13, yy - 6), P(21, yy - 3.2), 20)
        d.line(rn, fill=(160, 90, 230, 200), width=max(1, int(1.6 * u)), joint='curve')
    # spine
    d.line([P(0, -5), P(0, 21)], fill=(255, 210, 190, 255), width=max(1, int(1.2 * u)))
    # golden spark above the book
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = P(0, -22)
    gd.ellipse((gx - 9 * u, gy - 9 * u, gx + 9 * u, gy + 9 * u), fill=(255, 230, 120, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(4 * u))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.polygon(star(gx, gy, 8.5 * u, 2.4 * u), fill=(255, 214, 10, 255))
    sx, sy = P(13, -24)
    d.polygon(star(sx, sy, 3.6 * u, 1.1 * u), fill=(255, 255, 255, 235))
    sx, sy = P(-13, -19)
    d.polygon(star(sx, sy, 2.6 * u, 0.8 * u), fill=(255, 255, 255, 200))
    return img


def rounded_mask(size, radius_ratio):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255)
    return m


def save(img, path, px):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(path, optimize=True)


def main():
    bg = background(S)
    fg = foreground(S)
    full = bg.copy()
    full.alpha_composite(fg)

    # legacy square-ish icon (48dp) cropped from the 108dp design's middle 72dp
    crop = int(S * 18 / 108)
    legacy_src = full.crop((crop, crop, S - crop, S - crop))
    ls = legacy_src.size[0]
    legacy = Image.new('RGBA', (ls, ls), (0, 0, 0, 0))
    legacy.paste(legacy_src, (0, 0), rounded_mask(ls, 0.24))
    roundi = Image.new('RGBA', (ls, ls), (0, 0, 0, 0))
    cm = Image.new('L', (ls, ls), 0)
    ImageDraw.Draw(cm).ellipse((0, 0, ls - 1, ls - 1), fill=255)
    roundi.paste(legacy_src, (0, 0), cm)

    for name, mult in DENSITIES.items():
        d = os.path.join(RES, f'mipmap-{name}')
        save(legacy, os.path.join(d, 'ic_launcher.png'), int(48 * mult))
        save(roundi, os.path.join(d, 'ic_launcher_round.png'), int(48 * mult))
        save(bg, os.path.join(d, 'ic_launcher_background.png'), int(108 * mult))
        save(fg, os.path.join(d, 'ic_launcher_foreground.png'), int(108 * mult))

    # Android 12 splash icon: foreground only, centred (needs to fit 2/3 circle)
    out = os.path.join(ROOT, 'src', 'main', 'assets', 'app', 'img')
    os.makedirs(out, exist_ok=True)
    fg_big = foreground(S, scale=1.25)
    fg_big.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'logo-mark.png'))
    legacy.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'app-icon.png'))

    dist = os.path.join(ROOT, 'dist', 'store')
    os.makedirs(dist, exist_ok=True)
    legacy_src.resize((512, 512), Image.LANCZOS).convert('RGB').save(os.path.join(dist, 'play-store-icon-512.png'))
    print('icons written')


if __name__ == '__main__':
    main()
