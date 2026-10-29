# services/ocr

The OCR sidecar of the reading pipeline (Story 8.3, FR-36). A stateless FastAPI
service that reads one image and returns one token per word, with boxes in the pixel
grid of the bytes it received. The api's `ocr-svc` provider (Story 8.4) calls it
through `OCR_SERVICE_URL`; `OCR_PROVIDER` stays `fake` in compose and in every test.

## Contract

The shapes live in the kernel, `packages/domain/src/contract/ocr.ts` (zod), and are
exported as JSON Schema to `contract/ocr-contract.schema.json`:

```
docker compose --profile tools run --rm tools pnpm schema:ocr
```

A kernel test in `pnpm test:unit` fails when the committed file differs from the zod
source. The image generates its pydantic models (`app/contract_models.py`, not
committed) from that file with `datamodel-codegen` at build time, and every response
is built through them.

## Endpoints

| Route | Body | Answer |
|---|---|---|
| `POST /read` | raw image bytes, `image/jpeg`, `image/png` or `application/octet-stream` | `200 OcrReadResult` |
| | larger than 20 MB (checked before decoding) | `413 {"error": "too_large"}` |
| | empty, undecodable, or another content type | `422 {"error": "invalid_image"}` |
| `GET /health` | | `200 {"status": "up", "detection": "PP-OCRv5_mobile_det", "recognition": "parseq"}` once the models are loaded |

`OcrReadResult` is `{image: {width, height}, tokens: [{id, text, bbox, confidence}], preprocessing_applied}`:

- The image is decoded by OpenCV with EXIF orientation ignored; `image` and every
  `bbox` (`[x0, y0, x1, y1]`) are in that grid.
- `id` is `t` + the token's index; the array order is reading order (rows top to
  bottom, words left to right).
- A side above 4000 px is downscaled and a median line angle of 1 degree or more is
  deskewed; the boxes are mapped back to the received grid and
  `preprocessing_applied` is `true`. With neither step it is `false`.
- Stateless: no disk writes, no cache across requests, no database. Nothing is
  downloaded at runtime; the weights are baked into the image and the libraries'
  offline switches are set.

## Pipeline and the recognition decision

1. PP-OCRv5 detection (`PP-OCRv5_mobile_det`, on both `/read` and `/read/display`) finds
   text-line polygons. ~~`PP-OCRv5_server_det`~~ (2026-10-29, fix batch fxg6, prod-pass G6: the
   server detector asked 5.6 GB on CPU for a 1200 x 900 display photo and died inside the
   production task's 1536 MiB reservation; the mobile one reads the six display fixtures under
   that cap and keeps every plate accuracy test green, so the server model left the image.) The
   display route works on at most 1200 px a side (`MAX_DISPLAY_SIDE` in `app/display.py`):
   production sends the print variant, up to 2000 px, and a 2000 x 1500 display read on the
   mobile detector without that cap was OOM-killed under 1536 MiB. The plate route keeps
   its 4000 px `MAX_SIDE`. It runs in
   PaddleOCR 3 on paddlepaddle's CPU wheel, which exists for CPython 3.13, so no ONNX
   conversion of the detector is needed.
2. Each line is rectified and split into words by its column ink profile: a gap wider
   than 0.3 x the line's ink height separates two words. The word box is the word's
   ink extent mapped back to the received grid.
3. PARSeq (the pretrained `baudm/parseq` weights, exported to ONNX in a builder stage
   that alone carries CPU torch) recognizes each word crop on onnxruntime.

PARSeq is a word-crop recognizer: its charset is the 94 printable ASCII characters and
it reads at most 25 characters, so it prints no accent (`EPÓXI` reads `EPOXI`, `Nº`
has no `º`). The reading job compares OCR text through the kernel's parsers and the
digit-coverage rule of Story 8.5 looks only at digits, which PARSeq keeps.

## Build and test

Everything runs in Docker; heavy commands take the host lock.

```
flock /tmp/fasor-verify.lock docker compose --profile ocr build ocr
flock /tmp/fasor-verify.lock docker compose --profile ocr run --rm ocr pytest
docker compose --profile ocr up -d ocr     # healthy once the models load
```

