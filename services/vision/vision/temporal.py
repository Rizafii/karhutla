from collections import deque
import time


def inference_max_gap(inference_seconds, camera_count, target_fps):
    """Allow four inference rounds on a shared CPU before expiring samples."""
    return max(5, 4 * max(inference_seconds, 1 / target_fps) * max(1, camera_count))


class TemporalValidator:
    """Experimental class-specific N-of-M filter. No model accuracy claims."""
    def __init__(self, window=6, positives=4, threshold=.6, cooldown=60, max_gap=5):
        if window < 1 or not 1 <= positives <= window or not 0 <= threshold <= 1 or cooldown < 0:
            raise ValueError("Invalid temporal validation parameters")
        self.window, self.positives, self.threshold, self.cooldown, self.max_gap = window, positives, threshold, cooldown, max_gap
        self.reset()

    def reset(self, clear_cooldown=True):
        self.results = deque(maxlen=self.window)
        if clear_cooldown or not hasattr(self, "last_positive"):
            self.last_positive = {"smoke": float('-inf'), "fire": float('-inf')}
        self.last_sample = None

    def add(self, detections, at=None):
        at = time.monotonic() if at is None else at
        if self.last_sample is not None and at - self.last_sample > self.max_gap:
            self.results.clear()
        self.last_sample = at
        valid = [d for d in detections if d["category"] in self.last_positive and d["confidence"] >= self.threshold]
        self.results.append({d["category"] for d in valid})
        # Four real positives already satisfy 4-of-6. Waiting for two more
        # samples can miss a short smoke segment on a shared, slow CPU.
        if len(self.results) < self.positives:
            return []
        candidates = []
        for category in self.last_positive:
            current = [d for d in valid if d["category"] == category]
            if current and sum(category in result for result in self.results) >= self.positives and at - self.last_positive[category] >= self.cooldown:
                self.last_positive[category] = at
                candidates.append(max(current, key=lambda d: d["confidence"]))
        return candidates
