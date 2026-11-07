# Finding the moments: the scouts, the coach and the mix

Two passes, the way a good editor works: scouts read everything and pull every candidate with scores; the coach
re-scores each one against its own excerpt, turns down the weak ones and writes the plan, so every piece can be built
without coming back to ask. Then `mix.mjs` applies the mix rules, the same way every time.

In this file, **the member** is the person whose studio this is (their name is in `brand/brief.md`), and **the coach**
is the reviewer named in `brand/coach.md` ("Coach <first name>").

## Before the scouts start

Load what the pieces are judged against: `brand/brief.md` (offers, the next step, the ideal client in their words, the
idea the market doesn't know yet, the member's own ideas, pillars, proof), `brand/voice.md`, `brand/coach.md` (its
"Rules added" section too), `library/index.md`, and the recent pieces from `pieces.mjs recent`. Read the whole
transcript. For a long episode, read it in parts, but read all of it.

## The scorecard (both passes)

Score each candidate 0 to 10 on five things, judged for the format it's planned as. Score honestly: a solid moment
worth posting scores 6 or 7 on most counts, 8 is strong, 9 or 10 is rare, and under 5 means it shouldn't be made.

- **hook**: it can stop a scroll from its first line. A reel: the first words heard do it on their own (a surprising
  claim, a number with an outcome, a named mistake, a strong opinion); throat-clearing, "so yeah", or a line that needs
  the minute before it scores low. A carousel or a post: the material hands the writer a first line that does it (a
  number, a result, a mistake, the reader's words), even when nobody said it first in those words.
- **smart**: the member comes across as the expert: teaching, reframing, naming the real problem, or drawing the lesson
  out of a guest's story. A reel of the guest talking alone scores 3 at most, and the member only asking a question 2
  at most. A carousel or a post can tell the guest's story, credited, when the member's point about it is in the
  material.
- **ip**: the member's own thinking, as `brief.md` lists it under "My ideas", or another idea of theirs in the library.
  A guest's framework counts only when the member adds their own angle in the moment.
- **icp**: it speaks to the ideal client in their words, names their pain, and leads naturally to one of the offers
  or lead magnets. Judge it for the piece's level: a top-of-funnel piece only has to reach the right person and open
  the idea; the lead to an offer counts more the lower in the funnel it sits.
- **standalone**: it makes sense with no context. A reel starts clean and ends where the point lands. A carousel or a
  post gives the reader something to keep without the episode: steps to follow, a script to copy, a checklist,
  numbers to use, or a story with its lesson.

Points out of 100: hook x2.5, smart x2.5, ip x2, icp x2, standalone x1 (`mix.mjs` does the sum).

## The five awareness levels

Every piece is built for one level of its reader. The levels, what each reader is thinking, what a piece does for
them and what it asks for are in the member's content playbook, `studio/playbooks/content-strategy.md` (read it
before scouting; its "Your changes" win). The ids: `unaware` and `problem` (top of the funnel), `solution` (middle),
`product` and `most` (bottom). For the unaware reader, "The idea my market doesn't know yet" in the brief is the idea
to open.

A product-aware or most-aware piece needs real proof or a real offer from the source or the library (a client result,
an objection the member answers, the call); never invent one. And the playbook's save test decides between two close
moments: the one people would save wins.

## One insight, several angles

Find the core insights first: each is one idea worth teaching (a mechanism, a mistake, a result, a story with a
lesson), named in a short plain phrase of 2 to 6 words. Then turn each strong insight into several angles, each its
own candidate with its own hook and level: the same idea as an unaware story, a problem-aware wake-up, a
solution-aware how-to, a product-aware proof and a most-aware reason to book now, as carousels and posts. Every angle
of one insight carries exactly the same insight phrase, and no two angles of one insight share both a level and a
format.

## Built out from the library

