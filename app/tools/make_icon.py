"""App icon: a floating vanity drawn with the real textures (walnut fronts, birch ply edges,
white vessel sink) on a warm wall. Writes Resources/Assets.xcassets/AppIcon.appiconset/icon-1024.png.

    python app/tools/make_icon.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, '..', 'Resources', 'Textures')
OUT = os.path.join(HERE, '..', 'Resources', 'Assets.xcassets', 'AppIcon.appiconset', 'icon-1024.png')
S = 1024


def tex(key, w, h, scale=1.0):
    """Texture tiled to cover w x h at the given scale."""
    im = Image.open(os.path.join(TEX, key, 'color.jpg')).convert('RGB')
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    out = Image.new('RGB', (w, h))
    for y in range(0, h, im.height):
        for x in range(0, w, im.width):
            out.paste(im, (x, y))
    return out


# wall: soft vertical gradient
icon = Image.new('RGB', (S, S))
d = ImageDraw.Draw(icon)
for y in range(S):
    t = y / S
    d.line([(0, y), (S, y)], fill=(int(241 - 18 * t), int(236 - 20 * t), int(229 - 24 * t)))

x0, x1 = 150, 874           # cabinet
top_y, top_h = 470, 34      # countertop
body_y0, body_y1 = top_y + top_h, 790
gap = 8

# shadow on the wall
sh = Image.new('L', (S, S), 0)
ImageDraw.Draw(sh).rounded_rectangle([x0 + 10, body_y0 + 40, x1 + 30, body_y1 + 60], 30, fill=120)
sh = sh.filter(ImageFilter.GaussianBlur(40))
icon.paste(Image.new('RGB', (S, S), (150, 135, 118)), (0, 0), sh)

# countertop: birch face on top edge line + ply edge stripes on the front
icon.paste(tex('ply-edge', x1 - x0 + 24, top_h, scale=0.35), (x0 - 12, top_y))
# walnut drawer fronts (two), ply edge reveal around them
icon.paste(tex('ply-edge', x1 - x0, body_y1 - body_y0, scale=0.35), (x0, body_y0))
mid = (body_y0 + body_y1) // 2
for (a, b) in [(body_y0 + 6, mid - gap // 2), (mid + gap // 2, body_y1)]:
    icon.paste(tex('walnut', x1 - x0 - 12, b - a, scale=0.6), (x0 + 6, a))
    cx, py = (x0 + x1) // 2, a + 40
    ImageDraw.Draw(icon).rounded_rectangle([cx - 90, py - 9, cx + 90, py + 9], 9, fill=(24, 24, 24))

# vessel sink: white bowl with soft shading
bowl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(bowl)
bd.ellipse([330, 330, 694, 500], fill=(250, 250, 248, 255))
bd.rectangle([330, 415, 694, 470], fill=(250, 250, 248, 255))
bd.ellipse([352, 340, 672, 420], fill=(228, 228, 224, 255))
bowl = bowl.crop((0, 0, S, top_y + 2))
icon.paste(bowl, (0, 0), bowl)
# faucet
fd = ImageDraw.Draw(icon)
fd.rounded_rectangle([497, 215, 527, 360], 12, fill=(24, 24, 24))
fd.rounded_rectangle([497, 215, 610, 240], 12, fill=(24, 24, 24))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
icon.save(OUT)
print(OUT)
