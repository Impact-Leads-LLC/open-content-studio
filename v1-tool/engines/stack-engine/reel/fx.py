#!/usr/bin/env python3
"""The effect library for the reel look, loaded by build_auto.py.

Seventeen edit effects the editor and the coach can reach for. Each one is drawn in the studio's brand (the dark ink
room, one accent, white boxes with near-black ink, Libre Franklin caps titles, Poppins text); the colours written
here are the shipped defaults, and build_auto.py swaps in the studio's palette when it writes the page (studio.py):

  behind the speaker (a cut-out of the person, made only for the seconds the effect is on screen):
    orbit      01  word chips circle the speaker, passing behind and in front
    wall       02  a wall of moments from the episode behind the speaker
    frame      04  the speaker inside a social post, the head breaking out of the photo
    headlines  08  paper clippings of what people say pin up behind the speaker
    chart      10  a line chart grows behind the speaker (real numbers only)
    screen     12  (device "behind") the speaker in front of the app they're talking about
    paper      13  paper collage: the speaker as a cut-out sticker, scribbles, a counter
    doodle     14  a hand-drawn outline boils around the speaker, marks draw themselves
    vertigo    15  the room falls back while the speaker holds still
    cover      16  magazine cover: a masthead behind the head, cover lines
    glass      17  a glass word standing in the room behind the speaker
  no cut-out:
    screen     03  (device "split") the app on top, the speaker underneath
    screen     06  (device "phone") a phone beside the speaker showing it
    checklist  07  a box of steps that tick off as they're said, with a counter
    punch      05  a hard digital zoom on one word
    zoom-through 09  a zoom-blur transition at a jump cut
    pullback   11  the ending pulls back into the episode's player, then the end card

build_auto.py calls init(globals()) so these functions share its helpers (tw, to, st, clip, sfx, m, LAYERS, ...).
"""
import json
import math
import os
import random
import shlex
import subprocess

HF = os.environ.get("HF_CLI", "npx --yes hyperframes@0.8.143")
CUTOUT_KINDS = {"orbit", "wall", "frame", "headlines", "chart", "paper", "doodle", "cover", "glass"}
NAVY, BLUE, INK = "#0b1b27", "#38b6ff", "#111111"


def init(ns):
    globals().update({k: v for k, v in ns.items() if not k.startswith("__") and k not in ("init",)})


def needs_cutout(g):
    kind = g.get("kind") or ""
    return kind in CUTOUT_KINDS or (kind == "screen" and (g.get("device") or "") == "behind")


# ---- the cut-out -----------------------------------------------------------------------------------------------------
CUT_LOG = []
SKIPPED = []         # effects left out because something failed (the reel goes on without them)


def cutout(gid, a, b, side, plate=True):
    """The speaker cut out of the one-face shot for cut seconds a..b, in the solo framing (it fills the screen):
    assets/{gid}-fg.webm (the person, the rest transparent) and, with plate, assets/{gid}-bg.webm (the room with a
    hole where the person is). Both come from one pass of HyperFrames' remove-background, so they fit each other."""
    a, b = q(max(0.0, a)), q(min(VID, b))
    CUT_LOG.append(round(b - a, 2))
    if os.environ.get("FX_DRY") == "1":           # a quick build of the page without making the cut-outs
        return a, b
    crop = f"crop=540:960:270:{0 if side == 'top' else 960}" if STACK else "null"
    # a rebuild of the same cut reuses the cut-out (local iteration; the cloud machine starts fresh every time)
    key, keyf = f"{a}:{b}:{crop}:{plate}", ROOT / f"work/{gid}-cut.key"
    outs = [ROOT / f"assets/{gid}-fg.webm"] + ([ROOT / f"assets/{gid}-bg.webm"] if plate else [])
    ready = all(o.exists() and o.stat().st_size for o in outs)
    if ready and ((keyf.exists() and keyf.read_text() == key) or os.environ.get("FX_ADOPT") == "1"):
        keyf.write_text(key)
        return a, b
    src = ROOT / f"work/{gid}-src.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.4f}", "-t", f"{b - a:.4f}", "-i", str(ROOT / "assets/moody.mp4"),
                    "-vf", f"{crop},format=yuv420p", "-an", "-c:v", "libx264", "-crf", "12", "-preset", "veryfast", str(src)], check=True)
    cmd = shlex.split(HF) + ["remove-background", str(src), "-o", f"assets/{gid}-fg.webm", "--device", "cpu"]
    if plate:
        cmd += ["--background-output", f"assets/{gid}-bg.webm"]
    # a slow or stuck cut-out is given up on (the effect is left out and the reel goes on) instead of using up the machine
    with open(ROOT / f"work/{gid}-cutout.log", "w") as log:
        subprocess.run(cmd, check=True, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=int(os.environ.get("FX_CUT_TIMEOUT", "600")))
    keyf.write_text(key)
    return a, b


