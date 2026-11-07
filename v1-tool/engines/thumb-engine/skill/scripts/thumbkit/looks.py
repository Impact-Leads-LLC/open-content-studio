"""thumbnail-builder 3.1 (kit): the three looks, for any episode's words, in the studio's palette.

  call   The guest's real frame in a white call window, the host in front over its corner, the support line on an
         ink tag, the hero below with one loop in the accent colour. Hot colour: the accent loop.
  wall   A giant number behind the host's head, the support word in front in white, an accent sticker for the
         payoff. Hot colour: the accent sticker.
  board  A tilted board in the primary colour on flat charcoal with the words in Libre Franklin Black, an accent tag
         for the payoff, the host in an upright white print with the head breaking out of the top. Hot colour: the
         accent tag (an accent, never a background).

Spec (one option; paths relative to the spec file):
  {"id": "a", "look": "call" | "wall" | "board",
   "pair": "<pair id>", "pair_dir": "pairs/<pair id>",              # pair.json + person.png and/or photo.png
   "support": "WARM UP", "hero": "FIRST", "sticker": "THEN CALL",   # sticker: wall and board only
   "order": "support-first" | "hero-first",
   "mark": {"kind": "loop", "target": "hero", "seed": "..."},       # call only; wall and board carry none
   "guest_frame": "guest/guest.json",                               # call only: written by thumb.py guest-frame
   "title": "<video title>"}

The pair folder is written by `thumb.py prepare` from the owner's own photo: pair.json (side, mode, face metrics),
person.png (the cutout) when one exists, photo.png, and plate.png when the studio has a brand background image.
With a cutout (mode "cutout") the person is placed at the look's head size with global tone only. Without one (mode
"photo") only the board plays, with the plain photo cropped into its print; the call and the wall report themselves
not playable. The face is never mirrored, rotated, regenerated or edited locally. Copy-fit measures the real ink and
rejects, never scales. A look the photo or the episode can't play is reported, never forced.

Sides: a pair's side is where the person sits in the frame (L or R); the words take the other side."""
import hashlib
import json
import math
import random
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageStat

from . import tone
from .tokens import H, T, W, path

VERSION = '3.1.0-kit'
V = T['v3']
S2 = 2                                   # vector layers render at 2x, then premultiplied Lanczos down
LOOKS = ('call', 'wall', 'board')


def _rgb(hexs):
    return tuple(int(hexs[i:i + 2], 16) for i in (1, 3, 5))


ACCENT = _rgb(V['colors']['accent'])
INK = _rgb(V['colors']['ink'])
NAVY = _rgb(V['colors']['navy'])
HARBOR = _rgb(V['colors']['harbor'])
WHITE = (255, 255, 255)
ARCHIVO = str(path(T['font']['file']))
FRANKLIN = str(path(V['fonts']['board']['file']))


def _lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def contrast(a, b):
    la = 0.2126 * _lin(a[0]) + 0.7152 * _lin(a[1]) + 0.0722 * _lin(a[2])
    lb = 0.2126 * _lin(b[0]) + 0.7152 * _lin(b[1]) + 0.0722 * _lin(b[2])
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def text_on(bg):
    """White or ink, whichever reads better on bg: (rgb, colour name)."""
    return (INK, 'ink') if contrast(INK, bg) >= contrast(WHITE, bg) else (WHITE, 'white')


ON_ACCENT, ON_ACCENT_NAME = text_on(ACCENT)


class Reject(Exception):
    """Base: payload is printed as JSON by thumb.py."""
    kind = 'reject'

    def __init__(self, payload):
        super().__init__(self.kind)
        self.payload = payload


class CopyFitReject(Reject):
    kind = 'copy_fit_reject'


class WordsReject(Reject):
    kind = 'words_reject'


class Unplayable(Reject):
    kind = 'look_unplayable'


# ------------------------------------------------------------------ drawing helpers
def font(file, px, wdth=None, wght=900):
    f = ImageFont.truetype(file, round(px))
    if wdth is not None:
        f.set_variation_by_axes([wght, wdth])
    return f


def archivo_cap(cap, wdth):
    return font(ARCHIVO, cap / V['fonts']['archivo_cap_em'], wdth)


def franklin_cap(cap):
    return font(FRANKLIN, cap / V['fonts']['board']['cap_em'])


