# Field UX analysis 2026-10-06: the photo as the primary instrument

Requested by Matheus on 2026-10-06: analyze the whole application against the field persona — an engineer on site, variable lighting, reading equipment nameplates, who wants to touch the screen as little as possible and use photos as the primary source of data, with OCR and LLM assisting the reading and the construction of the relatório. Reference apps named by Matheus (used by Bruno before): Field Control (fieldcontrol.com.br) and Produttivo (produttivo.com.br).

Method: three parallel passes — the planning artifacts (EXPERIENCE.md, DESIGN.md, SPEC, epics, retros), the implemented code (apps/web surfaces, kernel, api reading pipeline, at `8b69202`), and public web research on the two reference products (sites, help pages, app-store listings and reviews). Line numbers cite the audited revision and will drift.

## 1. Where the product already wins

- The market gap is real: neither Field Control nor Produttivo extracts a single data point from a photo — photos are evidence attachments only (Field Control's AI is back-office: Elo Chat/Validador; Produttivo's Manu IA is audio- and text-based). The pipeline photo → structured fields → normative FO.SERV-03 DOCX/PDF is unoccupied.
- The trust model is ahead of both: Suggestion as an entity, nothing written without a tap, the digit-coverage rule, "Confirmar todos" excluding `verify` fields, amber never red for the unconfirmed.
- The tap budget is an enforced test (J1 at most 9 taps / 36 keystrokes, `e2e/tap-budget.spec.ts`), not a slogan; re-tap on a tri-state never un-marks; bulk actions with undo; everything inheritable is offered ("Igual à", "Repetir", instrument "Sugerido").
- Offline is a correctness property with an inspectable sync surface; both competitors carry sync complaints in their reviews.
- Field conditions were recalibrated on 2026-09-19 (helmet, insulating gloves, lit work area, stylus preferred; the dark-basement/direct-sun framing withdrawn — `source-deltas.md`). DESIGN.md still carries the older framing in places; the binding residual risk is the dark cubicle interior, not the sunlit screen.

## 2. Findings

### Capture (the funnel's weakest link)

- **CAP-1 — the camera captures at the stream's default resolution.** `getUserMedia({video:{facingMode:'environment'}})` sets no resolution constraint and shots are grabbed from the `<video>` element (`apps/web/src/surfaces/ficha/camera-view.tsx:152,300`), so plates can be read from 640x480/720p frames while the encode path would accept 2560 px (`apps/web/src/files/photo-encode.ts:9`). Since 2026-10-05 plates and panels go to Textract (`infra/production/terraform.tfvars`), making shot quality the dominant factor in reading accuracy.
- **CAP-2 — no torch, zoom or tap-to-focus** in any viewfinder. The dark cubicle interior is the real lighting problem the 2026-09-19 recalibration left standing.
- **CAP-3 — no pinch-zoom in the photo viewer** (`apps/web/src/surfaces/photos/photo-viewer.tsx:120` zooms only programmatically to a crop). The photo cannot serve as the engineer's magnifier when a field reads "Verificar".
- **CAP-4 — a shot refused by quota while offline is held in memory only** (`apps/web/src/files/capture-rescue.ts:5`), the one footnote on "no photo is ever lost".

### Input (when the camera could not do it)

- **INP-1 — nameplate text fields leave autocorrect and autocapitalize on** (`apps/web/src/surfaces/ficha/ficha-fields.tsx:188`); the mobile keyboard mangles serials and TAGs. Only the TAG dialogs turn them off.
- **INP-2 — no `enterKeyHint` anywhere**, and the iOS phone decimal pad has no Return key, so the continuous Enter run assumes an iPad or hardware keyboard (`apps/web/src/components/number-input.tsx:184`).
- **INP-3 — an empty date field accepts no month-only value and offers no "Hoje"** (`apps/web/src/components/date-field.tsx:56`); plates often carry "08/2024" or a year alone.
- **INP-4 — "Salvo" is screen-reader-only** (`apps/web/src/surfaces/ficha/ficha-surface.tsx:247`). The F-02 class of defect (a typed value lost) shows the fear of silent loss is earned; a visible saved state is the counterpart of fixing the losses.

