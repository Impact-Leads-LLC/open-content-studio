#!/usr/bin/env python3
"""The finished episode (episode engine), in two passes.

1. The edit with everything on it: the camera edit (work/base.mp4) with its punch-ins and the animated moments laid
   back in (work/segments.mp4, timed by work/segments.json) -> work/body.mp4. One pass over the whole edit, so every
   part of the teaser that shows a moment (the host's introduction with the guest's card) has it.
2. The finished order (work/timeline.json): the teaser's bites, the host's introduction, the ad read (work/ad.mp4, if the
   show has one), then the episode from just after the introduction; captions burned in, the sound with a soft whoosh
   at each join and under each chapter card. Also the YouTube chapters and a frame sheet of the animated moments.

Out: work/episode.mp4, work/chapters.txt, work/sheet.jpg. Prints "cold open: X s" (how far the episode's own start
moved, so the app's trim player can line the video up with the recording).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from edit import ZOOM_CHAIN, zoom_expr  # noqa: E402

ROOT = Path(__file__).parent
FPS = 30
edit = json.load(open("work/edit.json"))
plan = json.load(open("work/plan.json"))
segs = json.load(open("work/segments.json")) if os.path.exists("work/segments.json") else []
tl = json.load(open("work/timeline.json"))
DUR = edit["dur"]
PARTS, OFF, BS = tl["parts"], tl["offset"], tl.get("body_start", 0.0)
have_segs = bool(segs) and os.path.exists("work/segments.mp4") and os.path.getsize("work/segments.mp4") > 0
PUNCH = 0.08      # a gentle push in on the line that lands (quick zooms look too sharp)
EASE = 0.5        # seconds in and out, eased
ENC = ["-c:v", "libx264", "-preset", "veryfast", "-g", "60", "-movflags", "+faststart"]


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"{cmd[0]} failed: {r.stderr.strip()[-600:]}")
    return r


def clock(t):
    t = int(round(t))
    return f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}" if t >= 3600 else f"{t // 60}:{t % 60:02d}"


# ---- pass 1: the edit with its punch-ins and animated moments --------------------------------------------------------
punches = []
for p in plan.get("punches") or []:
    a, b = p["at"], p["until"]
    if b - a >= 0.5:
        e = min(EASE, (b - a) / 3)
        punches += [(round(a, 3), round(a + e, 3), 1.0, 1.0 + PUNCH), (round(a + e, 3), round(b - e, 3), 1.0 + PUNCH, 1.0 + PUNCH),
                    (round(b - e, 3), round(b, 3), 1.0 + PUNCH, 1.0)]
zoom = ZOOM_CHAIN.format(z=zoom_expr(punches)) if punches else "format=yuv420p"
args = ["-i", "work/base.mp4"]
graph = [f"[0:v]{zoom}[bz]"]
if have_segs:
    args += ["-i", "work/segments.mp4"]
    expr = f"{segs[-1]['a']}+(T-{segs[-1]['o']})"
    for s, nxt in zip(reversed(segs[:-1]), reversed(segs[1:])):
        expr = f"if(lt(T,{nxt['o']}),{s['a']}+(T-{s['o']}),{expr})"
    enable = "+".join(f"between(t,{s['a']:.4f},{s['b'] - 0.5 / FPS:.4f})" for s in segs)
    graph += [f"[1:v]setpts='({expr})/TB'[sg]", f"[bz][sg]overlay=eof_action=pass:enable='{enable}',format=yuv420p[v]"]
else:
    graph += ["[bz]null[v]"]
sh(["ffmpeg", "-v", "error", "-y"] + args + ["-filter_complex", ";".join(graph), "-map", "[v]", "-an", "-t", f"{DUR:.3f}", "-crf", "17"] + ENC + ["work/body.mp4"])

# ---- pass 2: the finished order, captions, sound ---------------------------------------------------------------------
args, graph, n = [], [], 0
vs, as_ = [], []
for k, p in enumerate(PARTS):
    L = p["b"] - p["a"]
    if p["kind"] == "ad":
        args += ["-t", f"{L:.4f}", "-i", "work/ad.mp4"]
        graph.append(f"[{n}:v]fps={FPS},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b1b27,setsar=1,setpts=PTS-STARTPTS,format=yuv420p[v{k}]")
        graph.append(f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-14:TP=-1:LRA=11,aresample=48000,asetpts=PTS-STARTPTS[a{k}]")
        n += 1
    else:
        args += ["-ss", f"{p['a']:.4f}", "-t", f"{L:.4f}", "-i", "work/body.mp4", "-ss", f"{p['a']:.4f}", "-t", f"{L:.4f}", "-i", "work/audio.wav"]
        graph.append(f"[{n}:v]fps={FPS},setpts=PTS-STARTPTS,trim=end_frame={round(L * FPS)},format=yuv420p[v{k}]")
        graph.append(f"[{n + 1}:a]asetpts=PTS-STARTPTS,atrim=end={L:.4f}[a{k}]")
        n += 2
    vs.append(f"[v{k}]")
    as_.append(f"[a{k}]")
graph.append("".join(f"{v}{a}" for v, a in zip(vs, as_)) + f"concat=n={len(PARTS)}:v=1:a=1[cv][ca]")
fonts = str(ROOT / "assets/fonts")
graph.append(f"[cv]subtitles=filename=work/captions.ass:fontsdir='{fonts}',format=yuv420p[v]")

# a soft whoosh at each join of the opening and under each chapter card
hits = [p["at"] - 0.3 for p in PARTS[1:]]
hits += [OFF + (s["a"] - BS) for s in segs if s["kind"] == "chapter" and s["a"] >= BS]
sfx = ROOT / "assets/sfx/whoosh-short.mp3"
hits = [h for h in hits if h > 0]
if hits and sfx.exists():
    for k, t in enumerate(hits):
        args += ["-i", str(sfx)]
        ms = int(t * 1000)
        graph.append(f"[{n}:a]volume=0.22,adelay={ms}|{ms},aformat=channel_layouts=stereo:sample_rates=48000[w{k}]")
        n += 1
    graph.append("[ca]" + "".join(f"[w{k}]" for k in range(len(hits))) + f"amix=inputs={len(hits) + 1}:normalize=0:duration=first,alimiter=limit=0.89:level=false[a]")
else:
    graph.append("[ca]anull[a]")
total = sum(p["b"] - p["a"] for p in PARTS)
open("work/final-graph.txt", "w").write(";\n".join(graph))
sh(["ffmpeg", "-v", "error", "-y"] + args + ["-filter_complex", ";".join(graph), "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}",
    "-crf", "21", "-maxrate", "8M", "-bufsize", "16M"] + ENC + ["-c:a", "aac", "-b:a", "192k", "work/episode.mp4"])

# YouTube chapters: the first at 0:00 (the teaser belongs to it), each at least 10 seconds long
lines = []
for k, c in enumerate(plan.get("chapters") or []):
    t = 0.0 if k == 0 else OFF + (c["at"] - BS)
    if lines and t - lines[-1][0] < 10:
        continue
    lines.append((t, c["title"]))
open("work/chapters.txt", "w").write("\n".join(f"{clock(t)} {title}" for t, title in lines) + ("\n" if lines else ""))

# a frame sheet of the animated moments, for the team and the coach's review
pick = []
for s in segs:
    t = s["a"] + min(s["b"] - s["a"] - 0.5, max(1.5, (s["b"] - s["a"]) * 0.62))
    part = next((p for p in PARTS if p["kind"] != "ad" and p["a"] <= t < p["b"]), None)
    if part:
        pick.append(part["at"] + (t - part["a"]))
pick = sorted(pick)[:12]
if pick:
    sel = "+".join(f"eq(n\\,{round(t * FPS)})" for t in pick)
    cols = 4
    rows = (len(pick) + cols - 1) // cols
    sh(["ffmpeg", "-v", "error", "-y", "-i", "work/episode.mp4", "-vf", f"select='{sel}',scale=480:-2,tile={cols}x{rows}", "-frames:v", "1", "-q:v", "3", "work/sheet.jpg"])

# the trim player lines the video up with the recording from how far the episode's own start moved
print(f"cold open: {OFF - BS:.3f} s", flush=True)
size = os.path.getsize("work/episode.mp4") / 1048576
length = float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "work/episode.mp4"]).stdout)
kinds = [p["kind"] for p in PARTS]
print(f"episode: {clock(length)} long, {size:.0f} MB (teaser {clock(OFF)}: {kinds.count('bite')} bite(s){', intro' if 'intro' in kinds else ''}{', ad read' if 'ad' in kinds or 'read' in kinds else ''}; "
      f"{len(segs)} animated moments, {len(plan.get('punches') or [])} punch-ins, {len(lines)} chapters)", flush=True)
