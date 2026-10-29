---
title: 'Fix batch fxg6: display reading on the mobile text detector so the OCR sidecar fits the production instance (prod-pass G6)'
type: 'bugfix'
created: '2026-10-29'
status: 'in-progress'
baseline_revision: '98b6b7bddc5a787890ac148a25e43ebe4d5bbffd'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/prod-pass-fix-context.md'
warnings: ['batched', 'oversized']
# batched: one production-pass item (G6) in its own batch beside fxpw; the batch tag carries it, no story split.
deferred: []
---

<intent-contract>

## Intent

**Problem:** "Ler visor" never reads in production (prod-pass G6, P1): `POST /read/display` on the OCR sidecar dies with `ResourceExhaustedError: Fail to alloc memory of 5648154624` inside the `PP-OCRv5_server_det` text detector for a 1200 x 900 display photo, on a `t3a.medium` whose ocr task reserves 1536 MiB (`prod-pass-2026-10-28.md` § "Coordinator's diagnosis of G6").

**Approach:** The display route runs the `PP-OCRv5_mobile_det` detector (coordinator decision, `prod-pass-fix-context.md` G6). If the mobile detector also passes the plate accuracy tests, it serves both routes and the server model leaves the image (branch A); otherwise the plate route keeps the server detector, loaded lazily on the first `/read`, so a process that only reads displays holds the mobile detector and the recognizer (branch B). The image is built and measured for `linux/amd64` under a 1536 MiB cgroup cap.

## Boundaries & Constraints

**Always:** Same detector parameters as today (`limit_side_len` from `OCR_DET_LIMIT_SIDE_LEN`, default 2000, `limit_type="max"`, `enable_mkldnn=False`, CPU threads from `OMP_NUM_THREADS`) unless the fallback below lands. The mobile model is baked at build time with the server model's download-copy-pin pattern (sha256 of every file the first build produced, then a rebuild proves `sha256sum -c` passes). The runtime never downloads anything. `/health` answers 200 only when every model the display route needs is loaded. Build, every pytest run and every image measurement run under the host lock (`lockf -t 20000 /tmp/fasor-verify.lock`, started with `nohup`, logs and `exit=<code>` inside `.scratch-fxg6/`), never on the host. English code and comments, no emoji.

**Never:** Touch `infra/production/*.tf`, `terraform.tfvars`, `apps/api`, `apps/web`, `packages/domain` (the token contract and `contract/ocr-contract.schema.json` stay byte-identical), `sprint-status.yaml`, `epics.md`, `source-deltas.md`. Never run `infra/bin/deploy` or any AWS command. No new env knob beyond what a branch needs. Do not weaken an accuracy assertion (`MIN_ACCURACY`, value-token checks, the six display fixtures) to make the mobile detector pass: a failing plate test selects branch B, a failing display fixture selects the fallback.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Display read in production budget | each of the six `tests/fixtures/display-*.jpg` on `POST /read/display`, container capped at 1536 MiB | 200, every expected value of `displays.json` among the tokens; cgroup `memory.peak` below the cap | today: OOM kill (137) or `ResourceExhaustedError` -> 500 |
| Plate read, branch A | `plate-transformador.jpg` (and rotated, 4400 px, PNG copies) on `POST /read` | accuracy >= 0.95, every value token matched, one token per word (unchanged tests) | n/a |
| Plate read, branch B | first `POST /read` after startup | server detector loads once under the inference lock, then reads as today; later reads reuse it | load failure -> 500 `internal` like any read failure |
| Health | `GET /health` after startup, no `/read` yet | 200 `{status: up, detection: "PP-OCRv5_mobile_det", recognition: "parseq"}` | 503 `starting` until loaded |

</intent-contract>

## Code Map

- `services/ocr/app/detector.py` -- `DETECTION_MODEL = "PP-OCRv5_server_det"` (l.12), `Pp5Detector(model_dir)` hard-codes that name in `TextDetection(model_name=...)`, `load_detector()` builds the path `$OCR_MODELS_DIR/<name>`. Make the model name a constructor argument; export the display model name (and, branch B, the plate model name).
- `services/ocr/app/main.py` -- `lifespan` loads `models["detector"]` and `models["recognizer"]`; `_run(reader, image)` passes `models["detector"]` to both readers under `_inference`; `/health` checks both keys and reports `DETECTION_MODEL`. Branch A: one detector, health names the mobile model. Branch B: `read` passes a lazily created server detector (created inside `_run` under `_inference`, cached in `models`), `read_display_route` the mobile one; health keys stay detector (mobile) plus recognizer.
- `services/ocr/app/display.py`, `app/pipeline.py` -- readers take `(image, detector, recognizer)`; no change expected.
- `services/ocr/Dockerfile` -- builder stage l.47-58: `TextDetection(model_name='PP-OCRv5_server_det')` download, copy to `/opt/models/<name>`, `printf '<sha>  <file>' | sha256sum -c -`. Add the same block for `PP-OCRv5_mobile_det` as its own `RUN` (the server `RUN` stays byte-identical while it exists, so its cached layer from the unchanged image is reused). Branch A removes the server block at the end.
- `services/ocr/tests/test_api.py` l.23-28 `test_health_names_the_models` -- asserts `"PP-OCRv5_server_det"`; update to the mobile name.
- `services/ocr/tests/test_review_fixes.py` l.46-56 -- fakes `paddleocr.TextDetection` and checks `limit_type`/`limit_side_len`; extend to assert the model name each route's detector is built with.
- `services/ocr/tests/test_display.py`, `test_fixture_plate.py`, `test_api.py` -- the accuracy tests that decide the branch; unchanged.
- `docker-compose.yml` l.277-287 service `ocr` -- add `platform: linux/amd64` with its comment; amend the `mem_limit` comment with the measured pytest peak (keep the value unless the evidence says otherwise).
- `services/ocr/README.md` -- l.29 health example, l.46 pipeline step 1, l.60-67 build commands, l.77 image line: say which detector serves which route and how to build amd64 on an arm64 podman host.
- `infra/README.md` l.72-82 § "Memory on the 4 GiB instance" -- add a dated row for a display read on the mobile detector, amend the ocr row with a dated note.
- `docs/kbs/code/ocr-service.md` -- the build line and the detector per route.
- Host fact found while planning (2026-10-29): `podman compose build` goes through the compat API's classic builder and ignores `platform:` (a probe build printed `aarch64` with `platform: linux/amd64`, `build.platforms` and `DOCKER_DEFAULT_PLATFORM`). Build the image with `podman build --platform linux/amd64 -t localhost/app-ocr-fxg6:latest services/ocr` (default target `test`), as `infra/bin/deploy` `image_build` does; `compose.local.yml` maps the service to `image: app-ocr-fxg6`.

