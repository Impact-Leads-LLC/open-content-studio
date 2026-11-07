# Data retention

Episodes are gigabytes. Reels, slides and graphics add up too. Once something has gone out, keeping its files in
Supabase storage costs money and helps nobody, so a daily cleanup clears them.

## What gets cleared, and when

**A piece's files**, once the piece went out at least `RETENTION_DAYS` days ago (7 unless you set it):

- a reel's video, cover, contact sheet, cut clip and voiceover
- a carousel's slides and contact sheet
- a text post's graphic or image
- the full episode piece's produced video, and its thumbnail images

"Went out" means the scheduler took it as a scheduled post (or someone marked it posted) and its date is that many days
behind. Before clearing, the cleanup asks the scheduler about each post; if one says it failed, the files stay and the
piece's thread says why.

**An episode's footage**, once every piece of that episode went out (and was cleared) or was killed, and the last one
went out at least `RETENTION_DAYS` days ago: the camera feeds, microphone tracks, the uploaded full video, the produced
episode and the word timings. The transcript stays, so the coach, the training-material ideas and the brain can still
read it. The Episodes page then says "Footage cleared after posting".

## What is never touched

- Anything not yet posted: ideas, kept pieces, drafts, pieces waiting for the owner, approved or scheduled pieces whose
  date hasn't come, and pieces whose post failed.
- An episode with even one piece still in progress.
- An episode where every piece was killed and none went out: there's no post date to count from, so its footage
  stays until you delete it on the episode page or in Supabase's storage browser.
- A file another piece still uses (for example one episode image picked for two posts) until that piece is cleared too.
- The text: every piece, caption, post, review, note and thread stays in the database. So do transcripts.
- The podcast: audio and artwork live in the public `podcast` bucket and stay as long as the feed needs them.
- The brain: `brain-assets` is never touched.
- The engines in `studio-media/uploads/`.

## Google Drive first (optional)

When Drive is set up (`GOOGLE_DRIVE_KEY` and `DRIVE_FOLDER_ID`, see ACCESS.md), every scheduled piece is already
copied to Drive when it's scheduled. The cleanup checks: a piece with no good copy gets one first, and if that copy
fails, the piece keeps its files and tries again the next day. Without Drive, files are cleared with no copy, and the
thread says so.

Raw footage is not copied to Drive (it's often tens of gigabytes per episode). If you want to keep it, download it from
the episode page, or keep your recording tool's own copy, before the last piece of the episode goes out.

## The record

Every clearing writes a note in the piece's thread, for example: "Cleared 4 files from storage, 7 days after it went
out (RETENTION_DAYS). Copies are in Google Drive: <link>. The text stays here." The piece's `media.retention` holds the
time, the exact paths removed and the Drive link, and the piece's status becomes `posted`. Episode footage is recorded
in the thread of the episode's full-episode piece.

## How it runs

- `vercel.json` schedules `GET /api/cron/retention` once a day (07:30 UTC). Vercel Cron needs the project to have
  `CRON_SECRET` set; Vercel sends it as `Authorization: Bearer <CRON_SECRET>` with every cron call.
- The middleware lets `/api/cron/` through only with that exact header (no session, no other way in), and the route
  checks it again.
- The code is `app/lib/retention.ts`. It handles up to 500 pieces and 500 episodes a run; anything more waits a day.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `RETENTION_DAYS` | `7` | Days after a piece goes out before its files are cleared. `0` clears on the next run after the post date. `off` turns the cleanup off. |
| `CRON_SECRET` | none | Required for the cron to run at all. |
| `GOOGLE_DRIVE_KEY`, `DRIVE_FOLDER_ID` | none | Copy to Drive before clearing. |

## Checking it

To see what the next run would clear without clearing anything, call it yourself with the secret (from your own
terminal, never pasted into a chat):

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "https://your-studio.vercel.app/api/cron/retention?dry=1"
```

The answer lists the pieces and episodes it would clear, the ones it's holding and why, and any errors. Vercel's
project page (Settings > Cron Jobs) shows each run.
