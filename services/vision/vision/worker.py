import os
import time
import json
import hashlib
import logging
import threading
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
import cv2
import httpx
from .detector import Detector
from .temporal import TemporalValidator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
ROOT = Path(os.getenv("DATA_DIR", "/data"))
PREVIEW_FPS = float(os.getenv("PREVIEW_FPS", "5"))
INFERENCE_FPS = float(os.getenv("INFERENCE_FPS", "1"))
THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", ".6"))
if PREVIEW_FPS <= 0 or INFERENCE_FPS <= 0:
    raise ValueError("PREVIEW_FPS dan INFERENCE_FPS harus lebih besar dari nol")
for directory in (ROOT, ROOT / "frames", ROOT / "evidence"):
    directory.mkdir(parents=True, exist_ok=True)


def atomic(path, content):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(content)
    temporary.replace(path)


class CameraReader:
    def __init__(self, camera, source, epoch):
        self.camera, self.source, self.epoch = camera, source, epoch
        self.frame, self.frame_at, self.serial = None, None, 0
        self.inference_at = None
        self.status, self.error, self.ai_status = "reconnecting", None, "unavailable"
        self.paused = False
        self.stop = threading.Event()
        self.validator = TemporalValidator(int(os.getenv("VALIDATION_WINDOW", "6")), int(os.getenv("VALIDATION_POSITIVES", "4")), THRESHOLD, float(os.getenv("DETECTION_COOLDOWN", "60")), max_gap=max(5, 4 / INFERENCE_FPS))
        self.last_inference, self.processed_serial = 0, -1
        self.thread = threading.Thread(target=self.run, daemon=True)
        for suffix in (".jpg", "-ai.jpg"):
            (ROOT / "frames" / f"{self.camera['id']}{suffix}").unlink(missing_ok=True)
        self.thread.start()

    def run(self):
        source_type = self.camera["source_type"]
        while not self.stop.is_set():
            if source_type == "mp4" and not Path(str(self.source)).is_file():
                self.status, self.error = "unavailable", f"Footage tidak ditemukan: {self.source}"
                self.stop.wait(2)
                continue
            capture = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG if source_type == "rtsp" else cv2.CAP_ANY)
            if not capture.isOpened():
                self.status, self.error = "reconnecting", "Sumber video tidak dapat dibuka"
                capture.release()
                self.stop.wait(3)
                continue
            fps = capture.get(cv2.CAP_PROP_FPS) or 25
            stride = max(1, int(fps / PREVIEW_FPS)) if source_type == "mp4" else 1
            while not self.stop.is_set():
                if self.paused:
                    self.status = "paused"
                    self.stop.wait(.2)
                    continue
                started = time.monotonic()
                ok, frame = capture.read()
                if self.stop.is_set():
                    break
                if not ok:
                    if source_type == "mp4":
                        capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        self.validator.reset(clear_cooldown=False)
                        continue
                    self.status, self.error = "reconnecting", "Video terputus; mencoba kembali"
                    self.validator.reset(clear_cooldown=False)
                    break
                if source_type == "mp4":
                    for _ in range(stride - 1):
                        capture.grab()
                frame = cv2.resize(frame, (960, 540))
                self.frame, self.frame_at, self.serial = frame, datetime.now(timezone.utc).isoformat(), self.serial + 1
                self.status, self.error = "connected", None
                _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                atomic(ROOT / "frames" / f"{self.camera['id']}.jpg", jpeg.tobytes())
                self.stop.wait(max(0, 1 / PREVIEW_FPS - (time.monotonic() - started)))
            capture.release()

    def close(self):
        self.stop.set()
        self.thread.join(timeout=2)


