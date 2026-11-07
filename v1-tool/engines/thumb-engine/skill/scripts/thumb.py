#!/usr/bin/env python3
"""thumbnail-builder 3.1 (kit): three looks (call, wall, board) from the owner's own photos, gates, sheets, delivery.

  thumb.py doctor                               check Python, Pillow, the fonts, the face model, OpenCV, the cutout tool
  thumb.py prepare <pairs.json> <work_dir>      one folder per pair (thumb_pick rows): the photo, the cutout (given,
                                                from its mask, or made here with rembg), the brand background image,
                                                the face metrics (thumbkit/person.py)
  thumb.py guest-frame <video> --at <s>         the call's guest frame: a real frame near <s> with the guest's face
               [--window 1.5] [--step 0.25]     found (YuNet via OpenCV); writes guest.json, the frame and a
               [--out DIR] [--pick largest|left|right] [--at-exact]        candidate sheet
  thumb.py looks <spec.json>                    which looks each option can play (copy-fit and playability only)
  thumb.py fit <spec.json>                      copy-fit only: exit 1 with {element, text, measured_px, limit_px,
                                                overflow_px, letters_to_cut} for hook-maker; never scales
  thumb.py render <spec.json> <out_dir>         render every option in the spec (a list, or one object): exit 0
               [--report FILE]                  rendered, 1 copy-fit or words reject, 2 look not playable
  thumb.py gate <out_dir> <id> [...]            G1-G13 -> gate-<id>.json; exit 1 on a fail
  thumb.py sheet <out_dir> <id> [...]           review-<id>.jpg, and feed-<id>.jpg (3x3, dark + light, 360 + 168)
               [--refs DIR ...] [--shuffle SEED] [--blind]
  thumb.py deliver <out_dir> <id> [...]         thumb-<id>.jpg (1280x720, < 2 MB); refuses on any gate fail

Environment: THUMB_PALETTE (the studio palette as JSON: primary, accent, ink), THUMB_CUTOUT_MODEL (rembg model,
default u2net_human_seg)."""
import argparse
import hashlib
import json
import platform
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from thumbkit import feed, gate3, guest, looks, person, tokens  # noqa: E402


