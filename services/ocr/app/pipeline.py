"""The read pipeline: decode, geometric preprocessing, line detection, word split,
word recognition, reading order, token ids.

Every coordinate returned is in the pixel grid of the received bytes as OpenCV
decodes them with EXIF orientation ignored. Geometric steps (downscale of a side
above MAX_SIDE, deskew when the median line angle is at least DESKEW_MIN_DEG) run
on a working copy and their boxes are mapped back through the inverse transform;
either sets `preprocessing_applied`.
"""

import math
from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np

from .recognizer import Reading

MAX_SIDE = 4000
DESKEW_MIN_DEG = 1.0
# A column gap wider than this fraction of the line's ink height separates two words.
WORD_GAP_RATIO = 0.3
MIN_WORD_WIDTH = 2
# Word crops narrower than this width / height ratio are padded before recognition.
MIN_CROP_ASPECT = 2.0


class InvalidImage(Exception):
    pass


class Detector(Protocol):
    def detect(self, bgr: np.ndarray) -> list[np.ndarray]: ...


class Recognizer(Protocol):
    def read(self, crops: list[np.ndarray]) -> list[Reading]: ...


@dataclass(frozen=True)
class Token:
    text: str
    bbox: tuple[float, float, float, float]
    confidence: float


@dataclass(frozen=True)
class ReadResult:
    width: int
    height: int
    tokens: list[Token]
    preprocessing_applied: bool


def decode(data: bytes) -> np.ndarray:
    """BGR pixels of the received bytes, EXIF orientation ignored."""
    if not data:
        raise InvalidImage("empty body")
    buffer = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
    if image is None or image.size == 0 or image.shape[0] < 2 or image.shape[1] < 2:
        raise InvalidImage("not a decodable image")
    return image


