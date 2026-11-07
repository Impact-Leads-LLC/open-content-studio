# Editorial list

Use this format only when the content is a list of parallel items, each worth its own slide
("5 mistakes", "3 questions to ask"). It is one format among several. Build it with the kit
(HTML) and render with `scripts/render.py`; the positions below are the target layout.

Themes: White (body class none) or dark (`body.navy`). Colours come from the kit's palette.

## Cover (slide 1)
- Byline top-left (the host's name, Poppins 22px, muted) and the handle top-right.
- **Numeral**: Libre Franklin 800, about 300px, the primary colour, centred, top third. A single power word
  works instead when the piece isn't a count.
- **Title**: Libre Franklin 700, 110 to 120px, ink, caps, one or two words per line, centred.
- **Kicker** (optional): Poppins 30px caps, letter-spacing 6px. No thin rules either side.
- **Bar**: 900px wide solid rectangle in the fill colour (`--fill`), 130px tall, square corners; Libre Franklin 700
  about 86px caps in ink. If the words won't fit at 86px, cut words; never shrink the type.
- **Subtitle** (optional): Poppins 26px muted, one line.
- Page mark bottom-right ("01 / 07", Poppins 20px). The cover block sits centred vertically.

## Content slide (slides 2 to N-1)
Top to bottom:
1. **Page mark** top-right: "4 / 7", Poppins 20px, muted.
2. **Header row** (y about 110 to 230): a 150x120 number badge (ink fill, white numeral, Libre
   Franklin 700 64px; dark theme: the fill colour with a dark numeral), a 2px ink rule the
   badge's height 30px to its right, and the title in Libre Franklin 700 66px caps (two lines
   max). A header glyph at 128px on the right margin only when the brain has a glyph library.
3. **Lead statement** (y about 280 to 410): one sentence in Poppins 600 38px, 14 words max.
4. **Divider**: 1px ink hairline, margin to margin.
5. **List block**: a label in Poppins 600 34px ("Use:", "Instead of:"), then 3 to 6 rows 110px
   apart, each with a small dot in the primary colour (a glyph from the brain's library only
   when the rows are distinct things and the library has one). Text Poppins 30px, first word or phrase bold. Hairlines between
   rows at 20% opacity. Centre the label and rows between the two dividers so short lists don't
   leave a dead band.
6. **Divider**.
7. **Closing insight** (y about 1040 to 1180): two or three lines of Poppins 30px with the last
   clause in Poppins 600 32px. 22 words max.
8. **Footer**: handle bottom-left.

## Final slide
Same anatomy, badge reading "FINAL", the title naming the takeaway. The closing insight carries
the single CTA when there is one. Never recap the structure.

## Word budgets
Title 4 words max; lead 14; list item 6; closing 22. Cut words before shrinking type.

## Glyph sizes on the 1080 canvas (only with a glyph library)
Header 128px, lead and closing 96px, list rows 80px. Never under 72px.
