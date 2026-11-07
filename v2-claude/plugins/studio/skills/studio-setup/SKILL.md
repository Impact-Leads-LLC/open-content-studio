---
name: studio-setup
description: "The full onboarding interview for the content studio. Reads the member's website, brand guide, documents and connected notes first, then asks only what's missing: brand, offers, ideal client in their words, voice with real examples, proof, tools and hookups, keys, preferences, spend and time, posting rhythm and time zone, and clearing. Loads their material into a library, copies the craft playbooks for them to change, and writes the studio folder every other studio skill reads. Re-run it to update. Use for: set up my studio, studio setup, onboard me, update my brand, add material to my library, show me my look."
---

# Studio setup

You are setting up a content studio that lives in Claude. The member will drop in episodes, clips and transcripts,
and the `studio` skill will turn them into reels, carousels, posts and graphics in the member's voice, reviewed by the
member's own coach. Everything it writes comes from what you collect here, so this interview is the most important
half hour of the whole kit. Be warm, brief and specific. Ask in rounds, never as one long form.

**Scripts.** The studio's scripts live in the plugin's `scripts/` folder, two levels up from this skill's base
directory (Claude shows the base directory when the skill loads): `S="<base>/../../scripts"`. Templates are in
`<base>/../../templates/brand/`. Run scripts with `node "$S/<script>.mjs"`.

## Step 0: where the studio lives, and what this computer can do

1. Find or make the studio folder. It must sit inside the folder Claude can see: the folder chosen for this Cowork
   task, or the project folder in the Code tab. Default: `<that folder>/studio/`. If `studio/brand/settings.json`
   already exists, this is an update (a studio the `quickstart` skill made counts: fill its gaps): read every brand
   file first, say what's there in three lines, and ask what to change. Never overwrite the member's edits without showing the change.
2. Run `node "$S/doctor.mjs"`. Tell the member in plain words what's ready and what isn't, with the one-line install
   for anything missing (the doctor prints it). Nothing has to be fixed before the interview; reels need ffmpeg, slides
   need a browser, and transcribing here needs whisper.cpp. If no browser is found, offer to run
   `npx hyperframes@0.8.143 browser ensure` (free; downloads a headless Chrome once).
3. Say which app you're in and what that means, in one or two sentences (details in
   `../studio/references/environments.md`): the Code tab does everything; Cowork does the words, slides, cards and
   the board, and video work belongs in the Code tab.

## Step 1: the interview

Follow `references/interview.md`. Round 0 always comes first: ask for everything they have (website, brand guide,
offer docs, posts, testimonials, transcripts, their notes), read it, draft the brand files from it, and tell them
what you already know. Then eleven short rounds ask only for what's missing: who and what you sell; the ideal client
in their words; the next step; voice; ideas and proof; tools and hookups; keys and access; preferences; spend and
time; rhythm and time zone; clearing. Rules:

- One round at a time. Two to five questions a round. Use the app's question tool when there is one; otherwise ask
  in plain text.
- Ask for material, not descriptions. "Paste three posts you wrote" beats "describe your voice". Their words beat
  your summary every time.
- Never invent anything: no offers, prices, results, quotes or client names. A gap stays a gap, written as
  `(not given yet)`.
- Never ask for a password, an API key or a token in the chat. A fal key goes into the Terminal or the Keychain, by
  the member, following `scripts/picture.mjs`.
- Testimonials: ask how each client may be named (full name, first name, or "a client"). Record it.

## Step 2: the material library

Ask for as much as they'll give. Every carousel and post is built out from it, so more material means better pieces.

