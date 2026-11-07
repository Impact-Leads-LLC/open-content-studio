"""Gates for thumbnail-builder 3.1 (the call, the wall, the board). Thresholds: tokens.json v3.gates.

  G1   1280x720, the JPEG under 2 MB
  G2   words: caps, the thumbnail punctuation only (no commas, no em or en dashes), word counts per element
  G3   type and loop ink at least 16 px inside the canvas
  G4   the duration-badge corner (x >= 960, y >= 552) holds no type, tag, sticker, board, loop or their shadows
  G5   one hot colour: when the look carries its payoff element (the call's loop, the wall's sticker, the board's tag)
       the accent covers enough of the frame there, and the accent shows nowhere else
  G6   the person's head size for the look
  G7   face clearance: no type, tag, sticker or loop within 48 px of the person's face; on the call nothing in front
       of the guest's face and nothing within 16 px of it
  G8   face lock: inside the face, the frame before grain equals the global-only reference of the person's own
       pixels (mean |d| <= 0.5, max <= 2); never mirrored, never rotated
  G9   the wall's number keeps its identity (one character: a sliver of one side only, never the top band or the
       foot; two to five: per character limits, bottom part only), the person and the front elements counted
  G10  type contrast at 1280: type on the accent >= on_accent_min against the accent; white on ink, on the board or
       on the photo >= type_contrast_min
  G11  the 168 px read: every element's cap height >= 9 px at 168 (a warning under 14.7) and its separation from what
       is around it (no OCR on the cloud machine)
  G12  feed: frame mean >= 60, near-black <= 45 %, border mean >= 28 on two sides or more
  G13  the call's guest frame is a real frame from the episode: a guest-frame record (video, time, detector) whose
       image hash matches

A fail is fixed by changing the words, the look or the photo. A gate is never loosened to pass."""
import json
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

from . import looks
from .tokens import H, T, W

G = T['v3']['gates']


def lum(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def contrast(a, b):
    if isinstance(a, (tuple, list)):
        la = 0.2126 * lum(a[0]) + 0.7152 * lum(a[1]) + 0.0722 * lum(a[2])
        lb = 0.2126 * lum(b[0]) + 0.7152 * lum(b[1]) + 0.0722 * lum(b[2])
    else:
        la, lb = lum(a), lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)


def binz(im, t=128):
    return im.point(lambda v: 255 if v > t else 0)


def count(m):
    return sum(m.histogram()[255:])


def grow(m, r):
    return m.filter(ImageFilter.MaxFilter(2 * r + 1)) if r else m


def box_mask(box, pad=0):
    m = Image.new('L', (W, H), 0)
    x0, y0, x1, y1 = box
    ImageDraw.Draw(m).rectangle((x0 - pad, y0 - pad, x1 + pad, y1 + pad), fill=255)
    return m


def colour_mask(img, rgb, tol):
    """Pixels within an L1 distance tol of rgb (sum of the three channel differences)."""
    d = ImageChops.difference(img, Image.new('RGB', img.size, tuple(rgb))).split()
    return ImageChops.add(ImageChops.add(d[0], d[1]), d[2]).point(lambda v: 255 if v <= tol else 0)


def median_rgb(img, mask):
    if not mask.getbbox():
        return None
    return tuple(_pct(ch, mask, 0.5) for ch in img.split())


def _pct(ch, mask, q):
    h = ch.histogram(mask)
    n = sum(h)
    run = 0
    for v, c in enumerate(h):
        run += c
        if run >= n * q:
            return v
    return 255


