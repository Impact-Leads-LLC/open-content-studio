# Content studio: the rules it runs on

Every rule the studio follows, the code that enforces it, and where to see it working. "The owner" is the person in
`app/brand/studio.json` (`owner`); the coach is "Coach" plus their first name. Paths are inside `app/`.

## Finding the moments (Find the moments / Find more moments)

| Rule | Where | How to see it |
|---|---|---|
| Per episode: 5 to 8 reels, 10 carousels, 10 text posts, with two carousels and two posts for each of the five awareness levels. Per standalone idea: 3 to 6 animated reels, one carousel and one post per level. | `lib/moments.ts` `MIX` | The board's "Last look" line says what was added and which levels came up short. |
| Two scouts work side by side: one picks reels, the other picks carousels and posts. The coach then judges each format in its own call. | `findMoments` in `lib/moments.ts` | "Last look" shows the counts for each format. |
| Only reels are held to a score. The bar is 55; if that leaves fewer than 5 reels, kept reels down to 45 fill the gap, marked "under the usual bar". | `FLOOR`, `BACKUP` | The reel's card, and the count in "Last look". |
| Carousels and posts have no score bar. Each one is built out with the owner's training material in the brain: their frameworks, steps, scripts and client results. Every level gets its pieces even when the episode is thin. | `BUILD_OUT`, `moment.brain`, `brainNote` in `lib/stages.ts` | The piece names its brain documents. The writers, the carousel builder and the coach's truth test all read them. |
| Brain rules: a confidential document is never quoted, and a document from the owner's guest spot on someone else's show is used for their stories, never the teaching. | `BRAIN_RULES` in `lib/brand.ts`, the prompts in `lib/moments.ts`, `lib/skill.ts`, `lib/brainidea.ts` and `carousel-engine`; the brain connector labels both kinds of document | The coach's truth test. |
| Five awareness levels (unaware, problem, solution, product, most). The funnel follows the level. | `lib/stages.ts` | The stage filter. Its counts, "No stage" included, add up to All. |
| Pieces made before the levels existed get theirs on the next look. The team can set or change any piece's stage. | `lib/moments.ts` restage, piece page | The "Stage" picker on each piece. |
| One look at a time, run in the background, with its report saved on the episode. | `lib/concepts.ts`, `studio_episodes.moments`, `app/components/MomentsRun.tsx` | "Finding the moments" while it runs; afterwards what it found, what's short, and what was turned down and why. |
| Never two camera reels from the same stretch. | `overlaps` in `lib/moments.ts` | "Overlaps a reel already on the board" in the turned-down list. |

## Training material (no video needed)

| Rule | Where | How to see it |
|---|---|---|
| "From the training material" on the Episodes page, or the calendar's "Fill them from the training material" link. Claude picks a topic the owner teaches that hasn't gone out lately (or the topic named), gathers their own teaching on it from the brain, and the engine makes one carousel and one post for each level. No reels. | `lib/brainidea.ts`, `/api/ideas/brain`, `MIX.brain` | The idea's board says which documents it came from. |
| The calendar says how many carousel and post slots are open in the next seven days. | `app/page.tsx` | The line under the calendar's legend. |

## Words

| Rule | Where | How to see it |
|---|---|---|
| Every piece gets its words as soon as it's on the board: posts, reel and carousel captions, and the full episode's description. | `lib/copy.ts`, `lib/captions.ts`, `lib/posts.ts` | "Writing…" on the card, then the text. |
| The coach takes a first look before the team sees anything, and always leaves a note: what it fixed, that it passes, or that its look didn't run. | same | The piece's thread. |
| Every caption and post has a plain save line before the next step. It's added when the writer leaves it out. | `ensureSave` in `lib/platforms.ts` | "Save this post for later." above the last paragraph. |
| The next step is the lead magnet's keyword when one fits. Otherwise it's the full episode, or the booking offer (`bookingOffer` in `brand/studio.json`) for standalone ideas and product-aware and most-aware pieces. The first comment carries the matching link. | `ctaPlan` in `lib/platforms.ts`, send route | The caption's last paragraph and the first comment. `BOOKING_URL` (or `bookingUrl` in `studio.json`) sets the booking page. |
| The caption ends on the main network's next step (`primaryNetwork` in `studio.json`); other networks get their own last paragraph where theirs works differently. | `lib/captions.ts` | The caption, and each network's own caption. |
| Every caption fits each network's limit (Threads takes 500). | `captionFor`, `fitCaption` | The send result. |

## Visuals

