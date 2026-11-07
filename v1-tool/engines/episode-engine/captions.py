#!/usr/bin/env python3
"""Captions for the full episode (episode engine): burned in, word by word as each is said, white Poppins with a dark
edge, low in the frame. The plan's key words pop into a tilted white box with an ink shadow (The Board's look, with
the accent colour kept as an accent; one in four gets the slanted Kinetic version), at most one per line; numbers turn
to the palette's accent colour (yellow by default). During a board
moment the captions ride under the speaker's window (segments.json "cap"). Off while the title card and the end card
are up. Also the .srt for YouTube and the podcast.

In: work/words.json (recording clock), work/edit.json, work/plan.json, work/segments.json.
Out: work/captions.ass, work/captions.srt, work/timeline.json: the finished episode's parts in order (the teaser's
bites, the host's introduction of the guest, the ad read, then the episode from just after that introduction), each with
its stretch of the edit and where it starts in the finished video.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from studio import hex_rgb, load_context, studio  # noqa: E402

edit = json.load(open("work/edit.json"))
plan = json.load(open("work/plan.json"))
segs = json.load(open("work/segments.json"))
START, DUR = edit["start"], edit["dur"]
raw = json.load(open("work/words.json"))
raw = raw if isinstance(raw, list) else raw.get("words", [])
words = sorted(({"who": w.get("who", ""), "text": str(w["text"]).strip(), "a": float(w["start"]) - START, "b": float(w["end"]) - START}
                for w in raw if str(w.get("text", "")).strip()), key=lambda w: w["a"])
words = [w for w in words if 0 <= w["a"] < DUR]
norm = lambda s: re.sub(r"[^a-z0-9%$]+", "", s.lower())

# the plan's fixes for words the speech-to-text got wrong
for f in plan.get("fixes") or []:
    src = [norm(x) for x in f["from"].split() if norm(x)]
    if not src:
        continue
    near = [i for i, w in enumerate(words) if abs(w["a"] - f["at"]) < 6]
    for i in near:
        if [norm(w["text"]) for w in words[i:i + len(src)]] == src:
            tail = re.search(r"[.,?!;:]+$", words[i + len(src) - 1]["text"])
            words[i]["text"] = f["to"] + (tail.group(0) if tail and not re.search(r"[.,?!;:]$", f["to"]) else "")
            for w in words[i + 1:i + len(src)]:
                w["text"] = ""
            break
words = [w for w in words if w["text"]]

# key words and phrases get the white box; every number turns to the accent colour
keys = [[norm(x) for x in k.split() if norm(x)] for k in plan.get("keys") or []]
keys = [k for k in keys if k]
for w in words:
    w["n"] = bool(re.search(r"\d", w["text"]))
    w["k"] = False
for i in range(len(words)):
    for k in keys:
        if [norm(w["text"]) for w in words[i:i + len(k)]] == k:
            for w in words[i:i + len(k)]:
                w["k"] = True

# phrases: a new one at a change of speaker, a pause, the end of a sentence, or about seven words
phrases = []
for w in words:
    p = phrases[-1] if phrases else None
    if (p and p[-1]["who"] == w["who"] and w["a"] - p[-1]["b"] < 0.7 and len(p) < 7 and sum(len(x["text"]) + 1 for x in p) + len(w["text"]) <= 38
            and not (re.search(r"[.?!]$", p[-1]["text"]) and len(p) >= 3)):
        p.append(w)
    else:
        phrases.append([w])

# the finished episode, part by part: (kind, from, to on the edit's clock); the ad read is its own file
import os
fr = lambda t: round(t * 30) / 30
tz = plan.get("teaser") or {}
BS = float(plan.get("body_start") or 0.0)
parts = [("bite", fr(b["in"]), fr(b["out"])) for b in tz.get("bites") or []]
if tz.get("intro"):
    parts.append(("intro", fr(tz["intro"]["in"]), fr(tz["intro"]["out"])))
if tz.get("ad"):          # an ad read the host records in the intro, after the guest's intro
    parts.append(("read", fr(tz["ad"]["in"]), fr(tz["ad"]["out"])))
elif os.path.exists("work/ad.mp4"):
    import subprocess
    ad_len = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "work/ad.mp4"], capture_output=True, text=True).stdout or 0)
    if ad_len > 1:
        parts.append(("ad", 0.0, fr(min(ad_len, 90))))
parts.append(("body", fr(BS), fr(DUR)))
at = 0.0
timeline = []
for kind, a, b in parts:
    timeline.append({"kind": kind, "a": a, "b": b, "at": round(at, 4)})
    at += b - a
OFF = next(p["at"] for p in timeline if p["kind"] == "body")
quiet = [(s["a"], s["b"]) for s in segs if s["kind"] in ("title", "end")]


def hidden(t):
    return any(a - 0.2 <= t <= b for a, b in quiet)


def ts(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def srt_ts(t):
    t = max(0.0, t)
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"


def esc(s):
    return s.replace("\\", "\\\\").replace("{", "(").replace("}", ")")


# ASS colours are &HAABBGGRR: the accent from the studio's palette (yellow #FFC530 by default)
_r, _g, _b = hex_rgb(studio(load_context())["palette"]["accent"])
WHITE, YEL = "&H00FFFFFF&", f"&H00{_b:02X}{_g:02X}{_r:02X}&"
events, srt = [], []
CAPS = [(sg["a"] + 0.6, sg["b"] - 0.6, sg["cap"]) for sg in segs if sg.get("cap")]
# while a pop's sticker hovers, its words are already on screen: no box in the captions then
POPS = [(sg["a"] - 0.5, sg["b"] + 0.5) for sg in segs if sg["kind"] == "pop"]
chip_n = 0


def where(t):
    """A board moment's caption spot (x, y, alignment, size) at t on the body clock, or None for the usual place."""
    return next((c for a, b, c in CAPS if a <= t < b), None)


