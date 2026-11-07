---
name: carousel
description: "Builds story carousels in the member's look: a hook cover, plain reading slides with one bold line each and a save pill, and an outro with the next step, 10 slides at most, as 1080x1350 PNGs rendered with a headless browser, plus a contact sheet. Claude writes the words; the template draws every slide. Use for: make a carousel, turn this into a carousel, carousel slides, rebuild the carousel."
---

# Carousels

One idea, told simply, one point per slide, in the member's look. The story format is the default: a graphic cover,
then plain reading slides that each lead to the next, then the outro (the next step, save, follow). Claude writes
only the words in `plan.json`; `carousel.mjs` draws every slide from the member's palette and fonts, renders them and
checks that the text fits. That keeps every deck simple and on brand.

**Scripts.** `S="<this skill's base directory>/../../scripts"`. Load `studio/brand/voice.md`, `brief.md`,
`banned.md`, `coach.md` and the piece's plan (its `outline`, `hook`, `stage`, `insight`, `library`) first, and the
member's playbooks `studio/playbooks/carousels.md` (how the deck tells its idea) and `design.md` (pictures and the
look); when one is missing, the plugin's `templates/playbooks/` copy, two levels up from this skill. The playbooks win
over this file on craft; the limits below are what the template can fit, so they hold.

## Write plan.json

In the piece's folder. A worked example: `examples/sample-studio/episodes/2026-11-07-invoice-on-day-one/pieces/c01-the-60-day-wait/plan.json`
(two levels up from this skill, in `examples/`), and its render in `examples/previews/carousel-contact-sheet.jpg`.

```json
{
  "format": "story",
  "chip": "The show's name, \"Expert guest\", or the brand",
  "cover": { "top": "Your client is", "key": "60 days", "bottom": "into your payroll",
             "sticker": "One line in your proposal fixes it", "image": null, "focus_x": 50, "focus_y": 40 },
  "slides": [ { "blocks": [ { "kind": "p", "text": "..." }, { "kind": "bold", "text": "..." } ] } ],
  "save_slide": 3, "save_text": "Save this for your next proposal",
  "outro_headline": "Want three months of cash in view?", "follow_topic": "cash flow fixes", "credit": ""
}
```

- **cover**: the hook as three lines read as one sentence: `top` (a few words, 20 characters at most), `key` (the 1 to
  3 loaded words, set huge in capitals in the accent colour, 14 characters at most: the deck's one accent moment),
  `bottom` (22 characters at most). `sticker`: what the reader gets, 45 characters at most. `image`: a picture for the
  cover's framed window, or `null` (the hook then sets larger). `focus_x`/`focus_y`: where the face sits, as
  percentages (50, 40 when unsure).
- **slides**: 6 to 8 reading slides, in order. Each is 2 or 3 blocks and 120 to 220 characters in all. Kinds: `p`
  a short paragraph; `bold` the slide's one line that lands (exactly one per slide, usually last); `quote` a line
  someone said, word for word, in quotation marks; `step` one numbered step (they number themselves across slides; 3
  at most on a slide). Full sentences, the speakers' own words and figures, and what the member teaches in the library
  files. Each slide leads to the next. No recap slide; no call-to-action slide (the outro is added).
- **save_slide**: 3 or 4 (the cover counts as 1). `save_text`: "Save this for ..." with something specific, 40
  characters at most.
- **outro_headline**: tied to the topic, 60 characters at most (a question is fine). The outro's button is the member's
  next step from `settings.json` (`next_step.cta_label`, `cta_where`); `follow_topic`: what following gets them more of,
  24 characters at most.
- **credit**: the guest's full name when the idea or story is the guest's (it goes on every reading slide's footer),
  otherwise empty. A guest's advice stays theirs; the member's take appears only from what the member says.
- **chip**: what this is ("The Calm Cash Show", "Expert guest", the brand name for a library piece).

**The cover picture**, in this order: a still from the episode at the spark moment
(`node "$S/frame.mjs" <video> <mm:ss> <piece>/cover.jpg`; never blown up past its size); a photo of the member from
`studio/assets`; with `settings.pictures.fal` true and the member's fal key available, a generated picture of one
real object or place from the topic: never a person, a face or hands, never words, numbers or logos. On a Mac with
the key in the Keychain: `FAL_KEY="$(security find-generic-password -s studio-fal-key -w)" node "$S/picture.mjs"
--prompt "a calendar with one day circled on a desk" --out <piece>/cover.jpg` (never print the key). Otherwise `null`.
Never a stock photo of a person, an AI-made person, or anyone who wasn't part of it.

## Render and check

```bash
node "$S/carousel.mjs" <piece>
```

It writes `slides/*.html`, `png/*.png`, `png/contact-sheet.png`, `copy.md` (every visible word, for the gate) and
`build.json`. If it prints `OVER: 03-read`, that slide's text still runs past its box at the smallest size: rewrite
it shorter (under 170 characters, same meaning, same words and figures) and run it again. Then look at the contact
sheet at a third of full size: is the cover's hook readable, does each slide carry one point, is anything crowded or
empty? Fix and render again.

## Other formats (only when the idea really is a thing to show)

An email or DM someone described, a before-and-after, a page, a single stat: write those slides yourself as HTML
files in `<piece>/slides/` (`01-cover.html`, `02-the-email.html`...), each a 1080x1350 page linking
`<link rel="stylesheet" href="../kit.css">` (the member's colours and fonts as CSS variables: `--board`, `--accent`,
`--ink`, `--text`, `--soft`, `--head`, `--body`; classes `.h1`, `.h2`, `.card`, `.key`, `.mark`, `.pad`, `.abs`). Set
`"format": "custom"` in plan.json and run `carousel.mjs`: it adds the outro and renders. Never invent the email, the
DM, a figure or a name: rebuild what was described in the speaker's own words.

## The gate

The `humanizer` loop on every word in `copy.md`, then `node "$S/lint.mjs" <piece>/copy.md --kind slides`. A guest's
quote stays word for word even when it holds a banned word. Then write the caption from the finished slides
(`captions` skill).