Carousels and posts don't have to stand on the moment alone. For each insight, search the library once
(`node "$S/library.mjs" search studio <the insight's key words>`, plus the connector if one is set) and use what the
member teaches about it: their frameworks, steps, scripts, checklists, client results and the stories they tell. The
moment is the spark and the library gives the substance, so a level the episode is thin on (often product-aware and
most aware) still gets its pieces from what the member teaches on the same insight. List the files a candidate draws
on in `library` (file names as the index shows them, three at most; empty when it needs none). The library's rules: a
private file is for understanding only and never quoted; a guest-stage file (the member on someone else's show) is
for stories and voice, never the teaching itself; every number keeps its owner and its condition.

## The mix (what `mix.mjs` fills)

| Source | Reels | Carousels | Posts |
|---|---|---|---|
| episode (video, 20 min or more) | 5 to 8 | 2 per level (10) | 2 per level (10) |
| clip (shorter video) | 1 to 3 | 1 per level (5) | 1 per level (5) |
| transcript, 20 min or more | none | 2 per level | 2 per level |
| transcript, shorter | none | 1 per level | 1 per level |
| library | none | 1 per level | 1 per level |

`light` in settings halves it (an episode: 3 to 5 reels, one carousel and one post per level). A transcript with no
video gets no reels: a reel needs its footage and its voice.

- **Only reels are held to a score.** The bar is 55. If that leaves fewer than the minimum, kept reels down to 45 fill
  the gap, marked "under the usual bar". Reels take the best moments whatever their level, one per level first where
  the material has it. Never two reels from the same stretch.
- **Carousels and posts have no bar.** They're built out from the library, so the scores only rank them. Every level
  gets its pieces; a level the material can't fill is reported, and that format's other levels fill in with their
  next best.

## Pass 1: the scouts

Two scouts, side by side: one for reels, one for carousels and posts together (so their angles share insights). When
the Agent tool is available, run them as two subagents in parallel and give each this file, the brand file paths, the
transcript path and the list of pieces already made; otherwise do them yourself one after the other, writing each
one's list before starting the next.

**Reel scout** (episodes and clips only). Find the moments that work as reels: the clip itself has to stop a scroll,
teach and land on its own, so be strict; these scores decide which reels are made. Each stretch carries one reel at
most. Return 8 to 12 candidates for an episode, 3 to 6 for a clip. A reel is one moment of 20 to 75 seconds:
`start` is the line time where the hook sentence begins; `end` is the line time where the point lands and the
sentence finishes (the next line's time is a good end). Line times inside a long turn are estimates. `library` is
always empty for a reel.

**Text scout.** Find the insights, then the angles (above), built out from the library. The scores rank carousels and
posts; they don't decide whether one is made. Give at least three carousel and three post candidates for every level
for an episode (two of each for anything smaller), product-aware and most aware included. Return 30 to 40 candidates
for an episode, 15 to 20 otherwise.
- carousel: a story, steps or a lesson told simply, one point per slide (most carousels), or a thing to show (an
  email, a before and after, a number).
- post: one idea told well in writing, usually the member's point with a guest's story as proof, built out with what
  the member teaches.
- `start`: the line time the piece's spark comes from (`00:00` when it comes from the library alone); `end`: empty.

**Each candidate** (write them all to `<ep>/moments/candidates.json` as `{ "candidates": [...] }`, ids 0, 1, 2... in
order): `id`, `kind` (reel, carousel or post), `title` (short and plain), `start` and `end` (mm:ss), `speaker` (who
carries it: the member, the guest's name, or "both"), `quote` (the first sentence heard, word for word from the
transcript; for a piece from the library alone, its key line from the file), `scores` (the five), `why` (one plain
sentence: what it gives the member's audience), `ip_name` (the member's idea it shows, or empty), `icp_pain` (the ideal
client's pain it speaks to, in their words, or empty), `service` (the offer or lead magnet it leads to, or empty),
`insight`, `awareness` (unaware, problem, solution, product or most), and `library`.

Skip anything that repeats a piece already made or turned down; a new angle on one of those insights, for a level it
doesn't have yet, is welcome.

## Pass 2: the coach

The coach judges each format in its own pass (reels, then carousels, then posts), so each is judged as what it is.
When the Agent tool is available, three subagents can do this in parallel, each with this file, `brand/coach.md`, the
brand files and that format's candidates. For every candidate, read its excerpt: from 30 seconds before `start` to
15 seconds after `end` for a reel (or 90 seconds after `start` with no end), and three minutes from `start` for a
carousel or a post, plus the library files it names.

- Re-score the five yourself against the excerpt; don't trust the scout's numbers.
- **Reels:** check the quote is word for word in the excerpt and that `start` and `end` land on clean sentence
  boundaries; correct the times when they don't (20 to 75 seconds). Set `keep` false, with a short `reject` reason,
  when it fails the truth test, needs context to make sense, sits outside the member's lane, or repeats a better
  candidate or a piece already made: the scores decide which reels are made.
- **Carousels and posts:** they're built out from the library, so needing more than the moment gives is never a
  reason to drop one. Set `keep` false only when it fails the truth test (a claim neither the excerpt nor its library
  files support), sits outside the member's lane, or repeats a better candidate or a piece already made. Facts from
  the library count when its files say them, with their owner.
- Another angle of the same insight isn't a repeat when its level and its hook differ.

For each one kept, write the plan:
- `awareness`: the level it's built for (confirm the scout's or correct it from the hook and the angle).
- `insight`: the scout's phrase, sharpened only if unclear; every angle of one insight keeps exactly the same words.
- `title`: short and plain.
- `hook`: the first line, in the member's voice, for the reader at that level, using only facts from the moment and
  its library files: a number, an outcome, the reader's words. No contrast constructions, no em dashes, nothing from
  `banned.md`.
- `cover_line` and `cover_accent` (reels only): the cover words, 3 to 8 words and 40 characters at most, with the one
  loaded word or phrase to mark (the `hooks` skill's cover rules).
- `angle`: the member's point in one sentence, what they want the viewer to believe after. When the member makes no
  point of their own in the moment, write the guest's point credited to the guest and set `needs_take` true.
- `cta`: a lead magnet's keyword from `settings.json` when one fits the moment; otherwise "EPISODE" (the full episode,
  when it's published) or "CALL" (the member's call, for product-aware and most-aware pieces, or when there's no
  episode to point to). `mix.mjs` settles it by the same rule.
- `design`: one to three notes for the reel cut (where the hook sentence starts, a line to put on screen, which camera
  to use) or the carousel (a format: story, the default, or a thing to show), each naming the exact line and its time.
  Empty for posts.
- `outline`: carousels only, 7 to 10 lines, one per slide, 10 at most: "Slide n, <format>: what's on it". Story (the
  default): slide 1 the cover (the hook), then one plain point per slide that leads to the next, in the speakers' own
  words and figures and what the member teaches in the library files, then the outro. A guest's idea is credited, and
  a slide with the member's take only from what the member says.
- `verdict`: one or two plain sentences the member would say about why it's worth making.

Write every candidate's verdict, kept or not, to `<ep>/moments/verdicts.json` as
`{ "verdicts": [ { "id", "keep", "reject", "kind", "title", "start", "end", "scores", "hook", "cover_line",
"cover_accent", "angle", "needs_take", "cta", "design", "outline", "verdict", "insight", "awareness" } ] }`.

## Then

`node "$S/mix.mjs" <ep>` and report what it printed: what was added, the levels short and why, the reels under the
bar, and what was turned down (the top reasons from `moments/report.json`).
