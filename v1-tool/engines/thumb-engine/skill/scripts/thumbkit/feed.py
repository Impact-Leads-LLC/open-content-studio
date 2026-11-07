"""The review and feed sheets.

review-<id>.jpg: the thumbnail at 1280, 360, 168, 168 with a 1.2 px blur, and a squint view.
feed-<id>.jpg: a 3x3 grid on a dark (#0F0F0F) and a light (#FFFFFF) page at 360 and 168 px, the thumbnail among
reference thumbnails (the channel's own recent ones, or any the studio passes in context.refs) and the other looks
made in the same run. Empty tiles are plain grey. --shuffle <seed> puts the thumbnail in a random tile for a blind
review; the seed goes in the sidecar JSON, never on the sheet."""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from .tokens import H, W

BLUR168 = 1.2
EXT = ('.jpg', '.jpeg', '.png', '.webp')


def stamp(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 8 * len(text) + 16, 22), fill='#FFD60A')
    d.text((8, 5), text, fill='#000000')
    return im


def tiles_from(ref_dirs, limit=8):
    """Up to `limit` 16:9 frames, filled to the canvas: every image in the folders given, newest name last."""
    out = []
    for d in ref_dirs:
        d = Path(d)
        if not d.is_dir():
            continue
        for p in sorted(x for x in d.iterdir() if x.suffix.lower() in EXT):
            try:
                im = Image.open(p).convert('RGB')
            except OSError:
                continue
            s = max(W / im.width, H / im.height)
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            x0, y0 = (im.width - W) // 2, (im.height - H) // 2
            out.append(im.crop((x0, y0, x0 + W, y0 + H)))
            if len(out) >= limit:
                return out
    return out


def feed_sheet(comp_png, out_path, refs, shuffle=None, label=None, placeholder=False, blind=False):
    """refs: a list of RGB 1280x720 images (tiles_from). Missing tiles are flat grey."""
    comp = Image.open(comp_png).convert('RGB')
    others = list(refs)[:8]
    while len(others) < 8:
        others.append(Image.new('RGB', (W, H), (128, 128, 128)))
    pos = 4
    if shuffle is not None:
        rnd = random.Random(str(shuffle))
        pos = rnd.randrange(9)
        rnd.shuffle(others)
    tiles = others[:pos] + [comp] + others[pos:]
    panels = []
    for bg, mode in (('#0F0F0F', 'dark mode'), ('#FFFFFF', 'light mode')):
        for tw in (360, 168):
            th = round(tw * 9 / 16)
            g = 8 if tw == 168 else 16
            pnl = Image.new('RGB', (3 * tw + 4 * g, 3 * th + 4 * g + 24), bg)
            dr = ImageDraw.Draw(pnl)
            head = f'{mode}, {tw} px' if blind else f'{label or Path(comp_png).stem}: {mode}, {tw} px (thumbnail in tile {pos + 1})'
            dr.text((g, 4), head, fill='#888888')
            for i, t in enumerate(tiles):
                pnl.paste(t.resize((tw, th), Image.LANCZOS), (g + (i % 3) * (tw + g), 24 + g + (i // 3) * (th + g)))
            panels.append(pnl)
    wtot = max(panels[0].width + panels[1].width, panels[2].width + panels[3].width) + 20
    s = Image.new('RGB', (wtot, panels[0].height + panels[2].height + 20), '#777777')
    s.paste(panels[0], (0, 0)); s.paste(panels[1], (panels[0].width + 20, 0))
    s.paste(panels[2], (0, panels[0].height + 20)); s.paste(panels[3], (panels[2].width + 20, panels[0].height + 20))
    if placeholder and not blind:
        stamp(s, 'GENERATED LOOP')
    s.save(out_path, quality=88)
    return {'sheet': str(out_path), 'tile': pos + 1, 'seed': shuffle, 'references': len(refs)}


def review_sheet(comp_png, out_path, placeholder=False):
    """1280, 360, 168, 168 at 1.2 px blur, and a squint view."""
    im = Image.open(comp_png).convert('RGB')
    v360 = im.resize((360, 203), Image.LANCZOS)
    v168 = im.resize((168, 94), Image.LANCZOS)
    v168b = v168.filter(ImageFilter.GaussianBlur(BLUR168))
    squint = im.resize((360, 203), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4))
    s = Image.new('RGB', (1280 + 24 * 2, 720 + 24 * 3 + 203 + 20), '#1A1A1A')
    s.paste(im, (24, 24))
    y = 720 + 48 + 10
    x = 24
    d = ImageDraw.Draw(s)
    for lab, t in (('360', v360), ('168', v168), ('168, 1.2 px blur', v168b), ('squint', squint)):
        d.text((x, y - 14), lab, fill='#AAAAAA')
        s.paste(t, (x, y))
        x += t.width + 24
    if placeholder:
        stamp(s, 'GENERATED LOOP')
    s.save(out_path, quality=90)
    return str(out_path)
