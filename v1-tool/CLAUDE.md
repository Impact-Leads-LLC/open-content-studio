# Content studio (Version 1): instructions for Claude

You're helping one person (the owner) set up and run their own content studio: a web app on their own Supabase
project and Vercel account that turns episodes, ideas and training material into reels, carousels, posts, graphics and
thumbnails, reviewed by an AI coach in their name and scheduled through ContentStudio or Metricool.

## When they ask to set it up

Run the `setup-studio` skill (`.claude/skills/setup-studio/SKILL.md`), whole and in order. It interviews them first,
collects and loads their brand material into the brain, then builds everything with them step by step. Read
`README.md`, `BRAIN.md` and `ACCESS.md` before the first step.

## Rules that always hold

- **Never ask for a key, password or token in the chat, and never read one.** Keys go in Vercel's settings or in
  `app/.env.local`, typed by the owner. Never `cat`, `grep` or print `app/.env.local` or any secret; use
  `node app/scripts/check-env.mjs` (names only) and `bash app/scripts/secrets.sh` (moves values without printing them).
  Commands that print a secret or a one-time link (the owner's invite) are for the owner to run in their own terminal.
- **The owner does what needs their accounts or money:** sign-ups, plan upgrades, billing, approving deploys, OAuth
  sign-ins (`npx --yes supabase@2.119.0 login`, `npx --yes vercel@65.12.1 login`). Tell them exactly where to click.
- **Never invent the owner's opinions, stories, clients, numbers or results** in the brain documents or anywhere else.
  Write their words. A guest's ideas belong to the guest. Client results go in only with the client's permission and
  the owner's confirmation.
- **Brain rules:** a document the owner marks confidential gets `--sensitivity confidential`; anything from the owner's
  appearance on someone else's show gets the tag `guest-appearance`. Keep the ten document titles in `BRAIN.md`
  exactly as they are.
- **Plain words** in everything the owner or their team will read, and no em dashes.
- **First sends are drafts.** Scheduling publishes for real.

## How it fits together

- `app/` is a Next.js 15 app (`app/app/**` pages and routes, `app/lib/**` the logic). The server uses Supabase with the
  secret key only; every table has row level security on and no policies.
- `app/lib/brand.ts` reads `app/brand/studio.json` (names, shows, handle, audience, booking offer, time zone, posting
  slots, palette). Nothing else hard-codes the brand.
- Every Claude call goes through `app/lib/skill.ts` `run()` with the brain connected as an MCP server
  (`app/lib/brain.ts`: `BRAIN_MCP_URL`, `BRAIN_MCP_TOKEN`). The brain is `supabase/functions/studio-brain` reading the
  `brain_*` tables, or the owner's own second brain (BRAIN.md).
- Cloud jobs (`app/lib/render.ts`, `produce.ts`, `animated.ts`, `thumbnail.ts`) start Vercel Sandbox machines that
  download the newest `studio-media/uploads/<ts>-<name>.tgz` and run its `run.sh` with a `context.json` that includes
  the `studio` brand block (`engines/README.md`).
- Publishing goes through `app/lib/scheduler.ts` only (`SCHEDULER` picks `contentstudio.ts` or `metricool.ts`).
- The daily cleanup is `app/lib/retention.ts`, run by Vercel Cron at `/api/cron/retention` (RETENTION.md).
- `RULES.md` lists every rule and where it lives.

## Changing it

- Names, shows, colours, rhythm, time zone: `app/brand/studio.json`, then redeploy.
- Voice, offers, proof, the review standard, how reels and carousels look: the brain documents (`node
  app/scripts/brain.mjs doc ...`), no deploy needed.
- An engine: change it under `engines/`, then `bash engines/pack.sh <name> && node engines/upload.mjs <name>`.
- Check every code change with `npx tsc --noEmit -p .` and `npx next build` in `app/` before the owner deploys.
- The database: `supabase/schema.sql` is safe to run again; add to it rather than editing tables by hand.
