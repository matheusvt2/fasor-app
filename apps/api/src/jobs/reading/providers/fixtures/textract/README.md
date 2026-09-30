# Textract DetectDocumentText fixtures (Story 11.7)

Hand-built `DetectDocumentText` responses for `textract.test.ts` and the `11.7-INT` test of
`job.integration.test.ts`. None is a recorded Textract answer and none came from AWS: the
shapes follow the API reference (PAGE, LINE and WORD blocks, `Geometry.BoundingBox`
normalized to the image, `Geometry.Polygon`, `Relationships` of type `CHILD`,
`Confidence` 0 to 100). No client material: the words are the synthetic plate's and a few
invented ones.

- `plate-upright.json`: derived from `services/ocr/tests/fixtures/plate-transformador.tokens.json`
  (the synthetic plate, 1600 x 1100). Each expected pixel box `[x0, y0, x1, y1]` became a WORD
  `BoundingBox` `{Left: x0/1600, Top: y0/1100, Width: (x1-x0)/1600, Height: (y1-y0)/1100}` with
  an upright `Polygon`; consecutive tokens form one LINE until the next token starts left of the
  previous one or more than 100 px after it; confidence is 95 to 99.
- `rotated-90.json`, `rotated-180.json`, `rotated-270.json`: a 1000 x 500 image with two lines
  (`TR-01 SECCIONADORA`, `15 kV`) rotated 90, 180 and 270 degrees. `BoundingBox` is axis-aligned
  in the image's frame, `Polygon` starts at the text's own top-left corner, and the WORD blocks are
  listed out of text order so only the LINE's CHILD order gives the reading order.
- `skewed.json`: one line under a small skew; the `Polygon` corners differ from the box, and the
  second word's box falls between pixels (floor and ceil).
- `edge-and-degenerate.json`: a word off the left edge, one off the bottom-right corner, an
  empty word, a word without a box, a word wholly off the image, a CHILD id naming no block and
  two orphan WORDs (one listed before the LINE, one with a confidence over 100).
- `empty.json`: only a PAGE block.

They were written by a throwaway script from the numbers above; edit them by hand.
