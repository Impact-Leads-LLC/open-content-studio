#!/usr/bin/env python3
"""The animated reel (animated engine): a 1080x1920 HyperFrames composition from the beat plan, for a reel with no
camera footage. The look: mostly The Board, a splash of Kinetic Layers, never one format every time.

- The Board: a board in the palette's primary colour (harbor blue #1E4E6E by default) with a faint white dot grid,
  huge white Libre Franklin 900 caps, white cards and stickers with hard ink #0F0F0F offset shadows, ink chips, the
  beat's key word in a white box.
- Kinetic Layers (about one beat in four): a dark panel (the palette's ink) wipes up and the content hovers on it:
  tilted stickers, a big outlined number, a highlighter on the key word, everything flying in and out.
- The accent colour (yellow #FFC530 by default) is an accent, never a background (yellow boards read too loud and
  busy): numbers, the highlighter, the "after" chip, a list's current row, the kinetic stickers and the end card's
  button.
- The reel opens on its cover (the hook in the cover's type) for about half a second, then slides into the first beat.
  Never more than a few seconds without something moving; no seizure-level animation.
- With the owner's voiceover (plan["vo"]): every beat starts on the phrase it covers, list rows land as they are said,
  a number counts up as it is said, and the words run as live captions under every beat; the sound effects sit lower
  under the voice. Without one, each beat lasts as long as its words take to read.

Every brand colour in the page comes from context.json's studio.palette (studio.py recolor), and the end card's name
from studio too.

In: work/plan.json (plan.mjs), context.json. Out: work/comp/ (index.html, assets), work/plan_out.json (the plan with
every beat's time and what's on screen, for the editor's note and the coach's review), work/sheet_times.txt
(contact-sheet frames, each on a settled moment).
"""
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from studio import recolor, studio  # noqa: E402

W, H, FPS = 1080, 1920, 30
plan = json.load(open("work/plan.json"))
ctx = json.load(open("context.json")) if os.path.exists("context.json") else {}
ST = studio(ctx)
piece = ctx.get("piece") or {}
BEATS = [b for b in plan.get("beats") or [] if isinstance(b, dict)]
if not BEATS:
    raise SystemExit("the plan has no beats")
END = plan.get("end") or {}
# the owner's voiceover: the cleaned take (run.sh) and its words, phrase by phrase, with their times
VO = bool(plan.get("vo")) and bool(plan.get("phrases")) and os.path.exists("work/vo.m4a")
PH = plan.get("phrases") or []
VOW = []
if VO:
    VOW = [w for w in json.load(open("work/vo-words.json")).get("words", []) if str(w.get("text", "")).strip()]
    import subprocess
    VOLEN = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "work/vo.m4a"], capture_output=True, text=True).stdout.strip() or 0) or (PH[-1]["end"] + 0.3)
COMP = Path("work/comp")
if COMP.exists():
    shutil.rmtree(COMP)
(COMP / "assets").mkdir(parents=True)

# ---- type that fits: real widths from the fonts (Pillow), so nothing spills off a phone screen --------------------
try:
    from PIL import ImageFont
except Exception:  # the builder still runs; widths become an estimate
    ImageFont = None
FONTS = {"lf": ROOT / "assets/fonts/LibreFranklin-VF.ttf", "ar": ROOT / "assets/fonts/Archivo-var.ttf", "pop": ROOT / "assets/fonts/Poppins-SemiBold.ttf"}
_FC = {}


def font(kind, px, wght, wdth):
    k = (kind, int(px), wght, wdth)
    if k not in _FC:
        f = ImageFont.truetype(str(FONTS[kind]), int(px))
        try:
            vals = []
            for ax in f.get_variation_axes():
                n = ax.get("name", "")
                n = (n.decode() if isinstance(n, bytes) else str(n)).lower()
                vals.append(wght if "weight" in n else wdth if "width" in n else ax.get("default", 0))
            if vals:
                f.set_variation_by_axes(vals)
        except Exception:
            pass
        _FC[k] = f
    return _FC[k]


def width(text, px, kind="lf", track=-0.03, wght=900, wdth=100, caps=True):
    t = text.upper() if caps else text
    if ImageFont is None:
        return len(t) * px * {"lf": 0.68, "ar": 0.56, "pop": 0.55}[kind] + track * px * max(0, len(t) - 1)
    return font(kind, px, wght, wdth).getlength(t) + track * px * max(0, len(t) - 1)


def wrap(text, px, w, **kw):
    lines, cur = [], ""
    for word in str(text).split():
        t = f"{cur} {word}".strip()
        if cur and width(t, px, **kw) > w:
            lines.append(cur)
            cur = word
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines or [""]


def fit(text, w, lines=2, top=150, low=40, **kw):
    """The biggest size (px) at which the text wraps into `lines` lines no wider than w: (size, lines)."""
    for size in range(top, low - 1, -2):
        ls = wrap(text, size, w, **kw)
        if len(ls) <= lines and all(width(x, size, **kw) <= w for x in ls):
            return size, ls
    return low, wrap(text, low, w, **kw)


def key_span(text, key):
    """The word range of the key phrase inside the text, or (-1, -1)."""
    ws = str(text).split()
    kw = str(key or "").lower().split()
    if not kw:
        return -1, -1
    low = [re.sub(r"[^\w$%+]", "", w.lower()) for w in ws]
    kk = [re.sub(r"[^\w$%+]", "", w) for w in kw]
    for i in range(len(ws) - len(kk) + 1):
        if low[i:i + len(kk)] == kk:
            return i, i + len(kk) - 1
    return -1, -1


def fit_heading(text, key, w, lines, top, low, pad=0.34):
    """fit() for a heading whose key phrase sits in one chip (it never breaks, and its padding takes room)."""
    ws = str(text).split()
    lo, hi = key_span(text, key)
    toks = []
    i = 0
    while i < len(ws):
        if i == lo:
            toks.append((" ".join(ws[lo:hi + 1]), True))
            i = hi + 1
        else:
            toks.append((ws[i], False))
            i += 1
    for size in range(top, low - 1, -2):
        n, cur = 1, 0.0
        ok = True
        sp = width(" ", size)
        for t, chip in toks:
            tw_ = width(t, size) + (pad * size if chip else 0)
            if tw_ > w:
                ok = False
                break
            if cur and cur + sp + tw_ > w:
                n, cur = n + 1, tw_
            else:
                cur = cur + (sp if cur else 0) + tw_
        if ok and n <= lines:
            return size, n
    return low, lines


def q(t):
    return round(round(t * FPS) / FPS, 4)


def esc(s):
    return html.escape(str(s or ""), quote=True)


def nwords(t):
    return len(str(t or "").split())


# ---- timing: every beat lasts as long as its words take to read (no voice) ------------------------------------------
READ = 3.0          # words a second, big type
CAPREAD = 2.8       # words a second, a caption sentence
IN, OUT = 0.55, 0.42
COVER = 0.45        # the cover holds, then slides away over the first beat
END_LEN = 4.8


