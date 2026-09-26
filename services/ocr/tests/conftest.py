import json
import sys
import unicodedata
from pathlib import Path

import jsonschema
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(FIXTURES))

from app.main import app  # noqa: E402

SCHEMA_DOC = json.loads((ROOT / "contract" / "ocr-contract.schema.json").read_text())

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
    response = client.post("/read", content=plate_jpeg, headers={"content-type": "image/jpeg"})
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
