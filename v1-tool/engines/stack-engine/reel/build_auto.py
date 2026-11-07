#!/usr/bin/env python3
"""Reel look version 3 (2026-10-29), built from an edit plan instead of hand-written beats.

The cloud editor (plan.mjs) has Claude read the clip's word timings and the brand, and write plan.json: the cut, an
optional hook bar, the guest's name card, three or four graphics (lists, numbers, message mockups, bar comparisons, a
hanging tag, a clone wall), the lines worth a slow push, the caption keywords and the end card. This file turns that
plan into index.html. Every time in the plan is in source seconds (the clip before the cut); m() maps it onto the cut.

The rules this look is built on:
- One face at a time. The camera cuts to whoever is talking; a jump cut shows both people for a moment, then the
  camera moves back in. No punch-in zoom on every cut (a camera that keeps zooming in on faces tires the eye).
- A graphic opens the speaker into a framed window low on the screen, with the graphic large above it (a card that
  builds while the speaker talks underneath).
- Captions pop in word by word; key words pop into a tilted white box.
- A clone wall when someone says everyone is the same: the camera pulls back and the speaker repeats across the screen.

Layouts: "stack" (two camera feeds, guest on top, the host underneath, the seam at y 960) and "single" (one 9:16 frame).
Brand boxes: white cards with ink edges, Libre Franklin caps titles, Poppins rows, one accent per piece. The colours
are the studio's palette (context.json studio.palette): recolor() in studio.py swaps them in when the page is written.

Run: python3 build_auto.py        (needs work/cut.json from cut.py, assets/moody.mp4 and plan.json)
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
import fx  # noqa: E402
from studio import recolor, studio  # noqa: E402

FPS = 30
W, H = 1080, 1920
CUT = json.loads((ROOT / "work/cut.json").read_text())
PLAN = json.loads((ROOT / "plan.json").read_text())
# the planner straightens these, but a plan from anywhere else may not: every list of moves is a list of objects
for _k in ("graphics", "cards", "emphasis", "punches", "transitions", "vertigo"):
    if _k in PLAN:
        _v = PLAN[_k] if isinstance(PLAN[_k], list) else [PLAN[_k]] if isinstance(PLAN[_k], dict) else []
        PLAN[_k] = [x for x in _v if isinstance(x, dict)]
VID = CUT["total"]
END_LEN = 3.7
DUR = round(round((VID + END_LEN) * FPS) / FPS, 4)
LAYOUT = PLAN.get("layout", "stack")
STACK = LAYOUT == "stack"
DEMO = os.environ.get("FX_DEMO") == "1"   # the effect showcase: every effect in one reel, more than a reel would carry
MAX_G = 40 if DEMO else 5        # graphics and effects in the body of a reel
MAX_CUT = 40 if DEMO else 3      # effects that need the speaker cut out (each adds about half a minute to the render)
CTX = json.loads((ROOT / "context.json").read_text()) if (ROOT / "context.json").exists() else {}
STUDIO = studio(CTX)
TURNS = sorted(PLAN.get("turns") or [], key=lambda x: x.get("at", 0))

# the speaker's window when a graphic is up: left, top, width; a stacked half is 9:8, so the height is 8/9 of the width
WX, WY, WW = 60, 860, 960
WS = WW / 1080
WH = round(960 * WS, 1)
GX, GW = 60, 880                 # a graphic over the window: left and width
G_BOTTOM = WY - 40               # graphics sit just above the window
G_TOP = 240                      # and below the platforms' top bar


def q(t):
    return round(round(t * FPS) / FPS, 4)


def m(t):
    """Source seconds -> cut seconds. A moment that was cut out lands on the next kept moment."""
    for s in CUT["segments"]:
        if s["in"] - 0.05 <= t <= s["out"] + 0.05:
            return round(s["start"] + max(0.0, min(t, s["out"]) - s["in"]), 3)
    later = [s for s in CUT["segments"] if s["in"] > t]
    return later[0]["start"] if later else VID


def src(tc):
    """Cut seconds -> source seconds (a time on a join belongs to the segment that starts there)."""
    for s in CUT["segments"]:
        if s["start"] <= tc < s["start"] + s["dur"]:
            return s["in"] + tc - s["start"]
    return CUT["segments"][-1]["out"]


def side_at(t):
    """Who is talking at source time t: 'top' (the guest's half) or 'bottom' (the host's)."""
    if not STACK:
        return "bottom"
    s = "top"
    for x in TURNS:
        if x.get("at", 0) <= t + 0.3:
            s = "bottom" if x.get("side") == "bottom" else "top"
    return s


def side_cut(tc):
    return side_at(src(tc))


JS, AUDIO, MOUNT = [], [], []
LAYERS = {k: [] for k in ["under", "ui", "caps", "end", "stage", "fx"]}
MOTION = []          # windows where something is mid-build (the contact sheet skips them)


def js(s):
    JS.append(s)


def clip(layer, cid, start, end, inner, style="", track=2):
    end = min(end, DUR)
    if end - start < 0.1:
        return
    LAYERS[layer].append(f'<div class="clip c" id="{cid}" data-start="{q(start):.4f}" data-duration="{q(end - start):.4f}" '
                         f'data-track-index="{track}" style="{style}">{inner}</div>')


def tw(sel, frm, to_, t, d, ease="expo.out", extra=""):
    js(f"tl.fromTo({sel!r}, {frm}, {{ ...{to_}, duration: {d}, ease: '{ease}'{extra} }}, {q(t)});")


def to(sel, props, t, d, ease="power2.inOut"):
    js(f"tl.to({sel!r}, {{ ...{props}, duration: {d}, ease: '{ease}' }}, {q(t)});")


def st(sel, props, t):
    js(f"tl.set({sel!r}, {props}, {q(t)});")


SFX_LEN, SFX_N = {}, [0]


def sfx(name, t, vol):
    f = ROOT / f"assets/sfx/{name}.mp3"
    if t >= DUR - 0.05 or t < 0 or not f.exists():
        return
    if name not in SFX_LEN:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout
        SFX_LEN[name] = round(float(out or 0.5), 3)
    SFX_N[0] += 1
    AUDIO.append(f'<audio id="sfx{SFX_N[0]}" src="assets/sfx/{name}.mp3" data-start="{q(t):.4f}" data-duration="{SFX_LEN[name]}" '
                 f'data-track-index="{20 + SFX_N[0] % 8}" data-volume="{vol}"></audio>')


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---- the camera -------------------------------------------------------------------------------------------------------
# #cam holds the footage, transform origin 0 0. A state is where the footage sits: x, y, scale, and a clip in the
# footage's own pixels (so a window shows one half with round corners).
NOCLIP = "inset(0px 0px 0px 0px round 0px)"


def cam_state(name, side="top"):
    top = side == "top"
    if STACK:
        if name == "full":
            return dict(x=0, y=0, scale=1, clip=NOCLIP, seam=1, frame=0)
        if name == "solo":
            return dict(x=-540, y=0 if top else -1920, scale=2, clip=NOCLIP, seam=0, frame=0)
        if name == "push":
            # a slow push toward the face: keep the face (local x 540, y 430 in its half) where solo shows it
            s2, ly = 2.18, 430 + (0 if top else 960)
            return dict(x=round(540 - 540 * s2, 1), y=round(860 - ly * s2, 1), scale=s2, clip=NOCLIP, seam=0, frame=0)
        if name == "win":
            clip_ = "inset(0px 0px 960px 0px round 27px)" if top else "inset(960px 0px 0px 0px round 27px)"
            return dict(x=WX, y=round(WY - (0 if top else 960) * WS, 1), scale=round(WS, 4), clip=clip_, seam=0, frame=1)
        if name == "split":       # the app on top, the speaker's own half underneath at full size
            clip_ = "inset(0px 0px 960px 0px round 0px)" if top else "inset(960px 0px 0px 0px round 0px)"
            return dict(x=0, y=960 if top else 0, scale=1, clip=clip_, seam=0, frame=0)
        if name == "left":        # the one-face shot with the speaker moved left, for a phone beside them
            return dict(x=-740, y=0 if top else -1920, scale=2, clip=NOCLIP, seam=0, frame=0)
        if name == "punch":       # a hard digital zoom on the face
            s2, ly = 2.3, 430 + (0 if top else 960)
            return dict(x=round(540 - 540 * s2, 1), y=round(860 - ly * s2, 1), scale=s2, clip=NOCLIP, seam=0, frame=0)
        if name == "player":      # the ending: the speaker's half inside the episode's player
            s3 = round(820 / 1080, 4)
            clip_ = "inset(0px 0px 960px 0px round 0px)" if top else "inset(960px 0px 0px 0px round 0px)"
            return dict(x=130, y=round(460 - (0 if top else 960) * s3, 1), scale=s3, clip=clip_, seam=0, frame=0)
    else:
        if name in ("full", "solo"):
            return dict(x=0, y=0, scale=1, clip=NOCLIP, seam=0, frame=0)
        if name == "close":       # the second "camera" on a jump cut: a tighter framing, set, never animated
            return dict(x=-81, y=-105, scale=1.15, clip=NOCLIP, seam=0, frame=0)
        if name == "push":
            return dict(x=-43.2, y=-56, scale=1.08, clip=NOCLIP, seam=0, frame=0)
        if name == "win":         # the face area (y 260 to 1220) in the window
            return dict(x=WX, y=round(WY - 260 * WS, 1), scale=round(WS, 4), clip="inset(260px 0px 700px 0px round 27px)", seam=0, frame=1)
        if name == "split":
            return dict(x=0, y=700, scale=1, clip="inset(260px 0px 700px 0px round 0px)", seam=0, frame=0)
        if name == "left":
            return dict(x=-369, y=-210, scale=1.35, clip=NOCLIP, seam=0, frame=0)
        if name == "punch":
            return dict(x=-97.2, y=-126, scale=1.18, clip=NOCLIP, seam=0, frame=0)
        if name == "player":
            s3 = round(820 / 1080, 4)
            return dict(x=130, y=round(460 - 260 * s3, 1), scale=s3, clip="inset(260px 0px 700px 0px round 0px)", seam=0, frame=0)
    raise ValueError(name)


CAM = []             # (t, name, side, mode, dur): mode 'cut' (set) or 'move' (tween)


def cam_at(t):
    cur = CAM[0]
    for c in CAM:
        if c[0] <= t + 1e-6:
            cur = c
    return cur[1], cur[2]


def emit_cam():
    last = None
    for t, name, side, mode, dur in CAM:
        s = cam_state(name, side)
        props = f"{{ x: {s['x']}, y: {s['y']}, scale: {s['scale']}, clipPath: {s['clip']!r} }}"
        if mode == "cut" or last is None:
            st("#cam", props, t)
            st("#seam", f"{{ opacity: {s['seam']} }}", t)
            st("#winframe", f"{{ opacity: {s['frame']} }}", t)
        else:
            ease = "sine.inOut" if name == "push" else "expo.inOut"
            to("#cam", props, t, dur, ease)
            if s["seam"] != last["seam"]:
                to("#seam", f"{{ opacity: {s['seam']} }}", t + (dur * 0.6 if s["seam"] else 0), dur * 0.4, "power1.inOut")
            if s["frame"] != last["frame"]:
                to("#winframe", f"{{ opacity: {s['frame']} }}", t + (dur * 0.55 if s["frame"] else 0), dur * 0.45, "power1.inOut")
        last = s


# ---- the graphics: windows where the camera opens the speaker into a window -------------------------------------------
graphics = PLAN.get("graphics") or [dict(c, kind="list") for c in (PLAN.get("cards") or [])]
HOOK_END = 0.0
hook = PLAN.get("hook") or None
if hook and hook.get("text"):
    HOOK_END = max(1.6, min(3.4, m(hook.get("until", 2.8)) or 2.8))

PLANNED = []         # (gid, g, t0, t1) with times in cut seconds
last_end = HOOK_END
DEF_LEN = {"tag": 2.8, "clones": 4.2, "orbit": 4.6, "wall": 4.0, "headlines": 4.6, "chart": 4.6, "cover": 4.0, "glass": 3.6,
           "paper": 4.0, "doodle": 3.6, "frame": 4.2, "screen": 4.6, "checklist": 4.0, "vertigo": 2.4}
seen, cuts_used = {}, 0
# the vertigo move is planned like a graphic: a stretch of the reel with the speaker cut out
for gi_, g in enumerate(sorted(list(graphics) + [dict(v, kind="vertigo") for v in (PLAN.get("vertigo") or [])[:1 if not DEMO else 9]],
                               key=lambda x: float(x.get("at") or 0))):
    if len(PLANNED) >= MAX_G:
        break
    kind = g.get("kind") or "list"
    if kind == "screen" and (g.get("device") or "") not in ("split", "phone", "behind"):
        g, kind = dict(g, kind="message"), "message"          # an app shown in the box is the message box
    if kind in ("tag", "clones") and seen.get(kind) and not DEMO:
        continue
    if fx.needs_cutout(g) or kind == "vertigo":
        if cuts_used >= MAX_CUT:
            continue
        cuts_used += 1
    seen[kind] = seen.get(kind, 0) + 1
    t0 = max(last_end + 0.9, m(g.get("at", 0)) - 0.2)
    if t0 >= VID - 2.0:           # a reel often ends on the host's point: a box can still go up in its last seconds
        break
    t1 = min(VID - 0.3, max(m(g.get("until", 0)), t0 + DEF_LEN.get(kind, 3.6)))
    PLANNED.append((f"g{gi_}", g, t0, t1))
    last_end = t1


def in_any(t, spans):
    return any(a <= t < b for a, b in spans)


def kind_of(g):
    return g.get("kind") or "list"


def device_of(g):
    return g.get("device") or ""


BOXES = ("list", "stat", "message", "compare", "checklist")
# windowed stretches (box graphics); a tag hangs over the solo shot; a clone wall keeps the solo shot around it
WINS = [(t0 - 0.45, t1 + 0.35) for _, g, t0, t1 in PLANNED if kind_of(g) in BOXES]
# a clone wall or a hanging tag keeps the one-face shot from just before it to just after it
CLONES = [(t0 - 1.2, t1 + 0.5) for _, g, t0, t1 in PLANNED if g.get("kind") in ("clones", "tag")]
WALLS = [(t0, t1) for _, g, t0, t1 in PLANNED if g.get("kind") == "clones"]
# the app on top of the speaker, or a phone beside them
SPLITS = [(t0 - 0.05, t1 + 0.6) for _, g, t0, t1 in PLANNED if kind_of(g) == "screen" and device_of(g) == "split"]
LEFTS = [(t0 - 0.05, t1 + 0.55) for _, g, t0, t1 in PLANNED if kind_of(g) == "screen" and device_of(g) == "phone"]
# a cut-out effect holds the one-face shot of whoever starts it, from just before the cut-out to just after it
FXW = [(t0 - 0.12, t1 + 0.45, side_cut(t0)) for _, g, t0, t1 in PLANNED if fx.needs_cutout(g) or kind_of(g) == "vertigo"]
FRAMEW = [(t0, t1 + 0.4) for _, g, t0, t1 in PLANNED if kind_of(g) == "frame"]
BUSY = WINS + CLONES + SPLITS + LEFTS + [(a, b) for a, b, _ in FXW]
EMPH = []
for e in (PLAN.get("emphasis") or [])[:2]:
    a, b = m(e.get("at", 0)), m(e.get("until", 0))
    if b - a >= 1.5 and not in_any(a, BUSY):
        EMPH.append((a, b))
# a hard digital zoom on one word, at most two, never inside another effect
PUNCH = []
for p in (PLAN.get("punches") or [])[:2 if not DEMO else 9]:
    a = m(p.get("at", 0))
    b = min(a + 3.0, max(a + 0.8, m(p.get("until", 0))))
    if HOOK_END < a and b < VID - 0.3 and not in_any(a, BUSY) and not in_any(b - 0.01, BUSY) and not in_any(a, EMPH):
        PUNCH.append((a, b))
jumps = [s["start"] for s in CUT["segments"][1:]]
# a zoom-blur through a jump cut, at most two; a straight cut skips the both-people moment at its join
ZOOMS, STRAIGHT = [], []
TRANS = PLAN.get("transitions") or []
for z in [z for z in TRANS if (z.get("kind") or "zoom") != "straight"][:2 if not DEMO else 9]:
    tz = m(z.get("at", 0))
    j = min(jumps, key=lambda x: abs(x - tz), default=None)
    if j is not None and abs(j - tz) < 1.5 and not in_any(j, BUSY) and j not in ZOOMS:
        ZOOMS.append(j)
for z in [z for z in TRANS if z.get("kind") == "straight"]:
    tz = m(z.get("at", 0))
    j = min(jumps, key=lambda x: abs(x - tz), default=None)
    if j is not None and abs(j - tz) < 1.5:
        STRAIGHT.append(j)
# the ending pulls back into the episode's player before the end card
PULL = []
if (PLAN.get("ending") or "") == "pullback" and VID > 8 and not in_any(VID - 2.7, BUSY) and not in_any(VID - 0.4, BUSY):
    PULL = [(VID - 2.6, VID + 0.1)]

# breakpoints: speaker turns (a speaker run shorter than 1.2 s doesn't get its own shot), jump cuts, windows, pushes
turns_cut = []
for x in TURNS:
    tc = m(x.get("at", 0))
    if 0 < tc < VID:
        turns_cut.append(tc)
turns_cut = sorted(set(turns_cut))
short = set()
for i, tc in enumerate(turns_cut):
    nxt = turns_cut[i + 1] if i + 1 < len(turns_cut) else VID
    if nxt - tc < 1.2:
        short.add(tc)
WIDE = []            # stack: after a jump cut, both people for a moment, then the camera moves back in.
if STACK:            # single: every other segment is the tighter framing, a plain cut both ways (two "cameras")
    for j in jumps:
        if not in_any(j, BUSY) and not in_any(j, PULL) and j not in ZOOMS and j not in STRAIGHT:
            WIDE.append((j, min(j + 1.8, VID)))
else:
    for i, s in enumerate(CUT["segments"]):
        if i % 2:
            WIDE.append((s["start"], s["start"] + s["dur"]))

edges = [x for w in (WINS, WIDE, SPLITS, LEFTS, PUNCH, PULL, [(a, b) for a, b, _ in FXW]) for s in w for x in s] + [a for a, _ in EMPH]
bps = sorted(set([0.0] + [tc for tc in turns_cut if tc not in short] + jumps + edges))
bps = [b for b in bps if 0 <= b < VID - 0.05]


def want(t):
    """(state name, side) at cut time t."""
    for a, b, s in FXW:
        if a <= t < b:
            return "solo", s
    side = side_cut(t)
    if in_any(t, PULL):
        return "player", side
    if in_any(t, SPLITS):
        return "split", side
    if in_any(t, LEFTS):
        return "left", side
    if in_any(t, WINS):
        return "win", side
    if in_any(t, CLONES):
        return "solo", side
    if in_any(t, WIDE):
        return ("full", side) if STACK else ("close", side)
    if in_any(t, PUNCH):
        return "punch", side
    if in_any(t, EMPH):
        return "push", side
    return "solo", side


MOVED = ("win", "split", "left", "player")
prev = None
for b in bps:
    name, side = want(b + 0.001)
    if prev and (name, side) == prev[:2]:
        continue
    if prev is None:
        CAM.append((0.0, name, side, "cut", 0))
    elif name in MOVED or prev[0] in MOVED:
        # into or out of the window (or the app, the phone, the player): a camera move, unless only the speaker changes (a cut)
        mode = "cut" if name == prev[0] else "move"
        CAM.append((b, name, side, mode, 0.8 if "player" in (name, prev[0]) else 0.6))
    elif prev[0] in ("full", "close") and name in ("solo", "push") and side == prev[1] and not in_any(b, [(j - 0.01, j + 0.01) for j in jumps]):
        CAM.append((b, name, side, "move" if STACK else "cut", 0.7))          # back in after a jump cut
    elif name == "push":
        a, e = next(((a, e) for a, e in EMPH if abs(a - b) < 0.01), (b, b + 3))
        CAM.append((b, name, side, "move", round(max(1.2, e - b), 2)))
    else:
        CAM.append((b, name, side, "cut", 0))             # a new speaker or a jump cut: a hard cut
    prev = (name, side)


# ---- hook: one blue bar in the opening seconds ---------------------------------------------------------------------------
def ui_pos(t):
    """Where the hook and the name card go for the shot at t (left, top)."""
    name, side = cam_at(t)
    if STACK and name == "full":
        return (44, 610) if side == "top" else (40, 1080)
    return (60, 300)


if HOOK_END:
    hx, hy = ui_pos(0.2)
    clip("ui", "hook", 0.1, HOOK_END, f'<div class="hookslot" style="left:{hx}px;top:{hy}px"><div class="jt2">{esc(hook["text"])}</div></div>')
    tw("#hook .jt2", "{ opacity: 0, y: 30, scale: 0.92 }", "{ opacity: 1, y: 0, scale: 1 }", 0.15, 0.5, "power3.out")
    to("#hook .jt2", "{ opacity: 0, y: -20 }", HOOK_END - 0.35, 0.35, "power3.in")
    sfx("pop", 0.15, 0.08)

# ---- the guest's name card -------------------------------------------------------------------------------------------
name = PLAN.get("name") or None
if name and name.get("name"):
    n0 = max(HOOK_END + 0.1, m(name.get("at", 0)))
    n1 = min(n0 + 5.5, max(n0 + 3.2, m(name.get("until", 0)) or n0 + 4.5))
    for a, b in WINS:
        if a < n1 and n0 < a:
            n1 = max(n0 + 1.5, a - 0.1)
    if not in_any(n0, WINS):
        # over the wall above their head, never over the face
        nm, ns = cam_at(n0)
        x, y = (60, 300) if nm != "full" else ((44, 300) if ns == "top" else (40, 1260))
        clip("ui", "namecard", n0, n1,
             f'<div class="bcard ncard" style="left:{x}px;top:{y}px"><div class="bc-t">{esc(name["name"])}</div>'
             + (f'<div class="bc-l">{esc(name["line"])}</div>' if name.get("line") else "") + "</div>")
        tw("#namecard .bcard", "{ opacity: 0, x: -40 }", "{ opacity: 1, x: 0 }", n0, 0.55, "power3.out")
        to("#namecard .bcard", "{ opacity: 0, x: -30 }", n1 - 0.35, 0.35, "power3.in")
        sfx("whoosh-short", n0 - 0.05, 0.06)

# ---- graphic boxes ---------------------------------------------------------------------------------------------------
T_SIZE, R_SIZE, B_SIZE, ROW = 58, 42, 38, 80   # title (Libre Franklin caps), rows (Poppins SemiBold), message body, row height


def lines_of(text, size, width, em=0.55):
    return max(1, -(-int(len(text) * size * em) // max(1, width)))


def fit(s, width):
    """A long row gets smaller type instead of an ellipsis."""
    return "" if len(s) * R_SIZE * 0.58 <= width else f' style="font-size:{max(26, int(width / (len(s) * 0.58)))}px"'


def num_parts(v):
    """'$10,000' -> ('$', 10000, ''); a value without digits doesn't count up."""
    mt = re.match(r"^(\D*?)([\d,]+(?:\.\d+)?)(.*)$", str(v).strip())
    if not mt:
        return None
    return mt.group(1), float(mt.group(2).replace(",", "")), mt.group(3)