def beat_len(b, land):
    L = b["layout"]
    n = nwords(b.get("text"))
    if L == "statement":
        d = IN + n / READ + land + OUT
    elif L == "number":
        d = IN + 1.95 + nwords(b.get("label")) / READ + land + OUT
    elif L == "list":
        d = IN + 0.4 + sum(0.4 + nwords(r) / READ for r in b["rows"]) + land + OUT
    elif L == "before_after":
        d = IN + nwords(b.get("before")) / READ + 0.8 + nwords(b.get("after")) / READ + land + OUT
    elif L == "quote":
        d = IN + 0.4 + n / 2.6 + land + OUT
    elif L == "card":
        d = IN + 0.9 + n / READ + land + OUT
    else:   # kinetic
        d = IN + (n + sum(nwords(r) for r in b.get("rows") or [])) / READ + 0.35 * len(b.get("rows") or []) + (0.5 if b.get("value") else 0) + land + OUT
    if b.get("line"):
        d = max(d, IN + 0.5 + nwords(b["line"]) / CAPREAD + land + OUT)
    return max(2.8, min(d, 9.0))


def total(beats, land):
    return COVER + sum(beat_len(b, land) for b in beats) + END_LEN


LAND = 1.1
beats = list(BEATS)
# 20 to 45 seconds: tighten the holds first, then drop middle beats a long reel can lose (never the hook or the last);
# a short one holds each beat a little longer
while total(beats, LAND) > 45 and LAND > 0.75:
    LAND -= 0.05
while total(beats, LAND) > 45 and len(beats) > 6:
    mid = [i for i in range(1, len(beats) - 1) if beats[i]["layout"] in ("statement", "kinetic", "quote")] or list(range(1, len(beats) - 1))
    beats.pop(max(mid, key=lambda i: beat_len(beats[i], LAND) * (0.5 if beats[i]["layout"] in ("number", "list", "card") else 1)))
while total(beats, LAND) < 20 and LAND < 2.2:
    LAND += 0.1
# a drop can leave two of one layout side by side; the second one turns kinetic or statement
for i in range(1, len(beats)):
    if beats[i]["layout"] == beats[i - 1]["layout"] and beats[i]["layout"] in ("statement", "kinetic"):
        beats[i] = {**beats[i], "layout": "kinetic" if beats[i]["layout"] == "statement" else "statement"}

t = COVER
for b in beats:
    b["t0"] = q(t)
    t += beat_len(b, LAND)
    b["t1"] = q(t)
E0 = q(t)
if VO:
    # the voice starts as the cover slides away; each beat starts just before its first phrase and runs to the next beat
    beats = [b for b in BEATS if isinstance(b.get("from"), int)] or list(BEATS)
    AOFF = COVER
    for k, b in enumerate(beats):
        b["t0"] = q(COVER if k == 0 else AOFF + PH[b["from"]]["start"] - 0.15)
    for k, b in enumerate(beats):
        b["t1"] = q(beats[k + 1]["t0"] if k + 1 < len(beats) else AOFF + max(PH[b["to"]]["end"], VOLEN - 0.1) + 0.55)
    E0 = beats[-1]["t1"]
    import difflib

    def said_at(b, text, after=0.0):
        """When, inside the beat, the words closest to `text` are said (the phrase's start), or None."""
        cands = [p for p in PH[b["from"]:b["to"] + 1] if AOFF + p["start"] >= after - 0.01]
        if not cands or not text:
            return None
        best = max(cands, key=lambda p: difflib.SequenceMatcher(None, p["text"].lower(), str(text).lower()).ratio())
        return AOFF + best["start"]

    def number_at(b):
        """When the beat's number is said."""
        digits = re.sub(r"[^\d]", "", str(b.get("value") or ""))
        for w in VOW:
            if AOFF + w["start"] >= b["t0"] and AOFF + w["start"] < b["t1"] and digits and digits in re.sub(r"[^\d]", "", str(w["text"])):
                return AOFF + w["start"]
        return None

    for b in beats:
        if b["layout"] == "list":
            ts, shown_, heard = [], b["t0"] + 0.5, b["t0"] - 0.2
            for r in b["rows"]:
                at = said_at(b, r, heard)     # the phrase that says the row, never one before the last row's
                if at is not None:
                    heard = at + 0.01
                at = max(shown_, at if at is not None else shown_)
                ts.append(q(at)); shown_ = at + 0.45
            if ts[-1] > b["t1"] - 0.9:   # too late to read: spread them over the beat instead
                span = max(0.5, (b["t1"] - 0.9 - (b["t0"] + 0.5)) / max(1, len(ts)))
                ts = [q(b["t0"] + 0.5 + k * span) for k in range(len(ts))]
            b["row_t"] = ts
        elif b["layout"] == "number":
            at = number_at(b)
            if at is not None and at < b["t1"] - 1.6:
                b["count_t"] = q(max(b["t0"] + 0.45, at - 0.2))
        elif b["layout"] == "before_after":
            at = said_at(b, b.get("after"), b["t0"] + 1.0)
            if at is not None and at < b["t1"] - 1.2:
                b["after_t"] = q(at)
DUR = q(E0 + END_LEN)

# ---- the composition -------------------------------------------------------------------------------------------------
for f in ("fonts/LibreFranklin-VF.ttf", "fonts/Archivo-var.ttf", "fonts/Poppins-Regular.ttf", "fonts/Poppins-SemiBold.ttf", "vendor/gsap.min.js"):
    (COMP / "assets" / Path(f).parent).mkdir(parents=True, exist_ok=True)
    shutil.copy(ROOT / "assets" / f, COMP / "assets" / f)
shutil.copytree(ROOT / "assets/sfx", COMP / "assets/sfx")
shutil.copy(ROOT / "hyperframes.json", COMP / "hyperframes.json")
(COMP / "meta.json").write_text(json.dumps({"id": "animated-reel", "name": "animated-reel"}))

JS, UI, AUDIO, SETTLED = [], [], [], []
SFX_LEN = {"click-soft": 0.366, "click": 0.366, "impact-bass-1": 1.2, "impact-bass-2": 1.3, "pop": 0.72, "whoosh-short": 0.575, "whoosh": 0.575}


def js(s):
    JS.append(s)


def sfx(name, t_, vol):
    if t_ < 0 or t_ >= DUR - 0.05:
        return
    if VO:
        vol = round(vol * 0.5, 3)    # under the voice
    n = len(AUDIO) + 1
    AUDIO.append(f'<audio id="sfx{n}" src="assets/sfx/{name}.mp3" data-start="{q(t_):.4f}" data-duration="{min(SFX_LEN.get(name, 0.6), DUR - q(t_)):.3f}" '
                 f'data-track-index="{20 + n % 8}" data-volume="{vol}"></audio>')


def clip(cid, start, end, inner, track=2, style=""):
    # the clip's own id is never the id of what's inside it (the timeline targets the inner element)
    UI.append(f'<div class="clip c" id="k-{cid}" data-start="{q(start):.4f}" data-duration="{q(end - start):.4f}" data-track-index="{track}" style="{style}">{inner}</div>')


def ft(sel, frm, to_, at, dur, ease="expo.out", extra=""):
    js(f"tl.fromTo('{sel}', {frm}, {{ ...{to_}, duration: {dur}, ease: '{ease}'{extra} }}, {q(at)});")


def heading(text, key, cls="hd"):
    """Words that rise into place one by one; the key word(s) sit in an ink chip that pops in after."""
    ws = str(text).split()
    kw = str(key or "").lower().split()
    lo = hi = -1
    if kw:
        low = [re.sub(r"[^\w$%+]", "", w.lower()) for w in ws]
        kk = [re.sub(r"[^\w$%+]", "", w) for w in kw]
        for i in range(len(ws) - len(kk) + 1):
            if low[i:i + len(kk)] == kk:
                lo, hi = i, i + len(kk) - 1
                break
    out, i = [], 0
    while i < len(ws):
        if i == lo:
            inner = " ".join(f'<span class="wi">{esc(w)}</span>' for w in ws[lo:hi + 1])
            out.append(f'<span class="kw">{inner}</span>')
            i = hi + 1
            continue
        out.append(f'<span class="wm"><span class="wi">{esc(ws[i])}</span></span>')
        i += 1
    return " ".join(out)


