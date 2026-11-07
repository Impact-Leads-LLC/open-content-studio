#!/usr/bin/env python3
"""Where each person's face sits in their own camera (episode engine).

The face of the person speaking is never covered. Webcams don't move, so a couple of dozen
frames across the edit are enough: OpenCV's YuNet face detector (assets/models, MIT) on each, the biggest face per
frame, the median box per camera. Everything that's placed on screen (cards, graphics, captions) keeps out of these boxes.

In: work/edit.json (cameras, start, end). Out: work/faces.json {"top": [x0, y0, x1, y1], "bot": [...]} as fractions of
that camera's 1920x1080 frame (after the same centre crop the edit uses), with "found": how many frames had a face.
"""
import json
import os
import subprocess
import tempfile

from pathlib import Path

import cv2

edit = json.load(open("work/edit.json"))
SAMPLES = 24
MODEL = str(Path(__file__).parent / "assets/models/face_detection_yunet_2023mar.onnx")
det = cv2.FaceDetectorYN.create(MODEL, "", (960, 540), 0.7, 0.3, 50)
DEFAULT = [0.38, 0.16, 0.62, 0.62]

out = {}
with tempfile.TemporaryDirectory() as tmp:
    for p in edit["people"]:
        boxes = []
        for k in range(SAMPLES):
            t = edit["start"] + (k + 0.5) * edit["dur"] / SAMPLES
            img = os.path.join(tmp, f"{p['key']}-{k}.jpg")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", p["v"], "-frames:v", "1",
                            "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,scale=960:540", img], capture_output=True)
            frame = cv2.imread(img)
            if frame is None:
                continue
            det.setInputSize((frame.shape[1], frame.shape[0]))
            _, faces = det.detect(frame)
            if faces is not None and len(faces):
                x, y, w, h = [float(v) for v in max(faces, key=lambda f: f[2] * f[3])[:4]]
                boxes.append([x / 960, y / 540, (x + w) / 960, (y + h) / 540])
        if boxes:
            med = [sorted(b[i] for b in boxes)[len(boxes) // 2] for i in range(4)]
            # a detector's box is the face alone; keep clear of the whole head (hair, a cap, headphones) and the chin
            w, h = med[2] - med[0], med[3] - med[1]
            box = [max(0, med[0] - 0.35 * w), max(0, med[1] - 0.55 * h), min(1, med[2] + 0.35 * w), min(1, med[3] + 0.3 * h)]
        else:
            box = DEFAULT
        out[p["key"]] = [round(v, 4) for v in box]
        out[f"{p['key']}_found"] = len(boxes)
        print(f"face: {p['name']} at {', '.join(f'{v:.2f}' for v in box)} ({len(boxes)}/{SAMPLES} frames)", flush=True)
json.dump(out, open("work/faces.json", "w"))
