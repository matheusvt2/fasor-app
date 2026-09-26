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
| `GET /health` | | `200 {"status": "up", "detection": "PP-OCRv5_server_det", "recognition": "parseq"}` once the models are loaded |

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

1. PP-OCRv5 detection (`PP-OCRv5_server_det`) finds text-line polygons. It runs in
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

The tests (`tests/`) read the committed synthetic plate
(`tests/fixtures/plate-transformador.*`, see its `.md`), a rotated copy, a PNG copy, a
blank image, garbage, an empty and an oversized body, and check that two identical
requests give identical responses. The run ends with the measured accuracy line.

## Image size and measured accuracy

- Image `app-ocr`: 1.94 GB (CPython 3.13 slim, paddlepaddle CPU, PP-OCRv5 server
  detection, PARSeq ONNX, onnxruntime). It answers `GET /health` with networking cut.
- Fixture plate (43 printed words, 16 of them values), 2026-09-26: every word found
  with its box within tolerance (mean IoU 0.910; the rotated copy 0.922). Text: 41 of
  43 words read right up to accents; the two others are PARSeq case errors on the
  units, `kVA` and `kV` read `KVA` and `KV`. The fixture test therefore compares the
  unit tokens (`kVA`, `kV`, `V`, `L`) case-insensitively (the rule and its reason are in
  `tests/matching.py`); every other value token compares exactly.

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
