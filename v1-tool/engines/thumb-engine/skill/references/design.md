# Design foundations (read first, whole)

This file is what the builder holds in mind; re-read it, it fades after a few prompts. Numbers live in `tokens.json`
`v3`. Colours come from the studio's palette: **primary** (the board and the drawn backdrop), **accent** (the one hot
colour), **ink** (the print's inside and the tint in the shadows). Near-black ink (#0F0F0F) carries tags and hard
shadows; white carries the big type.

## The idea

A flat thumbnail sets a photo, a caption and a loop in three separate zones with a dead gutter between them: nothing
touches anything. Every look here puts a second plane in the frame and makes things overlap, so it reads as one scene
or one deliberate collage. One loud colour carries the payoff. The host stays themselves: their own photo, never
altered in the face.

## The three looks

### The call (hot colour: the accent loop)

The guest's real webcam frame is the problem in the picture, and the host is the fix in front of it.

| # | Layer | Notes |
|---|---|---|
| 0 | The backdrop: the brand background image, or the primary deepened until white type reads on it, lit behind the head, the outer edge burned, ink in the shadows | no people, no props |
| 1 | The guest's call window: the frame cropped to head and gesture (face from `guest.json`), white 16 px border, tilt 3 deg, hard ink shadow 14/16 | a real frame, graded globally (balance within 10 %, saturation 0.88, highlights rolled off) |
| 2 | The host's soft shadow on the window only | |
| 3 | The host, head 410 px, right side, overlapping the window's corner | side R photos only |
| 4 | The support line on an ink tag (Archivo 900 width 68, cap 100, white), tilt 6 deg, over the window's top-left corner | may cover the guest's scalp, never the face |
| 5 | The hero, white, Archivo 900 width 68 cap 170, bottom left, with the type halo | ends clear of the host's arm |
| 6 | One accent loop around the hero (stroke 20, tapered, drawn by the generator) | cut away near the host's face |

### The number wall (hot colour: the accent sticker)

A giant number behind the host's head; the head sits in front of it, so the type is the wall.

| # | Layer | Notes |
|---|---|---|
| 0 | The backdrop, burned at the top behind the number, a glow beside the head, the outer edge burned on the host's side | |
| 1 | The number, Archivo 900 width 80, lightest near the head, with a soft halo | one character: cap 600 (the tall layout); two to four: cap 336; five: cap 290 (the wide layout) |
| 2 | The host's cast shadow on the number only | |
| 3 | The host, head 430 px, crown y 250 | from a cutout only |
| 4 | The support word, white, in front, with a dark glow clipped to the number and a hard ink shadow, so it cuts out of a light number | the outer margin, ending 48 px clear of the face |
| 5 | The sticker: the accent, rounded 10 px, type in ink or white (whichever reads on the accent), tilt 3 or 6 deg, hard ink shadow | the payoff; out of the badge corner |

The number keeps its identity: one character may lose only a sliver of the side next to the host, never its top band
or foot; two to five characters have per-character limits in their bottom part (`gates.md` G9). The renderer moves
the number away from the host until that holds; if it can't, the wall is not playable for that photo.

### The board (hot colour: the accent tag)

A card on a table, never a room.

| # | Layer | Notes |
|---|---|---|
| 0 | Flat charcoal with a soft vignette | no backdrop, no hot spot |
| 1 | The board: the primary (deepened if its words wouldn't read at 7.5:1), 800x480, tilt 2.5 deg, hard ink shadow | |
| 2 | The words on the board in Libre Franklin Black, white (or ink on a light primary), centred on the board's visible part: a number hero at cap 200, a word hero at cap 120, the support line at cap 84 | `order` decides which line is on top |
| 3 | The tag on the board: the accent, Archivo cap 74, tilt -3 deg, its hard ink shadow | the payoff, and the one hot colour |
| 4 | The print: white 20 px frame, upright, its hard ink shadow | the host is never rotated, so the print never tilts |
| 5 | The host in the print, head 330 px, the head breaking 40 px out of the top. Without a cutout: the plain photo fills the print, head about 320 px | |

## Type

- Archivo variable for white type and tags (weight 900; width 68, 72, 76 or 80 per element, fixed in tokens), Libre
  Franklin Black for words on the board.
- Sizes are fixed per look and element. Copy-fit measures the real ink and rejects; never scale, squeeze, re-track or
  swap the width axis to make a line fit.
- No commas, no em or en dashes; the thumbnail punctuation is `' ? % -`.

## Colour

One hot colour per thumbnail: the accent, on the call's loop, the wall's sticker or the board's tag. The accent is
never a background. Type on the accent is ink or white, whichever reads better (`G10` checks it).

## The host

- Sources: the owner's own photos from the brain, never generated. Placed from the cutout at the look's head size,
  refined only at the edge (choke 1, feather 0.7), black-matched and graded with the thumbnail look as one global
  operation, light-wrapped at the edge with the face ellipse kept to the person's own pixels, and grained with the
  rest of the frame.
- The face lock is checked on every render (G8): inside the face the frame before grain equals the global-only
  reference.
- Head size by look: call 300-430 px, wall 400-460, board 300-350.

## Banned behaviours

- Never mirror, rotate, regenerate, smooth, beautify, relight or re-age the host's face, or make any local edit inside
  it. Nothing in front of the face.
- Never a generated guest, prop or face. The guest's frame is grabbed from the episode by `guest-frame`.
- Never two hot colours in one thumbnail. Never the accent as a background.
- Never scale, squeeze or re-track type to fit. Never force a look a photo or an episode can't play.
- Nothing but the host and the photo (the print, the guest window) in the duration-badge corner.
- No strike, underline, divider or long horizontal rule; no clip-art icons, no flat dash bullets.