def head(gid):
    """Where the speaker's head sits in a cut-out, in screen pixels: (top y, centre x, width), read from the person's
    outline half a second in. None when there is no cut-out to read (a dry build) or the outline can't be read."""
    f = ROOT / f"assets/{gid}-fg.webm"
    if not f.exists():
        return None
    try:
        sw, sh = 108, 192          # a tenth of the frame: each sample is 10 screen pixels
        raw = subprocess.run(["ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-ss", "0.5", "-i", str(f), "-vf", f"alphaextract,scale={sw}:{sh}",
                              "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True, timeout=60).stdout
        rows = [raw[y * sw:(y + 1) * sw] for y in range(len(raw) // sw)]
        top = next(y for y, r in enumerate(rows) if sum(v > 128 for v in r) >= 2)
        spans = [(xs[0], xs[-1]) for xs in ([x for x, v in enumerate(r) if v > 128] for r in rows[top:top + 20]) if xs]
        return top * 10, round(sum((l + r) / 2 for l, r in spans) / len(spans) * 10), max(r - l for l, r in spans) * 10
    except Exception:  # noqa: BLE001
        return None


def vid(gid, which, a, b, track):
    return (f'<div class="L fxv" id="{gid}-{which}w"><video id="{gid}-{which}" class="clip" src="assets/{gid}-{which}.webm" '
            f'data-start="{a:.4f}" data-duration="{q(b - a):.4f}" data-track-index="{track}" muted playsinline></video></div>')


def sandwich(gid, a, b, under="", mid="", over="", plate=True, fg_style=""):
    """One effect's layers, bottom to top: something that replaces the room (under), the room with a hole (the plate),
    what sits behind the speaker (mid), the speaker, what sits in front (over). Hidden outside a..b."""
    fg = vid(gid, "fg", a, b, 7)
    if fg_style:
        fg = fg.replace('class="L fxv"', f'class="L fxv" style="{fg_style}"', 1)
    LAYERS["ui"].append(f'<div id="{gid}" class="L fxw" style="opacity:0">'
                        f'<div class="L" id="{gid}-under">{under}</div>'
                        + (vid(gid, "bg", a, b, 6) if plate else "")
                        + f'<div class="L" id="{gid}-mid">{mid}</div>{fg}<div class="L" id="{gid}-over">{over}</div></div>')
    st(f"#{gid}", "{ opacity: 1 }", a + 1 / 30)
    st(f"#{gid}", "{ opacity: 0 }", b - 1 / 30)


def words_spans(gid, text, cls="mw"):
    words = str(text).split()
    return words, " ".join(f'<span class="{cls}" id="{gid}-w{i}">{esc(w)}</span>' for i, w in enumerate(words))


def type_in(gid, n, t, per=None):
    """The words of a message appear one by one from t; returns when the last one is in."""
    per = per or min(0.14, 3.0 / max(1, n))
    for i in range(n):
        st(f"#{gid}-w{i}", "{ opacity: 1 }", t + i * per)
    if n:
        sfx("click-soft", t, 0.04)
        MOTION.append((t - 0.1, t + n * per + 0.3))
    return t + n * per


def fit_px(text, width, size, em=0.62, lo=40):
    return max(lo, min(size, int(width / max(1, len(str(text)) * em))))


# ---- 16 cover story --------------------------------------------------------------------------------------------------
def cover(gid, g, t0, t1, side):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    word = str(g.get("title") or g.get("text") or "").upper()[:12]
    size = fit_px(word, 1010, 340, 0.64, 120)
    lines = [str(x) for x in (g.get("lines") or []) if x][:3]
    label = str(g.get("label") or "")
    letters = "".join(f'<span class="cv-l">{esc(ch) if ch != " " else "&nbsp;"}</span>' for ch in word)
    mid = (f'<div class="cv-shade"></div><div class="cv-mast" style="font-size:{size}px;line-height:{int(size * 0.86)}px">{letters}</div>')
    over = ((f'<div class="cv-issue">{esc(label)}</div>' if label else "")
            + '<div class="cv-lines">' + "".join(f'<div class="cv-line"><i></i>{esc(x)}</div>' for x in lines) + "</div>")
    sandwich(gid, a, b, mid=mid, over=over)
    tw(f"#{gid} .cv-shade", "{ opacity: 0 }", "{ opacity: 1 }", t0, 0.4, "power1.out")
    tw(f"#{gid} .cv-l", "{ yPercent: 70, opacity: 0 }", "{ yPercent: 0, opacity: 1 }", t0 + 0.1, 0.55, "power3.out", ", stagger: 0.05")
    tw(f"#{gid} .cv-issue", "{ opacity: 0, x: -20 }", "{ opacity: 1, x: 0 }", t0 + 0.5, 0.4, "power3.out")
    tw(f"#{gid} .cv-line", "{ opacity: 0, x: -30 }", "{ opacity: 1, x: 0 }", t0 + 0.7, 0.45, "power3.out", ", stagger: 0.35")
    to(f"#{gid} #{gid}-mid, #{gid} #{gid}-over", "{ opacity: 0 }", t1, 0.35, "power2.in")
    sfx("whoosh-short", t0 + 0.05, 0.06)
    MOTION.append((t0, t0 + 1.6))


# ---- 17 glass type ---------------------------------------------------------------------------------------------------
def glass(gid, g, t0, t1, side):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    word = str(g.get("title") or g.get("text") or "").upper()[:10]
    size = fit_px(word, 980, 300, 0.7, 120)
    y = 470
    text = (f'x="540" y="{y}" text-anchor="middle" font-family="Libre Franklin" font-weight="900" font-size="{size}" '
            f'letter-spacing="-4"')
    mid = (f'<svg class="gl-defs" width="0" height="0"><defs><clipPath id="{gid}-cp" clipPathUnits="userSpaceOnUse">'
           f'<text {text}>{esc(word)}</text></clipPath><linearGradient id="{gid}-gr" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.45" stop-color="#ffffff" stop-opacity="0.08"/>'
           f'<stop offset="1" stop-color="{BLUE}" stop-opacity="0.25"/></linearGradient></defs></svg>'
           f'<div class="L gl-in" id="{gid}-gl"><div class="L gl-glass" style="clip-path:url(#{gid}-cp)"></div>'
           f'<svg class="L gl-edge" viewBox="0 0 1080 1920"><text {text} fill="url(#{gid}-gr)" stroke="rgba(255,255,255,0.85)" '
           f'stroke-width="2.5">{esc(word)}</text></svg></div>')
    sandwich(gid, a, b, mid=mid)
    tw(f"#{gid}-gl", "{ opacity: 0, y: 60, scale: 0.92, transformOrigin: '540px 400px' }", "{ opacity: 1, y: 0, scale: 1 }", t0 + 0.1, 0.9, "expo.out")
    to(f"#{gid}-gl", "{ y: -14 }", t0 + 1.0, max(0.5, t1 - t0 - 1.0), "sine.inOut")
    to(f"#{gid}-gl", "{ opacity: 0, y: -40 }", t1, 0.35, "power2.in")
    sfx("whoosh", t0 + 0.05, 0.05)
    MOTION.append((t0, t0 + 1.2))


# ---- 10 chart grow ---------------------------------------------------------------------------------------------------
def chart(gid, g, t0, t1, side):
    pts = [p for p in (g.get("bars") or []) if p.get("label")][:5]
    vals = [float(p.get("value") or 0) for p in pts]
    if len(pts) < 2:
        return False
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    X0, X1, Y0, Y1 = 110, 970, 560, 230
    lo, hi = min(vals + [0]), max(vals) or 1
    xy = [(X0 + (X1 - X0) * i / (len(pts) - 1), Y0 - (Y0 - Y1) * (v - lo) / max(1e-9, hi - lo)) for i, v in enumerate(vals)]
    path = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in xy)
    area = path + f" L {X1} {Y0 + 40} L {X0} {Y0 + 40} Z"
    grid = "".join(f'<line x1="{X0}" x2="{X1}" y1="{y}" y2="{y}"/>' for y in (Y1, (Y0 + Y1) / 2, Y0))
    dots = "".join(f'<circle id="{gid}-d{i}" cx="{x:.1f}" cy="{y:.1f}" r="13"/>' for i, (x, y) in enumerate(xy))
    labs = "".join(f'<div class="ch-lab" id="{gid}-l{i}" style="left:{x:.0f}px;top:{y - 74:.0f}px">{esc(p["label"])}</div>'
                   for i, ((x, y), p) in enumerate(zip(xy, pts)))
    title = str(g.get("title") or "")
    mid = (f'<div class="ch-shade"></div>' + (f'<div class="ch-title">{esc(title)}</div>' if title else "")
           + f'<svg class="L chg" viewBox="0 0 1080 1920"><defs><linearGradient id="{gid}-ar" x1="0" y1="0" x2="0" y2="1">'
           f'<stop offset="0" stop-color="{BLUE}" stop-opacity="0.38"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/></linearGradient></defs>'
           f'<clipPath id="{gid}-ac"><rect id="{gid}-acr" x="0" y="0" width="{xy[0][0]:.0f}" height="1920"/></clipPath>'
           f'<g class="ch-grid">{grid}</g><path id="{gid}-area" d="{area}" fill="url(#{gid}-ar)" clip-path="url(#{gid}-ac)"/>'
           f'<path id="{gid}-line" class="ch-line" d="{path}" pathLength="1"/><g class="ch-dots">{dots}</g></svg>{labs}')
    sandwich(gid, a, b, mid=mid)
    tw(f"#{gid} .ch-shade, #{gid} .ch-grid, #{gid} .ch-title", "{ opacity: 0 }", "{ opacity: 1 }", t0, 0.4, "power1.out")
    # the line grows point to point as each number is said
    seg = 1 / (len(pts) - 1)
    prev = t0 + 0.3
    for i, p in enumerate(pts):
        t = max(prev + (0 if i == 0 else 0.6), m(p.get("at") or 0))
        if i:
            js(f"tl.to('#{gid}-line', {{ strokeDashoffset: {1 - seg * i:.4f}, duration: 0.6, ease: 'power2.inOut' }}, {q(t - 0.6)});")
            js(f"tl.to('#{gid}-acr', {{ attr: {{ width: {xy[i][0]:.0f} }}, duration: 0.6, ease: 'power2.inOut' }}, {q(t - 0.6)});")
        tw(f"#{gid}-d{i}", "{ scale: 0, transformOrigin: '50% 50%' }", "{ scale: 1 }", t, 0.35, "back.out(3)")
        tw(f"#{gid}-l{i}", "{ opacity: 0, y: 14 }", "{ opacity: 1, y: 0 }", t, 0.35, "power3.out")
        sfx("click-soft", t, 0.08)
        prev = t
    st(f"#{gid}-line", "{ strokeDashoffset: 1 }", a)
    st(f"#{gid}-acr", f"{{ attr: {{ width: {xy[0][0]:.0f} }} }}", a)
    js(f"tl.fromTo('#{gid}-l{len(pts) - 1}', {{ scale: 1 }}, {{ scale: 1.12, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' }}, {q(prev + 0.35)});")
    to(f"#{gid}-mid", "{ opacity: 0 }", t1, 0.35, "power2.in")
    MOTION.append((t0, prev + 0.8))
    return True


# ---- 08 headline wall ------------------------------------------------------------------------------------------------
SPOTS = [(70, 300, -5), (600, 250, 4), (60, 640, 3), (640, 600, -4), (330, 140, -2), (700, 900, 5)]


def headlines(gid, g, t0, t1, side):
    rows = [r for r in (g.get("rows") or []) if r.get("text")][:6]
    if not rows:
        rows = [{"text": x, "at": 0} for x in (g.get("lines") or []) if x][:6]
    if not rows:
        return False
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    notes = "".join(f'<div class="hl" id="{gid}-n{i}" style="left:{x}px;top:{y}px;transform:rotate({r}deg)">'
                    f'<div class="hl-t" style="font-size:{fit_px(row["text"], 600, 46, 0.5, 30)}px">{esc(row["text"])}</div></div>'
                    for i, (row, (x, y, r)) in enumerate(zip(rows, SPOTS)))
    sandwich(gid, a, b, mid=notes)
    prev = t0 + 0.1
    for i, row in enumerate(rows):
        t = max(prev + (0 if i == 0 else 0.45), m(row.get("at") or 0))
        tw(f"#{gid}-n{i}", "{ opacity: 0, scale: 1.35 }", "{ opacity: 1, scale: 1 }", t, 0.3, "power4.out")
        sfx("click", t + 0.05, 0.08)
        prev = t
    to(f"#{gid}-mid", "{ opacity: 0 }", t1, 0.35, "power2.in")
    MOTION.append((t0, prev + 0.5))
    return True


# ---- 01 orbit --------------------------------------------------------------------------------------------------------
ORBIT_JS = """(function(){ const n=__N__, cx=__CX__, cy=__CY__, rx=__RX__, ry=__RY__, k=Math.cos(-0.08), s=Math.sin(-0.08), F=[], B=[];
  for (let i = 0; i < n; i++) { F.push(document.getElementById('__G__-f' + i)); B.push(document.getElementById('__G__-b' + i)); }
  const o = { a: 0.6 };
  const place = () => { for (let i = 0; i < n; i++) { const th = o.a + i * 2 * Math.PI / n, ex = rx * Math.cos(th), ey = ry * Math.sin(th);
    const x = cx + ex * k - ey * s, y = cy + ex * s + ey * k, z = Math.sin(th), sc = 0.78 + 0.3 * (z + 1) / 2;
    const tr = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-50%) scale(' + sc.toFixed(3) + ')';
    F[i].style.transform = tr; B[i].style.transform = tr; F[i].style.opacity = z > 0 ? 1 : 0; B[i].style.opacity = z > 0 ? 0 : 0.92; } };
  place();
  tl.to(o, { a: 0.6 + __TURNS__ * 2 * Math.PI, duration: __D__, ease: 'none', onUpdate: place }, __T0__); })();"""


def orbit(gid, g, t0, t1, side):
    rows = [r for r in (g.get("rows") or []) if r.get("text")][:6]
    if len(rows) < 2:
        return False
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    # The ring circles the top of the head (a ring at mouth height put chips on the speaker's chin and pushed long ones
    # off the frame). The front pass crosses above the brows, the back pass goes behind the head,
    # the eyes, mouth and captions stay clear, and every chip stays inside the frame.
    top, hx, hw = head(gid) or (380, 540, 520)     # without a cut-out to read: a typical one-face framing
    longest = max(len(str(r["text"])) for r in rows)
    fs = max(30, min(46, int(350 / (longest * 0.66))))        # the widest chip about 390 px at full size
    half = (longest * 0.66 * fs + 1.1 * fs) / 2 * 1.08          # half the widest chip at its largest (front) scale
    rx = max(200, min(hw / 2 + 140, 540 - 24 - half))
    cx = min(max(hx, 24 + half + rx), 1056 - half - rx)
    ry = round(0.11 * hw)
    cy = round(top + 0.25 * hw - ry)
    chip = lambda i, r, w: f'<div class="orb-p" id="{gid}-{w}{i}"><div class="orb-c" style="font-size:{fs}px">{esc(r["text"])}</div></div>'  # noqa: E731
    mid = "".join(chip(i, r, "b") for i, r in enumerate(rows))
    over = "".join(chip(i, r, "f") for i, r in enumerate(rows))
    title = str(g.get("title") or "")
    if title:
        over += f'<div class="orb-title" style="top:{max(110, top - 230)}px"><div class="jt2">{esc(title)}</div></div>'
    sandwich(gid, a, b, mid=mid, over=over)
    d = round(b - t0, 3)
    js(ORBIT_JS.replace("__N__", str(len(rows))).replace("__G__", gid).replace("__CX__", f"{cx:.0f}").replace("__CY__", str(cy))
       .replace("__RX__", f"{rx:.0f}").replace("__RY__", str(ry))
       .replace("__TURNS__", f"{max(0.5, d / 6.5):.3f}").replace("__D__", f"{d}").replace("__T0__", f"{q(t0)}"))
    prev = t0 + 0.15
    for i, r in enumerate(rows):
        t = max(prev + (0 if i == 0 else 0.35), m(r.get("at") or 0))
        tw(f"#{gid}-f{i} .orb-c, #{gid}-b{i} .orb-c", "{ scale: 0, opacity: 0 }", "{ scale: 1, opacity: 1 }", t, 0.4, "back.out(2.2)")
        sfx("pop", t, 0.04)
        prev = t
    if title:
        tw(f"#{gid} .orb-title .jt2", "{ opacity: 0, y: 20 }", "{ opacity: 1, y: 0 }", t0 + 0.2, 0.4, "power3.out")
    to(f"#{gid}-mid, #{gid}-over", "{ opacity: 0 }", t1, 0.35, "power2.in")
    MOTION.append((t0, prev + 0.6))
    return True


# ---- 02 couch wall: a wall of moments from the episode behind the speaker -------------------------------------------
def wall(gid, g, t0, t1, side):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side, plate=False)
    d = round(b - a, 3)
    # 12 tiles (3 x 4), each a different moment of the clip, alternating the two cameras
    span = max(1.0, VID - d - 1)
    starts = [round((0.5 + i * span / 12) % span, 2) for i in range(12)]
    halves = ["270:0", "270:960"] if STACK else ["0:240"]
    ins, chains = [], []
    for i, s0 in enumerate(starts):
        ins += ["-ss", f"{s0:.2f}", "-t", f"{d:.3f}", "-i", str(ROOT / "assets/moody.mp4")]
        crop = f"crop=540:720:{halves[i % len(halves)]}" if STACK else "crop=1080:1440:0:240"
        chains.append(f"[{i}:v]{crop},scale=352:470,setsar=1,eq=brightness=-0.05:saturation=0.85,pad=360:480:4:5:color=0x0b1b27[t{i}]")
    layout = "|".join(f"{(i % 3) * 360}_{(i // 3) * 480}" for i in range(12))
    out = ROOT / f"assets/{gid}-tiles.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(chains) + ";" + "".join(f"[t{i}]" for i in range(12))
                    + f"xstack=inputs=12:layout={layout},format=yuv420p[v]", "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "20",
                    "-preset", "veryfast", str(out)], check=True)
    covers = "".join(f'<div class="wl-c" style="left:{(i % 3) * 360}px;top:{(i // 3) * 480}px"></div>' for i in range(12))
    under = (f'<div class="L" style="background:{NAVY}"></div><div class="L fxv wl-v"><video id="{gid}-tv" class="clip" src="assets/{gid}-tiles.mp4" '
             f'data-start="{a:.4f}" data-duration="{d:.4f}" data-track-index="8" muted playsinline></video></div>'
             f'<div class="L wl-dim"></div><div class="L" id="{gid}-covers">{covers}</div>')
    title = str(g.get("title") or "")
    over = f'<div class="wl-title"><div class="jt2">{esc(title)}</div></div>' if title else ""
    sandwich(gid, a, b, under=under, over=over, plate=False)
    order = sorted(range(12), key=lambda i: abs(i % 3 - 1) + abs(i // 3 - 1.5))
    for k, i in enumerate(order):
        st(f"#{gid}-covers .wl-c:nth-child({i + 1})", "{ opacity: 1 }", a)
        to(f"#{gid}-covers .wl-c:nth-child({i + 1})", "{ opacity: 0 }", t0 + 0.1 + k * 0.06, 0.25, "power1.out")
    tw(f"#{gid} .wl-v", "{ scale: 1.18, transformOrigin: '540px 900px' }", "{ scale: 1 }", t0, 1.2, "expo.out")
    if title:
        tw(f"#{gid} .wl-title .jt2", "{ opacity: 0, scale: 0.8 }", "{ opacity: 1, scale: 1 }", t0 + 0.7, 0.4, "back.out(2)")
    sfx("whoosh-short", t0, 0.07)
    MOTION.append((t0, t0 + 1.4))


# ---- 13 paper cut ----------------------------------------------------------------------------------------------------
def scribble(seed, x, y, w, h, n=7):
    r = random.Random(seed)
    pts = [(x + w * i / n + r.uniform(-8, 8), y + (h if i % 2 else 0) + r.uniform(-10, 10)) for i in range(n + 1)]
    return "M " + " L ".join(f"{px:.0f} {py:.0f}" for px, py in pts)


def paper(gid, g, t0, t1, side):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side, plate=False)
    title = str(g.get("title") or "").upper()[:16]
    value = str(g.get("value") or "")
    r = random.Random(gid)
    torn = " ".join(f"{x},{y + r.uniform(-14, 14):.0f}" for x, y in [(-40, 980), (200, 900), (420, 940), (700, 860), (1120, 820)]) + " " + \
        " ".join(f"{x},{y + r.uniform(-14, 14):.0f}" for x, y in [(1120, 1160), (760, 1220), (480, 1180), (220, 1260), (-40, 1240)])
    marks = "".join(f'<path class="pp-s" pathLength="1" d="{scribble(gid + str(i), x, y, w, h)}"/>' for i, (x, y, w, h) in
                    enumerate([(90, 600, 260, 110), (720, 1290, 280, 90)]))
    xs = "".join(f'<path class="pp-x" pathLength="1" d="M {x - 18} {y - 18} L {x + 18} {y + 18} M {x + 18} {y - 18} L {x - 18} {y + 18}"/>'
                  for x, y in [(860, 300), (930, 360), (150, 1420)])
    under = (f'<div class="L pp-bg"></div><svg class="L" viewBox="0 0 1080 1920"><filter id="{gid}-grain"><feTurbulence '
             f'type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.09 0"/>'
             f'</filter><rect width="1080" height="1920" filter="url(#{gid}-grain)"/>'
             f'<polygon class="pp-torn" id="{gid}-torn" points="{torn}"/><g id="{gid}-marks">{marks}{xs}</g></svg>')
    over = ""
    if title:
        over += f'<div class="pp-title" id="{gid}-title">{esc(title)}</div>'
    parts = num_parts(value) if value else None
    if parts:
        pre, n, post = parts
        digits = f"{int(n):,}" if n == int(n) else str(n)
        over += (f'<div class="pp-count" id="{gid}-count">' + (f'<span class="pp-fix">{esc(pre)}</span>' if pre else "")
                 + "".join(f'<span class="pp-d" id="{gid}-c{i}">0</span>' if ch.isdigit() else f'<span class="pp-fix">{esc(ch)}</span>'
                           for i, ch in enumerate(digits)) + (f'<span class="pp-fix">{esc(post.strip())}</span>' if post.strip() else "") + "</div>")
    sandwich(gid, a, b, under=under, over=over, plate=False,
             fg_style="filter: drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff)")
    tw(f"#{gid}-torn", "{ scaleX: 0, transformOrigin: '0px 1000px' }", "{ scaleX: 1 }", t0 + 0.05, 0.45, "power3.out")
    js(f"tl.fromTo('#{gid}-marks path', {{ strokeDashoffset: 1 }}, {{ strokeDashoffset: 0, duration: 0.5, ease: 'power1.inOut', stagger: 0.12 }}, {q(t0 + 0.3)});")
    tw(f"#{gid}-fgw", "{ scale: 1.06, rotation: -1.5, transformOrigin: '540px 1500px' }", "{ scale: 1, rotation: 0 }", t0, 0.5, "back.out(2)")
    if title:
        tw(f"#{gid}-title", "{ opacity: 0, rotation: -8, scale: 1.3 }", "{ opacity: 1, rotation: -3, scale: 1 }", t0 + 0.35, 0.4, "back.out(2)")
    if parts:
        tc = max(t0 + 0.6, m(g.get("at") or 0))
        ds = [ch for ch in digits if ch.isdigit()]
        idx = [i for i, ch in enumerate(digits) if ch.isdigit()]
        tw(f"#{gid}-count", "{ opacity: 0, y: 30 }", "{ opacity: 1, y: 0 }", tc - 0.3, 0.35, "power3.out")
        for k in range(10):          # an odometer: every digit flips through, the last ones settle first
            for j, i in enumerate(idx):
                val = ds[j] if k >= 9 - j else str((k * 3 + j * 7) % 10)
                st(f"#{gid}-c{i}", f"{{ textContent: {json.dumps(val)} }}", tc + k * 0.07)
        sfx("click-soft", tc, 0.1)
    sfx("whoosh-short", t0, 0.07)
    MOTION.append((t0, t0 + 1.5))


# ---- 14 doodle boil --------------------------------------------------------------------------------------------------
DOODLES = [
    "M 140 300 C 200 360 250 420 330 470", "M 300 440 L 332 472 L 290 486",                       # an arrow at the head
    "M 800 300 L 840 250", "M 830 360 L 900 345", "M 810 420 L 870 450",                          # three lines of shine
    "M 120 1180 C 260 1150 420 1170 560 1160",                                                     # an underline
]


def doodle(gid, g, t0, t1, side):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side, plate=False)
    boil = (f'<svg class="gl-defs" width="0" height="0"><defs>'
            f'<filter id="{gid}-ol" x="-5%" y="-5%" width="110%" height="110%"><feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/>'
            f'<feTurbulence id="{gid}-t1" type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1" result="n"/>'
            f'<feDisplacementMap in="d" in2="n" scale="10" xChannelSelector="R" yChannelSelector="G" result="dd"/>'
            f'<feFlood flood-color="#ffffff"/><feComposite in2="dd" operator="in" result="o"/>'
            f'<feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
            f'<filter id="{gid}-bl"><feTurbulence id="{gid}-t2" type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="1" result="n"/>'
            f'<feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>')
    title = str(g.get("title") or "").upper()[:20]
    over = (boil + f'<svg class="L dd" viewBox="0 0 1080 1920" style="filter:url(#{gid}-bl)">'
            + "".join(f'<path d="{d}" pathLength="1"/>' for d in DOODLES) + "</svg>"
            + (f'<div class="dd-t" id="{gid}-title">{esc(title)}</div>' if title else ""))
    sandwich(gid, a, b, over=over, plate=False, fg_style=f"filter:url(#{gid}-ol)")
    # the boil: a new seed every 3 frames for the outline and the marks
    k, t = 0, a
    while t < b:
        st(f"#{gid}-t1, #{gid}-t2", f"{{ attr: {{ seed: {k % 7 + 1} }} }}", t)
        k, t = k + 1, t + 0.1
    js(f"tl.fromTo('#{gid} .dd path', {{ strokeDashoffset: 1 }}, {{ strokeDashoffset: 0, duration: 0.35, ease: 'power1.out', stagger: 0.15 }}, {q(t0 + 0.4)});")
    st(f"#{gid}-fgw", "{ opacity: 0 }", a)
    tw(f"#{gid}-fgw", "{ opacity: 0 }", "{ opacity: 1 }", t0, 0.25, "power1.out")
    if title:
        tw(f"#{gid}-title", "{ opacity: 0, y: 20 }", "{ opacity: 1, y: 0 }", t0 + 0.9, 0.35, "power3.out")
    to(f"#{gid}-over, #{gid}-fgw", "{ opacity: 0 }", t1, 0.3, "power2.in")
    sfx("whoosh-short", t0 + 0.4, 0.04)
    MOTION.append((t0, t0 + 1.6))


