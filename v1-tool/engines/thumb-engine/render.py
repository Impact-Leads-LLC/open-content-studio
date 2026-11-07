#!/usr/bin/env python3
"""The render half of the thumb engine (thumbnail-builder 3.1, kit): one thumbnail option in, one thumbnail per look it
has words for (the call, the number wall, the board) out, made with skill/scripts/thumb.py, in the studio's palette.
  1. prepare each look's pair (the owner's own photo, from the studio's thumb_pick): the photo, the cutout (given, from
     its mask, or made on this machine), the brand background image if any, the face metrics. A photo with no cutout
     plays the board only, with the plain photo as its print; the call and the wall say why they were skipped
  2. the call's guest frame: a few seconds of the guest's own camera around guest_at, then thumb.py guest-frame (that
     exact frame first, then the frames around it); no clear face means the call can't play
  3. render every look; a copy-fit reject goes back to Claude (words.mjs shorter) for fewer letters, two rounds at
     most, the type never scaled; a look the photo or the episode can't play is reported with its reason, never forced
  4. gates G1-G13, review and feed sheets, deliver thumb-<look>.jpg; result.json for the app
Reads <JOB_DIR>/context.json (option, pairs per look, skip, order, guest_video, refs, run_key, title, studio); works in
<JOB_DIR>/work. Prints one plain line per step (run.sh keeps them as the job's status); on a stop the reason goes to
work/fail.txt."""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

E = Path(__file__).resolve().parent
sys.path.insert(0, str(E))
import studio  # noqa: E402

JOB = Path(os.environ.get('JOB_DIR', '/tmp/job'))
W = JOB / 'work'
OUT = W / 'out'
THUMB = E / 'skill' / 'scripts' / 'thumb.py'
ctx = json.loads((JOB / 'context.json').read_text())
ST = studio.studio(ctx)
ENV = {**os.environ, 'THUMB_PALETTE': json.dumps(ST['palette'])}
LOOKS = ('call', 'wall', 'board')
NAME = {'call': 'the call', 'wall': 'the number wall', 'board': 'the board'}
# what each check looks at, in plain words (skill/references/gates.md has the numbers)
CHECKS = {'G1': 'size', 'G2': 'the words rule', 'G3': 'the edges', 'G4': 'the video-length corner', 'G5': 'one hot colour',
          'G6': 'the head size', 'G7': 'space around the faces', 'G8': 'the face untouched', 'G9': 'the number stays readable',
          'G10': 'contrast', 'G11': 'the read at feed size', 'G11w': 'the read at feed size', 'G12': 'the feed read',
          'G13': 'a real guest frame'}
opt = ctx['option']
result = {'option': opt.get('n'), 'run_key': ctx.get('run_key'), 'order': [], 'looks': {}, 'notes': [],
          'skill': (E / 'skill' / 'VERSION').read_text().strip() if (E / 'skill' / 'VERSION').exists() else None}


def say(msg):
    print(msg, flush=True)


def save():
    (W / 'result.json').write_text(json.dumps(result, indent=1))


def stop(reason):
    (W / 'fail.txt').write_text(reason)
    result['failed'] = reason
    save()
    sys.exit(1)


def thumb(*args, log=None):
    """thumb.py with its output in work/<log> (or returned when log is None)."""
    cmd = [sys.executable, str(THUMB), *map(str, args)]
    if log is None:
        return subprocess.run(cmd, env=ENV, cwd=W, capture_output=True, text=True)
    with open(W / log, 'a') as f:
        return subprocess.run(cmd, env=ENV, cwd=W, stdout=f, stderr=subprocess.STDOUT)


def tail(log, n=1):
    p = W / log
    return ' / '.join(l.strip() for l in p.read_text().splitlines()[-n:]) if p.exists() else ''


def mmss(t):
    return f"{int(t // 60)}:{int(t % 60):02d}"


def shown(w):
    first, second = (w['hero'], w.get('support')) if w.get('order') == 'hero-first' else (w.get('support'), w['hero'])
    return ' / '.join(x for x in (first, second, w.get('sticker')) if x)


# the renderer's reasons for a look it can't play, in the team's words (the renderer's own text stays in `detail`)
FRIENDLY = [('person on the right', 'the call needs a photo with the person on the right'),
            ('real guest frame', 'the call needs a real frame of the guest from the episode'),
            ('guest face is too big', "the guest's face is too big in the frame for the call window"),
            ('needs a number', 'the wall needs a number of 1 to 5 characters as the hero'),
            ('hides too much', 'the head would hide too much of the number'),
            ('no cutout', 'no cutout of that photo could be made, so only the board can use it'),
            ('no clear face', 'no clear face was found in that photo')]
