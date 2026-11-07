"""The host, ready for the looks: one folder per pair the studio's thumb_pick returned.

A pair is one of the owner's own photos (the studio has no pre-made composites):
  {"id": "<asset uuid>", "pair_id": "<asset uuid>", "cutout": "<photo name>", "background_id": "brand",
   "background_label": "Brand background", "side": "L" | "R" (where the person sits; default R),
   "hook_types": [...], "frame": null, "storage_prefix": "",
   "urls": {"photo": ..., "preview": ..., "person": ..., "mask": ..., "plate": ..., "alpha": ..., "pair": ...},
   "face_box": [x0, y0, x1, y1]}   <- optional, in the photo's own pixels (used when no face detector finds one)

prepare() writes <work>/pairs/<id>/:
  photo.png    the photo, at most 2400 px on its long side (resampled only)
  person.png   the cutout: urls.person as given; else the photo with urls.mask as its alpha; else the photo with a mask
               made on this machine by rembg (CPU, model THUMB_CUTOUT_MODEL, default u2net_human_seg, downloaded on
               first use). Only the alpha comes from the model: every colour pixel is the photo's own.
  plate.png    the studio's brand background image (urls.plate), when there is one
  pair.json    id, name, side, mode ("cutout" or "photo"), face {x, y, w, h}, head_px (crown to chin), anchor
               {src_cx, src_crown}, cutout ("given", "mask", "made" or null) and notes
With no cutout the mode is "photo": the board prints the plain photo, and the call and the wall can't play.
With no face found, the photo can't play any look (the face rules need to know where the face is)."""
import json
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageOps

from . import guest

MAX_SIDE = 2400
MIN_HEAD = 120          # px, crown to chin, in the photo: below this the looks would scale the face up too far
SOFT_HEAD = 240         # px: below this the thumbnail may look soft (a note, not a stop)


def _get(url, dest):
    subprocess.run(['curl', '-sfL', '--retry', '2', '-o', str(dest), url], check=True)
    return dest


def _open_rgb(p):
    im = ImageOps.exif_transpose(Image.open(p))
    return im


def _fit(im):
    s = MAX_SIDE / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im


def _mask_from(p, size):
    m = Image.open(p)
    if m.mode in ('RGBA', 'LA') or (m.mode == 'P' and 'transparency' in m.info):
        m = m.convert('RGBA').split()[3]
    else:
        m = m.convert('L')
    return m.resize(size, Image.LANCZOS) if m.size != size else m


def made_mask(photo):
    """A person mask made on this machine (rembg on the CPU), or (None, why)."""
    try:
        from rembg import new_session, remove
    except ImportError:
        return None, 'the cutout tool (rembg) is not installed on this machine'
    try:
        session = new_session(os.environ.get('THUMB_CUTOUT_MODEL') or 'u2net_human_seg')
        m = remove(photo.convert('RGB'), session=session, only_mask=True, post_process_mask=True)
        m = m.convert('L') if m.size == photo.size else m.convert('L').resize(photo.size, Image.LANCZOS)
    except Exception as e:  # noqa: BLE001 (any failure here means no cutout, never a stop)
        return None, f'the cutout tool failed ({type(e).__name__})'
    share = sum(m.point(lambda v: 255 if v > 128 else 0).histogram()[255:]) / (m.width * m.height)
    if share < 0.03:
        return None, 'the cutout tool found no person in the photo'
    return m, None


def find_face(rgb, tmp_png, given=None):
    """The biggest face: YuNet (OpenCV) on the photo, else the pair's own face_box. (box [x0, y0, x1, y1], source)."""
    name, detect = guest.detector()
    if detect:
        rgb.save(tmp_png)
        faces = [f for f in detect(tmp_png) if f['conf'] >= 0.7]
        if faces:
            f = max(faces, key=lambda z: (z['box'][2] - z['box'][0]) * (z['box'][3] - z['box'][1]))
            return f['box'], name
    if isinstance(given, (list, tuple)) and len(given) == 4:
        return [float(v) for v in given], 'pair face_box'
    return None, ('no face detector here (pip install opencv-python-headless)' if not detect else 'no face found')


