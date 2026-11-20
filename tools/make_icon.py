"""App icon for Kavite: the letter K as a three-dimensional spaceship.
The ship is rendered with three.js by tools/icon/render.cjs (android/icon-ship.png
plus engine positions in icon-ship.json); this script puts it on a space
background, adds the exhaust plumes and a soft bloom, and writes the Android
launcher icons (legacy PNG per density plus adaptive foreground/background) and a
512 px store icon.
Usage: node tools/icon/render.cjs && python3 tools/make_icon.py   (needs Pillow)"""
import json, math, os, random
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'res')
N = 1024                      # master size; everything is drawn at this size and scaled down

def background(n):
    img = Image.new('RGB', (n, n))
    px = img.load()
    for y in range(n):
        for x in range(n):
            d = math.hypot(x - n * 0.42, y - n * 0.38) / n
            k = max(0.0, 1 - d * 1.5)
            px[x, y] = (int(4 + 22 * k), int(6 + 30 * k), int(12 + 58 * k))
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)
    for _ in range(140):
        x, y, r = rnd.random() * n, rnd.random() * n, rnd.choice([1, 1, 1, 2, 2, 3]) * n / 1024
        a = rnd.randint(90, 230)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(a, a, min(255, a + 20)))
    return img

def plumes(engines, n):
    """Tapered exhaust flames from each engine mouth, white-hot core to orange."""
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    for x0, y0, x1, y1 in engines:
        x0, y0, x1, y1 = x0 * n, y0 * n, x1 * n, y1 * n
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy); ux, uy = dx / L, dy / L; px, py = -uy, ux
        for width, col, blur in ((0.075, (255, 120, 40, 150), 30), (0.045, (255, 170, 80, 220), 12), (0.02, (255, 245, 220, 255), 5)):
            m = Image.new('L', (n, n), 0)
            w = width * n
            ImageDraw.Draw(m).polygon([(x0 + px * w, y0 + py * w), (x0 + ux * L, y0 + uy * L), (x0 - px * w, y0 - py * w)], fill=255)
            layer = Image.new('RGBA', (n, n), col[:3] + (0,))
            layer.putalpha(m.filter(ImageFilter.GaussianBlur(blur)).point(lambda v, a=col[3]: v * a // 255))
            out.alpha_composite(layer)
    return out

def bloom(img, threshold=200, radius=18, strength=0.8):
    """Soft glow around the bright parts (windows, stripes, lights)."""
    lum = img.convert('L').point(lambda v: 255 if v > threshold else 0)
    mask = ImageChops.multiply(lum, img.getchannel('A'))
    glow = img.copy(); glow.putalpha(mask.filter(ImageFilter.GaussianBlur(radius)).point(lambda v: int(v * strength)))
    out = img.copy(); out.alpha_composite(glow)
    return out

def craft():
    ship = Image.open(os.path.join(ROOT, 'android', 'icon-ship.png')).convert('RGBA').resize((N, N), Image.LANCZOS)
    engines = json.load(open(os.path.join(ROOT, 'android', 'icon-ship.json')))['engines']
    layer = plumes(engines, N)
    rim = Image.new('RGBA', (N, N), (90, 220, 200, 0))        # faint teal halo behind the hull
    rim.putalpha(ship.getchannel('A').filter(ImageFilter.GaussianBlur(26)).point(lambda v: v // 3))
    layer.alpha_composite(rim)
    layer.alpha_composite(ship)
    return bloom(layer)

def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def main():
    bg = background(N)
    ship = craft()
    full = bg.convert('RGBA'); full.alpha_composite(ship)
    legacy = rounded(full, int(N * 0.22))
    # adaptive: 108 dp canvas, the launcher mask shows the inner 66 dp, so shrink the ship
    s = int(N * 0.70)
    fg = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    fg.alpha_composite(ship.resize((s, s), Image.LANCZOS), ((N - s) // 2, (N - s) // 2))
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for name, f in dens.items():
        d = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)
        legacy.resize((int(48 * f),) * 2, Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))
        fg.resize((int(108 * f),) * 2, Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'))
        bg.resize((int(108 * f),) * 2, Image.LANCZOS).save(os.path.join(d, 'ic_launcher_background.png'))
    full.convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, 'android', 'icon-512.png'))
    print('icons written to', RES)

if __name__ == '__main__':
    main()