def down(layer2x):
    return layer2x.convert('RGBa').resize((layer2x.width // S2, layer2x.height // S2), Image.LANCZOS).convert('RGBA')


def blank(scale=1):
    return Image.new('RGBA', (W * scale, H * scale), (0, 0, 0, 0))


def over(base, top):
    return Image.alpha_composite(base.convert('RGBA'), top)


def solid(alpha, color, opacity=1.0):
    lay = Image.new('RGBA', alpha.size, tuple(color) + (0,))
    lay.putalpha(alpha.point(lambda v: round(v * opacity)))
    return lay


def shift(im, dx, dy):
    out = Image.new(im.mode, im.size, 0 if im.mode == 'L' else (0, 0, 0, 0))
    out.paste(im, (dx, dy))
    return out


def alpha_of(layer):
    return layer.split()[3]


def ink_w(text, f):
    b = f.getbbox(text, anchor='ls')
    return b[2] - b[0]


def text_sprite(text, f, fill):
    bb = f.getbbox(text, anchor='ls')
    im = Image.new('RGBA', (bb[2] - bb[0], bb[3] - bb[1]), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((-bb[0], -bb[1]), text, font=f, fill=fill, anchor='ls')
    return im


def place_text(canvas2x, text, f, fill, x, baseline, align='left'):
    """Set text so its ink starts (left) or ends (right) at x on the baseline (1x coords); returns the 1x ink box."""
    bb = f.getbbox(text, anchor='ls')
    X = x * S2 - bb[0] if align == 'left' else x * S2 - bb[2]
    ImageDraw.Draw(canvas2x).text((X, baseline * S2), text, font=f, fill=fill, anchor='ls')
    return tuple(round(v / S2, 1) for v in (X + bb[0], baseline * S2 + bb[1], X + bb[2], baseline * S2 + bb[3]))


def halo(layer, blur=4, dy=4, opacity=0.5):
    a = alpha_of(layer)
    h1 = solid(a.filter(ImageFilter.GaussianBlur(1)), (0, 0, 0), opacity)
    h2 = solid(shift(a, 0, dy).filter(ImageFilter.GaussianBlur(blur)), (0, 0, 0), opacity)
    return over(over(h2, h1), layer)


def rotate(sprite, deg):
    return sprite.rotate(deg, resample=Image.BICUBIC, expand=True)


def paste_center(canvas, sprite, cx, cy):
    canvas.alpha_composite(sprite, (round(cx - sprite.width / 2), round(cy - sprite.height / 2)))


def rounded_rect(size, r, fill):
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=r, fill=fill)
    return im


def loop_mark(box, seed, stroke, pad, tilt, n=4.0):
    """A hand-style loop around box: superellipse opening top right, overshooting its start, tapering to 55 % at
    the ends, a slight wobble. Drawn at 4x, returned as a 1x RGBA layer in the accent colour."""
    rnd = random.Random(seed)
    K = 4
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 + pad[0], (y1 - y0) / 2 + pad[1]
    im = Image.new('RGBA', (W * K, H * K), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    steps, start, sweep = 900, math.radians(-28), math.radians(372)
    t0 = rnd.random() * 10
    tr = math.radians(tilt)
    pts = []
    for i in range(steps + 1):
        u = i / steps
        a = start + sweep * u
        c, s = math.cos(a), math.sin(a)
        ex, ey = math.copysign(abs(c) ** (2 / n), c), math.copysign(abs(s) ** (2 / n), s)
        wob = 1 + 0.018 * math.sin(3 * a + t0) + 0.01 * math.sin(7 * a + 2 * t0)
        drift = 1 + 0.05 * u
        px, py = ex * rx * wob * drift, -ey * ry * wob * drift
        qx, qy = cx + px * math.cos(tr) - py * math.sin(tr), cy + px * math.sin(tr) + py * math.cos(tr)
        w = stroke * (0.55 + 0.45 * math.sin(math.pi * min(1, u * 1.15)) ** 0.6)
        pts.append((qx * K, qy * K, w * K / 2))
    for (ax, ay, ar), (bx, by, br) in zip(pts, pts[1:]):
        n_st = max(2, int(math.hypot(bx - ax, by - ay) / 3))
        for k in range(n_st):
            f = k / n_st
            x, y, r = ax + (bx - ax) * f, ay + (by - ay) * f, ar + (br - ar) * f
            d.ellipse((x - r, y - r, x + r, y + r), fill=ACCENT + (255,))
    return im.convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA')


# ------------------------------------------------------------------ words
def check_words(spec):
    """No commas, no em or en dashes, caps, the allowed punctuation only, the word counts per element."""
    w = V['words']
    bad = []
    fields = {k: spec.get(k) for k in ('support', 'hero', 'sticker')}
    if not fields['hero']:
        bad.append({'field': 'hero', 'problem': 'missing'})
    for k, v in fields.items():
        if not v:
            continue
        txt = str(v)
        for ch in txt:
            if ch in w['banned_chars']:
                bad.append({'field': k, 'text': txt, 'problem': f'banned character {ch!r} (no commas, no em or en dashes)'})
            elif not (ch.isalnum() or ch == ' ' or ch in w['punctuation']):
                bad.append({'field': k, 'text': txt, 'problem': f'character {ch!r} is outside the thumbnail punctuation'})
        n = len(txt.split())
        if n > w['max_words'][k]:
            bad.append({'field': k, 'text': txt, 'problem': f'{n} words (at most {w["max_words"][k]})'})
    total = sum(len(str(v).split()) for v in fields.values() if v)
    if total > w['max_total_words']:
        bad.append({'field': '*', 'problem': f'{total} words in all (at most {w["max_total_words"]})'})
    if bad:
        raise WordsReject({'id': spec.get('id'), 'look': spec.get('look'), 'problems': bad,
                           'action': 'back to hook-maker for new words'})
    return {k: (str(v).upper() if v else None) for k, v in fields.items()}


def letters_to_cut(over_px, role):
    per = V['copyfit']['px_per_letter'].get(role, 60)
    return -(-int(math.ceil(over_px)) // per)


def is_number(s):
    s = (s or '').replace(' ', '')
    allowed = set(V['looks']['wall']['number']['chars'])
    return 1 <= len(s) <= 5 and any(c.isdigit() for c in s) and all(c in allowed for c in s)


# ------------------------------------------------------------------ inputs
def resolve(spec, base):
    """The pair folder `thumb.py prepare` wrote for this option, and its pair.json."""
    pair_dir = (Path(base) / spec['pair_dir']).resolve()
    meta = json.loads((pair_dir / 'pair.json').read_text())
    if not meta.get('face'):
        raise Unplayable({'id': spec.get('id'), 'look': spec.get('look'), 'pair': meta.get('id'),
                          'reason': f"no clear face was found in the photo {meta.get('name') or meta.get('id')}"})
    return pair_dir, meta


def deepen(rgb, min_c):
    """rgb mixed toward the palette's ink until white type on it reaches min_c:1 (it stays as is when it does)."""
    for k in range(0, 18):
        c = mix(rgb, NAVY, k * 0.05)
        if contrast(WHITE, c) >= min_c:
            return c
    return mix(rgb, NAVY, 0.85)


def backdrop(pair_dir, cx, cy):
    """The call's and the wall's background: the studio's brand image (plate.png) when it has one, cropped to fill
    and graded; otherwise drawn from the palette: the primary deepened until white type reads on it, lit around the
    person's head, darker toward the edges. Returns (rgb image, graded): a drawn backdrop keeps its exact colours."""
    p = pair_dir / 'plate.png'
    if p.exists():
        im = Image.open(p).convert('RGB')
        s = max(W / im.width, H / im.height)
        im = im.resize((math.ceil(im.width * s), math.ceil(im.height * s)), Image.LANCZOS)
        x0, y0 = (im.width - W) // 2, (im.height - H) // 2
        return im.crop((x0, y0, x0 + W, y0 + H)), False
    B = V['backdrop']
    base = deepen(HARBOR, B['white_contrast_min'])
    edge = mix(base, NAVY, B['edge_toward_ink'])
    lit = mix(base, WHITE, B['lit_toward_paper'])
    im = Image.new('RGB', (W, H), edge)
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse((cx - B['lit_rx'], cy - B['lit_ry'], cx + B['lit_rx'], cy + B['lit_ry']), fill=255)
    im = Image.composite(Image.new('RGB', (W, H), base), im, m.filter(ImageFilter.GaussianBlur(B['lit_rx'] * 0.45)))
    m2 = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m2).ellipse((cx - B['lit_rx'] * 0.5, cy - B['lit_ry'] * 0.5, cx + B['lit_rx'] * 0.5, cy + B['lit_ry'] * 0.5), fill=255)
    im = Image.composite(Image.new('RGB', (W, H), lit), im, m2.filter(ImageFilter.GaussianBlur(B['lit_rx'] * 0.35)))
    return im, True


def board_colour(min_c):
    """The board: the primary as it is when ink type reads on it at min_c:1, else deepened until white type does."""
    if contrast(INK, HARBOR) >= min_c:
        return HARBOR, INK, 'ink'
    return deepen(HARBOR, min_c), WHITE, 'white'


BOARD, ON_BOARD, ON_BOARD_NAME = board_colour(V['backdrop']['white_contrast_min'])


def face_box_from(meta, scale, ox, oy, bb):
    f = meta['face']
    x0 = ox + (f['x'] - bb[0]) * scale
    y0 = oy + (f['y'] - bb[1]) * scale
    return [round(x0, 1), round(y0, 1), round(x0 + f['w'] * scale, 1), round(y0 + f['h'] * scale, 1)]


def face_ellipse_mask(fbox, grow_px=24):
    m = Image.new('L', (W, H), 0)
    x0, y0, x1, y1 = fbox
    ImageDraw.Draw(m).ellipse((x0 - grow_px, y0 - grow_px * 1.6, x1 + grow_px, y1 + grow_px), fill=255)
    return m.filter(ImageFilter.GaussianBlur(6))


def person_layer(meta, pair_dir, target, black=None):
    """The host from the cutout at the look's head size, with global tone only.
    Returns dict(layer RGBA graded, alpha, ref RGBA global-only reference, face_box, head, mode, ...)."""
    if meta.get('mode') != 'cutout' or not (pair_dir / 'person.png').exists():
        raise Unplayable({'reason': 'no cutout of this photo could be made, so only the board can play it (with the plain photo as its print)'})
    head, cx, crown = target['head'], target['cx'], target['crown']
    P = V['person']
    anchor = meta['anchor']
    src = Image.open(pair_dir / 'person.png').convert('RGBA')
    scale = head / meta['head_px']
    placed = tone.place(src, (anchor['src_cx'], anchor['src_crown']), scale, (cx, crown))
    bb = src.split()[3].getbbox()
    ox = cx - (anchor['src_cx'] - bb[0]) * scale
    oy = crown - (anchor['src_crown'] - bb[1]) * scale
    fbox = face_box_from(meta, scale, ox, oy, bb)
    black = black or P['default_black']
    r = P['refine']
    lay = tone.refine(placed, choke=r['choke'], feather=r['feather'], bg=P['decontam'], band_px=P['band_px'])
    lay, lifts = tone.match_blacks(lay, plate_black=black, return_lifts=True)
    ref = tone.match_blacks(placed, lifts=lifts)
    rgb = tone.look(lay.convert('RGB'))
    a = lay.split()[3]
    rgb.putalpha(a)
    rref = tone.look(ref.convert('RGB'))
    rref.putalpha(ref.split()[3])
    return {'layer': rgb, 'alpha': a, 'ref': rref, 'face_box': fbox, 'head': round(head, 1), 'cx': cx, 'crown': crown,
            'scale': round(scale, 5), 'mode': 'cutout', 'mirrored': False, 'rotated': False, 'wrap': 0.12, 'wrap_radius': 8}


def photo_print(meta, pair_dir, inner, head_target):
    """No cutout: the plain photo fills the print's inside, scaled so the head is head_target px where the photo
    allows it, the face centred, never mirrored or rotated. Global grade only, so the face lock holds."""
    photo = Image.open(pair_dir / 'photo.png').convert('RGB')
    ix0, iy0, ix1, iy1 = inner
    iw, ih = ix1 - ix0, iy1 - iy0
    f = meta['face']
    scale = max(head_target / meta['head_px'], iw / photo.width, ih / photo.height)
    pw, ph = photo.width * scale, photo.height * scale
    ox = ix0 + iw / 2 - (f['x'] + f['w'] / 2) * scale
    oy = iy0 + 0.1 * ih - meta['anchor']['src_crown'] * scale
    ox = min(ix0, max(ix1 - pw, ox))
    oy = min(iy0, max(iy1 - ph, oy))
    big = tone.look(photo.resize((round(pw), round(ph)), Image.LANCZOS))
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    layer.paste(big, (round(ox), round(oy)))
    a = Image.new('L', (W, H), 0)
    ImageDraw.Draw(a).rectangle((ix0, iy0, ix1 - 1, iy1 - 1), fill=255)
    layer.putalpha(a)
    fbox = [round(ox + f['x'] * scale, 1), round(oy + f['y'] * scale, 1),
            round(ox + (f['x'] + f['w']) * scale, 1), round(oy + (f['y'] + f['h']) * scale, 1)]
    return {'layer': layer, 'alpha': a, 'ref': layer.copy(), 'face_box': fbox, 'head': round(meta['head_px'] * scale, 1),
            'cx': round(ox + meta['anchor']['src_cx'] * scale, 1), 'crown': round(oy + meta['anchor']['src_crown'] * scale, 1),
            'scale': round(scale, 5), 'mode': 'photo', 'mirrored': False, 'rotated': False, 'wrap': 0, 'wrap_radius': 0}


def comp_person(base_rgb, mk):
    """The host over the scene, light wrap at the edge only (cutout mode), the face ellipse kept to their own pixels."""
    a = mk['alpha']
    comp = base_rgb.copy()
    comp.paste(mk['layer'].convert('RGB'), (0, 0), a)
    if mk['mode'] != 'cutout' or not mk['wrap']:
        return comp
    plain = comp.copy()
    wrapped = tone.light_wrap(comp, a, base_rgb.filter(ImageFilter.GaussianBlur(14)), radius=mk['wrap_radius'],
                              strength=mk['wrap'])
    return Image.composite(plain, wrapped, ImageChops.multiply(face_ellipse_mask(mk['face_box']), a))


def glow(img, cx, cy, rx, ry, lift, tint=(1.0, 1.0, 1.02)):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(max(rx, ry) * 0.45))
    add = Image.merge('RGB', [m.point(lambda v, t=t: round(v / 255 * lift * t)) for t in tint])
    return ImageChops.add(img, add)


def edge_burn(img, side, width, floor):
    ramp = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(ramp)
    for i in range(width):
        v = round(255 * (floor + (1 - floor) * (i / width) ** 1.6))
        x = W - 1 - i if side == 'right' else i
        d.line((x, 0, x, H), fill=v)
    return Image.merge('RGB', [ImageChops.multiply(ch, ramp) for ch in img.split()])


def top_burn(img, floor, slope):
    burn = Image.linear_gradient('L').resize((W, H)).point(lambda v: round(255 * (floor + (1 - floor) * min(1, v / 255 * slope))))
    return Image.merge('RGB', [ImageChops.multiply(ch, burn) for ch in img.split()])


def navy_shadows(img, k):
    lum = img.convert('L')
    w = lum.point(lambda v: round(255 * max(0, 1 - v / 70) * k))
    return Image.composite(Image.new('RGB', img.size, NAVY), img, w)


def grade_plate(img, drawn):
    """A brand image gets the thumbnail grade; a drawn backdrop keeps the palette's exact colours."""
    return img if drawn else tone.look(img)


# ------------------------------------------------------------------ the record of every element
class Frame:
    """Collects the layers the gates need: masks per role, for the accent, and per text element."""

    def __init__(self):
        self.elements = []
        self.masks = {k: Image.new('L', (W, H), 0) for k in ('graphics', 'front', 'front_solid', 'mark', 'accent', 'type', 'photo')}

    def add(self, name, layer, role, plane, colour=None, text=None, cap=None, font_name=None, surface=None, box=None):
        a = alpha_of(layer).point(lambda v: 255 if v > 8 else 0)
        if role != 'photo':
            self.masks['graphics'] = ImageChops.lighter(self.masks['graphics'], a)
        else:
            self.masks['photo'] = ImageChops.lighter(self.masks['photo'], a)
        if plane == 'front':
            self.masks['front'] = ImageChops.lighter(self.masks['front'], a)
            if role != 'shadow':
                self.masks['front_solid'] = ImageChops.lighter(self.masks['front_solid'], a)
        if colour == 'accent':
            self.masks['accent'] = ImageChops.lighter(self.masks['accent'], a)
        if role == 'mark':
            self.masks['mark'] = ImageChops.lighter(self.masks['mark'], a)
        if role == 'text':
            self.masks['type'] = ImageChops.lighter(self.masks['type'], a)
        e = {'name': name, 'role': role, 'plane': plane, 'colour': colour, 'text': text, 'cap_px': cap,
             'font': font_name, 'surface': surface, 'box': list(box) if box else (list(a.getbbox()) if a.getbbox() else None)}
        if role == 'text':
            e['mask'] = name
            self.text_masks = getattr(self, 'text_masks', {})
            self.text_masks[name] = a
        self.elements.append(e)
        return e


# ------------------------------------------------------------------ the looks
def side_of(meta):
    return 'L' if str(meta.get('side') or 'R').upper().startswith('L') else 'R'     # where the person sits


def person_target(look_cfg, side):
    m = look_cfg['person']
    cx = m['cx'][side] if isinstance(m['cx'], dict) else m['cx']
    return {'head': m['head'], 'cx': cx, 'crown': m['crown']}


def load_guest(spec, base):
    g = spec.get('guest_frame')
    if not g:
        return None
    if isinstance(g, str):
        gp = (Path(base) / g).resolve()
        g = json.loads(gp.read_text())
        g['_dir'] = str(gp.parent)
    img = Path(g['image'])
    if not img.is_absolute():
        img = Path(g.get('_dir', base)) / img
    g['_image'] = str(img)
    return g


def _prepare(spec, base_dir, fit_only):
    look = spec.get('look')
    if look not in LOOKS:
        raise ValueError(f"look must be one of {', '.join(LOOKS)}, got {look!r}")
    words = check_words(spec)
    pair_dir, meta = resolve(spec, base_dir)
    return {'spec': spec, 'words': words, 'meta': meta, 'pair_dir': pair_dir,
            'side': side_of(meta), 'cid': spec['id'], 'base': Path(base_dir), 'fit_only': fit_only}


def _dispatch(ctx):
    look = ctx['spec']['look']
    try:
        return {'call': render_call, 'wall': render_wall, 'board': render_board}[look](ctx)
    except Unplayable as e:
        e.payload = {'id': ctx['cid'], 'look': look, 'pair': ctx['meta'].get('id'), **e.payload,
                     'action': 'pick another look for this photo, or another photo'}
        raise


def render_to(spec, base_dir, out_dir):
    """Render one option to out_dir. Raises CopyFitReject, WordsReject or Unplayable (payloads are plain JSON)."""
    ctx = _prepare(spec, base_dir, False)
    return write(ctx, out_dir, *_dispatch(ctx))


def fit(spec, base_dir):
    """Copy-fit and playability only, no pixels written: returns {'fits': True, ...} or raises like render_to."""
    return _dispatch(_prepare(spec, base_dir, True))


def _reject_if(overs, ctx):
    if overs:
        raise CopyFitReject({'id': ctx['cid'], 'look': ctx['spec']['look'], 'over': overs,
                             'action': 'back to hook-maker for shorter words; never scale'})


def render_call(ctx):
    C = V['looks']['call']
    spec, words, meta, side = ctx['spec'], ctx['words'], ctx['meta'], ctx['side']
    if side != 'R':
        raise Unplayable({'reason': 'the call needs the person on the right (a side R photo): on the left the hero would sit in the duration-badge corner'})
    if words['sticker']:
        raise WordsReject({'id': ctx['cid'], 'look': 'call', 'problems': [{'field': 'sticker', 'text': words['sticker'],
                           'problem': 'the call carries no sticker: its hot colour is the accent loop, and the support line rides on the tag'}],
                           'action': 'drop the sticker, or render the wall or the board'})
    if not words['support']:
        raise WordsReject({'id': ctx['cid'], 'look': 'call', 'problems': [{'field': 'support', 'problem': 'the call needs a support line for the tag'}],
                           'action': 'back to hook-maker'})
    guest = load_guest(spec, ctx['base'])
    if not guest:
        raise Unplayable({'reason': 'the call needs a real guest frame from the episode (thumb.py guest-frame <video> --at <seconds>)'})
    mk_spec = spec.get('mark') or {'kind': 'loop', 'target': 'hero'}
    if mk_spec.get('kind') not in (None, 'loop') or mk_spec.get('target', 'hero') != 'hero':
        raise WordsReject({'id': ctx['cid'], 'look': 'call', 'problems': [{'field': 'mark', 'problem': 'the call takes one loop, on the hero, or none'}],
                           'action': 'fix the spec'})
    tgt = person_target(C, side)
    mk = person_layer(meta, ctx['pair_dir'], tgt)

    # copy-fit, before any pixels: the tag and the hero against their limits
    tag_f = archivo_cap(C['tag']['cap'] * S2, C['tag']['wdth'])
    hero_f = archivo_cap(C['hero']['cap'] * S2, C['hero']['wdth'])
    overs = []
    tw = ink_w(words['support'], tag_f) / S2 + 2 * C['tag']['pad_x']
    if tw > C['tag']['max_w']:
        overs.append({'element': 'tag', 'text': words['support'], 'measured_px': round(tw), 'limit_px': C['tag']['max_w'],
                     'overflow_px': round(tw - C['tag']['max_w']), 'letters_to_cut': letters_to_cut(tw - C['tag']['max_w'], 'tag')})
    hb = hero_f.getbbox(words['hero'], anchor='ls')
    hx0, hbase, hcap = C['hero']['x'], C['hero']['baseline'], C['hero']['cap']
    band = mk['alpha'].crop((0, hbase - hcap - 30, W, hbase + 20)).point(lambda v: 255 if v > 128 else 0)
    cols = band.getbbox()
    person_x0 = cols[0] if cols else W
    loop_on = mk_spec.get('kind') == 'loop'
    limit = person_x0 - (C['loop']['pad'][0] + C['loop']['stroke'] + C['hero']['clear_person'] if loop_on else C['hero']['clear_person']) - hx0
    hw = (hb[2] - hb[0]) / S2
    if hw > limit:
        overs.append({'element': 'hero', 'text': words['hero'], 'measured_px': round(hw), 'limit_px': round(limit),
                     'overflow_px': round(hw - limit), 'letters_to_cut': letters_to_cut(hw - limit, 'hero')})
    _reject_if(overs, ctx)
    if ctx['fit_only']:
        return {'id': ctx['cid'], 'look': 'call', 'fits': True, 'person_mode': mk['mode']}

    fr = Frame()
    pc = C['plate']
    plate, drawn = backdrop(ctx['pair_dir'], tgt['cx'], tgt['crown'] + tgt['head'] * 0.6)
    base = glow(plate, pc['glow']['cx'], pc['glow']['cy'], pc['glow']['rx'], pc['glow']['ry'], pc['glow']['lift'])
    base = edge_burn(base, pc['edge_burn']['side'], pc['edge_burn']['width'], pc['edge_burn']['floor'])
    base = navy_shadows(base, pc['navy'])
    base = grade_plate(base, drawn)

    # the guest's call window
    wc = C['window']
    gimg = Image.open(guest['_image']).convert('RGB')
    gx0, gy0, gx1, gy1 = guest['face']
    fw = gx1 - gx0
    det = guest.get('detector') or '_default'
    pick = lambda v: v.get(det, v['_default']) if isinstance(v, dict) else v      # face boxes differ by detector
    cw = fw * pick(wc['crop']['width_per_face'])
    ch = cw / wc['crop']['aspect']
    cx0 = (gx0 + gx1) / 2 - cw * wc['crop']['face_x']
    cy0 = (gy0 + gy1) / 2 - ch * pick(wc['crop']['face_y'])
    cx0 = max(0, min(gimg.width - cw, cx0))
    cy0 = max(0, min(gimg.height - ch, cy0))
    if cw > gimg.width or ch > gimg.height:
        raise Unplayable({'reason': f'the guest face is too big in the frame for the call window (face {fw:.0f} px wide)'})
    crop = gimg.crop((round(cx0), round(cy0), round(cx0 + cw), round(cy0 + ch)))
    crop = window_grade(crop, wc['grade'])
    content_w = wc['content_w']
    content_h = round(content_w * crop.height / crop.width)
    sc = content_w / crop.width
    tile = crop.resize((content_w, content_h), Image.LANCZOS)
    bd = wc['border']
    win = Image.new('RGBA', (content_w + 2 * bd, content_h + 2 * bd), WHITE + (255,))
    win.paste(tile, (bd, bd))
    win2 = rotate(win.resize((win.width * S2, win.height * S2), Image.LANCZOS), wc['tilt'])
    wl2 = blank(S2)
    paste_center(wl2, win2, wc['center'][0] * S2, wc['center'][1] * S2)
    win_layer = down(wl2)
    wa = alpha_of(win_layer)
    # the guest's face box in canvas coords (through the crop, the scale, the border and the tilt)
    gfb = _rot_box([(gx0 - cx0) * sc + bd, (gy0 - cy0) * sc + bd, (gx1 - cx0) * sc + bd, (gy1 - cy0) * sc + bd],
                   (win.width, win.height), wc['tilt'], wc['center'])
    wsh = solid(shift(wa, *wc['shadow']), INK)
    fr.add('window_shadow', wsh, 'shadow', 'back')
    fr.add('window', win_layer, 'photo', 'back', surface='white')
    scene = over(over(base, wsh), win_layer)
    ms = C['person_shadow']
    sh = ImageChops.multiply(shift(mk['alpha'], ms['dx'], ms['dy']).filter(ImageFilter.GaussianBlur(ms['blur'])), wa)
    scene = over(scene, solid(sh, INK, ms['opacity']))
    pregrain = comp_person(scene.convert('RGB'), mk).convert('RGBA')

    # the tag (support), white on ink, taped over the window's top-left corner
    tc = C['tag']
    t = text_sprite(words['support'], tag_f, WHITE + (255,))
    tagw, tagh = t.width + 2 * tc['pad_x'] * S2, (tc['cap'] + 2 * tc['pad_y']) * S2
    tag = Image.new('RGBA', (tagw, tagh), INK + (255,))
    tag.alpha_composite(t, (tc['pad_x'] * S2, (tagh - t.height) // 2))
    txt_only = Image.new('RGBA', (tagw, tagh), (0, 0, 0, 0))
    txt_only.alpha_composite(t, (tc['pad_x'] * S2, (tagh - t.height) // 2))
    tag_l2, tt_l2 = blank(S2), blank(S2)
    cxp = tc['center'][0] * S2 - (C['tag']['max_w'] * S2 - tagw) / 2 * tc.get('anchor_left', 0)
    paste_center(tag_l2, rotate(tag, tc['tilt']), cxp, tc['center'][1] * S2)
    paste_center(tt_l2, rotate(txt_only, tc['tilt']), cxp, tc['center'][1] * S2)
    tag_layer, tag_text = down(tag_l2), down(tt_l2)
    fr.add('tag', tag_layer, 'tag', 'front', colour='ink', surface='ink')
    fr.add('support', tag_text, 'text', 'front', colour='white', text=words['support'], cap=tc['cap'], font_name='Archivo',
           surface='ink')
    pregrain = over(pregrain, tag_layer)

    # the hero, white, in front, one accent loop
    h2 = blank(S2)
    hbox = place_text(h2, words['hero'], hero_f, WHITE + (255,), hx0, hbase)
    hero = down(h2)
    fr.add('hero', hero, 'text', 'front', colour='white', text=words['hero'], cap=hcap, font_name='Archivo', surface='photo')
    hero_h = halo(hero)
    fr.add('hero_halo', solid(alpha_of(hero_h), (0, 0, 0), 1.0), 'shadow', 'front')
    pregrain = over(pregrain, hero_h)
    mark = {'kind': None}
    if loop_on:
        lp = C['loop']
        loop = loop_mark(hbox, mk_spec.get('seed', ctx['cid']), lp['stroke'], lp['pad'], lp['tilt'])
        loop.putalpha(ImageChops.multiply(alpha_of(loop), ImageChops.invert(face_ellipse_mask(mk['face_box'], 40))))
        fr.add('loop', loop, 'mark', 'front', colour='accent')
        pregrain = over(pregrain, loop)
        mark = {'kind': 'loop', 'target': 'hero', 'seed': mk_spec.get('seed', ctx['cid']), 'placeholder': True,
                'source': 'generator'}
    guest_rec = {'face_box': gfb, 'image': guest['_image'], 'source': {k: guest.get(k) for k in
                 ('video', 'at', 'picked_t', 'detector', 'score', 'sha256')}, 'window_box': list(wa.getbbox())}
    return pregrain, fr, mk, {'look': 'call', 'mark': mark, 'guest': guest_rec, 'hot': 'accent' if loop_on else None}


def _rot_box(box, size, deg, center):
    """A box inside a sprite of `size`, rotated by deg (PIL, counter-clockwise, expand) and pasted centred at center."""
    w, h = size
    a = math.radians(deg)
    pts = [(box[0], box[1]), (box[2], box[1]), (box[0], box[3]), (box[2], box[3])]
    out = []
    for x, y in pts:
        dx, dy = x - w / 2, y - h / 2
        rx = dx * math.cos(a) + dy * math.sin(a)
        ry = -dx * math.sin(a) + dy * math.cos(a)
        out.append((center[0] + rx, center[1] + ry))
    xs, ys = [p[0] for p in out], [p[1] for p in out]
    return [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]


def window_grade(crop, g):
    """The guest's webcam frame: a modest grey-world balance (gains within +-wb_max), a little less saturation, a
    little more contrast, highlights rolled off so a blown wall is not the brightest thing in the frame."""
    st = ImageStat.Stat(crop).mean
    mean = sum(st) / 3
    gains = [max(1 - g['wb_max'], min(1 + g['wb_max'], mean / max(c, 1))) for c in st]
    crop = Image.merge('RGB', [ch.point(lambda v, k=k: min(255, round(v * k))) for ch, k in zip(crop.split(), gains)])
    crop = ImageEnhance.Color(crop).enhance(g['sat'])
    crop = ImageEnhance.Contrast(crop).enhance(g['contrast'])
    crop = ImageEnhance.Brightness(crop).enhance(g['brightness'])
    knee, k = g['knee'], g['knee_k']
    return crop.point(lambda v: round(v if v < knee else knee + (v - knee) * k))


def render_wall(ctx):
    C = V['looks']['wall']
    words, meta, side = ctx['words'], ctx['meta'], ctx['side']
    num = words['hero'].replace(' ', '')
    if not is_number(num):
        raise Unplayable({'reason': f"the wall needs a number of 1 to 5 characters as the hero ({words['hero']!r} is not one)"})
    if not words['support']:
        raise WordsReject({'id': ctx['cid'], 'look': 'wall', 'problems': [{'field': 'support', 'problem': 'the wall needs a support word in front of the number'}],
                           'action': 'back to hook-maker'})
    mk_spec = ctx['spec'].get('mark') or {}
    if mk_spec.get('kind'):
        raise WordsReject({'id': ctx['cid'], 'look': 'wall', 'problems': [{'field': 'mark', 'problem': 'the wall carries no loop: its hot colour is the accent sticker'}],
                           'action': 'drop the mark'})
    tgt = person_target(C, side)
    mk = person_layer(meta, ctx['pair_dir'], tgt)
    person_left = side == 'L'                     # side L photo: the person on the left, the words on the right
    sgn = 1 if person_left else -1
    fb = mk['face_box']
    face_far = fb[2] if person_left else fb[0]    # the face edge toward the text
    n = len(num)
    arr = 'tall' if n <= C['tall_max_len'] else 'wide'
    A = C[arr]
    ncap = C['number']['cap_by_len'][str(n)]
    nf = archivo_cap(ncap * S2, C['number']['wdth'])
    nb = nf.getbbox(num, anchor='ls')
    nw = (nb[2] - nb[0]) / S2
    sup_f = archivo_cap(A['support']['cap'] * S2, A['support']['wdth'])
    stk_f = archivo_cap(A['sticker']['cap'] * S2, A['sticker']['wdth']) if words['sticker'] else None
    clear = C['face_clear']
    outer = A['support']['edge']
    overs = []
    # the support word: from the outer margin toward the person, ending clear of the face
    sw = ink_w(words['support'], sup_f) / S2
    lim = (outer - (face_far + clear)) if person_left else ((face_far - clear) - (W - outer))
    if sw > lim:
        overs.append({'element': 'support', 'text': words['support'], 'measured_px': round(sw), 'limit_px': round(lim),
                     'overflow_px': round(sw - lim), 'letters_to_cut': letters_to_cut(sw - lim, 'support')})
    if arr == 'wide' and nw > W - 2 * C['wide']['margin']:
        lim_n = W - 2 * C['wide']['margin']
        overs.append({'element': 'number', 'text': num, 'measured_px': round(nw), 'limit_px': lim_n,
                     'overflow_px': round(nw - lim_n), 'letters_to_cut': letters_to_cut(nw - lim_n, 'number')})
    stk = None
    if words['sticker']:
        sc = A['sticker']
        t = text_sprite(words['sticker'], stk_f, ON_ACCENT + (255,))
        pw, ph = t.width + 2 * sc['pad_x'] * S2, (sc['cap'] + 2 * sc['pad_y']) * S2
        swid = pw / S2
        if sc['anchor'] == 'outer':
            slim = (sc['edge'] - (face_far + clear)) if person_left else ((face_far - clear) - (W - sc['edge']))
        else:
            gap = clear + sc.get('tilt_allowance', 0)
            slim = (sc['max_x'] - (face_far + gap)) if person_left else ((face_far - gap) - (W - sc['max_x']))
        if swid > slim:
            overs.append({'element': 'sticker', 'text': words['sticker'], 'measured_px': round(swid), 'limit_px': round(slim),
                         'overflow_px': round(swid - slim), 'letters_to_cut': letters_to_cut(swid - slim, 'sticker')})
        stk = (t, pw, ph)
    _reject_if(overs, ctx)

    # the number's placement and the occlusion rule (searched by moving it, never by scaling it)
    num_top = C['number']['top']
    num_base = num_top + ncap
    # the number's near edge starts under the head's far edge and moves away from the person until its identity holds;
    # a number too wide for that starts at the outer margin (the head then sits in front of its inner characters)
    margin = C['wide']['margin']
    start = face_far - A['overlap'] if person_left else face_far + A['overlap']
    tries = [start + sgn * k * A['search_step'] for k in range(A['search_steps'] + 1)]
    fits_in = lambda x: (x + nw <= W - margin) if person_left else (x - nw >= margin)
    tries = [x for x in tries if fits_in(x)] or [margin if person_left else W - margin]
    chosen, occ = None, None
    for x in tries:
        g2 = blank(S2)
        nbox = place_text(g2, num, nf, WHITE + (255,), x, num_base, align='left' if person_left else 'right')
        na = alpha_of(down(g2))
        occ = occlusion(num, nf, x, num_base, person_left, mk['alpha'], None)
        if occ['ok']:
            chosen = (x, nbox, na)
            break
    if not chosen:
        raise Unplayable({'reason': f"the head hides too much of {num!r} wherever it can sit: {occ['why']}", 'occlusion': occ})
    if ctx['fit_only']:
        return {'id': ctx['cid'], 'look': 'wall', 'fits': True, 'arrangement': arr, 'number_x': chosen[0], 'person_mode': mk['mode']}
    nx, nbox, na = chosen

    fr = Frame()
    pc = C['plate']
    plate, drawn = backdrop(ctx['pair_dir'], tgt['cx'], tgt['crown'] + tgt['head'] * 0.6)
    base = top_burn(plate, pc['top_burn']['floor'], pc['top_burn']['slope'])
    base = glow(base, mk['cx'] + sgn * pc['glow']['dx'], pc['glow']['cy'], pc['glow']['rx'], pc['glow']['ry'], pc['glow']['lift'])
    base = edge_burn(base, 'left' if person_left else 'right', pc['edge_burn']['width'], pc['edge_burn']['floor'])
    base = navy_shadows(base, pc['navy'])
    base = grade_plate(base, drawn)
    # the number, lightest near the head
    ramp = Image.new('L', (W, H))
    dr = ImageDraw.Draw(ramp)
    hi, lo = C['number']['fill']
    span = max(1.0, nbox[2] - nbox[0])
    for x in range(W):
        u = (x - nbox[0]) / span if person_left else (nbox[2] - x) / span
        dr.line((x, 0, x, H), fill=round(hi - max(0, min(1, u)) * (hi - lo)))
    numc = Image.merge('RGBA', [ramp, ramp, ramp.point(lambda v: min(255, v + 3)), na])
    numh = halo(numc, blur=6, dy=6, opacity=0.45)
    fr.add('number', numc, 'text', 'back', colour='white', text=num, cap=ncap, font_name='Archivo', surface='photo')
    scene = over(base, numh)
    cs = C['number']['cast_shadow']
    sh = ImageChops.multiply(shift(mk['alpha'], sgn * cs['dx'], cs['dy']).filter(ImageFilter.GaussianBlur(cs['blur'])), na)
    scene = over(scene, solid(sh, INK, cs['opacity']))
    pregrain = comp_person(scene.convert('RGB'), mk).convert('RGBA')

    # the support word in front, cut out of the number by a dark glow and a hard ink shadow
    s2 = blank(S2)
    sbox = place_text(s2, words['support'], sup_f, WHITE + (255,), outer if person_left else W - outer,
                      A['support']['baseline'], align='right' if person_left else 'left')
    sup = down(s2)
    sg = C['support_glow']
    ga = alpha_of(sup).filter(ImageFilter.MaxFilter(sg['grow'])).filter(ImageFilter.GaussianBlur(sg['blur']))
    gl = solid(ImageChops.multiply(ga, na), INK, sg['opacity'])
    ss = C['support_shadow']
    shd = solid(shift(alpha_of(sup), ss[0] * sgn, ss[1]), INK, ss[2])
    fr.add('support_shadow', over(gl, shd), 'shadow', 'front')
    fr.add('support', sup, 'text', 'front', colour='white', text=words['support'], cap=A['support']['cap'], font_name='Archivo',
           surface='photo')
    pregrain = over(over(over(pregrain, gl), shd), halo(sup))

    # the sticker: the accent, type in ink or white (whichever reads), hard ink shadow, tilted, anchored to the outer margin
    if stk:
        sc = A['sticker']
        t, pw, ph = stk
        st = rounded_rect((pw, ph), sc['radius'] * S2, ACCENT + (255,))
        st.alpha_composite(t, (sc['pad_x'] * S2, (ph - t.height) // 2))
        stt = Image.new('RGBA', (pw, ph), (0, 0, 0, 0))
        stt.alpha_composite(t, (sc['pad_x'] * S2, (ph - t.height) // 2))
        tilt = sc['tilt'] * sgn
        rst, rtt = rotate(st, tilt), rotate(stt, tilt)
        if sc['anchor'] == 'outer':
            scx = (sc['edge'] - pw / S2 / 2) if person_left else (W - sc['edge'] + pw / S2 / 2)
        else:
            gap = clear + sc.get('tilt_allowance', 0)
            scx = (face_far + gap + pw / S2 / 2) if person_left else (face_far - gap - pw / S2 / 2)
        scy = sc['cy']
        l2, t2 = blank(S2), blank(S2)
        paste_center(l2, rst, scx * S2, scy * S2)
        paste_center(t2, rtt, scx * S2, scy * S2)
        stl, stx = down(l2), down(t2)
        ssh = solid(shift(alpha_of(stl), sc['shadow'][0] * sgn, sc['shadow'][1]), INK)
        fr.add('sticker_shadow', ssh, 'shadow', 'front')
        fr.add('sticker', stl, 'sticker', 'front', colour='accent', surface='accent')
        fr.add('sticker_text', stx, 'text', 'front', colour=ON_ACCENT_NAME, text=words['sticker'], cap=sc['cap'], font_name='Archivo',
               surface='accent')
        pregrain = over(over(pregrain, ssh), stl)
    occ_full = occlusion(num, nf, nx, num_base, person_left, mk['alpha'], fr.masks['front_solid'])
    return pregrain, fr, mk, {'look': 'wall', 'mark': {'kind': None}, 'hot': 'accent' if stk else None,
                              'number': {'text': num, 'arrangement': arr, 'cap_px': ncap, 'x': nx, 'box': nbox,
                                         'occlusion': occ_full}}


def glyph_masks(num, nf, x, baseline, align_left):
    """One 1x mask per character of the number, at its real position."""
    full_b = nf.getbbox(num, anchor='ls')
    X = x * S2 - full_b[0] if align_left else x * S2 - full_b[2]
    out = []
    for i, ch in enumerate(num):
        if ch == ' ':
            continue
        pre = nf.getlength(num[:i])
        g2 = blank(S2)
        ImageDraw.Draw(g2).text((X + pre, baseline * S2), ch, font=nf, fill=(255, 255, 255, 255), anchor='ls')
        m = alpha_of(down(g2)).point(lambda v: 255 if v > 128 else 0)
        out.append((ch, m))
    return out


def occlusion(num, nf, x, baseline, align_left, person_alpha, front):
    """The wall's rule. One character: the person may hide only a sliver of one side of it (<= one_char.max_hidden of its
    ink), never its top band or its foot. Two to five: per character <= multi.max_hidden (the first and last <=
    multi.max_hidden_ends), only in the bottom part of the cap height. Front elements count toward the total."""
    R = V['looks']['wall']['occlusion']
    am = person_alpha.point(lambda v: 255 if v > 128 else 0)
    fm = front.point(lambda v: 255 if v > 128 else 0) if front is not None else None
    res = {'chars': [], 'ok': True, 'why': ''}
    gl = glyph_masks(num, nf, x, baseline, align_left)
    n = len(gl)
    for i, (ch, m) in enumerate(gl):
        ink = sum(m.histogram()[255:]) or 1
        hid = ImageChops.multiply(m, am)
        h = sum(hid.histogram()[255:])
        bb = m.getbbox()
        hb = hid.getbbox()
        rec = {'char': ch, 'person_hidden_pct': round(100 * h / ink, 1)}
        if fm is not None:
            allc = ImageChops.lighter(hid, ImageChops.multiply(m, fm))
            rec['all_hidden_pct'] = round(100 * sum(allc.histogram()[255:]) / ink, 1)
        if hb:
            rec['hidden_from_pct_of_height'] = round(100 * (hb[1] - bb[1]) / max(1, bb[3] - bb[1]), 1)
            rec['hidden_to_pct_of_height'] = round(100 * (hb[3] - bb[1]) / max(1, bb[3] - bb[1]), 1)
        if n == 1:
            r1 = R['one_char']
            gh = max(1, bb[3] - bb[1])
            top = (bb[0], bb[1], bb[2], bb[1] + round(gh * r1['top_band']))
            foot = (bb[0], bb[3] - round(gh * r1['foot_band']), bb[2], bb[3])
            def share(box):
                ink_b = sum(m.crop(box).histogram()[255:]) or 1
                return sum(hid.crop(box).histogram()[255:]) / ink_b
            rec['top_band_hidden_pct'] = round(100 * share(top), 2)
            rec['foot_hidden_pct'] = round(100 * share(foot), 2)
            mid = (bb[0] + bb[2]) / 2
            if h / ink > r1['max_hidden']:
                res.update(ok=False, why=f"{ch}: {rec['person_hidden_pct']}% hidden (max {r1['max_hidden'] * 100:g}%)")
            elif share(top) > r1['max_top_band']:
                res.update(ok=False, why=f'{ch}: the head reaches its top band')
            elif share(foot) > r1['max_foot']:
                res.update(ok=False, why=f'{ch}: the head reaches its foot')
            elif hb and ((align_left and hb[2] > mid) or (not align_left and hb[0] < mid)):
                res.update(ok=False, why=f'{ch}: hidden past its middle (only a sliver of one side may hide)')
            if fm is not None and rec.get('all_hidden_pct', 0) > r1['max_all_hidden'] * 100:
                res.update(ok=False, why=f"{ch}: {rec['all_hidden_pct']}% covered in all (max {r1['max_all_hidden'] * 100:g}%)")
        else:
            rm = R['multi']
            cap = rm['max_hidden_ends'] if i in (0, n - 1) else rm['max_hidden']
            if h / ink > cap:
                res.update(ok=False, why=f"{ch}: {rec['person_hidden_pct']}% hidden (max {cap * 100:g}%)")
            elif hb and rec['hidden_from_pct_of_height'] < (1 - rm['bottom_part']) * 100:
                res.update(ok=False, why=f'{ch}: hidden above the bottom {rm["bottom_part"] * 100:g}% of the cap height')
            if fm is not None and rec.get('all_hidden_pct', 0) > rm['max_all_hidden'] * 100:
                res.update(ok=False, why=f"{ch}: {rec['all_hidden_pct']}% covered in all (max {rm['max_all_hidden'] * 100:g}%)")
        res['chars'].append(rec)
        if not res['ok']:
            break
    return res


def render_board(ctx):
    C = V['looks']['board']
    words, meta, side = ctx['words'], ctx['meta'], ctx['side']
    mk_spec = ctx['spec'].get('mark') or {}
    if mk_spec.get('kind'):
        raise WordsReject({'id': ctx['cid'], 'look': 'board', 'problems': [{'field': 'mark', 'problem': 'the board carries no loop: its hot colour is the accent tag'}],
                           'action': 'drop the mark'})
    person_left = side == 'L'
    key = side
    P = C['print']
    fx0, fy0, fx1, fy1 = P['box'][key]
    fw_ = P['frame']
    if meta.get('mode') == 'cutout':
        mk = person_layer(meta, ctx['pair_dir'], person_target(C, key))
    else:
        mk = photo_print(meta, ctx['pair_dir'], (fx0 + fw_, fy0 + fw_, fx1 - fw_, fy1 - fw_), V['person']['photo_print_head'])
    B = C['board']
    Lc = C['lines']
    hero_cap = Lc['hero_cap']['number'] if is_number(words['hero']) and len(words['hero']) <= Lc['number_max_len'] else Lc['hero_cap']['word']
    hf = franklin_cap(hero_cap * S2)
    sf = franklin_cap(Lc['support_cap'] * S2)
    lines = [('hero', words['hero'], hf, hero_cap)]
    if words['support']:
        sl = ('support', words['support'], sf, Lc['support_cap'])
        lines = (lines + [sl]) if ctx['spec'].get('order', 'hero-first') == 'hero-first' else ([sl] + lines)
    overs = []
    for role, txt, f, cap in lines:
        w = ink_w(txt, f) / S2
        if w > Lc['max_w']:
            overs.append({'element': role, 'text': txt, 'measured_px': round(w), 'limit_px': Lc['max_w'],
                         'overflow_px': round(w - Lc['max_w']), 'letters_to_cut': letters_to_cut(w - Lc['max_w'], 'board')})
    tg = C['tag']
    tf = archivo_cap(tg['cap'] * S2, tg['wdth'])
    if words['sticker']:
        tw = ink_w(words['sticker'], tf) / S2 + 2 * tg['pad_x']
        if tw > tg['max_w']:
            overs.append({'element': 'tag', 'text': words['sticker'], 'measured_px': round(tw), 'limit_px': tg['max_w'],
                         'overflow_px': round(tw - tg['max_w']), 'letters_to_cut': letters_to_cut(tw - tg['max_w'], 'tag')})
    need_h = Lc['top'] + sum(c for _, _, _, c in lines) + Lc['gap'] * (len(lines) - 1)
    if words['sticker']:
        need_h += tg['gap'] + tg['cap'] + 2 * tg['pad_y']
    if need_h > B['h'] - Lc['bottom']:
        overs.append({'element': 'board', 'text': ' / '.join(t for _, t, _, _ in lines), 'measured_px': need_h,
                     'limit_px': B['h'] - Lc['bottom'], 'overflow_px': need_h - (B['h'] - Lc['bottom']), 'letters_to_cut': 0,
                     'note': 'too many lines for the board: drop the sticker or a line'})
    _reject_if(overs, ctx)
    if ctx['fit_only']:
        return {'id': ctx['cid'], 'look': 'board', 'fits': True, 'person_mode': mk['mode']}

    fr = Frame()
    bg = C['background']
    base = Image.new('RGB', (W, H), tuple(bg['color']))
    vig = Image.new('L', (W, H), 0)
    ImageDraw.Draw(vig).ellipse((-200, -260, W + 200, H + 260), fill=255)
    vig = ImageChops.invert(vig.filter(ImageFilter.GaussianBlur(bg['vignette_blur'])))
    base = Image.composite(Image.new('RGB', (W, H), tuple(bg['edge'])), base, vig)

    # the board, with its lines and the tag drawn on it, then tilted as one piece of card
    bw, bh = B['w'], B['h']
    board = Image.new('RGBA', (bw * S2, bh * S2), BOARD + (255,))
    txt = Image.new('RGBA', board.size, (0, 0, 0, 0))
    d, dt = ImageDraw.Draw(board), ImageDraw.Draw(txt)
    ccx = (B['visible_cx'] if person_left else bw - B['visible_cx']) * S2
    y = max(Lc['top'], (bh - need_h + Lc['top']) // 2) * S2        # centred when the block is shorter than the board
    line_recs = []
    for role, t_, f, cap in lines:
        b = f.getbbox(t_, anchor='ls')
        y += cap * S2
        for dd in (d, dt):
            dd.text((ccx - (b[0] + b[2]) / 2, y), t_, font=f, fill=ON_BOARD + (255,), anchor='ls')
        line_recs.append((role, t_, cap))
        y += Lc['gap'] * S2
    tag_text_board = tag_board = None
    if words['sticker']:
        t = text_sprite(words['sticker'], tf, ON_ACCENT + (255,))
        tw, th = t.width + 2 * tg['pad_x'] * S2, (tg['cap'] + 2 * tg['pad_y']) * S2
        tag = Image.new('RGBA', (tw, th), ACCENT + (255,))
        tag.alpha_composite(t, (tg['pad_x'] * S2, (th - t.height) // 2))
        tt = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
        tt.alpha_composite(t, (tg['pad_x'] * S2, (th - t.height) // 2))
        tcy = y - Lc['gap'] * S2 + (tg['gap'] + tg['cap'] // 2 + tg['pad_y']) * S2
        tilt = tg['tilt'] * (1 if person_left else -1)
        lay_t, lay_x = Image.new('RGBA', board.size, (0, 0, 0, 0)), Image.new('RGBA', board.size, (0, 0, 0, 0))
        rt, rx = rotate(tag, tilt), rotate(tt, tilt)
        lay_t.alpha_composite(rt, (round(ccx - rt.width / 2), round(tcy - rt.height / 2)))
        lay_x.alpha_composite(rx, (round(ccx - rx.width / 2), round(tcy - rx.height / 2)))
        sh = solid(shift(alpha_of(lay_t), tg['shadow'][0] * S2, tg['shadow'][1] * S2), tuple(tg['shadow_color']))
        board = over(over(board, sh), lay_t)
        tag_text_board, tag_board = lay_x, lay_t
    btilt = B['tilt'] * (1 if person_left else -1)
    bcx, bcy = B['center'][key]
    br2 = rotate(board, btilt)
    bl2 = blank(S2)
    paste_center(bl2, br2, bcx * S2, bcy * S2)
    bl = down(bl2)
    bsh = solid(shift(alpha_of(bl), B['shadow'][0] * (1 if person_left else -1), B['shadow'][1]), INK)
    fr.add('board_shadow', bsh, 'shadow', 'back')
    fr.add('board', bl, 'board', 'back', surface='harbor')
    t2 = blank(S2)
    paste_center(t2, rotate(txt, btilt), bcx * S2, bcy * S2)
    words_layer = down(t2)
    fr.add('board_words', words_layer, 'text', 'back', colour=ON_BOARD_NAME, text=' / '.join(t for _, t, _ in line_recs),
           cap=min(c for _, _, c in line_recs), font_name='Libre Franklin Black', surface='harbor')
    if tag_text_board is not None:
        g2 = blank(S2)
        paste_center(g2, rotate(tag_board, btilt), bcx * S2, bcy * S2)
        fr.add('tag', down(g2), 'sticker', 'back', colour='accent', surface='accent')
        x2 = blank(S2)
        paste_center(x2, rotate(tag_text_board, btilt), bcx * S2, bcy * S2)
        fr.add('tag_text', down(x2), 'text', 'back', colour=ON_ACCENT_NAME, text=words['sticker'], cap=tg['cap'],
               font_name='Archivo', surface='accent')
    out = over(over(base.convert('RGBA'), bsh), bl)

    # the print: white frame, upright (the person is never rotated). With a cutout: flat navy inside, the head breaking
    # out of the top. Without one: the plain photo fills the inside.
    frame = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rectangle((fx0, fy0, fx1, fy1), fill=WHITE + (255,))
    ImageDraw.Draw(frame).rectangle((fx0 + fw_, fy0 + fw_, fx1 - fw_, fy1 - fw_), fill=NAVY + (255,))
    psh = solid(shift(alpha_of(frame), P['shadow'][0] * (1 if person_left else -1), P['shadow'][1]), INK)
    fr.add('print_shadow', psh, 'photo', 'back')        # the print and its shadow are the photo: they may pass under the badge
    fr.add('print', frame, 'photo', 'back', surface='white')
    out = over(over(out, psh), frame)
    if mk['mode'] == 'photo':
        rgb = out.convert('RGB')
        rgb.paste(mk['layer'].convert('RGB'), (0, 0), mk['alpha'])
        pregrain = rgb.convert('RGBA')
    else:
        inner = Image.new('L', (W, H), 0)
        ImageDraw.Draw(inner).rectangle((fx0 + fw_, fy0 + fw_, fx1 - fw_, fy1 - fw_), fill=255)
        above = Image.new('L', (W, H), 0)
        ImageDraw.Draw(above).rectangle((0, 0, W, fy0 + fw_ + P['break_px']), fill=255)
        headonly = Image.new('L', (W, H), 0)
        fb = mk['face_box']
        ImageDraw.Draw(headonly).ellipse((fb[0] - 70, mk['crown'] - 30, fb[2] + 70, fy0 + fw_ + 60), fill=255)
        keep = ImageChops.lighter(inner, ImageChops.multiply(above, headonly))
        a2 = ImageChops.multiply(mk['alpha'], keep)
        brk = ImageChops.multiply(a2, ImageChops.invert(inner))
        hs = P['head_shadow']
        out = over(out, solid(shift(brk, hs[0] * (1 if person_left else -1), hs[1]).filter(ImageFilter.GaussianBlur(0.8)), INK, hs[2]))
        rgb = out.convert('RGB')
        rgb.paste(mk['layer'].convert('RGB'), (0, 0), a2)
        mk = dict(mk, alpha=a2)
        pregrain = rgb.convert('RGBA')
    return pregrain, fr, mk, {'look': 'board', 'mark': {'kind': None}, 'hot': 'accent' if words['sticker'] else None,
                              'board': {'box': list(alpha_of(bl).getbbox()), 'lines': [t for _, t, _ in line_recs],
                                        'hero_cap': hero_cap}}


# ------------------------------------------------------------------ writing it all out
def write(ctx, out_dir, pregrain, fr, mk, info):
    cid = ctx['cid']
    out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    pre = pregrain.convert('RGB')
    pre.save(out / f'{cid}-pregrain.png')
    g = T['grade']
    final = tone.grain(pre, g['grain_sigma'], g['grain_deep_below'], g['grain_deep_k'])
    final.save(out / f'{cid}.png')
    for q in T['canvas']['jpeg_quality']:
        final.save(out / f'{cid}.jpg', quality=q, subsampling=0)
        if (out / f'{cid}.jpg').stat().st_size < T['canvas']['max_bytes']:
            break
    mk['alpha'].save(out / f'{cid}-person.png')
    mk['ref'].save(out / f'{cid}-person-ref.png')
    for k, m in fr.masks.items():
        m.save(out / f'{cid}-{k}.png')
    for name, m in getattr(fr, 'text_masks', {}).items():
        m.save(out / f'{cid}-t-{name}.png')
    meta = ctx['meta']
    gate = {'id': cid, 'renderer': VERSION, 'tokens': T['version'], 'look': info['look'], 'side': ctx['side'],
            'pair': meta.get('id'), 'photo': meta.get('name'), 'background': meta.get('background_id'),
            'words': ctx['words'], 'order': ctx['spec'].get('order'), 'title': ctx['spec'].get('title'),
            'hot': info['hot'], 'mark': info.get('mark'), 'guest': info.get('guest'), 'number': info.get('number'),
            'board': info.get('board'),
            'person': {k: mk[k] for k in ('mode', 'head', 'cx', 'crown', 'face_box', 'scale', 'mirrored', 'rotated') if k in mk},
            'elements': fr.elements,
            'files': {'render': f'{cid}.png', 'jpg': f'{cid}.jpg', 'pregrain': f'{cid}-pregrain.png',
                      'person_mask': f'{cid}-person.png', 'person_ref': f'{cid}-person-ref.png',
                      **{f'{k}_mask': f'{cid}-{k}.png' for k in fr.masks},
                      'text_masks': {n: f'{cid}-t-{n}.png' for n in getattr(fr, 'text_masks', {})}}}
    if info.get('guest') and Path(info['guest']['image']).exists():
        gate['guest']['image_sha256'] = hashlib.sha256(Path(info['guest']['image']).read_bytes()).hexdigest()
    json.dump(gate, open(out / f'{cid}-gate.json', 'w'), indent=1, default=float)
    print(f'[{cid}] {info["look"]}: wrote {out / (cid + ".jpg")} (the person from the {mk["mode"]}, head {mk["head"]} px)')
    return gate


def copy_guest(guest_json, dest_dir):
    """Copy a guest-frame record and its image next to a spec (helper for tests and the app)."""
    g = json.loads(Path(guest_json).read_text())
    src = Path(g['image'])
    if not src.is_absolute():
        src = Path(guest_json).parent / src
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest / src.name)
    g['image'] = src.name
    (dest / 'guest.json').write_text(json.dumps(g, indent=1))
    return dest / 'guest.json'