def _order_quad(poly: np.ndarray) -> np.ndarray:
    """Four corners tl, tr, br, bl of a detection polygon (min-area rectangle for more points)."""
    if len(poly) != 4:
        poly = cv2.boxPoints(cv2.minAreaRect(poly.astype(np.float32)))
    pts = np.asarray(poly, dtype=np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def _line_angle(quad: np.ndarray) -> float | None:
    tl, tr, br, bl = quad
    width = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2
    height = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2
    if width < 2 * height:
        return None
    top = math.degrees(math.atan2(tr[1] - tl[1], tr[0] - tl[0]))
    bottom = math.degrees(math.atan2(br[1] - bl[1], br[0] - bl[0]))
    return (top + bottom) / 2


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    """Text pixels of a line crop: the minority class of an Otsu split."""
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mask = binary > 0
    if mask.mean() > 0.5:
        mask = ~mask
    return mask


def _runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) runs of True."""
    runs: list[tuple[int, int]] = []
    start = None
    for i, flag in enumerate(flags):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(flags)))
    return runs


def _widen(crop: np.ndarray) -> np.ndarray:
    """Pad a short word with its own edge colour up to MIN_CROP_ASPECT (width / height).

    The recognizer stretches every crop to 128 x 32; a one- or two-letter word stretched
    four times over loses its shape ("0" turns into "O", "kV" into "KV")."""
    h, w = crop.shape[:2]
    target = int(math.ceil(MIN_CROP_ASPECT * h))
    if w >= target:
        return crop
    left = (target - w) // 2
    return cv2.copyMakeBorder(crop, 0, 0, left, target - w - left, cv2.BORDER_REPLICATE)


@dataclass(frozen=True)
class _Word:
    crop: np.ndarray  # RGB crop for the recognizer
    corners: np.ndarray  # (4, 2) word box corners in the working image


def _split_line(work: np.ndarray, quad: np.ndarray) -> list[_Word]:
    tl, tr, br, bl = quad
    width = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    height = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    if width < MIN_WORD_WIDTH or height < 4:
        return []
    dst = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    forward = cv2.getPerspectiveTransform(quad, dst)
    inverse = cv2.getPerspectiveTransform(dst, quad)
    line = cv2.warpPerspective(work, forward, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    gray = cv2.cvtColor(line, cv2.COLOR_BGR2GRAY)
    ink = _ink_mask(gray)
    ink_rows = np.flatnonzero(ink.any(axis=1))
    if ink_rows.size == 0:
        return []
    ink_height = int(ink_rows[-1] - ink_rows[0] + 1)
    min_col_ink = max(1, int(round(0.04 * ink_height)))
    columns = ink.sum(axis=0) >= min_col_ink
    runs = _runs(columns)
    if not runs:
        return []
    gap_limit = WORD_GAP_RATIO * ink_height
    segments: list[list[int]] = [[runs[0][0], runs[0][1]]]
    for start, end in runs[1:]:
        if start - segments[-1][1] > gap_limit:
            segments.append([start, end])
        else:
            segments[-1][1] = end

    words: list[_Word] = []
    pad = max(2, int(round(0.15 * ink_height)))
    rgb_line = cv2.cvtColor(line, cv2.COLOR_BGR2RGB)
    for c0, c1 in segments:
        if c1 - c0 < MIN_WORD_WIDTH:
            continue
        rows = np.flatnonzero(ink[:, c0:c1].any(axis=1))
        if rows.size == 0:
            continue
        r0, r1 = int(rows[0]), int(rows[-1]) + 1
        box = np.array([[c0, r0], [c1, r0], [c1, r1], [c0, r1]], dtype=np.float32).reshape(-1, 1, 2)
        corners = cv2.perspectiveTransform(box, inverse).reshape(-1, 2)
        crop = _widen(rgb_line[:, max(0, c0 - pad) : min(width, c1 + pad)])
        words.append(_Word(crop=crop, corners=corners))
    return words


def _reading_order(boxes: list[tuple[float, float, float, float]]) -> list[int]:
    """Indices in reading order: rows top to bottom (by vertical overlap), words left to right."""
    order = sorted(range(len(boxes)), key=lambda i: ((boxes[i][1] + boxes[i][3]) / 2, boxes[i][0]))
    rows: list[list[int]] = []
    for i in order:
        x0, y0, x1, y1 = boxes[i]
        cy = (y0 + y1) / 2
        if rows:
            row = rows[-1]
            top = float(np.median([boxes[j][1] for j in row]))
            bottom = float(np.median([boxes[j][3] for j in row]))
            if top <= cy <= bottom:
                row.append(i)
                continue
        rows.append([i])
    return [i for row in rows for i in sorted(row, key=lambda j: boxes[j][0])]


def _to_affine3(m: np.ndarray) -> np.ndarray:
    return np.vstack([m, [0.0, 0.0, 1.0]])


def read_image(image: np.ndarray, detector: Detector, recognizer: Recognizer) -> ReadResult:
    height, width = image.shape[:2]
    # `to_source` maps working-image coordinates back to the received pixel grid.
    to_source = np.eye(3)
    work = image
    applied = False

    longest = max(height, width)
    if longest > MAX_SIDE:
        scale = MAX_SIDE / longest
        work = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
        to_source = to_source @ np.diag([1 / scale, 1 / scale, 1.0])
        applied = True

    quads = [_order_quad(p) for p in detector.detect(work)]
    angles = [a for a in (_line_angle(q) for q in quads) if a is not None]
    if angles:
        angle = float(np.median(angles))
        if abs(angle) >= DESKEW_MIN_DEG:
            h, w = work.shape[:2]
            rotation = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
            cos, sin = abs(rotation[0, 0]), abs(rotation[0, 1])
            new_w, new_h = int(math.ceil(h * sin + w * cos)), int(math.ceil(h * cos + w * sin))
            rotation[0, 2] += new_w / 2 - w / 2
            rotation[1, 2] += new_h / 2 - h / 2
            work = cv2.warpAffine(work, rotation, (new_w, new_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            to_source = to_source @ np.linalg.inv(_to_affine3(rotation))
            applied = True
            quads = [_order_quad(p) for p in detector.detect(work)]

    words: list[_Word] = []
    for quad in quads:
        words.extend(_split_line(work, quad))
    if not words:
        return ReadResult(width, height, [], applied)

    readings = recognizer.read([w.crop for w in words])
    work_boxes: list[tuple[float, float, float, float]] = []
    source_boxes: list[tuple[float, float, float, float] | None] = []
    for word in words:
        c = word.corners
        work_boxes.append((float(c[:, 0].min()), float(c[:, 1].min()), float(c[:, 0].max()), float(c[:, 1].max())))
        pts = np.hstack([c, np.ones((4, 1))]) @ to_source.T
        x0 = max(0.0, float(pts[:, 0].min()))
        y0 = max(0.0, float(pts[:, 1].min()))
        x1 = min(float(width), float(pts[:, 0].max()))
        y1 = min(float(height), float(pts[:, 1].max()))
        source_boxes.append((round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)) if x1 - x0 >= 1 and y1 - y0 >= 1 else None)

    tokens: list[Token] = []
    for i in _reading_order(work_boxes):
        box, reading = source_boxes[i], readings[i]
        if box is None or not reading.text.strip():
            continue
        tokens.append(Token(text=reading.text.strip(), bbox=box, confidence=round(reading.confidence, 4)))
    return ReadResult(width, height, tokens, applied)
