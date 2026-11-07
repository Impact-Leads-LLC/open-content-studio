#!/usr/bin/env python3
"""The full episode's camera edit and sound, from separate camera and microphone tracks (episode engine).

The camera follows whoever is talking (worked out from the loudness of each person's own microphone): both people side
by side when they talk over each other, at the open and close, and now and then during a long answer. Single shots
move: a slow push in (or out, every other one) on any single shot of 8 seconds or more. Both voices are levelled to each
other, gently compressed and limited, then set to -14 LUFS for YouTube.

  python3 edit.py analyze   voices, who talks when, the shots, the mixed sound -> work/edit.json, work/audio.wav
  python3 edit.py base      the camera edit with its moves, no sound -> work/base.mp4

Inputs (env): TOP_V/TOP_A (the guest's camera and own audio file, if any), BOT_V/BOT_A (the host's), TOP_NAME, BOT_NAME (default: studio.owner from context.json),
START/END (seconds on the recording's clock; empty = from just before the first word to just after the last).
"""
import json
import os
import subprocess
import sys

E = os.environ
R = 10                       # loudness readings per second
FPS = 30
NAVY = "0x0b1b27"
VOX = "acompressor=threshold=-24dB:ratio=3:attack=5:release=200,alimiter=limit=0.4:level=false"
PUSH_MIN = 8.0               # a single shot this long or longer moves
PUSH = 0.07                  # how far it moves (7%)
os.makedirs("work", exist_ok=True)


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"{cmd[0]} failed: {r.stderr.strip()[-600:]}")
    return r


def has_audio(url):
    return bool(url) and bool(sh(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", url]).stdout.strip())


def length(url):
    return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url]).stdout.strip())


