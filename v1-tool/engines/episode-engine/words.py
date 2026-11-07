#!/usr/bin/env python3
"""Every word with its time and who said it (episode engine).

work/words.json: [{"who", "text", "start", "end"}] on the recording's clock. The camera tracks' transcription saves one
next to the transcript; when it's missing (an episode transcribed before, or from a .srt), each person's own voice
(work/voice-*.wav from edit.py analyze) is transcribed here with HyperFrames' Parakeet model, in pieces cut at pauses.
Env: HF (the hyperframes command), WORDS_URL (optional, a saved words file).
"""
import json
import os
import re
import subprocess

E = os.environ
PART = 90.0


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def pieces(wav, dur):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "highpass=f=80,silencedetect=noise=-40dB:d=0.4", "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    cuts = [(s + e) / 2 for s, e in zip(starts, ends)]
    out, a = [], 0.0
    while a < dur - 0.5:
        if a + PART >= dur:
            out.append((a, dur))
            break
        near = [c for c in cuts if a + 30 < c <= a + PART]
        b = near[-1] if near else a + PART
        out.append((a, b))
        a = b
    return out


def main():
    edit = json.load(open("work/edit.json"))
    if os.path.exists("work/words.json"):
        words = json.load(open("work/words.json"))
        if isinstance(words, dict):
            words = words.get("words", [])
        print(f"words: {len(words)} from the transcription", flush=True)
        return
    HF = E["HF"].split()
    words = []
    for p in edit["people"]:
        wav = f"work/voice-{p['key']}.wav"
        mono = f"work/v16-{p['key']}.wav"
        run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-ar", "16000", mono])
        dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mono]).stdout)
        for k, (a, b) in enumerate(pieces(mono, dur)):
            part = f"work/p-{p['key']}-{k:03d}.wav"
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", mono, part])
            r = run(HF + ["transcribe", part, "--dir", f"work/t-{p['key']}-{k:03d}", "--json", "-l", "en"])
            info = json.loads(r.stdout.strip().splitlines()[-1])
            data = json.load(open(info["transcriptPath"]))
            for w in data if isinstance(data, list) else data.get("words", []):
                t = (w.get("text") or w.get("word") or "").strip()
                if t:
                    words.append({"who": p["name"], "text": t, "start": round(a + float(w["start"]), 3), "end": round(a + float(w["end"]), 3)})
        print(f"{p['name']}: transcribed", flush=True)
    words.sort(key=lambda w: w["start"])
    json.dump(words, open("work/words.json", "w"))
    print(f"words: {len(words)} transcribed here", flush=True)


main()
