# Design: how your graphics look, and why

The studio draws every graphic from templates: carousel slides, post cards, and reel and story covers. Claude writes
the words; the templates set the type, the colours and the spacing from `brand/palette.json`. That's why the pieces
look designed and consistent instead of improvised. This page is the system behind them, and the settings you can
change.

## Eight rules every graphic follows

1. **Phone first.** Judge every graphic at a third of its size, the way it shows in a feed. If it doesn't read there,
   it doesn't work.
2. **One idea, set big.** Few words, large type. A graphic is a headline, not a page.
3. **One accent.** The accent colour marks the single word or number that carries the charge, once per graphic. Two
   accents cancel each other out.
4. **Strong contrast.** Dark type on a light ground, white type on your brand colour. Never grey on grey, never light
   on light.
5. **Room to breathe.** Wide margins and nothing jammed into corners. The empty space is what makes big type read.
6. **Real pictures, or none.** A still from your own video, a photo of you, or a generated picture of one object or
   place. Never stock photos of people, AI-made people, clip art, or emoji used as icons.
7. **Take turns.** Post cards alternate two looks and covers rotate their treatments, so your grid doesn't repeat.
8. **The same system every time.** The same fonts, colours and margins on every piece, so people know it's you before
   they read a word.

## Your colours (`palette.json`, under `colors`)

| Setting | What it colours | Default |
|---|---|---|
| `board` | Your main colour: carousel covers and outros, the board look of post cards, plain covers | `#1E4E6E`, deep blue |
| `accent` | The one key word or number per graphic, and the outro's button | `#FFC530`, yellow |
| `ink` | Dark type on light grounds | `#0C1A24` |
| `text` | Body type on reading slides | `#3A4651` |
| `soft` | The light ground of reading slides and light cards | `#F4F6F8` |
| `mist` | Light type on the board colour, under the headline | `#E8EEF3` |
| `deep` | Step numbers and arrows on light slides | `#1E4E6E` |
| `on_accent` | Type set on an accent fill | `#0C1A24` |
| `chip` | The small label on carousel covers | `#0F0F0F` |

Picking yours:
- `board` must be dark enough for white type to read on it at a third of size. A light or bright brand colour works
  better as the `accent`, with a dark `board`.
- `accent` must be bright, and readable both on the board colour and with dark type on it. Yellow, orange, lime, coral
  and bright cyan usually work. Use it for nothing else.
- Set `deep` to your board colour unless your board colour is very light.

## Type (`palette.json`, under `fonts`)

- `head`: headlines and covers, in a heavy weight (800 or 900) with tight lines.
- `body`: reading slides and small lines, in three weights (400, 500 and 600).
- `caption`: the words burned into reels: one static bold or black `.ttf` file.

The kit ships Libre Franklin and Poppins, both free under an open licence. Your own fonts go in `studio/assets/fonts/`,
named here; use only fonts you're licensed to use. The templates shrink type to fit, down to a floor. When a line still
won't fit, the studio cuts words instead of shrinking it further.

## Other settings

- `dots`: a faint dot grid on board-coloured grounds, so they read as a surface (`true` or `false`).
- `logo` and `headshot`: files in `studio/assets/` for post cards and outros, or `null`.

## The formats

- **Carousel (1080x1350):** the cover is the hook as one sentence over three lines, its key words huge in the accent
  colour, with a small sticker saying what the reader gets. Reading slides sit on the light ground with two or three
  short blocks and one bold line each. The outro, on the board colour, carries your next step as a button.
- **Post card (1080x1350):** the post's point in 4 to 12 words, one word in the accent. Two looks take turns: `board`
  (your colour, white type) and `light` (the light ground, dark type, the key word on an accent mark). Your name, line
  and handle sit at the foot.
- **Reel and story cover (1080x1920):** the cover line large, with one accent, kept inside the middle band that a
  profile grid shows. Three treatments rotate: `fade` (over your photo with a dark fade), `slab` (on a dark label, for a
  busy frame) and `board` (no photo, your colour).

## Pictures, in this order

1. A still from the video at the moment the idea lands: face clear, mid-gesture rather than mid-blink.
2. A photo of you from `studio/assets/`.
3. A generated picture, if you turned it on: one real object or place from the topic. Never a person, a face, hands,
   words, numbers or logos.
4. No picture: the hook sets larger. Many of the best covers have none.

## What makes graphics look AI-made (the studio avoids all of it)

- Gradients, glows, glass effects and drop shadows.
- Everything centred, with an icon above every line.
- Emoji or clip-art icons as bullets.
- More than one accent colour, or the accent used as decoration.
- Thin grey type, tiny type, or paragraphs on a slide.
- Dash bullets, short decorative rules, and coloured bars across the top of cards.
- Filler labels ("Tip #1", "Did you know?") and headlines that name a topic instead of saying something.
- Pale beige grounds with thin serif type.

## The check before anyone sees it

Look at every graphic at a third of its size. Does it read in one second? Is the accent on the word that matters? Is
anything crowded, cut off or empty? Would it sit well next to your last ten posts?

## Your changes
<!-- Rules here beat everything above. For example: "always the light look for client results", "no generated
     pictures", "my logo on every outro". Colours and fonts themselves go in palette.json. -->
