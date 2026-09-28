---
title: 'Story 9.1: Read the instrument display with "Ler visor" (plus the per-kind reading job)'
type: 'feature'
created: '2026-09-28'
status: 'ready-for-dev'
baseline_revision: 'a2cd0534bee9371e1e76ca1f58da786800a8c902'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/docs/display-reading-spike.md'
warnings: ['batched', 'oversized']
batched_reason: 'Batch D of Epic 9: Story 9.1 is the first new reading kind, so it carries the job generalization (per-kind handler registry, enqueue for every kind, fake fallback by kind) that batches K and P build on.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The reading pipeline reads only plates: `runReadingJob` throws for any other kind, file receipt enqueues only `plate`, the fake fallback is keyed by block type alone, and the sheet has no way to photograph an instrument display, so every reading is typed.

**Approach:** Turn the job into a dispatch over per-kind handler modules (plate moved unchanged, display added), give the sidecar a `POST /read/display` path (chosen by the spike, already written in `services/ocr/app/display.py`), parse display tokens into values in the kernel, and add "Ler visor" (burst camera per Measurement table, single shot for the thermo-hygrometer) with queued, suggested, mismatch and auto-confirm states on measurement cells and env fields.

## Boundaries & Constraints

**Always:**
- Plate behavior is byte for byte unchanged: `job.integration.test.ts`, `plate-reading.spec.ts`, `plate.spec.ts` pass unmodified (only import paths may move).
- Nothing unconfirmed is written, counted or printed; a filled cell is never overwritten; typing into a suggested cell discards that suggestion only (same batch as the typed op).
- Kernel owns every derived value/text (AD-1/AD-13): value parse, unit resolution, cell mapping, trust, burst order, mismatch text, pending lookups. `apps/web` renders and writes ops only. Fixed copy in `copy/pt-br.ts`/`copy/ui.ts`.
- Never infer a unit the display does not print (Conflict 1): printed unit if the column accepts it; else the cell's stored unit, the previous row's stored unit, else the column default. A printed unit the column does not accept, or a column-default unit on a multi-unit (insulation) column, gives `verify`.
- Screens from `60-ficha.html` classes (`.mt-actions`, `.read-display-btn[data-count]`, `.suggestion-field`, `.suggested-pill`, `.queued-banner`, `.crop-thumb`); grep the mock, never read it whole. `.frame-*` rules translated in `app.css` per AGENTS.md.
- Everything in Docker; `OCR_PROVIDER`/`LLM_PROVIDER` stay `fake` in compose and tests.

**Never:**
- No client material in the repo: nothing from `docs/media/`; synthetic fixtures only (`make_display.py`).
- No `CONTRACT_VERSION` bump (no op family changes: suggestions are existing server ops, `reading_target` is untyped JSON). No change to `sprint-status.yaml` or `epics.md`.
- No dictation (batch V), no caption/NC/panel kinds (batches K, P), no retry UI for a failed display reading.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single value, empty cell | isolacao target row 0 col 0; OCR `147` + `Gn` (conf .95) | one pending suggestion `sheet/{b}/test/isolacao/cell/0/0` = `{raw:'147',unit:'GΩ',state:'measured'}`, `suggested`, `mode: fill`, bbox of the cited tokens | - |
| No unit printed | `3.42` on isolacao, previous row stored `1.2 GΩ` | unit `GΩ`, `suggested`; with no stored unit anywhere: column default `GΩ`, `verify` | - |
| Low confidence | value token conf < 0.5 (`87.` .17) | `verify` | - |
| Stored 30 s/1 min/10 min | transformer isolacao start col 1; 3 values | 1 MINUTO gets the 2nd value; 30 s and 10 min values dropped, logged `print_column` | - |
| Multi value, single column | seccionadora contato aberto start row 0; 3 values | rows 0, 1, 2 (reading order over capture cells of the test); values past the last capture cell dropped `no_cell` | - |
| Typed equal | cell `147 GΩ` typed; suggestion equal | `mode: replace`; device auto-confirms (cell keeps its value, gains `source_suggestion_id`, crop glyph) | - |
| Typed different | cell `14,7 GΩ`; suggestion `147 GΩ` | line "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir"; tap the visor value confirms (replace), tap the typed value discards | - |
| Env | `{location_id}` target; `23.4CC`, `58`+`%UR` | `location/{id}/env/temperature_c` 23.4 °C and `humidity_pct` 58 %; unit-less value maps nowhere (dropped `no_cell`) | - |
| No value read | only dates/labels, or a far shot | `reading_status: done`, zero suggestions | - |
| Bad target | display photo whose target does not parse, or block/location gone | permanent failure, `failed` | as plate |
| Offline shot | burst offline | photo rows `reading_kind: display`, `reading_status: queued`; target cell shows "Foto guardada — leitura quando houver sinal" and stays typeable | - |

