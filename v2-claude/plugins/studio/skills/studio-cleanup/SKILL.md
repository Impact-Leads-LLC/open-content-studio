---
name: studio-cleanup
description: "Marks studio pieces as posted and clears the heavy files afterwards by the rule set in setup: renders (videos, slides, graphics) go a set number of days after posting, an episode's raw footage goes once every piece from it is posted or dropped, the words always stay, and nothing unposted is touched. Always shows the list and asks first. Use for: mark as posted, I posted these, clean up the studio, clear old renders, free up space."
---

# Posted, then cleared

Posted pieces keep their words, plans and reviews. Their heavy files go later, by the member's rule in
`studio/brand/settings.json` (`retention`):

- `renders_days` (default 7): a posted piece's renders (PNGs, JPEGs, MP4s, work files, its `to-post` folder) go this
  many days after its posting date.
- `raw_footage` (default `after_all_posted`): an episode's raw footage and work files go once every piece from it is
  posted or dropped and `raw_days` have passed since the last post. Only copies inside the studio folder
  (`episodes/<episode>/source/`) count: a video left where the member keeps it is never touched. `keep` turns this
  off.
- `action`: `delete` (for good) or `move` to `move_to` (an archive folder, an external drive, or a synced Google
  Drive or Dropbox folder).
- Nothing that isn't posted is ever cleared. Dropped pieces keep their files unless the member asks
  (`--include-dropped`).

**Scripts.** `S="<this skill's base directory>/../../scripts"`.

## Marking pieces posted

When the member says what went out ("posted r01 and c02 today", "everything up to Tuesday went out"):

```bash
node "$S/pieces.mjs" posted <ep> r01 c02 [--at 2026-11-10T09:00]
```

Use the real posting time when they give one (the calendar's slot is a good default). For "everything up to
Tuesday", list the pieces whose `scheduled_at` is on or before that day and confirm the list with them first.

## Clearing

1. Dry run, always first:

   ```bash
   node "$S/cleanup.mjs" studio
   ```

   It lists what it would clear, grouped by piece and episode, with the space it frees, and changes nothing.
2. Show that list to the member in plain words: which pieces, what kind of files, how much space, and whether they
   will be deleted for good or moved (and where). Ask for a yes.
3. Only after a clear yes for that list:

   ```bash
   node "$S/cleanup.mjs" studio --apply
   ```

4. Say what was cleared and that the words, plans and reviews are all still there.

Never run `--apply` without showing the list and getting a yes in the chat, even when the member set the rule up in
setup. If they want a different rule ("keep reels for 30 days", "move everything to my Drive folder"), change
`retention` in `settings.json` and say so.

A good habit: when a studio run starts, run the dry run; if something is due, mention it in one line.
