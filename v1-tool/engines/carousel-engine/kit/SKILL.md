---
name: carousel
description: "Creates Instagram and LinkedIn carousels for the studio owner's brand as 1080x1350 PNGs, 10 slides at most. The default is the story format: one graphic cover with the hook, plain reading slides with one bold line each and a save prompt early, and an outro that asks for the booking, the save and the follow. Artifact formats (an email or DM mockup, a guest feature, a quote over the frame, side-by-side, a stat) only when the idea is a thing to show. Fixed brand layer (the studio's palette and fonts), guest credit, an avoid-AI-writing gate, an HTML kit and a Chrome render script. Use for /carousel, make a carousel, carousels from this episode."
metadata:
  version: "5.0"
---

# Carousel Skill (v5)

One idea, told in 6 to 10 slides. Most ideas are a story, steps or a lesson, and they go in the
story format: a graphic cover, plain reading slides, the outro. Output is a folder of 1080x1350
PNGs plus a contact sheet. The brand layer never changes.

"The host" below is the studio owner (in the app: `studio.owner` / `studio.ownerFull` in the
job's context). "The show" is their show (`studio.show`), "the handle" is their social handle
(`studio.handle`), and "the brain" is the studio's own knowledge base (the brain tools).

## How v5 works

- **The story format is the default** (first in the format library). The artifact formats stay
  for ideas that are a thing to show. Forcing every idea into one heavy template looks hacky:
  most decks are a graphic on the front card and plain text after it.
- **One graphic, on the cover.** The reading slides are plain text: no images, no boxes.
- **A save pill on the 3rd or 4th slide**, and **the same outro on every deck**: the call to
  action from the brand brief (usually booking a call), save the post, follow. The highest aim
  of this content is to be savable.
- **10 slides at most**, outro included: schedulers that post through Instagram's API take at
  most 10 images a post. A story deck runs 8 to 10.
- **Savable first:** pick and write ideas people keep and use later (steps, scripts, plans,
  lists of what to say).
- **The content picks the format** for an artifact deck. The brand layer is fixed; the layout is
  free.
- **Guest content credits the guest on every slide,** and the host's view sits on its own take
  slide.

---

## Where everything lives

| What | Where |
|---|---|
| Voice, audience, offers, the current ask | `get_brand_brief`, then the brain docs "Voice", "Voice Guardrails" and "Avoid AI Writing" every time, and "Carousels" (the studio's own carousel rules; it wins over this file). |
| The look | `template/kit.css`: the palette block at the top. In the app the palette comes from the studio's brand settings and is written onto every slide. |
| Glyphs | Only when the brain supplies a glyph library. Otherwise none: dots, numbers and type carry the layout. |
| Photos of the host | `photo_pick` / `photo_search` (the brain), the host's own photos. Log what you use with `photo_use`. |
| The kit | `template/kit.css`, `template/fonts/` (Libre Franklin + Poppins, OFL), `template/blank.html` |
| Scripts | `scripts/render.py` (slides to PNGs + contact sheet), `scripts/stills.py` (episode stills, side-by-side, site screenshots) |
| Each format in depth | `references/formats.md` |
| Getting B-roll | `references/broll.md` |
| The editorial list anatomy | `references/editorial-list.md` |
| Worked examples | `examples/kit-gallery` (one slide per kit part, placeholder copy) |

**Requirements.** Chrome, Chromium or Edge (HyperFrames' headless shell counts), Python 3,
Pillow for the contact sheet, ffmpeg for stills. Run `python3 <skill>/scripts/render.py --doctor`
once on a new computer. Works on Mac, Linux and Windows.

---

## Phase 1: Intake

1. **Read all the material** in full: the transcript with timestamps, notes, a draft post.
2. **Name the source.** The host's own idea, a guest on the host's show, the host as a guest on
   someone else's show, or a client story. The source sets the credit rules (Guest content,
   below). The host on someone else's show is for their stories and how they explain things,
   never canonical teaching material. Client results come only from the brain's proof docs,
   client named and quoted word for word. A document marked confidential is never quoted.
3. **Find the one idea.** If the material holds several, list them as separate carousel ideas,
   one line each with the format that would suit it, and let the host pick.
4. **Write the hook:** a number, an outcome and the listener's words ("12 booked calls from one
   email"). Vague insider titles fail.
5. **List what you can show:** the artifact itself (the email, the DM, the page), figures said
   on the record with their timestamps, stills, the guest's site, the host's photos.
6. **Load voice from the brain** before writing a word.

Do not build anything yet.

## Phase 2: Two directions, as frames

A story deck skips this phase: its anatomy is fixed, so go straight to Phase 3 and show the
whole deck. For an artifact deck, build a cover and one inner slide for **two directions that
differ in structure**, not just in colour: artifact-led against guest-led, or a dark cover with
the email running off the edge against a photo-led cover. Three skins on one skeleton reads as AI
slop. Render them, show the contact sheet, give one line on the idea behind each, recommend one,
and wait for the pick. Never build the full deck first. (In the app there is no frames round: the
team reviews the finished deck and asks for another direction with notes.)

## Phase 3: Build the deck

- **10 slides at most, the outro included.** A story deck is 8 to 10: the cover, 6 to 8 reading
  slides, the outro. An artifact deck is 4 to 9 slides plus the outro. Each slide carries one
  idea and earns its place. No recap slide. If two slides make the same point, cut one.
- **A typical arc:** hook, where it came from (for a guest), the thing itself, why it works or
  the proof, the host's take or the takeaway, then the outro. Mix artifact formats inside one
  deck when the story needs it (an artifact, a guest feature and a quote over the frame).
- **The cover** has one loud thing: the number, the artifact or the face. Give it a reason to
  swipe (the email running off the bottom edge, an answer still to come).
- **The save pill** goes on the 3rd or 4th slide, once: "Save this for ..." with something
  specific to the topic ("Save this for your next outreach list").
- **The outro ends every deck** (on the primary colour, the same in every format): the host's
  round photo (or their initial) with their name and "Host of <the show>", a headline tied to the
  topic, the accent button block with the brand's call to action / "Link in bio", then "Save
  this post for later." and "Follow <the handle> for more <topic> like this."
- **Copy** is full sentences at a fifth-grade reading level. Short is fine. Stacks of fragments
  are not.
- **Glyphs** only where a glyph says something and only from the brain's library. Never as
  bullets (bullets are small dots in the primary colour).
- **Checks and crosses** are fine now and then: one slide that sorts good from bad can mark its
  items with a plain check and cross in the brand colours. Not on every list, and never in a
  circle or badge.
- **Phone check:** look at the contact sheet at a third of full size. Text under about 24px on
  the 1080 canvas is too small; most body copy sits at 28 to 34px.

## Phase 4: Render, check, deliver

1. Put one HTML file per slide in `<deck>/slides/`, named in order (`01-cover.html` ...).
   Start from `template/blank.html` and link `template/kit.css`.
2. `python3 <skill>/scripts/render.py <deck>/slides` writes the PNGs and `contact-sheet.png`
   to `<deck>/png/`.
3. Look at every slide: overlaps, text cut at an edge, dead bands of empty space, markers that
   point at the wrong line. Fix and render again.
4. Run the delivery gate (below) on every word of visible copy.
5. **Delivery note**, under the files: anything still a placeholder (the host's take), every
   figure and quote with its timestamp, where each photo came from, and anything that needs the
   guest's OK.

---

## Format library

Pick by what the content is. Details, slide flows and pitfalls: `references/formats.md`.

| Format | Use it when | How it goes | Kit parts |
|---|---|---|---|
| **Story (the default)** | The idea is a story, steps, a lesson or a list: most ideas | One graphic cover (the hook, a framed episode still or picture), 6 to 8 plain reading slides with one bold line each, the save pill on the 3rd or 4th, the outro. Anatomy in `references/formats.md` | the story template (`references/formats.md`) |
| Artifact mockup | The idea is a thing someone sends or sees: an email, a DM, a text, a post, a page, an invoice, a calendar invite | Show the artifact, mark what makes it work, then the result | `.email` `.phone` `.thread` `.browser` `.num` `.legend` |
| Guest feature | A guest said it on the show | Guest and show on the cover, the host and guest side by side, their words, the host's take | `.chip` `.split` `.tag` `.quote` `.foot` |
| Quote over the frame | One line is worth reading in the speaker's own words | The still from that exact second, the quote word for word | `.photo` `.quote` |
| Side-by-side | Two versions of the same thing | Both labelled, the better one marked | `.compare` |
| Process | Steps that lead to a result | Numbered steps, one sentence each | `.steps` `.num` |
| Stat | A figure is the point | The figure huge, one line on what it means, where it came from | `.display` `.bars` `.dots` |
| Case with photos | A named client's story told with their photos or screenshots (otherwise use Story) | The moment, what changed, the result, the lesson | `.photo` `.h2` |
| Editorial list | The content is a list of parallel items | `references/editorial-list.md` | the list anatomy |

## Guest content (every time)

- **Credit the guest on the cover and on every slide:** their name and "guest on <the show>",
  as a chip or in the footer.
- **Their advice stays theirs:** in their words, or clearly attributed ("Sam's team sends
  this"). Never write it as the host's advice.
- **The host's view goes on a take slide** with their photo, labelled as host. Draft it from
  what the host said in the episode (give the timestamp) and flag it as a placeholder for the
  host to rewrite in their own words.
- **Quotes and figures come from the transcript word for word,** with timestamps. A rebuilt
  artifact (an email the guest described) uses their words. Don't invent subject lines, names,
  figures or results.
- When the host is the guest on someone else's show, credit the host of that show and the show.

## B-roll

Details and commands: `references/broll.md`.

- **Stills from the episode tracks at native resolution.** Never upscale: a still fills a box
  its own size or smaller. `stills.py` tells you the largest box each still can fill.
- **The host and guest side by side** is the "on the show" proof.
- **A quote sits over the frame where it was said,** found by its timestamp.
- **The guest's site, or a page they mention,** goes in a browser frame.
- **The host's photos** come from `photo_pick` (their own photos, never generated).
- **A generated cover picture** (when there is no episode still) shows one object or place from
  the topic: never a person, a face or hands, never words or logos.
- **Never:** stock photos, AI-generated people, images of people who weren't part of it, or a
  guest's headshot downloaded from their site without the host's go-ahead.

## The brand layer (every carousel)

The palette lives in `template/kit.css` (in the app it comes from the studio's brand settings).

- **Type:** Libre Franklin for headings and the big number, Poppins for everything else. No
  third typeface.
- **Colour:** slides people read sit on white or the soft tint with body text in slate and
  headings in near-black ink. The cover and the outro may sit on the primary colour (white
  type), the same colour as the reel and episode boards. Never light text on a dark ground for
  reading slides: it strains the eyes. The accent is an accent, never a background: the cover's
  key words and the booking button, nothing else. The primary colour carries small marks on light
  slides (step numbers, arrows, dots). One loud colour moment per slide.
- **Shapes:** one 6px radius, hairline borders, no gradients apart from the highlighter mark, no
  decorative short rules or long dashes, no card-top accent bars.
- **Glyphs** from the brain's library only, or none.
- **The handle** on every slide (leave it out when the studio has none).

---

## Delivery gate: the avoid-AI-writing audit (mandatory)

No copy from this skill reaches the host without this pass. It is a gate, not a polish.

1. Run the brain doc "Avoid AI Writing" as a full loop on every piece of visible copy: draft
   rewrite, then answer "what makes this still read as AI?", then the final rewrite.
2. Sweep the final against the brain's "Voice Guardrails" (banned phrases and framings). Common
   bans: contrast-correction constructions in any form ("it's not X, it's Y" and softened
   variants); staccato fragment stacks; manufactured-directness sales lines; em dashes.
3. The audit is the detector; the host's guardrails govern the rewrite. Where they conflict, the
   guardrails win.
4. Anything flagged is rewritten from its one-sentence core, not patched.

A guest's quote stays word for word even when it holds a banned word. The gate applies to the
copy we write around it.

---

## Content quality standards

The voice source of truth is the brain: "Voice" and "Voice Guardrails". They win over anything
here.

### Voice
1. Fifth-grade reading level. Short words. One idea per sentence.
2. Contractions always.
3. Active voice.
4. Peer-to-peer, owner-to-owner. Never coach-to-student.
5. Calm authority. No hype, no exclamation points, no superlatives.
6. Specific beats inspirational. A figure or a scenario, or cut it.

### Forbidden patterns
- No em dashes or en dashes anywhere in slide copy.
- No "not X, it's Y" structure in any form, unless the host's own locked phrase in the brain
  says it that way.
- No staccato fragment stacks.
- No filler transitions ("Now let's talk about", "The truth is", "Here's the thing").
- No off-brand words: mindset shift, empower, unlock, hustle, grind, proven system, journey,
  deep dive, unpack, impactful, thought leader, leverage (verb), seamless, robust,
  comprehensive, delve, embark. The brain's guardrails add the studio's own.

### Headlines are statements, never topics
- Topic: "Why your first email matters". Statement: "12 booked calls from one email."

---

## Error handling

- **Content too vague:** ask one question: "What's the one thing this carousel should teach?"
- **Several ideas:** list them as separate carousels and ask which leads.
- **No artifact in the material:** pick another format. Never invent the email or DM.
- **The only photo of a guest is low resolution:** crop smaller, use the frame as a chip, or ask
  for the guest's headshot.
- **Both directions rejected:** ask what felt wrong before building more.
- **Render fails:** `render.py --doctor`, install what it names, retry. Save the slide copy as
  markdown so nothing is lost.
