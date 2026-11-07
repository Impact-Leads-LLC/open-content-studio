# studio (the plugin)

Free from [Mike Moll](https://www.mikemoll.co/?utm_source=open-content-studio&utm_medium=github) · mikemoll.co ·
Helping service founders get on podcasts and generate revenue.

The content studio as one Claude plugin. Start with **"quick start"** for your first content in about 20 minutes,
then "set up my studio" for the full interview, then "run the studio". The kit's README one folder up covers
requirements and installing.

## Skills

| Skill | What it does |
|---|---|
| `quickstart` | Start here: five questions, a starter studio with good defaults, then a carousel, two posts with graphics and five hooks from one topic, reviewed, on a board. |
| `studio-setup` | The full interview: reads your website, documents and notes first, then asks only what's missing, including tools, keys, preferences and spend. Writes `studio/brand/`, `studio/playbooks/` and `studio/library/`. Re-run it to update. |
| `studio` | The whole run on one video, clip, transcript or library topic: moments, writing, building, review, the board, the calendar, and the say-back loop. |
| `hooks` | Five hooks from a source, five mechanisms, with spoken, written and cover versions. |
| `posts` | Text posts for LinkedIn, Facebook, Threads and others, by awareness level, with the save line and one next step. |
| `captions` | The caption for a reel or carousel, one for every network, with per-network last paragraphs. |
| `carousel` | Story carousels, 10 slides at most, rendered to 1080x1350 PNGs. |
| `post-card` | The graphic that goes out with a text post. |
| `reel` | A reel cut from the video with ffmpeg, captions burned in. |
| `cover` | Reel, Short and story covers at 1080x1920. |
| `humanizer` | The writing gate: the AI-tells loop, then the member's own voice and bans. |
| `coach-review` | The member's coach reviews each piece against `brand/coach.md`. |
| `studio-cleanup` | Marks pieces posted and clears heavy files by the setup rule, always asking first. |

## Playbooks (`templates/playbooks/`, copied into `studio/playbooks/`)

The craft every skill follows, in plain words the member can change: content strategy (the five awareness levels and
the next step for each), design (colours, type, the accent rule, pictures, what makes graphics look AI-made), hooks,
posts, carousels and reels. The member's copies win over the skills, and plugin updates never touch them.

## Scripts (`scripts/`, Node 20+, no npm packages)

| Script | Job |
|---|---|
| `doctor.mjs` | What this computer has, and the one-line install for what's missing. |
| `transcript.mjs` | Any transcript (Riverside, Descript, YouTube, .srt, .vtt, plain text, whisper JSON) to `transcript.json` and `.txt`. |
| `transcribe.mjs` | A video or audio file to a transcript with whisper.cpp, on this computer. |
| `library.mjs` | Import material into the library, rebuild its index, search it. |
| `pieces.mjs` | The episode's state (`pieces.json`): start, list, add, set, approve, drop, posted, review, recent. |
| `mix.mjs` | Applies the per-episode mix to the scouts' and coach's lists and adds the picks. |
| `lint.mjs` | Dashes, banned phrases and patterns, the save line, placeholders, first-line length. |
| `carousel.mjs` | A story carousel from `plan.json`: slides, PNGs, contact sheet, fit check. |
| `card.mjs` | The post card from `card.json`. |
| `cover.mjs` | A 1080x1920 cover from `cover.json`. |
| `reel.mjs` | A reel from a video, a start and an end. |
| `frame.mjs` | One still from a video. |
| `picture.mjs` | Optional: a generated cover picture on fal (objects and places only). |
| `render.mjs` | Any folder of HTML slides to PNGs and a contact sheet. |
| `board.mjs` | The review board, one self-contained HTML page. |
| `calendar.mjs` | The posting calendar CSV (and the scheduler's own template, and `to-post/` folders). |
| `cleanup.mjs` | Clearing by the retention rule; a dry run unless `--apply`. |

## The studio folder

```
studio/
  brand/      brief.md  voice.md  coach.md  banned.md  palette.json  rhythm.json  settings.json  [scheduler-template.csv]
  library/    index.md  <type>-<title>.md ...
  assets/     logo, headshot, photos, fonts/
  episodes/
    2026-11-07-invoice-on-day-one/
      pieces.json            every piece's plan, status, slot and dates
      transcript.json/.txt
      source/                transcripts and notes (and videos, if copy_video is on)
      moments/               candidates.json, verdicts.json, report.json
      pieces/
        r01-<slug>/          reel.mp4 thumb.jpg sheet.jpg cover.png caption.md review.json ...
        c01-<slug>/          plan.json slides/ png/ copy.md caption.md review.json
        p01-<slug>/          post.md card.json card.png review.json
      review/board.html
      calendar.csv           [calendar-<scheduler>.csv]  [to-post/]
```

Words live in each piece's `.md` files (the text above a line of three dashes is what gets posted); `pieces.json`
holds the plan and the status. Piece statuses: `draft`, `ready` (the coach passed it), `approved` (the member said
yes), `scheduled`, `posted`, `dropped`.

`examples/sample-studio` is a complete made-up studio (a cash flow coach for creative studios) with one episode, a
carousel and a post; `examples/previews` shows what its renders and its board look like.

## Fonts and licences

Libre Franklin and Poppins (SIL Open Font License, texts in `assets/fonts/`). The humanizer guide is by Siqi Chen
(MIT, `skills/humanizer/LICENSE`).
