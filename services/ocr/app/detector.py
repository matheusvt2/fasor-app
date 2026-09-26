"""PP-OCRv5 text-line detection through PaddleOCR on paddlepaddle's CPU runtime.

The model directory is baked into the image at build time (`$OCR_MODELS_DIR`);
PaddleOCR is always given `model_dir`, so it never looks anything up online.
"""

import os
from pathlib import Path

import numpy as np

DETECTION_MODEL = "PP-OCRv5_server_det"


class Pp5Detector:
    def __init__(self, model_dir: Path) -> None:
        from paddleocr import TextDetection

        self.model = TextDetection(
            model_name=DETECTION_MODEL,
            model_dir=str(model_dir),
            device="cpu",
            enable_mkldnn=False,
            cpu_threads=int(os.environ.get("OMP_NUM_THREADS", "4")),
        )

    def detect(self, bgr: np.ndarray) -> list[np.ndarray]:
        """Line polygons as float32 arrays of shape (4, 2), in the given image's pixels."""
        results = list(self.model.predict(bgr, batch_size=1))
        if not results:
            return []
        polys = results[0]["dt_polys"]
        return [np.asarray(p, dtype=np.float32).reshape(-1, 2) for p in polys if len(p) >= 4]


def load_detector() -> Pp5Detector:
    return Pp5Detector(Path(os.environ.get("OCR_MODELS_DIR", "/opt/models")) / DETECTION_MODEL)
