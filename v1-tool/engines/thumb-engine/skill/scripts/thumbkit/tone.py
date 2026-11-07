"""Global tone operations used at render time (thumbnail-builder 3.1).

The looks place the host from a cutout of their own photo at a new size: premultiplied resample, choke and feather
at the edge, black match, the thumbnail look grade, light wrap at the edge (face excluded), and the shared grain.
Every operation is global or at the person's edge, never inside the face.
"""
import math

from PIL import Image, ImageChops, ImageFilter, ImageMath, ImageStat

W, H = 1280, 720


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def premult_resize(rgba, size):
    return rgba.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def place(cut, anchor, scale, target, out=(W, H)):
    """anchor = source pixel (head centre x, crown y); target = where it lands in the frame. Never mirrored."""
    bb = cut.split()[3].getbbox()
    c = cut.crop(bb)
    w, h = round(c.width * scale), round(c.height * scale)
    c = premult_resize(c, (w, h))
    canvas = Image.new('RGBA', out, (0, 0, 0, 0))
    ox = round(target[0] - (anchor[0] - bb[0]) * scale)
    oy = round(target[1] - (anchor[1] - bb[1]) * scale)
    canvas.paste(c, (ox, oy), c)
    return canvas


def refine(layer, choke=1, feather=0.5, bg='light', band_px=4):
    """Choke + feather, then decontaminate the edge band toward the subject's own interior colour.
    bg='light' keeps the darker of the two (kills light halos), 'dark' the lighter, None/'none' skips."""
    r, g, b, a = layer.split()
    if choke:
        a = a.filter(ImageFilter.MinFilter(2 * choke + 1))
    if feather:
        a = a.filter(ImageFilter.GaussianBlur(feather))
    if not band_px or bg in (None, 'none'):
        return Image.merge('RGBA', (r, g, b, a))
    inner = a.point(lambda v: 255 if v > 250 else 0).filter(ImageFilter.MinFilter(2 * band_px + 1))
    ib = inner.filter(ImageFilter.GaussianBlur(band_px + 2))
    band = ImageChops.subtract(a.point(lambda v: 255 if v > 0 else 0), inner).filter(ImageFilter.GaussianBlur(1.5))
    chans = []
    for ch in (r, g, b):
        pm = ImageChops.multiply(ch, inner).filter(ImageFilter.GaussianBlur(band_px + 2))
        ext = ImageMath.lambda_eval(lambda e: e['convert'](e['min'](e['p'] * 255 / e['max'](e['q'], 1), 255), 'L'), p=pm, q=ib)
        if bg == 'light':
            ext = ImageChops.darker(ext, ch)
        elif bg == 'dark':
            ext = ImageChops.lighter(ext, ch)
        chans.append(Image.composite(ext, ch, band))
    return Image.merge('RGBA', chans + [a])


def pct(im_l, mask, p):
    h = im_l.histogram(mask=mask)
    n = sum(h)
    acc = 0
    for v, c in enumerate(h):
        acc += c
        if acc >= n * p:
            return v
    return 255


def black_point(plate, plate_mask=None):
    return [pct(ch, plate_mask, 0.005) for ch in plate.split()]


def match_blacks(layer, plate=None, plate_mask=None, strength=1.0, plate_black=None, lifts=None, return_lifts=False):
    """Global levels on the person only: their 0.5 % black per channel moves to the plate's 0.5 % black (and its tint).
    `lifts` applies known per-channel lifts (the face-lock reference re-uses the same ones, so both run the same
    global operation)."""
    r, g, b, a = layer.split()
    if lifts is None:
        am = a.point(lambda v: 255 if v > 250 else 0)
        pb_all = plate_black or black_point(plate, plate_mask)
        lifts = [(pb - pct(ch, am, 0.005)) * strength for ch, pb in zip((r, g, b), pb_all)]
    out = [ch.point(lambda v, lift=lift: max(0, min(255, round(v + lift * (1 - v / 255))))) for ch, lift in zip((r, g, b), lifts)]
    res = Image.merge('RGBA', out + [a])
    return (res, lifts) if return_lifts else res


def exposure(layer, gain):
    r, g, b, a = layer.split()
    f = lambda v: max(0, min(255, round(255 * ((v / 255) ** 2.2 * gain) ** (1 / 2.2))))
    return Image.merge('RGBA', [c.point(f) for c in (r, g, b)] + [a])


def wb_linear(layer, gains):
    """Global white balance on the whole person layer: one gain per channel in linear light, no mask of any kind."""
    if not gains or all(abs(g - 1) < 1e-9 for g in gains):
        return layer
    chans = list(layer.split())
    for i, g in enumerate(gains):
        chans[i] = chans[i].point([max(0, min(255, round(255 * ((v / 255) ** 2.2 * g) ** (1 / 2.2)))) for v in range(256)])
    return Image.merge(layer.mode, chans)