## Tasks & Acceptance

**Execution:**
- `services/ocr/app/detector.py` -- model name per detector instance; `DISPLAY_DETECTION_MODEL = "PP-OCRv5_mobile_det"`; keep `DET_LIMIT_SIDE_LEN` -- one detector class, two possible models.
- `services/ocr/app/main.py` -- branch A: single mobile detector for both routes. Branch B: mobile at startup for `/read/display`, server built on the first `/read` inside `_run` under `_inference` -- production never calls `/read` (plates and panels go to Textract since 2026-10-05).
- `services/ocr/Dockerfile` -- build 1: add the mobile `RUN` printing `sha256sum` of its files (no check yet); read the sums from the image (`podman run --rm --entrypoint sh localhost/app-ocr-fxg6 -c 'cd /opt/models/PP-OCRv5_mobile_det && sha256sum *'`); build 2: pin them with `sha256sum -c -`, and in branch A drop the server block; the build log shows `OK` for every pinned file.
- `services/ocr/tests/*` -- update the health assertion; add a test that the display route's detector is built with `PP-OCRv5_mobile_det` (faked `TextDetection`, as in `test_review_fixes.py`); branch B adds a test that after startup only the mobile detector is in `models` and that the first `/read` adds the server one.
- `docker-compose.yml`, `services/ocr/README.md`, `infra/README.md`, `docs/kbs/code/ocr-service.md` -- as in the Code Map, numbers from the measured runs.
- Orchestrator (after the gate, not the implementer): ledger row G6 in `deferred-work.md`, one line in `docs/kbs/log.md`, this spec's Auto Run Result, the PR.

**Acceptance Criteria:**
- Given the unchanged image (`localhost/app-ocr-fxg6-red`, main's `services/ocr`), when `tests/test_display.py` runs under the 1536 MiB cap, then it fails (OOM kill 137 or `ResourceExhaustedError`), recorded (orchestrator's red run, `.scratch-fxg6/pytest-red.log`).
- Given the fixed image, when `tests/test_display.py` runs under the same cap, then all its tests pass and `cat /sys/fs/cgroup/memory.peak` read in the container at the end is recorded.
- Given the fixed image with only the compose `mem_limit`, when the full `pytest` runs, then it is green and its `memory.peak` and the plate accuracy lines (`pytest_terminal_summary`) are recorded; the outcome names the branch that landed.
- Given the built image, when `podman image inspect --format '{{.Architecture}}'` runs, then it prints `amd64`.
- Given the fixed sidecar starts, when `GET /health` is called before any `/read`, then it answers 200 naming `PP-OCRv5_mobile_det` (branch B: and the server detector is not loaded).
- Given the final Dockerfile, when it builds, then every pinned model file passes `sha256sum -c` (branch A: `/opt/models` holds no `PP-OCRv5_server_det`).

## Design Notes

Fallback, only if the mobile detector fails a display fixture: the display route keeps the server detector with `enable_mkldnn=True` and a lower `limit_side_len` for that route, measured under the same cap; report which landed. Emulation (qemu x86-64 on the arm64 VM) slows inference: if a read hits the 55 s `OCR_INFERENCE_TIMEOUT_SECONDS` (504), re-run with `-e OCR_INFERENCE_TIMEOUT_SECONDS=600` on the `run` and say so; never change the default.

## Verification

All commands from the worktree root, each started with `nohup` under the lock, output to a log in `.scratch-fxg6/`, waited on with `until grep -q '^exit=' <log>; do sleep 30; done`; read tails only.

**Commands:**
- `podman build --platform linux/amd64 -t localhost/app-ocr-fxg6:latest services/ocr` -- expected: exit 0, pinned sums `OK`.
- `podman compose -f docker-compose.yml -f compose.local.yml -f .scratch-fxg6/ocr-cap.yml --profile ocr run --rm ocr sh -c 'pytest tests/test_display.py; rc=$?; echo peak=$(cat /sys/fs/cgroup/memory.peak); exit $rc'` -- expected: all pass, peak below 1610612736.
- `podman compose --profile ocr run --rm ocr sh -c 'pytest -rA; rc=$?; echo peak=$(cat /sys/fs/cgroup/memory.peak); exit $rc'` -- expected: green; accuracy lines printed.
- `podman image inspect --format '{{.Architecture}}' localhost/app-ocr-fxg6:latest` -- expected: `amd64`.
- `podman compose --profile tools run --rm --user root tools pnpm test:unit -- scripts/speech-default.test.ts` (reads `docker-compose.yml`; once `localhost/app-tools-fxg6:latest` exists) -- expected: pass.

## Spec Change Log

## Review Triage Log
