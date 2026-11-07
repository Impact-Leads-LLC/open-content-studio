---
name: post-card
description: "Makes the branded graphic that goes out with a text post: one 1080x1350 card with the post's point in big type, the one key word in the accent colour, the member's name, line and handle, in two looks that take turns (the brand colour, or light). Use for: post graphic, a card for this post, quote card, image for this post."
---

# The post card

Every text post goes out with a graphic: its point in big type, so it stops a scroll in the feed. Two looks take
turns across an episode so the feed doesn't repeat: `board` (the brand colour with white type and the key word in the
accent colour) and `light` (a light ground, dark type, the key word on an accent mark). The accent is for that one
key word only. Previews: `examples/previews/post-card-board.jpg` and `post-card-light.jpg` (two levels up from this
skill).

**Scripts.** `S="<this skill's base directory>/../../scripts"`. Follow the member's design playbook,
`studio/playbooks/design.md` (when it's missing, the plugin's `templates/playbooks/design.md`), including its "Your
changes".

## The words

`card.json` in the post's folder:

```json
{ "line": "Send the first invoice on *day one*", "look": "board", "label": "" }
```

- `line`: the post's point in 4 to 12 words, in the member's words from the post (a line from it, or its point said
  shorter). The one key word or number in `*asterisks*`. A statement, never a topic ("Why invoices matter" fails;
  "Send the first invoice on day one" works). No em dashes, nothing from `banned.md`, no two-fragment stacks.
- `look`: `board` or `light`; alternate across the episode's posts.
- `label`: optional, a small dark label at the top (a series name, "Episode 12"). Usually empty.

The name, name line, handle and (when the member gave one) headshot or logo come from `studio/brand/settings.json` and
`palette.json`. The words must make sense with no post beside them.

## Render

```bash
node "$S/card.mjs" <piece>/card.json
```

Writes `card.png` (and `card.html`). `OVER:` means the line doesn't fit even at the smallest size: shorten it. Look at
it at a third of size: does the line read in a second, and is the accent on the word that carries the charge?