def run(spec, base, quiet=False):
    base = Path(base)
    res = []

    def check(cid, ok, msg, hard=True, **v):
        res.append({'id': cid, 'ok': bool(ok), 'hard': hard, 'msg': msg, 'v': v})
        if not quiet:
            print(f"{'PASS' if ok else ('FAIL' if hard else 'WARN')}  {cid:4s} {msg}")

    f = spec['files']
    p = lambda k: base / f[k]
    look = spec['look']
    img = Image.open(p('render')).convert('RGB')
    pre = Image.open(p('pregrain')).convert('RGB')
    person = binz(Image.open(p('person_mask')).convert('L'))
    masks = {k: binz(Image.open(base / f[f'{k}_mask']).convert('L'), 8)
             for k in ('graphics', 'front', 'front_solid', 'mark', 'accent', 'type', 'photo')}

    # G1
    mb = os.path.getsize(p('jpg')) / 1e6
    check('G1', img.size == (W, H) and mb < T['canvas']['max_bytes'] / 1e6, f'canvas {img.size}, JPEG {mb:.2f} MB', mb=round(mb, 2))

    # G2
    try:
        looks.check_words({**spec['words'], 'id': spec['id'], 'look': look})
        caps = all((v or '') == (v or '').upper() for v in spec['words'].values())
        check('G2', caps, 'words: caps, thumbnail punctuation, word counts', words=spec['words'])
    except looks.WordsReject as e:
        check('G2', False, f"words: {e.payload['problems']}", words=spec['words'])

    # G3
    ink = ImageChops.lighter(masks['type'], masks['mark'])
    bb = ink.getbbox()
    ins = G['inset']
    ok = bool(bb) and bb[0] >= ins and bb[1] >= ins and bb[2] <= W - ins and bb[3] <= H - ins
    check('G3', ok, f'type and loop ink {bb} inside {ins} px of every edge', box=list(bb) if bb else None)

    # G4
    zone = (G['badge']['x_min'], G['badge']['y_min'], W, H)
    zpx = count(masks['graphics'].crop(zone))
    check('G4', zpx <= G['badge']['max_px'], f'duration-badge corner x >= {zone[0]}, y >= {zone[1]}: {zpx} px of graphics',
          px=zpx)

    # G5: one hot colour, the accent, on the payoff element only
    hot = G['hot']
    free = ImageChops.invert(ImageChops.lighter(person, masks['photo']))
    acc = ImageChops.multiply(colour_mask(img, looks.ACCENT, hot['tol']), free)
    home = grow(masks['accent'], hot['grow'])
    on = count(ImageChops.multiply(acc, home)) / (W * H)
    off = count(ImageChops.multiply(acc, ImageChops.invert(home))) / (W * H)
    want = spec.get('hot')
    ok = (on >= hot['min_share'] if want else True) and off <= hot['other_max_share']
    check('G5', ok, f"one hot colour ({'the accent on the ' + {'call': 'loop', 'wall': 'sticker', 'board': 'tag'}[look] if want else 'none'}): "
          f"{on:.2%} on it, {off:.2%} anywhere else", on_pct=round(on * 100, 2), off_pct=round(off * 100, 2))

    # G6
    lo, hi = T['v3']['head_px'][look]
    head = spec['person']['head']
    check('G6', lo <= head <= hi, f"the head {head} px for the {look} ({lo}-{hi}), from the {spec['person']['mode']}",
          head=head, mode=spec['person']['mode'])

    # G7
    fb = spec['person']['face_box']
    near = ImageChops.multiply(masks['front_solid'], box_mask(fb, G['face_clear']))
    npx = count(near)
    msg = f"nothing in front within {G['face_clear']} px of the face: {npx} px"
    ok = npx == 0
    if look == 'call' and spec.get('guest'):
        gb = list(spec['guest']['face_box'])
        gb[1] = gb[1] + G['guest_scalp'] * (gb[3] - gb[1])        # the scalp may sit under the tag, the face never
        gm = box_mask(gb, G['guest_clear'])
        gover = count(ImageChops.multiply(ImageChops.lighter(masks['front_solid'], person), gm))
        ok = ok and gover == 0
        msg += f"; over or within {G['guest_clear']} px of the guest's face: {gover} px"
    check('G7', ok, msg, person_px=npx)

    # G8
    ref = Image.open(p('person_ref')).convert('RGBA')
    ra = binz(ref.split()[3], 254)
    x0, y0, x1, y1 = fb
    ell = Image.new('L', (W, H), 0)
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.42, (y1 - y0) * 0.48
    ImageDraw.Draw(ell).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    er = G['face_lock']['erode']
    core = ImageChops.multiply(ell, ImageChops.multiply(ra, person).filter(ImageFilter.MinFilter(2 * er + 1)))
    d = ImageChops.difference(pre, ref.convert('RGB')).convert('L')
    if core.getbbox():
        mean = ImageStat.Stat(d, core).mean[0]
        mx = max(i for i, c in enumerate(d.histogram(core)) if c)
    else:
        mean, mx = 99, 99
    ok = mean <= G['face_lock']['mean_max'] and mx <= G['face_lock']['max'] and not spec['person'].get('mirrored') \
        and not spec['person'].get('rotated')
    check('G8', ok, f"face lock: |frame - the person's own pixels| inside the face mean {mean:.2f}, max {mx} (<= "
          f"{G['face_lock']['mean_max']}, {G['face_lock']['max']}); never mirrored or rotated", mean=round(mean, 3), max=mx,
          core_px=count(core))

    # G9
    if look == 'wall' and spec.get('number'):
        n = spec['number']
        C = T['v3']['looks']['wall']
        nf = looks.archivo_cap(n['cap_px'] * looks.S2, C['number']['wdth'])
        person_left = spec['side'] == 'L'
        occ = looks.occlusion(n['text'], nf, n['x'], C['number']['top'] + n['cap_px'], person_left,
                              Image.open(p('person_mask')).convert('L'), Image.open(p('front_solid_mask')).convert('L'))
        check('G9', occ['ok'], f"the number {n['text']!r} keeps its identity: {occ['why'] or 'ok'}", chars=occ['chars'])

    # G10 and G11
    els = [e for e in spec['elements'] if e['role'] == 'text']
    worst = []
    reads = []
    for e in els:
        tm = binz(Image.open(base / f['text_masks'][e['name']]).convert('L'))
        if not tm.getbbox():
            check('G10', False, f"{e['name']}: no ink found")
            continue
        glyph = tm.filter(ImageFilter.MinFilter(3))
        glyph = glyph if glyph.getbbox() else tm
        ring = ImageChops.subtract(grow(tm, 4), grow(tm, 2))
        gc, rc = median_rgb(img, glyph), median_rgb(img, ring)
        cr = contrast(gc, rc) if gc and rc else 0
        if e['surface'] == 'accent':
            cr_a = contrast(gc, looks.ACCENT) if gc else 0
            ok = cr_a >= G['on_accent_min']
            worst.append((e['name'], round(cr_a, 1), ok))
        else:
            ok = cr >= G['type_contrast_min']
            worst.append((e['name'], round(cr, 1), ok))
        # G11: the 168 px read. Separation: around white type, the share of light pixels in the 2-7 px ring (around
        # ink type, dark pixels); a white word crossing the light number needs its dark glow
        sc = 168 / W
        cap168 = (e['cap_px'] or 0) * sc
        ringw = ImageChops.subtract(grow(tm, 7), grow(tm, 2))
        gl_ = img.convert('L')
        if e['colour'] == 'ink':
            badm = gl_.point(lambda v: 255 if v < G['read168']['sep_dark'] else 0)
        else:
            badm = gl_.point(lambda v: 255 if v > G['read168']['sep_light'] else 0)
        sep = 100 * count(ImageChops.multiply(ringw, badm)) / max(1, count(ringw))
        reads.append({'name': e['name'], 'text': e['text'], 'cap168': round(cap168, 1), 'separation_pct': round(sep, 1),
                      'number': e['name'] == 'number'})
    if worst:
        check('G10', all(o for _, _, o in worst), 'type contrast at 1280: ' + ', '.join(f'{n} {c}:1' for n, c, _ in worst),
              values={n: c for n, c, _ in worst})
    if reads:
        R = G['read168']
        sep_bad = [r for r in reads if not r['number'] and r['separation_pct'] > R['sep_max_pct']]
        small = [r for r in reads if r['cap168'] < R['cap_min_px']]
        detail = ', '.join(f"{r['name']} {r['cap168']} px / {r['separation_pct']}%" for r in reads)
        check('G11', not sep_bad and not small,
              f"168 px read (cap >= {R['cap_min_px']} px at 168, separation <= {R['sep_max_pct']}%): {detail}",
              source='proxy', reads=reads)
        warn = [r for r in reads if r['cap168'] < R['cap_warn_px'] and not r['number']]
        if warn:
            check('G11w', False, f"under {R['cap_warn_px']} px at 168 (reads, but small): " + ', '.join(r['name'] for r in warn), hard=False)

    # G12
    gl = img.convert('L')
    mean = ImageStat.Stat(gl).mean[0]
    nb = sum(gl.histogram()[:20]) / (W * H)
    bx, by = round(W * .04), round(H * .04)
    sides = {'top': (0, 0, W, by), 'bottom': (0, H - by, W, H), 'left': (0, 0, bx, H), 'right': (W - bx, 0, W, H)}
    sm = {k: round(ImageStat.Stat(gl.crop(b)).mean[0]) for k, b in sides.items()}
    fg = G['feed']
    check('G12', mean >= fg['mean_min'] and nb <= fg['nearblack_max'] and sum(v >= fg['border_min'] for v in sm.values()) >= fg['border_sides_min'],
          f'feed: mean {mean:.0f} (>= {fg["mean_min"]}), near-black {nb:.0%} (<= {fg["nearblack_max"]:.0%}), borders {sm}',
          mean=round(mean), near_black_pct=round(nb * 100), borders=sm)

    # G13
    if look == 'call':
        g = spec.get('guest') or {}
        src = g.get('source') or {}
        ok = bool(src.get('video') and src.get('picked_t') is not None and src.get('detector'))
        if ok and src.get('sha256') and g.get('image_sha256'):
            ok = src['sha256'] == g['image_sha256']
        check('G13', ok, f"guest frame from the episode: {Path(src.get('video') or '?').name} at {src.get('picked_t')} s "
              f"({src.get('detector')}), hash {'matches' if ok else 'missing or different'}", source=src)

    hard = [c for c in res if c['hard'] and not c['ok']]
    return {'pass': not hard, 'hard_failures': len(hard), 'warnings': sum(1 for c in res if not c['hard'] and not c['ok']),
            'checks': res, 'ocr': 'proxy'}


def run_file(spec_path, quiet=False):
    spec_path = Path(spec_path).resolve()
    return run(json.loads(spec_path.read_text()), spec_path.parent, quiet)
