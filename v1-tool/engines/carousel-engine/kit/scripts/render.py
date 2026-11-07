#!/usr/bin/env python3
"""Render carousel slides (HTML) to PNGs with headless Chrome, plus a contact sheet.

Usage:
  python3 render.py SLIDES_DIR [--out DIR] [--size 1080x1350] [--only NAME] [--no-sheet]
  python3 render.py --doctor

Every *.html file in SLIDES_DIR is one slide, rendered in name order (files starting with "_"
are skipped). PNGs go to SLIDES_DIR/../png unless --out says otherwise, and contact-sheet.png
lands next to them (needs Pillow; the PNGs render without it).

Chrome is found in this order: the CHROME_PATH environment variable, HyperFrames' headless
shell (~/.cache/hyperframes), Playwright's Chromium, then Google Chrome, Chromium or Edge in
the usual places on Mac, Windows and Linux. Stdlib only, apart from Pillow for the sheet.
"""
import glob
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile

HOME = pathlib.Path.home()
# Full Chrome/Edge gets a throwaway profile so it never touches (or waits on) the person's own browser.
PROFILE = tempfile.mkdtemp(prefix='carousel-chrome-')


def chrome_args(chrome, is_shell):
    base = [chrome, '--headless' if is_shell else '--headless=new', '--disable-gpu', '--hide-scrollbars']
    if not is_shell:
        base += [f'--user-data-dir={PROFILE}', '--no-first-run', '--no-default-browser-check']
    return base


def find_chrome():
    """Return (path, is_headless_shell) for the first browser found, or (None, False)."""
    env = os.environ.get('CHROME_PATH')
    if env and pathlib.Path(env).exists():
        return env, 'headless-shell' in env or 'headless_shell' in env
    names = {'chrome-headless-shell', 'chrome-headless-shell.exe'}
    shells = sorted(glob.glob(str(HOME / '.cache/hyperframes/chrome/chrome-headless-shell/*/*/chrome-headless-shell*')))
    shells = [s for s in shells if os.path.basename(s) in names and os.path.isfile(s)]
    if shells:
        return shells[-1], True
    pw = []
    for base in [HOME / 'Library/Caches/ms-playwright', HOME / '.cache/ms-playwright',
                 pathlib.Path(os.environ.get('LOCALAPPDATA', '')) / 'ms-playwright']:
        pw += glob.glob(str(base / 'chromium_headless_shell-*/*/chrome-headless-shell*'))
    pw = [p for p in pw if os.path.basename(p) in names and os.path.isfile(p)]
    if pw:
        return sorted(pw)[-1], True
    system = platform.system()
    candidates = []
    if system == 'Darwin':
        candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                      '/Applications/Chromium.app/Contents/MacOS/Chromium',
                      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    elif system == 'Windows':
        for var in ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']:
            root = os.environ.get(var)
            if root:
                candidates += [os.path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
                               os.path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]
    for c in candidates:
        if os.path.exists(c):
            return c, False
    for name in ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge']:
        found = shutil.which(name)
        if found:
            return found, False
    return None, False


def shoot(chrome, is_shell, html, png, width, height):
    """Screenshot one local HTML file at width x height."""
    args = [*chrome_args(chrome, is_shell), '--force-device-scale-factor=1', '--allow-file-access-from-files', '--run-all-compositor-stages-before-draw',
            '--virtual-time-budget=4000', f'--window-size={width},{height}', f'--screenshot={png}',
            pathlib.Path(html).resolve().as_uri()]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    if not pathlib.Path(png).exists():
        sys.exit(f'Chrome ran but wrote no screenshot for {html}')


def contact_sheet(pngs, out, cols=3, tile=(432, 540), gap=28, label_h=60):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print('Pillow not installed: skipped the contact sheet (pip install Pillow).')
        return None
    font_path = pathlib.Path(__file__).resolve().parents[1] / 'template' / 'fonts' / 'Poppins-SemiBold.ttf'
    font = ImageFont.truetype(str(font_path), 26) if font_path.exists() else ImageFont.load_default()
    rows = (len(pngs) + cols - 1) // cols
    w, h = tile
    sheet = Image.new('RGB', (cols * w + (cols + 1) * gap, rows * (h + label_h) + (rows + 1) * gap), '#E6E6E6')
    draw = ImageDraw.Draw(sheet)
    for i, p in enumerate(pngs):
        x = gap + (i % cols) * (w + gap)
        y = gap + (i // cols) * (h + label_h + gap)
        draw.text((x, y + 14), pathlib.Path(p).stem.replace('_', ' '), fill='#0c1a24', font=font)
        sheet.paste(Image.open(p).convert('RGB').resize((w, h), Image.LANCZOS), (x, y + label_h))
    sheet.save(out)
    return out


def main():
    argv = sys.argv[1:]
    chrome, is_shell = find_chrome()
    if '--doctor' in argv or not argv:
        print(f'Chrome: {chrome or "NOT FOUND (set CHROME_PATH)"}')
        try:
            import PIL  # noqa: F401
            print('Pillow: ok')
        except ImportError:
            print('Pillow: missing (only the contact sheet needs it: pip install Pillow)')
        if not argv:
            print(__doc__)
        sys.exit(0 if chrome else 1)
    if not chrome:
        sys.exit('No Chrome, Chromium or Edge found. Install Chrome or set CHROME_PATH.')
    slides = pathlib.Path(argv[0]).resolve()
    pairs = [a for a in argv[1:] if a != '--no-sheet']
    opts = dict(zip(pairs[::2], pairs[1::2]))
    out = pathlib.Path(opts.get('--out', slides.parent / 'png')).resolve()
    out.mkdir(parents=True, exist_ok=True)
    width, height = (int(v) for v in opts.get('--size', '1080x1350').lower().split('x'))
    files = sorted(f for f in slides.glob('*.html') if not f.name.startswith('_'))
    if '--only' in opts:
        files = [f for f in files if f.stem == opts['--only']]
    if not files:
        sys.exit(f'No slide HTML files in {slides}')
    pngs = []
    for f in files:
        png = out / f'{f.stem}.png'
        png.unlink(missing_ok=True)
        shoot(chrome, is_shell, f, png, width, height)
        pngs.append(png)
        print(f'rendered {png.name}')
    if '--no-sheet' not in argv and len(pngs) > 1:
        sheet = contact_sheet(pngs, out / 'contact-sheet.png')
        if sheet:
            print(f'contact sheet: {sheet}')


if __name__ == '__main__':
    main()
