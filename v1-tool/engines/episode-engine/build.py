#!/usr/bin/env python3
"""The episode's animated moments (episode engine). The look: mostly The Board, a splash of Kinetic Layers, and never one
format every time.

- The Board: the video slides back into a white-framed window with a hard ink shadow and the content takes the screen
  on a board in the palette's primary colour (harbor blue #1E4E6E by default): big white Libre Franklin Black type, ink
  chips, white stickers. Three layouts (window right, window left, window dropped small to the bottom right), never the
  same one twice in a row.
- The accent colour (yellow #FFC530 by default) is an accent, never a background (yellow boards read too loud and
  busy): chapter numbers, the guest's role on the name card, big numbers and the booking button. Everything else is
  white, ink or the board.
- Kinetic Layers: the content hovers over the live footage beside the speaker, clear of every face: tilted stickers, an
  outlined number, a floating screenshot. Names and pops are always kinetic; about one graphic in four is too.

Every brand colour in the page comes from context.json's studio.palette (studio.py recolor), and the host's name and
the show's name from studio too.

Only the seconds that carry one of these are animated: each moment's stretch of work/base.mp4 is cut out and joined
into one short clip, a HyperFrames composition plays it with the moments on top, and final.py lays the rendered
stretches back into the episode. The host's introduction of the guest shows the guest's own camera in the window.

In: work/edit.json, work/plan.json, work/base.mp4, work/faces.json, work/broll.json, context.json.
Out: work/comp/ (index.html, assets), work/segments.json (with where the captions sit during each board moment).
Env: CHROME (optional, for website screenshots), HOST_NAME (optional; default studio.ownerFull), SHOW (optional; default
studio.show or the episode's show).
"""
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
from studio import recolor, studio  # noqa: E402

FPS = 30
W, H = 1920, 1080
E = os.environ
edit = json.load(open("work/edit.json"))
plan = json.load(open("work/plan.json"))
DUR = edit["dur"]
ctx = json.load(open("context.json")) if os.path.exists("context.json") else {}
ST = studio(ctx)
SHOW = E.get("SHOW") or ST["show"] or ""
HOST = E.get("HOST_NAME") or (ST["ownerFull"] if ST["has_owner"] else ST["brand"] if ST["brand"] != "the studio" else "")
KEY = {p["name"]: p["key"] for p in edit["people"]}
NAME = {p["key"]: p["name"] for p in edit["people"]}
SRC = {p["key"]: p["v"] for p in edit["people"]}
COMP = Path("work/comp")
if COMP.exists():
    shutil.rmtree(COMP)
(COMP / "assets").mkdir(parents=True)


def q(t):
    return round(round(t * FPS) / FPS, 4)


def esc(s):
    return html.escape(str(s or ""), quote=True)


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise SystemExit(f"{cmd[0]} failed: {r.stderr.strip()[-600:]}")
    return r


SHOTS = [(a, edit["cuts"][k + 1][0] if k + 1 < len(edit["cuts"]) else DUR, s) for k, (a, s) in enumerate(edit["cuts"])]
BS = float(plan.get("body_start") or 0.0)          # where the episode itself starts, after the host's introduction

# ---- never over a face (the speaker's face is never covered): each camera's face box (faces.py), placed the way each shot shows it ------
FACES = json.load(open("work/faces.json")) if os.path.exists("work/faces.json") else {}
DEFAULT_FACE = [0.38, 0.16, 0.62, 0.62]


def shot_at(t):
    return next((s for a, b, s in SHOTS if a <= t < b), SHOTS[-1][2] if SHOTS else "both")


def faces_at(t):
    """The face rectangles on screen at t (pixels), with room for the slow push and punch-ins."""
    s = shot_at(t)
    box = lambda k: FACES.get(k) or DEFAULT_FACE
    grow = lambda r, f=1.15: [960 + (r[0] - 960) * f, 454 + (r[1] - 454) * f, 960 + (r[2] - 960) * f, 454 + (r[3] - 454) * f]
    if s in ("top", "bot"):
        b = box(s)
        return [grow([b[0] * W, b[1] * H, b[2] * W, b[3] * H])]
    out = []
    for k, x0 in (("bot", 0), ("top", 966)):     # side by side: the host's camera on the left half, the guest's on the right
        if k in NAME:
            b = box(k)
            out.append([x0 + b[0] * W - 483, b[1] * H, x0 + b[2] * W - 483, b[3] * H])
    return out


def clear(rect, a, b):
    """True when the rectangle covers no face at any moment from a to b."""
    x0, y0, x1, y1 = rect
    for k in range(9):
        for f in faces_at(a + (b - a) * k / 8):
            if x0 < f[2] and x1 > f[0] and y0 < f[3] and y1 > f[1]:
                return False
    return True


def zone(a, b, y0, y1, need=520):
    """The widest strip beside the face(s) from y0 to y1, clear from a to b: (x0, x1), or None."""
    fs = [f for k in range(9) for f in faces_at(a + (b - a) * k / 8) if f[1] < y1 and f[3] > y0]
    if not fs:
        return (90, 90 + 900)
    left = (90, min(f[0] for f in fs) - 50)
    right = (max(f[2] for f in fs) + 50, W - 90)
    best = max((left, right), key=lambda r: r[1] - r[0])
    if best[1] - best[0] < need or not clear((best[0], y0, best[1], y1), a, b):
        return None
    return (best[0], min(best[1], best[0] + 900))


# ---- website screenshots for the site graphics ----------------------------------------------------------------------
def chrome():
    if E.get("CHROME") and os.path.exists(E["CHROME"]):
        return E["CHROME"]
    found = sorted(glob.glob(os.path.expanduser("~/.cache/hyperframes/chrome/**/chrome-headless-shell"), recursive=True))
    found = [f for f in found if os.path.isfile(f) and os.access(f, os.X_OK)]
    return found[-1] if found else ""


def screenshot(url, out):
    """The site's first screens, for a site graphic. A plain capture first; a page that comes back blank (an app shell, a
    sign-in wall) gets a second try as a desktop browser; still blank, and the graphic is skipped (no empty frames)."""
    exe = chrome()
    if not exe:
        return False
    if not re.match(r"^https?://", url):
        url = "https://" + url
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    for extra, limit in (([], 45), ([f"--user-agent={ua}"], 30)):
        if os.path.exists(out):
            os.remove(out)
        try:
            subprocess.run([exe, "--no-sandbox", "--hide-scrollbars", "--disable-gpu", "--mute-audio", "--window-size=1440,2600",
                            "--virtual-time-budget=14000", *extra, f"--screenshot={out}", url], capture_output=True, timeout=limit)
        except Exception:
            continue
        if not (os.path.exists(out) and os.path.getsize(out) > 40000):
            continue
        try:
            from PIL import Image, ImageStat
            if ImageStat.Stat(Image.open(out).convert("L").crop((0, 0, 1440, 1400))).stddev[0] < 14:
                continue
        except ImportError:
            pass
        return True
    if os.path.exists(out):
        os.remove(out)
    return False


