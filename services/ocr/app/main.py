"""The OCR sidecar's HTTP surface (Story 8.3).

POST /read          raw image body (image/jpeg, image/png or application/octet-stream)
                    -> 200 OcrReadResult | 413 {error: too_large} | 422 {error: invalid_image}
POST /read/display  the same body, answers and limits, read as an instrument display
                    (Story 9.1, `app/display.py`)
GET  /health        -> 200 {status: "up", detection, recognition} once the models are loaded

Both read routes also answer 503 {error: internal} (with retry-after) when every admission
slot is taken, and 504 {error: internal} when the inference outlives
OCR_INFERENCE_TIMEOUT_SECONDS (security review 2026-09-30); the api retries both.

Stateless: nothing is written to disk or kept between requests. Responses are built
through the pydantic models generated from the kernel's JSON Schema
(`app/contract_models.py`, generated at image build time).
"""

import asyncio
import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from starlette.requests import ClientDisconnect

from .contract_models import OcrErrorResponse, OcrHealthResponse, OcrReadResult
from .detector import DETECTION_MODEL, load_detector
from .display import read_display
from .pipeline import InvalidImage, decode, read_image
from .recognizer import RECOGNITION_MODEL, load_recognizer

# The routes and the body limit come from the kernel's exported contract
# (`x-ocr-service` in contract/ocr-contract.schema.json, written by `pnpm schema:ocr` from
# OCR_SERVICE_ROUTES and OCR_READ_MAX_BYTES), so no literal here can drift from the api.
_SERVICE = json.loads((Path(__file__).resolve().parents[1] / "contract" / "ocr-contract.schema.json").read_text())["x-ocr-service"]
READ_PATH: str = _SERVICE["routes"]["read"]
READ_DISPLAY_PATH: str = _SERVICE["routes"]["read_display"]
HEALTH_PATH: str = _SERVICE["routes"]["health"]
READ_MAX_BYTES: int = _SERVICE["read_max_bytes"]
ACCEPTED_TYPES = {"image/jpeg", "image/png", "application/octet-stream"}

log = logging.getLogger("ocr")
models: dict[str, object] = {}
# One inference at a time: the Paddle predictor is not shared across threads.
_inference = threading.Lock()

# Security review 2026-09-30: the work the sidecar admits at once. A request takes a slot
# before its body is read and gives it back only when its inference thread has finished
# (not when the answer is sent), so neither a burst of bodies (each up to READ_MAX_BYTES,
# decoded to pixels) nor an inference abandoned by its timeout can pile up. A request that
# finds no slot answers 503 at once, which the api's `ocr-svc` provider retries.
MAX_IN_FLIGHT = max(1, int(os.environ.get("OCR_MAX_IN_FLIGHT", "2")))
# Below the api's 60 s abort (`ocr-svc.ts`), so the sidecar answers before the caller gives up.
INFERENCE_TIMEOUT_S = float(os.environ.get("OCR_INFERENCE_TIMEOUT_SECONDS", "55"))
_slots = threading.BoundedSemaphore(MAX_IN_FLIGHT)
# When each running inference thread started (monotonic seconds), for /health.
_running: dict[int, float] = {}
_running_lock = threading.Lock()


def _stuck() -> bool:
    """Every slot is held by an inference running past twice the timeout: only a restart frees them."""
    now = time.monotonic()
    with _running_lock:
        starts = list(_running.values())
    return len(starts) >= MAX_IN_FLIGHT and all(now - start > 2 * INFERENCE_TIMEOUT_S for start in starts)


@asynccontextmanager
async def lifespan(_: FastAPI):
    models["detector"] = load_detector()
    models["recognizer"] = load_recognizer()
    yield
    models.clear()


