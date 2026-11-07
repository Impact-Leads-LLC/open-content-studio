# Access: every account, endpoint and key

Everything the studio connects to, where each key comes from, and where it goes. Keys go in Vercel's settings (or
`app/.env.local` on your own computer for the scripts), never in a chat, an email or a file you commit. The guided
setup tells you where to paste each one; it never asks you to paste a key to Claude.

## Accounts you need

| Service | Plan | Why |
|---|---|---|
| Supabase | Pro (about $25 a month) | The database, sign-in sessions, storage for footage and renders (uploads over 50 MB need Pro), and the brain's edge function |
| Vercel | Pro (about $20 a month per member) | Hosts the app, runs the cloud machines (Vercel Sandbox) for long jobs, and the daily cron |
| Anthropic | Pay as you go | Claude: finding moments, writing, reviewing, planning edits |
| ContentStudio or Metricool | A plan with API access (Metricool: Advanced or above) | Scheduling and publishing |
| GitHub | Free | Holds your copy of the app; Vercel deploys from it |
| Google Workspace or Google Cloud | Optional | A shared drive for copies of finished pieces |
| fal.ai | Optional, pay as you go | Generated cover pictures for carousels with no episode still |

## Keys and settings, one by one

| Setting | Where it comes from | Where it goes | Notes |
|---|---|---|---|
| `SUPABASE_URL` | Supabase > Project Settings > API (or Data API): Project URL | Vercel, `app/.env.local` | Not secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API Keys: the **secret** key (`sb_secret_...`), or the legacy `service_role` key | Vercel, `app/.env.local` | Full access to your database. Never the publishable or anon key (the app refuses it). |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys > Create key | Vercel | Set a monthly spend limit in the console. |
| `BRAIN_MCP_URL` | `https://<project-ref>.supabase.co/functions/v1/studio-brain/mcp` (or your own brain's address) | Vercel | Not secret. |
| `BRAIN_MCP_TOKEN` | You make it: a long random string (`openssl rand -hex 32`) | Supabase function secret `STUDIO_BRAIN_TOKENS` **and** Vercel `BRAIN_MCP_TOKEN` | The same value in both places. Add more tokens to `STUDIO_BRAIN_TOKENS` (comma separated) for other places you connect. |
| `SCHEDULER` | You choose: `contentstudio` or `metricool` (they connect), or `export` for any other tool (no key: posting kits and a calendar CSV) | Vercel | |
| `CONTENTSTUDIO_API_KEY` | ContentStudio > Settings > API keys | Vercel | ContentStudio only. |
| `CONTENTSTUDIO_WORKSPACE_ID` | The workspace's id in ContentStudio's address bar | Vercel | Needed when the key sees more than one workspace. |
| `CONTENTSTUDIO_SKIP_WORKSPACES` | You choose | Vercel | Names of workspaces this studio must never post to. |
| `METRICOOL_API_TOKEN` | Metricool > Account settings > API | Vercel | Metricool only. |
| `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` | The `userId` and `blogId` in app.metricool.com's address bar | Vercel | `blogId` is the brand; leave it out with a single brand. |
| `CRON_SECRET` | You make it: a long random string | Vercel | Vercel Cron sends it to the daily cleanup. |
| `RETENTION_DAYS` | You choose (default 7, or `off`) | Vercel | RETENTION.md. |
| `BOOKING_URL` | Your booking page | Vercel (or `bookingUrl` in `app/brand/studio.json`) | Not secret. |
| `GOOGLE_DRIVE_KEY` | Google Cloud console > IAM > Service accounts > Keys > Add key (JSON). Add the service account's email to your shared drive as Content manager | Vercel | Paste the whole JSON file's contents. |
| `DRIVE_FOLDER_ID` | The folder's address in Drive (the part after `/folders/`) | Vercel | |
| `FAL_KEY` | fal.ai > Dashboard > Keys | Vercel | Optional. |
| `CLAUDE_MODEL`, `PODCAST_BASE_URL`, `SCHEDULER_PREFER_ACCOUNTS` | You choose | Vercel | Optional; see `app/.env.example`. |

## Endpoints the studio uses

| Endpoint | Used by | For |
|---|---|---|
| `https://<ref>.supabase.co/rest/v1`, `/storage/v1` | the app, the scripts | Database and files (secret key) |
| `https://<ref>.supabase.co/functions/v1/studio-brain/mcp` | Claude, from the app and the cloud machines | The brain (bearer token) |
| `https://api.anthropic.com` | the app, the cloud machines | Claude |
| Vercel Sandbox | the app | Cloud machines for reels, carousels, episodes, thumbnails, transcription |
| `https://api.contentstudio.io` or `https://app.metricool.com/api` | the app | Scheduling |
| `https://www.googleapis.com` | the app | Drive copies (optional) |
| `https://fal.run` (fal.ai) | the carousel machine | Cover pictures (optional) |
| `https://<your-studio>/feed/<show>.xml` | podcast apps | Your podcast feed (public) |
| `https://<your-studio>/api/site/podcast` | your website, if you build pages from it | Published episodes as JSON (public) |
| `https://<your-studio>/api/cron/retention` | Vercel Cron | The daily cleanup (`CRON_SECRET` only) |

## Who can do what in the app

- **Owner** (one account, `role = owner`): approves, sends back, answers the coach, schedules, picks thumbnails, adds
  coach rules, publishes podcast episodes and manages the feed.
- **Team** (`role = team`): everything else: finds moments, keeps and kills ideas, makes pieces, applies fixes, sends
  drafts to the scheduler, sends pieces to the owner.

Accounts are made with `node app/scripts/invite.mjs` (a one-time link, valid seven days). There's no public sign-up.
To remove someone, set `active` to false on their row in `studio_users`.

## If a key leaks

Rotate it where it came from, update it in Vercel, redeploy. For the brain token, remove it from `STUDIO_BRAIN_TOKENS`
(`supabase secrets set STUDIO_BRAIN_TOKENS=...` with the others) and set a new one in Vercel. The app strips anything
shaped like a key from the error messages it shows.