def emit(ph, shift, lo, hi, nxt):
    """One phrase as word-by-word events, on the final clock (shift), kept inside [lo, hi) of the body clock and off
    the screen before the next phrase starts (nxt), so two never overlap."""
    global chip_n
    ph = [w for w in ph if lo <= w["a"] < hi]
    if not ph or hidden(ph[0]["a"]):
        return
    end = min(ph[-1]["b"] + 0.35, hi, nxt)
    spot = where(ph[0]["a"])
    small = "S" if spot else ""
    pos = f"{{\\an{spot[2]}\\pos({spot[0]},{spot[1]})}}" if spot else ""
    # one box per line at most: the first key word (or run of key words)
    box = None if any(a <= ph[0]["a"] <= b or a <= ph[-1]["a"] <= b for a, b in POPS) else next((i for i, w in enumerate(ph) if w["k"]), None)
    run = set()
    if box is not None:
        j = box
        while j < len(ph) and ph[j]["k"] and j - box < 2:
            run.add(j)
            j += 1
        chip_n += 1
    style = "Hi" if chip_n % 4 == 0 else "Key"
    tilt = [-3, 2, -2, 3][chip_n % 4]
    for i, w in enumerate(ph):
        a = w["a"]
        b = ph[i + 1]["a"] if i + 1 < len(ph) else end
        if b - a < 0.02:
            continue
        txt = []
        for j, x in enumerate(ph):
            said = j <= i
            alpha = "&H00&" if said else "&HFF&"
            word = esc(x["text"])
            if j in run:
                core, tail = re.match(r"^(.*?)([.,?!;:]*)$", word).groups()
                pop = "\\fscx140\\fscy140\\t(0,120,\\fscx100\\fscy100)" if j == i else ""
                slant = "\\fax-0.14" if style == "Hi" else ""
                lead = "\\h" if j == min(run) and j > 0 else ""
                trail = "\\h" if j == max(run) and j < len(ph) - 1 else ""
                close = f"{{\\r{'Cap' + small}\\alpha{alpha}}}{tail}{trail}" if j == max(run) else tail
                txt.append(f"{{\\r{style}{small}\\alpha{alpha}\\frz{tilt}{slant}{pop}}}{lead}{core.upper()}{close}")
            else:
                col = YEL if x["n"] else WHITE
                pop = "\\fscx84\\fscy84\\t(0,90,\\fscx100\\fscy100)" if j == i else ""
                txt.append(f"{{\\r{'Cap' + small}\\alpha{alpha}\\1c{col}{pop}}}{word}")
        events.append(f"Dialogue: 0,{ts(a + shift)},{ts(b + shift)},Cap{small},,0,0,0,,{pos}{' '.join(txt)}")
    srt.append((ph[0]["a"] + shift, end + shift, " ".join(x["text"] for x in ph)))


nexts = [phrases[k + 1][0]["a"] if k + 1 < len(phrases) else 1e9 for k in range(len(phrases))]
for p in timeline:
    if p["kind"] == "ad":
        continue
    for ph, nx in zip(phrases, nexts):
        emit(ph, p["at"] - p["a"], p["a"], p["b"], nx)

head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Poppins SemiBold,90,&H00FFFFFF,&H00FFFFFF,&H00141414,&H96000000,0,0,0,0,100,100,0,0,1,4.4,2.6,2,240,240,54,1
Style: Key,Libre Franklin Black,100,&H000F0F0F,&H000F0F0F,&H00FFFFFF,&H000F0F0F,0,0,0,0,100,100,0,0,3,12,8,2,240,240,54,1
Style: Hi,Libre Franklin Black,100,&H000F0F0F,&H000F0F0F,&H00FFFFFF,&H000F0F0F,0,0,0,0,100,100,0,0,3,10,0,2,240,240,54,1
Style: CapS,Poppins SemiBold,66,&H00FFFFFF,&H00FFFFFF,&H00141414,&H96000000,0,0,0,0,100,100,0,0,1,3.4,2,2,60,60,54,1
Style: KeyS,Libre Franklin Black,72,&H000F0F0F,&H000F0F0F,&H00FFFFFF,&H000F0F0F,0,0,0,0,100,100,0,0,3,8,5,2,60,60,54,1
Style: HiS,Libre Franklin Black,72,&H000F0F0F,&H000F0F0F,&H00FFFFFF,&H000F0F0F,0,0,0,0,100,100,0,0,3,7,0,2,60,60,54,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
open("work/captions.ass", "w").write(head + "\n".join(events) + "\n")
srt.sort()
open("work/captions.srt", "w").write("".join(f"{i + 1}\n{srt_ts(a)} --> {srt_ts(b)}\n{t}\n\n" for i, (a, b, t) in enumerate(srt)))
json.dump({"offset": OFF, "body_start": BS, "parts": timeline}, open("work/timeline.json", "w"))
print(f"captions: {len(srt)} lines, {chip_n} key-word boxes, {sum(1 for w in words if w['n'])} accent numbers", flush=True)
