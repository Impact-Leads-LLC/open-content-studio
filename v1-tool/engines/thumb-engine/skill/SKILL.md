---
name: thumbnail-builder
description: "Builds the studio's YouTube thumbnails (1280x720) in three rotating looks: the call (the guest's real webcam frame behind the host, one accent loop), the number wall (a giant number behind the host's head, an accent sticker) and the board (a tilted board in the brand's primary colour with an accent tag, the host in a white print). Words come from hook-maker, from the episode's biggest takeaway; the host is always one of the owner's own photos; gates check the face, the badge corner, one hot colour and the 168 px read."
metadata:
  version: "3.1-kit"
---

# Thumbnail Builder

> **The rules that never bend.** Three looks in rotation: the call, the number wall, the board. The host's face is
> their own photo with global tone only: never generated, mirrored, rotated, relit, smoothed or edited inside the
> face. The guest's frame is a real frame from the episode, never generated. One hot colour per thumbnail: the
> brand's accent, on one element. The duration-badge corner (x >= 960, y >= 552) stays clear. No commas, no em
> dashes, no contrast lines. The words add to the title, never repeat it, and come from the episode's biggest
> takeaway, never a side tactic. Copy-fit rejects, never scales. A look that can't play is reported, never forced.
> Every number comes from `tokens.json` (`v3`); every colour from the studio's palette.

One episode in, one thumbnail per look the words play. The words come from hook-maker (its thumbnail fields). The
host comes from the owner's photo library in the brain (`thumb_pick`): a photo with a cutout, with a person mask,
or plain (the engine then makes the cutout itself, or, failing that, plays the board only with the plain photo as
its print). The owner makes two calls: which words, and which thumbnail.

Read `references/design.md` first, whole. It holds the three looks' layer stacks and the banned behaviours.

## Where everything lives

| What | Where |
|---|---|
| The house style and the owner's decisions | Brain doc `Thumbnails`. Read it every run; it wins over anything here. |
| The three looks, layer stacks, banned behaviours | `references/design.md` |
| Which look, which photo, the guest frame, feed review | `references/art-direction.md` |
| Gates G1-G13 | `references/gates.md` |
| The owner's photos, cutouts, sides | `references/photos.md` |
| The loop | `references/marks.md` |
| Every number | `tokens.json` (`v3`); colours from the studio palette |
| Words | `hook-maker`, destination YouTube |
| Renderer | `scripts/thumb.py` (`doctor`, `prepare`, `guest-frame`, `looks`, `fit`, `render`, `gate`, `sheet`, `deliver`); `scripts/thumbkit/` |

**Requirements.** Python 3.10+ and Pillow 11+. The looks render with Pillow only (no browser). Faces (the owner's
photo and the call's guest frame) need OpenCV (`pip install opencv-python-headless`; the YuNet face model ships in
`assets/models/`) and the guest frame needs FFmpeg. A photo with neither a cutout nor a mask needs the cutout tool
(`pip install "rembg[cpu]"`). Run `python3 <skill>/scripts/thumb.py doctor` once per machine.

---

## Step 1: Intake

The transcript, the video's title if there is one (the thumbnail adds to it, never repeats it), and for a guest
episode the guest's own camera track, for the call's guest frame.

## Step 2: Load the brand

Read the brain doc `Thumbnails`. hook-maker loads the voice and the guardrails itself.

## Step 3: Words (hook-maker)

Run `hook-maker` whole, destination YouTube. Its thumbnail fields come from the episode's **biggest takeaway**: the
best advice in it, the thing the host spent the most words teaching and a viewer would come away using. Never a side
tactic or a fun aside, however good the number is.

What each look needs from the words:

| Look | support | hero | sticker | mark |
|---|---|---|---|---|
| call | on the ink tag over the guest's window (the problem) | below, white, one accent loop (the fix) | none | loop on the hero, or none |
| wall | white, in front of the number | a number, 1-5 characters (`0-9 % + X`) | accent sticker, the payoff (optional) | none |
| board | a line on the board | the big line on the board | accent tag, the payoff (optional) | none |

The field limits: caps; support two words at most, hero one word, sticker two words at most, five in all; the
thumbnail punctuation `' ? % -` only (no commas, no em or en dashes, no `$`).

## Step 4: The photo for each look

`thumb_pick {hook_type}` returns the owner's photos that play the hook type, as pairs. What a look needs:

- **call**: a photo with the person on the right (side R) and a cutout, and a guest frame.
- **wall**: a cutout (the wall scales the host to a 430 px head and puts a giant number behind it).
- **board**: any photo; without a cutout the plain photo fills the print.

## Step 5: Prepare

```bash
python3 <skill>/scripts/thumb.py prepare pairs.json <work>
```

One folder per pair under `<work>/pairs/`: the photo, the cutout (given, from the mask, or made with rembg), the brand
background image if the studio has one, and the face metrics. `prepared.json` says what each photo can play.

## Step 6: The guest frame (the call only)

```bash
python3 <skill>/scripts/thumb.py guest-frame <guest video> --at <seconds> --out <work>/guest
```

`--at` is the moment the hook comes from (the guest's line or gesture). It grabs frames around that time, finds the
guest's face, keeps the sharpest clear one, and writes `guest.json`, the untouched frame and `guest-candidates.jpg`.
Exit 1 means no clear face; try another moment.

## Step 7: Spec, copy-fit, render

```json
[{"id": "call", "look": "call", "pair": "<pair id>", "pair_dir": "pairs/<pair id>",
  "support": "WARM UP", "hero": "FIRST", "order": "support-first",
  "mark": {"kind": "loop", "target": "hero", "seed": "<run key>-call"}, "guest_frame": "guest/guest.json", "title": "<video title>"}]
```

```bash
python3 <skill>/scripts/thumb.py fit <work>/spec.json
python3 <skill>/scripts/thumb.py render <work>/spec.json <work>/out --report <work>/out/report.json
```

A line over its limit comes back as `{element, text, measured_px, limit_px, overflow_px, letters_to_cut}`: hook-maker
writes shorter words, two rounds at most. Exit 2 means a look the photo or the episode can't play.

## Step 8: Gates, sheets, delivery

```bash
python3 <skill>/scripts/thumb.py gate <work>/out call wall board
python3 <skill>/scripts/thumb.py sheet <work>/out call wall board --refs <reference thumbnails>
python3 <skill>/scripts/thumb.py deliver <work>/out call wall board
```

G1-G13 (`references/gates.md`); a fail is fixed by changing the words, the look or the photo, never by loosening a
number. On the sheets: cover the words (does the expression, or the guest's gesture, carry the hook?), the truth test
(the words promise only what the video pays off), and the thumbnail is not the darkest tile in dark mode.

## Hard rules

1. Words come through hook-maker's full delivery gate from the episode's biggest takeaway, or are the owner's own
   words checked against the guardrails. No commas, no em or en dashes, no contrast lines.
2. Three looks only, with the elements in `references/design.md`. One hot colour: the accent, on the call's loop, the
   wall's sticker or the board's tag. The accent is never a background.
3. The host comes only from the owner's own photos, cut and graded globally. Never mirrored, rotated, regenerated,
   relit or smoothed; nothing inside the face.
4. The guest's frame is a real frame from the episode, never generated, and nothing covers the guest's face.
5. Nothing in the duration-badge corner but the host and the photo. No type within 48 px of the host's face.
6. Copy-fit rejects, never scales. A look the photo or the episode can't play is reported, never forced.
7. Every gate passes before delivery. Never loosen a gate to pass.
8. Style decisions live in the brain doc `Thumbnails`. When the owner changes one, update the doc, not this file.
