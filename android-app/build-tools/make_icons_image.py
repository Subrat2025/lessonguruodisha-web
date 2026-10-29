"""Builds the launcher icon set and store icon from a finished square artwork.

Usage: python3 make_icons_image.py <android-app dir> [artwork.png]
Default artwork: icon-src/lesson-guru-icon.png (rounded square with white corners).
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = sys.argv[1]
SRC = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'icon-src', 'lesson-guru-icon.png')
RES = os.path.join(ROOT, 'res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
RADIUS = 0.25          # corner radius of the artwork's own rounded square
TOP, BOTTOM = (2, 187, 255), (240, 140, 0)  # artwork edge colours, used to fill around it


def rounded(img, ratio=RADIUS):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=int(img.size[0] * ratio), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


def gradient(size):
    g = Image.new('RGBA', (1, 256))
    for y in range(256):
        t = y / 255
        g.putpixel((0, y), tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)) + (255,))
    return g.resize((size, size), Image.BICUBIC)


def centred(art, size, frac, bg=None):
    """art scaled to `frac` of a size×size canvas, centred, over bg (or transparent)."""
    canvas = bg.copy() if bg is not None else Image.new('RGBA', (size, size), (0, 0, 0, 0))
    a = int(size * frac)
    canvas.alpha_composite(art.resize((a, a), Image.LANCZOS), ((size - a) // 2, (size - a) // 2))
    return canvas


def save(img, path, px):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(path, optimize=True)


def main():
    art = rounded(Image.open(SRC).convert('RGBA'))
    S = 1728
    full = gradient(S)
    full.alpha_composite(art.resize((S, S), Image.LANCZOS))          # square, corners filled
    fg = centred(art, S, 66 / 108)                                    # adaptive foreground: art inside the 66dp safe zone
    bg = gradient(S)                                                  # adaptive background
    circle = Image.new('L', (S, S), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, S - 1, S - 1), fill=255)
    roundi = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    roundi.paste(centred(art, S, 0.86, gradient(S)), (0, 0), circle)

    for name, mult in DENSITIES.items():
        d = os.path.join(RES, f'mipmap-{name}')
        save(art, os.path.join(d, 'ic_launcher.png'), int(48 * mult))
        save(roundi, os.path.join(d, 'ic_launcher_round.png'), int(48 * mult))
        save(bg, os.path.join(d, 'ic_launcher_background.png'), int(108 * mult))
        save(fg, os.path.join(d, 'ic_launcher_foreground.png'), int(108 * mult))

    out = os.path.join(ROOT, 'src', 'main', 'assets', 'app', 'img')
    os.makedirs(out, exist_ok=True)
    art.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'logo-mark.png'))
    art.resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'app-icon.png'))

    dist = os.path.join(ROOT, 'dist', 'store')
    os.makedirs(dist, exist_ok=True)
    full.resize((512, 512), Image.LANCZOS).convert('RGB').save(os.path.join(dist, 'play-store-icon-512.png'))
    print('icons written from', os.path.basename(SRC))


if __name__ == '__main__':
    main()
