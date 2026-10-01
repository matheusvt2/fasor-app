---
type: Code Map
title: OCR sidecar
description: services/ocr FastAPI service, compose profile, build and test commands. Open only for display-reading or OCR contract work.
tags: [code, ocr, python]
timestamp: 2026-09-30T00:00:00Z
sources: [services/ocr/README.md, AGENTS.md]
---
# OCR sidecar

FastAPI on port 8000, reached by the api through `OCR_SERVICE_URL`, behind the `OcrProvider` contract. It sits under the compose profile `ocr`, so a plain `docker compose up -d` never starts it.

- Build: `docker compose --profile ocr build ocr`. Test: `docker compose --profile ocr run --rm ocr pytest`. Both outside `pnpm verify`, run under `flock /tmp/fasor-verify.lock`, only for stories touching `services/ocr` or its contract.
- The JSON Schema is exported from `packages/domain/src/contract/ocr.ts` with `docker compose --profile tools run --rm tools pnpm schema:ocr`; a `test:unit` kernel test fails when the committed schema drifts.
- Layout: `app/`, `builder/`, `contract/`, `tests/`, `tools/`, `pyproject.toml`, `uv.lock`. Background: [suggestions-and-reading](/architecture/suggestions-and-reading.md), `docs/display-reading-spike.md`.