def voice(url, out):
    sh(["ffmpeg", "-v", "error", "-y", "-i", url, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", out])


def levels(wav):
    sh(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", "aresample=16000,asetnsamples=n=1600:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=work/levels.txt", "-f", "null", "-"])
    out = []
    for line in open("work/levels.txt"):
        if line.startswith("lavfi.astats.Overall.RMS_level="):
            try:
                out.append(max(-120.0, float(line.split("=", 1)[1])))
            except ValueError:
                out.append(-120.0)
    return out


def runs(flags):
    out, i = [], 0
    while i < len(flags):
        j = i
        while j < len(flags) and flags[j] == flags[i]:
            j += 1
        out.append((i, j, flags[i]))
        i = j
    return out


def talking(db):
    s = sorted(db)
    floor, loud = s[int(len(s) * 0.15)], s[int(len(s) * 0.95)]
    thr = max(floor + 10, loud - 24, -55)
    on = [x > thr for x in db]
    for a, b, v in runs(on):             # a breath inside a sentence isn't the end of it
        if not v and 0 < a and b < len(on) and b - a <= 6:
            on[a:b] = [True] * (b - a)
    for a, b, v in runs(on):             # a cough or a click isn't talking
        if v and b - a < 4:
            on[a:b] = [False] * (b - a)
    return on, thr


def plan(top, bot, n):
    # who's talking, reading by reading; when both mics are on and one is far louder, the quiet one is only hearing it
    st = []
    for i in range(n):
        a, b = top["on"][i], bot["on"][i]
        if a and b and abs(top["db"][i] - bot["db"][i]) > 18:
            a, b = top["db"][i] > bot["db"][i], bot["db"][i] > top["db"][i]
        st.append("both" if a and b else "top" if a else "bot" if b else None)
    cuts, cur, run_s, run_n = [(0, "both")], "both", None, 0
    for i, s in enumerate(st):
        run_n = run_n + 1 if s == run_s else 1
        run_s = s
        if s is None or s == cur:
            continue
        need = 15 if s == "both" else 20 if cur == "both" else 10
        if run_n < need:
            continue
        at = max(i - run_n + 1 - 2, cuts[-1][0] + (40 if len(cuts) == 1 else 25))
        if at > i:
            continue
        # two quick turns in a row: show both of them instead of ping-ponging
        if s != "both" and cur != "both" and at - cuts[-1][0] < 40:
            s = "both"
        if s != cur:
            cuts.append((at, s))
            cur = s
    # a long answer gets a cut to both now and then, at a pause near every 18 s
    out = []
    for k, (a, s) in enumerate(cuts):
        b = cuts[k + 1][0] if k + 1 < len(cuts) else n
        out.append((a, s))
        if s == "both":
            continue
        who = top if s == "top" else bot
        t = a + 180
        while t + 40 + 60 < b:
            w = min(range(t - 30, t + 30), key=lambda i: who["db"][i])
            out += [(w, "both"), (w + 40, s)]
            t = w + 40 + 180
    # close on both of them, with no flash of a shot in the last seconds
    while len(out) > 1 and n - out[-1][0] < 25:
        out.pop()
    if out[-1][1] != "both":
        if n - out[-1][0] >= 65:
            out.append((n - 40, "both"))
        elif len(out) > 1 and out[-2][1] == "both":
            out.pop()
    return out


def clock(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def _host():
    """The host's first name from context.json's studio, or "Host"."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from studio import load_context, studio
        st = studio(load_context())
        return st["owner"] if st["has_owner"] else "Host"
    except Exception:
        return "Host"


def people_from_env():
    ps = [p for p in [
        {"key": "top", "name": E.get("TOP_NAME") or "Guest", "v": E.get("TOP_V", ""), "a": E.get("TOP_A", "")},
        {"key": "bot", "name": E.get("BOT_NAME") or _host(), "v": E.get("BOT_V", ""), "a": E.get("BOT_A", "")},
    ] if p["v"]]
    if not ps:
        raise SystemExit("No camera feeds.")
    return ps


def analyze():
    people = people_from_env()
    for p in people:
        src = p["a"] or (p["v"] if has_audio(p["v"]) else "")
        if not src:
            print(f"No sound for {p['name']}: add their own microphone file (or a camera file with sound)", flush=True)
            raise SystemExit(3)
        p["wav"] = f"work/voice-{p['key']}.wav"
        voice(src, p["wav"])
        p["db"] = levels(p["wav"])
        p["on"], thr = talking(p["db"])
        p["len"] = min(length(p["v"]), len(p["db"]) / R)
        print(f"{p['name']}: {p['len'] / 60:.1f} min, talking {100 * sum(p['on']) / len(p['on']):.0f}% (above {thr:.0f} dB)", flush=True)
    n = int(min(p["len"] for p in people) * R)
    for p in people:
        p["db"], p["on"] = p["db"][:n], p["on"][:n]
    any_on = [any(p["on"][i] for p in people) for i in range(n)]
    talk = [(a, b) for a, b, v in runs(any_on) if v and b - a >= 20]
    start = float(E["START"]) if E.get("START") else max(0.0, (talk[0][0] if talk else 0) / R - 1.0)
    end = float(E["END"]) if E.get("END") else min(n / R, (talk[-1][1] if talk else n) / R + 1.5)
    start, end = round(start * FPS) / FPS, round(end * FPS) / FPS
    if end - start < 10:
        raise SystemExit("The edit would be shorter than 10 seconds. Check the start and end.")
    s0, s1 = int(start * R), int(end * R)
    print(f"edit: {clock(start)} to {clock(end)} of the recording", flush=True)
    if len(people) == 2:
        top, bot = people
        part = lambda p: {"db": p["db"][s0:s1], "on": p["on"][s0:s1]}
        cuts = plan(part(top), part(bot), s1 - s0)
    else:
        cuts = [(0, people[0]["key"])]
    span = s1 - s0
    share = {}
    for k, (a, s) in enumerate(cuts):
        b = cuts[k + 1][0] if k + 1 < len(cuts) else span
        share[s] = share.get(s, 0) + b - a
    names = {p["key"]: p["name"] for p in people}
    names["both"] = "both"
    print(f"shots: {len(cuts)} ({', '.join(f'{names[k]} {100 * v / span:.0f}%' for k, v in sorted(share.items(), key=lambda x: -x[1]))})", flush=True)

    # each voice to the same speaking level before they're mixed, so neither is quieter than the other
    gains = []
    for p in people:
        tk = sorted(d for d, o in zip(p["db"], p["on"]) if o)
        gains.append(max(-12.0, min(12.0, -20.0 - tk[len(tk) // 2])) if tk else 0.0)
    dur = end - start
    seek = ["-ss", f"{start:.3f}"]
    wavs = []
    for p in people:
        wavs += seek + ["-i", p["wav"]]
    mix = (f"[0:a]volume={gains[0]:.1f}dB[ga];[1:a]volume={gains[1]:.1f}dB[ha];[ga][ha]amix=inputs=2:normalize=0:duration=longest,highpass=f=70,{VOX}"
           if len(people) == 2 else f"[0:a]volume={gains[0]:.1f}dB,highpass=f=70,{VOX}")
    # loudness in two passes: measure the levelled mix, then set it to -14 LUFS exactly (one pass lands short)
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats"] + wavs + ["-filter_complex", mix + ",loudnorm=I=-14:TP=-1:LRA=20:print_format=json", "-t", f"{dur:.3f}", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = json.loads(err[err.rindex("{"):err.rindex("}") + 1])
    loud = (f"loudnorm=I=-14:TP=-1:LRA=20:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample=48000,aformat=channel_layouts=stereo")
    sh(["ffmpeg", "-v", "error", "-y"] + wavs + ["-filter_complex", f"{mix},{loud}[a]", "-map", "[a]", "-t", f"{dur:.3f}", "-c:a", "pcm_s16le", "work/audio.wav"])

    # the talking runs, kept for the captions and the plan (seconds on the edit's clock)
    talk_runs = {p["key"]: [[round(a / R, 2), round(b / R, 2)] for a, b, v in runs(p["on"][s0:s1]) if v] for p in people}
    edit = {
        "start": start, "end": end, "dur": round(dur, 3),
        "people": [{"key": p["key"], "name": p["name"], "v": p["v"]} for p in people],
        "cuts": [[round(a / R, 2), s] for a, s in cuts],
        "talk": talk_runs,
    }
    json.dump(edit, open("work/edit.json", "w"))
    json.dump({"start": start, "end": end, "cuts": [[a / R, s] for a, s in cuts]}, open("work/shots.json", "w"))


def shot_list(edit):
    cuts, dur = edit["cuts"], edit["dur"]
    return [(a, cuts[k + 1][0] if k + 1 < len(cuts) else dur, s) for k, (a, s) in enumerate(cuts)]


def moves(edit):
    """Slow pushes on the single shots (seconds on the edit's clock): (a, b, from, to), every other one pulls out."""
    out, k = [], 0
    for a, b, s in shot_list(edit):
        if s == "both" or b - a < PUSH_MIN:
            continue
        z0, z1 = (1.0, 1.0 + PUSH) if k % 2 == 0 else (1.0 + PUSH, 1.0)
        out.append((round(a, 3), round(b, 3), z0, z1))
        k += 1
    return out


def zoom_expr(items, var="t"):
    """A zoom factor over time: items are (a, b, from, to) windows, eased; 1 outside them."""
    terms = []
    for a, b, z0, z1 in items:
        d = max(0.04, b - a)
        p = f"(({var}-{a:.3f})/{d:.3f})"
        ease = f"(0.5-0.5*cos(PI*{p}))" if z0 != z1 else "1"
        terms.append(f"between({var},{a:.3f},{b:.3f})*({z0 - 1:.4f}+({z1 - z0:.4f})*{ease})")
    return "1+" + "+".join(terms) if terms else "1"


ZOOM_CHAIN = "format=yuv444p,scale=w='1920*({z})':h='1080*({z})':eval=frame:flags=bicubic,crop=1920:1080:x='(iw-1920)/2':y='(ih-1080)*0.42',format=yuv420p"


def base():
    edit = json.load(open("work/edit.json"))
    people = edit["people"]
    start, dur = edit["start"], edit["dur"]
    seek = ["-ss", f"{start:.3f}"]
    args = []
    for p in people:
        args += seek + ["-i", p["v"]]
    full = f"fps={FPS},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1"
    mv = moves(edit)
    z = zoom_expr(mv)
    zoom = ZOOM_CHAIN.format(z=z) if mv else "format=yuv420p"
    cuts = edit["cuts"]
    if len(people) == 2:
        order = {"top": 0, "bot": 1, "both": 2}
        open("work/cmds.txt", "w").write("".join(f"{a:.3f} streamselect@sel map {order[s]};\n" for a, s in cuts[1:]))
        vf = (f"[0:v]{full},split=2[gF][gS];[1:v]{full},split=2[hF][hS];"
              f"[hS]crop=954:1080,pad=960:1080:0:0:color={NAVY}[hL];[gS]crop=954:1080,pad=960:1080:6:0:color={NAVY}[gR];"
              f"[hL][gR]hstack=inputs=2,sendcmd=f=work/cmds.txt[w];"
              f"[gF][hF][w]streamselect@sel=inputs=3:map={order[cuts[0][1]]},{zoom}[v]")
    else:
        vf = f"[0:v]{full},{zoom}[v]"
    sh(["ffmpeg", "-v", "error", "-y"] + args + ["-filter_complex", vf, "-map", "[v]", "-t", f"{dur:.3f}", "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-g", "30", "-movflags", "+faststart", "work/base.mp4"])
    json.dump({"moves": mv}, open("work/moves.json", "w"))
    print(f"camera: {len(mv)} slow push(es) on single shots, {os.path.getsize('work/base.mp4') / 1048576:.0f} MB", flush=True)


if __name__ == "__main__":
    {"analyze": analyze, "base": base}[sys.argv[1]]()
