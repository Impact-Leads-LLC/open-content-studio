# The loop

The call carries exactly one mark: a loop around the hero, in the accent colour. The wall and the board carry none
(their hot colour is the sticker or the tag). No strike, no underline, no divider: those are long horizontal lines,
which read as AI-made and fight the type.

The loop is drawn by the generator (`loop_mark` in `thumbkit/looks.py`): a superellipse (n = 4) padded around the
hero's ink, opening at the top right, ending slightly outside its start, wobbling a little, tilted -2 deg, stroke 20 px
tapering to 55 % at the ends, drawn at 4x and downsampled. A per-run seed changes its wobble so two runs never draw the
same loop. Wherever it would cross the host's face it is cut away.

`assets/marks/` is where hand-drawn loops would go if a studio wants its own strokes later; the renderer doesn't read
it yet.
