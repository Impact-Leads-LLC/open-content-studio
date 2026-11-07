"""The call look's guest frame: a real frame from the episode, never generated.

  thumb.py guest-frame <video> --at <seconds> [--window 1.5] [--step 0.25] [--out DIR] [--pick largest|left|right]
                       [--min-face 80] [--at-exact]

Grabs candidate frames around --at with ffmpeg, finds faces with OpenCV's YuNet (assets/models; pip install
opencv-python-headless), and keeps the frame whose guest face is sharpest and clearly visible. Writes DIR/guest-<t>.jpg (the frame, full resolution, untouched),
DIR/guest.json (the record the renderer reads) and DIR/guest-candidates.jpg (every candidate with its score, so a
person can pick another time with --at <t> --at-exact). Exit 0 with a frame, 1 when no usable face was found.

The record:
  {"video": "<abs path>", "at": 257.0, "picked_t": 257.5, "image": "guest-257.50.jpg", "face": [x0, y0, x1, y1],
   "landmarks": {...}, "detector": "yunet-2023mar", "score": 0.93, "sharpness": 412.5,
   "size": [1920, 1080], "sha256": "<frame sha256>", "candidates": [...]}"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageStat

from .tokens import path

MODEL = path('assets/models/face_detection_yunet_2023mar.onnx')
os.environ.setdefault('OPENCV_LOG_LEVEL', 'ERROR')


def ffmpeg_bin(name='ffmpeg'):
    env = os.environ.get('THUMBKIT_FFMPEG' if name == 'ffmpeg' else 'THUMBKIT_FFPROBE')
    if env:
        return env
    found = shutil.which(name)
    if found:
        return found
    local = Path.home() / '.local' / 'bin' / name
    if local.exists():
        return str(local)
    raise SystemExit(f'{name} not found: install FFmpeg or set THUMBKIT_FFMPEG / THUMBKIT_FFPROBE')


def duration(video):
    out = subprocess.run([ffmpeg_bin('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of',
                          'default=nw=1:nk=1', str(video)], capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return None


def grab(video, t, dest):
    subprocess.run([ffmpeg_bin(), '-v', 'error', '-ss', f'{t:.3f}', '-i', str(video), '-frames:v', '1', '-q:v', '1',
                    '-y', str(dest)], check=True)
    return dest


def detector():
    """('yunet-2023mar', fn) with OpenCV and the model, else (None, None)."""
    try:
        import cv2  # noqa: F401
        if MODEL.exists() and hasattr(cv2, 'FaceDetectorYN'):
            return 'yunet-2023mar', _yunet
    except ImportError:
        pass
    return None, None


def _yunet(img_path):
    import cv2
    img = cv2.imread(str(img_path))
    h, w = img.shape[:2]
    det = cv2.FaceDetectorYN.create(str(MODEL), '', (w, h), 0.7, 0.3, 5000)
    det.setInputSize((w, h))
    _, faces = det.detect(img)
    out = []
    for f in (faces if faces is not None else []):
        x, y, fw, fh = [float(v) for v in f[:4]]
        lm = [float(v) for v in f[4:14]]
        out.append({'box': [x, y, x + fw, y + fh], 'conf': float(f[14]),
                    'landmarks': {'eye_r': lm[0:2], 'eye_l': lm[2:4], 'nose': lm[4:6], 'mouth_r': lm[6:8], 'mouth_l': lm[8:10]}})
    return out


def sharpness(img, box):
    """Variance of the edge response inside the face box (higher is sharper)."""
    x0, y0, x1, y1 = [round(v) for v in box]
    face = img.crop((max(0, x0), max(0, y0), min(img.width, x1), min(img.height, y1))).convert('L')
    if face.width < 8 or face.height < 8:
        return 0.0
    try:
        import cv2
        import numpy as np
        return float(cv2.Laplacian(np.asarray(face), cv2.CV_64F).var())
    except ImportError:
        return float(ImageStat.Stat(face.filter(ImageFilter.FIND_EDGES)).var[0])


def frontal(face):
    lm = face.get('landmarks') or {}
    if 'eye_r' in lm and 'eye_l' in lm and 'nose' in lm:
        ex = (lm['eye_r'][0] + lm['eye_l'][0]) / 2
        w = face['box'][2] - face['box'][0]
        return max(0.0, 1 - abs(lm['nose'][0] - ex) / (0.25 * w))
    if face.get('yaw_deg') is not None:
        return max(0.0, 1 - abs(face['yaw_deg']) / 45)
    return 0.5


def choose(faces, pick, width):
    if not faces:
        return None
    if pick == 'left':
        return min(faces, key=lambda f: f['box'][0])
    if pick == 'right':
        return max(faces, key=lambda f: f['box'][2])
    return max(faces, key=lambda f: (f['box'][2] - f['box'][0]) * (f['box'][3] - f['box'][1]))


def run(video, at, out_dir, window=1.5, step=0.25, pick='largest', min_face=80, exact=False):
    video = Path(video).resolve()
    if not video.exists():
        raise SystemExit(f'no such video: {video}')
    name, detect = detector()
    if not detect:
        raise SystemExit('no face detector: pip install opencv-python-headless (YuNet)')
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    dur = duration(video)
    n = 0 if exact else int(round(window / step))
    times = sorted({round(min(max(0.0, at + k * step), (dur or at + 1) - 0.05), 3) for k in range(-n, n + 1)})
    tmp = Path(tempfile.mkdtemp(prefix='guest-'))
    cands = []
    try:
        for t in times:
            fp = grab(video, t, tmp / f'f-{t:.3f}.jpg')
            img = Image.open(fp).convert('RGB')
            f = choose([z for z in detect(fp) if z['box'][2] - z['box'][0] >= min_face], pick, img.width)
            rec = {'t': t, 'file': str(fp)}
            if f:
                sh = sharpness(img, f['box'])
                rec.update(face=[round(v, 1) for v in f['box']], conf=round(f['conf'], 3), sharpness=round(sh, 1),
                           frontal=round(frontal(f), 3), landmarks=f.get('landmarks'), size=[img.width, img.height])
            cands.append(rec)
        good = [c for c in cands if c.get('face') and c['conf'] >= 0.8]
        if not good:
            _sheet(cands, out / 'guest-candidates.jpg', None)
            print(json.dumps({'guest_frame': None, 'at': at, 'reason': 'no clear face in any candidate frame',
                              'candidates': len(cands)}))
            return 1
        smax = max(c['sharpness'] for c in good) or 1
        amax = max((c['face'][2] - c['face'][0]) for c in good) or 1
        for c in good:
            c['score'] = round(0.5 * c['sharpness'] / smax + 0.2 * (c['face'][2] - c['face'][0]) / amax
                               + 0.2 * c['conf'] + 0.1 * c['frontal'] - 0.02 * abs(c['t'] - at), 4)
        best = max(good, key=lambda c: c['score'])
        dest = out / f"guest-{best['t']:.2f}.jpg"
        shutil.copy2(best['file'], dest)
        sha = hashlib.sha256(dest.read_bytes()).hexdigest()
        rec = {'video': str(video), 'at': at, 'picked_t': best['t'], 'image': dest.name, 'face': best['face'],
               'landmarks': best.get('landmarks'), 'detector': name, 'score': best['score'], 'conf': best['conf'],
               'sharpness': best['sharpness'], 'size': best['size'], 'sha256': sha,
               'candidates': [{k: c.get(k) for k in ('t', 'face', 'conf', 'sharpness', 'frontal', 'score')} for c in cands]}
        (out / 'guest.json').write_text(json.dumps(rec, indent=1))
        _sheet(cands, out / 'guest-candidates.jpg', best['t'])
        print(json.dumps({k: rec[k] for k in ('picked_t', 'image', 'face', 'detector', 'score')}))
        print(out / 'guest.json')
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _sheet(cands, dest, best_t):
    tw, th = 320, 180
    cols = 5
    rows = (len(cands) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * (th + 18)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for i, c in enumerate(cands):
        im = Image.open(c['file']).convert('RGB')
        s = tw / im.width
        t = im.resize((tw, round(im.height * s)))
        x, y = (i % cols) * tw, (i // cols) * (th + 18)
        sheet.paste(t.crop((0, 0, tw, th)), (x, y))
        if c.get('face'):
            b = [v * s for v in c['face']]
            d.rectangle((x + b[0], y + b[1], x + b[2], y + b[3]), outline=(255, 197, 48) if c['t'] == best_t else (120, 200, 255), width=2)
        label = f"{c['t']:.2f}s" + (f"  {c.get('score', 0):.2f}" if c.get('score') is not None else '  no face')
        d.text((x + 4, y + th + 3), label + ('  PICKED' if c['t'] == best_t else ''), fill=(255, 255, 255))
    sheet.save(dest, quality=85)
