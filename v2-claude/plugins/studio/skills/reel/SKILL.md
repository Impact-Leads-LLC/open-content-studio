---
name: reel
description: "Cuts a reel from an episode or clip with ffmpeg on this computer: one 20 to 75 second stretch, trimmed to the words, long pauses tightened, made upright at 1080x1920 (the whole frame over a blurred fill, or a crop on the speaker), word-by-word captions burned in, an optional hook line for the first seconds, plus review frames. Use for: cut a reel, make a reel from this, clip this moment, re-cut the reel."
---

# Reels

One moment of the video, cut clean and captioned, that teaches and lands on its own. Kept to what runs reliably on a
laptop: ffmpeg cuts and captions, whisper.cpp times the words. No cloud rendering, no background removal, no
animation. Run it in the Code tab (Cowork's sandbox usually has no ffmpeg; see the studio skill's
`references/environments.md`).

**Scripts.** `S="<this skill's base directory>/../../scripts"`. Needs ffmpeg with libass (`doctor.mjs` checks) and,
for captions, whisper.cpp with a model, or word times you already have. Follow the member's reels playbook,
`studio/playbooks/reels.md` (when it's missing, the plugin's `templates/playbooks/reels.md`): its "Your changes" can
set a shorter length, captions in capitals (`--caps`) or a crop on the member.

## 1. Pick the stretch

From the piece's plan: `start` is where the hook sentence begins, `end` is where the point lands and the sentence
finishes. Check both against `transcript.txt`: a reel never starts mid-sentence or on throat-clearing, and never ends
before the point lands. 20 to 75 seconds.

## 2. Pick the layout

- Upright video (a phone): nothing to choose.
- Landscape video: `fit` (the default) shows the whole frame across the middle over a blurred fill, which keeps
  everyone in shot. `crop` fills the screen with one speaker: grab a frame first
  (`node "$S/frame.mjs" <video> <start> /tmp/look.jpg`), look at where the speaker's face is across the frame, and
  pass `--focus` (0 = left edge, 0.5 = centre, 1 = right edge). Use crop only when one person carries the moment and
  stays in that spot.
- Several camera files (one per person): cut from the file of the person speaking; the times match the episode.

## 3. Cut

```bash
node "$S/reel.mjs" --src <video> --start 12:04 --end 12:51 --out <piece> \
  [--layout crop --focus 0.3] --hook "<cover line, / for a break>" --accent "<accent>"
```

It times the words of that stretch with whisper.cpp, trims to the first and last word, cuts pauses longer than 0.7
seconds down to about 0.2 (`--tighten 0` keeps them; use that when a pause is part of the point), makes it 1080x1920,
burns in captions (three words at a time, the word being said in the accent colour), shows the hook line in a box for
the first 3 seconds (`--hook-seconds`), and writes `reel.mp4`, `thumb.jpg`, `sheet.jpg` (a frame every 3 seconds),
`captions.ass`, `words.json` and `reel.json`.

Read the `starts:` and `ends:` lines it prints. Wrong first words: move `--start` and run it again. Ends too early or
late: move `--end`. Then look at `sheet.jpg`: is the speaker in shot, are the captions readable and clear of the face,
is the hook box readable? Captions are the speaker's words: fix only transcription errors (edit `captions.ass`, then
re-run with the same times), never the wording.

`--caps` sets the captions in capitals. `--no-captions` skips them (no whisper.cpp needed). `--words <file>` uses
word times you already have (episode seconds).

## 4. The cover and the caption

- Cover: the `cover` skill (a still from the first seconds:
  `node "$S/frame.mjs" <piece>/reel.mp4 0:01 <piece>/still.jpg`).
- Caption: the `captions` skill, written from `words.json` (what's said in the cut).

## What this doesn't do

No graphics animated on screen, no b-roll, no speaker cut-outs, no music, no multi-camera switching inside one reel.
Those need a video editor or an animation engine; the member can take `reel.mp4` into their own editor (CapCut,
Descript, Premiere) for that.