def build_box(gid, g, t0, count_from=0.0, ready=None):
    """One box: returns (html, height, beats) where beats = [(time, js, kind)] after it appears (ready, else t0 + 0.6).
    count_from: a number counts up no earlier than this."""
    kind, inner = g.get("kind") or "list", GW - 64
    title = g.get("title", "")
    t_lines = lines_of(title, T_SIZE, inner, 0.68) if title else 0
    head = (34 + t_lines * (T_SIZE + 4)) if title else 30
    title_html = f'<div class="bc-t" style="font-size:{T_SIZE}px;line-height:{T_SIZE + 4}px">{esc(title)}</div>' if title else ""
    built = ready or t0 + 0.6
    beats = []
    if kind == "checklist":
        return fx.checklist_box(gid, g, t0, built)
    if kind == "stat":
        value, label = str(g.get("value") or ""), g.get("label") or g.get("text") or ""
        v_size = min(170, int(inner / max(1, len(value) * 0.64)))
        l_lines = lines_of(label, 34, inner) if label else 0
        h = head + v_size + 22 + l_lines * 44 + 30
        parts = num_parts(value)
        start = esc(value) if not parts else esc(f"{parts[0]}0{parts[2]}")
        html = (title_html + f'<div class="bs-v" id="{gid}-v" style="font-size:{v_size}px">{start}</div>'
                + (f'<div class="bs-l">{esc(label)}</div>' if label else ""))
        if parts:
            pre, n, post = parts
            dec = 1 if n != int(n) else 0
            tc = max(built + 0.1, m(g.get("at", 0)), count_from)
            beats.append((tc, f"(function(){{ const o={{v:0}}, el=document.querySelector('#{gid}-v'); "
                              f"tl.to(o, {{ v: {n}, duration: 1.1, ease: 'power2.out', onUpdate: () => {{ el.textContent = {json.dumps(pre)} + "
                              f"o.v.toLocaleString('en-US', {{ minimumFractionDigits: {dec}, maximumFractionDigits: {dec} }}) + {json.dumps(post)}; }} }}, {q(tc)}); }})();", "count"))
        return html, h, beats
    if kind == "message":
        sender = g.get("label") or ""
        body = " ".join(str(x) for x in (g.get("lines") or [g.get("text", "")]) if x).strip()
        words = body.split()
        b_lines = lines_of(body, B_SIZE, inner)
        pill = g.get("value") or ""
        h = head + (44 if sender else 0) + b_lines * int(B_SIZE * 1.42) + (78 if pill else 0) + 34
        spans = " ".join(f'<span class="mw" id="{gid}-w{i}">{esc(w)}</span>' for i, w in enumerate(words))
        html = (title_html + (f'<div class="bm-from">{esc(sender)}</div>' if sender else "")
                + f'<div class="bm-body" style="font-size:{B_SIZE}px">{spans}</div>'
                + (f'<div class="bm-pill" id="{gid}-pill">{esc(pill)}</div>' if pill else ""))
        tw0 = max(built + 0.1, m(g.get("at", 0)))
        per = min(0.14, 3.0 / max(1, len(words)))
        for i in range(len(words)):
            beats.append((tw0 + i * per, f"tl.set('#{gid}-w{i}', {{ opacity: 1 }}, {q(tw0 + i * per)});", "type"))
        if pill:
            tp = tw0 + len(words) * per + 0.3
            beats.append((tp, f"tl.fromTo('#{gid}-pill', {{ opacity: 0, y: 10 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }}, {q(tp)});", "pill"))
        return html, h, beats
    if kind == "compare":
        bars = [b for b in (g.get("bars") or []) if b.get("label")][:3]
        top = max([float(b.get("value") or 0) for b in bars] + [1])
        h = head + len(bars) * 100 + 30
        rows = []
        for i, b in enumerate(bars):
            w = max(24, int(inner * float(b.get("value") or 0) / top))
            last = i == len(bars) - 1
            rows.append(f'<div class="bk"><div class="bk-l">{esc(b["label"])}</div>'
                        f'<div class="bk-b{" bk-hi" if last else ""}" id="{gid}-b{i}" style="width:{w}px"></div></div>')
            tb = max(built + 0.2 + i * 0.7, m(b.get("at") or 0))
            beats.append((tb, f"tl.fromTo('#{gid}-b{i}', {{ scaleX: 0 }}, {{ scaleX: 1, duration: 0.8, ease: 'power3.out' }}, {q(tb)});", "bar"))
        return title_html + "".join(rows), h, beats
    # list: a card that builds while they talk. Each row slides in when it's said and takes the blue marker; the rows
    # already said step back.
    rows = [r for r in (g.get("rows") or []) if r.get("text")][:4]
    label = g.get("label") or ""
    top_h = head + (52 if label else 0)
    h = top_h + ROW * len(rows) + 26
    html = (title_html + (f'<div class="bc-l" style="font-size:32px;line-height:40px">{esc(label)}</div>' if label else "")
            + "".join(f'<div class="bc-row lrow" id="{gid}-r{i}"{fit(r["text"], inner - 40)}><i class="mk"></i>{esc(r["text"])}</div>'
                      for i, r in enumerate(rows)))
    prev = built + 0.15
    for i, r in enumerate(rows):
        t = max(m(r.get("at", 0)), prev + (0.3 if i == 0 else 0.8))
        prev = t
        lines = [f"tl.fromTo('#{gid}-r{i}', {{ opacity: 0, x: -36 }}, {{ opacity: 1, x: 0, duration: 0.42, ease: 'power3.out' }}, {q(t)});",
                 f"tl.fromTo('#{gid}-r{i} .mk', {{ scaleY: 0 }}, {{ scaleY: 1, duration: 0.3, ease: 'power2.out' }}, {q(t + 0.12)});"]
        if i:
            lines.append(f"tl.to('#{gid}-r{i - 1}', {{ opacity: 0.42, duration: 0.3 }}, {q(t)});")
            lines.append(f"tl.to('#{gid}-r{i - 1} .mk', {{ scaleY: 0, duration: 0.25 }}, {q(t)});")
        beats.append((t, " ".join(lines), "row"))
    return html, h, beats