| Rule | Where | How to see it |
|---|---|---|
| Every text post gets a branded graphic, the primary colour and light in turn, with the key word in the accent colour. The owner's headshot shows when `assets/postcard/head.jpg` is there; their initials otherwise. | `lib/cards.ts`, `lib/postcard.tsx` | The post's image. A failed graphic leaves a note. |
| Story carousels: a hook cover, one plain point per slide, a save slide and the outro, 10 slides at most. | `carousel-engine`, `lib/render.ts` | The built deck. |
| A new carousel builds its deck on its own as soon as it's on the board. Its caption is then written from the finished slides, and the coach reviews it. | `draftCopy` in `lib/copy.ts`, `lib/carousels.ts` | "Building the carousel on its own" in the thread, then the slides. |
| When a carousel has no episode still for its cover (an idea, or training material), the cover gets a generated picture: one object or place from the topic. Never a person. With no fal key the cover sets the hook larger instead. | carousel-engine, `FAL_KEY` | The cover. The build log says so. |
| Boards in the primary colour (harbor blue `#1E4E6E` by default), the accent (yellow `#FFC530` by default) as an accent only. | `palette` in `brand/studio.json`, every engine (`studio` in context.json) | Renders. |
| Thumbnails use the owner's own photos from the brain, cut out on the machine when no cutout comes with them. Never a regenerated face. | `lib/thumbnail.ts`, `thumb_pick`, thumb-engine | The thumbnail panel on the episode. |

## Calendar and publishing

| Rule | Where | How to see it |
|---|---|---|
| By default 9:00, 12:00 and 17:00 in the studio's time zone, one reel, one carousel and one post a day. The full episode has Sunday 9:00 to itself. All of it is set in `slots` in `brand/studio.json`. | `lib/cadence.ts` | The calendar. Every time shows in the studio's time zone, whatever the viewer's clock says. |
| Every kept piece takes the next open slot, including pieces added by hand and the produced episode. | piece routes, `episodeMade` | `scheduled_at` on the piece. |
| Posts go to the one scheduler named by `SCHEDULER` (ContentStudio or Metricool). Nothing is scheduled without a time zone. ContentStudio never guesses between two workspaces and never posts to one on `CONTENTSTUDIO_SKIP_WORKSPACES`. | `lib/scheduler.ts`, `lib/contentstudio.ts`, `lib/metricool.ts` | The send result. |
| Any other scheduler (`SCHEDULER=export`, the default): each piece has a posting kit (its files and each network's caption, written exactly as they'd be sent), "Scheduled it in <tool>" marks it, and the calendar downloads the next two weeks as a CSV for a bulk upload. | `lib/postkit.ts`, `app/components/PostingKit.tsx`, `/api/calendar/export` | The piece's "Post it in" panel and the calendar's CSV link. |
| Only the owner schedules, approves, sends back, answers the coach and picks thumbnails. The team makes and sends drafts. | the routes' `role` checks | A team account sees no Approve button. |

## Data retention

| Rule | Where | How to see it |
|---|---|---|
| Once a piece went out at least `RETENTION_DAYS` ago (7 by default), its media files leave storage, copied to Google Drive first when Drive is set up. A failed copy keeps them. | `lib/retention.ts`, `/api/cron/retention`, `vercel.json` | The piece's thread: "Cleared N files from storage". |
| Once every piece of an episode went out or was killed, the episode's footage leaves too. The transcript stays. | same | The Episodes page: "Footage cleared after posting". |
| Unposted work is never touched, and the text rows stay. | same | `RETENTION.md`. |

## Cloud jobs

| Rule | Where | How to see it |
|---|---|---|
| Every Claude call keeps going through paused brain lookups, and says so when an answer is cut off. | `lib/skill.ts`, and `plan.mjs`, `build.mjs` and `words.mjs` in the engines | Errors name the stop reason. |
| The newest upload of each engine wins (`uploads/<ts>-<name>.tgz`). | `lib/render.ts`, `lib/produce.ts`, `lib/animated.ts`, `lib/thumbnail.ts` | The job log. |
| A produced episode whose plan failed says it's the plain cut, so nobody approves it as produced. | `episodeMade` in the episode route | The episode's thread. |

## Settings an install needs

The full list with notes is `app/.env.example`; where each one comes from is `ACCESS.md`. Required: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `BRAIN_MCP_URL`, `BRAIN_MCP_TOKEN`, `SCHEDULER` with that scheduler's
keys, and `CRON_SECRET`.

## Known gaps

- Reels aren't made on their own: the team picks which ones to render, since each takes about 10 minutes of cloud time.
- Raw camera feeds are not copied to Drive before the cleanup clears them; only finished pieces are (RETENTION.md).