ELEMENTS = {'support': 'the support line', 'hero': 'the hero', 'sticker_text': 'the sticker', 'tag_text': 'the tag', 'board_words': 'the words on the board',
            'number': 'the number', 'tag': 'the tag', 'sticker': 'the sticker'}


def friendly(reason):
    for key, words in FRIENDLY:
        if key in (reason or ''):
            return words
    return reason or 'not playable for this photo'


def plain(check_id, msg=''):
    return f"{CHECKS.get(check_id, check_id)} ({check_id})" + (f": {msg}" if msg else '')


def ffmpeg():
    for c in (os.environ.get('THUMBKIT_FFMPEG'), shutil.which('ffmpeg')):
        if c and Path(c).exists():
            return c
    return 'ffmpeg'


def guest_frame(at, video):
    """The call's guest frame from a few seconds of the guest's own camera: (record, None) or (None, reason)."""
    who = ctx.get('guest') or 'the guest'
    if at is None:
        return None, f"the words have no moment of {who} for the call window"
    if not (video or {}).get('url'):
        return None, f"no camera track for {who} on this episode"
    start = max(0.0, float(at) - 3.0)
    clip = W / 'guest-clip.mkv'
    with open(W / 'guest.log', 'a') as f:
        rc = subprocess.run([ffmpeg(), '-v', 'error', '-y', '-ss', f'{start:.3f}', '-i', video['url'], '-t', '6', '-map', '0:v:0',
                             '-an', '-c:v', 'ffv1', str(clip)], stdout=f, stderr=subprocess.STDOUT).returncode
    if rc or not clip.exists() or clip.stat().st_size == 0:
        return None, f"{who}'s camera didn't download ({tail('guest.log')})"
    gd = W / 'guest'
    exact = True
    for extra in (['--at-exact'], []):
        exact = bool(extra)
        r = thumb('guest-frame', clip, '--at', f'{float(at) - start:.3f}', *extra, '--out', gd, log='guest.log')
        if r.returncode == 0 and (gd / 'guest.json').exists():
            break
    else:
        if (gd / 'guest-candidates.jpg').exists():
            OUT.mkdir(parents=True, exist_ok=True)
            shutil.copy2(gd / 'guest-candidates.jpg', OUT / 'guest-candidates.jpg')
        return None, f"no clear face of {who} at {mmss(at)} or the frames around it"
    g = json.loads((gd / 'guest.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(gd / 'guest-candidates.jpg', OUT / 'guest-candidates.jpg')
    rec = {'asked': float(at), 'picked': round(start + float(g['picked_t']), 2), 'exact': exact, 'detector': g.get('detector'),
           'score': g.get('score'), 'candidates': 'guest-candidates.jpg'}
    say(f"guest frame: {who} at {mmss(rec['picked'])}" + (' (that exact frame)' if exact else ' (the sharpest frame near it)'))
    return rec, None


def classify(look, p, prep, words):
    """One look's gate report as the app shows it: delivered after thumb.py deliver, or failed, with plain notes."""
    side = {'status': 'failed', 'look_name': NAME[look], 'pair': p['id'], 'background': p.get('background_id'),
            'background_label': p.get('background_label'), 'cutout': p.get('cutout'), 'side': p.get('side'),
            'words': dict(words), 'notes': [], 'fails': []}
    gp = OUT / f'gate-{look}.json'
    if not gp.exists():
        side['fails'] = [f"the checks didn't run ({tail('gate.log')})"]
        return side
    rep = json.loads(gp.read_text())
    g = rep.get('thumb_gate') or {}
    checks = g.get('checks', [])
    fails = [c for c in checks if not c['ok'] and c.get('hard', True)]
    warns = [c for c in checks if not c['ok'] and not c.get('hard', True)]
    side['fails'] = [plain(c['id'], c.get('msg', '')) for c in fails]
    side['checks'] = {'run': len({c['id'] for c in checks if c.get('hard', True)}), 'failed': sorted({c['id'] for c in fails}),
                      'ocr': g.get('ocr')}
    for c in warns:
        if c['id'] == 'G11w':
            small = [ELEMENTS.get(x.strip(), x.strip().replace('_', ' ')) for x in str(c.get('msg', '')).rsplit(':', 1)[-1].split(',') if x.strip()]
            side['notes'].append(f"Small at feed size, but it reads: {', '.join(small) or 'some type'} (G11w, a warning).")
        else:
            side['notes'].append(f"Warning: {plain(c['id'], c.get('msg', ''))}")
    if rep.get('person_mode') == 'photo':
        side['notes'].append('No cutout of this photo, so the board prints the plain photo.')
    elif (prep or {}).get('cutout') == 'made':
        side['notes'].append('The cutout was made on the machine: check the hair edge on the review sheet.')
    side['status'] = 'passed' if rep.get('pass') and not fails else 'failed'
    return side


def main():
    W.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    words = {l['look']: {k: l.get(k) for k in ('support', 'hero', 'sticker', 'order', 'mark', 'hook_type')} for l in opt.get('looks') or []}
    pairs = ctx.get('pairs') or {}
    skip = ctx.get('skip') or {}
    order = [l for l in (ctx.get('order') or []) if l in LOOKS] + [l for l in LOOKS if l not in (ctx.get('order') or [])]
    result['order'] = order
    res = result['looks']
    for look in LOOKS:
        if look not in words:
            res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': 'this option has no words for it'}
        elif skip.get(look):
            res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': skip[look]}
        elif not pairs.get(look):
            res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': f"no photo of {ST['owner']} plays a {words[look].get('hook_type')} hook"}
    todo = [l for l in order if l not in res]
    if not todo:
        stop('no look can play these words: ' + '; '.join(f"{NAME[l]}: {res[l]['reason']}" for l in order))

    # 1. the pairs: the owner's photos, their cutouts and face metrics
    uniq = {}
    for look in todo:
        pid = str(pairs[look].get('id') or pairs[look].get('pair_id'))
        pairs[look]['id'] = pid
        uniq.setdefault(pid, pairs[look])
    (W / 'pairs.json').write_text(json.dumps(list(uniq.values())))
    thumb('prepare', W / 'pairs.json', W, log='prepare.log')
    prepared = {m['id']: m for m in json.loads((W / 'prepared.json').read_text())} if (W / 'prepared.json').exists() else {}
    for line in (W / 'prepare.log').read_text().splitlines() if (W / 'prepare.log').exists() else []:
        if line.startswith('note:'):
            result['notes'].append(line[5:].strip())
    for look in list(todo):
        m = prepared.get(pairs[look]['id'])
        why = None
        if not m:
            why = f"{ST['owner']}'s photo didn't download ({tail('prepare.log')})"
        elif m.get('error'):
            why = f"{ST['owner']}'s photo didn't download ({m['error']})"
        elif not m.get('face'):
            why = f"no clear face was found in {ST['owner']}'s photo {m.get('name') or ''}".strip()
        elif m.get('mode') != 'cutout' and look in ('call', 'wall'):
            why = f"no cutout of {ST['owner']}'s photo could be made, and {NAME[look]} needs one (the board prints the plain photo)"
        if why:
            res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': why}
            todo.remove(look)
            say(f"{NAME[look]}: skipped, {why}")
    if not todo:
        stop('no look can play: ' + '; '.join(f"{NAME[l]}: {res[l]['reason']}" for l in order))
    say('photos: ' + ', '.join(f"{l} {prepared[pairs[l]['id']].get('name')} ({prepared[pairs[l]['id']].get('mode')})" for l in todo))

    # 2. the call's guest frame
    if 'call' in todo:
        g, why = guest_frame(opt.get('guest_at'), ctx.get('guest_video'))
        if g:
            result['guest'] = g
        else:
            res['call'] = {'status': 'skipped', 'look_name': NAME['call'], 'reason': why}
            todo.remove('call')
            say(f"the call: skipped, {why}")

    # 3. render; copy-fit rejects go back for fewer letters, two rounds
    def spec_for(look):
        w, p = words[look], pairs[look]
        sp = {'id': look, 'look': look, 'pair': p['id'], 'pair_dir': f"pairs/{p['id']}", 'support': w.get('support'),
              'hero': w['hero'], 'order': w.get('order') or 'support-first', 'title': ctx.get('title') or ''}
        if look != 'call' and w.get('sticker'):
            sp['sticker'] = w['sticker']
        if look == 'call':
            sp['guest_frame'] = 'guest/guest.json'
            if w.get('mark'):
                sp['mark'] = {'kind': 'loop', 'target': 'hero', 'seed': f"{ctx.get('run_key') or 'thumb'}-{opt.get('n', 1)}-call"}
        return sp

    pending, rounds = list(todo), {}
    for rnd in range(3):
        if not pending:
            break
        (W / 'spec.json').write_text(json.dumps([spec_for(l) for l in pending], indent=1))
        rep_path = OUT / 'report.json'
        rep_path.unlink(missing_ok=True)
        thumb('render', W / 'spec.json', OUT, '--report', rep_path, log='render.log')
        if not rep_path.exists():
            stop(f"the render didn't run ({tail('render.log', 2)})")
        nxt = []
        for o in json.loads(rep_path.read_text()).get('options', []):
            look, st, d = o['id'], o['status'], o.get('detail') or {}
            if st == 'rendered':
                res[look] = {'status': 'rendered'}
                continue
            if st == 'look_unplayable':
                res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': friendly(d.get('reason')), 'detail': d.get('reason')}
                say(f"{NAME[look]}: skipped, {res[look]['reason']}")
                continue
            if st == 'words_reject':
                why = '; '.join(f"{x.get('field')}: {x.get('problem')}" for x in d.get('problems', []))
                res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': f'the words break a rule ({why})'}
                continue
            over = d.get('over') or []
            what = ', '.join(f"{ELEMENTS.get(x['element'], x['element'])} {x['text']} is {x['overflow_px']} px too wide" for x in over)
            if rnd == 2:
                res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': f"still too wide after two shorter tries: {shown(words[look])} ({what})",
                             'best': dict(words[look]), 'over': over}
                continue
            say(f"{NAME[look]} copy-fit: {what}; asking Claude for fewer letters (round {rnd + 1} of 2)")
            (W / 'over.json').write_text(json.dumps({'words': {'look': look, **words[look]}, 'over': over, 'takeaway': ctx.get('takeaway'),
                                                     'source_line': opt.get('source_line'), 'guest_at': opt.get('guest_at')}, indent=1))
            (W / 'shorter.json').unlink(missing_ok=True)
            with open(W / 'shorter.log', 'a') as f:
                rc = subprocess.run(['node', str(E / 'words.mjs'), 'shorter', str(W / 'over.json')], env=ENV, cwd=W,
                                    stdout=f, stderr=subprocess.STDOUT).returncode
            if rc or not (W / 'shorter.json').exists():
                res[look] = {'status': 'skipped', 'look_name': NAME[look], 'reason': f"{shown(words[look])} is too wide ({what}) and no shorter line came back ({tail('shorter.log')})"}
                continue
            s = json.loads((W / 'shorter.json').read_text())
            before = shown(words[look])
            words[look].update(support=s.get('support'), hero=s['hero'], sticker=s.get('sticker') if look != 'call' else None)
            rounds[look] = rnd + 1
            result['notes'].append(f"{NAME[look].capitalize()}: {before} shortened to {shown(words[look])} to fit ({s.get('why') or 'fewer letters'}).")
            nxt.append(look)
        pending = nxt
    rendered = [l for l in order if res.get(l, {}).get('status') == 'rendered']
    if rendered:
        say('rendered: ' + ', '.join(f"{NAME[l]} {shown(words[l])}" for l in rendered))

    # 4. gates, sheets, delivery
    if rendered:
        thumb('gate', OUT, *rendered, log='gate.log')       # exit 1 on any fail: the reports say what
    for look in rendered:
        res[look] = classify(look, pairs[look], prepared.get(pairs[look]['id']), words[look])
        if rounds.get(look):
            res[look]['rounds'] = rounds[look]
    if look_guest := result.get('guest'):
        if 'call' in res and res['call'].get('status') in ('passed', 'failed'):
            res['call']['guest'] = look_guest
    # reference thumbnails for the feed sheet (optional: context.refs maps a file name to a signed link)
    refs = W / 'refs'
    refs.mkdir(exist_ok=True)
    for name, url in (ctx.get('refs') or {}).items():
        if url and re.fullmatch(r'[A-Za-z0-9._-]+\.(jpe?g|png|webp)', str(name), re.I):
            subprocess.run(['curl', '-sfL', '-o', str(refs / name), url])
    if rendered:
        thumb('sheet', OUT, *rendered, '--refs', refs, log='sheet.log')
        if not any(refs.iterdir()):
            result['notes'].append('No reference thumbnails came with the job, so the feed sheet sets each look beside the others on grey.')
    ok = [l for l in rendered if res[l]['status'] == 'passed']
    if ok and thumb('deliver', OUT, *ok, '--to', OUT, log='deliver.log').returncode:
        for l in ok:
            res[l].update(status='failed', fails=[f"delivery refused: {tail('deliver.log')}"])
    for l in ok:
        if res[l]['status'] == 'passed' and (OUT / f'thumb-{l}.jpg').exists():
            res[l]['status'] = 'delivered'
    save()
    done = [l for l in order if res[l]['status'] == 'delivered']
    if not done:
        why = '; '.join(f"{NAME[l]}: {res[l].get('reason') or ', '.join(f.split(':')[0] for f in res[l].get('fails', [])) or 'no report'}" for l in order)
        stop(f"no look came out ({why}). Try other words.")
    say('delivered: ' + ', '.join(NAME[l] for l in done) + ''.join(f"; {NAME[l]} {res[l]['status']}" for l in order if l not in done))


if __name__ == '__main__':
    main()
