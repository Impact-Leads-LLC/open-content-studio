---
name: hook-maker
description: "Writes five hooks from a transcript, post or draft, each a different mechanism traced to a source line: spoken open, written first line, a cover line (3-8 words, 40 characters max) and, for long-form YouTube, thumbnail fields from the episode's biggest takeaway (look, support, hero, sticker, mark). Voice and banned phrases load from the brain; every set passes the gate. Ends with the hand-off block the cover and thumbnail builders read. Use for /hooks, write hooks, hook this transcript."
metadata:
  version: "1.5"
---

# Hook Maker

Five hooks from one piece of content. Each one a different way in. Each one traceable to a
sentence the content pays off. Each one in the brand's own voice, or it doesn't ship.

**The governing rule: extract before you write.** The best hook is usually already sitting in
the source as a line the speaker said, a figure they quoted, or a belief they took apart. The
skeletons in Appendix A are a fallback for when the raw material doesn't hand you a better
opener on its own. A hook that could open a post on any topic is a failed hook.

**This file is craft only.** It carries no brand voice, no audience and no banned-word list of
its own. Those load from the studio's brain at runtime (Step 2). Where the brain and this file
differ, the brain wins.

---

## Step 1: Intake

Accept any of: a pasted transcript, an uploaded transcript file (.txt, .md, .docx, .srt, .vtt),
a blog post, a draft post, or a page already fetched. Read the whole thing. If it is an uploaded
file, open it with the Read tool; never work from a filename.

Settle these without asking, unless the answer is missing and matters:

- **Brand.** The studio's own brand, as its Brand Brief describes it. One brand per hook set.
- **Format of the source.** Spoken (podcast, video, workshop) or written (blog, newsletter,
  post). Spoken sources carry quotable lines and asides; written ones carry cleaner claims. Both
  feed the same protocol.
- **Destination.** Default is all three formats in Step 5: spoken open, written first line and
  cover line. If one platform is named (a Reel, a TikTok, a LinkedIn post, a carousel, a Short),
  tune the length bands to it and still deliver all three. A long-form YouTube video (or the
  thumbnail builder) adds a fourth: the thumbnail fields (look, support line, hero, sticker, mark,
  hook type), written from the episode's biggest takeaway (Step 3, slot 10).
- **Video title.** For YouTube, note the title if one is given. The thumbnail words must add to it,
  never repeat it.
- **Pillar.** Which of the brand's content pillars (loaded in Step 2) the piece sits in. One
  pillar per set. If the source straddles two, pick the one the content spends the most words
  on and say so.

If the source is under roughly 150 words, say it is too thin to pull five different angles from
and ask for the full transcript or post before continuing.

## Step 2: Load the brand from the brain

Use the studio's brain tools. Start with `get_brand_brief` (the Brand Brief), then
`brain_search` for "content pillars strongest hooks" and "published posts examples", and
`brain_get_document` for the documents named below.

Pull these out and keep them in view for the whole run:

| Need | Usually lives in |
|---|---|
| Voice rules and reading level | `Voice` |
| Banned words, phrases and constructions | `Voice Guardrails` (its latest dated additions win) |
| AI-writing tells to audit for | `Avoid AI Writing` |
| Retired and never-use words | the brand's voice and story doc (retired lists by date) |
| The reader, stated precisely | the positioning and ideal-client docs |
| What to lead with, and what never to lead with | the core message doc |
| Content pillars | the content strategy / pillars doc |
| Shipped hooks and posts (the bar to beat, and the cadence) | the pillars doc and any published-post collection |
| Named-client figures, attributed | the testimonials / proof docs |

If one of these is missing for the brand, name it in one line and carry on with what is there.

If the brain can't be reached, say so in one line and ask whether to wait or to write a
craft-only draft. A craft-only draft carries `not brand-checked` on its first line and never
ships as-is.

Then read Appendix A for the mechanisms, the skeletons that survived the bank audit, and the
banned templates.

