import json
import os
import sys
import unicodedata
from pathlib import Path

import jsonschema
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(FIXTURES))

# Fix batch fxg6 (2026-10-29): the image is linux/amd64 only, and on an arm64 host it runs under
# emulation, where reads take 80-120 s (above the 55 s production default) and a Paddle
# predictor built outside the main thread segfaults (exit 139). TestClient runs the lifespan in
# a worker thread, so the models are built here, in the main thread, and the lifespan is handed
# those instances (keyed by model name); uvicorn, as in production, loads in the main thread
# anyway. The timeout is only a test default; production keeps its own.
os.environ.setdefault("OCR_INFERENCE_TIMEOUT_SECONDS", "600")

from app.main import app  # noqa: E402
import app.main as _main  # noqa: E402

_BUILT: dict = {
    "recognizer": _main.load_recognizer(),
    _main.DISPLAY_DETECTION_MODEL: _main.load_detector(_main.DISPLAY_DETECTION_MODEL),
}
_main.load_recognizer = lambda: _BUILT["recognizer"]
_main.load_detector = lambda name: _BUILT[name]

SCHEMA_DOC = json.loads((ROOT / "contract" / "ocr-contract.schema.json").read_text())
# The routes and the body limit, as the kernel exports them (`x-ocr-service`); never literals.
READ_PATH: str = SCHEMA_DOC["x-ocr-service"]["routes"]["read"]
READ_DISPLAY_PATH: str = SCHEMA_DOC["x-ocr-service"]["routes"]["read_display"]
HEALTH_PATH: str = SCHEMA_DOC["x-ocr-service"]["routes"]["health"]
READ_MAX_BYTES: int = SCHEMA_DOC["x-ocr-service"]["read_max_bytes"]

# The plate-accuracy floor every plate test asserts: at least 95% of the expected tokens match.
MIN_ACCURACY = 0.95

# Lines a test wants in the run's output whatever the capture mode (see the hook below).
SUMMARY: list[str] = []


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def plate_jpeg() -> bytes:
    return (FIXTURES / "plate-transformador.jpg").read_bytes()


@pytest.fixture(scope="session")
def expected_tokens() -> dict:
    return json.loads((FIXTURES / "plate-transformador.tokens.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def plate_response(client, plate_jpeg) -> dict:
    response = client.post(READ_PATH, content=plate_jpeg, headers={"content-type": "image/jpeg"})
    assert response.status_code == 200, response.text
    return response.json()


def validate(definition: str, payload: dict) -> None:
    """Validate against one $defs entry of the committed contract schema."""
    jsonschema.validate(payload, {**SCHEMA_DOC, "$ref": f"#/$defs/{definition}"}, cls=jsonschema.Draft202012Validator)


def assert_read_result(payload: dict) -> None:
    validate("OcrReadResult", payload)
    width, height = payload["image"]["width"], payload["image"]["height"]
    for index, token in enumerate(payload["tokens"]):
        assert token["id"] == f"t{index}"
        x0, y0, x1, y1 = token["bbox"]
        assert 0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height, token


def fold(text: str) -> str:
    """Accent-insensitive form: NFKD, combining marks dropped, the ordinal sign read as o."""
    text = text.replace("º", "o").replace("°", "o")
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def pytest_terminal_summary(terminalreporter):
    for line in SUMMARY:
        terminalreporter.write_line(line)
