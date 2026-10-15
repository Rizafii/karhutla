"""Small measured fixture run; this is NOT a model accuracy benchmark."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from .detector import Detector
from .temporal import TemporalValidator


def evaluate(source, output):
    detector = Detector('/models/wildfire-smoke-fire.pt')
    entries, thumbnails = [], []
    for path in sorted(Path(source).rglob('*.avi')):
        capture = cv2.VideoCapture(str(path))
        duration = capture.get(cv2.CAP_PROP_FRAME_COUNT) / (capture.get(cv2.CAP_PROP_FPS) or 25)
        samples = []
        thumbnail = None
        for second in sorted(set([min(duration*.2, 5), min(duration*.5, 15), min(duration*.8, 25)])):
            capture.set(cv2.CAP_PROP_POS_MSEC, second*1000)
            ok, frame = capture.read()
            if not ok:continue
            frame = cv2.resize(frame,(960,540))
            results = detector.infer(frame)
            samples.append({'video_seconds':second,'detections':results})
            if thumbnail is None:
                thumbnail=cv2.resize(frame,(240,135))
        capture.release()
        entries.append({'file':str(path.relative_to(source)),'duration_s':duration,'samples':samples})
        print(json.dumps(entries[-1]),flush=True)
        if thumbnail is not None:
            banner=np.zeros((28,240,3),np.uint8)
            cv2.putText(banner,str(path.relative_to(source)),(5,17),cv2.FONT_HERSHEY_SIMPLEX,.34,(210,220,210),1)
            thumbnails.append(np.vstack([thumbnail,banner]))
    while len(thumbnails)%4:thumbnails.append(np.zeros_like(thumbnails[0]))
    grid=np.vstack([np.hstack(thumbnails[i:i+4]) for i in range(0,len(thumbnails),4)])
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    cv2.imwrite(str(output/'fixture-contact-sheet.jpg'),grid)
    (output/'fixture-results.json').write_text(json.dumps({'model':detector.version,'threshold':.6,'note':'Sparse sampling, not accuracy evaluation. Clouds/fog categories require separate reviewed fixtures.','videos':entries},indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',default='/source');parser.add_argument('--output',default='/data/evaluation');args=parser.parse_args()
    evaluate(args.source,args.output)
