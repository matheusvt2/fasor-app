"""Security review 2026-09-30: the sidecar's decode cap, admission slots and inference timeout."""

import os
import time

import cv2
import numpy as np
import pytest

import app.main as main
import app.pipeline as pipeline
from app import MAX_IMAGE_PIXELS
from conftest import READ_PATH


def _png(width: int, height: int) -> bytes:
    ok, encoded = cv2.imencode(".png", np.full((height, width, 3), 255, dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def _post(client, body: bytes, mime: str = "image/png"):
    return client.post(READ_PATH, content=body, headers={"content-type": mime})


def _all_slots_free() -> bool:
    taken = 0
    try:
        while main._slots.acquire(blocking=False):
            taken += 1
        return taken == main.MAX_IN_FLIGHT
    finally:
        for _ in range(taken):
            main._slots.release()


def test_the_package_sets_the_opencv_decode_cap():
    assert int(os.environ["OPENCV_IO_MAX_IMAGE_PIXELS"]) <= MAX_IMAGE_PIXELS


def test_decode_refuses_an_image_over_the_pixel_cap(monkeypatch):
    monkeypatch.setattr(pipeline, "MAX_IMAGE_PIXELS", 100)
    with pytest.raises(pipeline.InvalidImage):
        pipeline.decode(_png(20, 20))
    assert pipeline.decode(_png(10, 10)).shape[:2] == (10, 10)


def test_a_request_with_no_free_slot_answers_503_at_once(client):
    for _ in range(main.MAX_IN_FLIGHT):
        assert main._slots.acquire(blocking=False)
    try:
        response = _post(client, _png(32, 32))
        assert response.status_code == 503
        assert response.json() == {"error": "internal"}
        assert response.headers["retry-after"] == "5"
    finally:
        for _ in range(main.MAX_IN_FLIGHT):
            main._slots.release()
    assert _all_slots_free()


def test_a_refused_body_gives_its_slot_back(client):
    assert _post(client, b"not an image").status_code == 422
    assert _post(client, _png(8, 8), mime="text/html").status_code == 422
    assert _all_slots_free()


def test_an_inference_over_the_timeout_answers_504_and_frees_its_slot_when_it_ends(client, monkeypatch):
    def slow(reader, image):
        time.sleep(1.0)
        raise RuntimeError("never answered in time")

    monkeypatch.setattr(main, "_run", slow)
    monkeypatch.setattr(main, "INFERENCE_TIMEOUT_S", 0.2)
    response = _post(client, _png(32, 32))
    assert response.status_code == 504
    assert response.json() == {"error": "internal"}
    # The abandoned inference still holds its slot until it ends, then gives it back.
    assert not _all_slots_free()
    time.sleep(1.2)
    assert _all_slots_free()
