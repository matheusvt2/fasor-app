# Display reading spike (Story 9.1)

Run 2026-09-28 for Story 9.1 ("Ler visor"), before building the display path of the OCR
sidecar. It decides how `services/ocr` reads an instrument display and records how well that
reads the real displays we have. Aggregate numbers only: the base set is client material and
stays outside the repository.

## Data

- **Real set:** the spike base set of the Story 9.1 Definition of Ready,
  `docs/media/display-spike/` (git-ignored client material; its `MANIFEST.md` describes each
  crop). It holds 19 legible display crops cut from the photos of a delivered relatório, at
  the native pixels of photos Word had downsampled to 473 x 355: 6 seven-segment
  insulation-tester displays, 7 micro-ohmmeter and 6 ratio-meter character LCDs, plus 27
  distant shots where a display is in frame but illegible (negatives). The crops were mounted
  read-only into the sidecar container (`--network none`); nothing was copied out.
- **Scored crops (15):** the crops with a ground truth in the manifest (the value printed in
  the relatório's own table for the same reading): 6 seven-segment, 4 micro-ohmmeter,
  5 ratio meter. Two truths are scored on their leading digits only (a table that truncates,
  and one last digit the manifest leaves unresolved).
- **Excluded (4):** the 2 crops the manifest's 2026-09-28 review leaves ambiguous, #08 and #10
  (micro-ohmmeter, two or three candidate readings, no table value), and #09 and #18, whose
  readings appear in no table cell. They stay open for Matheus with the rest of E8-A8.
- **Synthetic set (6):** `services/ocr/tests/fixtures/make_display.py` draws six displays
  with invented values (a 3 1/2-digit seven-segment tester with no unit, one that prints GΩ,
  a micro-ohmmeter and a ratio-meter character LCD, a thermo-hygrometer, and a tester showing
  its stored 30 s / 1 min / 10 min results). These are the committed test fixtures.

## Method

Every variant ran in the sidecar image on CPU with its models (PP-OCRv5 server detection,
PARSeq recognition). A value is extracted from the tokens by the kernel's rule
(`displayValues`, mirrored in `services/ocr/tools/display_spike.py`): dates, times and the
test current are skipped, a label before `=` is dropped, every other number is a value in
reading order; a single-value display is scored on its last value. A crop scores when the
value's digits equal the ground truth's (decimal point ignored, the table often drops it).

Variants compared:

| Variant | What it does |
|---|---|
| Plate pipeline | `read_image` as the nameplate reads it: detection, lines split into words at ink gaps, PARSeq per word |
| Whole lines | upscale to a shorter side of 320 px, grey + CLAHE, detection, each detected line recognized whole (no word split) |
| Whole lines + ink bridging (chosen) | the above plus a grey-level erosion of 1/150 of the shorter side before detection, which joins the separate segments of a seven-segment digit and the dots of a character LCD |

## Results

| Variant | Synthetic (6) | Real scored (15) | Seven-segment (6) | Micro-ohmmeter (4) | Ratio meter (5) | Negatives refused (27) |
|---|---|---|---|---|---|---|
| Plate pipeline | 1 | 8 | 2 | 2 | 4 | 27 |
| Whole lines | 5 | 8 | 4 | 1 | 3 | 20 |
| Whole lines + ink bridging (chosen) | **6** | **6 (40 %)** | 3 | 0 | 3 | 25 |

(The "whole lines" real-set row was scored with an earlier draft of the value rule; the
other two rows with the committed tool.)

Why the plate pipeline fails the synthetic displays: the word split cuts a seven-segment
number at its segment gaps and at its decimal point (a lone `.` reads as a word), and the
detector misses unbroken seven-segment digits. Ink bridging is what makes every synthetic
display read, the unit-printing seven-segment one included.

Confidence (the recognizer's product of step probabilities, per token) separates right from
wrong reads only roughly on the real set with the chosen variant: right values median 0.63
(min 0.23), wrong values median 0.36 (6 of 7 below 0.5, one wrong value at 0.98). The two
negatives that returned a value did so at 0.01 and 0.15. The kernel flags a display value
below 0.5 as "Verificar" (never blank), so on this set 6 of 7 wrong reads and 2 of 6 right
reads arrive as "Verificar".

## Decision

- The sidecar gains `POST /read/display` (`app/display.py`): whole-line recognition with
  upscale, CLAHE and ink bridging. It returns the same `OcrReadResult` as `POST /read`, boxes
  in the received pixel grid. The reading job calls it for `reading_kind: display` when
  `OCR_PROVIDER=ocr-svc`; the `fake` provider replays fixtures as for the plate.
- Units are the kernel's job: the recognizer has no Ω or ° glyph (`GΩ` reads `GO`, `Gn` or
  `GD`, `µΩ` reads `UR`), so `displayUnitOf` maps those spellings back; a display that prints
  no unit (the seven-segment tester's range sits on a knob) never gets one inferred from the
  photo (Conflict 1 of the Epic 9 context).
- A low real-set accuracy is a finding, not a blocker: every display value is a Suggestion the
  engineer confirms, a wrong digit is caught by the confidence flag most of the time, and the
  offline path (typed value, photo as evidence) is unchanged.

## Caveats and next steps

- **Resolution.** The real crops are 45 to 150 px wide (digits 4 to 15 px tall). A tablet
  shot that fills the viewfinder has roughly ten times the pixels; this set is a pessimistic
  lower bound. Real tablet photos of the four displays (E8-A8) are the next measurement.
- **The plate pipeline reads the tiny real crops better** (8 of 15, every negative refused,
  cleaner confidences: right min 0.42, wrong max 0.24). Where the display path and the plate
  path disagree on real tablet photos, running both and keeping the higher-confidence value
  is the obvious next experiment; it doubles the read time (about 15 s a photo on this CPU).
- **Character LCDs** lose their word boundaries when a whole line is recognized: the
  micro-ohmmeter's current and reading run together (`I=10.2A 193` as one token), which is
  why that family scores 0 of 4. A split at the wide character-cell gaps of a dot-matrix line
  is the targeted fix.
- **Range.** The seven-segment tester's decimal point follows its range knob, so its unit
  comes from the cell (the unit slot, the previous row or the column default); the range
  source stays an open question for Matheus (E8-A3).

## Reproduce

Build the sidecar (`docker compose --profile ocr build ocr`), write a `truth.json` beside
the base set (never in the repository; format in the tool's docstring), then run
`services/ocr/tools/display_spike.py` as its docstring shows, with `text` as a third argument
for the plate-pipeline row.
