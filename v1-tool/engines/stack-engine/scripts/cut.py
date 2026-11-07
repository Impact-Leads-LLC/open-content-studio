#!/usr/bin/env python3
"""Assemble the kept segments into work/cut-raw.mp4 and remap the word timings.
Run from the project folder after transcribe_chunks.py and writing cutlist.json.

Frame-exact: every segment is snapped to the 30 fps grid so the picture, the matte and the
remapped captions share one clock. Audio gets 12 ms fades at each join so cuts never click.

cutlist.json: {"source": "assets/source.mp4", "fps": 30,
               "segments": [{"id": "hook", "in": 1.64, "out": 4.28, "text": "..."}, ...]}
In/out are source seconds. Put boundaries in the pauses from work/transcript.txt.
"""
import json
import os
import subprocess

cfg = json.load(open("cutlist.json"))
FPS = cfg.get("fps", 30)
snap = lambda t: round(t * FPS) / FPS

segs, t = [], 0.0
for s in cfg["segments"]:
    a, b = snap(s["in"]), snap(s["out"])
    assert b > a, f"segment {s['id']}: out must be after in"
    segs.append({**s, "in": a, "out": b, "start": round(t, 4), "dur": round(b - a, 4)})
    t += b - a
total = round(t, 4)

parts, labels = [], []
for i, s in enumerate(segs):
    fo = max(0, s["dur"] - 0.012)
    parts.append(f"[0:v]trim=start={s['in']}:end={s['out']},setpts=PTS-STARTPTS[v{i}]")
    parts.append(f"[0:a]atrim=start={s['in']}:end={s['out']},asetpts=PTS-STARTPTS,"
                 f"afade=t=in:d=0.012,afade=t=out:st={fo:.3f}:d=0.012[a{i}]")
    labels.append(f"[v{i}][a{i}]")
parts.append(f"{''.join(labels)}concat=n={len(segs)}:v=1:a=1[v][a]")
os.makedirs("work", exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", cfg["source"], "-filter_complex", ";".join(parts),
                "-map", "[v]", "-map", "[a]", "-r", str(FPS), "-c:v", "libx264", "-crf", "12", "-preset", "medium",
                "-g", str(FPS), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "work/cut-raw.mp4"], check=True)

# remap the chunked words onto the new timeline (words outside kept ranges drop)
words = json.load(open("work/words_chunked.json"))["words"]
out = []
for w in words:
    mid = (w["start"] + w["end"]) / 2
    for s in segs:
        if s["in"] - 0.02 <= mid <= s["out"] + 0.02:
            off = s["start"] - s["in"]
            out.append({"text": w["text"], "start": round(max(s["start"], w["start"] + off), 3),
                        "end": round(min(s["start"] + s["dur"], w["end"] + off), 3), "seg": s["id"]})
            break
json.dump({"total": total, "segments": segs, "words": out}, open("work/cut.json", "w"), indent=1)
n = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                    "stream=nb_read_frames", "-of", "csv=p=0", "work/cut-raw.mp4"], capture_output=True, text=True).stdout.strip()
print(f"cut: {total:.2f} s, {n} frames")
for s in segs:
    print(f"  {s['id']:8} src {s['in']:7.3f}-{s['out']:7.3f}  timeline {s['start']:7.3f} (+{s['dur']:.3f})")