fx.init(globals())


def who_at_cut(tc):
    t, w = src(tc), ""
    for x in TURNS:
        if x.get("at", 0) <= t + 0.3:
            w = x.get("who") or ""
    return w


for gid, g, t0, t1 in PLANNED:
    kind = g.get("kind") or "list"

    # the effect library (fx.py): the cut-out effects, the vertigo move and the app on screen. An effect that fails (a
    # cut-out that won't make) is left out and the reel goes on: the camera simply holds the one-face shot there.
    if kind == "vertigo" or kind == "frame" or kind == "screen" or kind in fx.CUTOUT_KINDS:
        try:
            if kind == "vertigo":
                fx.vertigo(gid, t0, t1, side_cut(t0))
            elif kind == "frame":
                fx.frame(gid, g, t0, t1, side_cut(t0), who_at_cut(t0))
            elif kind == "screen":
                fx.screen(gid, g, t0, t1, side_cut(t0), device_of(g))
            else:
                getattr(fx, kind)(gid, g, t0, t1, side_cut(t0))
        except Exception as e:  # noqa: BLE001
            fx.SKIPPED.append(f"{kind}: {str(e)[:120]}")
        continue

    if kind == "clones":
        # the camera pulls back: the speaker repeats across a 3 x 3 wall, then it pushes back in to the one real shot.
        # The wall is cut from the graded footage here (each tile = exactly what the solo shot shows), so it plays along.
        side = side_cut(t0)
        crop = ("crop=540:960:270:0" if side == "top" else "crop=540:960:270:960") if STACK else "crop=1080:1920:0:0"
        d = round(t1 - t0, 3)
        out = ROOT / f"assets/{gid}-wall.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.3f}", "-t", f"{d:.3f}", "-i", str(ROOT / "assets/moody.mp4"),
                        "-filter_complex", f"[0:v]{crop},scale=360:640,split=9[a][b][c][d][e][f][g][h][i];"
                        "[a][b][c][d][e][f][g][h][i]xstack=inputs=9:layout=0_0|360_0|720_0|0_640|360_640|720_640|0_1280|360_1280|720_1280,"
                        "format=yuv420p[v]", "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", str(out)], check=True)
        label = str(g.get("title") or g.get("text") or g.get("label") or "")[:28]
        LAYERS["ui"].append(f'<div id="{gid}" class="L wallw"><video id="{gid}-v" class="clip" src="assets/{gid}-wall.mp4" data-start="{q(t0):.4f}" '
                            f'data-duration="{q(d):.4f}" data-track-index="1" muted playsinline></video></div>')
        st(f"#{gid}", "{ scale: 3, transformOrigin: '540px 960px', opacity: 1 }", t0)
        to(f"#{gid}", "{ scale: 1 }", t0 + 0.15, 0.9, "expo.inOut")
        to(f"#{gid}", "{ scale: 3 }", t1 - 0.65, 0.6, "expo.inOut")
        sfx("whoosh-short", t0 + 0.15, 0.07)
        sfx("whoosh-short", t1 - 0.65, 0.05)
        if label:
            clip("ui", f"{gid}-l", t0 + 0.9, t1 - 0.6, f'<div class="wall-l"><div class="jt2">{esc(label)}</div></div>', track=3)
            tw(f"#{gid}-l .jt2", "{ opacity: 0, scale: 0.8 }", "{ opacity: 1, scale: 1 }", t0 + 0.9, 0.4, "back.out(2)")
        MOTION.append((t0, t0 + 1.2))
        continue

    if kind == "tag":
        # a blue tag that hangs beside the speaker's head on the solo shot and swings, then drops away
        text = str(g.get("text") or g.get("title") or "")[:24]
        px, py = 80, 420
        t_hang = max(t0 + 0.6, m(g.get("at", 0)))
        clip("ui", gid, t0, t1 + 0.5, f'<div class="tagw" style="left:{px}px;top:{py}px"><div class="tag-str"></div><div class="tag" id="{gid}-t">{esc(text)}</div></div>')
        tw(f"#{gid} .tagw", "{ opacity: 0, y: -60 }", "{ opacity: 1, y: 0 }", t_hang - 0.3, 0.4, "power3.out")
        for k, a in enumerate([9, -6, 3.5, -1.5, 0]):
            to(f"#{gid} .tagw", f"{{ rotation: {a} }}", t_hang + 0.5 + k * 0.32, 0.32, "sine.inOut")
        tw(f"#{gid} .tagw", "{ opacity: 1 }", "{ opacity: 0, y: 40 }", t1, 0.45, "power2.in")
        sfx("pop", t_hang, 0.06)
        MOTION.append((t_hang - 0.6, t_hang + 1.0))
        continue

    # the window is open (the camera move ends) about 0.15 s after t0
    html, ch, beats = build_box(gid, g, t0)
    CY = max(G_TOP, G_BOTTOM - ch)
    sel = f"#{gid} .bcard"
    clip("ui", gid, t0, t1 + 0.6,
         f'<div class="cardg"><div class="bcard wbox bk-{kind}" style="left:{GX}px;top:{CY}px;width:{GW}px;height:{ch}px">{html}</div></div>')
    MOTION.append((t0 - 0.1, t0 + 1.4))
    if kind == "stat":
        # the plate drops in empty and the number counts up into it
        tw(sel, "{ opacity: 0, y: -80 }", "{ opacity: 1, y: 0 }", t0, 0.45, "bounce.out")
        sfx("impact-bass-1", t0 + 0.4, 0.08)
    elif kind == "message":
        # the card slides in from the right, then the message types itself in
        tw(sel, "{ x: 980, opacity: 1 }", "{ x: 0 }", t0 + 0.05, 0.85, "power2.out")
        sfx("whoosh-short", t0 + 0.05, 0.06)
    else:
        # the box builds itself, a quick wipe up from the window
        tw(sel, "{ clipPath: 'inset(100% 0% 0% 0%)', y: 24 }", "{ clipPath: 'inset(0% 0% 0% 0%)', y: 0 }", t0, 0.5, "power3.out")
        sfx("click-soft", t0 + 0.2, 0.1)
    for t, what, bk in beats:
        js(what)
        if bk in ("count", "bar"):
            MOTION.append((t - 0.1, t + 1.1))
            sfx("whoosh-short", t, 0.04)
        elif bk == "row":
            MOTION.append((t - 0.05, t + 0.5))
            sfx("click-soft", t + 0.05, 0.08)
        elif bk == "pill":
            sfx("click-soft", t, 0.1)
    if kind == "message" and beats:
        MOTION.append((beats[0][0] - 0.1, beats[-1][0] + 0.3))
    # done: it lifts away as the camera moves back in
    tw(f"#{gid} .cardg", "{ opacity: 1, y: 0 }", "{ opacity: 0, y: -40 }", t1, 0.35, "power2.in")

