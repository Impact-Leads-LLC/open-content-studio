---
name: studio
description: "Runs the content studio on one episode video, clip, transcript or topic from the member's library: transcribes if needed, finds the moments (reels scored and held to a bar; two carousels and two posts per awareness level per episode, built out from the library), writes every post and caption, builds the carousels, post cards, covers and reels, reviews each piece against the member's coach standard, shows one review board, and writes the posting calendar. Use for: run the studio, make content from this episode, turn this video into posts, find more moments, approve, change or drop a piece."
---

# The studio

One source in, a week or two of content out, each piece reviewed before the member sees it. This skill runs the
whole flow and calls the craft skills for each format. The member's brand files are the authority on everything
about the brand; this skill is the process.

**Scripts.** `S="<this skill's base directory>/../../scripts"` (Claude shows the base directory when the skill loads).
Every script prints what it did; read its output before moving on. **The studio folder** is the folder holding
`brand/` and `library/`, usually `<working folder>/studio`. Episodes go in `studio/episodes/<YYYY-MM-DD>-<slug>/`.

## Before anything

1. Find the studio folder. No `studio/brand/settings.json`? Run the `studio-setup` skill first.
2. Run `node "$S/doctor.mjs" --studio studio`. Missing ffmpeg means no reels; a missing browser means no slides or
   cards; missing whisper.cpp means bring a transcript. In Cowork, read `references/environments.md` first: video work
   belongs in the Code tab.
3. Read the brand, whole, every run: `brand/brief.md`, `brand/voice.md`, `brand/coach.md`, `brand/banned.md`,
   `brand/settings.json`, `brand/rhythm.json`, and `library/index.md`. If `settings.library.connector` names a
   connector and its tools are in this session, it's a second place to search. Then the member's playbooks in
   `studio/playbooks/` (the craft: content strategy, design, hooks, posts, carousels, reels). A studio set up before
   playbooks existed has none: copy the plugin's `templates/playbooks/` into `studio/playbooks/` and say so in one
   line.
4. `node "$S/pieces.mjs" recent studio --days 60`: what went out lately, so nothing repeats an angle.

## Step 1: intake

Work out what came in and make the episode folder.