# ---- 15 vertigo ------------------------------------------------------------------------------------------------------
def vertigo(gid, t0, t1, side):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    under = f'<div class="L" style="background:{NAVY}"></div>' + vid(gid, "bg", a, b, 9).replace(f'id="{gid}-bgw"', f'id="{gid}-blur"').replace(
        f'id="{gid}-bg"', f'id="{gid}-bg2"')
    sandwich(gid, a, b, under=under, mid='<div class="L vt-vig"></div>')
    o = "transformOrigin: '540px 760px'"
    st(f"#{gid}-blur", f"{{ scale: 1.25, {o}, filter: 'blur(22px) brightness(0.75)' }}", a)
    d = min(2.2, max(1.2, t1 - t0 - 0.4))
    tw(f"#{gid}-bgw", f"{{ scale: 1, {o} }}", "{ scale: 0.82 }", t0, d, "power2.inOut")
    tw(f"#{gid}-fgw", f"{{ scale: 1, {o} }}", "{ scale: 1.07 }", t0, d, "power2.inOut")
    tw(f"#{gid}-mid", "{ opacity: 0 }", "{ opacity: 1 }", t0, d, "power2.inOut")
    to(f"#{gid}-bgw, #{gid}-fgw", "{ scale: 1 }", t1 - 0.05, 0.3, "power2.inOut")
    to(f"#{gid}-mid", "{ opacity: 0 }", t1 - 0.05, 0.3, "power2.inOut")
    sfx("whoosh", t0, 0.05)
    MOTION.append((t0, t0 + d))