def num_parts(v):
    m = re.match(r"^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$", str(v).strip())
    return (m.group(1), float(m.group(2).replace(",", "")), m.group(3)) if m else None


def count_up(sel, value, at, dur):
    p = num_parts(value)
    if not p:
        return
    pre, n, post = p
    m = re.search(r"\d[\d,]*(?:\.(\d+))?", str(value))
    dec = len(m.group(1)) if m and m.group(1) else 0
    js(f"(function(){{ const o={{v:0}}, el=document.querySelector('{sel}'); tl.fromTo(o, {{ v: 0 }}, {{ v: {n}, duration: {dur}, ease: 'power2.out', onUpdate: () => {{ "
       f"el.textContent = {json.dumps(pre)} + o.v.toLocaleString('en-US', {{ minimumFractionDigits: {dec}, maximumFractionDigits: {dec} }}) + {json.dumps(post)}; }} }}, {q(at)}); }})();")


def zone_out(sid, t1):
    js(f"tl.to('#{sid}', {{ opacity: 0, y: -70, duration: {OUT - 0.05}, ease: 'power2.in' }}, {q(t1 - OUT)});")


# where the caption sentence sits, and the room left above it for the graphic
CAP_TOP = 1316
ZTOP = 262


def zbot(b):
    return 1262 if (b.get("line") or VO) else 1500


def caption(sid, b, t0, t1, inv=False):
    """The caption sentence under the graphic: an ink box (white on the kinetic panel), its words popping in at reading
    pace, the beat's key word in a white box (harbor blue on the white box)."""
    line = b.get("line")
    if not line or VO:
        return
    size, _ = fit(line, 860, 2, 66, 44, kind="ar", track=0, wght=800, caps=False)
    keys = {re.sub(r"[^\w$%+]", "", k) for k in str(b.get("key") or b.get("value") or "").lower().split()}
    spans = " ".join(f'<span class="cw{" k" if re.sub(r"[^\w$%+]", "", w.lower()) in keys else ""}">{esc(w)}</span>' for w in line.split())
    cid = f"{sid}c"
    clip(cid, t0, t1, f'<div class="cap" style="top:{CAP_TOP}px"><div class="cbox{" inv" if inv else ""}" id="{cid}-b" style="font-size:{size}px">{spans}</div></div>', track=5)
    a = t0 + IN + 0.35
    ft(f"#{cid}-b", "{ opacity: 0, scale: 0.7, rotation: 3 }", "{ opacity: 1, scale: 1, rotation: -1 }", a - 0.06, 0.32, "back.out(2)")
    ft(f"#{cid}-b .cw", "{ opacity: 0, y: 24, scale: 0.6 }", "{ opacity: 1, y: 0, scale: 1 }", a, 0.24, "back.out(2.4)", f", stagger: {min(0.3, 1 / CAPREAD):.3f}")
    js(f"tl.to('#{cid}-b', {{ opacity: 0, y: 30, duration: {OUT - 0.08}, ease: 'power2.in' }}, {q(t1 - OUT)});")


def drift(sel, t0, t1, amp=10, rot=0.0):
    """The slow hover that keeps a settled beat from sitting still."""
    d = max(0.6, (t1 - t0 - 0.1) / 2)
    js(f"tl.to('{sel}', {{ y: '-={amp}', rotation: '+={rot}', duration: {d:.2f}, ease: 'sine.inOut', yoyo: true, repeat: 1 }}, {q(t0)});")


# ---- the layouts ------------------------------------------------------------------------------------------------------
board_k = {"statement": 0, "number": 0}


def statement(i, b):
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    align = ["left", "center"][board_k["statement"] % 2]
    board_k["statement"] += 1
    zb = zbot(b)
    size, nl = fit_heading(b["text"], b.get("key"), 900, 6 if not b.get("line") else 4, 196, 84)
    title = f'<span class="chip ink" data-r="-3">{esc(b["title"])}</span>' if b.get("title") else ""
    inner = title + f'<div class="hd" style="font-size:{size}px">{heading(b["text"], b.get("key"))}</div>'
    ai = "flex-start" if align == "left" else "center"
    clip(sid, t0, t1, f'<div class="zone sz" id="{sid}" style="left:90px;width:900px;top:{ZTOP}px;height:{zb - ZTOP}px;align-items:{ai};text-align:{align}">{inner}</div>')
    a = t0 + IN * 0.4 + b.get("lead", 0)
    n = nwords(b["text"])
    stag = 0.2 if n > 4 else 0.26
    if title:
        ft(f"#{sid} .chip", "{ opacity: 0, x: -60, rotation: -12 }", "{ opacity: 1, x: 0, rotation: -3 }", a, 0.5, "back.out(2)")
    ft(f"#{sid} .wm .wi", "{ yPercent: 118 }", "{ yPercent: 0 }", a + 0.1, 0.62, "expo.out", f", stagger: {stag}")
    kt = a + 0.1 + stag * max(0, n - 1) + 0.25
    has_kw = 'class="kw"' in inner
    if has_kw:
        ft(f"#{sid} .kw", "{ scale: 0, rotation: -14 }", "{ scale: 1, rotation: -2.5 }", kt, 0.5, "back.out(2.6)")
    # the slow push while it lands
    js(f"tl.fromTo('#{sid} .hd', {{ scale: 1 }}, {{ scale: 1.045, duration: {max(1.0, t1 - kt - OUT):.2f}, ease: 'sine.inOut', immediateRender: false }}, {q(kt)});")
    if has_kw:
        js(f"tl.fromTo('#{sid} .kw', {{ rotation: -2.5 }}, {{ rotation: 1.5, duration: {max(0.8, (t1 - kt - 0.6 - OUT) / 2):.2f}, ease: 'sine.inOut', yoyo: true, repeat: 1, immediateRender: false }}, {q(kt + 0.55)});")
    zone_out(sid, t1)
    sfx("whoosh-short", t0 + b.get("lead", 0), 0.36)
    if has_kw:
        sfx("impact-bass-1" if i == 0 else "pop", kt, 0.12 if i == 0 else 0.55)
    caption(sid, b, t0, t1)
    SETTLED.append(t1 - OUT - 0.2)


