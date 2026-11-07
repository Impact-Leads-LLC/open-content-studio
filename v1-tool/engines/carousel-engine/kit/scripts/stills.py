#!/usr/bin/env python3
"""B-roll helpers for carousels: episode stills at native resolution, and page screenshots.

Usage:
  python3 stills.py info  VIDEO                          resolution, frame rate and length
  python3 stills.py scan  VIDEO TIMES OUT.jpg [--crop W:H:X:Y]
                          a contact sheet of frames at TIMES ("19:40,20:12,32:40" or seconds) to pick
                          the best expression before you cut the real still
  python3 stills.py frame VIDEO TIME OUT.jpg [--crop W:H:X:Y]
                          one frame at full quality; the crop never scales, so the still stays sharp
  python3 stills.py side  LEFT.jpg RIGHT.jpg OUT.jpg     two stills side by side (host + guest)
  python3 stills.py site  URL OUT.png [--size 1440x900]  a screenshot of a web page (the guest's site)

The rule this enforces: a still is used at or below its own pixel size on the slide. A 540x620
crop fills a 540x620 box. If a box on the slide is bigger than the crop, cut a bigger crop or
pick another image; never stretch it. Needs ffmpeg and ffprobe on PATH (or FFMPEG / FFPROBE).
"""
import json
import os
import pathlib
import subprocess
import sys

FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FFPROBE = os.environ.get('FFPROBE', 'ffprobe')


def seconds(t):
    parts = [float(p) for p in str(t).split(':')]
    total = 0.0
    for p in parts:
        total = total * 60 + p
    return total


def probe(video):
    out = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height,r_frame_rate:format=duration', '-of', 'json', video],
                         check=True, capture_output=True, text=True).stdout
    data = json.loads(out)
    s = data['streams'][0]
    return int(s['width']), int(s['height']), s['r_frame_rate'], float(data['format']['duration'])


def crop_filter(video, crop):
    if not crop:
        return []
    w, h, x, y = (int(v) for v in crop.split(':'))
    sw, sh, _, _ = probe(video)
    if x < 0 or y < 0 or x + w > sw or y + h > sh:
        sys.exit(f'crop {crop} falls outside the {sw}x{sh} frame')
    return ['-vf', f'crop={w}:{h}:{x}:{y}']


def grab(video, t, out, crop=None, extra_vf=None):
    vf = crop_filter(video, crop)
    if extra_vf:
        vf = ['-vf', (vf[1] + ',' if vf else '') + extra_vf]
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-ss', str(seconds(t)), '-i', video, '-frames:v', '1', '-q:v', '2', *vf, out],
                   check=True)


def main():
    a = sys.argv[1:]
    if not a or a[0] not in {'info', 'scan', 'frame', 'side', 'site'}:
        sys.exit(__doc__)
    cmd, rest = a[0], a[1:]
    opts = {}
    if '--crop' in rest:
        i = rest.index('--crop'); opts['crop'] = rest[i + 1]; rest = rest[:i] + rest[i + 2:]
    if '--size' in rest:
        i = rest.index('--size'); opts['size'] = rest[i + 1]; rest = rest[:i] + rest[i + 2:]

    if cmd == 'info':
        w, h, fps, dur = probe(rest[0])
        print(f'{w}x{h}, {fps} fps, {dur / 60:.1f} min')
    elif cmd == 'frame':
        video, t, out = rest
        grab(video, t, out, opts.get('crop'))
        size = opts.get('crop', '').split(':')[:2] or probe(video)[:2]
        print(f'{out}: {"x".join(map(str, size))}. Use it in a box this size or smaller.')
    elif cmd == 'scan':
        video, times, out = rest
        tmp = pathlib.Path(out).with_suffix('')
        tmp.mkdir(parents=True, exist_ok=True)
        frames = []
        for t in times.split(','):
            f = tmp / f't_{seconds(t):07.1f}.jpg'
            grab(video, t, str(f), opts.get('crop'), 'scale=360:-2')
            frames.append(f)
        cols = min(4, len(frames))
        inputs = sum([['-i', str(f)] for f in frames], [])
        # Same-size tiles: place them on a grid by measured height.
        h0 = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'stream=height', '-of', 'csv=p=0', str(frames[0])],
                            check=True, capture_output=True, text=True).stdout.strip()
        layout = '|'.join(f'{(i % cols) * 360}_{(i // cols) * int(h0)}' for i in range(len(frames)))
        stack = f"{''.join(f'[{i}]' for i in range(len(frames)))}xstack=inputs={len(frames)}:layout={layout}" if len(frames) > 1 else 'null'
        subprocess.run([FFMPEG, '-v', 'error', '-y', *inputs, '-filter_complex', stack, out], check=True)
        print(f'{out}: frames at {times} (left to right, top to bottom). Tiles are in {tmp}/')
    elif cmd == 'side':
        left, right, out = rest
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', left, '-i', right, '-filter_complex', 'hstack', out], check=True)
        print(out)
    elif cmd == 'site':
        url, out = rest
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        from render import find_chrome, chrome_args
        chrome, is_shell = find_chrome()
        if not chrome:
            sys.exit('No Chrome found. Install Chrome or set CHROME_PATH.')
        w, h = opts.get('size', '1440x900').split('x')
        subprocess.run([*chrome_args(chrome, is_shell), '--virtual-time-budget=6000', f'--window-size={w},{h}', f'--screenshot={pathlib.Path(out).resolve()}', url],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        print(out)


if __name__ == '__main__':
    main()
