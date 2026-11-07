# The engines

The app makes reels, carousels, full episodes and thumbnails on a cloud machine (a Vercel Sandbox: Linux, no graphics
card). For each job it downloads one engine from Storage, unpacks it, writes the job's details next to it and runs the
engine's `run.sh`. Everything the engine needs comes with the job, and everything it makes goes back through upload
links. An engine talks to nothing except Claude (with your brain connected), the upload links it was given, and fal.ai
for a carousel's generated cover picture when you set a fal key.

| Folder | What it makes | Started by (in the app) |
|---|---|---|
| `stack-engine/` | One edited 9:16 reel (MP4) from one clip, with a cover frame, the plan and a contact sheet | `lib/render.ts` `startEdit` |
| `carousel-engine/` | A carousel of up to 10 slides (1080x1350 PNGs), a contact sheet and `deck.json` | `lib/render.ts` `startCarousel` |
| `episode-engine/` | The produced full episode (MP4), its captions (.srt), YouTube chapters, the plan and a frame sheet | `lib/render.ts` `startFullEdit` |
| `animated-engine/` | A 9:16 reel with no footage, made from a piece's words (optionally following a voiceover) | `lib/animated.ts` `startAnimated` |
| `thumb-engine/` | YouTube thumbnail words (three options), then the thumbnails in three looks, each checked | `lib/thumbnail.ts` |

Each folder is self-contained: its fonts (with their OFL licences), sound effects, models and scripts are inside it.
The two small helpers `studio.mjs` and `studio.py` are the same in every engine that uses them; if you change one,
copy it to the others.

## How a job runs

1. The app finds the newest file in the private bucket `studio-media` named `uploads/<unix-ms>-<name>.tgz` (newest
   wins) and gives the machine a signed link to it.
2. The machine unpacks it into `/tmp/job/<name>/` and the app writes `/tmp/job/context.json`.
3. The app runs `run.sh` with the settings below as environment variables.
4. Each step writes one line with its time to `/tmp/job/status.txt`. The app reads it while the job runs, and the
   engine uploads it to `OUT_LOG` at the end. The last line is `DONE` or `FAILED at <step>`. Anything shaped like a key,
   a token or a link's signature is blanked out of error lines before they are written.

## Settings every job gets

| Name | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | The Claude key. |
| `BRAIN_MCP_URL` | Your brain's MCP server, for example `https://<ref>.supabase.co/functions/v1/studio-brain/mcp`. |
| `BRAIN_MCP_TOKEN` | The bearer token for it (any non-empty string you set when you deployed it). |
| `CLAUDE_MODEL` | Optional. Default `claude-opus-5-5`. |

Every Claude call carries the brain as an MCP server named `brain`, so Claude reads your documents itself while it
works. The brain tools the prompts use: `get_brand_brief`, `brain_search`, `brain_get_document`,
`brain_list_documents`, `recent_content`, `photo_search`, `photo_pick`, `photo_use`, `photo_get`, `thumb_pick`,
`thumb_use` and `bg_list`. The prompts name these documents by title, so your setup creates them with exactly these
names: "Brand Brief", "Voice", "Voice Guardrails", "Avoid AI Writing", "Review Standard", "Reel Edits", "Full Episode
Edits", "Thumbnails" and "Carousels". Starter versions of the last four are in `../supabase/brain-starter/`.

The rules every prompt carries: a document marked confidential is never quoted; a document from the owner's guest spot
on someone else's show is for their stories and voice, never the teaching; ideas from a guest are credited to the
guest; never invent a figure, a client, a quote or a claim.

## The studio object

Every `context.json` carries a `studio` object from the app's brand settings:

```json
"studio": {
  "owner": "Alex", "ownerFull": "Alex Rivera", "coach": "Coach Alex", "brand": "Alex Rivera Studio",
  "handle": "@alexrivera", "show": "Your Show", "audience": "service business owners",
  "website": "https://example.com", "bookingUrl": "https://example.com/book", "timezone": "America/New_York",
  "palette": { "primary": "#1E4E6E", "accent": "#FFC530", "ink": "#0F1F2B", "paper": "#FFFFFF", "soft": "#EEF3F6" },
  "fonts": { "head": "Libre Franklin", "body": "Poppins" }
}
```

Every name in a prompt or on screen comes from here. An empty field falls back to plain words ("the host", "the
coach"), and an empty handle is left off the slides.

## Each engine's job

**stack-engine (reels from footage)**
- Env: `CLIP_URL` (the clip), `OUT_MP4`, `OUT_PLAN`, `OUT_SHEET`, `OUT_LOG`, `OUT_COVER` (optional), plus the settings
  above.
- context.json: `layout` ("stack" for two stacked camera feeds, "single" for one 9:16 frame), `episode` {title, guest,
  show}, `piece` {num, title, hook, caption}, `top`, `bottom` (who is on each camera), `show`, `duration`, `turns` (who
  speaks when), `script` (the transcript's lines inside the clip), `notes`, `rules` (the owner's own review rules),
  `coach` (false skips the coach's first look), `start`, for a revision `previous` + `change`, and `studio`.
- Steps: transcribe, plan (Claude reads "Reel Edits", then the coach reads the plan against "Review Standard" once and
  the editor makes the coach's fixes), cut, a light natural grade, build the page (`reel/build_auto.py` with the effect
  library in `reel/fx.py`), check, render with HyperFrames, open on the cover for half a second
  (`scripts/cover_flash.py`), upload.

**carousel-engine**
- Env: `OUT_SLIDE_1` to `OUT_SLIDE_10`, `OUT_SHEET`, `OUT_PLAN`, `OUT_LOG`, `TOP_URL` and `BOTTOM_URL` (the guest's and
  the host's camera feeds, for stills; optional), `FAL_KEY` and `FAL_IMAGE_MODEL` (optional: a generated cover picture
  when there is no episode still; never a person), plus the settings above.
- context.json: `episode`, `piece` {num, title, hook, why, outline, caption, awareness, insight, brain (training
  material document titles)}, `notes`, `script`, `top`, `bottom`, and `studio`.
- Claude plans the deck under the carousel skill in `kit/` and the brain doc "Carousels" (the story format by default:
  a cover, plain reading slides, the outro), the stills are pulled at full size, the slides are drawn and rendered
  with Chrome, and a slide whose copy won't fit gets one shorter rewrite. The outro's call to action comes from the
  brand brief, and its small portrait is one of the owner's photos from `photo_pick` (their initial when there is
  none).

**episode-engine (the produced full episode)**
- Env: `TOP_V`, `TOP_A`, `BOT_V`, `BOT_A` (the guest's and the host's camera and own audio file; the audio may be
  empty), `TOP_NAME`, `BOT_NAME`, `START`, `END` (seconds on the recording's clock, empty for the whole talk),
  `WORDS_URL` (saved word times, optional), `AD_URL` (the show's own pre-recorded ad read, optional), `BROLL` (JSON list
  of screen shares `{url, offset}`, optional), `OUT`, `OUT_LOG`, `OUT_SHOTS`, `OUT_PLAN`, `OUT_SRT`, `OUT_CHAPTERS`,
  `OUT_SHEET`, plus the settings above.
- context.json: `episode` {title, guest, show}, `guest_site`, `notes`, `rules`, and `studio`.
- The camera follows whoever is talking, with slow pushes; a cold open, title, name, chapter and end cards; a graphic
  every two or three minutes; punch-ins; word-by-word captions; levelled sound. Claude plans the content from "Full
  Episode Edits". With no plan (no key, or the call failed) a plain edit still comes out, and the log says so.

**animated-engine (reels with no footage)**
- Env: `OUT_MP4`, `OUT_LOG`, `OUT_SHEET`, `OUT_PLAN`, `OUT_COVER`, `VO_URL` (the owner's voiceover take, optional), plus
  the settings above.
- context.json: `piece` {num, title, hook, why, outline, insight, awareness, funnel, caption, angle, cta, service},
  `episode` {title, show, kind}, `script` [{at, who, text, in}], `stage`, `notes`, `rules`, for a change `previous`
  {beats, end} + `change`, with a voiceover `vo` {lines, seconds}, and `studio`.
- The cover for half a second, then 6 to 12 animated beats (statement, number, list, before and after, quote, card,
  kinetic type) on the board, then the end card. With a voiceover the beats follow the voice. The end card's wording
  comes from "Reel Edits" or the brand brief, else the booking page, the website or the handle.

**thumb-engine (YouTube thumbnails)**
- Env: `MODE` ("words" or "render"), `OUT_LOG`, plus the settings above. Words mode: `OUT_WORDS`. Render mode:
  `OUT_THUMB_<LOOK>`, `OUT_REVIEW_<LOOK>`, `OUT_FEED_<LOOK>`, `OUT_GATE_<LOOK>` (LOOK = CALL, WALL, BOARD), `OUT_GUEST`,
  `OUT_RESULT`.
- context.json, words mode: `episode`, `guest`, `title`, `working_title`, `chapters`, `transcript`, `playable` (the hook
  types the owner's photos can play right now), `notes`, `studio`. Render mode: `option`, `order`, `skip`, `run_key`,
  `takeaway`, `transcript`, `title`, `guest`, `guest_video` {url, name} (the guest's camera, for the call), `refs` (may
  be `{}`), `studio`, and `pairs`: one per look, exactly as `thumb_pick` returns it:

  ```json
  { "id": "<asset uuid>", "pair_id": "<asset uuid>", "cutout": "<photo name>", "background_id": "brand",
    "background_label": "Brand background", "side": "R", "hook_types": ["smirk"], "frame": null, "storage_prefix": "",
    "urls": { "photo": "<signed full photo>", "preview": null, "person": "<signed cutout PNG or null>",
              "mask": "<signed person mask PNG or null>", "plate": null, "alpha": null, "pair": null } }
  ```

  `side` is where the person sits in the frame (the call needs "R"). Optional: `face_box` (used when no face is
  detected) and `urls.plate` (a brand background image instead of the plain palette backdrop).
- The three looks: the call (the guest's real webcam frame behind the owner, one loop mark), the number wall (a giant
  number behind the owner's head, a sticker) and the board (a tilted board, the owner in a print). The background is a
  backdrop in the brand's primary colour. The person comes from `urls.person`, else `urls.photo` cut with `urls.mask`,
  else a cutout made on the machine with `rembg` (CPU, model `u2net_human_seg`, downloaded on first use). Only the mask
  is made by a model; every pixel of the person is their own photo's, cut and graded, never regenerated. If no cutout
  can be made, the board prints the plain photo and the call and the wall are skipped with a plain reason. Every
  thumbnail passes checks G1 to G13 before delivery. Test locally with `python3 skill/scripts/thumb.py doctor`.

## Changing the look

- **Colours** come from the app's brand settings (`studio.palette`), so most members never touch the code. The reel,
  episode and animated builders write their pages in the shipped colours and then swap in the palette by role
  (`recolor()` in `studio.py`): primary for boards and backdrops, accent for the small loud moments (the old
  light-blue accent maps to it too), ink for the dark room. The carousel writes the palette as CSS variables onto every
  slide (`kit/template/kit.css` names the roles). The thumbnails read it in `skill/scripts/thumbkit/tokens.py`, and
  deepen the board colour automatically when white type wouldn't read on it. Neutrals (white, greys, near black,
  shadows) stay as they are.
- **Fonts** ship with each engine: Libre Franklin, Poppins and Archivo, all under the SIL Open Font License (the
  `OFL-*.txt` file sits next to each). To change one, put the new `.ttf` in the engine's fonts folder, point its
  `@font-face` line at it (`stack-engine/reel/brand.css` and `style.css`, `carousel-engine/kit/template/kit.css`, the
  CSS inside `episode-engine/build.py` and `animated-engine/build.py`, `thumb-engine/skill/tokens.json`), and check a
  render.
- **The effect library** for reels is `stack-engine/reel/fx.py` (17 effects: orbit, wall, headlines, chart, cover,
  glass, paper, doodle, frame, the app on screen, checklist, punch, zoom-through, vertigo, pull-back and more). The
  editor's prompt in `stack-engine/scripts/plan.mjs` lists them, so a new effect needs both.
- **House style** (what to cut, what goes on screen, end cards, thumbnail words, carousel rules) lives in your brain
  documents, not in the code. Change the document and the next job follows it.

## Packing and uploading

```bash
bash engines/pack.sh                 # packs all five into engines/dist/<name>.tgz
bash engines/pack.sh thumb-engine    # packs one
node engines/upload.mjs              # uploads everything in engines/dist/
node engines/upload.mjs thumb-engine # uploads one
```

`pack.sh` leaves out what a local test leaves behind (`work/`, `renders/`, `node_modules/`, caches, test pages). Each
archive has the engine's folder name on top, which is what the app's job script expects.

`upload.mjs` needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, from the environment or from `app/.env.local`. It
uploads to `studio-media/uploads/<unix-ms>-<name>.tgz`. A new secret key (`sb_secret_...`) goes in the `apikey` header
only; a legacy service-role key goes in both headers. The key is never printed. You can also upload by hand in the
Supabase dashboard under the same name.

The app always uses the newest upload, so the next job runs the new version. To roll back, delete the newest upload;
the one before it takes over. `engines/dist/` is ignored by git: don't commit packed files.

## Testing on your own computer

You need Python 3 with Pillow, ffmpeg, Node 20 and Chrome (or HyperFrames' headless shell).

- **Carousel**, no keys needed: write a story plan to a JSON file (the shape is the `PLAN` schema in
  `carousel-engine/scripts/build.mjs`), put a `context.json` with a `studio` object in a test folder, then run
  `JOB_DIR=<test folder> DECK_DIR=<test folder>/deck WORK_DIR=<test folder>/work PLAN_FILE=<plan.json> node
  carousel-engine/scripts/build.mjs`. The slides and a contact sheet land in `<test folder>/deck/png/`.
- **Reel page**: copy `stack-engine/` somewhere, put a test clip at `reel/assets/source.mp4`, a `plan.json`,
  `cutlist.json`, `context.json` and `work/words_chunked.json` in `reel/`, run `python3 ../scripts/cut.py`, copy
  `work/cut-raw.mp4` to `assets/moody.mp4`, then `python3 build_auto.py`. `npx hyperframes@0.8.143 snapshot --at 2,10`
  shows frames without a full render. Effects that cut the speaker out need HyperFrames' background remover.
- **Episode and animated**: both take `PLAN_FILE` (a hand-made plan) instead of calling Claude; with no key they make
  a plain plan on their own.
- **Thumbnails**: `python3 thumb-engine/skill/scripts/thumb.py doctor`, then its `prepare`, `render` and `gate`
  commands on a test photo and mask.

Keep test files outside the engine folders, or let `pack.sh` drop them.

## The HyperFrames version

HyperFrames (which turns the reel and episode pages into video and installs Chrome) is pinned to one version so a new
release can't change the renders without warning: `hyperframes@0.8.143`, named in the `run.sh` of the stack, carousel,
episode and animated engines, in `stack-engine/reel/fx.py` and in `stack-engine/reel/package.json` (the thumbnails
draw with Pillow and don't use it). To upgrade, change them all together, then make a
test reel, carousel and episode before you rely on it.