# ---- the camera effects: zoom-blurs through jump cuts, and the ending's pull back into the player ------------------------
for j in ZOOMS:
    fx.zoom_through(j)
end = PLAN.get("end") or {}
if PULL:
    fx.pullback(PULL[0][0], end, CTX.get("show") or STUDIO["show"] or "The full episode")

# ---- end card --------------------------------------------------------------------------------------------------------
E0 = VID
clip("end", "endcard", E0, DUR,
     '<img class="endbg" src="assets/endframe.jpg" alt=""/><div class="endshade"></div>'
     '<div class="endslot"><div class="bend">'
     f'<div class="en">{esc(end.get("name") or STUDIO["ownerFull"])}</div>'
     f'<div class="ep">{esc(end.get("line", ""))}</div>'
     f'<div class="ecta2">{esc(end.get("cta", "Full episode"))}</div>'
     f'<div class="eurl2">{esc(end.get("url", "Link in bio"))}</div>'
     "</div></div>")
tw("#endcard .endbg", "{ scale: 1 }", "{ scale: 1.04 }", E0, DUR - E0, "sine.inOut")
tw("#endcard .endshade", "{ opacity: 0 }", "{ opacity: 1 }", E0, 0.6, "power2.out")
END_RISE = E0 + 0.1
tw("#endcard .bend", "{ opacity: 0, y: 60 }", "{ opacity: 1, y: 0 }", END_RISE, 0.7, "power3.out")
tw("#endcard .bend > div", "{ opacity: 0, y: 18 }", "{ opacity: 1, y: 0 }", END_RISE + 0.15, 0.5, "power3.out", ", stagger: 0.1")
sfx("whoosh-short", E0 - 0.05, 0.08)
# the button gives one small pulse once the card has landed
to("#endcard .ecta2", "{ scale: 1.06 }", END_RISE + 1.4, 0.25, "power2.out")
to("#endcard .ecta2", "{ scale: 1 }", END_RISE + 1.65, 0.3, "power2.inOut")