</intent-contract>

## Code Map

- `apps/api/src/jobs/reading/job.ts:148` -- `runReadingJob`; plate-only at 185, 202-249. Keep photo/relatorio load, image orientation (223-228), batch commit (252-277), run rows and failure path; move the rest behind the handler.
- `apps/api/src/jobs/reading/providers/fake.ts:45,90` -- `DEFAULT_FIXTURE_BY_BLOCK_TYPE`, `resolveFakeFixture`; `providers/index.ts:27` factory ctx; `providers/ocr-svc.ts:22` route.
- `apps/api/src/jobs/reading/fixtures/` -- six new display fixtures ALREADY WRITTEN (sidecar display reads of `services/ocr/tests/fixtures/display-*.jpg`, sha256 names listed in `services/ocr/tests/fixtures/displays.md`); `README.md` to extend; `providers/fake.test.ts` checks each fixture names a committed image (add `services/ocr/tests/fixtures/display-*.jpg` to its image set).
- `apps/api/src/http/files.ts:195-207,335` -- enqueue plate-only, payload `'plate'`. `apps/api/src/http/reading.ts:60,71` -- reread plate-only.
- `packages/domain/src/contract/ocr.ts:19-23,104-113,212-215` -- routes, `OcrImage`, `OcrProvider`, `x-ocr-service` export; `pnpm schema:ocr` rewrites `services/ocr/contract/ocr-contract.schema.json`.
- `services/ocr/app/main.py:95-114` -- `/read`; `services/ocr/app/display.py` ALREADY WRITTEN (`read_display`); `services/ocr/tests/` (conftest, `test_api.py`, `test_generator.py`); `services/ocr/tests/fixtures/make_display.py`, `displays.json`, `displays.md`, six JPEGs ALREADY WRITTEN; `services/ocr/tools/display_spike.py` (spike tool, not a test).
- `packages/domain/src/reading/{build,target,digits,assess}.ts` -- plate build, `plateReadingTargetSchema`, `digitCoverage`; `relatorio/readings.ts:49,290,494,509,514,557` -- `EvaluatedCell` (`unit`, `units`), `cellAddressesOf`, `evaluateSheetReadings`, `cellAt`, `unitDefaultFor`, `runTarget`; `seed/v1.ts:357,389,422` -- column roles and `group`.
- `packages/domain/src/relatorio/suggestions.ts` -- `suggestionBlockId` L54 (sheet only, env null), `nameplateKeyOf` L61, `livePendingSuggestions` L88, `compareSuggestion` L165 (pass `{kind:'number'}`), `suggestionView` L201, `confirmAllCandidates` L271, `confirmSuggestionOps` L312, `discardSuggestionOp` L326, `showsConfirmedGlyph` L300. Test cell read: `block.sheet.test[testKey]?.cells[String(row)]?.[String(col)]` (`readings.ts` `storedCell` L213). Env values are bare `numberValue` (`schemas/entities.ts:291`).
- `apps/web/src/db/suggestion-store.ts:45,59-75,91` -- `autoConfirmPending`/`sweepOne` (nameplate-only filter L65), `readingCountRows`.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:38,107,143,178` -- `EnsaiosSection` (no `state` prop; thread it from `ficha-surface.tsx:191` as nameplate gets it at 168), `TestSection`, `MeasurementTable`, `.mt-title-row`. `measurement-field.tsx:29,66,83` -- props, `testCellOp`, Enter run.
- `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx:72,102,263,364,380` -- model/hook, `SuggestionFill`, `ReplaceLine`, confirmed field: the pattern to mirror. `components/suggestion-field.tsx`, `components/crop-thumb.tsx:83` (`{photoId,bbox,label,onPress}`).
- `apps/web/src/surfaces/ficha/camera-view.tsx:41-247` -- `useCamera(relatorioId, target, opener, {singleShot})`, burst count, "Concluir fotos"; `use-photo-capture.ts:27` `CaptureTarget.reading`; `db/file-commit.ts:86,107,137-139` (device writes `queued`); `photo-openers.tsx:18,59` (`useSheetCamera`, `PlateCaptureTile`); `plate-photo.tsx` (`PlatePhotoRow` queued/reading/failed copy `copy/pt-br.ts:869-873`).
- `apps/web/src/surfaces/ficha/cabine-block.tsx:35,77-95,121,127` -- env section `.ficha-amb`, `.ficha-amb-actions`, `cabineEnvOp`.
- Mock `prototype/screens/60-ficha.html`: `.mt-actions` in `.mt-title-row` (516, 550, 564, 594), env button 299 (+ `.btn-reason` "Termo-higrômetro"), queued cell 521/527, confirmed cell crop "Ver recorte do visor", viewfinder 899-913 (`.vf-hint` "Próxima leitura: …", `.vf-done` "Nada mais a ler nesta ficha"). `components.css:161,548` has `.queued-banner`, `.read-display-btn[data-count]`.
- E2E: `e2e/tap-budget.spec.ts` (counter, `TAP_BUDGET`, J1 setup 150-211), `e2e/plate.spec.ts:21,49-55` (fake media stream + "Disparar"), `e2e/plate-reading.spec.ts`, `e2e/support/{taps,reading-ops,sync,photos}.ts`.

## Tasks & Acceptance

**Execution:**
- `apps/api/src/jobs/reading/kinds/types.ts` -- define the handler interface exactly as in Design Notes (names are a cross-batch contract).
- `apps/api/src/jobs/reading/kinds/plate.ts` -- move plate target parse, block/nameplate/registry load, OCR (`mode: 'text'`) + structuring calls, `buildReadingSuggestions`; `fakeDefaults: [{block_type:'transformador_forca', sha256:'a1eac910…'}]`.
- `apps/api/src/jobs/reading/kinds/display.ts` -- parse `displayReadingTargetSchema`; load block (checks as plate: same relatório, type, live) or cabine location (`kind: cabine`, same relatório, live); OCR with `mode: 'display'`, no structuring call; `buildDisplaySuggestions`; `fakeDefaults` per Design Notes.
- `apps/api/src/jobs/reading/kinds/index.ts` -- registry `READING_KIND_HANDLERS`, `readingKindHandler(kind)`, `FAKE_FIXTURE_DEFAULTS` (flattened with kind).
- `apps/api/src/jobs/reading/job.ts` -- dispatch; unknown kind stays a permanent failure; shared `readOcr` keeps the size check; logs every drop with its reason.
- `apps/api/src/jobs/reading/providers/{fake,index,ocr-svc}.ts` -- fallback by `(reading_kind, block_type?, table_key?)` most specific first; ctx gains `reading_kind`, `table_key`; `ocr-svc` posts `mode: 'display'` to `OCR_SERVICE_ROUTES.readDisplay`.
- `apps/api/src/http/files.ts`, `apps/api/src/http/reading.ts` -- enqueue every `reading_kind` with `reading_status === 'queued'` (payload kind from the row); reread any kind with a registered handler (else the existing 400).
- `packages/domain/src/contract/ocr.ts` -- `readDisplay: {method:'POST', path:'/read/display'}`, `OcrReadOptions {mode?: 'text'|'display'}` as `read`'s optional 2nd arg, export `read_display` in `x-ocr-service`; regenerate the schema.
- `services/ocr/app/main.py` -- `POST /read/display` with `/read`'s body, mime, 413/422/500 rules calling `read_display`; `services/ocr/tests/test_display.py` -- each synthetic display's tokens contain each expected `raw` of `displays.json` as a number; 413/422 on the new route; `test_generator.py` covers `make_display.write`.
- `packages/domain/src/reading/display.ts` (+ `target.ts`, `index.ts`) -- `displayReadingTargetSchema`, `displayCellTarget`, `displayEnvTarget`, `displayValues`, `displayUnitOf`, `buildDisplaySuggestions`, `DISPLAY_MIN_CONFIDENCE = 0.5`; unit tests on the recorded fixture tokens (copy them inline) and every matrix row.
- `packages/domain/src/relatorio/suggestions.ts` (+ tests) -- `suggestionTarget(path)` block|location; `livePendingSuggestions` keeps live env ones; `measurementSuggestions(block, pending)`, `measurementConfirmAllCandidates(block, pending, testKey, tableKey)`, `envSuggestions(location, pending)`, `displayMismatchText(cell, suggestion)`, `displayBurst` helpers (start, next, hint text) per Design Notes.
- `apps/web/src/db/suggestion-store.ts` -- auto-confirm test cells (stored cell) and env fields (location env value), `{kind:'number'}` compare, `auto: true`, value = the engineer's.
- `apps/web/src/surfaces/ficha/{ensaios-section,measurement-field,read-display}.tsx`, `cabine-block.tsx`, `camera-view.tsx` -- `.mt-actions` with "Ler visor" + "Confirmar todos" (per table, shown when it has confirmable fills); burst targets per shot (`useCamera` option `shotTarget(index) => CaptureTarget | null`, hint line, done state); cell states: queued banner, suggested/verify fill with crop + pill + "Confirmar", Enter confirms and runs on, typing discards, mismatch line, confirmed crop glyph; env button + single shot + field states.
- `e2e/read-display.spec.ts` (@p0 burst/queued/390 px), `e2e/read-display-pipeline.spec.ts` (@p1 typed-first through the real job; @p1 env), `e2e/tap-budget-signal.spec.ts` (@p0 SM-3 walk); new specs that share the queue go in `SERIAL_SPECS` (`e2e/support/groups.ts`).
- `apps/api/src/jobs/reading/job.integration.test.ts` (new cases, plate cases untouched), `http` tests for enqueue/reread of `display`; `fake.test.ts` fallback order.
- `apps/api/src/jobs/reading/fixtures/README.md`, `_bmad-output/implementation-artifacts/deferred-work.md` -- document defaults; entries for the narrowings below.

**Acceptance Criteria:**
- Given a seccionadora sheet, when the user taps "Ler visor" on "Contato aberto" and shoots three times, then the opener reads "Ler visor · 3", the hint names the next row, each shot is a photo row with `reading_kind: display`, `reading_status: queued`, `reading_target {block_id, block_type, table_key:'isolacao', start_cell:{row:0..2, col:0}}` in IndexedDB, and "Concluir" closes the camera.
- Given the device offline after that burst, then each target cell shows "Foto guardada — leitura quando houver sinal" and typing a value there commits it.
- Given `OCR_PROVIDER=fake` and signal, when a display photo uploads, then the job runs through the display handler and the cell shows the suggested value with its crop and "Sugerido"; confirming (button or Enter) writes the value with `source_suggestion_id`.
- Given a typed equal value, the suggestion auto-confirms silently with the crop glyph; given a different one, the "Visor: … · digitado … — Conferir" line offers both values and never overwrites until tapped.
- Given the thermo-hygrometer "Ler visor" in "Da cabine", one shot fills temperature and humidity as suggestions.
- Given the SM-3 walk (J1 setup, signal), a fully conforme seccionadora with a copied plate costs ≤ 20 taps and ≤ 15 keystrokes, asserted with the committed cell values.
- Given `OCR_PROVIDER=ocr-svc`, a display reading posts to `/read/display`; the sidecar pytest passes on all six synthetic displays; plate reads still post to `/read`.
- Given an existing plate photo, every Epic 8 plate test passes unmodified.

## Design Notes

Handler contract (K and P add one module each and one line in `kinds/index.ts`):

```ts
export interface FakeFixtureDefault { block_type?: string; table_key?: string; sha256: string }
export interface ReadingKindContext { db: Db; companyId: CompanyId; relatorioId: string; photo: PhotoFileRow }
export interface ReadingKindRunInput { providers: ReadingProviders; image: ReadingImage; runId: string; newId: NewId }
export interface ReadingKindRunResult { ocr: OcrReadResult | null; structuring: StructuringResult | null; rows: SuggestionRow[]; dropped: { key: string; reason: string }[] }
export interface PreparedReading { fixture: { block_type: string | null; table_key: string | null }; run(input: ReadingKindRunInput): Promise<ReadingKindRunResult> }
export interface ReadingKindHandler { kind: ReadingKind; fakeDefaults: readonly FakeFixtureDefault[]; prepare(ctx: ReadingKindContext): Promise<PreparedReading> }
```
`prepare` throws `PermanentReadingError` for a bad or dead target; `run` may throw provider errors (transient/permanent as today). The job owns the image, the discard-previous + create + `done` batch, run rows and `failed`.

Display defaults (`kinds/display.ts`): `{table_key:'isolacao'}` → display-isolacao; `{table_key:'resistencia_contato'}` → display-microhmimetro; `{table_key:'relacao_transformacao'}` → display-ttr; `{table_key:'env'}` → display-termo; `{block_type:'transformador_forca', table_key:'isolacao'}` → display-tres-valores; `{}` → display-megohmetro. Env runs use `table_key 'env'`, `block_type null`.

Kernel parse (`displayValues`, mirrored in `services/ocr/tools/display_spike.py`): tokens with `/` or `:` skipped; in a token with `=`, only the text after the last `=` (a head `I`/`1`/`l` followed by a number + `A` is the test current: skipped); a number followed by `A|V|kV|Hz|s|min|m` or preceded by `R` is an annotation; a unit is the number's suffix in the same token or the next token on the same row (vertical overlap). `displayUnitOf`: `^([uUµμmMkKgGtT])([ΩOoQDn0R])$` → `µΩ|mΩ|MΩ|kΩ|GΩ|TΩ`; text containing `%` → `%`; `^[°ºo]?[Cc]{1,2}$` → `°C`. Stored raw is canonical dot-decimal (`canonicalDecimal`).

Cell mapping (`buildDisplaySuggestions`, test target): if values > 1 and the start column has a `group` with exactly that many columns in its table, map in order over that group (print → drop `print_column`, derived → drop); else walk the test's capture cells in reading order from `start_cell` (drop `no_cell` past the end). Env target: by unit (`°C` → `temperature_c`, `%` → `humidity_pct`); duplicates or unit-less values dropped. Trust per value: `verify` when conf < 0.5, the unit rule says so, or `digitCoverage` fails. `mode: replace` when the cell was filled at emission.

Enter on a focused suggested cell confirms it whatever its trust (its own action) and moves along the run; "Confirmar todos" skips `verify` and replace ones.

Burst (kernel helpers): start = the tapped table's first capture row with no display photo targeting it (a typed row still gets its evidence shot), else row 0 of the table; each shot advances one row across the block's tests in sheet order; after the last row the hint reads "Nada mais a ler nesta ficha" and the shutter is disabled; "Concluir" always closes. Hint: "Próxima leitura: {table title} · {row label}".

SM-3 recount (E12-A5): J1 base is 8 taps (plate copy 1, bulk C 1, instruments 4, conclusion pair 1, "Concluir ficha" 1); with signal: "Ler visor" 1 + 9 shutters + "Concluir" 1 + one tap on the first suggested cell, then Enter ×9 confirms down the run = 20 taps, 9 keys. EXPERIENCE's "19 taps" assumed 5 base taps and per-table "Confirmar todos" (3), which today would be 22: open question. "Sincronizar agora" (test stand-in for the timer, decision C-4) is pressed outside the count (counter read before and after).

Narrowings (deferred-work entries, owner in brackets): env suggestions have no provenance glyph (`location/env` has no cell provenance) [Epic 9 integrated review]; env pending suggestions count in Sync but not in pre-issue section 9 [same]; no retry UI for a failed display reading [same]; plate pipeline reads the tiny real crops better (spike) [E8-A8 follow-up].

Open questions: range source for the unit-less megôhmetro (E8-A3); print-only stored values dropped (Conflict 3); the 2 ambiguous crops #08/#10 (E8-A8); SM-3 recount above.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- packages/domain/src/reading packages/domain/src/relatorio` -- green
- `docker compose --profile tools run --rm tools pnpm schema:ocr` then `git diff services/ocr/contract` -- only `read_display` added
- `docker compose --profile tools run --rm tools pnpm test:api` -- green, plate cases untouched
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project desktop-chrome e2e/read-display.spec.ts e2e/read-display-pipeline.spec.ts e2e/tap-budget-signal.spec.ts e2e/tap-budget.spec.ts e2e/plate-reading.spec.ts` (the stack up: `docker compose up -d`) -- green
- Sidecar (orchestrator runs under the lock): `docker compose --profile ocr build ocr`, `docker compose --profile ocr run --rm ocr pytest`
