# The say-back loop

The board can't change files. The member copies a line from a piece's "Say to Claude" box, or writes their own, and
pastes it into the chat. Ids are per episode (`r01`, `c02`, `p03`); when more than one episode is open, ask which one,
or accept `<episode-folder>/r01`.

| They say | You do |
|---|---|
| `approve r01 c02` / `approve everything that's ready` | `node "$S/pieces.mjs" approve <ep> r01 c02` (or `all-ready`). Then re-run the calendar. |
| `c02: use fixes 1 to 3` | Make exactly those fixes from its `review.json`, through the craft skill. Rebuild, lint, review again. |
| `p03: shorter, and lead with the 60 days` | Rewrite to the note, keeping everything that works. Rebuild, lint, review again. |
| `p03: my take is ...` (the coach's question answered) | Put their words in, trimmed only for length, as their take. Review again: the member test now asks whether their answer is in it. |
| `r01: start two seconds earlier` / `r01: crop on the left speaker` | Re-run `reel.mjs` with the new times or `--layout crop --focus 0.25`. Rebuild the cover if the first frame changed. |
| `c04: use the still from 12:40 for the cover` | `frame.mjs <video> 12:40 <piece>/cover.jpg`, set `cover.image`, re-run `carousel.mjs`. |
| `drop p07` | `node "$S/pieces.mjs" drop <ep> p07`. It leaves the board and the calendar. |
| `move c03 to Friday` | `node "$S/pieces.mjs" set <ep> c03 scheduled_at=<ISO time of Friday's slot>`, then re-run the calendar. |
| `posted r01 today` / `posted everything up to Tuesday` | `node "$S/pieces.mjs" posted <ep> r01 [--at <time>]`. Clearing happens later, through `studio-cleanup`. |
| `never say "webinar"` / any rule meant for every piece | Add it to `brand/coach.md` under "Rules <name> added" (dated), and to `brand/banned.md` when it's a phrase. Say you did. Check this episode's pieces against it. |
| `make another carousel from c02's insight for most-aware readers` | `node "$S/pieces.mjs" add <ep> --kind carousel --title "..." --stage most`, set its insight and library files, then write, build and review it like the others. |

After each round of changes:
1. Rebuild only what changed (`card.mjs`, `carousel.mjs`, `reel.mjs`, `cover.mjs`).
2. Lint and review again any piece whose words changed. A verdict the member overrides ("approve it anyway") stands:
   the member's decision beats the coach's.
3. `node "$S/board.mjs" <ep>` and publish it again to the same place (the same artifact, so the link stays).
4. Re-run `node "$S/calendar.mjs" <ep>` when anything was approved, dropped or moved.
5. Reply with one line per piece: what changed and its new verdict.

Suggestions the member turns down are noted in the piece's history (`pieces.mjs set <ep> <id> declined="..."`), and
the coach doesn't raise them again unless one fails the truth test.