def number(i, b):
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    zb = zbot(b)
    vsize, _ = fit(b["value"], 900, 1, 430, 120, track=-0.045)
    lsize, lls = fit(b.get("label") or "", 820, 2, 78, 40)
    top = ZTOP + 30
    chip_h = 92 if b.get("title") else 0
    num_h = vsize * 0.88
    label_h = len(lls) * lsize * 0.98 + 40 if b.get("label") else 0
    # centre the block in the zone
    block = chip_h + num_h + 56 + label_h
    top = max(ZTOP, ZTOP + ((zb - ZTOP) - block) / 2)
    p = num_parts(b["value"])
    start = f"{p[0]}0{p[2]}" if p else b["value"]
    inner = ((f'<span class="chip blue" data-r="-3">{esc(b["title"])}</span>' if b.get("title") else "")
             + f'<div class="bnum" id="{sid}-v" style="font-size:{vsize}px">{esc(start)}</div>'
             + (f'<div class="st white lab" style="font-size:{lsize}px">{esc(b["label"])}</div>' if b.get("label") else ""))
    clip(sid, t0, t1, f'<div class="zone" id="{sid}" style="left:90px;width:900px;top:{top:.0f}px;display:flex;flex-direction:column;align-items:center;text-align:center">{inner}</div>')
    a = t0 + IN * 0.5
    if b.get("title"):
        ft(f"#{sid} .chip", "{ opacity: 0, y: -40, rotation: 10 }", "{ opacity: 1, y: 0, rotation: -3 }", a, 0.5, "back.out(2)")
    ft(f"#{sid}-v", "{ opacity: 0, scale: 0.5, rotation: -8 }", "{ opacity: 1, scale: 1, rotation: -2 }", a + 0.1, 0.6, "back.out(2)")
    c0 = b.get("count_t") or a + 0.55
    count_up(f"#{sid}-v", b["value"], c0, 1.35)
    if b.get("label"):
        ft(f"#{sid} .lab", "{ opacity: 0, y: 50, rotation: 4 }", "{ opacity: 1, y: 0, rotation: -1 }", c0 + 1.2, 0.5, "back.out(1.8)")
    js(f"tl.fromTo('#{sid}-v', {{ scale: 1 }}, {{ scale: 1.06, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false }}, {q(c0 + 1.35)});")
    drift(f"#{sid}", c0 + 1.8, t1 - OUT, 8, 0.6)
    zone_out(sid, t1)
    sfx("whoosh-short", t0, 0.36)
    sfx("impact-bass-2", c0 + 1.35, 0.12)
    sfx("pop", c0 + 1.2, 0.5)
    caption(sid, b, t0, t1)
    SETTLED.append(t1 - OUT - 0.2)


def rowlist(i, b):
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    zb = zbot(b)
    rows = b["rows"]
    card_top = ZTOP + 40
    room = zb - card_top - 170
    # one size for every row, as big as fits: a row may take two lines
    rsize, heights = 40, []
    for size in range(92, 39, -2):
        hs = [max(96, len(wrap(r, size, 690)) * size * 1.0 + 34) for r in rows]
        if all(width(x, size) <= 690 for r in rows for x in wrap(r, size, 690)) and all(len(wrap(r, size, 690)) <= 2 for r in rows) and sum(hs) + 16 * (len(rows) - 1) <= room:
            rsize, heights = size, hs
            break
    if not heights:
        heights = [max(96, len(wrap(r, rsize, 690)) * rsize + 34) for r in rows]
    title = f'<span class="chip ink" data-r="-2">{esc(b["title"])}</span>' if b.get("title") else ""
    rws = "".join(f'<div class="lrow" id="{sid}-r{k}" style="min-height:{heights[k]:.0f}px;font-size:{rsize}px"><b class="lb" id="{sid}-n{k}">{k + 1}</b><span>{esc(r)}</span></div>' for k, r in enumerate(rows))
    card_top = max(ZTOP, ZTOP + ((zb - ZTOP) - (sum(heights) + 16 * len(rows) + 170)) / 2)
    clip(sid, t0, t1, f'<div class="zone" id="{sid}" style="left:80px;width:920px;top:{card_top:.0f}px"><div class="card lcard" id="{sid}-card">{title}<div class="lrows">{rws}</div></div></div>')
    a = t0 + IN * 0.4
    ft(f"#{sid}-card", "{ opacity: 0, y: 120, rotation: 3 }", "{ opacity: 1, y: 0, rotation: -1 }", a, 0.6, "back.out(1.5)")
    if title:
        ft(f"#{sid} .chip", "{ opacity: 0, scale: 0.4, rotation: -14 }", "{ opacity: 1, scale: 1, rotation: -2 }", a + 0.3, 0.45, "back.out(2.4)")
    rt = a + 0.75
    times = []
    for k, r in enumerate(rows):
        if b.get("row_t"):
            rt = b["row_t"][k]
        times.append(rt)
        ft(f"#{sid}-r{k}", "{ opacity: 0, x: -80 }", "{ opacity: 1, x: 0 }", rt, 0.45, "back.out(1.8)")
        ft(f"#{sid}-n{k}", "{ scale: 0, rotation: -30 }", "{ scale: 1, rotation: 0 }", rt + 0.05, 0.4, "back.out(3)")
        # the row being added carries the accent marker; earlier rows step back
        js(f"tl.to('#{sid}-n{k}', {{ backgroundColor: '#38b6ff', color: '#0f0f0f', duration: 0.12 }}, {q(rt)});")
        if k:
            js(f"tl.to('#{sid}-n{k - 1}', {{ backgroundColor: '#0f0f0f', color: '#ffffff', duration: 0.25 }}, {q(rt)});")
            js(f"tl.to('#{sid}-r{k - 1} span', {{ opacity: 0.45, duration: 0.25 }}, {q(rt)});")
        sfx("click", rt + 0.05, 0.75)
        rt += 0.4 + nwords(r) / READ
    # once they're all in, the rows come back to full strength
    js(f"tl.to('#{sid} .lrow span', {{ opacity: 1, duration: 0.35 }}, {q(rt + 0.1)});")
    drift(f"#{sid}-card", rt + 0.3, t1 - OUT, 7, -0.6)
    zone_out(sid, t1)
    sfx("whoosh-short", t0, 0.36)
    caption(sid, b, t0, t1)
    SETTLED.append(t1 - OUT - 0.2)


def before_after(i, b):
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    zb = zbot(b)
    bs, bls = fit(b["before"], 800, 3, 100, 46)
    as_, als = fit(b["after"], 800, 3, 116, 48)
    bh = 92 + len(bls) * bs * 0.96 + 70
    ah = 92 + len(als) * as_ * 0.96 + 70
    gap = 64
    top = max(ZTOP, ZTOP + ((zb - ZTOP) - (bh + gap + ah)) / 2)
    l1, l2 = (b.get("title") or "Before"), (b.get("label") or "After")
    inner = (f'<div class="card bcard" id="{sid}-b" style="top:{top:.0f}px"><span class="chip ink">{esc(l1)}</span><div class="hd sm" style="font-size:{bs}px">{esc(b["before"])}</div></div>'
             f'<div class="card acard" id="{sid}-a" style="top:{top + bh + gap:.0f}px"><span class="chip yellow">{esc(l2)}</span><div class="hd sm w" style="font-size:{as_}px">{esc(b["after"])}</div></div>')
    clip(sid, t0, t1, f'<div class="zone free" id="{sid}" style="left:0;top:0;width:1080px;height:1920px">{inner}</div>')
    a = t0 + IN * 0.4
    ft(f"#{sid}-b", "{ opacity: 0, y: -140, rotation: -8 }", "{ opacity: 1, y: 0, rotation: -2 }", a, 0.65, "back.out(1.5)")
    ta = b.get("after_t") or a + 0.6 + nwords(b["before"]) / READ + 0.3
    js(f"tl.to('#{sid}-b', {{ scale: 0.93, opacity: 0.55, rotation: -4, duration: 0.45, ease: 'power2.out' }}, {q(ta)});")
    ft(f"#{sid}-a", "{ opacity: 0, x: 1100, rotation: 10 }", "{ opacity: 1, x: 0, rotation: 1.5 }", ta, 0.7, "power4.out")
    js(f"tl.fromTo('#{sid}-a', {{ scale: 1 }}, {{ scale: 1.035, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false }}, {q(ta + 0.62)});")
    drift(f"#{sid}-a", ta + 1.0, t1 - OUT, 9, -0.8)
    zone_out(sid, t1)
    sfx("whoosh-short", t0, 0.36)
    sfx("whoosh", ta, 0.3)
    sfx("impact-bass-1", ta + 0.55, 0.12)
    caption(sid, b, t0, t1)
    SETTLED.append(t1 - OUT - 0.2)


