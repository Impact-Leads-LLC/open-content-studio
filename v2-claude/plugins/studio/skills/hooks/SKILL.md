---
name: hooks
description: "Writes five hooks from a transcript, post or draft, each a different mechanism traced to a source line: the spoken open for a reel, the written first line for a post or caption, and a cover line (3 to 8 words, 40 characters, one accent) for reel and carousel covers. Voice and bans come from the member's studio folder. Use for: write hooks, hook this, five hooks, a cover line, a better first line."
---

# Hooks

Five hooks from one piece of content, each a different way in, each traceable to a sentence the content pays off,
each in the member's voice. **Extract before you write:** the best hook is usually already in the source as a line the
speaker said, a figure they quoted, or a belief they took apart. A hook that could open a post on any topic has failed.

**Scripts.** `S="<this skill's base directory>/../../scripts"` (Claude shows the base directory when the skill loads).

Load `studio/brand/voice.md`, `brief.md` (the reader, the pillars), `banned.md` and the member's hooks playbook,
`studio/playbooks/hooks.md` (when it's missing, the plugin's `templates/playbooks/hooks.md`, two levels up from this
skill). The brand files win over the playbook, and the playbook wins over this file.

## 1. Extract (write this list before any hook; leave a slot empty rather than invent)

1. The one idea, in one plain sentence.
2. The most surprising claim, quoted.
3. Every specific: figures, durations, dates, places, names, quoted lines, each with the sentence it came from.
4. The wrong belief: can you write "most [role] think A; this shows B" from the source alone? If not, there's no
   contrast hook here.
5. The admitted cost or mistake, with its figure.
6. The story: any narrative with a beginning and an outcome, and the moment it starts.
7. The quotable line: one or two sentences that would open the piece untouched.
8. The reader, as precisely as the source allows.
9. What the piece pays off. Hooks promise this and nothing more.

## 2. Five hooks, five ways in

One hook for each of the five ways in from the hooks playbook (flat claim, wrong belief, specific, reader or cost,
story or quote), following its rules and its "never open with" list, then its "Your changes". Built only from the
extraction list above:

- No wrong belief in the source: use an objection ("You'll say clients won't pay up front. ...") or a second
  specific instead.
- The story-or-quote slot uses the speaker's own line untouched even if it breaks a style rule; label it `verbatim`
  so the member can veto it.
- No more than two of the five share an opening word. Sharpen "most people" to the reader from slot 8.

## 3. Format each hook

- **Spoken open** (reels): first beat 6 to 12 words, whole hook under 25 words, said in one breath, sixth-grade
  reading level at most.
- **Written first line** (posts and captions): under 140 characters (under 125 for Instagram, under 90 for a caption
  whose first line doubles as a YouTube title).
- **Cover line** (reel and carousel covers): 3 to 8 words, 40 characters or fewer. It tells a stranger scrolling a
  profile grid, with no sound and no caption, what they'll learn. Same idea as its hook, compressed, with a concrete
  noun. One phrase or one short sentence, never two fragments in a row. Sentence case, no end period, no hashtags, no
  emoji. Mark exactly one **accent**: the most loaded word or phrase, copied exactly. Optional break with `/`
  ("Your invoice is / the cash plan"), keeping the accent whole on one line. Never cut a cover line to fit: the cover
  builder steps the type down instead.

## 4. The gate (every set, before anyone sees it)

1. The `humanizer` skill's loop on the whole set.
2. Sweep against `voice.md` and `banned.md` (and `node "$S/lint.mjs" <file> --kind slides` on a file holding the set: that kind skips the save-line check,
which is for posts). Rewrite any hit
   from its source line.
3. Voice test: does each sound like the member talking to a peer?
4. Truth test: does any hook promise more than the content pays off, or carry a figure the source doesn't?
5. First-line test: would a reader who saw only this line keep going?
6. Cover test: read the five cover lines as thumbnails in a row. Does each say what the video is about?

A hook that fails after a rewrite is dropped; deliver four and say which failed. Never ship one to make the count.

## Deliver

```
Reader: ... · One idea: ... · Pays off: ...
1. Flat claim
Spoken: ...
Written: ... (n chars)
Cover: ... · accent: ...
Source: "..." -> pays off with "..."
```

Then one or two sentences on which you'd run first. In a studio run, write the chosen hook and cover line into the
piece's plan (`pieces.mjs set <ep> <id> hook="..." cover_line="..." cover_accent="..."`).