# ---- the camera, now that every window is known -------------------------------------------------------------------------
emit_cam()

# ---- captions: big, word by word, with whoever is talking -------------------------------------------------------------
KEYS = {k.lower().strip(".,?!") for k in (PLAN.get("keys") or [])}
SEGS = {s["id"]: s for s in CUT["segments"]}
norm = lambda s: "".join(ch for ch in str(s).lower() if ch.isalnum())  # noqa: E731
for wfix in PLAN.get("fixes") or []:   # caption word fixes (never call this fx: that's the effects module)
    for w in CUT["words"]:
        s = SEGS.get(w.get("seg"))
        src_t = s["in"] + w["start"] - s["start"] if s else w["start"]
        if abs(src_t - float(wfix.get("at", -99))) <= 1.5 and norm(w["text"]) == norm(wfix.get("from", "")) and wfix.get("to"):
            tail = w["text"][len(w["text"].rstrip(".,?!")):]
            w["text"] = str(wfix["to"]).rstrip(".,?!") + tail
            break
SUPPRESS = [(0, HOOK_END)] if HOOK_END else []
SUPPRESS += [(a + 0.2, b - 0.2) for a, b in WALLS]
words = [w for w in CUT["words"] if not any(a <= (w["start"] + w["end"]) / 2 < b for a, b in SUPPRESS) and (w["start"] + w["end"]) / 2 < VID]
for i, w in enumerate(words):
    if (i == 0 or words[i - 1]["text"].endswith((".", "?", "!")) or w["start"] - words[i - 1]["end"] > 1.0) and w["text"][:1].islower():
        w["text"] = w["text"][0].upper() + w["text"][1:]