def quote(i, b):
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    zb = zbot(b)
    qs, qls = fit(b["text"], 800, 6, 96, 44, kind="pop", track=-0.01, wght=600, caps=False)
    ch = 150 + len(qls) * qs * 1.24 + 70
    top = max(ZTOP + 70, ZTOP + 70 + ((zb - ZTOP - 70) - (ch + 110)) / 2)
    who = f'<span class="chip ink qlab" data-r="2">{esc(b["label"])}</span>' if b.get("label") else ""
    words = " ".join(f'<span class="wq">{esc(w)}</span>' for w in b["text"].split())
    inner = (f'<div class="card qcard" id="{sid}-card" style="top:{top:.0f}px"><div class="qm">&ldquo;</div><div class="qt" style="font-size:{qs}px">{words}</div></div>'
             + (f'<div class="qwho" style="top:{top + ch + 40:.0f}px">{who}</div>' if who else ""))
    clip(sid, t0, t1, f'<div class="zone free" id="{sid}" style="left:0;top:0;width:1080px;height:1920px">{inner}</div>')
    a = t0 + IN * 0.4
    ft(f"#{sid}-card", "{ opacity: 0, x: -900, rotation: -12 }", "{ opacity: 1, x: 0, rotation: -2 }", a, 0.7, "power4.out")
    ft(f"#{sid} .qm", "{ opacity: 0, scale: 2.2, rotation: -25 }", "{ opacity: 1, scale: 1, rotation: 0 }", a + 0.45, 0.5, "back.out(2)")
    n = nwords(b["text"])
    ft(f"#{sid} .wq", "{ opacity: 0.14 }", "{ opacity: 1 }", a + 0.75, 0.2, "power1.out", f", stagger: {1 / 2.6:.3f}")
    if who:
        ft(f"#{sid} .qlab", "{ opacity: 0, x: 80, rotation: 12 }", "{ opacity: 1, x: 0, rotation: 2 }", a + 0.75 + n / 2.6, 0.45, "back.out(2)")
    drift(f"#{sid}-card", a + 1.0, t1 - OUT, 8, 0.7)
    zone_out(sid, t1)
    sfx("whoosh", t0, 0.38)
    sfx("pop", a + 0.5, 0.55)
    # a soft tick as the quote's words light up, every third word
    for k in range(0, n, 3):
        sfx("click-soft", a + 0.75 + k / 2.6, 0.55)
    caption(sid, b, t0, t1)
    SETTLED.append(t1 - OUT - 0.2)


def card_beat(i, b):
    """A white card pops in, tilts into place, and its line rises word by word; the key word sits in an ink chip."""
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    zb = zbot(b)
    size, nl = fit_heading(b["text"], b.get("key"), 720, 4, 150, 58)
    chip_h = 96 if b.get("title") else 0
    ch = 70 + chip_h + nl * size * 0.94 + 90
    top = max(ZTOP, ZTOP + ((zb - ZTOP) - ch) / 2)
    rect = [120, round(top), 840, round(ch)]
    title = f'<span class="chip ink" data-r="-2">{esc(b["title"])}</span>' if b.get("title") else ""
    inner = f'<div class="card mcard" id="{sid}-card" style="left:{rect[0]}px;top:{rect[1]}px;width:{rect[2]}px;height:{rect[3]}px">{title}<div class="hd" style="font-size:{size}px">{heading(b["text"], b.get("key"))}</div></div>'
    clip(sid, t0, t1, f'<div class="zone free" id="{sid}" style="left:0;top:0;width:1080px;height:1920px">{inner}</div>')
    a = t0 + IN * 0.4
    ft(f"#{sid}-card", "{ opacity: 0, scale: 0.6, rotation: -8 }", "{ opacity: 1, scale: 1, rotation: -1 }", a, 0.6, "back.out(1.8)")
    reveal_at = a + 0.4
    n = nwords(b["text"])
    if title:
        ft(f"#{sid} .chip", "{ opacity: 0, x: -50, rotation: -14 }", "{ opacity: 1, x: 0, rotation: -2 }", reveal_at + 0.15, 0.45, "back.out(2.2)")
    ft(f"#{sid} .wm .wi", "{ yPercent: 118 }", "{ yPercent: 0 }", reveal_at + 0.25, 0.55, "expo.out", ", stagger: 0.18")
    if 'class="kw"' in inner:
        ft(f"#{sid} .kw", "{ scale: 0, rotation: -14 }", "{ scale: 1, rotation: -2.5 }", reveal_at + 0.4 + 0.18 * n, 0.45, "back.out(2.6)")
        sfx("pop", reveal_at + 0.4 + 0.18 * n, 0.5)
    drift(f"#{sid}-card", reveal_at + 1.0, t1 - OUT, 6, 0.5)
    zone_out(sid, t1)
    sfx("whoosh-short", t0, 0.36)
    caption(sid, b, t0, t1)
    SETTLED.append(t1 - OUT - 0.2)


kin_k = [0]


