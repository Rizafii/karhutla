import hashlib
from pathlib import Path


def adapt_results(result, names):
    detections = []
    if result.boxes is None:
        return detections
    for box, confidence, class_id in zip(result.boxes.xyxy.tolist(), result.boxes.conf.tolist(), result.boxes.cls.tolist()):
        category = str(names[int(class_id)]).lower().strip()
        if category in ("smoke", "fire"):
            detections.append({"category": category, "confidence": float(confidence), "bbox": [float(x) for x in box]})
    return detections


class Detector:
    def __init__(self, weights, device="cpu", threshold=.6):
        path = Path(weights)
        if not path.is_file():
            raise ValueError(f"Weights smoke/fire tidak ditemukan: {path}. Unduh saat persiapan; tidak ada download otomatis.")
        from ultralytics import YOLO
        self.model = YOLO(str(path), task="detect")
        names = {int(k): str(v).lower().strip() for k, v in self.model.names.items()}
        if not {"smoke", "fire"}.issubset(set(names.values())) or self.model.task != "detect":
            raise ValueError(f"Model tidak kompatibel: harus object detection dengan kelas smoke dan fire; ditemukan {names}")
        self.names, self.device, self.threshold = names, device, threshold
        self.version = f"{path.name}:sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"
        import torch
        torch.set_num_threads(2)

    def infer(self, frame):
        result = self.model.predict(frame, device=self.device, conf=self.threshold, imgsz=640, verbose=False)[0]
        return adapt_results(result, self.names)
