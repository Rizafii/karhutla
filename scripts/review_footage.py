"""Inspect downloaded footage and optionally run the real detector on samples."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--infer', action='store_true')
args = parser.parse_args()
detector = None
if args.infer:
    import sys
    sys.path.insert(0, '/app')
    from vision.detector import Detector
    detector = Detector('/models/wildfire-smoke-fire.pt')
cv2.setNumThreads(1)
rows = []
for name in ['forest', 'wildfire', 'drone-approach', 'drone-fire']:
    capture = cv2.VideoCapture(f'/assets/source/pexels/{name}.mp4')
    duration = capture.get(cv2.CAP_PROP_FRAME_COUNT) / capture.get(cv2.CAP_PROP_FPS)
    frames = []
    for second in [1, duration / 2, duration - 2]:
        capture.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
        ok, frame = capture.read()
        assert ok, (name, second)
        if detector:
            detections = detector.infer(cv2.resize(frame, (960, 540)))
            print(json.dumps({'clip': name, 'second': second, 'detections': detections}), flush=True)
        frame = cv2.resize(frame, (480, 270))
        cv2.putText(frame, f'{name} {second:.1f}s', (10, 25), 0, .7, (255, 255, 255), 2)
        frames.append(frame)
    rows.append(np.hstack(frames))
    capture.release()
cv2.imwrite('/assets/source/footage-preview.jpg', np.vstack(rows))
