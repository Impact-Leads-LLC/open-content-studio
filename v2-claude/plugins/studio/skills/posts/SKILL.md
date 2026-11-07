---
name: posts
description: "Writes text posts for LinkedIn, Facebook, Threads and other networks in the member's voice, for one awareness level, built out from the member's library: a stop-test first line, one idea, something worth saving, a save line and one next step, plus the words for the post's graphic card. Use for: write a post, a LinkedIn post, turn this into a post, a week of posts, rewrite this post."
---

# Posts

One idea, told well in writing, for one reader at one awareness level, in the member's voice, with something the
reader would save. Structure from good post craft; voice and facts from the member's studio folder.

**Scripts.** `S="<this skill's base directory>/../../scripts"` (Claude shows the base directory when the skill loads).

Load first: `studio/brand/voice.md` (the real examples beat every rule), `brief.md`, `banned.md`, `coach.md` (the post
is judged by its seven checks, so write to pass them), the piece's plan in `pieces.json`, and the member's playbooks
`studio/playbooks/posts.md` and `hooks.md` (when one is missing, the plugin's `templates/playbooks/` copy, two levels
up from this skill). The brand files win over the playbooks, and the playbooks win over this file.

## The material

- The source excerpt: the transcript around the piece's `start` (a few minutes), or the library notes for a
  library run.
- The library files the piece names (`library`), read whole. Build the post out with what the member teaches there:
  steps, scripts, frameworks, client results. A private file is for understanding only, never quoted; a guest-stage
  file is for stories and voice, never the teaching.
- Every number and claim comes from these with its owner and its condition. Never invent the member's opinions,
  stories or experiences. A guest's idea is credited to the guest by name.

## Pick the type (by level, and to keep a week varied)

Pick one of the types in the posts playbook by the piece's level, and vary the types across the week
(`pieces.mjs recent` shows what went out lately). Its shape and length are the type's; "What makes a post work" and
"Your changes" apply to every post.

## Write it

1. Three hook options first (the `hooks` skill's written-line rules). The first line is a door, never a summary.
2. The body in the type's shape, the way the posts playbook says a post works, with specific numbers from the source
   and the member's own way of putting things (from `voice.md`).
3. Give them something to keep: steps they can follow, a script they can copy, a checklist, numbers they can use.
4. **The save line**, its own short paragraph, just before the last: one plain line asking them to save it, specific
   when it can be ("Save this for your next proposal.").
5. **One next step**, the last paragraph, by the piece's `cta`:
   - a lead magnet keyword: "Comment GUIDE and I'll send you the pricing guide." (or "DM me GUIDE", or the link, as
     `settings.lead_magnets` says it's delivered), the keyword in capitals exactly as given;
   - `EPISODE`: the full episode, with the guest's name for a guest episode;
   - `CALL`: the member's call, by its exact name, with what it gets them.
   A link goes in only when it's in `settings.json`; never a placeholder like [LINK]. LinkedIn: say the link is in
   the first comment and put it there (`First comment:` below).
6. No hashtags unless `brief.md` allows them. At most one emoji, and only if `voice.md` uses them.

## The gate

Run the `humanizer` skill's loop, then `node "$S/lint.mjs" <piece>/post.md --kind post` until it's clean. Then the
voice test: would the member read this aloud and recognise themselves?

## Files (in the piece's folder)

`post.md`: the post exactly as it would be pasted (each paragraph on one line, never wrapped by hand), then a line of
three dashes, then anything for the calendar:

```
<the post>

---
First comment: <the link or the keyword reminder, when the network needs one>
On threads: <a different last paragraph for this network, only when the main one doesn't work there>
```

Notes for the member (a line to check, a choice you made) go in `notes.md`, never in `post.md`.

`card.json` for the post's graphic (the `post-card` skill): the post's point in 4 to 12 words, in the member's
words from the post, with the one key word or number in *asterisks*.