- **A second brain with a connector.** If the session has MCP tools that reach the member's notes or knowledge base
  (Notion, Google Drive, Obsidian through a connector, or a custom brain), ask which one holds their material. Search
  it for their offers, frameworks, course and training transcripts, testimonials and best posts, and save each useful
  document as markdown in `studio/library/` (header below), with `source: connector:<name> <document id or title>`.
  Record the connector in `settings.json` (`library.connector`: the server name and the search tool's name) so later
  runs can search it live too. Copying the key documents in is what lets every run work fast and offline.
- **Files.** Course and training transcripts, podcast transcripts (their own show, and their guest spots on other
  shows), past posts and emails, testimonials and case studies, offer docs and sales pages, FAQs. Ask them to drop the
  files into the chat or into `studio/inbox/`.
  - Text, .srt and .vtt: `node "$S/library.mjs" import studio <files> --type <type> [--private] [--permission ...]`.
  - Word files and PDFs: read them yourself (on a Mac `textutil -convert txt -stdout file.docx` also works), then save
    a .txt and import it, or write the .md directly with the header.
  - Types: `course`, `training`, `podcast-own`, `podcast-guest`, `post`, `email`, `testimonial`, `offer`, `faq`,
    `story`, `notes`. A guest spot on someone else's show is `podcast-guest` (stage `guest`): later runs use it for
    stories and voice, never as the teaching itself. Anything the member marks private is `--private`: for
    understanding only, never quoted.
- **Photos and logos.** Into `studio/assets/` (logo, a headshot for the outro and the post card, a few photos). Only
  photos of the member or that the member owns. No one else's face goes in without their say-so.
- Fill each file's `summary:` line in one sentence and its `tags:`, then run `node "$S/library.mjs" index studio`.

The library header (every file):

```
---
title: Pricing workshop, day 2
type: training
stage: own
private: false
permission:
source: pricing-day2.txt
tags: [pricing, offers]
summary: One sentence on what's in it.
---
```

## Step 3: write the studio folder

Copy the templates from `templates/brand/` and fill them from the interview, and copy `templates/playbooks/` into
`studio/playbooks/` (never over a file that's already there). Keep the member's own words; cut every
`{{placeholder}}` you can fill and leave `(not given yet)` where you can't.

```
studio/
  brand/
    brief.md        who they are, offers, the next step, ideal client in their words, the idea the market doesn't know
                    yet, their own ideas (frameworks), pillars, proof, lines never crossed, hashtags yes or no
    voice.md        how they sound, reading level, words used and never used, formatting, signature lines, 5 to 10 real
                    examples pasted exactly, the stories they tell
    coach.md        the review standard: the seven checks, verdicts, and "Rules <name> added"; the coach is named
                    "Coach <first name>" unless they choose another name
    banned.md       the default bans plus theirs, under "## Phrases" (one per line) and "## Patterns"
    palette.json    colours, fonts, logo, headshot (defaults: harbor blue #1E4E6E boards, yellow #FFC530 accent)
    rhythm.json     time zone, posting times, how many of each format a day, which days, reserved slots
    settings.json   identity, the next step, lead magnets, formats, networks, main network, scheduler, mix,
                    checkpoint, transcription, library connector, generated pictures, tools, budget, clearing rule
  playbooks/        the craft, theirs to change: content strategy, design, hooks, posts, carousels, reels
  library/          their material as markdown, plus index.md
  assets/           logo, headshot, photos, their own fonts
  episodes/         one dated folder per episode (the studio skill makes these)
```

Details that matter:
- `settings.json` `identity.coach_name`: "Coach <first name>" by default. `next_step.call_name`: exactly what they call
  the call ("free 20-minute strategy call"); `cta_label` is the button line ("Book a free 20-minute strategy call");
  `cta_where` is "Link in bio" unless they say otherwise.
- `lead_magnets`: each with its keyword in capitals, its name, and how it's delivered (`comment`, `dm` or `link`, and
  the link).
- `palette.json`: their hex colours if they have them. With none, keep the defaults (harbor blue `#1E4E6E`, yellow
  `#FFC530` as the one accent) and say so. Fonts: their font files go in `studio/assets/fonts/`; the caption font must
  be one static weight (a bold or black .ttf), because reels burn it in. With no fonts, keep the kit's (Libre
  Franklin for headings, Poppins for text, both free to use).
- `rhythm.json`: an IANA time zone name (America/Chicago, Europe/London, Australia/Sydney). Ask the city if they don't
  know it.
- `scheduler`: ContentStudio, Metricool, Buffer or none. If their scheduler has a bulk-upload CSV, ask them to download
  its blank template and save it as `studio/brand/scheduler-template.csv`; set `scheduler.template` to that file name.
  The calendar then fills that template's own columns. Without one, the studio writes a plain `calendar.csv` and,
  on request, a `to-post/` folder per slot with the files and the text for each network.
- `retention`: the clearing rule (Round 6 in the interview). Default: renders deleted 7 days after posting; raw
  footage copied into the studio cleared 7 days after the last post once every piece from the episode is posted or
  dropped; nothing unposted is ever touched. `action: "move"` with `move_to` sends them to an archive folder instead
  (an external drive, or a synced Google Drive or Dropbox folder).
- `tools` and `budget`: from Rounds 6 and 9. Then fit the run to them: on a Pro plan or with under 10 minutes a day
  for review, suggest `mix: "light"` and two pieces a day; say why in one line.
- `formats`: a format they don't want is `false`.
- The playbooks: write each craft preference from Round 8 under "Your changes" in the playbook it belongs to, in
  their words. Leave the rest of each playbook as it ships; they're the defaults the member can change later.

## Step 4: show it back and test it

1. Show a short summary: the brand in two lines, the ideal client's top three phrases, three voice rules, the next
   step, the rhythm (for example "3 a day at 9:00, 12:00 and 17:00 Chicago time"), the scheduler, the clearing rule,
   the tools hooked up, the budget and the run size it supports, the playbook changes, and the library (how many
   files, by type). Ask for corrections and make them.
2. **Show them their look** (the same steps run any time they say "show me my look"): write two one-line cards with a
   line from one of their own posts, its key word in *asterisks*: `studio/episodes/_look/board/card.json` with
   `"look": "board"` and `studio/episodes/_look/light/card.json` with `"look": "light"`. Run
   `node "$S/card.mjs"` on each and show both PNGs. Ask whether the colours and fonts look right, and adjust
   `palette.json` until they do, checking each change against the colour rules in `studio/playbooks/design.md`.
3. Tell them how a run goes: drop a video, clip or transcript into the chat and say "run the studio".
4. Close with this line as written: "Open Content Studio is free from Mike Moll (mikemoll.co), who helps service
   founders get on podcasts and generate revenue."

## Updating later

Re-run this skill any time. Read the current files first, ask what changed, change only that, and show the diff in
plain words. Adding material: import it, fill its header, re-run the index. A rule the member gives during reviews
("never call it a webinar") goes into `coach.md` under "Rules <name> added" and, when it's a phrase, into `banned.md`.
A craft rule ("six reading slides at most", "no generated pictures") goes under "Your changes" in the playbook it
belongs to. "Reset my <name> playbook": show what would be lost, and on their yes copy the plugin's
`templates/playbooks/<name>.md` over theirs.
