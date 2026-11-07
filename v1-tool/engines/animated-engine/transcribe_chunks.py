#!/usr/bin/env python3
"""Word timings you can cut on. Run from the project folder.

Raw whisper word times smear across pauses (it put a whole phrase inside a 5 s silence on
the first reel), so: map the silences, transcribe each stretch of speech on its own, and
offset its words by the stretch's start. Speech boundaries then come from the audio itself.

In : assets/source.mp4 (or a path given as the first argument)
Out: work/words_chunked.json  {chunks: [[start, end]...], words: [{text, start, end, chunk}...]}
     work/transcript.txt     one line per speech stretch, with times, for planning the cut
"""
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/source.mp4"
NOISE_DB, MIN_SIL = -45, 0.3
os.makedirs("work/chunks", exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-vn", "-ac", "1", "-ar", "16000", "work/audio16k.wav"], check=True)

log = subprocess.run(["ffmpeg", "-hide_banner", "-i", "work/audio16k.wav", "-af",
                      f"highpass=f=80,silencedetect=noise={NOISE_DB}dB:d={MIN_SIL}", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                            "work/audio16k.wav"], capture_output=True, text=True).stdout)
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
sil = list(zip(starts, ends + [dur] * (len(starts) - len(ends))))
chunks, prev = [], 0.0
for s, e in sil:
    if s - prev > 0.08:
        chunks.append((round(prev, 3), round(s, 3)))
    prev = e
if dur - prev > 0.08:
    chunks.append((round(prev, 3), round(dur, 3)))

WHISPER = shutil.which("whisper-cli")
MODEL = os.path.expanduser("~/.cache/hyperframes/whisper/models/ggml-small.en.bin")
use_cli = bool(WHISPER) and os.path.exists(MODEL)


def words_for(wav, offset, lo, hi):
    """[(text, start, end)] in source seconds, clamped to the speech stretch."""
    out = []
    if use_cli:
        subprocess.run([WHISPER, "-m", MODEL, "-f", wav, "-oj", "-of", wav[:-4], "-np", "-ml", "1", "-sow", "-l", "en"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        for seg in json.load(open(wav[:-4] + ".json"))["transcription"]:
            t = seg["text"].strip()
            if t and not t.startswith("["):
                out.append((t, seg["offsets"]["from"] / 1000, seg["offsets"]["to"] / 1000))
    else:
        d = wav[:-4]
        r = subprocess.run([os.path.join(HERE, "hf.sh"), "transcribe", wav, "--dir", d, "--json", "-l", "en"],
                           capture_output=True, text=True, check=True)
        info = json.loads(r.stdout.strip().splitlines()[-1])
        data = json.load(open(info["transcriptPath"]))
        for w in data if isinstance(data, list) else data.get("words", []):
            t = (w.get("text") or w.get("word") or "").strip()
            if t:
                out.append((t, w["start"], w["end"]))
    return [(t, round(max(lo, a + offset), 3), round(min(hi, b + offset), 3)) for t, a, b in out]


words, lines = [], []
for i, (s, e) in enumerate(chunks):
    a = max(0.0, s - 0.12)
    wav = f"work/chunks/c{i:03d}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-t", str(e + 0.12 - a), "-i", "work/audio16k.wav",
                    "-af", "apad=pad_dur=0.5", wav], check=True)
    ws = words_for(wav, a, s, e)
    words += [{"text": t, "start": f, "end": to, "chunk": i} for t, f, to in ws]
    lines.append(f"[{s:7.2f} - {e:7.2f}] " + " ".join(t for t, _, _ in ws))

json.dump({"source": SRC, "chunks": chunks, "words": words}, open("work/words_chunked.json", "w"), indent=1)
open("work/transcript.txt", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
print(f"\n{len(chunks)} speech stretches, {len(words)} words ({'whisper-cli' if use_cli else 'hyperframes transcribe'})")
