"""tokens.json loader. Every number the looks and the gates use comes from here; nothing is hard-coded.

The studio's palette replaces the colour roles at run time: render.py passes it as THUMB_PALETTE (JSON with primary,
accent, ink; the same object as context.json studio.palette). primary paints the board and the backdrop, accent the
loop, the sticker and the board's tag, ink the print's inside and the shadows' tint."""
import json
import os
import re
from functools import lru_cache
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]          # the skill folder: tokens.json, fonts/, assets/


def _hex(v):
    v = str(v or '').strip()
    return v.upper() if re.fullmatch(r'#[0-9a-fA-F]{6}', v) else None


@lru_cache(maxsize=1)
def load():
    t = json.loads((SKILL / 'tokens.json').read_text())
    try:
        pal = json.loads(os.environ.get('THUMB_PALETTE') or '{}')
    except ValueError:
        pal = {}
    c = t['v3']['colors']
    for role, key in (('primary', 'harbor'), ('accent', 'accent'), ('ink', 'navy')):
        if _hex(pal.get(role)):
            c[key] = _hex(pal[role])
    return t


def path(rel):
    """A path inside the skill folder (fonts, models)."""
    return SKILL / rel


def side_key(side):
    """The side of the frame the person sits on: 'left'/'L' -> 'L', 'right'/'R' -> 'R' (the words take the other)."""
    s = str(side).strip().lower()
    if s in ('l', 'left'):
        return 'L'
    if s in ('r', 'right'):
        return 'R'
    raise ValueError(f'side must be L or R, got {side!r}')


T = load()
W, H = T['canvas']['w'], T['canvas']['h']
FONT = path(T['font']['file'])
