---
name: cover
description: "Makes reel, TikTok, Short and story covers at 1080x1920: the cover line set large with one accent, every word inside the 3:4 window a profile grid shows, over a still from the video (with a dark fade or a label), or on the plain brand colour. Use for: reel cover, cover for this video, thumbnail for this reel, story cover."
---

# Covers

The cover is what a stranger sees on the member's profile grid: no sound, no caption, a thumbnail. It has to say what
the video teaches in under a second.

**Scripts.** `S="<this skill's base directory>/../../scripts"`. Follow the member's playbooks
`studio/playbooks/design.md` and `reels.md` (when one is missing, the plugin's `templates/playbooks/` copy), including
their "Your changes".

## The words

The cover line from the `hooks` skill: 3 to 8 words, 40 characters at most, one accent, a concrete noun, sense with
no context. Never cut to fit; the builder steps the type down instead. An optional follow line under it ("Follow for
cash flow fixes") says what following gets them.

## The picture and the treatment

- A still from the reel or the episode: `node "$S/frame.mjs" <video> <mm:ss> <piece>/still.jpg`. Pick a frame where
  the member's face is clear and expressive, mid-gesture beats mid-blink. Only the member, or a guest who was on the
  episode; never anyone else.
- `fade`: the words over the photo with a dark fade behind them. Put the words where the face isn't
  (`"position": "top"` or `"bottom"`).
- `slab`: the words on a dark label over the photo. Good for a busy frame.
- `board`: no photo, the brand colour with the dot grid. For a reel with no good frame.

## Build

`cover.json` in the piece's folder:

```json
{ "line": "Your client owes you / 60 days of payroll", "accent": "60 days", "image": "still.jpg",
  "focus_y": 40, "treatment": "fade", "position": "bottom", "follow": "Follow for cash flow fixes" }
```

```bash
node "$S/cover.mjs" <piece>/cover.json
```

Writes `cover.png` (1080x1920). Every word stays between y 240 and 1680, the part a 3:4 profile grid shows. `OVER:`
means it can't fit even at the smallest size: shorten the line or move the break. Look at it at thumbnail size: does
it read, and is the face clear of the words? Rotate treatments across an episode so the grid doesn't repeat.
