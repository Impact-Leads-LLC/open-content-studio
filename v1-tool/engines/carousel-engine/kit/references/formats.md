# Carousel formats

Pick the format from what the content is, then design inside it. Every format uses the brand
layer in SKILL.md and the parts in `template/kit.css`. Most ideas are a story, steps or a lesson
and go in the story format (first below). The artifact formats after it are for ideas that are a
thing to show; a deck can mix them (an artifact mockup, a guest feature and a quote over the
frame in five slides works well). Every deck, in any format, ends on the outro.

Colours below are named by role: the primary colour, the accent, ink and the soft tint come from
the studio's palette (`template/kit.css`, written by the app from the studio's brand settings).

---

## Story (the default, v5)

**Use it when** the idea is a story, steps, a lesson or a list. There can be a graphic on the
front card, but a story or steps reads best as plain text after it. The anatomy is fixed, so
every story deck looks the same and simple; the content builder draws it from copy alone.

**The cover** (slide 1, the primary colour with a faint white dot grid):
- A dark chip top left: the episode type or show ("Free coaching session", "Masterclass",
  "Expert guest", or the show's name).
- The hook as three lines read as one sentence: a small line (Libre Franklin 800, white, about
  72px, 20 characters at most), the key words huge in caps (Libre Franklin 900, about 134px, 14
  characters at most) in the accent colour, the deck's one accent moment besides the button, and
  a small line (22 characters at most).
- An episode still in a white-framed window (14px frame, hard ink shadow 18/18, tilted -2deg),
  the speaker mid-gesture on the moment the hook comes from, at its own size or smaller. With no
  still (an idea, or training material), a generated picture of one object or place from the
  topic, never a person.
- A white tilted sticker with ink type and a hard shadow: what the reader gets (45 characters
  at most).
- Footer: the handle and an arrow. Without a still or picture, the headline block centres and
  gets bigger.

**The reading slides** (6 to 8, the soft tint):
- Two or three short blocks, 120 to 220 characters in all: a paragraph (Poppins 58px, slate),
  the slide's one bold line (Poppins SemiBold, ink, usually last), a line someone said in
  quotation marks (Poppins Medium, ink), or numbered steps (numbers in Libre Franklin 800, the
  primary colour, numbering on across slides, 3 at most on a slide).
- Text starts top left (96px margins, 150px from the top) and stays there slide to slide, so
  the eye doesn't jump. Type steps down to 54, 50, 46 or 44px only when a slide needs it.
- Each slide leads to the next. Full sentences, the speakers' own words and figures.
- Footer: the handle (" · with <guest>" when the idea or story is the guest's), "n / N" and a
  small arrow in the primary colour.
- The save pill on the 3rd or 4th slide, once: "Save this for ..." in an ink outline.

**The outro** (the last slide, the primary colour, on every deck in every format): the host's
round photo (or their initial) with their name and "Host of <the show>"; a headline tied to the
topic (60 characters at most, a question is fine); the accent button block with the brand's call
to action (from the brand brief, usually booking a call) / "Link in bio" (ink border, hard ink
shadow); "Save this post for later." and "Follow <the handle> for more <topic> like this."

**What makes it work**
- One graphic, on the cover. Nothing on the reading slides but words.
- Ideas people keep: steps, scripts, plans, the exact words to say.
- 10 slides at most, outro included (the scheduler takes 10 images a post).

**Pitfalls**
- Stacks of fragments. Write sentences.
- Two bold lines on one slide, or none.
- The accent anywhere but the cover's key words and the button.
- Light text on a dark ground for reading slides (it strains the eyes).

**In the content studio** the builder (carousel-engine `scripts/build.mjs`) asks Claude for the
copy only (`story`: chip, cover top/key/bottom/sticker/focus, slides of blocks, save slide and
text, outro headline, the call to action, follow topic, credit) and draws the slides from its
template.

---

## Artifact mockup

**Use it when** the idea is a thing someone sends, writes or sees: an email, a DM, a text, a
LinkedIn post, a landing page, an invoice or proposal, a calendar invite, an ad.

**How the slides go**
1. Cover: the hook, with the artifact on the slide (the email card running off the bottom edge).
2. The artifact in full, with numbered callouts on the parts that make it work.
3. The result, or what people reply with (a phone with a thread).
4. The takeaway, or the host's take.

**What makes it work**
- The artifact looks like the real thing at a glance: sender, avatar, body, a Reply button.
- The words come from the source. If a guest described the email, use their wording.
- One highlighted line (the `.mark` highlighter) on the part that matters.
- Numbered callouts sit on the exact line they explain; the legend below says why each matters.

**Pitfalls**
- Inventing details the source never gave (a subject line, a client name, a figure).
- Copying a real app's branding (the Gmail logo, Instagram's chrome). Keep it a neutral card.
- Text inside the artifact smaller than about 24px on the 1080 canvas.

**Kit:** `.email`, `.email__from`, `.av`, `.email__body`, `.reply`, `.mark`, `.phone`,
`.thread`, `.bubble`, `.browser`, `.num`, `.legend`.

---

## Guest feature

**Use it when** a guest on the host's show said it.

**How the slides go**
1. Cover: the hook with the guest credited (a chip with their photo, or their photo leading).
2. "On the show": the host and guest stills side by side, labelled, plus who the guest is (their
   site in a browser frame if it helps).
3. The idea itself, in another format (the artifact, the steps, the stat).
4. Their best line, quoted over the frame where they said it.
5. The host's take.

**What makes it work**
- Nobody can mistake the advice for the host's: the credit is on every slide.
- Real stills from the episode. The guest looks like themselves, mid-conversation.
- The host's take adds their view; it doesn't restate the guest.

**Pitfalls**
- Upscaled, soft stills. Cut a smaller crop or use the photo smaller.
- The host's take written in AI voice. It's a placeholder until the host rewrites it.
- Forgetting the credit on the inner slides.

**Kit:** `.chip`, `.split`, `.tag`, `.photo`, `.quote`, `.foot`.

---

## Quote over the frame

**Use it when** one line is worth reading in the speaker's own words, usually a result or a
sharp opinion.

**How it goes:** the still from the second they said it fills the top of the slide; the quote
sits below, word for word, with the one key figure or phrase in the primary colour; the
speaker's name and the show underneath.

**What makes it work:** the frame matches the moment (find the timestamp in the transcript).
The quote is short enough to read in one breath; trim to the sentence that carries it.

**Pitfalls:** fixing the speaker's grammar into something they didn't say. Trim, don't rewrite.

**Kit:** `.photo`, `.quote`, `.blue`.

---

## Side-by-side

**Use it when** two versions of the same thing teach the point: the weak email and the strong
one, the old offer and the new one, before and after.

**How it goes:** a statement headline, two columns with plain labels, the better one marked
(highlighter or a label in the primary colour), one line under them on why it matters.

**What makes it work:** the two sides match in shape so the difference jumps out. Labels say
what each one gets, not "bad" and "good".

**Pitfalls:** the headline written as a correction ("it's not X, it's Y"). The guardrails ban
that; let the two columns show the contrast.

**Kit:** `.compare`, `.compare__label`, any artifact part inside each column.

---

## Process

**Use it when** a set of steps leads to a result: a workflow, a sequence, a setup.

**How it goes:** a statement headline on one slide with the steps numbered below, or
one step per slide for a longer process. Each step is one sentence that starts with the action
in bold.

**What makes it work:** steps in the order they happen; the result named at the top.

**Pitfalls:** connector lines between steps (decorative rules are out); more than five steps on
one slide.

**Kit:** `.steps`, `.num`.

---

## Stat

**Use it when** a figure is the point.

**How it goes:** the figure huge (`.display`), one line on what it means, the source in the
footer. Follow with what helps and what hurts (`.dots`), or bars for a comparison (`.bars`).

**What makes it work:** a figure said on the record, with its timestamp in the delivery note.
The dark slide behind an accent figure is the loudest slide in the kit; use it once per deck.

**Pitfalls:** a figure without a source; bars drawn to a made-up scale.

**Kit:** `.display`, `.bars`, `.bar`, `.dots`.

---

## Story or case

**Use it when** it's the host's own story or a named client's result from the brain's proof
docs.

**How it goes:** the moment, what changed, the result, the lesson. The host's photos from
`photo_pick`, or the client's own material with their OK.

**What makes it work:** a specific scene and a specific figure. The lesson stated once, plainly.

**Pitfalls:** composites, invented clients, figures not in the proof docs.

**Kit:** `.photo`, `.h2`, `.lead`, `.quote`.

---

## Editorial list

**Use it when** the content is a list of parallel items ("5 mistakes", "3 questions"), each
worth its own slide. Its anatomy is in `editorial-list.md`. Don't force other content into it:
three bullets per slide on content that isn't a list makes a flat, boring deck.