The image is `linux/amd64` only (paddlepaddle publishes no aarch64 wheel), and compose
says `platform: linux/amd64`. On an arm64 podman host `podman compose build` ignores that
key (its classic builder builds arm64), so build there as `infra/bin/deploy` does, then
run the tests through compose as above (fix batch fxg6, 2026-10-29):

```
lockf -t 20000 /tmp/fasor-verify.lock podman build --platform linux/amd64 -t app-ocr services/ocr
```

Under that emulation a Paddle predictor built outside the main thread segfaults (exit
139, no OOM event); uvicorn builds the models in the main thread and serves normally, but
`TestClient` runs the lifespan in a worker thread. Reads are also slower: 80-120 s for one
display, above the 55 s `OCR_INFERENCE_TIMEOUT_SECONDS` default. `tests/conftest.py`
therefore builds the models in the main thread at import, hands them to the lifespan, and
defaults the timeout to 600 s for the tests only, so the committed suite runs on the arm64
host too.

The display tests inside the production memory budget (`compose.memcap.yml`: 1536 MiB, the
ocr task's `memoryReservation` in `infra/production/ecs.tf`), printing the cgroup peak:

```
lockf -t 20000 /tmp/fasor-verify.lock podman compose -f docker-compose.yml -f services/ocr/compose.memcap.yml \
  --profile ocr run --rm ocr sh -c 'pytest tests/test_display.py; rc=$?; echo peak=$(cat /sys/fs/cgroup/memory.peak); exit $rc'
```

The tests (`tests/`) read the committed synthetic plate
(`tests/fixtures/plate-transformador.*`, see its `.md`), a rotated copy, a PNG copy, a
blank image, garbage, an empty and an oversized body, and check that two identical
requests give identical responses. The run ends with the measured accuracy line.

## Image size and measured accuracy

- Image `app-ocr`: 1.94 GB (measured with the server detector; not re-measured after the
  2026-10-29 swap) (CPython 3.13 slim, paddlepaddle CPU, PP-OCRv5 ~~server~~
  mobile (2026-10-29, fix batch fxg6) detection, PARSeq ONNX, onnxruntime). It answers `GET /health` with networking cut.
- Fixture plate (43 printed words, 16 of them values), 2026-09-26: every word found
  with its box within tolerance (mean IoU 0.910; the rotated copy 0.922). Text: 41 of
  43 words read right up to accents; the two others are PARSeq case errors on the
  units, `kVA` and `kV` read `KVA` and `KV`. The fixture test therefore compares the
  unit tokens (`kVA`, `kV`, `V`, `L`) case-insensitively (the rule and its reason are in
  `tests/matching.py`); every other value token compares exactly.
- 2026-10-29 (fix batch fxg6), the mobile detector `PP-OCRv5_mobile_det` on the same
  tests: the plate JPEG, its 4-degree rotation and its 4400 px upscale each matched 43 of
  43 words with 16 of 16 values (mean IoU 0.910, 0.921 and 0.904), the same text
  results as above; the six display fixtures read every expected value under a 1536 MiB
  cgroup cap. The image no longer carries the server detector. A 2000 x 1500 copy of a
  display was OOM-killed under that cap until the display route took its 1200 px limit;
  with it, `tests/test_display.py` (11 tests, two of them 2000 x 1500 prints) passed under
  the cap at a cgroup `memory.peak` of 1187180544 B, and the full suite (48 tests) peaked at
  1811865600 B without the cap (amd64 under emulation, head `541dfdff`).

## Open question for Matheus

In a scratch run on the same plate crops, the PP-OCRv5 Latin recognizer
(`latin_PP-OCRv5_mobile_rec`) read all 43 words exactly, accents and case included,
where PARSeq reads 41 up to accents. The sidecar keeps PARSeq as the story and the
coordinator decided (the fallback applies only when PARSeq cannot run on CPU); whether
to switch to PP-OCRv5 recognition is open.

## Deviations from the story spec

- OpenCV is the `opencv-contrib-python` wheel, not `opencv-python-headless`: PaddleX
  checks for the contrib distribution by name and refuses to build the detector without
  it, so the image also carries `libgl1` and `libglib2.0-0`.
- The fixture regenerate command runs with `--user "$(id -u):$(id -g)"`, because the
  image's non-root user cannot write into the bind-mounted host folder.
- The PARSeq export script lives in `builder/`, not `build/`, which the repository's
  `.gitignore` excludes.