# ---- 04 frame break --------------------------------------------------------------------------------------------------
def frame(gid, g, t0, t1, side, who=""):
    a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side)
    S, X, Y = 0.833, 90, -40                     # the solo frame scaled into the post
    PX0, PY0, PX1, PY1 = 150, 400, 930, 1400     # the post's photo, in screen pixels
    loc = lambda x, y: ((x - X) / S, (y - Y) / S)  # noqa: E731
    (lx0, ly0), (lx1, ly1) = loc(PX0, PY0), loc(PX1, PY1)
    inset = f"inset({ly0:.0f}px {1080 - lx1:.0f}px {1920 - ly1:.0f}px {lx0:.0f}px round 6px)"
    name = str(g.get("label") or who or "")
    words = str(g.get("text") or "")[:90]
    under = (f'<div class="L fr-bg"></div><div class="fr-card" id="{gid}-card" style="opacity:0"><div class="fr-head"><i>{esc(name[:1])}</i>'
             f'<b>{esc(name)}</b><span>Follow</span></div><div class="fr-cap"><b>{esc(name.split(" ")[0] if name else "")}</b> {esc(words)}</div></div>')
    sandwich(gid, a, b, under=under)
    LAYERS["ui"][-1] = LAYERS["ui"][-1].replace(f'<div class="L fxv" id="{gid}-bgw">', f'<div class="L fr-move" id="{gid}-mv"><div class="L fxv" id="{gid}-bgw">', 1) \
        .replace(f'<div class="L" id="{gid}-over">', f'</div><div class="L" id="{gid}-over">', 1)
    st(f"#{gid}-mv", "{ x: 0, y: 0, scale: 1, transformOrigin: '0px 0px' }", a)
    st(f"#{gid}-bgw", "{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }", a)
    to(f"#{gid}-mv", f"{{ x: {X}, y: {Y}, scale: {S} }}", t0 + 0.1, 0.7, "expo.inOut")
    to(f"#{gid}-bgw", f"{{ clipPath: '{inset}' }}", t0 + 0.1, 0.7, "expo.inOut")
    tw(f"#{gid}-card", "{ opacity: 0, y: 40 }", "{ opacity: 1, y: 0 }", t0 + 0.25, 0.55, "power3.out")
    to(f"#{gid}-mv", "{ x: 0, y: 0, scale: 1 }", t1 - 0.2, 0.55, "expo.inOut")
    to(f"#{gid}-bgw", "{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }", t1 - 0.2, 0.55, "expo.inOut")
    to(f"#{gid}-card", "{ opacity: 0 }", t1 - 0.2, 0.3, "power1.in")
    sfx("whoosh-short", t0 + 0.1, 0.06)
    MOTION.append((t0, t0 + 1.0))


