"""The I/O matrix of POST /read and GET /health (Story 8.3)."""

import math

import cv2
import numpy as np

from conftest import SUMMARY, assert_read_result, validate
from make_plate import BACKGROUND, value_words
from matching import match, value_flags

READ_MAX_BYTES = 20 * 1024 * 1024
ROTATION_DEG = 4.0


def _post(client, body: bytes, mime: str = "image/jpeg"):
    return client.post("/read", content=body, headers={"content-type": mime})


def _decode(jpeg: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)


def test_health_names_the_models(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    validate("OcrHealthResponse", body)
    assert body == {"status": "up", "detection": "PP-OCRv5_server_det", "recognition": "parseq"}


def test_rotated_plate_is_deskewed_and_mapped_back(client, plate_jpeg, expected_tokens):
    """The plate rotated 4 degrees on an expanded canvas: boxes come back in the rotated
    image's pixel space, as the expected boxes pushed through the same rotation."""
    image = _decode(plate_jpeg)
    h, w = image.shape[:2]
    rotation = cv2.getRotationMatrix2D((w / 2, h / 2), ROTATION_DEG, 1.0)
    rad = math.radians(ROTATION_DEG)
    new_w = int(math.ceil(h * abs(math.sin(rad)) + w * abs(math.cos(rad))))
    new_h = int(math.ceil(h * abs(math.cos(rad)) + w * abs(math.sin(rad))))
    rotation[0, 2] += new_w / 2 - w / 2
    rotation[1, 2] += new_h / 2 - h / 2
    fill = tuple(int(c) for c in reversed(BACKGROUND))
    rotated = cv2.warpAffine(image, rotation, (new_w, new_h), flags=cv2.INTER_CUBIC, borderValue=fill)
    ok, encoded = cv2.imencode(".jpg", rotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok

    response = _post(client, encoded.tobytes())
    assert response.status_code == 200
    body = response.json()
    assert_read_result(body)
    assert body["image"] == {"width": new_w, "height": new_h}
    assert body["preprocessing_applied"] is True

    expected = []
    for token in expected_tokens["tokens"]:
        x0, y0, x1, y1 = token["bbox"]
        corners = np.array([[x0, y0, 1], [x1, y0, 1], [x1, y1, 1], [x0, y1, 1]], dtype=np.float64) @ rotation.T
        box = [float(corners[:, 0].min()), float(corners[:, 1].min()), float(corners[:, 0].max()), float(corners[:, 1].max())]
        expected.append({"text": token["text"], "bbox": box})
    flags = value_flags(expected_tokens["tokens"], value_words())
    report = match(expected, body["tokens"], flags)
    SUMMARY.append(report.line(f"plate rotated {ROTATION_DEG:g} deg"))
    for miss in report.misses:
        SUMMARY.append(f"  miss: {miss}")
    assert report.accuracy >= 0.95, report.misses
    assert report.values_matched == report.values_total, report.misses


def test_png_reads_like_the_jpeg(client, plate_jpeg, plate_response):
    ok, png = cv2.imencode(".png", _decode(plate_jpeg))
    assert ok
    response = _post(client, png.tobytes(), "image/png")
    assert response.status_code == 200
    body = response.json()
    assert_read_result(body)
    assert body["preprocessing_applied"] is False
    as_expected = [{"text": t["text"], "bbox": t["bbox"]} for t in plate_response["tokens"]]
    report = match(as_expected, body["tokens"], [True] * len(as_expected))
    assert report.matched == report.total, report.misses
    assert len(body["tokens"]) == len(plate_response["tokens"])


def test_octet_stream_is_accepted(client, plate_jpeg, plate_response):
    response = _post(client, plate_jpeg, "application/octet-stream")
    assert response.status_code == 200
    assert response.json() == plate_response


def test_blank_image_has_no_tokens(client):
    ok, blank = cv2.imencode(".jpg", np.full((600, 800, 3), 255, np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok
    response = _post(client, blank.tobytes())
    assert response.status_code == 200
    body = response.json()
    assert_read_result(body)
    assert body == {"image": {"width": 800, "height": 600}, "tokens": [], "preprocessing_applied": False}


def test_not_an_image_is_422(client):
    garbage = bytes((i * 7 + 3) % 256 for i in range(4096))
    for body, mime in [(garbage, "image/jpeg"), (garbage, "application/octet-stream"), (b"", "image/png")]:
        response = _post(client, body, mime)
        assert response.status_code == 422, (mime, response.text)
        assert response.json() == {"error": "invalid_image"}
        validate("OcrErrorResponse", response.json())


def test_other_content_type_is_422(client, plate_jpeg):
    response = _post(client, plate_jpeg, "text/plain")
    assert response.status_code == 422
    assert response.json() == {"error": "invalid_image"}


def test_too_large_is_413_before_decoding(client):
    # Not an image at all: a 413 proves the size check ran before any decode.
    response = _post(client, b"\0" * (READ_MAX_BYTES + 1))
    assert response.status_code == 413
    assert response.json() == {"error": "too_large"}
    validate("OcrErrorResponse", response.json())


def test_stateless_identical_requests_identical_responses(client, plate_jpeg, plate_response):
    first = _post(client, plate_jpeg)
    second = _post(client, plate_jpeg)
    assert first.status_code == second.status_code == 200
    assert first.content == second.content
    assert first.json() == plate_response