app = FastAPI(title="ocr-sidecar", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def _json(model, status: int = 200) -> Response:
    return Response(content=model.model_dump_json(), status_code=status, media_type="application/json")


def _error(code: str, status: int) -> Response:
    return _json(OcrErrorResponse.model_validate({"error": code}), status)


@app.get(HEALTH_PATH)
async def health() -> Response:
    if "detector" not in models or "recognizer" not in models:
        return JSONResponse({"status": "starting"}, status_code=503)
    if _stuck():
        return JSONResponse({"status": "stuck"}, status_code=503)
    return _json(OcrHealthResponse.model_validate({"status": "up", "detection": DETECTION_MODEL, "recognition": RECOGNITION_MODEL}))


async def _read_body(request: Request) -> bytes | None:
    """The body, or None once it exceeds READ_MAX_BYTES (checked before any decoding)."""
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > READ_MAX_BYTES:
        return None
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > READ_MAX_BYTES:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def _run(reader, image):
    with _inference:
        return reader(image, models["detector"], models["recognizer"])


def _busy() -> Response:
    response = _error("internal", 503)
    response.headers["retry-after"] = "5"
    return response


async def _answer(request: Request, reader) -> Response:
    """One read of the request body with `reader` (the text or the display pipeline), in one slot."""
    if not _slots.acquire(blocking=False):
        return _busy()
    request.state.handed_off = False
    try:
        return await _admitted(request, reader)
    finally:
        # Once an inference thread started it owns the slot and releases it when it ends, even
        # when this request was cancelled (the caller went away) while it ran.
        if not request.state.handed_off:
            _slots.release()


async def _admitted(request: Request, reader) -> Response:
    """The read itself; `request.state.handed_off` says whether an inference thread took the slot over."""
    try:
        body = await _read_body(request)
    except ClientDisconnect:
        # Review fixes 2026-09-30 (O-8): the api gave up (its 60 s abort) while the body was
        # still arriving; nobody reads this answer, and it is no server error to log.
        log.info("client went away before its body arrived")
        return Response(status_code=499)
    if body is None:
        return _error("too_large", 413)
    mime = (request.headers.get("content-type") or "application/octet-stream").split(";")[0].strip().lower()
    if mime not in ACCEPTED_TYPES:
        return _error("invalid_image", 422)
    try:
        image = await run_in_threadpool(decode, body)
    except InvalidImage:
        return _error("invalid_image", 422)
    del body
    loop = asyncio.get_running_loop()
    done: asyncio.Future = loop.create_future()

    def settle(outcome) -> None:
        if not done.done():
            done.set_result(outcome)

    def work() -> None:
        me = threading.get_ident()
        with _running_lock:
            _running[me] = time.monotonic()
        try:
            outcome = (True, _run(reader, image))
        except Exception as error:  # noqa: BLE001 - handed to the awaiting request
            outcome = (False, error)
        finally:
            with _running_lock:
                _running.pop(me, None)
            _slots.release()
        loop.call_soon_threadsafe(settle, outcome)

    threading.Thread(target=work, name="ocr-inference", daemon=True).start()
    # Only once the thread runs does it own the slot (a failed start leaves it to `_answer`).
    request.state.handed_off = True
    try:
        ok, result = await asyncio.wait_for(asyncio.shield(done), INFERENCE_TIMEOUT_S)
    except asyncio.TimeoutError:
        log.error("read timed out after %.0f s; its slot stays taken until the inference ends", INFERENCE_TIMEOUT_S)
        return _error("internal", 504)
    if not ok:
        log.error("read failed", exc_info=result)
        return _error("internal", 500)
    try:
        payload = {
            "image": {"width": result.width, "height": result.height},
            "tokens": [
                {"id": f"t{i}", "text": t.text, "bbox": list(t.bbox), "confidence": t.confidence}
                for i, t in enumerate(result.tokens)
            ],
            "preprocessing_applied": result.preprocessing_applied,
        }
        response = OcrReadResult.model_validate(payload)
    except Exception:  # noqa: BLE001 - one opaque error body, the trace goes to the log
        log.exception("read failed")
        return _error("internal", 500)
    return _json(response)


@app.post(READ_PATH)
async def read(request: Request) -> Response:
    return await _answer(request, read_image)


@app.post(READ_DISPLAY_PATH)
async def read_display_route(request: Request) -> Response:
    return await _answer(request, read_display)