groups, cur = [], []
for w in words:
    if cur and (len(cur) >= 3 or sum(len(x["text"]) + 1 for x in cur) + len(w["text"]) > 16
                or w["start"] - cur[-1]["end"] > 0.45 or w["seg"] != cur[-1]["seg"]):
        groups.append(cur)
        cur = []
    cur.append(w)
    if w["text"].endswith((".", ",", "?", "!")):
        groups.append(cur)
        cur = []
if cur:
    groups.append(cur)


def cap_top(t):
    if in_any(t, FRAMEW):
        return 1560
    name, side = cam_at(t)
    if name == "win":
        return 1440
    if name == "split":
        return 1660
    if name == "player":
        return 1580
    if STACK and name == "full":
        return 862 if side == "top" else 978
    return 1330 if STACK else 1380


for gi, g in enumerate(groups):
    g0 = g[0]["start"] - 0.04
    nxt = groups[gi + 1][0]["start"] - 0.04 if gi + 1 < len(groups) else VID
    g1 = max(g0 + 0.2, min(nxt, g[-1]["end"] + 0.5, VID))
    spans = "".join(f'<span class="cw{" ck" if w["text"].strip(".,?!").lower() in KEYS else ""}" id="w{gi}_{i}">{esc(w["text"])}</span>'
                    for i, w in enumerate(g))
    small = " cg-s" if (STACK and cam_at(g0)[0] == "full") else ""
    clip("caps", f"cg{gi}", g0, g1, f'<div class="cg{small}" style="top:{cap_top(g0)}px">{spans}</div>', track=5)
    for i, w in enumerate(g):
        t = max(g0, w["start"] - 0.03)
        key = w["text"].strip(".,?!").lower() in KEYS
        tw(f"#w{gi}_{i}", "{ opacity: 0, y: 26, scale: 0.62 }", f"{{ opacity: 1, y: 0, scale: {1.1 if key else 1} }}", t, 0.22, "back.out(2.4)")
    if g1 - g0 > 0.5:
        to(f"#cg{gi} .cg", "{ opacity: 0, y: -10 }", g1 - 0.12, 0.12, "power1.in")