def lift_curve(layer, lift):
    """Global tone curve on the whole person layer: shadows (clothes) held, skin midtones lifted."""
    lut = curve_lut([(0, 0), (28, 26), (60, 60 + lift), (110, min(250, 110 + lift * 0.9)),
                     (160, min(252, 160 + lift * 0.55)), (210, min(253, 210 + lift * 0.2)), (255, 254)])
    r_, g_, b_, a_ = layer.split()
    return Image.merge('RGBA', [ch.point(lut) for ch in (r_, g_, b_)] + [a_])


def light_wrap(comp, alpha, plate_soft, radius=10, strength=0.35, hold=None):
    """Bleed the blurred scene behind the person a few px into their edge, as real spill does. `hold` (L) marks where no
    spill may land: next to a prop in front of the person, whose own dark body blocks the light from behind."""
    ab = alpha.filter(ImageFilter.GaussianBlur(radius))
    edge = ImageChops.multiply(alpha, ImageChops.invert(ab))
    edge = edge.point(lambda v: min(255, round(v * 2.0 * strength)))
    if hold is not None:
        edge = ImageChops.multiply(edge, ImageChops.invert(hold))
    return Image.composite(plate_soft, comp, edge)


def curve_lut(points):
    pts = sorted(points)
    lut = []
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(pts)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]] + [(d[i - 1] + d[i]) / 2 if d[i - 1] * d[i] > 0 else 0 for i in range(1, n - 1)] + [d[-1]]
    for i in range(n - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0
        else:
            a, b = m[i] / d[i], m[i + 1] / d[i]
            s = a * a + b * b
            if s > 9:
                t = 3 / math.sqrt(s)
                m[i] = t * a * d[i]
                m[i + 1] = t * b * d[i]
    for v in range(256):
        i = max(0, min(n - 2, max(k for k in range(n - 1) if xs[k] <= v) if v >= xs[0] else 0))
        h = xs[i + 1] - xs[i]
        t = (v - xs[i]) / h
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
        y = h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]
        lut.append(max(0, min(255, round(y))))
    return lut


def split_tone(im, shadow=(0, 0, 0), high=(0, 0, 0)):
    chans = []
    for c, s, h in zip(im.split(), shadow, high):
        chans.append(c.point(lambda v, s=s, h=h: max(0, min(255, round(v + s * (1 - v / 255) ** 2 + h * (v / 255) ** 2)))))
    return Image.merge('RGB', chans)


def hue_sat(im, global_f, bands, shadow_f=1.0, shadow_v=64):
    """bands: (hue_deg_lo, hue_deg_hi, factor); smooth 15-degree blend between bands."""
    hsv = im.convert('HSV')
    Hh, S, V = hsv.split()

    def fac(hv):
        deg = hv / 255 * 360
        f = 1.0
        for lo, hi, k in bands:
            dist = 0 if lo <= deg <= hi else min(abs(deg - lo), abs(deg - hi), abs(deg + 360 - hi), abs(lo + 360 - deg))
            w = max(0.0, 1 - dist / 15)
            f = f * (1 + (k - 1) * w)
        return max(0, min(255, round(255 * f * global_f)))
    hf = Hh.point(fac)
    vf = V.point(lambda v: round(255 * (shadow_f + (1 - shadow_f) * smooth(v / shadow_v))))
    S2 = ImageChops.multiply(ImageChops.multiply(S, hf), vf)
    return Image.merge('HSV', (Hh, S2, V)).convert('RGB')


THUMB = dict(curve=[(0, 0), (16, 12), (48, 44), (96, 93), (160, 165), (220, 225), (255, 238)],
             shadow=(-1, 0, 5), high=(2, 1, 0), sat_global=0.85,
             bands=[(0, 40, 1.00), (40, 70, 0.80), (70, 170, 0.60), (170, 260, 0.55), (260, 340, 0.80)],
             shadow_sat=0.6)


def look(im, P=THUMB):
    im = im.point(curve_lut(P['curve']) * 3)
    im = split_tone(im, P['shadow'], P['high'])
    return hue_sat(im, P['sat_global'], P['bands'], P['shadow_sat'])


def grain(im, sigma=2.5, deep=20, deep_k=0.5):
    """Shared grain, sigma 2.5, half strength below 20/255."""
    n = Image.effect_noise(im.size, 30).filter(ImageFilter.GaussianBlur(0.6))
    st = ImageStat.Stat(n)
    sd = st.stddev[0] or 1
    mu = st.mean[0]
    n = n.point(lambda v: max(0, min(255, round(128 + (v - mu) * sigma / sd))))
    nh = n.point(lambda v: round(128 + (v - 128) * deep_k))
    Lm = im.convert('L').point(lambda v: 255 if v < deep else 0).filter(ImageFilter.GaussianBlur(2))
    nn = Image.composite(nh, n, Lm)
    return ImageChops.add(im, Image.merge('RGB', [nn] * 3), 1.0, -128)
