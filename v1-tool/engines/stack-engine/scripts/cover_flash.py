#!/usr/bin/env python3
"""The reel opens on its cover for about half a second, then flips into the content, so the feed shows a proper cover
without a separate upload. The cover type: the hook in Archivo 800 at width 87.5, -0.01em, cap 96 (139.64 px,
pitch 160) up to 3 lines, else cap 80 (116.37 px, pitch 133) up to 4, each line's ink <= 840 px, inside the 3:4 window
(x 120-960, y 240-1680), over a bottom fade; one accent, a bar in the studio's accent colour (context.json
studio.palette.accent) with dark or white type, whichever reads, on the hook's number when it has one.

The photo is the reel's own first frame (the speaker, before any box comes in). The hook is the piece's planned hook,
else the reel's opening bar, else the title.

Run from stack-engine/reel after the render: python3 ../scripts/cover_flash.py
In: renders/reel.mp4, plan.json, context.json. Out: renders/reel-cover.mp4 (cover 0.45 s + a 0.15 s slide into the
reel, the sound delayed to match), cover.jpg (the cover itself, 1080x1920).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from studio import hex_rgb, studio  # noqa: E402

ROOT = Path.cwd()
FONT = Path(__file__).resolve().parent.parent / "reel/assets/fonts/Archivo-var.ttf"
W, H = 1080, 1920
HOLD, XF = 0.45, 0.15


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"{cmd[0]} failed: {r.stderr.strip()[-400:]}")
    return r.stdout


plan = json.loads((ROOT / "plan.json").read_text()) if (ROOT / "plan.json").exists() else {}
ctx = json.loads((ROOT / "context.json").read_text()) if (ROOT / "context.json").exists() else {}
piece = ctx.get("piece") or {}
ACCENT = hex_rgb(studio(ctx)["palette"]["accent"])
# dark type on a light accent, white type on a dark one
ON_ACCENT = (0, 0, 0) if (0.299 * ACCENT[0] + 0.587 * ACCENT[1] + 0.114 * ACCENT[2]) > 140 else (255, 255, 255)
# the cover line: the planned hook (never cut, so only when it fits), else the reel's opening bar, else the title
HOOKS = [re.sub(r"\s*[—–]\s*", ", ", str(h)).strip() for h in (piece.get("hook"), (plan.get("hook") or {}).get("text"), piece.get("title")) if h]
if not HOOKS:
    raise SystemExit("no hook for the cover")


def font(px):
    f = ImageFont.truetype(str(FONT), round(px))
    try:
        vals = []
        for ax in f.get_variation_axes():
            n = ax.get("name", "")
            n = (n.decode() if isinstance(n, bytes) else str(n)).lower()
            vals.append(800 if "weight" in n else 87.5 if "width" in n else ax.get("default", 0))
        f.set_variation_by_axes(vals)
    except Exception as e:
        print(f"cover: font axes not set ({e})", file=sys.stderr)
    return f


def width(f, s, track):
    return f.getlength(s) + track * max(0, len(s) - 1)


def wrap(f, words, track, cap=840):
    lines, cur = [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if cur and width(f, t, track) > cap:
            lines.append(cur)
            cur = w
        else:
            cur = t
    if cur:
        lines.append(cur)
    return lines


def layout(hook):
    for px, pitch, most in ((139.64, 160, 3), (116.37, 133, 4)):
        f = font(px)
        track = -0.01 * px
        lines = wrap(f, hook.split(), track)
        if len(lines) <= most and all(width(f, l, track) <= 840 for l in lines):
            return px, pitch, f, track, lines
    return None


got = next(((h, layout(h)) for h in HOOKS if layout(h)), None)
if not got:
    raise SystemExit("every hook is too long for a cover")
hook, (px, pitch, f, track, lines) = got

# the photo: the reel's first frame
sh(["ffmpeg", "-v", "error", "-y", "-ss", "0.03", "-i", "renders/reel.mp4", "-frames:v", "1", "work/cover-photo.png"])
img = Image.open("work/cover-photo.png").convert("RGB").resize((W, H))
last_base = 1650          # as low as the 3:4 window allows (y 1680), clear of the face
first_base = last_base - pitch * (len(lines) - 1)
cap_h = px * 0.69
# the fade: dark from the band above the hook to the bottom
top = int(first_base - cap_h - 48 - 240)
fade = Image.new("L", (1, H), 0)
for y in range(H):
    a = 0 if y < top else min(1.0, (y - top) / 240)
    fade.putpixel((0, y), int(205 * a ** 1.2))
shade = Image.new("RGB", (W, H), (0, 0, 0))
img = Image.composite(shade, img, fade.resize((W, H)))
d = ImageDraw.Draw(img)

# one accent: the hook's number (with the word after it when that word is short)
acc = None
for i, l in enumerate(lines):
    m = re.search(r"\$?\d[\d,.]*[%kKmM+]?(?:\s[A-Za-z]{1,9}\b)?", l)
    if m:
        acc = (i, m.start(), m.end())
        break


def draw_line(y_base, text, i):
    x = 120
    if acc and acc[0] == i:
        pre, mid, post = text[:acc[1]], text[acc[1]:acc[2]], text[acc[2]:]
        segs = [(pre, False), (mid, True), (post, False)]
    else:
        segs = [(text, False)]
    for s, hot in segs:
        if not s:
            continue
        wv = width(f, s.strip() if hot else s, track)
        if hot:
            lead = len(s) - len(s.lstrip())
            x += width(f, s[:lead], track) if lead else 0
            s = s.strip()
            d.rectangle([x - 24, y_base - cap_h - 24, x + wv + 24, y_base + 40], fill=ACCENT)
        for ch in s:
            d.text((x, y_base), ch, font=f, fill=ON_ACCENT if hot else (255, 255, 255), anchor="ls")
            x += f.getlength(ch) + track
        if hot:
            x += 0


for i, l in enumerate(lines):
    draw_line(first_base + pitch * i, l, i)
img.save("cover.png")
img.save("cover.jpg", quality=95)

dur = float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "renders/reel.mp4"]).strip() or 0)
if dur < 2:
    raise SystemExit("reel too short")
has_a = bool(sh(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", "renders/reel.mp4"]).strip())
ms = int(HOLD * 1000)
graph = (f"[0:v]fps=30,format=yuv420p,setsar=1[c];[1:v]fps=30,scale={W}:{H},setsar=1,format=yuv420p[r];"
         f"[c][r]xfade=transition=slideup:duration={XF}:offset={HOLD}[v]")
maps = ["-map", "[v]"]
if has_a:
    graph += f";[1:a]adelay={ms}|{ms},apad[a]"
    maps += ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"]
sh(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30", "-t", f"{HOLD + XF + 0.05:.2f}", "-i", "cover.png", "-i", "renders/reel.mp4",
    "-filter_complex", graph] + maps + ["-t", f"{dur + HOLD:.3f}", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-movflags", "+faststart",
                                         "renders/reel-cover.mp4"])
print(f"cover: {len(lines)} line(s) at cap {96 if px > 120 else 80}{', accent ' + repr(lines[acc[0]][acc[1]:acc[2]]) if acc else ''}; reel +{HOLD} s")
