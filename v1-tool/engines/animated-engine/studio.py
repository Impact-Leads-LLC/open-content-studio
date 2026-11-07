"""The studio's names and colours for this engine's Python builders (every engine carries its own copy of this file).

The app writes a `studio` object into /tmp/job/context.json: the owner's names, the brand, the show, the palette and
the fonts. Every name on screen comes from here, and every brand colour in the shipped looks is swapped for the
palette's matching role when the page is written (recolor), so a member changes the look in the app, not in the code.
"""
import json
import re
from pathlib import Path

# The defaults are the looks as they were designed: harbor blue boards, a yellow accent, dark navy ink.
PALETTE = {"primary": "#1E4E6E", "accent": "#FFC530", "ink": "#0F1F2B", "paper": "#FFFFFF", "soft": "#EEF3F6"}
FONTS = {"head": "Libre Franklin", "body": "Poppins"}

# The colours the looks were drawn in, and the palette role that replaces each one. Neutrals (white, greys, near
# black, shadows) stay as they are.
_ROLE = {
    "#1e4e6e": "primary",   # harbor blue: boards, cards, backdrops
    "#ffc530": "accent",    # yellow: stickers, highlights, the key word
    "#38b6ff": "accent",    # the older light-blue accent
    "#86d3ff": "accent",    # a lighter shade of the older accent
    "#0b1b27": "ink",       # the dark navy room
    "#0f1f2b": "ink",
    "#14293a": "ink",       # the lit centre of the navy room
    "#eef3f6": "soft",
}
_RGB = {(30, 78, 110): "primary", (255, 197, 48): "accent", (56, 182, 255): "accent", (11, 27, 39): "ink", (15, 31, 43): "ink"}
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _s(v):
    return str(v if v is not None else "").strip()


def load_context(path="context.json"):
    p = Path(path)
    if not p.exists():
        p = Path("/tmp/job/context.json")
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def studio(ctx=None):
    """The names and the look, with plain fallbacks when a field is empty."""
    ctx = ctx if isinstance(ctx, dict) else {}
    st = ctx.get("studio") if isinstance(ctx.get("studio"), dict) else {}
    full = _s(st.get("ownerFull")) or _s(st.get("owner"))
    owner = _s(st.get("owner")) or (full.split()[0] if full else "")
    pal = dict(PALETTE)
    for k, v in (st.get("palette") or {}).items():
        if k in pal and _HEX.match(_s(v)):
            pal[k] = _s(v).upper()
    fonts = dict(FONTS)
    for k, v in (st.get("fonts") or {}).items():
        if k in fonts and _s(v):
            fonts[k] = _s(v)
    ep = ctx.get("episode") if isinstance(ctx.get("episode"), dict) else {}
    handle = _s(st.get("handle"))
    if handle and not handle.startswith("@"):
        handle = "@" + handle
    return {
        "owner": owner or "the host",
        "ownerFull": full or "the host",
        "coach": _s(st.get("coach")) or (f"Coach {owner}" if owner else "the coach"),
        "brand": _s(st.get("brand")) or full or "the studio",
        "handle": handle,
        "show": _s(st.get("show")) or _s(ep.get("show")) or _s(ctx.get("show")),
        "audience": _s(st.get("audience")) or "the audience",
        "website": _s(st.get("website")),
        "bookingUrl": _s(st.get("bookingUrl")),
        "timezone": _s(st.get("timezone")) or "UTC",
        "palette": pal,
        "fonts": fonts,
        "has_owner": bool(owner),
    }


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    """a blended toward b by t (0..1), as #rrggbb."""
    ra, rb = hex_rgb(a), hex_rgb(b)
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ra, rb))


def recolor(text, pal):
    """Swap the shipped brand colours in a page (CSS, SVG, inline styles) for the palette's roles."""
    if not text:
        return text
    def hx(m):
        role = _ROLE.get(m.group(0).lower())
        if not role:
            return m.group(0)
        if m.group(0).lower() == "#14293a":
            return mix(pal["ink"], pal["primary"], 0.25)
        if m.group(0).lower() == "#86d3ff":
            return mix(pal["accent"], "#ffffff", 0.35)
        return pal[role]
    text = re.sub(r"#[0-9a-fA-F]{6}\b", hx, text)
    def rg(m):
        role = _RGB.get((int(m.group(1)), int(m.group(2)), int(m.group(3))))
        if not role:
            return m.group(0)
        r, g, b = hex_rgb(pal[role])
        return f"rgba({r}, {g}, {b},"
    return re.sub(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,", rg, text)


def css_vars(pal, fonts=None):
    """The palette (and fonts) as CSS variables, for a page that reads var(--primary) and friends."""
    fonts = fonts or FONTS
    lines = [f"  --{k}: {v};" for k, v in pal.items()]
    lines += [f'  --font-head: "{fonts["head"]}", sans-serif;', f'  --font-body: "{fonts["body"]}", sans-serif;']
    return ":root {\n" + "\n".join(lines) + "\n}\n"