def kinetic(i, b):
    """Kinetic Layers: the ink panel wipes up, and the content hovers on it, flies in tilted and flies out."""
    sid, t0, t1 = f"b{i}", b["t0"], b["t1"]
    zb = zbot(b)
    side = 1 if kin_k[0] % 2 == 0 else -1
    kin_k[0] += 1
    rows = (b.get("rows") or [])[:2]
    parts = []
    if b.get("value"):
        vs, _ = fit(b["value"], 860, 1, 340, 140, track=-0.04)
        parts.append(f'<div class="kpart"><div class="ko" style="font-size:{vs}px">{esc(b["value"])}</div></div>')
    ts, nl = fit_heading(b["text"], b.get("key"), 900, 5 if not rows else 4, 190, 74, pad=0.2)
    kw = str(b.get("key") or "").lower().split()
    ws = b["text"].split()
    clean = lambda w: re.sub(r"[^\w$%+]", "", w.lower())  # noqa: E731
    lo = next((k for k in range(len(ws) - len(kw) + 1) if kw and [clean(x) for x in ws[k:k + len(kw)]] == [clean(x) for x in kw]), -1)
    toks = []
    for k, w in enumerate(ws):
        if lo >= 0 and lo <= k < lo + len(kw):
            toks.append(f'<span class="mk"><i class="hl"></i><span class="mt">{esc(w)}</span></span>')
        else:
            toks.append(f'<span class="wm"><span class="wi">{esc(w)}</span></span>')
    parts.append(f'<div class="kpart"><div class="kt" style="font-size:{ts}px">{" ".join(toks)}</div></div>')
    for k, r in enumerate(rows):
        rs, _ = fit(r, 760, 1, 58, 34)
        cls = ["y", "w"][(k + kin_k[0]) % 2]
        rot = [-4, 3.5][k % 2] * side
        parts.append(f'<div class="kpart"><span class="ks {cls}" id="{sid}-s{k}" style="font-size:{rs}px;rotate:{rot}deg">{esc(r)}</span></div>')
    align = "flex-start" if side > 0 else "flex-end"
    clip(sid, t0, t1, f'<div class="zone kz" id="{sid}" style="left:80px;width:920px;top:{ZTOP}px;height:{zb - ZTOP}px;align-items:{align};text-align:{"left" if side > 0 else "right"}">{"".join(parts)}</div>')
    # the panel: up from below over the board; it stays if the next beat is kinetic too (never, by the plan's rules)
    js(f"tl.fromTo('#ink', {{ yPercent: 100 }}, {{ yPercent: 0, duration: 0.5, ease: 'expo.inOut', immediateRender: false }}, {q(t0 - 0.08)});")
    js(f"tl.fromTo('#ink', {{ yPercent: 0 }}, {{ yPercent: -100, duration: 0.5, ease: 'expo.inOut', immediateRender: false }}, {q(t1 - 0.2)});")
    a = t0 + 0.35 + b.get("lead", 0)
    dx = -420 * side
    if b.get("value"):
        ft(f"#{sid} .ko", "{ opacity: 0, scale: 1.8, rotation: 10 }", "{ opacity: 1, scale: 1, rotation: -4 }", a, 0.6, "back.out(1.6)")
        a += 0.45
    n = nwords(b["text"])
    ft(f"#{sid} .kt .wm .wi", "{ yPercent: 118 }", "{ yPercent: 0 }", a, 0.6, "expo.out", ", stagger: 0.18")
    mt = a + 0.18 * n + 0.2
    if lo >= 0:
        ft(f"#{sid} .kt .mk", "{ opacity: 0 }", "{ opacity: 1 }", a + 0.18 * lo, 0.01, "none")
        ft(f"#{sid} .hl", "{ scaleX: 0 }", "{ scaleX: 1 }", mt, 0.42, "power3.inOut")
        ft(f"#{sid} .mt", "{ color: '#ffffff' }", "{ color: '#0f0f0f' }", mt + 0.12, 0.2, "power1.out")
    st = mt + 0.45
    for k in range(len(rows)):
        ft(f"#{sid}-s{k}", f"{{ opacity: 0, x: {dx if k % 2 == 0 else -dx}, rotation: {24 * side} }}", "{ opacity: 1, x: 0, rotation: 0 }", st, 0.55, "back.out(1.6)")
        sfx("pop", st + 0.1, 0.55)
        st += 0.35 + nwords(rows[k]) / READ
    # hover: every part floats on its own beat; then they fly out, alternating sides
    for k in range(len(parts)):
        js(f"tl.fromTo('#{sid} .kpart:nth-child({k + 1})', {{ y: 0 }}, {{ y: {[-16, 12, -10, 14][k % 4]}, duration: {0.9 + 0.25 * k:.2f}, ease: 'sine.inOut', yoyo: true, repeat: {max(1, int((t1 - t0) / (0.9 + 0.25 * k)) - 1)}, immediateRender: false }}, {q(t0 + 0.6)});")
        js(f"tl.to('#{sid} .kpart:nth-child({k + 1}) > *', {{ x: {(-1) ** k * 700 * side}, rotation: {(-1) ** k * 18 * side}, opacity: 0, duration: 0.42, ease: 'back.in(1.6)' }}, {q(t1 - OUT - 0.02 + 0.05 * k)});")
    sfx("whoosh", t0 - 0.05, 0.42)
    if lo >= 0:
        sfx("whoosh-short", mt, 0.22)
    sfx("whoosh-short", t1 - OUT, 0.36)
    caption(sid, b, t0, t1, inv=True)
    SETTLED.append(t1 - OUT - 0.25)


LAYOUT_FN = {"statement": statement, "number": number, "list": rowlist, "before_after": before_after, "quote": quote, "card": card_beat, "kinetic": kinetic}
beats[0]["lead"] = 0.32   # the first beat builds as the cover slides away
for i, b in enumerate(beats):
    LAYOUT_FN.get(b["layout"], statement)(i, b)

# ---- the voice: its words as live captions under every beat (white on the board, on the ink panel inverted) ---------
if VO:
    shutil.copy("work/vo.m4a", COMP / "assets/vo.m4a")
    AUDIO.append(f'<audio id="vo" src="assets/vo.m4a" data-start="{AOFF:.4f}" data-duration="{min(VOLEN, DUR - AOFF):.3f}" data-track-index="19" data-volume="1"></audio>')
    beat_at = lambda t_: next((b for b in beats if b["t0"] <= t_ < b["t1"]), beats[-1])
    widx = 0
    for k, ph in enumerate(PH):
        a_ = AOFF + ph["start"]
        b_ = AOFF + (PH[k + 1]["start"] if k + 1 < len(PH) else ph["end"] + 0.5)
        b_ = min(b_, AOFF + ph["end"] + 0.6, E0)
        if b_ - a_ < 0.2:
            continue
        bt = beat_at(a_ + 0.01)
        ws = []
        while widx < len(VOW) and VOW[widx]["start"] < ph["end"] + 0.01:
            ws.append(VOW[widx]); widx += 1
        if not ws:
            continue
        keys = {re.sub(r"[^\w$%+]", "", x) for x in str(bt.get("key") or bt.get("value") or "").lower().split()}
        size, _ = fit(ph["text"], 860, 2, 64, 44, kind="ar", track=0, wght=800, caps=False)
        cid = f"vc{k}"
        spans = " ".join(f'<span class="cw{" k" if re.sub(r"[^\w$%+]", "", str(w["text"]).lower()) in keys else ""}" id="{cid}-w{j}">{esc(str(w["text"]).strip())}</span>' for j, w in enumerate(ws))
        clip(cid, a_ - 0.05, b_, f'<div class="cap" style="top:{CAP_TOP}px"><div class="cbox{" inv" if bt["layout"] == "kinetic" else ""}" id="{cid}-b" style="font-size:{size}px">{spans}</div></div>', track=5)
        ft(f"#{cid}-b", "{ opacity: 0, scale: 0.82 }", "{ opacity: 1, scale: 1 }", a_ - 0.05, 0.18, "back.out(2)")
        for j, w in enumerate(ws):
            ft(f"#{cid}-w{j}", "{ opacity: 0.25, y: 10 }", "{ opacity: 1, y: 0 }", AOFF + w["start"], 0.14, "power2.out")
        js(f"tl.to('#{cid}-b', {{ opacity: 0, duration: 0.08 }}, {q(b_ - 0.08)});")

# ---- the cover: the hook in the cover's type on the board, for half a second, then it slides up ---------------------
HOOKS = [re.sub(r"\s*[—–]\s*", ", ", str(h)).strip() for h in (plan.get("hook"), piece.get("hook"), beats[0].get("text"), plan.get("title")) if h]


def cover_layout(hook):
    # the cover's type: Archivo 800 at width 87.5, -0.01em; cap 96 (139.64 px, pitch 160) up to 3 lines, else cap 80
    # (116.37 px, pitch 133) up to 4, every line's ink at most 840 px
    for px, pitch, most in ((139.64, 160, 3), (116.37, 133, 4)):
        ls = wrap(hook, px, 840, kind="ar", track=-0.01, wght=800, wdth=87.5, caps=False)
        if len(ls) <= most and all(width(x, px, kind="ar", track=-0.01, wght=800, wdth=87.5, caps=False) <= 840 for x in ls):
            return px, pitch, ls
    return None


