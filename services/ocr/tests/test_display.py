"""POST /read/display (Story 9.1): the six synthetic displays of `fixtures/displays.json`."""

import json
import re

import cv2
import numpy as np
import pytest

from conftest import FIXTURES, READ_DISPLAY_PATH, READ_MAX_BYTES, assert_read_result

DISPLAYS: dict = json.loads((FIXTURES / "displays.json").read_text(encoding="utf-8"))
NUMBER = re.compile(r"-?\d+(?:[.,]\d+)?")


def _numbers(tokens: list[dict]) -> set[float]:
    return {float(match.replace(",", ".")) for token in tokens for match in NUMBER.findall(token["text"])}


@pytest.mark.parametrize("name", sorted(DISPLAYS))
def test_each_display_reads_its_values(client, name):
    expected = DISPLAYS[name]
    body = (FIXTURES / f"{name}.jpg").read_bytes()
    response = client.post(READ_DISPLAY_PATH, content=body, headers={"content-type": "image/jpeg"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert_read_result(payload)
    assert payload["image"] == expected["image"]
    numbers = _numbers(payload["tokens"])
    for value in expected["values"]:
        assert float(value["raw"]) in numbers, (name, value, [t["text"] for t in payload["tokens"]])


def test_not_an_image_is_422(client):
    response = client.post(READ_DISPLAY_PATH, content=b"not an image", headers={"content-type": "image/jpeg"})
    assert response.status_code == 422
    assert response.json() == {"error": "invalid_image"}


def test_other_content_type_is_422(client):
    body = (FIXTURES / "display-isolacao.jpg").read_bytes()
    response = client.post(READ_DISPLAY_PATH, content=body, headers={"content-type": "text/plain"})
    assert response.status_code == 422
    assert response.json() == {"error": "invalid_image"}


def test_too_large_is_413_before_decoding(client):
    # Not an image at all: a 413 proves the size check ran before any decode.
    response = client.post(READ_DISPLAY_PATH, content=b"\0" * (READ_MAX_BYTES + 1), headers={"content-type": "image/jpeg"})
    assert response.status_code == 413
    assert response.json() == {"error": "too_large"}


@pytest.mark.parametrize("name", ["display-tres-valores", "display-isolacao"])
def test_display_at_the_print_variant_size_reads_its_values(client, name):
    """Fix batch fxg6: production sends the stored print variant, up to 2000 px on the long
    edge (`PRINT_MAX_PX` in apps/api/src/storage/variants.ts); the display route scales it to
    MAX_DISPLAY_SIDE (1200) before detection, and the fixture upscaled to 2000 x 1500 still
    reads every expected value."""
    expected = DISPLAYS[name]
    image = cv2.imdecode(np.frombuffer((FIXTURES / f"{name}.jpg").read_bytes(), np.uint8), cv2.IMREAD_COLOR)
    big = cv2.resize(image, (2000, 1500), interpolation=cv2.INTER_CUBIC)
    ok, encoded = cv2.imencode(".jpg", big, [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok
    response = client.post(READ_DISPLAY_PATH, content=encoded.tobytes(), headers={"content-type": "image/jpeg"})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert_read_result(payload)
    assert payload["image"] == {"width": 2000, "height": 1500}
    assert payload["preprocessing_applied"] is True
    numbers = _numbers(payload["tokens"])
    for value in expected["values"]:
        assert float(value["raw"]) in numbers, (name, value, [t["text"] for t in payload["tokens"]])