GFX = []
for i, g in enumerate(plan.get("graphics", [])):
    if g["kind"] == "site":
        img = f"site-{i}.png"
        if not screenshot(g["url"], str(COMP / "assets" / img)):
            print(f"site graphic skipped: couldn't capture {g['url']}", flush=True)
            continue
        g = {**g, "img": img}
    GFX.append(g)


# ---- which moments, where (seconds on the edit's clock) -------------------------------------------------------------
SEGS = []           # dicts: kind, a, b, data
# what type of episode it is (masterclass, free coaching session or expert guest)
FMT = plan.get("format") or {}
FMT_LABEL = {"masterclass": "Masterclass", "coaching": "Free coaching session", "expert": "Expert guest"}.get(FMT.get("type") or "", "")
FMT_TOPIC = FMT.get("topic") or ""


def free(a, b, gap=0.8):
    return a >= 0 and b <= DUR and all(b + gap <= s["a"] or a >= s["b"] + gap for s in SEGS)


def add(kind, a, b, **data):
    a, b = q(a), q(b)
    if b - a < 1 or not free(a, b):
        return False
    SEGS.append({"kind": kind, "a": a, "b": b, **data})
    return True


tz = plan.get("teaser") or {}
if DUR > 40:
    # the host's introduction of the guest (in the teaser): the guest's camera in the window, the guest's card beside it
    intro = tz.get("intro")
    guest = next((n for n in plan.get("names") or [] if n.get("role") in ("guest", "collaborator")), None)
    if intro and guest and "top" in NAME:
        add("intro", intro["in"] + 0.2, max(intro["in"] + 3, intro["out"] - 0.9), who=NAME["top"], line=guest.get("line", ""),
            trust=guest.get("trust", ""), role=guest.get("role") or "guest")
    # an ad read the host records in the intro: the offer on the board while it's read
    ad = tz.get("ad")
    if ad and (ad.get("offer") or ad.get("url")):
        add("ad", ad["in"] + 0.3, ad["out"] - 0.4, offer=ad.get("offer") or "", url=ad.get("url") or "")
    add("title", BS, min(BS + 6.5, DUR - 1), title=plan.get("title") or "")
    add("end", DUR - 8.5, DUR)
# Screen shares recorded during the call play in sync with what's said, the speaker in a small window: up to 24 seconds at a time, the talk back for 8 between.
BROLL = json.load(open("work/broll.json")) if os.path.exists("work/broll.json") else []
for i, br in enumerate(BROLL):
    a0 = br["offset"] - edit["start"]
    a, end = max(a0, BS + 2.0), min(a0 + br["len"], DUR - 10.0)
    while end - a >= 4:
        b = min(a + 24.0, end)
        if add("screen", a, b, src=i, skip=a - a0):
            a = b + 8.0
        else:
            a += 2.0
for g in GFX:
    add("graphic", g["at"] - 0.7, g["until"] + 0.7, g=g)
# a name card the first time each person is on screen alone and talking, from 8 seconds in
for nm in plan.get("names") or []:
    key = KEY.get(nm["who"]) or next((k for n, k in KEY.items() if n.split()[0].lower() == nm["who"].split()[0].lower()), None)
    if not key:
        continue
    after = max([x["b"] for x in SEGS if x["kind"] == "title"] + [BS]) + 1.0
    for a, b, s in SHOTS:
        t = max(a + 0.4, after, BS + 7.0)
        if s != key or b - t < 6:
            continue
        z = zone(t, t + 5.2, 330, 860, 560)
        if z and add("name", t, t + 5.2, who=NAME[key], line=nm["line"], trust=nm.get("trust", ""), role=nm.get("role") or "", z=z):
            break
# chapter cards at each chapter after the first; a busy moment pushes one a little later
for k, c in enumerate((plan.get("chapters") or [])[1:], start=2):
    for d in (0, 3, 6, 9, 12, 15):
        if add("chapter", c["at"] + d, c["at"] + d + 4.4, n=k, title=c["title"]):
            break
# pops: a sticker hovers beside the speaker on a line worth remembering
for p in plan.get("pops") or []:
    a = p["at"] - 0.15
    z = zone(a, a + 3.4, 150, 820)
    if z:
        add("pop", a, a + 3.4, text=p["text"], z=z)
SEGS.sort(key=lambda s: s["a"])

# ---- the look of each moment: mostly The Board, a splash of Kinetic Layers, never the same layout twice in a row ----
LAYOUTS = {
    # window right / left at 44 %, or dropped small to the bottom right; content zone; the captions
    "R": {"x": 995, "y": 420, "s": 0.44, "zone": (90, 925), "cap": (1417, 914, 8, 66)},
    "L": {"x": 80, "y": 420, "s": 0.44, "zone": (995, 1840), "cap": (502, 914, 8, 66)},
    "D": {"x": 1139, "y": 611, "s": 0.36, "zone": (90, 1080), "cap": (585, 1030, 2, 58)},
    "S": {"x": 1264, "y": 676, "s": 0.30, "zone": (70, 1310), "cap": (690, 1030, 2, 58)},
}
FIXED = {"intro": ["R"], "title": ["D"], "end": ["L"], "screen": ["S"], "ad": ["R", "L"], "chapter": ["D", "R", "L"]}
last, kin_gfx, chap_k = None, 0, 0
for s in SEGS:
    kind = s["kind"]
    if kind in ("name", "pop"):
        s["look"] = "kinetic"
        continue
    g = s.get("g") or {}
    gk = g.get("kind")
    if kind == "chapter":
        chap_k += 1
        if chap_k % 2 == 0 and last != "kinetic":  # every other chapter: a sticker over the footage
            z = zone(s["a"], s["b"], 90, 380, 560)
            if z:
                s.update(look="kinetic", z=z)
                last = "kinetic"
                continue
    if kind == "graphic" and (gk in ("stat", "site") or (gk == "list" and len(g.get("rows") or []) <= 4)):
        kin_gfx += 1
        if kin_gfx % 4 == 2 and last != "kinetic":
            z = zone(s["a"], s["b"], 140, 860, 600)
            if z:
                s.update(look="kinetic", z=z)
                last = "kinetic"
                continue
    opts = FIXED.get(kind) or (["R", "L", "D"] if gk in ("stat", "quote") or (gk == "list" and len(g.get("rows") or []) <= 3) else ["R", "L"])
    pick = next((o for o in opts if o != last), opts[0])
    # rotate so the sides take turns instead of always preferring the first
    if kind in ("graphic", "chapter") and len(opts) > 1:
        k = [x for x in SEGS if x.get("look") == "board" and x["kind"] == kind]
        pick = next((o for o in opts[len(k) % len(opts):] + opts[:len(k) % len(opts)] if o != last), pick)
    s.update(look="board", lay=pick)
    last = pick