cov = next(((h, cover_layout(h)) for h in HOOKS if cover_layout(h)), None)
if cov:
    hook, (cpx, pitch, clines) = cov
    acc_done = False
    rows_html = []
    for ln in clines:
        m = None if acc_done else re.search(r"\$?\d[\d,.]*[%kKmM+]?(?:\s[A-Za-z]{1,9}\b)?", ln)
        if m:
            acc_done = True
            ln_html = esc(ln[:m.start()]) + f'<span class="acc">{esc(m.group(0))}</span>' + esc(ln[m.end():])
        else:
            ln_html = esc(ln)
        rows_html.append(f'<div class="cvl" style="height:{pitch}px;line-height:{pitch}px">{ln_html}</div>')
    block = pitch * len(clines)
    ctop = round(960 - block / 2 - 40)
    UI.append(f'<div class="clip c" id="cover" data-start="0" data-duration="{COVER + 0.5:.4f}" data-track-index="8" data-layout-allow-overlap><div id="coverp" class="L">'
              f'<div class="cv" style="top:{ctop}px;font-size:{cpx:.2f}px">{"".join(rows_html)}</div></div></div>')
    js(f"tl.fromTo('#coverp', {{ yPercent: 0 }}, {{ yPercent: -106, duration: 0.42, ease: 'power3.in', immediateRender: false }}, {q(COVER)});")
    sfx("whoosh-short", COVER - 0.02, 0.34)
else:
    hook = ""
    print("cover: skipped (every hook is too long for a cover)", flush=True)

# ---- the end card: a white brand card with the studio's name, the line, the button and the link -------------------
name = ST["ownerFull"] if ST["has_owner"] else (ST["brand"] if ST["brand"] != "the studio" else "")
ns, _ = fit(name, 780, 1, 130, 80)
es, els = fit(END.get("line") or "", 760, 2, 48, 32, kind="pop", track=0, wght=600, caps=False)
cs, _ = fit(END.get("cta") or "", 720, 2, 46, 30)
us, _ = fit(END.get("url") or "", 720, 1, 42, 28, kind="pop", track=0, wght=600, caps=False)
EC_TOP = 700
UI.append(f'<div class="clip c" id="endc" data-start="{E0:.4f}" data-duration="{DUR - E0:.4f}" data-track-index="4">'
          f'<div class="card ecard" id="ec" style="top:{EC_TOP}px">'
          + (f'<div class="en" style="font-size:{ns}px">{esc(name)}</div>' if name else "")
          + (f'<div class="ep" style="font-size:{es}px">{esc(END.get("line"))}</div>' if END.get("line") else "")
          + (f'<div class="ecta" style="font-size:{cs}px">{esc(END.get("cta"))}</div>' if END.get("cta") else "")
          + (f'<div class="eurl" style="font-size:{us}px">{esc(END.get("url"))}</div>' if END.get("url") else "")
          + "</div></div>")
ft("#ec", "{ opacity: 0, y: 160, rotation: 4 }", "{ opacity: 1, y: 0, rotation: -1 }", E0 + 0.05, 0.7, "back.out(1.4)")
ft("#ec > div", "{ opacity: 0, y: 26 }", "{ opacity: 1, y: 0 }", E0 + 0.3, 0.5, "expo.out", ", stagger: 0.12")
js(f"tl.fromTo('#ec', {{ y: 0 }}, {{ y: -10, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: 1, immediateRender: false }}, {q(E0 + 1.2)});")
sfx("whoosh-short", E0, 0.3)
# the button gets a small nudge once the card has settled, so the end card never sits still
if END.get("cta"):
    js(f"tl.fromTo('#ec .ecta', {{ scale: 1 }}, {{ scale: 1.06, duration: 0.22, ease: 'power2.out', yoyo: true, repeat: 3, immediateRender: false }}, {q(E0 + 1.6)});")
    sfx("pop", E0 + 1.6, 0.4)
SETTLED.append(DUR - 0.5)

# the board never sits still: the dot grid drifts the whole reel
js(f"tl.fromTo('#board', {{ backgroundPosition: '0px 0px' }}, {{ backgroundPosition: '0px -{int(DUR * 14)}px', duration: {DUR}, ease: 'none' }}, 0);")
js(f"tl.fromTo('#ink', {{ backgroundPosition: '0px 0px' }}, {{ backgroundPosition: '0px {int(DUR * 18)}px', duration: {DUR}, ease: 'none', immediateRender: false }}, 0);")