## Step 3: Extract the raw material

Before writing a single hook, pull the following from the source and write it down as a short
list. This list is the only thing hooks are built from. If a slot is empty, leave it empty; do
not invent.

1. **The one idea.** What the piece proves, in one plain sentence. If it takes two sentences,
   the piece has two ideas; serve the one the content spends the most time on.
2. **The most surprising claim.** The line a reader would stop on. Quote it.
3. **Every specific.** Dollar figures, percentages, durations, dates, place names, client names,
   product names, quoted lines from calls. Verbatim, with the sentence each came from.
4. **The wrong belief.** Can you write "most [role] think A; this piece shows B" using only the
   source text? Write it. If you can't, there is no contrast hook in this content. Say so and
   move on.
5. **The admitted cost or mistake.** Anything the speaker or a client paid for: money, time, a
   lost deal, a bad year. With the figure if there is one.
6. **The story.** Any narrative with a beginning and an outcome. Note the moment it starts
   (time, place, first line).
7. **The quotable line.** One or two sentences already in the source that would work as an
   opener untouched.
8. **The reader.** Who this piece is for, as precisely as the source allows ("an agency owner
   who just quoted a retainer and wished they'd said more", not "business owners").
9. **What the piece pays off.** The resolution the content delivers. Hooks may promise this and
   nothing more.
10. **The biggest takeaway** (long-form YouTube). The best advice in the piece: the thing the speaker
    spent the most words teaching, the one a viewer would come away using. Quote its lines and note
    where it starts. A side tactic or a fun aside is never the takeaway, however good its number is:
    a memorable number about a side trick gets its own short video, and the takeaway is the method the
    episode spends its time on. The thumbnail fields come from this slot only.

Show this list only if asked. It travels with the output as the source lines under each hook.

## Step 4: Write five hooks, five mechanisms

Five hooks means five angles. Five phrasings of one angle is padding and gets rejected.

Every set fills these five slots, in this order of preference. Each slot names its mechanism
from Appendix A.

1. **The flat claim.** The one idea or the surprising claim, stated plainly with no hedge. Often
   the most human option. Always included.
2. **The wrong belief.** Slot 4 from the extraction, written as belief-then-evidence, never
   negate-then-reframe. Allowed: "Most agency owners think a bigger retainer needs a bigger
   team. Their best client last year paid double for half the deliverables." Banned: "It's not
   about the team, it's about the outcome." If the extraction found no wrong belief, use the
   objection-first mechanism or a second specific.
3. **The specific.** A figure, a place, a date, a named object or a scene, first. "$4,000 for a
   two-page report, and the client renewed before the call ended." A fact the source leaves out
   but the brain's brand docs hold may be added only if it comes from the brain, and it gets
   flagged in the delivery as imported.
4. **The reader or the cost.** Either a precise callout ("If you've sent a quote and wished you'd
   said more the second it left your outbox") or the cost before any benefit ("Saying yes to
   every scope change cost me a year of weekends"). Pick whichever the source supports better.
5. **The story or the quote.** Start inside the moment, or open with the verbatim line from slot
   7 and one line of context. Third-party framing ("A client told me…") counts here. This is the
   one slot where the speaker's own line is used untouched even if it carries a construction the
   sweep would otherwise ban, because it's their line and they decide. Label it `verbatim` and
   name the construction so it can be vetoed. Never write a new one.

Rules that apply to every hook:

- One idea per hook. Two ideas halve both.
- Topic clear in the first beat; withhold only the resolution.
- A concrete noun in the first five words wherever the mechanism allows it. Slots 1, 3 and 5
  should carry one; the belief and callout slots open on the role or on "you" by design and are
  exempt.
- No hook promises anything beyond slot 9 of the extraction.
- No more than two of the five share an opening word. If three do, rewrite one.
- When the source says "most people", sharpen the role to the reader from slot 8 ("most
  consultants", "most clinic owners") so the belief hook selects someone. Don't sharpen beyond
  what the source supports.
- The speaker's phrasing wins. Where the transcript has a line that does the job, use it over
  anything you'd write. A verbatim line may run past the length bands by a few words; cut a word
  of yours before a word of theirs.

## Step 5: Format each hook for every destination

For each of the five, deliver:

- **Spoken open.** First beat (the first sentence, or the first clause when the sentence has a
  comma) 6 to 12 words. Whole hook under 25 words, said in one breath. Reading level from the
  brand's voice doc, and never above sixth grade. No subordinate clauses. If it can't be said
  aloud naturally, it fails. This is the first line of the video or the podcast cold open.
- **Written first line.** Under 140 characters so it clears the LinkedIn mobile fold and the
  Instagram caption fold (Instagram cuts at about 125, so aim there when Instagram is named). No
  blank line inside it. For X, under 280. Same idea as the spoken open; the wording may differ
  to fit.
- **Cover line.** The text that sits on the reel, TikTok, Short or story cover, and on the first
  frame when there is no designed cover. Rules:
  - 3 to 8 words, 40 characters or fewer, so it sets on two or three lines and still reads at
    profile-grid thumbnail size.
  - It tells a stranger what they will learn or get from this video. The cover's other line (the
    channel's follow line) says what they get by following, so the cover line covers this video
    only.
  - It has to make sense to a stranger scrolling a profile grid with no audio, no caption and no
    context. A line that only works with the video playing ("Wait for the end", "This changed
    everything") fails.
  - Same idea as the hook it belongs to, compressed. Never a new angle.
  - Carries the topic in a concrete noun: a figure, an object, a role, a place.
  - One phrase or one short sentence. Never two fragments in a row ("Three years. One fix."
    fails).
  - Sentence case. No end period, no hashtags, no emoji, no handle. A question mark only on an
    allowed question hook (Appendix A).
  - Mark exactly one **accent**: the single word or short phrase that is the most loaded or
    surprising in the line, copied exactly as it appears in the cover line. The cover builder
    marks it (an accent bar, or accent type on the label). Never accent a filler word, and never pick an
    accent that only makes sense split across two lines.
  - The hook is never cut to fit: the hook is whatever the hook is, and the layout makes space.
    The cover builder sets up to 3 lines at cap 96, or up to 4 at cap 80. A line
    that still won't fit comes back to you as a copy-fit reject.
  - Optional **cover breaks**: when the line has a phrase-true break, write it with `/` between
    lines (`Your pitch is / too long`). Keep the accent whole on one line, ideally starting it. The
    builder checks the widths and falls back to its own break when yours doesn't fit.
  - No two cover lines in one set open on the same word.
- **Thumbnail fields** (long-form YouTube only). The words on the video's thumbnail, as structured
  fields the thumbnail builder renders, from the biggest takeaway (slot 10) only. Rules:
  - **Look**: `call`, `wall` or `board` (thumbnail-builder). The app rotates the looks; write
    the fields for the look you'd run and say which other look the same words could play.
    - `call` (a guest episode): the **support** line names the problem the guest's frame shows
      (`HUNG UP`, `WARM UP`), on a tag; the **hero** is the fix, one word of 5 letters or fewer;
      one `loop` on the hero; no sticker. Add `guest_at`: the time
      (seconds) of the guest's line or gesture the hook comes from, for the guest frame.
    - `wall`: the **hero** is a number of 1 to 5 characters (`0-9`, `%`, `+`, `X`; a round figure
      from the speaker is flagged `rounded-figure`); the **support** is one or two words in front of
      it (7 letters or so); the optional **sticker** is the payoff in two words at most (`THEN
      CALL`). No mark.
    - `board`: the **hero** (a number, or one short word) and the **support** line sit on the board,
      in `order`; the optional **sticker** is the payoff on an accent tag. No mark.
  - All caps. Support two words at most, hero one word, sticker two words at most, five words in all.
    Budgets are planning numbers; the renderer measures the real ink.
  - **Order**: `support-first` (support above the hero), or `hero-first` when a number leads
    (`80%` over `FOLLOW-UP`).
  - There is no coloured word. On the call the emphasis is one hand-drawn **mark**: `loop` around
    the hero. On the wall and the board the accent sticker or tag is the emphasis, and there is no
    mark. One hot colour per thumbnail: never a loop and a sticker together.
  - **Hook type**, from the expression the words need: `skeptic`, `verdict`, `warning`,
    `number`, `secret`, `smirk` or `how`, and only a type the run says is playable. The builder
    picks one of the owner's own photos that plays that type. When the hook needs an expression no
    photo has (a wince, a palm out, pointing, confusion, relief), reroute it to a playable type or
    hold it until the owner adds a photo.
  - It adds to the title instead of repeating it. The title says what the video covers; the
    thumbnail adds the charge: the stake, the warning, the result, the regret, the contradiction.
    If the title is known and the thumbnail repeats a content word from it, rewrite.
  - Same idea as the hook it belongs to, compressed to its most loaded words. Never a new angle.
  - Carries a concrete noun or a number where it can.
  - Punctuation: an apostrophe, a question mark (allowed question hooks only), `%` and a hyphen.
    Nothing else: no commas, no em or en dashes, no `$` (write the figure another way, or let the
    sticker carry it in words). No contrast lines.
  - When the thumbnail builder sends a line back (`{element, text, measured_px, limit_px,
    overflow_px, letters_to_cut}`), rewrite that line from its source shorter by at least
    `letters_to_cut` letters and run the delivery gate on the new words. Two rounds; then show
    the owner the best version and the overflow. Never ask the builder to shrink the type.
- **Rehook (optional).** One second line that adds curiosity after the first line's clarity.
  Offered, never folded into the first line.
- **Mechanism.** The label from Appendix A.
- **Source lines.** The sentence or sentences from the source this hook traces to, and the
  sentence that pays it off.

Platform notes, when one is named: a Reel, TikTok or Short wants the spoken open plus the cover
line; a story wants the cover line on frame one; a LinkedIn post wants the written first line
with the rehook as line two; a carousel wants the written line, or the cover line if it reads
better large, as slide one; a long-form YouTube video wants the spoken open plus the thumbnail
fields. A YouTube title is not a hook and is out of scope.

## Step 6: The delivery gate

Hooks go through the same filters as every other piece of brand content, in the same order, and
no set is finished until every hook and every cover line has passed all of them. This step is a
gate, not a polish. A set delivered without it is a process failure.

1. **Humanizer loop.** Run the `humanizer` skill's loop on the whole set: rewrite, then ask
   "what in this still reads as AI?", then a final rewrite. Where the humanizer's own advice
   conflicts with the brand's guardrails (it likes punchy fragments and words like
   "genuinely"), the guardrails win. The loop's intermediate output stays internal; only the
   final set is shown. A `verbatim` line in slot 5 is exempt from the rewrite.
2. **Guardrail sweep.** Check every spoken open, written line, cover line and rehook against
   each doc loaded in Step 2: the voice guardrails doc (every dated addition), the AI-writing
   audit doc, the brand voice doc, and the brand's retired and never-use word lists. Every
   banned word, phrase and construction, in any form, including softened and structural
   variants. Then check against the banned templates in Appendix A. Any hit gets rewritten from
   the source line, not patched, and the rewrite goes back through this sweep. The sweep runs
   after the humanizer so it catches anything the humanizer put in.
3. **Voice test.** Does each hook sound like the speaker talking to a peer they respect, from
   having done the thing themselves? A hook that follows a skeleton and reads as generic social
   copy is a failed draft. Rewrite from the one-sentence core.
4. **Truth check.** Re-read each hook against the source. Does it promise what the content never
   delivers, exaggerate, or distort? Does it carry a client figure that isn't in the source or
   the brain's proof docs? If yes to any, discard the hook and fill the slot again.
5. **First-line test.** If a reader saw this line and nothing else, would they care enough to
   keep going? If not, it isn't a hook yet.
6. **Cover test.** Read only the cover lines, as five thumbnails in a row on a profile grid. Does
   each one tell a stranger what the video is about and give them a reason to tap? Does the
   accent land on the word that carries the charge? If a cover line needs the video to make
   sense, rewrite it. For YouTube, run the same test on the thumbnail words (support + hero), read
   beside the title: does each add something the title doesn't say, and does it read in under a
   second?

A hook that can't pass every filter after a rewrite from its source line is dropped. Deliver
four, or three, and say in one line which slot was dropped and which filter it failed. Never ship
a hook that failed a filter to make the count.

## Step 7: Deliver

Lead with one line naming the brand, the pillar, the reader and the one idea, and one line
stating what the piece pays off, so the ceiling every hook was held to is visible. Then the five
hooks, then one or two sentences on which one you'd run first and why (no ranking of all five).

```
Brand: [brand] · Pillar: [pillar] · Reader: [slot 8] · One idea: [one sentence]
Pays off: [slot 9, one sentence]

1. [Mechanism]
Spoken: [hook]
Written: [hook] ([n] chars)
Cover: [cover line] · accent: [accent]
Thumbnail: [look] · [SUPPORT] / [HERO] / [STICKER] · mark: [loop on hero | none] · type: [hook type] · also plays: [other look]   (YouTube only)
Rehook: [optional second line]
Source: "[source line]" → pays off with "[source line]"

2. ...
```

Flag any rounded figure so the exact one can be swapped in, any fact imported from the brain
that the source did not contain, and any `verbatim` line carrying a construction the sweep would
otherwise ban. If the extraction had an empty slot and you substituted a mechanism, say which
slot and why, in one line.

Close with the hand-off block. Downstream skills (the cover builder, carousel, post writers)
read this block, never the prose above it, so it must match the prose exactly.

```yaml
hook_set:
  version: 3                 # 3 adds thumb.look, thumb.sticker, thumb.guest_at; every v2 field is unchanged
  brand: "<the studio's brand>"
  source: "<file name or title>"
  pillar: "<pillar>"
  reader: "<slot 8>"
  one_idea: "<one sentence>"
  pays_off: "<slot 9>"
  recommended: 2             # n of the hook you'd run first
  hooks:
    - n: 1
      mechanism: "A. Plain declarative claim"
      spoken: "<spoken open>"
      written: "<written first line>"
      cover: "<cover line>"                  # 3-8 words, <= 40 characters, never cut
      cover_accent: "<exact substring of cover>"   # never split across the line break
      cover_breaks: "<line one / line two>"  # optional; the builder validates widths
      thumb:                                 # long-form YouTube only, else null; from the biggest takeaway
        look: "call"                         # call | wall | board
        support: "<SUPPORT>"                 # call: the tag; wall: the word in front; board: a line; or null
        hero: "<HERO>"                       # one word, <= 5 letters; on the wall a 1-5 character number
        sticker: null                        # wall and board: the payoff, <= 2 words; call: always null
        order: "support-first"               # or "hero-first" when a number leads
        mark: {kind: "loop", target: "hero"} # call: loop on the hero or null; wall and board: null
        guest_at: 257.6                      # call only: seconds of the guest's line or gesture, else null
        also_plays: ["board"]                # other looks the same words fit, for a look test
        hook_type: "verdict"                 # skeptic | verdict | warning | number | secret | smirk | how
      rehook: "<second line or null>"
      source_line: "<source sentence>"
      payoff_line: "<source sentence that pays it off>"
      flags: []              # any of: verbatim, imported-fact, rounded-figure, substituted-slot
```

Older readers keep working: a v3 block carries every v2 field with the same meaning, and the new keys
are additions (a v2 reader ignores them).

This skill writes nothing to the brain. Whichever step ships the finished piece records it, with
the chosen hook.

---

## Hard rules

1. Extract first. No hook without a source line under it.
2. Five hooks, five mechanisms. Never five phrasings of one angle.
3. Voice, audience, pillars and banned language come from the brain. This file never stands in
   for them.
4. Zero banned words, phrases or constructions from the brand's guardrails in anything you write.
   The only exception is the speaker's own `verbatim` line in slot 5, labeled so it can be
   vetoed.
5. No question openers unless the reader is already asking that exact question and can't answer
   it in a word.
6. No hook promises more than the content delivers.
7. No client figure that isn't in the source or the brain's proof docs, attributed.
8. Every hook ships with a cover line of 3 to 8 words (40 characters at most, never cut to fit)
   and exactly one accent, and for YouTube the thumbnail fields from the episode's biggest
   takeaway: a look, a support line and a one-word hero in caps, an optional sticker on the wall
   and the board, one loop on the call or none, and a playable hook type. No commas, no em dashes,
   no coloured word on a thumbnail.
9. The full delivery gate in Step 6 runs on every set before it is shown. A hook that fails a
   filter is dropped, never shipped to make the count.
10. A hook that could open a post on any topic is a failed hook.
11. The speaker's own line beats yours. If the source has it, use it.

---

## Appendix A: Hook mechanisms, skeletons and the bank audit

Read this before writing hooks. It has three parts: (1) what a hook has to do and why, (2) the
mechanisms and the skeletons worth keeping, (3) the audit of the 80-hook Instagram bank this
skill was built from, so you know what to avoid and why.

### 1. What a hook does

A hook is the decision point. On short video the viewer decides to stay or swipe in one to three
seconds. TikTok's own creative guidance reports that most top-performing videos put the key
message inside the first three seconds. Meta's creative data says the first three seconds carry
close to half of a video's total value. On LinkedIn the equivalent is the fold: roughly 140
characters on mobile before "see more", and LinkedIn ranks on dwell time, so the visible lines
are the entire pitch. Instagram shows about 125 characters before "more". X shows 280. On a
profile grid, the cover line is the whole pitch, read at thumbnail size with no sound.

The hook is a door, never a summary. A summary answers the reader's question and gives them
permission to leave. A door names the room and makes them want to walk in. Kallaway's version:
the hook must deliver topic clarity and on-target curiosity at the same time. Kevin Duncan's
test: if someone read only the first line and nothing else, would they care enough to keep going?

Curiosity has a precondition (Loewenstein's information-gap theory): the reader has to know
enough to know what they don't know. Vague hooks produce no gap. A hook that names the domain
precisely and withholds only the resolution produces a strong one. This is why "this small
change transformed my results" fails and "the one line I cut from every proposal" works.

The hook is also a debt. Hormozi's Hook, Retain, Reward: the reward step means the body fully
answers what the hook opened. Facebook's watchbait policy penalizes posts that withhold key
information to create a curiosity gap the content never fills. Curiosity gaps are allowed;
unpaid ones are bait. Every hook this skill writes must trace to a sentence in the source and be
paid off by it.

Kallaway's four hook failures, which double as a checklist: delay (topic not clear within one to
two seconds), confusion (language above sixth-grade level), irrelevance (no "you", no reader in
it), disinterest (no contrast, nothing surprising).

### 2. Mechanisms and the skeletons worth keeping

Each mechanism has the psychology in one line, then the skeletons that survived the bank audit.
Skeletons are fill-in shapes. The blank must be filled with something concrete from the source:
a figure, a name, a place, a quoted line, a scene. A skeleton filled with "this" or "the secret"
is a failed hook.

#### A. Plain declarative claim
The reader is handed a specific, unhedged statement from the content. In 2026 this often beats
the open loop because readers have learned to distrust a withheld "this". The most human-sounding
option and the safest against template detection.
- `[Specific claim from the source, stated flat].`
- `[Figure or outcome]. [What produced it, in five words or fewer].`

#### B. Contrast / wrong belief
Names a belief the reader likely holds, then shows it costing them. Kallaway calls this the
engine of curiosity: the distance between what the viewer believes and what the content shows.
Only available when you can write "most [role] think A; this piece shows B" from the source
text. If you can't, there is no contrarian hook in this content; don't manufacture one.
- `Most [role] think [exact belief]. [One-line evidence from the source that it's wrong].`
- `[Role] keep [doing X] because they believe [Y]. [What the source shows instead].`
- The belief must be stated in the reader's own words, precisely. "Most people get pricing
  wrong" is not a belief. "Most consultants price off what they earned at their last job" is.

#### C. Specific figure, scene or moment
Concrete nouns, dollar figures, dates and places signal an event that happened rather than a category.
This is the main signal separating human hooks from templated ones, because a template can't
produce a specific without a source.
- `[Place / date / dollar figure / named object], [what happened].`
- `[N] [things] that [outcome], from [where they came from].`
- `[Duration] of [doing X], and [the one thing it showed].`

#### D. Direct callout
Self-identification. A reader who sees their own state in the first five words feels addressed
and stops. Skip it when the content is a story rather than advice. The state named must be
precise; "if you're a business owner" selects nobody.
- `If you [exact situation from the source], [what the source has for them].`
- `If you're [role] and [specific symptom], [the source's claim].`

#### E. Cost, stakes or warning
Loss aversion: a loss lands harder than an equivalent gain. The strongest form names the specific
loss and the specific person losing it, before any benefit is mentioned.
- `[This mistake] cost [me / a client] [exact figure or consequence].`
- `The [named error] [role] make in [area], and what it costs them.`
- `[Role] lose [specific thing] every time they [specific action].`

#### F. Mistake or regret
The speaker has paid a tax the reader can skip. A durable mechanism; the exact phrasing "I wish
someone had told me" is exhausted. The thing not known must be named in the hook.
- `I [specific wrong action] for [duration] before [what changed].`
- `The advice I ignored: [the advice, stated]. [What it cost].`

#### G. Story in progress
An incomplete narrative demands closure. The bank's versions ("the day I almost quit") summarize
the story instead of starting it. Start inside the moment: a date, a place, a line someone said.
- `[Time and place]. [The first thing that happened].`
- `A [role] told me [quoted line]. [What it revealed].`
- `[Named person or client] did [specific thing]. [The outcome, withheld or stated].`

#### H. Third-party or quote-first
Removes the self-promotion smell, imports an outside voice, and gives a quotable line for free.
Missing from the bank entirely. Often the best hook already exists as a sentence in the
transcript.
- `"[Verbatim line from the content]."` followed by one line of context.
- `A client asked me [question]. [The short answer, or the setup].`

#### I. Objection-first
Opens with the reader's likely pushback, which respects the reader rather than diagnosing them.
- `You'll say [objection]. [Response from the source].`

#### J. Process reveal with a cost removed
The "how I / how to" authority claim. The weakest attention mechanism (earns saves, rarely stops
a scroll), but valid when the source is procedural and the cost removed is specific.
- `How [I / role] [verb] [topic] without [specific cost].`
- `How [I / role] [verb] [topic] in [specific timeframe].`

#### K. Artifact
A named, copyable object (checklist, script, setup, formula) signals bounded, replicable value.
Triggers saves.
- `The [checklist / script / question] I use before every [situation].`

#### L. Comparison or test
"I tried X, Y and Z" is one of the most durable short-video formats and appeared once in the
bank. Valid only when the source contains a comparison.
- `I tried [N] [things] for [topic]. [Which one held up].`

#### M. Diagnosis plus cure
Names a failure the reader is feeling and promises the remedy in the same breath. The blank must
be a named failure.
- `Why your [specific thing] [specific failure], and the fix.`

#### Question hooks
Allowed only when the question is one the reader is already asking themselves and cannot answer
in a word. Yes/no questions and questions that could open any post ("Are you struggling with…?")
are banned. Rhetorical-question openers when the answer is known are banned.

### 3. The bank audit

The source bank (80 hooks, four lists: Instant Hooks, Tips/Tools/Hacks, Beginners/How-To,
Storytelling/Mindset) was analyzed for mechanism and for template smell. What the counts showed:
over a third of the bank is a "how I / how to" authority claim, the weakest attention mechanism;
the curiosity-gap hooks almost never name what they withhold ("this", "the secret", "the
lesson"); every hook is first person with no third party, client or quoted source; intensifiers
("completely", "instantly", "overnight", "everything", "once and for all") stand in where a noun
is missing; and the comparison/test format appears once.

#### Kept (mechanism durable, skeleton neutral enough to survive)
Process reveal with a specific cost tail. The artifact. The counted list (keep the count, cut the
adjectives). The pothole warning (strip "keeps most people stuck"). The callout, when the state
is precise. Diagnosis plus cure, when the failure is named. The "I used to think X" belief
reversal, rebuilt without contrast grammar. The comparison/test. The duration story ("every day
for 30 days" was the only concrete figure in the Storytelling list).

#### Keep only if rewritten concrete
The unnamed lever ("this small change changed everything"): name the lever or drop it. Regret
("I wish I'd known this"): state the thing. The unresolved story ("the day I almost quit"):
anchor on the day, the place, the line. Any hook carrying "underrated", "lazy", "easiest",
"swear by", "actually sticks", "using this method", "once and for all", "like a professional":
cut the tail. Any hook whose subject is an abstract noun (burnout, confidence, purpose, giving
up): swap for a concrete situation.

#### Banned outright (recognizable AI or guru templates in 2026)
- "Everyone told me this wouldn't work… until it did."
- "This is the truth no one tells you about ___."
- "Everyone complicates ___ too much. This is the real secret."
- "No one told me ___ was going to be this difficult."
- "No one talks about how ___ can feel."
- "Stop overcomplicating ___. Here you have a simple approach."
- "I used to think ___ was selfish. Now I see it as self-care."
- "This mindset shift changed everything in ___."
- "This is what real progress in ___ actually looks like."
- "How I found my purpose through ___."
- "I thought ___ would make me happy. I was wrong."
- Any line ending in "changed everything", "transformed my results", "once and for all", "like a
  professional", "overnight" or "instantly".
- Any "Here's how / Here's what", "The result?", "Stop doing X", "The key is" opener. A 2026
  analysis of ~46,000 LinkedIn posts (MagicPost, within-author comparison, directional) found
  each of these carries a measurable reach penalty; candor and specificity were reach-positive.
- Throat-clearing of any kind ("I wanted to share", "quick thought", "so here's the thing").
- Direct-address gimmicks ("Houston, we have a solution").
- Cover lines that only work with the video playing ("Wait for it", "Watch till the end",
  "You won't believe this").

#### Why the bank fails as a source
It supplies frames a writer reaches for before reading the content. Every strong hook takes its
charge from something inside the piece: a line, a figure, a name, a cost, a scene. This skill
reverses the bank's order: extract the concrete material first, then choose a skeleton only if
the raw material doesn't already make a better opener on its own.

### Sources consulted
Kallaway hook framework and the four failure modes (wayfindknow.substack.com/p/irresistible-hook);
Hormozi, $100M Leads, Hook/Retain/Reward; Justin Welsh, PAIPS; Cole and Bush, Ship 30 headline
and opener rules; Loewenstein, information-gap theory (CMU); Kahneman and Tversky, loss aversion;
TikTok auction ads creative tips; Meta video creative data (via yansmedia); LinkedIn dwell-time
ranking (growtempo); LinkedIn see-more cutoff (postformatter); Facebook watchbait and clickbait
policy (jonloomer, TechCrunch); MagicPost 46K-post AI-pattern analysis; Jasmin Alić on the
rehook.