# ---- 03 / 06 / 12 the app on screen ----------------------------------------------------------------------------------
APP = {"email": "INBOX", "dm": "MESSAGES", "linkedin": "LINKEDIN", "text": "MESSAGES"}


def app_ui(gid, g, size):
    """The app the speaker talks about, in em units (size = the base font size in px): returns (html, word count)."""
    app = (g.get("app") or "email").lower()
    app = app if app in APP else "email"
    who = str(g.get("label") or "")
    body = " ".join(str(x) for x in (g.get("lines") or [g.get("text", "")]) if x).strip()
    words, spans = words_spans(gid, body)
    pill = str(g.get("value") or "")
    title = str(g.get("title") or "")
    head = f'<div class="ui-bar">{APP[app]}</div>'
    if app == "email":
        inner = ((f'<div class="ui-from"><i>{esc(who[:1])}</i><div><b>{esc(who)}</b><span>to you</span></div></div>' if who else "")
                 + (f'<div class="ui-subj">{esc(title)}</div>' if title else "")
                 + f'<div class="ui-body">{spans}</div>')
    else:
        inner = ((f'<div class="ui-from"><i>{esc(who[:1])}</i><div><b>{esc(who)}</b><span>{"Connection request" if app == "linkedin" else "now"}</span></div></div>' if who else "")
                 + f'<div class="ui-bub{" ui-out" if app == "text" else ""}">{spans}</div>')
    if pill:
        inner += f'<div class="ui-pill" id="{gid}-pill">{esc(pill)}</div>'
    return f'<div class="ui" style="font-size:{size}px">{head}<div class="ui-in">{inner}</div></div>', len(words)


