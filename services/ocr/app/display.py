"""The display read (Story 9.1): an instrument display, seven-segment or dot-matrix LCD.

Chosen by the spike (`docs/display-reading-spike.md`). The plate pipeline splits each
detected line into words at ink gaps; on a display that split breaks a seven-segment
number at its segment gaps and at its decimal point, so here every detected line is
recognized whole. Before detection the working copy is:

- upscaled so its shorter side is at least MIN_SHORT_SIDE (a display crop can be tiny),
  or downscaled so its longer side is at most MAX_SIDE;
- turned grey and contrast-equalized (CLAHE), because an LCD is low contrast;
- ink-bridged: a grey-level erosion (the minimum over a small disc, 1/BRIDGE_DIVISOR of the
  shorter side) joins the separate segments of a seven-segment digit and the dots of a
  character LCD into solid strokes the detector and the recognizer know.

The photometric steps change no coordinate; the scaling is geometric, so its boxes are
mapped back to the received pixel grid and `preprocessing_applied` is true. Tokens keep the
recognizer's text as read (it has no Omega or degree sign: `GΩ` often reads `GO`); what a
token means is the kernel's job (`packages/domain/src/reading/display.ts`).
"""

import cv2
import numpy as np

from .pipeline import MAX_SIDE, Detector, ReadResult, Recognizer, Token, _order_quad, _reading_order

MIN_SHORT_SIDE = 320
BRIDGE_DIVISOR = 150
MIN_LINE_SIDE = 4


def _prepare(image: np.ndarray) -> tuple[np.ndarray, float]:
    """The working copy and its scale over the received image."""
    height, width = image.shape[:2]
    scale = 1.0
    if min(height, width) < MIN_SHORT_SIDE:
        scale = MIN_SHORT_SIDE / min(height, width)
    elif max(height, width) > MAX_SIDE:
        scale = MAX_SIDE / max(height, width)
    work = image
    if scale != 1.0:
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        work = cv2.resize(image, size, interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA)
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    k = max(3, round(min(gray.shape) / BRIDGE_DIVISOR))
    gray = cv2.erode(gray, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), scale


def read_display(image: np.ndarray, detector: Detector, recognizer: Recognizer) -> ReadResult:
    height, width = image.shape[:2]
    work, scale = _prepare(image)
    crops: list[np.ndarray] = []
    boxes: list[tuple[float, float, float, float]] = []
    for quad in (_order_quad(p) for p in detector.detect(work)):
        tl, tr, br, bl = quad
        line_w = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
        line_h = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
        if line_w < MIN_LINE_SIDE or line_h < MIN_LINE_SIDE:
            continue
        dst = np.array([[0, 0], [line_w, 0], [line_w, line_h], [0, line_h]], dtype=np.float32)
        line = cv2.warpPerspective(work, cv2.getPerspectiveTransform(quad, dst), (line_w, line_h), borderMode=cv2.BORDER_REPLICATE)
        crops.append(cv2.cvtColor(line, cv2.COLOR_BGR2RGB))
        boxes.append((float(quad[:, 0].min()), float(quad[:, 1].min()), float(quad[:, 0].max()), float(quad[:, 1].max())))
    if not crops:
        return ReadResult(width, height, [], scale != 1.0)

    readings = recognizer.read(crops)
    tokens: list[Token] = []
    for i in _reading_order(boxes):
        text = "".join(readings[i].text.split())
        x0, y0, x1, y1 = (v / scale for v in boxes[i])
        x0, y0 = max(0.0, x0), max(0.0, y0)
        x1, y1 = min(float(width), x1), min(float(height), y1)
        if not text or x1 - x0 < 1 or y1 - y0 < 1:
            continue
        tokens.append(Token(text=text, bbox=(round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)), confidence=round(readings[i].confidence, 4)))
    return ReadResult(width, height, tokens, scale != 1.0)