def cmd_doctor(a):
    ok = True

    def line(good, msg, hard=True):
        nonlocal ok
        ok &= bool(good) or not hard
        print(f"{'OK  ' if good else ('FAIL' if hard else 'INFO')} {msg}")
    line(sys.version_info >= (3, 10), f'Python {platform.python_version()} (>= 3.10)')
    import PIL
    from PIL import ImageMath
    line(hasattr(ImageMath, 'lambda_eval'), f'Pillow {PIL.__version__} (>= 11: ImageMath.lambda_eval)')
    f = tokens.FONT
    sha = hashlib.sha256(f.read_bytes()).hexdigest() if f.exists() else ''
    line(sha == tokens.T['font']['sha256'], f'font {f.name} sha256 {sha[:16]} (tokens {tokens.T["font"]["sha256"][:16]})')
    line((f.parent / 'OFL-Archivo.txt').exists(), 'OFL-Archivo.txt beside the font')
    bf = tokens.path(tokens.T['v3']['fonts']['board']['file'])
    bsha = hashlib.sha256(bf.read_bytes()).hexdigest() if bf.exists() else ''
    line(bsha == tokens.T['v3']['fonts']['board']['sha256'], f'board font {bf.name} sha256 {bsha[:16]}')
    line((bf.parent / 'OFL-LibreFranklin.txt').exists(), 'OFL-LibreFranklin.txt beside it')
    line(guest.MODEL.exists(), f'face model {guest.MODEL.name}')
    name, _ = guest.detector()
    line(bool(name), f"face detector: {name or 'none (pip install opencv-python-headless): the call cannot play and photos without a face_box cannot be placed'}", hard=False)
    try:
        import rembg  # noqa: F401
        line(True, 'cutout tool: rembg', hard=False)
    except ImportError:
        line(False, 'cutout tool: rembg not installed (photos with no cutout or mask play the board only)', hard=False)
    c = tokens.T['v3']['colors']
    print(f"INFO palette: primary {c['harbor']}, accent {c['accent']}, ink {c['navy']}; type on the accent: {looks.ON_ACCENT_NAME}")
    print('DOCTOR', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


def cmd_prepare(a):
    rows = json.loads(Path(a.pairs).read_text())
    rows = rows.get('pairs', rows) if isinstance(rows, dict) else rows
    got = person.prepare(rows, a.work_dir)
    for m in got:
        if m.get('error'):
            print(f"note: {m['error']}")
            continue
        for n in m.get('notes') or []:
            print(f'note: {n}')
        print(f"{m['id']}: {m['mode']}" + (f" (cutout {m['cutout']})" if m.get('cutout') else '')
              + (f", head {m['head_px']:.0f} px" if m.get('face') else ', no face'))
    (Path(a.work_dir) / 'prepared.json').write_text(json.dumps(got, indent=1))
    return 0 if any(not m.get('error') for m in got) else 1


def _specs(path):
    data = json.loads(Path(path).read_text())
    return data if isinstance(data, list) else [data]


def _try(fn, s, *args):
    """(status, payload) for one option."""
    try:
        return 'ok', fn(s, *args)
    except looks.Reject as e:
        return e.kind, e.payload


def cmd_fit(a):
    bad = False
    base = Path(a.spec).resolve().parent
    for s in _specs(a.spec):
        st, payload = _try(looks.fit, s, base)
        print(json.dumps({'id': s['id'], 'look': s.get('look'), 'fits': st == 'ok', 'status': st,
                          **({'detail': payload} if st != 'ok' else payload)}, indent=1, default=str))
        bad |= st != 'ok'
    return 1 if bad else 0


def cmd_render(a):
    base = Path(a.spec).resolve().parent
    rc = 0
    report = []
    for s in _specs(a.spec):
        st, payload = _try(looks.render_to, s, base, a.out_dir)
        if st == 'ok':
            report.append({'id': s['id'], 'look': s['look'], 'status': 'rendered', 'gate_spec': f"{s['id']}-gate.json",
                           'render': payload['files']['jpg'], 'person': payload['person']})
        else:
            print(json.dumps({st: payload}, indent=1, default=str))
            report.append({'id': s['id'], 'look': s.get('look'), 'status': st, 'detail': payload})
            rc = max(rc, 2 if st == 'look_unplayable' else 1)
    if a.report:
        Path(a.report).write_text(json.dumps({'renderer': looks.VERSION, 'exit': rc, 'options': report}, indent=1, default=str))
    return rc


def cmd_looks(a):
    """Which of the three looks each option can play: copy-fit and playability, nothing rendered."""
    base = Path(a.spec).resolve().parent
    out = []
    for s in _specs(a.spec):
        row = {'id': s['id'], 'looks': {}}
        for lk in looks.LOOKS:
            opt = {**s, 'look': lk}
            if lk != 'call':
                opt.pop('mark', None)            # the loop belongs to the call; the wall and the board carry the accent
            else:
                opt.pop('sticker', None)         # the call carries no sticker
            st, payload = _try(looks.fit, opt, base)
            row['looks'][lk] = {'playable': st == 'ok', 'status': st,
                                **({} if st == 'ok' else {'why': payload.get('reason') or payload.get('over') or payload.get('problems')})}
        out.append(row)
    print(json.dumps(out, indent=1, default=str))
    return 0


def cmd_guest_frame(a):
    return guest.run(a.video, a.at, a.out, window=a.window, step=a.step, pick=a.pick, min_face=a.min_face, exact=a.at_exact)


def gate_one(out_dir, cid, quiet=False):
    d = Path(out_dir)
    spec = json.loads((d / f'{cid}-gate.json').read_text())
    g = gate3.run_file(d / f'{cid}-gate.json', quiet=quiet)
    mk = spec.get('mark') or {}
    rep = {'id': cid, 'pass': g['pass'], 'look': spec['look'], 'thumb_gate': g, 'placeholder_mark': bool(mk.get('placeholder')),
           'renderer': spec.get('renderer'), 'pair': spec.get('pair'), 'person_mode': spec['person']['mode']}
    json.dump(rep, open(d / f'gate-{cid}.json', 'w'), indent=1)
    return rep


def cmd_gate(a):
    rc = 0
    for cid in a.ids:
        print(f'################ {cid}')
        rep = gate_one(a.out_dir, cid)
        rc |= 0 if rep['pass'] else 1
    return rc


def cmd_sheet(a):
    d = Path(a.out_dir)
    refs = feed.tiles_from(a.refs or [])
    for cid in a.ids:
        spec = json.loads((d / f'{cid}-gate.json').read_text())
        ph = bool((spec.get('mark') or {}).get('placeholder'))
        print(feed.review_sheet(d / f'{cid}.png', d / f'review-{cid}.jpg', placeholder=ph))
        # the other looks made in this run sit beside it, after the references
        mates = [Image.open(d / f'{x}.jpg').convert('RGB') for x in a.ids if x != cid and (d / f'{x}.jpg').exists()]
        info = feed.feed_sheet(d / f'{cid}.png', d / f'feed-{cid}.jpg', (refs + mates)[:8], shuffle=a.shuffle, label=cid,
                               placeholder=ph, blind=a.blind)
        json.dump(info, open(d / f'feed-{cid}.json', 'w'), indent=1)
        print(info['sheet'])
    return 0


def cmd_deliver(a):
    d = Path(a.out_dir)
    to = Path(a.to or d)
    to.mkdir(parents=True, exist_ok=True)
    for cid in a.ids:
        gp = d / f'gate-{cid}.json'
        if not gp.exists():
            sys.exit(f'[{cid}] no gate report: run thumb.py gate first')
        rep = json.loads(gp.read_text())
        if not rep['pass']:
            sys.exit(f'[{cid}] gate failed: nothing ships')
        src = d / f'{cid}.jpg'
        if src.stat().st_size >= tokens.T['canvas']['max_bytes']:
            sys.exit(f'[{cid}] {src} is over 2 MB')
        shutil.copy2(src, to / f'thumb-{cid}.jpg')
        print(to / f'thumb-{cid}.jpg', '(generated loop)' if rep.get('placeholder_mark') else '')
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest='cmd', required=True)
    x = sp.add_parser('doctor'); x.set_defaults(fn=cmd_doctor)
    x = sp.add_parser('prepare'); x.add_argument('pairs'); x.add_argument('work_dir'); x.set_defaults(fn=cmd_prepare)
    x = sp.add_parser('fit'); x.add_argument('spec'); x.set_defaults(fn=cmd_fit)
    x = sp.add_parser('render'); x.add_argument('spec'); x.add_argument('out_dir'); x.add_argument('--report')
    x.set_defaults(fn=cmd_render)
    x = sp.add_parser('looks'); x.add_argument('spec'); x.set_defaults(fn=cmd_looks)
    x = sp.add_parser('guest-frame'); x.add_argument('video'); x.add_argument('--at', type=float, required=True)
    x.add_argument('--window', type=float, default=1.5); x.add_argument('--step', type=float, default=0.25)
    x.add_argument('--out', default='guest'); x.add_argument('--pick', choices=['largest', 'left', 'right'], default='largest')
    x.add_argument('--min-face', type=int, default=80); x.add_argument('--at-exact', action='store_true')
    x.set_defaults(fn=cmd_guest_frame)
    x = sp.add_parser('gate'); x.add_argument('out_dir'); x.add_argument('ids', nargs='+'); x.set_defaults(fn=cmd_gate)
    x = sp.add_parser('sheet'); x.add_argument('out_dir'); x.add_argument('ids', nargs='+'); x.add_argument('--refs', nargs='*')
    x.add_argument('--shuffle'); x.add_argument('--blind', action='store_true'); x.set_defaults(fn=cmd_sheet)
    x = sp.add_parser('deliver'); x.add_argument('out_dir'); x.add_argument('ids', nargs='+'); x.add_argument('--to')
    x.set_defaults(fn=cmd_deliver)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == '__main__':
    sys.exit(main())