# ---- one clip of every moment's stretch, back to back (the intro shows the guest's own camera) ----------------------
FULL = f"fps={FPS},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1"
o = 0.0
args, parts = [], []
for k, s in enumerate(SEGS):
    s["o"] = q(o)
    s["len"] = q(s["b"] - s["a"])
    if s["kind"] == "intro" and SRC.get("top"):
        args += ["-ss", f"{edit['start'] + s['a']:.4f}", "-t", f"{s['len']:.4f}", "-i", SRC["top"]]
        parts.append(f"[{k}:v]{FULL},setpts=PTS-STARTPTS,trim=end_frame={round(s['len'] * FPS)}[p{k}]")
    else:
        args += ["-ss", f"{s['a']:.4f}", "-t", f"{s['len']:.4f}", "-i", "work/base.mp4"]
        parts.append(f"[{k}:v]fps={FPS},setpts=PTS-STARTPTS,trim=end_frame={round(s['len'] * FPS)}[p{k}]")
    o += s["len"]
TOTAL = q(o)
if SEGS:
    graph = ";".join(parts) + ";" + "".join(f"[p{k}]" for k in range(len(SEGS))) + f"concat=n={len(SEGS)}:v=1:a=0,format=yuv420p[v]"
    sh(["ffmpeg", "-v", "error", "-y"] + args + ["-filter_complex", graph, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "14", "-g", "15", str(COMP / "assets/segbase.mp4")])

# ---- the composition ------------------------------------------------------------------------------------------------
for f in ("fonts/LibreFranklin-VF.ttf", "fonts/Poppins-Regular.ttf", "fonts/Poppins-SemiBold.ttf", "vendor/gsap.min.js"):
    (COMP / "assets" / Path(f).parent).mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / "assets" / f, COMP / "assets" / f)
shutil.copy(ROOT / "hyperframes.json", COMP / "hyperframes.json")
(COMP / "meta.json").write_text(json.dumps({"id": "episode", "name": "episode"}))

JS, UI = [], []


def js(s):
    JS.append(s)


def el(html_, start, dur, track=2):
    UI.append(f'<div class="clip c" data-start="{q(start):.4f}" data-duration="{q(dur):.4f}" data-track-index="{track}">{html_}</div>')


def words_html(text, cls="wi"):
    return " ".join(f'<span class="wm"><span class="{cls}">{esc(w)}</span></span>' for w in str(text).split())


def num_html(text):
    """Numbers in a heading get the accent colour with an ink edge."""
    return re.sub(r"(\$?\d[\d,.]*[%kKmM+]?)", r'<span class="nb">\1</span>', esc(text))


def num_parts(v):
    mt = re.match(r"^(\D*?)([\d,]+(?:\.\d+)?)(.*)$", str(v).strip())
    return (mt.group(1), float(mt.group(2).replace(",", "")), mt.group(3)) if mt else None


try:                       # Libre Franklin Black measured for real, so text never falls outside its box
    from PIL import ImageFont
    _BLACK = str(ROOT / "assets/fonts/LibreFranklin-Black.ttf")
    _F100 = ImageFont.truetype(_BLACK, 100)
except Exception:
    _F100 = None


def text_w(t, size, ls=0.0):
    """Width in px of the text in caps Libre Franklin Black at `size`, with letter-spacing `ls` em."""
    t = str(t).upper()
    if _F100 is not None:
        return (_F100.getlength(t) / 100 + ls * max(0, len(t) - 1)) * size
    return len(t) * 0.74 * size


def fit(text, width, lines=2, top=150, low=40, k=None, ls=-0.02):
    """The biggest size (px) at which the text, set in caps, wraps into `lines` lines no wider than `width` px."""
    words = str(text).split() or [""]
    width *= 0.95
    for size in range(top, low - 1, -2):
        n, cur = 1, ""
        for w in words:
            if text_w(w, size, ls) > width:
                n = 99
                break
            t = f"{cur} {w}".strip()
            if cur and text_w(t, size, ls) > width:
                n, cur = n + 1, w
            else:
                cur = t
        if n <= lines:
            return size
    return low


def window(o_, len_, lay, stay=False):
    """The video slides into a white-framed window with a hard ink shadow (and back at the end, unless it stays)."""
    x, y, sc = lay["x"], lay["y"], lay["s"]
    w, h = round(W * sc), round(H * sc)
    js(f"tl.to('#camw', {{ x: {x}, y: {y}, scale: {sc}, borderRadius: {round(16 / sc)}, duration: 0.7, ease: 'expo.inOut' }}, {q(o_)});")
    js(f"tl.fromTo('#frame', {{ left: -16, top: -16, width: {W + 32}, height: {H + 32} }}, {{ left: {x - 10}, top: {y - 10}, width: {w + 20}, height: {h + 20}, duration: 0.7, ease: 'expo.inOut' }}, {q(o_)});")
    if not stay:
        js(f"tl.to('#frame', {{ left: -16, top: -16, width: {W + 32}, height: {H + 32}, duration: 0.66, ease: 'expo.inOut' }}, {q(o_ + len_ - 0.66)});")
        js(f"tl.to('#camw', {{ x: 0, y: 0, scale: 1, borderRadius: 0, duration: 0.66, ease: 'expo.inOut' }}, {q(o_ + len_ - 0.66)});")


def zone_style(lay, top=None):
    x0, x1 = lay["zone"]
    return f"left:{x0}px;width:{x1 - x0}px;" + (f"top:{top}px" if top is not None else "top:0;height:1080px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start")