- **source** is `episode` (a video 20 minutes or longer), `clip` (a shorter video of the member talking),
  `transcript` (text with no video: a transcript, notes, a voice memo's text), or `library` (no source at all: "make
  content from my library about pricing").
- Ask only what the material can't tell you, in one message: the episode title; a guest's name (and how to credit
  them); whether the full episode is published and where (it sets the "full episode" next step); for several camera
  files (Riverside gives one per person), which file is whose.
- `node "$S/pieces.mjs" init <ep> --title "..." --source <source> [--video a.mp4,b.mp4] [--guest "..."] [--show "..."] [--link URL] [--minutes N]`.
- Videos stay where they are unless `settings.retention.copy_video` is true (then copy them into `<ep>/source/`).
  Transcripts and notes are copied into `<ep>/source/`.

## Step 2: the transcript

- A transcript came with it (Riverside, Descript, YouTube, Zoom, .srt, .vtt, .txt, whisper JSON):
  `node "$S/transcript.mjs" <file> --out <ep> [--speakers "Speaker 1=Dana Lee"]`.
  A Word file: convert it to text first (Mac: `textutil -convert txt <file>`), or read it and save a .txt.
- Only a video or audio file: `node "$S/transcribe.mjs" <media> --out <ep> [--lang en]` (whisper.cpp, on this
  computer; an hour takes a few minutes on a recent laptop). No whisper.cpp: ask for the platform's transcript.
- Name the speakers. whisper doesn't know who is talking; read the content and fix the `who` of each line in
  `transcript.json` (and `transcript.txt`) when it's clear. Leave "?" where it isn't: the right-person check needs it.
- `library` source: search the library for the topic (`node "$S/library.mjs" search studio <words>`), read the best
  files, and write `<ep>/source/notes.md` with what the member teaches on it, each part marked with its file. That is
  the "transcript" the next step reads (run `transcript.mjs` on it).

## Step 3: find the moments

Follow `references/moments.md` exactly. In short: two scouts (reels; carousels and posts) read the whole transcript
and the brand, the coach judges each format against its excerpt, and `mix.mjs` fills the board by the rules.

1. Scouts write `<ep>/moments/candidates.json`; the coach writes `<ep>/moments/verdicts.json`.
2. `node "$S/mix.mjs" <ep>` adds the picks to `pieces.json` and writes `moments/report.json`. Then drop every piece of
   a format that `settings.formats` turns off (`node "$S/pieces.mjs" drop <ep> <ids>`).
3. Tell the member what the look found, in a few lines: how many of each format, the levels that came up short and
   why, the reels under the usual bar, and the top reasons pieces were turned down.
4. If `settings.checkpoint` is `plan` (the default), show the plan as one line per piece (id, format, level, title,
   hook) and ask: build all of these? They can drop or change any line first. Otherwise carry straight on.

## Step 4: write every piece

Work through the pieces in batches (all posts, then all carousels, then all reels), saving each piece's files as
you go so a long run can pick up where it stopped. For each piece, read its plan in `pieces.json` (stage, insight,
hook, angle, outline, library files, cta) and its excerpt of the transcript, then follow the craft skill:

| Format | Skill | Writes (in the piece's folder) |
|---|---|---|
| Text post | `posts`, then `post-card` | `post.md`, `card.json` |
| Carousel | `carousel` | `plan.json`, then `caption.md` from the finished slides (`captions`) |
| Reel | `reel`, `captions`, `cover`, with `hooks` for the cover line | `caption.md`, `cover.json` |

- Build out from the library. The moment is the spark; the member's teaching on that insight (the library files the
  piece names, or a `library.mjs search` on its insight) gives the steps, scripts, frameworks and results. A private
  file is for understanding only, never quoted. A `guest`-stage file is for stories and voice, never the teaching.
  Every number keeps its owner and its condition.
- A guest's idea is credited to the guest by name and never written as the member's advice. When the member makes
  no point of their own (`needs_take`), stay with the guest's point, credited, and let the coach ask the member.
- Every piece passes the `humanizer` skill's loop and `node "$S/lint.mjs" <file>` before it's built.
- When the Agent tool is available, a batch can go to a subagent (one per awareness level works well): give it the
  brand file paths, the piece ids, this skill's Step 4 and the craft skill to follow. Subagents write only inside
  their own pieces' folders; only you edit `pieces.json`.

## Step 5: build

- Posts: `node "$S/card.mjs" <piece>/card.json` (take turns between `board` and `light` looks across the episode).
- Carousels: `node "$S/carousel.mjs" <piece>`. For the cover picture: a still from the video at the spark
  (`node "$S/frame.mjs" <video> <mm:ss> <piece>/cover.jpg`, then `"image": "cover.jpg"` in plan.json), a photo of the
  member from `studio/assets`, or with `settings.pictures.fal` true and a `FAL_KEY` in this shell, a generated
  object or place (`picture.mjs`). None of those: leave `image` null and the hook sets larger. If it prints `OVER:`,
  rewrite those slides shorter (same meaning) and run it again.
- Reels: `node "$S/reel.mjs" --src <video> --start <mm:ss> --end <mm:ss> --out <piece> [--layout crop --focus 0.3]
  --hook "<cover line>" --accent "<accent>"`. Check its `starts:` and `ends:` lines: it must open on the hook sentence
  and end where the point lands; adjust the times and run again if not. Then the cover: write `cover.json` and run
  `node "$S/cover.mjs" <piece>/cover.json` (a still from the reel's first seconds works:
  `frame.mjs <piece>/reel.mp4 0:01 <piece>/still.jpg`).
- Look at what you built (the contact sheet, the card, the reel's `sheet.jpg`) before the review. Fix what's broken.

## Step 6: review

Run the `coach-review` skill on every piece. It writes `review.json` in the piece's folder;
`node "$S/pieces.mjs" review <ep> <id> <piece>/review.json` records it (ready, or back to draft for fix and rethink).
Then one fix round: for every `fix` verdict, make the coach's fixes (words through the craft skill, visuals by
re-running the build), lint again, and review again. Pieces still at `fix` after that round, and every `rethink`,
go to the member as they are, with the coach's notes. Never ask the member a question the coach didn't raise.

## Step 7: show the board

1. `node "$S/board.mjs" <ep>` writes `<ep>/review/board.html`: one page, images inside it, every piece by format and
   awareness level with its slides, card or reel frames, words, verdict, fixes and the lines to say back.
2. Show it. In the Code tab, publish it as an artifact with the Artifact tool when it's available (the page is
   already built; publish the file as it is). In Cowork, show it the way the app shows HTML it made (an artifact or a
   file preview). Otherwise open it in the browser (`open` on a Mac, `start` on Windows). If it's over the size limit,
   the script says so: open it in the browser instead.
3. Then say, in the chat, plainly: **"The board can't change anything by itself. To change a piece, copy a line from
   its 'Say to Claude' box (or write your own) and paste it here."** Give two or three examples using real ids from
   this board. Also give the summary in the chat: counts by verdict, the questions the coach has for them, and which
   pieces need their take.

## Step 8: the posting calendar

`node "$S/calendar.mjs" <ep>` gives every ready and approved piece the next open slot in the member's rhythm and time
zone (keeping the slots other episodes already hold) and writes `<ep>/calendar.csv`, plus the scheduler's own CSV
when a template is set, and `--folders` for a `to-post/` folder per slot. Rebuild the board afterwards so its plan
shows. Tell the member where the file is and how to import it: most schedulers take a CSV of text and times but
need the media attached in the scheduler itself (a CSV can only carry links). Nothing is ever posted from here.

## Step 9: the say-back loop

The member answers in the chat. Handle each line as `references/say-back.md` says: approve, change, use fixes,
answer the coach's question, drop, move a slot, mark posted, add a rule. After any change to a piece: rebuild it,
lint it, review it again if its words changed, rebuild the board, and re-run the calendar if anything was approved,
dropped or moved. Say what changed in one line per piece.

## More from the same episode, or from the library

- "Find more moments": run Step 3 again on the same episode. The scouts get the pieces already made (with their
  insights and levels) so they find new angles, and `mix.mjs` counts what's already there.
- "Make content from my library on <topic>": a `library` run (Step 1), no reels.

## Hard rules

- Never invent a quote, a number, a result, a client, an opinion or a story. A piece that needs one it doesn't have
  gets the coach's question instead.
- Never post, schedule or send anything anywhere. The member imports the calendar.
- No em dashes in anything written for the member's audience.
- Never put a key, a password or a token in a file, the chat or a command line that gets printed.
- Clearing old files is the `studio-cleanup` skill's job, and it always asks first.