# ---- page --------------------------------------------------------------------------------------------------------------
CSS = "\n".join((ROOT / f).read_text() for f in ("style.css", "brand.css")) + f"""
#bg {{ background: radial-gradient(ellipse 90% 60% at 50% 30%, #14293a, #0b1b27 70%); }}
#cam {{ transform-origin: 0px 0px; }}
#seam {{ position: absolute; left: 0; right: 0; top: 959px; height: 2px; background: rgba(5, 8, 13, 0.55); }}
#winframe {{ position: absolute; left: {WX - 3}px; top: {WY - 3}px; width: {WW + 6}px; height: {WH + 6}px; border: 3px solid rgba(255, 255, 255, 0.92);
  border-radius: 30px; opacity: 0; }}
.cg {{ left: 50px; right: 50px; font-weight: 800; font-size: 76px; line-height: 1.08; column-gap: 20px;
  text-shadow: 0 3px 0 rgba(0, 0, 0, 0.55), 0 0 18px rgba(0, 0, 0, 0.7), 0 0 4px rgba(0, 0, 0, 0.8); }}
.cg.cg-s {{ font-size: 60px; }}
.cw {{ display: inline-block; opacity: 0; transform-origin: 50% 80%; }}
.cw.ck {{ color: #86d3ff; }}
.hookslot {{ position: absolute; width: 760px; }}
.hookslot .jt2 {{ display: inline-block; white-space: normal; max-width: 760px; font-size: 54px; line-height: 1.1; padding: 20px 30px 19px; }}
.ncard {{ padding: 24px 32px 22px; max-width: 760px; }}
.ncard .bc-t {{ font-size: 60px; line-height: 62px; }}
.ncard .bc-l {{ margin-top: 14px; font-size: 32px; line-height: 40px; color: #444444; }}
.bcard {{ box-sizing: border-box; overflow: hidden; }}
.wbox {{ padding: 30px 32px 26px; }}
.wbox .bc-row {{ height: {ROW}px; font-size: {R_SIZE}px; overflow: hidden; text-overflow: ellipsis; }}
.lrow {{ position: relative; padding-left: 30px; }}
.lrow .mk {{ position: absolute; left: 0; top: 18px; bottom: 18px; width: 9px; background: #38b6ff; }}
.bs-v {{ margin-top: 14px; font-family: "Libre Franklin", sans-serif; font-weight: 800; line-height: 1; letter-spacing: -0.02em; color: #111111; }}
.bs-l {{ margin-top: 16px; font-family: "Poppins", sans-serif; font-weight: 500; font-size: 34px; line-height: 44px; color: #444444; }}
.bm-from {{ margin-top: 14px; font-family: "Poppins", sans-serif; font-size: 30px; line-height: 36px; color: #6b6b6b; }}
.bm-body {{ margin-top: 12px; font-family: "Poppins", sans-serif; font-weight: 500; line-height: 1.42; color: #111111; }}
.bm-body .mw {{ opacity: 0; }}
.bm-pill {{ display: inline-block; margin-top: 18px; padding: 10px 22px; background: #38b6ff; color: #111111; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 28px; text-transform: uppercase; letter-spacing: 0.02em; }}
.bk {{ margin-top: 18px; }}
.bk-l {{ font-family: "Poppins", sans-serif; font-weight: 600; font-size: 34px; line-height: 42px; color: #111111; }}
.bk-b {{ margin-top: 8px; height: 32px; background: #111111; transform-origin: 0 50%; }}
.bk-b.bk-hi {{ background: #38b6ff; }}
.tagw {{ position: absolute; display: flex; flex-direction: column; align-items: center; transform-origin: 50% 0; }}
.tagw::before {{ content: ""; width: 12px; height: 12px; border-radius: 50%; background: #111111; }}
.tag-str {{ width: 2px; height: 46px; background: #111111; }}
.tag {{ background: #38b6ff; color: #111111; font-family: "Libre Franklin", sans-serif; font-weight: 800; font-size: 40px; line-height: 1; padding: 16px 24px 15px; text-transform: uppercase; letter-spacing: 0.01em; white-space: nowrap; }}
.wallw video {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }}
.wall-l {{ position: absolute; left: 0; right: 0; top: 500px; display: flex; justify-content: center; }}
.wall-l .jt2 {{ font-size: 58px; padding: 22px 32px 21px; }}
""" + fx.CSS + f"""
/* The look: mostly The Board, a splash of Kinetic Layers. When the speaker steps into the window the screen behind is
   a board in the primary colour with a faint dot grid; the window gets a white frame and a hard ink shadow; boxes
   become white cards with ink edges and shadows; key words pop into a tilted white box. The accent is used sparingly
   (a full accent board is too loud and busy): the hanging tag and the end card's button. */
#bg {{ background-color: #1e4e6e; background-image: radial-gradient(rgba(255, 255, 255, 0.075) 2.4px, transparent 2.8px); background-size: 36px 36px; }}
#winframe {{ left: {WX - 10}px; top: {WY - 10}px; width: {WW + 20}px; height: {WH + 20}px; border: 10px solid #ffffff; border-radius: 37px;
  box-shadow: 14px 14px 0 #0f0f0f; box-sizing: border-box; }}
.bcard {{ border: 6px solid #0f0f0f; border-radius: 22px; box-shadow: 14px 14px 0 #0f0f0f; color: #0f0f0f; }}
.bc-t {{ font-weight: 900; letter-spacing: -0.02em; border-bottom: 4px solid #0f0f0f; }}
.bc-row {{ font-weight: 600; }}
.lrow .mk {{ background: #38b6ff; border: 3px solid #0f0f0f; width: 12px; border-radius: 3px; }}
.jt2 {{ background: #ffffff; color: #0f0f0f; font-weight: 900; border-radius: 12px; box-shadow: 9px 9px 0 #0f0f0f; rotate: -2deg; }}
.tag {{ background: #ffc530; color: #0f0f0f; font-weight: 900; border-radius: 10px; box-shadow: 7px 7px 0 #0f0f0f; }}
.bs-v {{ font-weight: 900; color: #0f0f0f; }}
.bk-b {{ border-radius: 8px; }}
.bend {{ border: 6px solid #0f0f0f; border-radius: 26px; box-shadow: 16px 16px 0 #0f0f0f; }}
.bend .en {{ font-weight: 900; text-transform: uppercase; letter-spacing: -0.025em; }}
.bend .ecta2 {{ background: #ffc530; color: #0f0f0f; font-weight: 900; border-radius: 12px; box-shadow: 6px 6px 0 #0f0f0f; }}
.cw.ck {{ color: #0f0f0f; background: #ffffff; padding: 0 0.16em; border-radius: 10px; box-shadow: 6px 6px 0 #0f0f0f; text-shadow: none;
  font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; rotate: -3deg; }}
.cw.ck:nth-child(even) {{ rotate: 2deg; }}
"""