def board_in(sid, o_, L):
    """The board's content builds in once the window has moved, and goes before the window comes back."""
    t = o_ + 0.55
    js(f"tl.fromTo('#{sid} .chip', {{ opacity: 0, x: -50, rotation: -10 }}, {{ opacity: 1, x: 0, rotation: (i, e) => +(e.dataset.r || 0), duration: 0.5, ease: 'back.out(2)', stagger: 0.12 }}, {q(t)});")
    js(f"tl.fromTo('#{sid} .hd .wi', {{ yPercent: 115 }}, {{ yPercent: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07 }}, {q(t + 0.1)});")
    js(f"tl.fromTo('#{sid} .st', {{ opacity: 0, scale: 0.5, rotation: -14 }}, {{ opacity: 1, scale: 1, rotation: (i, e) => +(e.dataset.r || 0), duration: 0.55, ease: 'back.out(2.4)', stagger: 0.15 }}, {q(t + 0.6)});")
    js(f"tl.fromTo('#{sid} .ln', {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.12 }}, {q(t + 0.45)});")
    js(f"tl.to('#{sid}', {{ opacity: 0, y: -40, duration: 0.4, ease: 'power2.in' }}, {q(o_ + L - 0.95)});")


def kin_in(sid, o_, L, side):
    """Kinetic pieces fly in from their side with a spin, hover, and spin out."""
    dx = -260 if side == "left" else 260
    js(f"tl.fromTo('#{sid} .k', {{ opacity: 0, x: {dx}, rotation: (i, e) => +(e.dataset.r || 0) + {-18 if side == 'left' else 18} }}, {{ opacity: 1, x: 0, rotation: (i, e) => +(e.dataset.r || 0), duration: 0.6, ease: 'back.out(1.6)', stagger: 0.13 }}, {q(o_ + 0.1)});")
    js(f"tl.to('#{sid}', {{ y: -14, duration: {max(0.8, (L - 1.2) / 2):.2f}, ease: 'sine.inOut', yoyo: true, repeat: 1 }}, {q(o_ + 0.6)});")
    js(f"tl.to('#{sid} .k', {{ opacity: 0, scale: 0.7, rotation: '+={-12 if side == 'left' else 12}', duration: 0.35, ease: 'back.in(1.8)', stagger: 0.06 }}, {q(o_ + L - 0.55)});")


def sticker(text, cls="white", r=0, size=None, extra=""):
    st = f' style="font-size:{size}px"' if size else ""
    return f'<span class="k st {cls}" data-r="{r}"{st}>{esc(text)}</span>{extra}'


def kzone(s, top=None, h=None):
    x0, x1 = s["z"]
    side = "left" if x0 < 400 else "right"
    align = "flex-start" if side == "left" else "flex-end"
    pos = f"top:{top}px" if top is not None else "top:150px;height:670px;justify-content:center"
    return side, x1 - x0, f'left:{x0}px;width:{x1 - x0}px;{pos};align-items:{align};text-align:{"left" if side == "left" else "right"}'