### Waiting on a reading

- **WAIT-1 — "Lendo…" has no elapsed time and no cancel**, and the fast poll stops after 120 s, falling back silently to the 60 s cycle (`apps/web/src/sync/engine.ts:155`). Measured reads run about 30 s; plate escalation (Haiku 4.5 to Nova Pro) adds more.
- **WAIT-2 — a failed display reading has no retry UI** (open `deferred-work.md` row).
- **WAIT-3 — leaving the panel-capture dialog orphans the photo and its suggestion** (open `deferred-work.md` row).

### Assists not yet earning their keep

- **AI-1 — the plate tile shows only on the transformer**, and the fake provider has a plate fixture only for `transformador_forca` (E8-A3 and E78-Q2, both open).
- **AI-2 — dictation ships disabled** (`VITE_SPEECH_ENGINE=none`): no mic renders anywhere. Produttivo's Manu IA proves voice-to-form is the lowest-touch capture shipping in this market; the blocker is the webspeech consent wording (Epic 9 open question).
- **AI-3 — no audit between "field done" and "Emitido".** Both competitors converged on AI as a closing QA gate (Field Control's Elo Validador de OS, Manu IA's review pass). The 2026-10-06 F-03 confirmation counts empties; an LLM pass could name contradictions rules cannot see (a conclusion that disagrees with its NC items, readings out of family, a parecer that disagrees with the restrições). The conclusion text itself stays deterministic on the device (NFR-12) — that decision is right for a normative document and is not revisited here.

## 3. Competitor synthesis (what they prove, what they miss)

Patterns proven in production worth having: the form is the report (instant branded PDF — already ours, stronger); photos bound to the item with automatic date/time/GPS provenance (ours, with the 11.5 switch); mandatory-evidence gating at close (ours via pre-issue, strengthened by F-03); voice filling the form (built, off); QR on the equipment pulling identity and history (not built); AI as closing QA (not built — AI-3).

Their weaknesses our field flows already avoid: Produttivo iOS reopens the camera per shot (burst is ours), no photo zoom (CAP-3 is ours to fix), Field Control's visit-level photo bucket, generic PDFs with no Word fidelity, best-effort offline.

Considered and not taken now: QR asset lookup (the "Igual à ⟨TAG⟩?" copy chips cover the common case; QR needs printed labels the sites do not carry), photo markup/annotation (no evidence of need in FO.SERV-03), gallery lock / camera-only enforcement (import-after-visit is a first-class flow here, FR-47).

## 4. Scope boundary

Everything the 2026-10-06 MVP hands-on review owns stays out of this analysis's epic: F-01 (Story 11.11, PR #98), the field-defects batch 2 in progress (F-02, F-03, F-04, F-05, F-08, F-09, F-12, F-13, F-14, F-20, F-21, F-27, F-28 — `spec-review-fixes-field-defects-2.md`), and the layout-and-copy batch planned as the third review PR (F-06, F-07, F-10, F-11, F-15 to F-19, F-22 to F-26, F-29). Where a finding above touches one of those (the F-02/INP-4 pairing, the F-03/AI-3 pairing), the epic story builds on the batch's result, never replaces it.

## 5. Finding-to-story map (Epic 13)

| Finding | Story |
|---|---|
| CAP-1 | 13.1 Capture at the resolution the reading needs |
| CAP-2 | 13.2 Torch, zoom and tap-to-focus in the viewfinder |
| CAP-3 | 13.3 Pinch-zoom to read the photo |
| INP-1, INP-2, INP-3, INP-4 | 13.4 The keyboard stops fighting the field, and the sheet says Salvo |
| WAIT-1, WAIT-2, WAIT-3 | 13.5 A reading shows its age, can be cancelled, and never dead-ends |
| CAP-4 | 13.6 A shot refused by quota survives the tab |
| AI-1 | 13.7 The plate tile on every block type |
| AI-3 | 13.8 The emission audit |
| AI-2 | 13.9 Dictation on, behind one line of consent |