def screen(gid, g, t0, t1, side, device):
    if device == "behind":
        a, b = cutout(gid, t0 - 0.1, t1 + 0.4, side, plate=False)
        ui, n = app_ui(gid, g, 36)
        under = f'<div class="L sc-desk"></div><div class="sc-big" id="{gid}-ui">{ui}</div>'
        sandwich(gid, a, b, under=under, plate=False)
        tw(f"#{gid}-ui", "{ y: -80, opacity: 0 }", "{ y: 0, opacity: 1 }", t0 + 0.1, 0.6, "expo.out")
        sel = f"#{gid}"
    elif device == "phone":
        ui, n = app_ui(gid, g, 25)
        clip("ui", gid, t0, t1 + 0.6, f'<div class="ph" id="{gid}-ph"><div class="ph-scr">{ui}</div><div class="ph-isl"></div></div>')
        tw(f"#{gid}-ph", "{ x: 520, rotation: 4 }", "{ x: 0, rotation: -5 }", t0 + 0.1, 0.75, "expo.out")
        to(f"#{gid}-ph", "{ x: 560, rotation: 6 }", t1, 0.5, "expo.in")
        sel = f"#{gid}"
    else:                                        # split: the app on top, the speaker underneath
        ui, n = app_ui(gid, g, 40)
        clip("ui", gid, t0, t1 + 0.6, f'<div class="sc-top" id="{gid}-top"><div class="sc-card">{ui}</div></div>')
        tw(f"#{gid}-top", "{ yPercent: -100 }", "{ yPercent: 0 }", t0, 0.6, "expo.inOut")
        to(f"#{gid}-top", "{ yPercent: -100 }", t1, 0.55, "expo.inOut")
        sel = f"#{gid}"
    tt = max(t0 + 0.8, m(g.get("at") or 0))
    end = type_in(gid, n, tt)
    if g.get("value"):
        tw(f"#{gid}-pill", "{ opacity: 0, y: 12 }", "{ opacity: 1, y: 0 }", end + 0.25, 0.35, "power3.out")
        sfx("click-soft", end + 0.25, 0.1)
    sfx("whoosh-short", t0 + 0.05, 0.06)
    MOTION.append((t0, t0 + 1.0))
    return sel


# ---- 07 checklist: a box of steps in the window ----------------------------------------------------------------------
def checklist_box(gid, g, t0, built):
    """(html, height, beats) for the box above the window, like build_box in build_auto.py."""
    rows = [r for r in (g.get("rows") or []) if r.get("text")][:4]
    title = g.get("title", "") or "ALL YOU DO"
    n = len(rows)
    h = 34 + 62 + 30 + 84 * n + 26
    html = (f'<div class="ck-head"><div class="bc-t ck-t">{esc(title)}</div><div class="ck-n"><b id="{gid}-k">0</b> of {n}</div></div>'
            f'<div class="ck-bar"><i id="{gid}-p"></i></div>'
            + "".join(f'<div class="ck-row" id="{gid}-r{i}"><span class="ck-box"><svg viewBox="0 0 40 40"><path d="M 9 21 L 17 29 L 32 12" pathLength="1"/></svg></span>'
                      f'<span class="ck-x">{esc(r["text"])}</span></div>' for i, r in enumerate(rows)))
    beats, prev = [], built + 0.15
    for i, r in enumerate(rows):
        t = max(m(r.get("at", 0)), prev + (0.3 if i == 0 else 0.7))
        prev = t
        beats.append((t, f"tl.to('#{gid}-r{i}', {{ opacity: 1, duration: 0.2 }}, {q(t)}); "
                         f"tl.to('#{gid}-r{i} .ck-box', {{ backgroundColor: '{BLUE}', borderColor: '{BLUE}', duration: 0.18 }}, {q(t)}); "
                         f"tl.fromTo('#{gid}-r{i} .ck-box path', {{ strokeDashoffset: 1 }}, {{ strokeDashoffset: 0, duration: 0.28, ease: 'power2.out' }}, {q(t + 0.08)}); "
                         f"tl.set('#{gid}-k', {{ textContent: '{i + 1}' }}, {q(t)}); "
                         f"tl.to('#{gid}-p', {{ scaleX: {(i + 1) / max(1, n):.3f}, duration: 0.4, ease: 'power2.out' }}, {q(t)});", "row"))
    return html, h, beats