gk = 0
for k, s in enumerate(SEGS):
    o_, L, kind, look = s["o"], s["len"], s["kind"], s.get("look")
    sid = f"s{k}"
    if look == "board":
        lay = LAYOUTS[s["lay"]]
        s["cap"] = list(lay["cap"])
        s["win"] = [lay["x"], lay["y"], round(W * lay["s"]), round(H * lay["s"])]
        zw = lay["zone"][1] - lay["zone"][0]
        window(o_, L, lay, stay=(kind == "end"))
    if kind == "intro":
        role = FMT_LABEL if FMT.get("type") in ("coaching", "expert") else {"guest": "Guest", "collaborator": "Collaborator"}.get(s.get("role"), "Guest")
        size = fit(s["who"], zw, 2, 150, 70)
        inner = (f'<span class="chip ink" data-r="-3">{esc(role)}</span><div class="hd" style="font-size:{size}px">{words_html(s["who"])}</div>'
                 + (f'<div class="ln big">{esc(s["line"])}</div>' if s.get("line") else "")
                 + (f'<div><span class="st white" data-r="-2" style="font-size:{fit(s["trust"], zw - 60, 2, 40, 28, ls=0.01)}px">{esc(s["trust"])}</span></div>' if s.get("trust") else "")
                 + (f'<div><span class="st blue" data-r="2" style="font-size:{fit(FMT_TOPIC, zw - 60, 2, 40, 28, ls=0.01)}px">{esc(FMT_TOPIC)}</span></div>' if FMT_TOPIC and FMT.get("type") == "coaching" else ""))
        el(f'<div class="zone" id="{sid}" style="{zone_style(lay)}">{inner}</div>', o_, L)
        board_in(sid, o_, L)
    elif kind == "ad":
        end = plan.get("end") or {}
        size = fit(s["offer"] or s["url"], zw, 3, 120, 60)
        inner = ((f'<div class="hd" style="font-size:{size}px">{words_html(s["offer"])}</div>' if s["offer"] else "")
                 + (f'<div class="ln big">{esc(end.get("line"))}</div>' if end.get("line") else "")
                 + (f'<div><span class="st white url" data-r="2" style="font-size:{fit(s["url"], zw - 60, 1, 44, 22, 0.66)}px">{esc(s["url"])}</span></div>' if s["url"] else ""))
        el(f'<div class="zone" id="{sid}" style="{zone_style(lay)}">{inner}</div>', o_, L)
        board_in(sid, o_, L)
    elif kind == "title":
        size = fit(s["title"], zw, 4, 128, 64)
        guest_ = NAME.get("top", "")
        sub_t = (f"{FMT_LABEL} with {guest_}" if FMT.get("type") == "coaching" and guest_ else f"{FMT_LABEL}: {guest_}" if FMT.get("type") == "expert" and guest_
                 else FMT_LABEL if FMT.get("type") == "masterclass" else f"With {guest_}" if guest_ else "")
        sub = (f'<span class="st white" data-r="-2" style="font-size:{fit(sub_t, zw - 60, 1, 40, 26, ls=0.01)}px">{esc(sub_t)}</span>' if sub_t else "")
        inner = ((f'<span class="chip ink" data-r="-2">{esc(SHOW)}</span>' if SHOW else "")
                 + f'<div class="hd" style="font-size:{size}px">{words_html(s["title"])}</div>' + (f"<div>{sub}</div>" if sub else ""))
        el(f'<div class="zone" id="{sid}" style="{zone_style(lay, 96)}">{inner}</div>', o_, L)
        board_in(sid, o_, L)
    elif kind == "end":
        end = plan.get("end") or {}
        promise = end.get("line") or ""
        inner = ((f'<span class="chip ink" data-r="-2">{esc(HOST)}</span>' if HOST else "")
                 + (f'<div class="hd" style="font-size:{fit(promise, zw, 4, 96, 48)}px">{words_html(promise)}</div>' if promise else "")
                 + (f'<div><span class="chip ink cta" data-r="-2" style="font-size:{fit(end.get("cta"), zw - 70, 1, 50, 30, ls=0.01)}px">{esc(end.get("cta"))}</span></div>' if end.get("cta") else "")
                 + (f'<div><span class="st white url" data-r="2" style="font-size:{fit(end.get("url"), zw - 60, 1, 40, 22, 0.66)}px">{esc(end.get("url"))}</span></div>' if end.get("url") else ""))
        el(f'<div class="zone" id="{sid}" style="{zone_style(lay)}">{inner}</div>', o_, L)
        js(f"tl.fromTo('#{sid} .hd .wi', {{ yPercent: 115 }}, {{ yPercent: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07 }}, {q(o_ + 0.65)});")
        js(f"tl.fromTo('#{sid} .chip, #{sid} .st', {{ opacity: 0, scale: 0.5, rotation: -14 }}, {{ opacity: 1, scale: 1, rotation: (i, e) => +(e.dataset.r || 0), duration: 0.55, ease: 'back.out(2.4)', stagger: 0.18 }}, {q(o_ + 1.3)});")
    elif kind == "chapter" and look == "board":
        size = fit(s["title"], zw, 3, 130, 64)
        inner = (f'<div class="bign"><span class="k">{s["n"]:02d}</span></div><span class="chip ink" data-r="-3">Chapter {s["n"]}</span>'
                 f'<div class="hd" style="font-size:{size}px">{words_html(s["title"])}</div>')
        el(f'<div class="zone" id="{sid}" style="{zone_style(lay, 110) if s["lay"] == "D" else zone_style(lay)}">{inner}</div>', o_, L)
        js(f"tl.fromTo('#{sid} .bign .k', {{ opacity: 0, scale: 1.6, rotation: 8 }}, {{ opacity: 1, scale: 1, rotation: -4, duration: 0.55, ease: 'back.out(2)' }}, {q(o_ + 0.5)});")
        board_in(sid, o_, L)
    elif kind == "chapter":
        side, zw2, st = kzone(s, top=110)
        inner = sticker(f"Chapter {s['n']}", "yellow", -4, 34) + "<br>" + sticker(s["title"], "white", 2, fit(s["title"], zw2 - 70, 2, 74, 40, ls=0.01))
        el(f'<div class="kz" id="{sid}" style="{st}">{inner}</div>', o_, L)
        kin_in(sid, o_, L, side)
    elif kind == "name":
        side, zw2, st = kzone(s, top=330)
        role = {"guest": "Guest", "collaborator": "Collaborator", "host": "Host"}.get(s.get("role"), "")
        if role in ("Guest", "") and s["who"] != NAME.get("bot") and FMT.get("type") in ("coaching", "expert"):
            role = FMT_LABEL
        inner = ((sticker(role, "yellow", -6, 32) + "<br>" if role else "")
                 + f'<div class="k kname" data-r="0" style="font-size:{fit(s["who"], zw2, 2, 120, 60)}px">{esc(s["who"])}</div>'
                 + (sticker(s["line"], "white", 2, fit(s["line"], zw2 - 70, 2, 34, 24, ls=0.01)) + "<br>" if s.get("line") else "")
                 + (sticker(s["trust"], "blue", -2, fit(s["trust"], zw2 - 70, 2, 30, 22, ls=0.01)) if s.get("trust") else ""))
        el(f'<div class="kz" id="{sid}" style="{st}">{inner}</div>', o_, L)
        kin_in(sid, o_, L, side)
    elif kind == "pop":
        side, zw2, st = kzone(s)
        inner = sticker(s["text"], "white", [-4, 3][k % 2], fit(s["text"], zw2 - 70, 3, 110, 48, ls=0.01))
        el(f'<div class="kz" id="{sid}" style="{st}">{inner}</div>', o_, L)
        kin_in(sid, o_, L, side)
    elif kind == "screen":
        br = BROLL[s["src"]]
        clip = f"scr-{k}.mp4"
        sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{s['skip']:.3f}", "-t", f"{L:.3f}", "-i", br["file"], "-an", "-vf", "fps=30,scale=1600:-2,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", str(COMP / "assets" / clip)])
        dims = sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(COMP / "assets" / clip)]).stdout.strip().split(",")
        aspect = int(dims[1]) / int(dims[0]) if len(dims) == 2 else 0.5
        bw = min(1180, int(820 / max(0.2, aspect)))
        UI.append(f'<div class="clip c" data-start="{q(o_):.4f}" data-duration="{q(L):.4f}" data-track-index="1">'
                  f'<div class="scr" id="{sid}" style="width:{bw}px"><div class="bw-top"><i></i><i></i><i></i><span>{esc(br.get("label") or "Screen share")}</span></div>'
                  f'<video class="clip" id="{sid}-v" src="assets/{clip}" data-start="{q(o_):.4f}" data-duration="{q(L):.4f}" data-track-index="3" muted playsinline style="width:{bw}px"></video></div></div>')
        js(f"tl.fromTo('#{sid}', {{ opacity: 0, x: -120, rotation: -6 }}, {{ opacity: 1, x: 0, rotation: -1.2, duration: 0.7, ease: 'back.out(1.4)' }}, {q(o_ + 0.3)});")
        js(f"tl.to('#{sid}', {{ opacity: 0, x: -80, duration: 0.45, ease: 'power2.in' }}, {q(o_ + L - 0.85)});")
        s["cap"] = [70 + bw // 2, 1030, 2, 58]
    elif kind == "graphic":
        g = s["g"]
        gkind = g["kind"]
        rel = lambda t: q(o_ + 0.7 + (t - g["at"]))
        beats = []
        if look == "kinetic":
            side, zw2, st = kzone(s)
            if gkind == "stat":
                parts_ = num_parts(g["value"])
                start = esc(g["value"]) if not parts_ else esc(f"{parts_[0]}0{parts_[2]}")
                inner = (f'<div class="k onum" data-r="-3" id="{sid}-v" style="font-size:{fit(g["value"], zw2 - 40, 1, 300, 90, 0.7)}px">{start}</div>'
                         + (sticker(g["label"], "white", 2, fit(g["label"], zw2 - 70, 2, 50, 28, ls=0.01)) + "<br>" if g.get("label") else "")
                         + (sticker(g["title"], "blue", -2, 34) if g.get("title") else ""))
                if parts_:
                    pre, n, post = parts_
                    dec = 1 if n != int(n) else 0
                    beats.append(f"(function(){{ const o={{v:0}}, el=document.querySelector('#{sid}-v'); tl.to(o, {{ v: {n}, duration: 1.2, ease: 'power2.out', onUpdate: () => {{ el.textContent = {json.dumps(pre)} + "
                                 f"o.v.toLocaleString('en-US', {{ minimumFractionDigits: {dec}, maximumFractionDigits: {dec} }}) + {json.dumps(post)}; }} }}, {q(max(o_ + 0.5, rel(g['at'])))}); }})();")
            elif gkind == "site":
                url = re.sub(r"^https?://", "", g["url"]).rstrip("/")
                fw = min(zw2, 760)
                inner = (f'<div class="k fly" data-r="-3" style="width:{fw}px"><div class="bw-top"><i></i><i></i><i></i><span>{esc(url)}</span></div>'
                         f'<div class="bw-view" style="height:{int(fw * 0.62)}px"><img id="{sid}-img" src="assets/{g["img"]}" style="width:{fw}px" /></div></div>'
                         + ("<br>" + sticker(g["title"], "white", 3, 40) if g.get("title") else ""))
                beats.append(f"tl.fromTo('#{sid}-img', {{ y: 0 }}, {{ y: -{int(fw * 0.62)}, duration: {max(2.0, L - 3.2):.2f}, ease: 'power1.inOut' }}, {q(o_ + 1.2)});")
            else:   # a short list as stickers
                inner = (sticker(g["title"], "ink", -3, 36) + "<br>" if g.get("title") else "")
                for i, r in enumerate(g["rows"]):
                    inner += f'<span class="k st white row" id="{sid}-r{i}" data-r="{[2, -2][i % 2]}" style="font-size:{fit(r["text"], zw2 - 150, 1, 46, 26, ls=0.01)}px"><b>{i + 1}</b>{esc(r["text"])}</span><br>'
            el(f'<div class="kz" id="{sid}" style="{st}">{inner}</div>', o_, L)
            kin_in(sid, o_, L, side)
            for b in beats:
                js(b)
            continue
        lay = LAYOUTS[s["lay"]]
        title = (f'<span class="chip ink" data-r="-2">{esc(g["title"])}</span>' if g.get("title") and gkind not in ("stat", "site", "message") else "")
        if gkind in ("list", "checklist"):
            longest = max((r["text"] for r in g["rows"]), key=len)
            rs = fit(longest, zw - 120, 2, 64, 34, 0.64)
            rows = "".join(f'<div class="brow" id="{sid}-r{i}">' + (f'<i class="bck"><i class="tk"></i></i>' if gkind == "checklist" else f'<b class="nb rn">{i + 1}</b>')
                           + f'<span style="font-size:{rs}px">{esc(r["text"])}</span></div>' for i, r in enumerate(g["rows"]))
            inner = title + f'<div class="brows">{rows}</div>'
            for i, r in enumerate(g["rows"]):
                t = min(max(o_ + 1.0 + 0.15 * i, rel(r["at"])), o_ + L - 1.6)
                beats.append(f"tl.fromTo('#{sid}-r{i}', {{ opacity: 0, x: -60 }}, {{ opacity: 1, x: 0, duration: 0.45, ease: 'back.out(1.8)' }}, {q(t)});")
                if gkind == "checklist":
                    beats.append(f"tl.fromTo('#{sid}-r{i} .tk', {{ opacity: 0, scale: 0.3 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' }}, {q(t + 0.3)});")
        elif gkind == "stat":
            parts_ = num_parts(g["value"])
            start = esc(g["value"]) if not parts_ else esc(f"{parts_[0]}0{parts_[2]}")
            inner = ((f'<span class="chip ink" data-r="-2">{esc(g["title"])}</span>' if g.get("title") else "")
                     + f'<div class="bnum" id="{sid}-v" style="font-size:{fit(g["value"], zw, 1, 380, 100, 0.7)}px">{start}</div>'
                     + (f'<div class="hd sm" style="font-size:{fit(g["label"], zw, 2, 76, 40)}px">{words_html(g["label"])}</div>' if g.get("label") else ""))
            js(f"tl.fromTo('#{sid}-v', {{ opacity: 0, scale: 0.6, rotation: -6 }}, {{ opacity: 1, scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(2)' }}, {q(o_ + 0.6)});")
            if parts_:
                pre, n, post = parts_
                dec = 1 if n != int(n) else 0
                beats.append(f"(function(){{ const o={{v:0}}, el=document.querySelector('#{sid}-v'); tl.to(o, {{ v: {n}, duration: 1.3, ease: 'power2.out', onUpdate: () => {{ el.textContent = {json.dumps(pre)} + "
                             f"o.v.toLocaleString('en-US', {{ minimumFractionDigits: {dec}, maximumFractionDigits: {dec} }}) + {json.dumps(post)}; }} }}, {q(max(o_ + 0.7, rel(g['at'])))}); }})();")
        elif gkind == "compare":
            top = max(b["value"] for b in g["bars"]) or 1
            bars = "".join(f'<div class="bbar"><div class="bl"><span>{esc(b["label"])}</span><b>{esc(f"{b["value"]:,.0f}" if b["value"] == int(b["value"]) else b["value"])}</b></div>'
                           f'<div class="bt"><i id="{sid}-b{i}" class="{"hot" if i == len(g["bars"]) - 1 else ""}" style="width:{100 * b["value"] / top:.1f}%"></i></div></div>' for i, b in enumerate(g["bars"]))
            inner = title + f'<div class="bbars">{bars}</div>'
            for i in range(len(g["bars"])):
                beats.append(f"tl.fromTo('#{sid}-b{i}', {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.9, ease: 'power3.out' }}, {q(o_ + 1.1 + 0.35 * i)});")
        elif gkind == "quote":
            n_words = len(g["text"].split())
            qs = (84 if n_words <= 10 else 70 if n_words <= 16 else 60) if s["lay"] == "D" else (70 if n_words <= 10 else 60 if n_words <= 16 else 52)
            inner = (f'<div class="qm">&ldquo;</div><div class="bq" style="font-size:{qs}px">{words_html(g["text"], "wq")}</div>'
                     + (f'<div><span class="chip ink" data-r="-2">{esc(g["label"])}</span></div>' if g.get("label") else ""))
            beats.append(f"tl.fromTo('#{sid} .wq', {{ opacity: 0.18 }}, {{ opacity: 1, duration: 0.2, stagger: {min(0.22, max(0.08, (L - 3) / max(1, n_words))):.3f} }}, {q(o_ + 0.9)});")
            js(f"tl.fromTo('#{sid} .qm', {{ opacity: 0, scale: 2, rotation: -20 }}, {{ opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2)' }}, {q(o_ + 0.55)});")
        elif gkind == "message":
            app = {"email": "Email", "dm": "Direct message", "linkedin": "LinkedIn message", "text": "Text message"}.get(g.get("app") or "", "Message")
            inner = (f'<div class="bcard msg"><div class="mh"><span class="chip blue" data-r="0">{esc(app)}</span>' + (f'<span class="to">To {esc(g["title"])}</span>' if g.get("title") else "") + "</div>"
                     + f'<div class="mb">{words_html(g["text"], "wt")}</div></div>')
            n_words = len(g["text"].split())
            beats.append(f"tl.fromTo('#{sid} .wt', {{ opacity: 0 }}, {{ opacity: 1, duration: 0.05, stagger: {min(0.16, max(0.05, (L - 3) / max(1, n_words))):.3f} }}, {q(o_ + 1.0)});")
            js(f"tl.fromTo('#{sid} .bcard', {{ opacity: 0, y: 60, rotation: 4 }}, {{ opacity: 1, y: 0, rotation: -1.5, duration: 0.6, ease: 'back.out(1.6)' }}, {q(o_ + 0.5)});")
        elif gkind == "site":
            url = re.sub(r"^https?://", "", g["url"]).rstrip("/")
            inner = (f'<div class="bcard site"><div class="bw-top"><i></i><i></i><i></i><span>{esc(url)}</span></div>'
                     f'<div class="bw-view"><img id="{sid}-img" src="assets/{g["img"]}" style="width:{zw - 10}px" /></div></div>'
                     + (f'<div class="hd sm" style="font-size:{fit(g["title"], zw, 2, 72, 40)}px">{words_html(g["title"])}</div>' if g.get("title") else ""))
            beats.append(f"tl.fromTo('#{sid}-img', {{ y: 0 }}, {{ y: -520, duration: {max(2.0, L - 3.2):.2f}, ease: 'power1.inOut' }}, {q(o_ + 1.3)});")
            js(f"tl.fromTo('#{sid} .bcard', {{ opacity: 0, y: 60, rotation: 4 }}, {{ opacity: 1, y: 0, rotation: -1.5, duration: 0.6, ease: 'back.out(1.6)' }}, {q(o_ + 0.5)});")
        el(f'<div class="zone" id="{sid}" style="{zone_style(lay)}">{inner}</div>', o_, L)
        board_in(sid, o_, L)
        for b in beats:
            js(b)

CSS = """
@font-face { font-family: "Libre Franklin"; src: url("assets/fonts/LibreFranklin-VF.ttf") format("truetype"); font-weight: 100 900; }
@font-face { font-family: "Poppins"; src: url("assets/fonts/Poppins-Regular.ttf") format("truetype"); font-weight: 400; }
@font-face { font-family: "Poppins"; src: url("assets/fonts/Poppins-SemiBold.ttf") format("truetype"); font-weight: 600; }
:root { --y: #ffc530; --ink: #0f0f0f; --blue: #38b6ff; --board: #1e4e6e; }
html, body { margin: 0; background: #1e4e6e; }
#root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #1e4e6e; font-family: "Poppins", sans-serif; color: #0f0f0f; }
.L, .c { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; pointer-events: none; }
/* the board: harbor blue with a faint white dot grid, so it reads as a surface, not a flat fill; yellow is only an accent */
#bg { background-color: #1e4e6e; background-image: radial-gradient(rgba(255, 255, 255, 0.075) 2.2px, transparent 2.6px); background-size: 34px 34px; }
#frame { position: absolute; left: -16px; top: -16px; width: 1952px; height: 1112px; background: #ffffff; border-radius: 26px; box-shadow: 16px 16px 0 #0f0f0f; }
#camw { overflow: hidden; transform-origin: 0 0; will-change: transform; }
#camw video { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
.wm { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.06em; margin-bottom: -0.06em; }
.wi, .wq, .wt { display: inline-block; }
.zone { position: absolute; box-sizing: border-box; }
.zone > * + * { margin-top: 26px; }
.hd { font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.025em; line-height: 0.92; color: #ffffff; }
.ln, .bq, .brow, .bl { color: #ffffff; }
.hd.sm { line-height: 0.96; }
.nb { color: #38b6ff; -webkit-text-stroke: 0.045em #0f0f0f; paint-order: stroke fill; }
.chip, .st { display: inline-block; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; line-height: 1; letter-spacing: 0.01em; border-radius: 12px; }
.chip { font-size: 32px; padding: 13px 18px 12px; }
.chip.ink { background: #0f0f0f; color: #ffffff; }
.chip.blue { background: #38b6ff; color: #0f0f0f; }
/* the booking button is the one yellow block on the end card */
.chip.cta { font-size: 50px; padding: 20px 26px 18px; background: #ffc530; color: #0f0f0f; box-shadow: 10px 10px 0 #0f0f0f; }
.st { font-size: 40px; padding: 16px 22px 14px; box-shadow: 9px 9px 0 #0f0f0f; }
.st.url { white-space: nowrap; text-transform: lowercase; }
.st.white { background: #ffffff; color: #0f0f0f; }
.st.yellow { background: #ffc530; color: #0f0f0f; }
.st.blue { background: #38b6ff; color: #0f0f0f; }
.st.ink { background: #0f0f0f; color: #ffffff; box-shadow: 9px 9px 0 rgba(15, 15, 15, 0.35); }
.ln { font-weight: 600; font-size: 40px; line-height: 1.22; }
.ln.big { font-size: 46px; }
/* lists on the board */
.brows { margin-top: 22px; }
.brow { display: flex; align-items: center; gap: 26px; min-height: 104px; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.015em; line-height: 0.98; }
.brow + .brow { margin-top: 8px; }
.rn { font-family: "Libre Franklin", sans-serif; font-weight: 900; font-size: 92px; width: 78px; flex: none; text-align: center; }
.bck { width: 70px; height: 70px; flex: none; background: #ffffff; border: 6px solid #0f0f0f; border-radius: 12px; box-shadow: 6px 6px 0 #0f0f0f; box-sizing: border-box; position: relative; }
.tk { position: absolute; left: 18px; top: 2px; width: 16px; height: 34px; border: solid #0f0f0f; border-width: 0 8px 8px 0; transform-origin: 50% 50%; }
.tk { rotate: 45deg; }
.bnum { font-family: "Libre Franklin", sans-serif; font-weight: 900; line-height: 0.86; letter-spacing: -0.045em; color: #ffc530; -webkit-text-stroke: 10px #0f0f0f; paint-order: stroke fill; text-shadow: 14px 14px 0 #0f0f0f; font-variant-numeric: tabular-nums; }
.bbars { margin-top: 26px; }
.bbar + .bbar { margin-top: 30px; }
.bl { display: flex; justify-content: space-between; align-items: baseline; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; font-size: 40px; margin-bottom: 12px; }
.bl b { font-size: 52px; }
.bt { height: 58px; background: #ffffff; border: 6px solid #0f0f0f; border-radius: 14px; box-shadow: 8px 8px 0 #0f0f0f; overflow: hidden; box-sizing: border-box; }
.bt i { display: block; height: 100%; background: #0f0f0f; transform-origin: 0 50%; }
.bt i.hot { background: #38b6ff; }
.qm { font-family: "Libre Franklin", sans-serif; font-weight: 900; font-size: 380px; line-height: 0.62; height: 170px; color: #38b6ff; -webkit-text-stroke: 10px #0f0f0f; paint-order: stroke fill; }
.bq { font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
.bcard { background: #ffffff; color: #0f0f0f; border: 6px solid #0f0f0f; border-radius: 22px; box-shadow: 16px 16px 0 #0f0f0f; overflow: hidden; }
.bcard.msg { padding: 34px 38px 38px; }
.mh { display: flex; align-items: center; gap: 18px; padding-bottom: 20px; border-bottom: 3px solid #0f0f0f; }
.mh .to { font-size: 32px; font-weight: 600; color: #444444; }
.mb { margin-top: 24px; font-size: 42px; line-height: 1.34; }
.bw-top { height: 54px; background: #eef0f3; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 4px solid #0f0f0f; }
.bw-top i { width: 14px; height: 14px; border-radius: 50%; background: #0f0f0f; opacity: 0.25; }
.bw-top span { margin-left: 14px; flex: 1; height: 34px; line-height: 34px; border-radius: 17px; background: #ffffff; font-size: 20px; font-weight: 600; color: #333333; padding: 0 16px; overflow: hidden; white-space: nowrap; }
.bw-view { height: 500px; overflow: hidden; background: #ffffff; }
.bw-view img { display: block; }
.scr { position: absolute; left: 70px; top: 80px; background: #ffffff; border: 6px solid #0f0f0f; border-radius: 22px; overflow: hidden; box-shadow: 18px 18px 0 #0f0f0f; }
.scr video { display: block; height: auto; }
/* chapter break on the board */
.bign { height: 250px; }
.bign .k { display: inline-block; font-family: "Libre Franklin", sans-serif; font-weight: 900; font-size: 300px; line-height: 0.8; letter-spacing: -0.05em; color: #ffc530; -webkit-text-stroke: 12px #0f0f0f; paint-order: stroke fill; text-shadow: 16px 16px 0 #0f0f0f; }
/* kinetic layers: content hovering over the footage */
.kz { position: absolute; display: flex; flex-direction: column; box-sizing: border-box; }
.kz br { display: none; }
.kz > * + * { margin-top: 18px; }
.kz .st { width: fit-content; max-width: 100%; box-sizing: border-box; }
.kname { font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; line-height: 0.9; letter-spacing: -0.025em; color: #ffffff; text-shadow: 0 8px 0 #0f0f0f, 0 0 34px rgba(0, 0, 0, 0.35); }
.onum { font-family: "Libre Franklin", sans-serif; font-weight: 900; line-height: 0.8; letter-spacing: -0.04em; color: #ffc530; -webkit-text-stroke: 10px #0f0f0f; paint-order: stroke fill; text-shadow: 16px 16px 0 #0f0f0f; font-variant-numeric: tabular-nums; }
.kz .row { display: flex; align-items: center; gap: 16px; }
.kz .row b { background: #1e4e6e; color: #ffffff; border-radius: 8px; padding: 6px 12px 4px; font-size: 0.9em; }
.fly { background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 34px 80px rgba(0, 0, 0, 0.5), 12px 12px 0 #0f0f0f; transform: perspective(1500px) rotateY(10deg); }
.fly .bw-view img { display: block; }
"""

doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<script src="assets/vendor/gsap.min.js"></script>
<style>{CSS}</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{max(TOTAL, 0.5)}" data-width="{W}" data-height="{H}">
<div id="bg" class="L"></div>
<div id="frame"></div>
<div id="camw" class="L">
  <video id="base" class="clip" src="assets/segbase.mp4" data-start="0" data-duration="{max(TOTAL, 0.5)}" data-track-index="0" muted playsinline></video>
</div>
<div id="ui" class="L">
{chr(10).join(UI)}
</div>
</div>
<script>
(function () {{
  const tl = gsap.timeline({{ paused: true }});
  {(chr(10) + '  ').join(JS)}
  tl.set({{}}, {{}}, {max(TOTAL, 0.5)});
  window.__timelines = window.__timelines || {{}};
  window.__timelines["main"] = tl;
}})();
</script>
</body>
</html>
"""
(COMP / "index.html").write_text(recolor(doc, ST["palette"]))
json.dump([{k: v for k, v in s.items() if k not in ("g",)} | ({"graphic": s["g"]["kind"]} if s["kind"] == "graphic" else {}) for s in SEGS],
          open("work/segments.json", "w"), indent=1)
kinds = {}
for s in SEGS:
    kinds[s["kind"]] = kinds.get(s["kind"], 0) + 1
looks = {}
for s in SEGS:
    lk = s.get("look", "") + (f" {s['lay']}" if s.get("lay") else "")
    looks[lk] = looks.get(lk, 0) + 1
print(f"moments: {len(SEGS)} ({', '.join(f'{v} {k}' for k, v in kinds.items())}), {TOTAL:.1f} s to animate; looks: "
      + ", ".join(f"{v} {k}" for k, v in sorted(looks.items())), flush=True)
