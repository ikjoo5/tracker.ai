"""Pretrained MobileNet SSD person detector through OpenCV DNN, CPU only."""
from pathlib import Path
import hashlib

import cv2
import numpy as np

MODEL_REVISION = "bb17b6c3eef36d80be441ae8e5339be66e8e3b7a"
MODEL_FILES = {
    "deploy.prototxt": "2d180f723b3109e21f8287f6b3c691390d07b60eed998327cd3259ffa0e50608",
    "mobilenet_iter_73000.caffemodel": "52eed8be80522c152a17fb56740de705b79881bde1a167e0e747310523685fc7",
}
MODEL_DIR = Path(__file__).resolve().parent / "models"
DETECTOR_NAME = "opencv-mobilenet-ssd-person"


def verified_model_files(directory: Path = MODEL_DIR) -> bool:
    return all((directory / name).is_file() and hashlib.sha256((directory / name).read_bytes()).hexdigest() == digest
               for name, digest in MODEL_FILES.items())


class PersonDetector:
    """VOC person class 15, threshold .40; model confidence is not accuracy."""
    def __init__(self, model_dir: Path = MODEL_DIR, threshold: float = .4):
        if not verified_model_files(model_dir):
            raise ValueError("사전 학습 모델이 없거나 무결성 확인에 실패했습니다. python scripts/setup_model.py를 실행해 주세요.")
        self.threshold = threshold
        self.net = cv2.dnn.readNetFromCaffe(str(model_dir / "deploy.prototxt"), str(model_dir / "mobilenet_iter_73000.caffemodel"))
        self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        cv2.setNumThreads(2)

    def detect(self, frame: np.ndarray) -> list[dict]:
        blob = cv2.dnn.blobFromImage(frame, scalefactor=.007843, size=(300, 300), mean=127.5, swapRB=False, crop=False)
        self.net.setInput(blob)
        output = self.net.forward()
        boxes, scores = [], []
        for item in output[0, 0]:
            if int(item[1]) != 15 or float(item[2]) < self.threshold:
                continue
            x1, y1, x2, y2 = np.clip(item[3:7], 0., 1.)
            if x2 <= x1 or y2 <= y1:
                continue
            boxes.append([float(x1), float(y1), float(x2 - x1), float(y2 - y1)])
            scores.append(float(item[2]))
        if not boxes:
            return []
        # NMS uses normalized coordinates consistently; suppress overlapping boxes.
        keep = np.asarray(cv2.dnn.NMSBoxes(boxes, scores, self.threshold, .4)).flatten()
        return [{"bbox": boxes[int(i)], "confidence": round(scores[int(i)], 5), "role": "person"} for i in keep]