# ---- 05 punch, 09 zoom-through ---------------------------------------------------------------------------------------
ZOOM_SET = []


def zoom_through(t):
    # plain to() tweens from a state set at 0: a fromTo() would paint its blurred start the moment the page builds
    if not ZOOM_SET:
        st("#zoomwrap", "{ scale: 1, filter: 'blur(0px) brightness(1)', transformOrigin: '540px 860px' }", 0)
        ZOOM_SET.append(1)
    d = round(q(t) - q(t - 0.18), 4)           # ends exactly where the second half starts
    js(f"tl.to('#zoomwrap', {{ scale: 1.55, filter: 'blur(16px) brightness(1.15)', duration: {d}, ease: 'power2.in' }}, {q(t - 0.18)});")
    js(f"tl.to('#zoomwrap', {{ scale: 1, filter: 'blur(0px) brightness(1)', duration: 0.26, ease: 'power3.out' }}, {q(t)});")
    sfx("whoosh", t - 0.2, 0.06)
    MOTION.append((t - 0.2, t + 0.3))


# ---- 11 pullback into the player -------------------------------------------------------------------------------------
def pullback(t0, end, show):
    clip("under", "player", t0, VID + 0.05,
         f'<div class="L" style="background:{NAVY}"></div><div class="pl" id="pl-card"><div class="pl-art"></div>'
         f'<div class="pl-show">{esc(show)}</div><div class="pl-ep">{esc(end.get("name", ""))}</div>'
         f'<div class="pl-sub">{esc(end.get("line", ""))}</div><div class="pl-bar"><i id="pl-p"></i></div></div>', track=4)
    tw("#pl-card", "{ opacity: 0, y: 30 }", "{ opacity: 1, y: 0 }", t0 + 0.2, 0.6, "power3.out")
    tw("#pl-p", "{ scaleX: 0.31 }", "{ scaleX: 0.36 }", t0, VID - t0, "none")
    sfx("whoosh-short", t0, 0.06)
    MOTION.append((t0, t0 + 1.0))