CSS = """
@font-face { font-family: "Libre Franklin"; src: url("assets/fonts/LibreFranklin-VF.ttf") format("truetype"); font-weight: 100 900; }
@font-face { font-family: "Archivo"; src: url("assets/fonts/Archivo-var.ttf") format("truetype"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: "Poppins"; src: url("assets/fonts/Poppins-Regular.ttf") format("truetype"); font-weight: 400; }
@font-face { font-family: "Poppins"; src: url("assets/fonts/Poppins-SemiBold.ttf") format("truetype"); font-weight: 600; }
html, body { margin: 0; background: #1e4e6e; }
#root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #1e4e6e; font-family: "Poppins", sans-serif; color: #0f0f0f; }
.L, .c { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; pointer-events: none; }
/* the board: harbor blue with a faint white dot grid, so it reads as a surface, not a flat fill; yellow is only an accent */
#board { background-color: #1e4e6e; background-image: radial-gradient(rgba(255, 255, 255, 0.075) 2.6px, transparent 3px); background-size: 40px 40px; }
/* the kinetic panel: navy with a faint light grid, parked below the frame until a kinetic beat */
#ink { background-color: #0b1b27; background-image: radial-gradient(rgba(255, 255, 255, 0.085) 2.6px, transparent 3px); background-size: 40px 40px; }
#shade { background: #0f0f0f; opacity: 0; }
.zone { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; }
.zone > * + * { margin-top: 30px; }
.zone.free { display: block; }
.zone.free > * + * { margin-top: 0; }
.wm { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.07em; margin-bottom: -0.07em; }
.wi, .wq, .cw { display: inline-block; }
.hd { font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.03em; line-height: 0.92; color: #ffffff; transform-origin: 50% 60%; }
.hd.sm { line-height: 0.96; }
.card .hd { color: #0f0f0f; }
.acard .hd, .hd.w { color: #ffffff; }
.kw { display: inline-block; background: #ffffff; color: #0f0f0f; padding: 0.05em 0.14em 0.02em; border-radius: 0.11em; box-shadow: 0.06em 0.06em 0 #0f0f0f; }
.kw .wi { display: inline; }
.chip, .st { display: inline-block; width: fit-content; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; line-height: 1; letter-spacing: 0.01em; border-radius: 12px; }
.chip { font-size: 38px; padding: 15px 22px 13px; }
.chip.ink { background: #0f0f0f; color: #ffffff; }
.chip.blue { background: #38b6ff; color: #0f0f0f; box-shadow: 7px 7px 0 #0f0f0f; }
.chip.yellow { background: #ffc530; color: #0f0f0f; }
.st { font-size: 44px; padding: 20px 26px 18px; box-shadow: 10px 10px 0 #0f0f0f; box-sizing: border-box; }
.st.white { background: #ffffff; color: #0f0f0f; }
.card { position: absolute; box-sizing: border-box; background: #ffffff; border: 7px solid #0f0f0f; border-radius: 26px; box-shadow: 18px 18px 0 #0f0f0f; }
/* number */
.bnum { font-family: "Libre Franklin", sans-serif; font-weight: 900; line-height: 0.88; letter-spacing: -0.045em; color: #ffc530; -webkit-text-stroke: 0.035em #0f0f0f; paint-order: stroke fill;
  text-shadow: 0.05em 0.05em 0 #0f0f0f; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lab { line-height: 1.02; }
/* list */
.lcard { position: relative; width: 920px; padding: 34px 40px 30px; }
.lrows { margin-top: 24px; }
.lrow { display: flex; align-items: center; gap: 28px; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; line-height: 1; }
.lrow + .lrow { margin-top: 16px; }
.lb { flex: none; width: 84px; height: 84px; border-radius: 18px; background: #0f0f0f; color: #ffffff; display: flex; align-items: center; justify-content: center;
  font-size: 50px; font-weight: 900; border: 5px solid #0f0f0f; box-sizing: border-box; }
.lrow span { line-height: 1.0; }
/* before / after */
.bcard, .acard { left: 90px; width: 900px; padding: 30px 40px 40px; }
.bcard .hd, .acard .hd { margin-top: 22px; }
.acard { background: #0f0f0f; box-shadow: 18px 18px 0 #ffffff; }
/* quote */
.qcard { left: 70px; width: 940px; padding: 120px 60px 60px; }
.qm { position: absolute; left: 40px; top: -150px; font-family: "Libre Franklin", sans-serif; font-weight: 900; font-size: 340px; line-height: 1; color: #38b6ff; -webkit-text-stroke: 12px #0f0f0f; paint-order: stroke fill; }
.qt { font-weight: 600; line-height: 1.24; letter-spacing: -0.01em; }
.qwho { position: absolute; right: 90px; }
/* the card beat */
.mcard { padding: 60px 50px; display: flex; flex-direction: column; justify-content: center; }
.mcard .hd { margin-top: 18px; }
.mcard .chip + .hd { margin-top: 26px; }
/* caption sentence */
.cap { position: absolute; left: 60px; width: 960px; text-align: center; }
.cbox { display: inline-block; background: #0f0f0f; color: #ffffff; font-family: "Archivo", sans-serif; font-weight: 800; line-height: 1.12; padding: 20px 32px 24px; border-radius: 18px; text-align: center; }
.cbox.inv { background: #ffffff; color: #0f0f0f; }
.cw { margin: 0 0.06em; transform-origin: 50% 80%; }
.cw.k { color: #0f0f0f; background: #ffffff; border-radius: 8px; padding: 0 0.12em; }
.cbox.inv .cw.k { color: #ffffff; background: #1e4e6e; border-radius: 8px; padding: 0 0.12em; }
/* kinetic layers */
.kz > * + * { margin-top: 44px; }
.kpart { display: block; }
.kt { font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.03em; line-height: 0.95; color: #ffffff; }
.mk { position: relative; display: inline-block; opacity: 0; }
.hl { position: absolute; left: -0.1em; right: -0.1em; top: 0.08em; bottom: -0.02em; background: #ffc530; border-radius: 0.08em; transform-origin: 0 50%; rotate: -1.5deg; }
.mt { position: relative; color: #ffffff; }
.ko { display: inline-block; font-family: "Libre Franklin", sans-serif; font-weight: 900; line-height: 0.85; letter-spacing: -0.04em; color: transparent; -webkit-text-stroke: 0.022em #ffc530; white-space: nowrap; }
.ks { display: inline-block; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; line-height: 1.02; padding: 20px 26px 17px; border-radius: 14px; }
.ks.y { background: #38b6ff; color: #0f0f0f; box-shadow: 10px 10px 0 #ffffff; }
.ks.w { background: #ffffff; color: #0f0f0f; box-shadow: 10px 10px 0 #38b6ff; }
/* the cover: cover-builder type on the board */
#coverp { background-color: #1e4e6e; background-image: radial-gradient(rgba(255, 255, 255, 0.075) 2.6px, transparent 3px); background-size: 40px 40px; box-shadow: 0 30px 70px rgba(15, 15, 15, 0.35); }
.cv { position: absolute; left: 120px; width: 860px; font-family: "Archivo", sans-serif; font-weight: 800; font-stretch: 87.5%; font-variation-settings: "wght" 800, "wdth" 87.5;
  letter-spacing: -0.01em; color: #ffffff; white-space: nowrap; }
.cv .acc { background: #38b6ff; color: #000000; padding: 0 0.17em; margin: 0 -0.05em; }
/* end card */
.ecard { left: 90px; width: 900px; padding: 70px 56px 60px; text-align: left; }
.en { font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase; letter-spacing: -0.03em; line-height: 0.95; }
.ep { margin-top: 20px; font-weight: 600; line-height: 1.25; color: #222222; }
.ecta { margin-top: 34px; display: inline-block; background: #ffc530; color: #0f0f0f; font-family: "Libre Franklin", sans-serif; font-weight: 900; text-transform: uppercase;
  line-height: 1.05; padding: 20px 26px 17px; border-radius: 12px; box-shadow: 9px 9px 0 #0f0f0f; }
.eurl { margin-top: 30px; font-weight: 600; color: #0f0f0f; }
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
<div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="{W}" data-height="{H}">
<div id="board" class="L"></div>
<div id="ink" class="L"></div>
<div id="shade" class="L"></div>
<div id="ui" class="L">
{chr(10).join(UI)}
</div>
{chr(10).join(AUDIO)}
</div>
<script>
(function () {{
  gsap.set('#ink', {{ yPercent: 100 }});
  const tl = gsap.timeline({{ paused: true }});
  tl.set('#ink', {{ yPercent: 100 }}, 0);
  {(chr(10) + '  ').join(JS)}
  tl.set({{}}, {{}}, {DUR});
  window.__timelines = window.__timelines || {{}};
  window.__timelines["main"] = tl;
}})();
</script>
</body>
</html>
"""
(COMP / "index.html").write_text(recolor(doc, ST["palette"]))


# ---- what's on screen, for the editor's note and the coach's review (the app reads hook, graphics, end) -------------
def shown(b):
    L = b["layout"]
    if L == "number":
        g = {"kind": "stat", "value": b["value"], "label": b.get("label") or "", "title": b.get("title") or ""}
    elif L == "list":
        g = {"kind": "list", "title": b.get("title") or "", "rows": [{"text": r} for r in b["rows"]]}
    elif L == "before_after":
        g = {"kind": "before_after", "title": "", "rows": [{"text": f'{b.get("title") or "Before"}: {b["before"]}'}, {"text": f'{b.get("label") or "After"}: {b["after"]}'}]}
    elif L == "quote":
        g = {"kind": "quote", "title": "Quote sticker", "rows": [{"text": b["text"]}] + ([{"text": f'credited to {b["label"]}'}] if b.get("label") else [])}
    else:
        g = {"kind": L, "title": {"statement": "", "card": "Card", "kinetic": "Kinetic stickers"}.get(L, ""),
             "rows": [{"text": x} for x in [b.get("value"), b.get("text"), *(b.get("rows") or [])] if x]}
    if b.get("line"):
        g.setdefault("rows", []).append({"text": f'caption: {b["line"]}'})
    g["at"] = round(b["t0"], 2)
    g["until"] = round(b["t1"], 2)
    return g


out = {**plan, "animated": True, "beats": [{k: v for k, v in b.items() if k != "lead"} for b in beats],
       "hook": {"text": beats[0].get("text") or ""}, "cover": hook, "graphics": [shown(b) for b in beats],
       "end": {"name": name, "line": END.get("line") or "", "cta": END.get("cta") or "", "url": END.get("url") or ""},
       "duration": DUR}
json.dump(out, open("work/plan_out.json", "w"), indent=1)
sheet = [0.2] + sorted(SETTLED)
while len(sheet) > 14:
    sheet.pop(len(sheet) // 2)
open("work/sheet_times.txt", "w").write(" ".join(str(round(t_ * FPS)) for t_ in sheet))
looks = {}
for b in beats:
    looks[b["layout"]] = looks.get(b["layout"], 0) + 1
print(f"reel: {DUR:.1f} s, {len(beats)} beats ({', '.join(b['layout'] for b in beats)}), "
      f"{len(AUDIO)} sounds, cover {'on' if hook else 'off'}", flush=True)
