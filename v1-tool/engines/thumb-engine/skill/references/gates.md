# Gates G1-G13 (the call, the wall, the board)

Every render runs G1-G13 (`thumbkit/gate3.py`), thresholds in `tokens.json` `v3.gates`. A hard fail stops delivery;
fix the words, the look or the photo, never the number. Everything runs on the cloud machine with Python and Pillow.
Each render writes the layers the gates read: `<id>-pregrain.png`, `<id>-person.png` (the person's alpha),
`<id>-person-ref.png` (the global-only reference), masks `<id>-{graphics,front,front_solid,mark,accent,type,photo}.png`,
one `<id>-t-<element>.png` per text element, and `<id>-gate.json`.

| # | Pass when |
|---|---|
| G1 | 1280x720, the JPEG under 2 MB |
| G2 | words in caps; the thumbnail punctuation `' ? % -` only (no commas, no em or en dashes); support <= 2 words, hero 1, sticker <= 2, <= 5 in all |
| G3 | type and loop ink >= 16 px inside every edge |
| G4 | 0 px of type, tag, sticker, board, loop or their shadows in the duration-badge corner (x >= 960, y >= 552); the person and the photo (the print, the guest window) may pass under it |
| G5 | one hot colour, measured on the render outside the person and the photo: when the look carries its payoff element (the call's loop, the wall's sticker, the board's tag) the accent covers >= 0.4 % of the frame there, and the accent covers <= 0.05 % anywhere else |
| G6 | the head (crown to chin): call 300-430 px, wall 400-460, board 300-350 |
| G7 | no type, tag, sticker or loop within 48 px of the person's face box; on the call nothing in front of the guest's face (below its top quarter, the scalp) and nothing within 16 px of it, the person included |
| G8 | face lock: inside the face (the central ellipse of the face box, the alpha solid and eroded 6 px) the frame before grain equals the global-only reference of the person's own pixels, mean abs diff <= 0.5, max <= 2; the placement is never mirrored or rotated |
| G9 | the wall's number keeps its identity, the person and the front elements counted (solid elements, not shadows). One character: the person hides <= 6 % of its ink, <= 0.5 % of its top band (top 20 %) and <= 3 % of its foot (bottom 8 %), only on the half next to them; everything in front covers <= 20 %. Two to five: the person hides <= 30 % of any character (<= 25 % for the first and last), only in the bottom 55 % of the cap height; everything in front covers <= 45 % of any character |
| G10 | type contrast at 1280 (glyph median against the 2-4 px ring): type on the accent >= 4.5:1 against the accent (`on_accent_min`); white type on ink, on the board or on the photo >= 7:1 (`type_contrast_min`) |
| G11 | the 168 px read: each element's cap height >= 9 px at 168, and separation <= 8 % (around white type the share of light pixels, > 160, in the 2-7 px ring; around ink type the share of dark pixels, < 95). A warning (G11w) under 14.7 px at 168 |
| G12 | feed: frame mean >= 60, near-black (< 20) <= 45 %, border mean >= 28 on two sides or more |
| G13 | the call's guest frame is a real frame from the episode: a `guest.json` from `thumb.py guest-frame` (video, time, detector) whose image hash matches the frame used |

## Why G11 has no OCR

The cloud machine has no OCR. Cap height at 168 px catches type set too small, and separation catches a white word
crossing the light number without its dark glow (a wall without the glow measures about 18 % against a limit of 8 %).
Read the feed sheet at 168 px by eye before you pick.

## What fails before the gates

A copy-fit overflow (refused before render), words that break G2 (refused before render), a look the photo can't play
(the call with the person on the left, the wall or the call with no cutout, a photo with no clear face).

## Manual checks (on the sheets, before picking)

Cover the words; the expression matches the hook type; the truth test; not the darkest tile in dark mode; on a cutout
made on the machine, a clean hair edge at 2x.
