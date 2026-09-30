"""Review fixes 2026-09-30: the detector's side limit (O-4), the reading order and the client
that goes away (O-8), and the shared rectify and clamp helpers (O-9)."""

import asyncio
import random
import sys
import types

import numpy as np
import pytest
from starlette.requests import Request

import app.detector as detector
import app.main as main
from app.pipeline import _reading_order, clamp_box, quad_size, rectify


def _reading_order_reference(boxes):
    """The pre-O-8 implementation: medians recomputed over the open row for every word."""
    order = sorted(range(len(boxes)), key=lambda i: ((boxes[i][1] + boxes[i][3]) / 2, boxes[i][0]))
    rows = []
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


def test_reading_order_matches_the_reference_on_random_layouts():
    rng = random.Random(20260930)
    for _ in range(300):
        boxes = []
        for _ in range(rng.randint(0, 60)):
            x0, y0 = rng.uniform(0, 2000), rng.uniform(0, 2000)
            boxes.append((x0, y0, x0 + rng.uniform(5, 200), y0 + rng.uniform(5, 60)))
        assert _reading_order(boxes) == _reading_order_reference(boxes)


def test_the_detector_is_given_a_max_side_limit(monkeypatch):
    seen = {}

    class FakeTextDetection:
        def __init__(self, **kwargs):
            seen.update(kwargs)

    monkeypatch.setitem(sys.modules, "paddleocr", types.SimpleNamespace(TextDetection=FakeTextDetection))
    detector.Pp5Detector(detector.Path("/nowhere"))
    assert seen["limit_type"] == "max"
    assert seen["limit_side_len"] == detector.DET_LIMIT_SIDE_LEN == 2000


def test_clamp_box_clamps_rounds_and_drops_slivers():
    assert clamp_box(-3.0, -1.0, 10.04, 5.06, 8, 20) == (0.0, 0.0, 8.0, 5.1)
    assert clamp_box(7.5, 0.0, 12.0, 5.0, 8, 20) is None
    assert clamp_box(0.0, 19.5, 5.0, 30.0, 8, 20) is None


def test_rectify_warps_a_quad_upright_and_inverts():
    image = np.zeros((40, 60, 3), dtype=np.uint8)
    image[10:20, 5:45] = 255
    quad = np.array([[5, 10], [45, 10], [45, 20], [5, 20]], dtype=np.float32)
    width, height = quad_size(quad)
    assert (width, height) == (40, 10)
    line, inverse = rectify(image, quad, width, height)
    assert line.shape == (10, 40, 3)
    assert line.mean() > 250
    corner = inverse @ np.array([0.0, 0.0, 1.0])
    assert np.allclose(corner[:2] / corner[2], [5, 10], atol=1e-3)


def test_a_client_that_goes_away_mid_body_gets_no_500_and_frees_its_slot():
    async def receive():
        return {"type": "http.disconnect"}

    scope = {"type": "http", "method": "POST", "path": "/read", "headers": [(b"content-type", b"image/png")], "query_string": b""}
    response = asyncio.run(main._answer(Request(scope, receive), lambda *_: pytest.fail("no read without a body")))
    assert response.status_code == 499
    taken = 0
    while main._slots.acquire(blocking=False):
        taken += 1
    for _ in range(taken):
        main._slots.release()
    assert taken == main.MAX_IN_FLIGHT
