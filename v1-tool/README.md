# Version 1: the full tool

A content studio web app your team signs in to. You upload an episode (a podcast, an interview, a talk to camera) or
paste an idea, and the studio finds the moments worth posting, edits them into reels, builds carousels, writes posts
and captions for every network, makes the post graphics and the YouTube thumbnail, reviews everything against your
own standard, and schedules what you approve. Everything it writes comes from your brain: your brand brief, your voice,
your offers, your proof and your teaching.

An episode goes in as one video (Zoom, StreamYard, a phone or an edited export: **Add the episode video** on the
episode page) or as Riverside's separate tracks (each person's camera and microphone, with **Add files**). Either way
it's transcribed, cropped to 9:16 for reels, and made into the produced full episode. Separate tracks also tell the
speakers apart; one video credits every line to you.

It runs on your own Supabase project and your own Vercel account. Nothing is shared with anyone else's studio.

## What it does

- **Calendar home:** what goes out when, what's waiting for you, and the open slots in your posting rhythm.
- **Episodes board:** find the moments (two scouts read the whole episode, the coach judges every idea), keep or kill
  them, and see the run report: what it found, which awareness levels came up short, what was turned down and why.
- **Five awareness levels and a content mix:** reels, carousels and posts for unaware, problem-aware, solution-aware,
  product-aware and most-aware readers, built out with your training material.
- **Training-material ideas:** no video needed. The studio picks a topic you teach that hasn't gone out lately and makes
  a carousel and a post for each level.
- **Making:** reels cut and edited on a cloud machine, animated reels with no footage (with your voiceover if you record
  one), carousels built slide by slide, posts with a branded graphic card, the full episode produced with captions and
  chapters, and YouTube thumbnails from your own photos.
- **Coach:** "Coach" plus your first name reviews every piece against your seven checks before you see it, fixes what
  it can, and asks you one question when only you can supply the take. Your send-backs become its rules.
- **Your queue:** only what passed. Approve, send back with a note, or answer the coach by voice.
- **Publishing:** straight to ContentStudio or Metricool (one post per network, first comments, Instagram collaborator invites), or any other scheduler (Flick, Buffer, Later...) through a posting kit per piece and a calendar CSV for bulk upload.
- **Podcast hosting:** your shows' RSS feeds, episodes, show notes and artwork, served from the app.
- **Leads:** lead magnets and their keywords, so captions ask for the right comment on each network.
- **Drive and retention:** finished files copied to Google Drive, and media cleared from storage a week after posting
  (RETENTION.md).

## What's in this folder

| Path | What it is |
|---|---|
| `CLAUDE.md`, `.claude/skills/setup-studio/` | The guided setup: open this folder in Claude Code and say "set up my studio" |
| `app/` | The web app (Next.js on Vercel). Your names and colours go in `app/brand/studio.json` |
| `engines/` | The five cloud editors (reels, carousels, full episodes, animated reels, thumbnails) and the scripts that pack and upload them |
| `supabase/schema.sql` | The database, the brain tables and the storage buckets, in one paste |
| `supabase/functions/studio-brain/` | The brain connector (an MCP server) |
| `supabase/brain-starter/` | Starter versions of the ten documents every prompt reads |
| `BRAIN.md` | How the brain works, its tools, and how to use your own second brain instead |
| `RULES.md` | Every rule the studio runs on, and where it lives in the code |
| `RETENTION.md` | What the daily cleanup clears, and what it never touches |
| `ACCESS.md` | Every account, endpoint and key, and where each one goes |

## What it runs on, and rough monthly costs

| Service | Plan | Rough cost |
|---|---|---|
| Supabase | Pro (uploads over 50 MB, the edge function, daily backups) | $25 a month, plus storage past the included 100 GB (the cleanup keeps this small) |
| Vercel | Pro (long cloud jobs, the cron) | $20 a month per seat, plus Sandbox machine time: a reel is about 10 minutes on an 8-CPU machine, a carousel about 6 on 4 CPUs, a full episode up to an hour |
| Anthropic (Claude API) | Pay as you go | Varies most with volume. A full episode's moment-finding run plus the writing and reviews for 25 pieces is the biggest single cost. Expect tens of dollars a month for a light schedule and a few hundred for a daily one; set a spend limit |
| Your scheduler | ContentStudio or Metricool connect straight to the app (a plan with API access); any other tool works through the posting kit | Whatever you pay for it now |
| Google Drive | Optional (a Workspace shared drive) | Your existing plan |
| fal.ai | Optional | Cents per generated cover picture |

These are rough figures from list prices; check each service's pricing page, and look at Anthropic's console and
Vercel's usage page after your first week.

## How to start

You need Node.js 20 or newer, Git, Claude Code, and accounts on Supabase, Vercel, Anthropic and your scheduler (above).

Want content today, before an hour of setup? Install Version 2 (`../v2-claude/`) in the Claude desktop app and say
**"quick start"**: it needs no accounts beyond Claude and makes your first carousel and posts in about 20 minutes.

1. Download the full tool from the repository's latest release (or copy this folder) into a new **private** GitHub
   repository of your own. Private, because it will hold your brand files.
2. Open it in Claude Code and say **"set up my studio"**.

The setup (`.claude/skills/setup-studio/SKILL.md`) interviews you first (your brand, offers, ideal client, voice,
proof, posting rhythm, time zone, networks, scheduler), asks for your second brain or for your material (transcripts,
past posts, testimonials, offer documents, photos, logos, colours, fonts) and loads it into your brain. Then it builds
the rest with you step by step: the Supabase project, the database, the brain connector, the Vercel project and its
settings, the cloud editors, your owner account, the daily cleanup and a test run. Plan on an hour or two, most of it
the interview. You paste every key into Vercel yourself; the setup never asks for one in the chat.

## Good to know

- **One brand per studio.** One owner who approves, any number of team members who make.
- **The look is yours:** colours in `app/brand/studio.json`, which the app and every editor read. Fonts ship with
  their open licences.
- **Send drafts first.** Your first sends to the scheduler should be drafts; check them there before you schedule.

Open Content Studio is free from [Mike Moll](https://www.mikemoll.co/?utm_source=open-content-studio&utm_medium=github)
(mikemoll.co), helping service founders get on podcasts and generate revenue. MIT License (see `LICENSE` and
`THIRD-PARTY-NOTICES.md` at the top of the repository).
