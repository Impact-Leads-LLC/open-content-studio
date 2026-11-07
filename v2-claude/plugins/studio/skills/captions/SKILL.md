---
name: captions
description: "Writes the caption that goes out with a reel or carousel: one caption for every network, a first line that works alone, two to four short paragraphs, a plain save line, and one next step as the last paragraph, with a different last paragraph only for networks where the step works differently. Use for: write the caption, caption this reel, caption this carousel, rewrite the caption."
---

# Captions

The words that go out with a reel or a carousel. One caption, the same on every network the piece goes to; only the
last paragraph, the next step, can differ by network. Written in the member's voice, judged by the same seven checks
as everything else.

**Scripts.** `S="<this skill's base directory>/../../scripts"` (Claude shows the base directory when the skill loads).

Load first: `studio/brand/voice.md`, `brief.md`, `banned.md`, `coach.md`, `settings.json` (networks, the main network,
lead magnets, the call), the piece's plan, and the member's playbooks `studio/playbooks/hooks.md` (the first line) and
`content-strategy.md` (the next step by level); when one is missing, the plugin's `templates/playbooks/` copy. For a carousel, write the caption **from the finished slides**
(`copy.md` in its folder, and look at the contact sheet) so the caption and the deck agree. For a reel, from its
`words.json` (what's actually said in the cut).

## Shape

- **First line**: the hook, and it works alone. Instagram shows about 125 characters before "more", and YouTube uses
  the first line as the Short's title, so keep it under 90 characters.
- **Then two to four short paragraphs** that give the one point. The first two carry it on their own: on networks with
  a tight limit (Threads takes 500 characters) the calendar keeps the first line, the paragraphs after it that fit, the
  save line and the last paragraph.
- **The save line**: one plain line, its own paragraph, just before the last ("Save this for your next proposal.").
- **The next step**: the last paragraph, one step only, by the piece's `cta` (a lead magnet keyword in capitals,
  the full episode, or the member's call by its exact name), as `settings.json` says it's delivered.
- Under 2,000 characters. No hashtags unless `brief.md` allows them. A link only when it's in `settings.json`, never a
  placeholder.

## Per network

Write the last paragraph for the main network (`settings.main_network`). Then, only for networks where that step
doesn't work as written, give a replacement last paragraph:
- "Link in bio" means nothing on LinkedIn: there, the link goes in the first comment ("The link is in the first
  comment.").
- A "comment the keyword" step on a network where the member doesn't deliver by comment becomes "link in bio".
- Facebook and YouTube can carry a written-out link when there is one.

## The gate

The `humanizer` loop, then `node "$S/lint.mjs" <piece>/caption.md --kind caption` until clean.

## File: `caption.md` in the piece's folder

```
<the caption, exactly as it goes out on the main network>

---
First comment: <link or keyword reminder, when used>
On linkedin: <the last paragraph as it should read there>
On threads: <...>
```

Only the text above the dashes is posted. Notes for the member go in `notes.md`.