def head_metrics(box, alpha=None):
    """Crown to chin. The chin is the face box's foot; the crown is the top of the cutout above the face (its hair),
    or, without a cutout, an estimate 45 % of the face box above it."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    crown = y0 - 0.45 * h
    if alpha is not None:
        band = alpha.crop((round(x0 + 0.15 * w), 0, round(x1 - 0.15 * w), round(y0 + 0.2 * h)))
        bb = band.point(lambda v: 255 if v > 128 else 0).getbbox()
        if bb:
            crown = bb[1]
    crown = max(0.0, crown)
    return {'face': {'x': round(x0, 1), 'y': round(y0, 1), 'w': round(w, 1), 'h': round(h, 1)},
            'head_px': round(y1 - crown, 1), 'anchor': {'src_cx': round((x0 + x1) / 2, 1), 'src_crown': round(crown, 1)}}


def prepare_one(row, work):
    pid = str(row.get('id') or row.get('pair_id'))
    d = Path(work) / 'pairs' / pid
    d.mkdir(parents=True, exist_ok=True)
    urls = row.get('urls') or {}
    name = row.get('cutout') or pid
    side = 'L' if str(row.get('side') or 'R').strip().upper().startswith('L') else 'R'
    meta = {'id': pid, 'name': name, 'side': side, 'background_id': row.get('background_id') or 'brand',
            'background_label': row.get('background_label') or 'Brand background', 'hook_types': row.get('hook_types') or [],
            'mode': 'photo', 'cutout': None, 'face': None, 'notes': []}
    notes = meta['notes']
    photo = person = None
    orig_w = None
    if urls.get('photo'):
        _get(urls['photo'], d / 'photo.src')
        raw = _open_rgb(d / 'photo.src').convert('RGB')
        orig_w = raw.width
        photo = _fit(raw)
        photo.save(d / 'photo.png')
        (d / 'photo.src').unlink(missing_ok=True)
    if urls.get('person'):
        _get(urls['person'], d / 'person.src')
        person = _open_rgb(d / 'person.src').convert('RGBA')
        (d / 'person.src').unlink(missing_ok=True)
        if photo is not None and person.size != photo.size:
            person = person.resize(photo.size, Image.LANCZOS) if abs(person.width / person.height - photo.width / photo.height) < 0.01 else _fit(person)
        else:
            person = _fit(person)
        meta['cutout'] = 'given'
    elif photo is not None and urls.get('mask'):
        _get(urls['mask'], d / 'mask.src')
        person = photo.convert('RGBA')
        person.putalpha(_mask_from(d / 'mask.src', photo.size))
        (d / 'mask.src').unlink(missing_ok=True)
        meta['cutout'] = 'mask'
    elif photo is not None:
        m, why = made_mask(photo)
        if m is not None:
            person = photo.convert('RGBA')
            person.putalpha(m)
            meta['cutout'] = 'made'
        else:
            notes.append(f'{name}: no cutout ({why}), so only the board plays it, with the plain photo as its print')
    if person is None and photo is None:
        raise RuntimeError(f'{name}: the pair has neither a photo nor a cutout link')
    if person is not None:
        person.save(d / 'person.png')
        meta['mode'] = 'cutout'
    if urls.get('plate'):
        try:
            _get(urls['plate'], d / 'plate.src')
            _open_rgb(d / 'plate.src').convert('RGB').save(d / 'plate.png')
        except (OSError, subprocess.CalledProcessError):
            notes.append('the brand background image did not download, so the backdrop is drawn from the palette')
        (d / 'plate.src').unlink(missing_ok=True)

    # where the face is, in the pixels the looks use (the cutout's, or the photo's)
    src = person if person is not None else photo
    view = src
    if src.mode == 'RGBA':
        view = Image.new('RGB', src.size, (128, 128, 128))
        view.paste(src.convert('RGB'), (0, 0), src.split()[3])
    given = row.get('face_box')
    if given and orig_w:
        k = src.width / orig_w            # face_box is in the original photo's pixels
        given = [float(v) * k for v in given]
    box, how = find_face(view, d / 'face-probe.png', given)
    (d / 'face-probe.png').unlink(missing_ok=True)
    if box:
        meta.update(head_metrics(box, src.split()[3] if src.mode == 'RGBA' else None), face_from=how)
        if meta['head_px'] < MIN_HEAD:
            notes.append(f"{name}: the face is too small in the photo ({meta['head_px']:.0f} px from crown to chin, {MIN_HEAD} at least)")
            meta['face'] = None
        elif meta['head_px'] < SOFT_HEAD:
            notes.append(f"{name}: the face is small in the photo ({meta['head_px']:.0f} px), so the thumbnail may look soft")
    else:
        notes.append(f'{name}: no clear face found ({how})')
    (d / 'pair.json').write_text(json.dumps(meta, indent=1))
    return meta


def prepare(rows, work):
    out = []
    for r in rows:
        try:
            out.append(prepare_one(r, work))
        except (OSError, RuntimeError, subprocess.CalledProcessError) as e:
            out.append({'id': str(r.get('id') or r.get('pair_id')), 'name': r.get('cutout'), 'error': str(e)[:300]})
    return out
