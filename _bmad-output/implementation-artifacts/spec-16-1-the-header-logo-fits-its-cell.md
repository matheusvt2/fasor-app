---
title: 'Story 16.1: The header logo fits its cell'
type: 'bugfix'
created: '2026-10-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
dev_model: 'opus'
dev_effort: 'medium'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-16-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** With a company logo wider than about 3:1 (Fasor's is about 4:1), the DOCX header draws the image at `LOGO_MAX_WIDTH_PX` (half the content width, 5233 twips) inside a cell capped at that same half width whose inner width is the half minus Word's two default cell margins (`CELL_MARGINS_TWIPS`, 216 twips), so Word and the LibreOffice PDF clip the right 0.38 cm of the logo (Bruno's screenshot of 2026-10-23, both halves). The Porto Seguro fixture has no logo, so no test caught it.

**Approach:** In `apps/api/src/jobs/generate/docx.ts`, cap the logo image at half the content width minus the cell margins and size the logo cell to the drawing plus its margins (the lines cell takes the rest); keep the 3 cm height cap and the plain header unchanged. Extend `docx.test.ts` "A11" with a wide-logo case and a tall-logo case that read the drawing's `wp:extent` (EMU, 635 per twip) against the cell's `w:tcW`. No kernel, no contract; the goldens (no logo) stay byte-identical.

</frozen-after-approval>

## Implementation Notes

- 2026-10-23: `docx.ts`: `CELL_MARGINS_TWIPS` moved above `LOGO_MAX_WIDTH_PX` and exported (the test reads it); `LOGO_MAX_WIDTH_PX = floor(((CONTENT_WIDTH_TWIPS / 2 - CELL_MARGINS_TWIPS) / 1440) * 96)` (334 px, was 349); `logoHeader` sizes the cell as `ceil(width * TWIPS_PER_PX) + CELL_MARGINS_TWIPS` with no `min` (the floor on the image keeps the cell at or under the half: 334 px gives 5226 twips against a 5233 half). Height cap and the plain header untouched.
- 2026-10-23: `docx.test.ts`: "Story 16.1" case renders a 400x100 and a 100x400 PNG, reads `w:tcW` and `wp:extent` of the logo cell with attribute-order-tolerant regexes, asserts `cx <= (tcW - margins) * 635`, `cy <= 3 cm`, `tcW <= half`, and that each image fills the cap that decides it (equality). 24/24 green in the tools container; the structure golden (no logo) unchanged.
- 2026-10-23: visual check: a DOCX of the full Porto Seguro fixture with an 800x200 bordered PNG logo, converted with the api container's LibreOffice (`/opt/libreoffice26.2/program/soffice`) and rasterized (`.scratch-e16a/page-001.png`, not committed): the orange border is whole on all four sides, the title and form lines sit beside it. A look in Word is left to Bruno's next download (no Word on the build machine).
- 2026-10-23: no stop-and-replan trigger; story gate (`lint`, `static`, `test:api`, `test:unit`) run under `lockf /tmp/fasor-verify.lock` in the tools container, log in `.scratch-e16a/gate.log`.
- 2026-10-23, after review: `logoHeader` keeps a `Math.min(CONTENT_WIDTH_TWIPS / 2, …)` clamp so the half-width invariant is local; the test also asserts the lines cell and the `w:gridCol` pair share the content width with the logo cell, that the cell equals the drawing plus the margins in both cases, and that the table sets no `tblCellMar`/`tcMar` (Word's 108-twip default is what the cap subtracts). 24/24 green again.
- Narrowings recorded (not in the DoD's words): the wide-logo case is its own `it` beside "A11" in the same `describe`, not a branch inside A11; the visual check used `buildDocx` on the fixture with a synthetic PNG, not an uploaded logo through the files pipeline and a preview job (the header reads the image's own dimensions, so the `print` variant's size does not change the geometry); the look in Word waits for Bruno's next download of the v0.3.2 preview. A width-capped logo now prints 0.38 cm narrower (8.85 cm), which the PR says.
- Evidence per AC: AC1 and AC2 by `docx.test.ts` "Story 16.1" (wide and tall) and the LibreOffice render of `.scratch-e16a/page-001.png` (sent to Matheus, not committed); AC3 by `docx.test.ts` "4.8-UNIT-006 DOCX structure golden" (no logo, unchanged bytes). Remaining DoD after this spec: the PR with the gate output and the screenshot, merge, deploy as v0.3.2.

## Review Triage Log

- Dev model mismatch (spec opus/medium vs epics sonnet/low): false. The bmad-build model policy (sonnet retired, effort floor medium, 2026-09-24) resolves the epics line to opus · medium; the spec records the resolved pair as the workflow requires.
- Lines cell, `tblW`/`gridCol` not tested: low, patched (the test now asserts the lines cell and the grid pair).
- Tall case cell equality not asserted: low, patched (cell = drawing + margins asserted for both cases).
- Margins asserted against the code's constant, not the document: low, patched (no `tblCellMar`/`tcMar` override asserted; Word's default is the subtracted value).
- A separate `it` instead of extending A11: low, rejected: same `describe`, same helpers; recorded as a narrowing above.
- `min` guard removed from `logoHeader`: low, patched (clamp restored).
- Visual check bypasses upload/print variant and Word: low, rejected as a patch, recorded as a narrowing above (geometry reads the image's dimensions; Word look on Bruno's next download).
- Gate log incomplete: not a defect; the gate was still running at review time; its closing lines go in the PR.
- `.scratch-e16a/` untracked: handled: files are added by name, the folder is moved out after the PR, the screenshot goes to Matheus.
- `sprint-status.yaml` comment "mangled": false: the file chains dated comments with ` |  # ` on every Epic 15 row.
- Spec missing pieces (status, AC evidence, deploy, the 0.38 cm): low, patched in the notes above; `status` is set by this finalize step.
- Deferred A11 note leaves the proportion question open: low, patched (half the width stays the limit; Bruno asked only for no cut).