def layer(n):
    return f'<div id="{n}" class="L">' + "\n".join(LAYERS[n]) + "</div>"


html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={W}, height={H}" />
<script src="assets/vendor/gsap.min.js"></script>
<style>
{CSS}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="{W}" data-height="{H}">
<div id="all" class="L">
  <div id="bg" class="L"></div>
  {layer("under")}
  <div id="zoomwrap" class="L">
  <div id="cam" class="L">
    <video id="base" class="clip" src="assets/moody.mp4" data-start="0" data-duration="{VID}" data-track-index="0" playsinline data-has-audio="true"></video>
    <div id="seam"></div>
  </div>
  </div>
  <div id="winframe"></div>
  {layer("ui")}
</div>
{layer("caps")}
{layer("end")}
{layer("stage")}
{layer("fx")}
{chr(10).join(AUDIO)}
</div>
<script>
(function () {{
  {(chr(10) + '  ').join(MOUNT)}
  const tl = gsap.timeline({{ paused: true }});
  {(chr(10) + '  ').join(JS)}
  tl.set({{}}, {{}}, {DUR});
  window.__timelines["main"] = tl;
}})();
</script>
</body>
</html>
"""
(ROOT / "index.html").write_text(recolor(html, STUDIO["palette"]))


# what's said in the reel, by speaker, so the coach's review knows who says what (plan_out.json goes up with the reel)
def who_at(t):
    w = ""
    for x in TURNS:
        if x.get("at", 0) <= t + 0.3:
            w = x.get("who") or ""
    return w


said = []
for w in CUT["words"]:
    s = SEGS.get(w.get("seg"))
    who = who_at(s["in"] + w["start"] - s["start"]) if s else ""
    if said and said[-1]["who"] == who:
        said[-1]["text"] += " " + w["text"]
    else:
        said.append({"who": who, "at": round(w["start"], 1), "text": w["text"]})
shots = [{"at": round(t, 2), "shot": n, "side": s} for t, n, s, _, _ in CAM]
effects = {"cutout_seconds": fx.CUT_LOG, "punches": [[round(a, 2), round(b, 2)] for a, b in PUNCH], "zooms": [round(j, 2) for j in ZOOMS], "straight": [round(j, 2) for j in STRAIGHT],
           "pullback": bool(PULL), "skipped": fx.SKIPPED, "placed": [[gid, kind_of(g), round(t0, 2), round(t1, 2)] for gid, g, t0, t1 in PLANNED]}
(ROOT / "plan_out.json").write_text(json.dumps({**PLAN, "said": said, "shots": shots, "effects": effects}, indent=1))

# the frames for the reviewer's contact sheet: about every 4 seconds, each moved off any moment where something is
# mid-build, so every sampled box is readable
sheet = []
for k in range(14):
    t = min(DUR - 0.5, 1.0 + k * (DUR - 1.5) / 13)
    for a, b in sorted(MOTION):
        if a <= t < b:
            t = min(DUR - 0.5, b + 0.1)
    sheet.append(round(t, 2))
(ROOT / "work/sheet_times.txt").write_text(" ".join(str(round(t * FPS)) for t in sheet))
print(f"index.html: {LAYOUT}, {DUR}s, {len(JS)} timeline calls, {len(CAM)} shots, "
      f"{len(AUDIO)} sounds, {len(groups)} caption groups, effects {[kind_of(g) for _, g, _, _ in PLANNED]}"
      + (f", cut-outs {sum(fx.CUT_LOG):.1f} s" if fx.CUT_LOG else "") + (f", punches {len(PUNCH)}" if PUNCH else "")
      + (f", zoom-throughs {len(ZOOMS)}" if ZOOMS else "") + (f", straight cuts {len(STRAIGHT)}" if STRAIGHT else "") + (", pull-back ending" if PULL else "")
      + (f"; left out: {'; '.join(fx.SKIPPED)}" if fx.SKIPPED else ""))
