---
type: Code Map
title: OCR sidecar
description: services/ocr FastAPI service, compose profile, build and test commands. Open only for display-reading or OCR contract work.
tags: [code, ocr, python]
timestamp: 2026-10-29T00:00:00Z
sources: [services/ocr/README.md, services/ocr/app/detector.py, AGENTS.md]
---
# OCR sidecar

FastAPI on port 8000, reached by the api through `OCR_SERVICE_URL`, behind the `OcrProvider` contract. It sits under the compose profile `ocr`, so a plain `docker compose up -d` never starts it.

- Build: `docker compose --profile ocr build ocr`. Test: `docker compose --profile ocr run --rm ocr pytest`. Both outside `pnpm verify`, run under `flock /tmp/fasor-verify.lock`, only for stories touching `services/ocr` or its contract.
- Image is `linux/amd64` only (compose `platform: linux/amd64`; paddlepaddle has no aarch64 wheel). On an arm64 podman host `podman compose build` ignores `platform:`, so build with `podman build --platform linux/amd64 -t app-ocr services/ocr` (as `infra/bin/deploy` does); under that emulation a Paddle predictor built outside the main thread segfaults, so `tests/conftest.py` builds the models in the main thread and defaults the test timeout to 600 s, and the committed suite runs there; `services/ocr/compose.memcap.yml` runs the display tests inside the production 1536 MiB budget (fix batch fxg6, 2026-10-29).
- Detector per route (2026-10-29, prod-pass G6): `PP-OCRv5_mobile_det` serves both `/read` and `/read/display` (`app/detector.py` `DISPLAY_DETECTION_MODEL`); the server detector left the image because it needed 5.6 GB for a display photo against the production task's 1536 MiB.
- The JSON Schema is exported from `packages/domain/src/contract/ocr.ts` with `docker compose --profile tools run --rm tools pnpm schema:ocr`; a `test:unit` kernel test fails when the committed schema drifts.
- Layout: `app/`, `builder/`, `contract/`, `tests/`, `tools/`, `pyproject.toml`, `uv.lock`. Background: [suggestions-and-reading](/architecture/suggestions-and-reading.md), `docs/display-reading-spike.md`.
