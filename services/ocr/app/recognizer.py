"""PARSeq word recognition on onnxruntime (CPU).

The ONNX graph and its charset are exported at image build time by
`builder/export_parseq.py` into `$OCR_MODELS_DIR/parseq/`. Input: word crops as
RGB uint8 arrays of any size; output: the greedy decode and its confidence (the
product of the per-step probabilities up to and including the end token).
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path

from PIL import Image
import numpy as np
import onnxruntime as ort

RECOGNITION_MODEL = "parseq"


@dataclass(frozen=True)
class Reading:
    text: str
    confidence: float


class ParseqRecognizer:
    def __init__(self, model_dir: Path) -> None:
        meta = json.loads((model_dir / "parseq.json").read_text())
        self.charset: str = meta["charset"]
        self.eos_id: int = meta["eos_id"]
        self.height, self.width = meta["img_size"]
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(os.environ.get("OMP_NUM_THREADS", "4"))
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(
            str(model_dir / "parseq.onnx"), sess_options=options, providers=["CPUExecutionProvider"]
        )

    def _prepare(self, crop: np.ndarray) -> np.ndarray:
        # The upstream transform: PIL bicubic resize (antialiased) to 32x128, Normalize(0.5, 0.5).
        resized = np.asarray(Image.fromarray(crop).resize((self.width, self.height), Image.Resampling.BICUBIC))
        tensor = resized.astype(np.float32) / 255.0
        tensor = (tensor - 0.5) / 0.5
        return tensor.transpose(2, 0, 1)

    def read(self, crops: list[np.ndarray], batch: int = 16) -> list[Reading]:
        readings: list[Reading] = []
        for start in range(0, len(crops), batch):
            chunk = np.stack([self._prepare(c) for c in crops[start : start + batch]])
            (probs,) = self.session.run(None, {"images": chunk})
            readings.extend(self._decode(p) for p in probs)
        return readings

    def _decode(self, probs: np.ndarray) -> Reading:
        ids = probs.argmax(-1)
        best = probs.max(-1)
        chars: list[str] = []
        confidence = 1.0
        for token_id, p in zip(ids, best):
            confidence *= float(p)
            if token_id == self.eos_id:
                break
            index = int(token_id) - 1
            if 0 <= index < len(self.charset):
                chars.append(self.charset[index])
        return Reading("".join(chars), max(0.0, min(1.0, confidence)))


def load_recognizer() -> ParseqRecognizer:
    return ParseqRecognizer(Path(os.environ.get("OCR_MODELS_DIR", "/opt/models")) / "parseq")