def main():
    os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|timeout;5000000")
    cv2.setNumThreads(1)
    detector, model_error = None, None
    try:
        detector = Detector(os.getenv("MODEL_PATH", "/models/wildfire-smoke-fire.pt"), os.getenv("MODEL_DEVICE", "cpu"), THRESHOLD)
        logger.info("Model loaded: %s", detector.version)
    except Exception as error:
        model_error = str(error)
        logger.error("AI unavailable: %s", model_error)
    client = httpx.Client(base_url=os.getenv("API_URL", "http://localhost:8000"), headers={"X-Service-Token": os.getenv("SERVICE_TOKEN", "")}, timeout=10)
    readers, previous_epoch, last_config = {}, None, 0
    pending, demo, total, first = [], {}, 0, time.monotonic()
    while True:
        try:
            if time.monotonic() - last_config >= 1:
                response = client.get("/internal/vision/config")
                response.raise_for_status()
                config = response.json()
                demo = config["demo"]
                epoch = demo["epoch"]
                if epoch != previous_epoch:
                    for reader in readers.values():
                        reader.close()
                    readers, pending, previous_epoch = {}, [], epoch
                for camera in config["cameras"]:
                    src = camera["source_config"]
                    source = src.get("scenario", src.get("normal")) if camera["id"] == "CAM-002" and demo["status"] == "running" and demo["mode"] == "ai" else src.get("normal")
                    if camera["source_type"] == "rtsp":
                        source = src.get("url", "")
                    elif camera["source_type"] == "webcam":
                        source = int(src.get("index", 0))
                    if camera["id"] not in readers:
                        readers[camera["id"]] = CameraReader(camera, source or "", epoch)
                    readers[camera["id"]].paused = demo["paused"]
                last_config = time.monotonic()
            infer_enabled = not demo.get("paused") and not (demo.get("status") == "running" and demo.get("mode") == "manual_simulation")
            for id, reader in readers.items():
                if detector and infer_enabled and reader.frame is not None and reader.serial != reader.processed_serial and time.monotonic() - reader.last_inference >= 1 / INFERENCE_FPS:
                    reader.ai_status = "processing"
                    serial, frame, timestamp = reader.serial, reader.frame.copy(), reader.frame_at
                    detections = detector.infer(frame)
                    reader.last_inference, reader.processed_serial = time.monotonic(), serial
                    reader.inference_at = datetime.now(timezone.utc).isoformat()
                    total += 1
                    annotated = frame.copy()
                    for detection in detections:
                        x1, y1, x2, y2 = map(int, detection["bbox"])
                        color = (64, 180, 245) if detection["category"] == "smoke" else (70, 80, 235)
                        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(annotated, f"{detection['category']} {detection['confidence']:.2f}", (x1, max(20, y1-8)), cv2.FONT_HERSHEY_SIMPLEX, .6, color, 2)
                    cv2.putText(annotated, f"AI FRAME | {timestamp}", (12, 525), cv2.FONT_HERSHEY_SIMPLEX, .4, (220, 220, 220), 1)
                    _, jpeg = cv2.imencode(".jpg", annotated)
                    atomic(ROOT / "frames" / f"{id}-ai.jpg", jpeg.tobytes())
                    for candidate in reader.validator.add(detections):
                        detection_id = f"DET-{uuid4().hex[:12]}"
                        path = f"evidence/{detection_id}.jpg"
                        atomic(ROOT / path, jpeg.tobytes())
                        pending.append({"id": detection_id, "camera_id": id, **candidate, "captured_at": timestamp,
                                        "evidence_path": path, "model_version": detector.version, "demo_epoch": reader.epoch,
                                        "frame_width": frame.shape[1]})
                    reader.ai_status = "ready"
                elif demo.get("paused"):
                    reader.ai_status = "paused"
                elif not detector or not infer_enabled:
                    reader.ai_status = "unavailable"
            for candidate in pending[:]:
                response = client.post("/internal/detections", json=candidate)
                if response.is_success or response.status_code in (409, 422):
                    if not response.is_success:
                        logger.warning("Candidate rejected: %s", response.text)
                    pending.remove(candidate)
            statuses = [{"camera_id": id, "connection_status": reader.status, "ai_status": reader.ai_status,
                         "last_frame_at": reader.frame_at, "last_inference_at": reader.inference_at, "error": reader.error} for id, reader in readers.items()]
            response = client.post("/internal/vision/heartbeat", json={"epoch": previous_epoch, "model_ready": detector is not None,
                "model_error": model_error, "model_version": detector.version if detector else None,
                "footage_ready": all(c["source_type"] == "mp4" and Path(str(c["source_config"].get("normal", ""))).is_file() for c in config["cameras"])
                    and all(Path(str(c["source_config"].get("scenario", ""))).is_file() for c in config["cameras"] if c["id"] == "CAM-002"),
                "inference_fps": total / max(1, time.monotonic() - first), "cameras": statuses})
            if response.status_code not in (200, 409):
                response.raise_for_status()
            (ROOT / "worker-heartbeat").touch()
        except Exception:
            logger.exception("Vision loop failed; retrying")
        time.sleep(.2)


if __name__ == "__main__":
    main()