CSS = f"""
#zoomwrap {{ transform-origin: 540px 860px; }}
.fxv video {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }}
.gl-defs {{ position: absolute; }}
/* 16 cover */
.cv-shade {{ position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11, 27, 39, 0.6), rgba(11, 27, 39, 0) 50%),
  linear-gradient(90deg, rgba(11, 27, 39, 0.7), rgba(11, 27, 39, 0) 42%); }}
.cv-mast {{ position: absolute; left: 0; right: 0; top: 215px; text-align: center; font-family: "Libre Franklin", sans-serif; font-weight: 900;
  letter-spacing: -0.03em; color: #ffffff; white-space: nowrap; }}
.cv-l {{ display: inline-block; }}
.cv-issue {{ position: absolute; left: 0; right: 0; top: 120px; text-align: center; font-family: "Libre Franklin", sans-serif; font-weight: 800;
  font-size: 28px; letter-spacing: 0.16em; color: #ffffff; text-transform: uppercase; }}
.cv-lines {{ position: absolute; left: 50px; top: 640px; width: 330px; }}
.cv-line {{ position: relative; padding-left: 22px; margin-bottom: 26px; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 42px;
  line-height: 1.08; color: #ffffff; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.55); }}
.cv-line i {{ position: absolute; left: 0; top: 6px; bottom: 6px; width: 8px; background: {BLUE}; }}
/* 17 glass */
.gl-glass {{ backdrop-filter: blur(9px) brightness(1.4) saturate(1.25); -webkit-backdrop-filter: blur(9px) brightness(1.4) saturate(1.25);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.05) 60%, rgba(56, 182, 255, 0.12)); }}
.gl-edge {{ overflow: visible; }}
/* 10 chart */
.ch-shade {{ position: absolute; left: 0; right: 0; top: 0; height: 820px; background: linear-gradient(180deg, rgba(11, 27, 39, 0.72), rgba(11, 27, 39, 0)); }}
.ch-title {{ position: absolute; left: 110px; top: 120px; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 40px; letter-spacing: 0.02em;
  text-transform: uppercase; color: #ffffff; }}
.chg {{ overflow: visible; }}
.ch-grid line {{ stroke: rgba(255, 255, 255, 0.22); stroke-width: 2; stroke-dasharray: 6 10; }}
.ch-line {{ fill: none; stroke: {BLUE}; stroke-width: 11; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }}
.ch-dots circle {{ fill: #ffffff; stroke: {BLUE}; stroke-width: 6; }}
.ch-lab {{ position: absolute; transform: translateX(-50%); padding: 10px 16px 9px; background: #ffffff; color: {INK}; white-space: nowrap;
  font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 30px; line-height: 1; text-transform: uppercase; }}
/* 08 headlines */
.hl {{ position: absolute; width: 380px; padding: 22px 24px 20px; background: #ffffff; border: 2px solid {INK}; transform-origin: 50% 0; }}
.hl-t {{ font-family: "Libre Franklin", sans-serif; font-weight: 800; line-height: 1.08; color: {INK}; letter-spacing: -0.01em; }}
/* 01 orbit */
.orb-p {{ position: absolute; left: 0; top: 0; }}
.orb-c {{ padding: 0.36em 0.55em 0.34em; background: #ffffff; color: {INK}; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 50px;
  line-height: 1; text-transform: uppercase; white-space: nowrap; border-bottom: 6px solid {BLUE}; }}
.orb-title {{ position: absolute; left: 0; right: 0; top: 300px; display: flex; justify-content: center; }}
/* 02 wall */
.wl-dim {{ background: linear-gradient(180deg, rgba(11, 27, 39, 0.25), rgba(11, 27, 39, 0.55)); }}
.wl-c {{ position: absolute; width: 360px; height: 480px; background: {NAVY}; }}
.wl-title {{ position: absolute; left: 0; right: 0; top: 300px; display: flex; justify-content: center; }}
.wl-title .jt2 {{ font-size: 56px; padding: 22px 32px 21px; }}
/* 13 paper */
.pp-bg {{ background: #f6f5f1; }}
.pp-torn {{ fill: {BLUE}; }}
.pp-s, .pp-x {{ fill: none; stroke: {NAVY}; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; }}
.pp-x {{ stroke: {BLUE}; stroke-width: 8; }}
.pp-title {{ position: absolute; left: 70px; top: 230px; padding: 18px 26px 16px; background: {NAVY}; color: #ffffff; font-family: "Libre Franklin", sans-serif;
  font-weight: 900; font-size: 74px; line-height: 1; text-transform: uppercase; transform: rotate(-3deg); }}
.pp-count {{ position: absolute; left: 70px; top: 380px; display: flex; gap: 8px; align-items: center; }}
.pp-d {{ display: inline-block; width: 78px; height: 104px; background: {BLUE}; color: {INK}; text-align: center; font-family: "Libre Franklin", sans-serif;
  font-weight: 900; font-size: 84px; line-height: 104px; }}
.pp-fix {{ font-family: "Libre Franklin", sans-serif; font-weight: 900; font-size: 84px; color: {NAVY}; }}
/* 14 doodle */
.dd {{ overflow: visible; }}
.dd path {{ fill: none; stroke: #ffffff; stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }}
.dd-t {{ position: absolute; left: 80px; top: 210px; font-family: "Libre Franklin", sans-serif; font-weight: 900; font-size: 56px; color: #ffffff;
  text-transform: uppercase; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45); }}
/* 15 vertigo */
.vt-vig {{ background: radial-gradient(ellipse 70% 55% at 50% 45%, transparent 45%, rgba(11, 27, 39, 0.6)); }}
/* 04 frame break */
.fr-bg {{ background: radial-gradient(ellipse 90% 60% at 50% 35%, #14293a, {NAVY} 70%); }}
.fr-card {{ position: absolute; left: 110px; top: 290px; width: 860px; height: 1230px; background: #ffffff; }}
.fr-head {{ position: absolute; left: 30px; right: 30px; top: 22px; height: 70px; display: flex; align-items: center; gap: 18px; font-family: "Poppins", sans-serif; }}
.fr-head i {{ width: 62px; height: 62px; border-radius: 50%; background: {NAVY}; color: #ffffff; font-style: normal; display: flex; align-items: center;
  justify-content: center; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 30px; }}
.fr-head b {{ font-weight: 600; font-size: 30px; color: {INK}; }}
.fr-head span {{ margin-left: auto; padding: 8px 20px; background: {BLUE}; color: {INK}; font-family: "Libre Franklin", sans-serif; font-weight: 800;
  font-size: 24px; text-transform: uppercase; }}
.fr-cap {{ position: absolute; left: 34px; right: 34px; top: 1125px; font-family: "Poppins", sans-serif; font-size: 28px; line-height: 1.35; color: {INK};
  overflow: hidden; max-height: 76px; }}
.fr-cap b {{ font-weight: 600; }}
/* 03 06 12 the app */
.ui {{ background: #ffffff; color: {INK}; font-family: "Poppins", sans-serif; }}
.ui-bar {{ padding: 0.55em 0.8em 0.5em; border-bottom: 2px solid {INK}; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 0.62em;
  letter-spacing: 0.08em; }}
.ui-in {{ padding: 0.7em 0.8em 0.9em; }}
.ui-from {{ display: flex; align-items: center; gap: 0.45em; margin-bottom: 0.55em; }}
.ui-from i {{ width: 1.6em; height: 1.6em; border-radius: 50%; background: {NAVY}; color: #fff; font-style: normal; display: flex; align-items: center;
  justify-content: center; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 0.8em; flex: none; }}
.ui-from b {{ display: block; font-weight: 600; font-size: 0.78em; line-height: 1.2; }}
.ui-from span {{ display: block; font-size: 0.62em; color: #6b6b6b; }}
.ui-subj {{ font-weight: 600; font-size: 0.9em; margin-bottom: 0.35em; }}
.ui-body {{ font-size: 0.82em; line-height: 1.42; }}
.ui-bub {{ display: inline-block; max-width: 92%; padding: 0.55em 0.75em; background: #eef1f4; font-size: 0.82em; line-height: 1.4; }}
.ui-bub.ui-out {{ background: {BLUE}; float: right; }}
.ui .mw {{ opacity: 0; }}
.ui-pill {{ clear: both; display: inline-block; margin-top: 0.7em; padding: 0.35em 0.8em; background: {BLUE}; color: {INK}; font-family: "Libre Franklin", sans-serif;
  font-weight: 800; font-size: 0.7em; text-transform: uppercase; opacity: 0; }}
.sc-top {{ position: absolute; left: 0; top: 0; width: 1080px; height: 960px; background: {NAVY}; display: flex; align-items: center; justify-content: center; }}
.sc-card {{ width: 900px; }}
.sc-desk {{ background: #e9edf1; }}
.sc-big {{ position: absolute; left: 60px; top: 70px; width: 960px; }}
.ph {{ position: absolute; left: 610px; top: 330px; width: 420px; height: 860px; border-radius: 58px; background: #0d0f12; padding: 16px; box-sizing: border-box;
  transform-origin: 50% 100%; }}
.ph-scr {{ width: 100%; height: 100%; border-radius: 44px; overflow: hidden; background: #ffffff; padding-top: 70px; box-sizing: border-box; }}
.ph-isl {{ position: absolute; top: 34px; left: calc(50% - 56px); width: 112px; height: 32px; border-radius: 16px; background: #000; }}
/* 07 checklist */
.ck-head {{ display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }}
.ck-t {{ border-bottom: 0; padding-bottom: 0; }}
.ck-n {{ font-family: "Poppins", sans-serif; font-weight: 600; font-size: 30px; color: #6b6b6b; white-space: nowrap; padding-bottom: 6px; }}
.ck-n b {{ color: {INK}; }}
.ck-bar {{ margin-top: 16px; height: 10px; background: rgba(17, 17, 17, 0.12); }}
.ck-bar i {{ display: block; height: 100%; background: {BLUE}; transform: scaleX(0); transform-origin: 0 50%; }}
.ck-row {{ display: flex; align-items: center; gap: 22px; height: 84px; opacity: 0.38; }}
.ck-row + .ck-row {{ border-top: 1px solid rgba(17, 17, 17, 0.2); }}
.ck-row:first-of-type {{ margin-top: 14px; }}
.ck-box {{ width: 44px; height: 44px; border: 3px solid {INK}; box-sizing: border-box; flex: none; }}
.ck-box svg {{ width: 100%; height: 100%; }}
.ck-box path {{ fill: none; stroke: #ffffff; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }}
.ck-x {{ font-family: "Poppins", sans-serif; font-weight: 600; font-size: 40px; white-space: nowrap; }}
/* 11 player */
.pl {{ position: absolute; left: 90px; top: 420px; width: 900px; height: 1100px; background: #ffffff; }}
.pl-art {{ position: absolute; left: 40px; top: 40px; width: 820px; height: 729px; background: #0d0f12; }}
.pl-show {{ position: absolute; left: 40px; top: 806px; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 26px; letter-spacing: 0.1em;
  text-transform: uppercase; color: #6b6b6b; }}
.pl-ep {{ position: absolute; left: 40px; right: 40px; top: 850px; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 60px; line-height: 1.05; color: {INK}; }}
.pl-sub {{ position: absolute; left: 40px; right: 40px; top: 930px; font-family: "Poppins", sans-serif; font-size: 30px; color: #444444; }}
.pl-bar {{ position: absolute; left: 40px; right: 40px; top: 1030px; height: 10px; background: rgba(17, 17, 17, 0.12); }}
.pl-bar i {{ display: block; height: 100%; background: {BLUE}; transform-origin: 0 50%; }}
"""
