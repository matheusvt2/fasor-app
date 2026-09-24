---
title: 'Stories 5.1-5.4: the sheet shell, cabine data, nameplate and checklist'
type: 'feature'
created: '2026-09-24'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
warnings: ['batched', 'oversized']
deferred: []
---

<!--
Dev model: opus · Effort: high, for every task below (Section stepper + Tri-state
radiogroup are exactly the ARIA/keyboard component work the Epic 1 retro floor A11
raises to opus/high; the epics.md line for 5.1-5.4 says sonnet/medium, this spec
overrides it). Batched: one PR for Stories 5.1, 5.2, 5.3, 5.4 plus carry-over E3-A3 --
they render into one shared sheet shell and route, and Epic 5's token budget is tight.
-->

<intent-contract>

## Intent

**Problem:** No equipment-sheet surface exists yet (`apps/web/src/app.tsx:96` comment).
A field engineer cannot open a block from the tree, see its cabine data, fill its
nameplate, or mark its checklist.

**Approach:** Build the sheet route + shell (header, Section stepper, Sticky action
bar, autosave/draft recovery, `concluded_by`), the cabine block (edit-once,
read-only elsewhere), the nameplate group (copy chips + typed fields by kind), and
the checklist (tri-state rows, NC expansion, bulk actions with undo). Two empty
section hosts (`ensaios-section.tsx`, `conclusao-section.tsx`) reserve the stepper's
remaining two steps for Batch B (5.5-5.7) and Batch C (5.8-5.9) to render into.
E3-A3 (validate `sheet/*` paths against `getDefinition` in `applyOp`) is DONE already
in this branch (`packages/domain/src/ops/apply.ts` `assertSeedPath`) -- build on it,
do not redo it.

## Boundaries & Constraints

**Always:** every status/count/text/verdict lives once in `packages/domain`
(AD-1/AD-13); ops are the only write path, no Save button; `sheetState`,
`enabledCells`, `isCellFilled` (`packages/domain/src/relatorio/sheet-state.ts`,
already shipped) are reused, never re-derived; screens are built from the mocks'
class names (60-ficha.html, key-equipment-sheet.html, key-sheet-states.html), new
`.frame-*` rules (none expected per investigation) go in `apps/web/src/styles/app.css`
per AGENTS.md; pt-BR strings follow the three homes (derived -> domain,
static surface -> `copy/pt-br.ts` `ficha` namespace, component chrome -> `copy/ui.ts`).

**Never:** do not build the Measurement table, Instrument picker, Conclusion control,
Suggestion/Generated-text field, Não ensaiado band/dialog, camera/dictation buttons
(all later stories/epics -- their slots stay absent, never a disabled placeholder).
Do not touch `apps/web/src/surfaces/relatorio/{generate-action,sumario-*,setup-surface,
section-text-surface}.tsx` or web undo-toast hook internals beyond what
`checklist-section.tsx`'s own bulk-undo needs (parallel Batch F owns those files).
Do not edit `sprint-status.yaml` or `epics.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap Concluir ficha, sheet complete | Every nameplate field, checklist row, (test/conclusion cells seeded directly for the test) filled | `block/{id}/concluded_by` put; navigates to next sheet in tree order | none |
| Tap Concluir ficha, sheet incomplete | A nameplate field empty | No `concluded_by` op; scrolls/expands the first incomplete step; nothing is emitted | none |
| Checklist bulk "Marcar Conforme" | 5 unset rows, 2 NC, 1 NA-default | 5 rows become C in one batch; NC/NA untouched; undo toast reverses all 5 | `aria-disabled` + reason when 0 unset rows |
| Nameplate "Igual à ⟨TAG⟩?" | Another live block, same block_type + manufacturer, filled plate, this relatório | Every nameplate field copied as plain ops, "Copiado de ⟨TAG⟩ — Desfazer" | Chip absent when no match exists |
| Reload with uncommitted checklist observation text | Tab closed mid-type, no commit fired | "Rascunho encontrado — Recuperar" on reopen | Discarding drops the draft row only |
| `sheet/nameplate` op with unknown field_key | Malformed/corrupted op | `applyOp` throws (E3-A3, already shipped) | Caller-level (outside this spec's scope) |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/sheet-state.ts` -- `sheetState`, `enabledCells`, `isCellFilled`, `isEquipmentBlock` (reuse as-is); export the currently-private `enabledOf` as `enabledSubBlocksOf(block)` for reuse by the new kernel/UI code.
- `packages/domain/src/relatorio/progress.ts` -- existing relatório-wide `progress(snapshot)` (Story 4.3). **Do not rename or touch it.** The new per-sheet function below uses a different name to avoid the collision.
- `packages/domain/src/relatorio/sheet-progress.ts` (NEW) -- `export type SheetStep = 'placa'|'verificacoes'|'ensaios'|'conclusao'`; `export interface SheetProgress { steps: Record<SheetStep, { missing: number }>; complete: boolean; firstIncompleteStep: SheetStep | null }`; `export function sheetProgress(snapshot: Pick<RelatorioSnapshot,'blocks'>, blockId: string): SheetProgress`. Counting: `placa` = nameplate fields (`getDefinition(...).nameplate`) not `isCellFilled`; `verificacoes` = checklist items not answered (answered = filled result cell OR item_key in `block.config.na_defaults` with no cell -- matches the "na_defaults pre-marked NA" render) + NC rows (`result.value === 'NC'`) with an empty/missing observation; `ensaios` = for each enabled test (`enabledSubBlocksOf`, keys `isolacao|resistencia_contato|relacao_transformacao`), required cells = sum over its `tables[*]` of `rows.length * (value_columns with role 'capture'|'input').length`; filled = count of currently-stored filled cells under `sheet.test[test_key].cells`; missing = max(required - filled, 0), summed over enabled tests (this counts cells regardless of the exact row/col addressing scheme Batch B will choose -- do not assume a specific row/col mapping); `conclusao` = 1 if `sheet.conclusion.result` unfilled, else 0 (Batch C's own control fills this; count it as missing until then, that is correct, not a bug). `complete` = every step's `missing === 0`. `firstIncompleteStep` = first of `['placa','verificacoes','ensaios','conclusao']` with `missing > 0`, else null. Add step-count/label text helpers next to it (follow the pattern of `progress.ts`'s own text helpers, e.g. `stepMissingLabel(name, n)` for the stepper's `aria-label`).
- `packages/domain/src/relatorio/nameplate-copy.ts` (NEW) -- `suggestNameplateCopy(snapshot: Pick<RelatorioSnapshot,'blocks'|'equipment'>, blockId: string): { sourceBlockId: string; tag: string } | null` (same `block_type` + `fabricacao`/manufacturer-kind field value, another live block in this relatório with a filled plate, per FR-34); a second helper projecting `equipment.last_nameplate` onto the target block's own definition keys only (Story 5.3 AC 4, AR-24) -- `lastNameplateCopy(equipment: EquipmentRow, definition: BlockDefinition): { fieldKey: string; value: unknown }[]`.
- `packages/domain/src/parse/pt-br-number.ts` (NEW, minimal) -- `export function parseDecimalPtBr(input: string): string | null`: comma is the decimal separator; a dot followed by exactly three digits and no comma is a thousands separator; any other dot is a decimal; returns a dot-decimal string per AD-11's `raw` convention, or `null` when the input has no parseable number. No unit-suffix logic -- that is Story 5.5's own extension of this module, do not anticipate it.
- `packages/domain/src/relatorio/tree.ts` -- `firstInTree`, `locationTree`, `treeNodes`, `treePathTo` (reuse for tree navigation / "next sheet in tree order" / "Próxima coluna" detection: filter `treeNodes(locationTree(snapshot))` to `kind === 'equipment'` for the ordered sheet list).
- `packages/domain/src/schemas/entities.ts` -- `Sheet`, `Cell`, `numberValueSchema` (`{raw: dot-decimal string, unit, state}`), `BlockRow`, `concludedBySchema`.
- `packages/domain/src/seed/definitions.ts` -- `getDefinition`, `naDefaultsFor` (reuse).
- `apps/web/src/app.tsx` -- add route `{ path: '/relatorio/:id/ficha/:blockId', element: <FichaSurface />, handle: { title: '', back: (p) => \`/relatorio/${p.id ?? ''}/arvore\` } }`; wire a new `PageTitleProvider` (below) next to `BackTargetProvider`.
- `apps/web/src/state/back-target.tsx` -- copy this exact context/hook shape for the new `apps/web/src/state/page-title.tsx` (`PageTitleProvider`, `usePageTitleValue`, `usePageTitle(title)`); `apps/web/src/surfaces/app-shell.tsx:75-112` reads `handle.title` -- extend it to prefer the context value when set, same precedence style as `back`.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:226-229` `onOpen` -- add the missing case: an equipment tree row (`row.kind === 'tree'` or equivalent -- check `sumario-row.tsx`/row-kind union) navigates to `/relatorio/${relatorioId}/ficha/${row.blockId}`.
- `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` -- the tree rail (Story 4.4); an equipment row's tap/Enter must also navigate to the new ficha route (currently a dead end since no route existed -- grep this file for its equipment-row click handler).
- `apps/web/src/surfaces/relatorio/tag-dialogs.tsx` -- `TagDialog` (reuse verbatim for the header's rename button, keeps `equipment_id`).
- `apps/web/src/surfaces/relatorio/relatorio-ops.ts` -- op-builder pattern (`envelope`, `putBlockOp`, etc.) to copy for the new `apps/web/src/surfaces/ficha/ficha-ops.ts` (sheet ops: `sheet/{blockId}/nameplate/{field_key}`, `sheet/{blockId}/checklist/{item_key}/result`, `.../observation`, `location/{id}/se/{field}`, `location/{id}/env/{field}`, `block/{id}/concluded_by`).
- `apps/web/src/db/commit.ts` -- `commitBatch`, `undoBatch` (bulk-action undo), `toRecord`.
- `apps/web/src/input/use-field-commit.ts`, `field-commit.ts` -- the debounced local-echo commit hook; reuse for every typed field, following `apps/web/src/surfaces/relatorio/setup-surface.tsx:223,388,621,759-825` (`useTextField`/`useFieldCommit` idiom).
- `apps/web/src/state/drafts.tsx` -- `useDraftSource`-style registration (grep `setup-surface.tsx`/`section-text-surface.tsx` for a concrete call site) for the free-text fields (checklist Observation, "Digitar" nameplate text) needing "Rascunho encontrado — Recuperar".
- `apps/web/src/components/segmented-control.tsx` -- copy its APG-radiogroup keyboard contract (roving tabindex, arrows wrap, Home/End, Space/Enter) for the new `apps/web/src/components/tri-state-control.tsx`: 3 segments C/NC/NA, `value: 'C'|'NC'|'NA'|null`, re-tap of the selected segment is a no-op (already the pattern's default), **add** Delete/Backspace -> `onChange(null)`, full-word `aria-label`s, plain letter labels (no check glyph, per mock).
- `apps/web/src/components/index.ts` -- `Chip`, `Combobox`, `DateField`, `Toggle`, `OverflowMenu`, `ConfirmDialog`, `Toast` (reuse for nameplate combobox/manufacturer/date fields, cabine's `TIPO DE SE` select, overflow menus, confirm dialogs, undo toasts).
- `apps/web/src/surfaces/templates/type-defaults-dialog.tsx:35-38` -- `getDefinition` + `copy.composer.equipmentNames[type]` usage pattern (reuse the type-name map for the sheet header's "type + TAG").
- `e2e/support/relatorio-seed.ts` (`pushNewRelatorio`), `e2e/tree.spec.ts` (`openRelatorio` helper) -- reuse for e2e setup: a populated standard-template tree, then navigate via a tree row tap into a real block's ficha (no literal TAG/id in the spec; query the rendered DOM for a row, as `tree.spec.ts` already does).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add the two stub-host entries (owners: Batch B for `ensaios-section.tsx`, Batch C for `conclusao-section.tsx`).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/ops/apply.ts` -- already has `assertSeedPath` (E3-A3, this branch); no action, just build on it.
- `packages/domain/src/relatorio/sheet-state.ts` -- export `enabledSubBlocksOf` (rename the private `enabledOf`; keep `enabledCells` calling it).
- `packages/domain/src/relatorio/sheet-progress.ts` + `.test.ts` -- new kernel function per the Code Map's counting rules; unit-test every I/O matrix row plus: an empty block (all steps missing), a block with `na_defaults` items uncounted as missing, an NC row with/without observation, the row/col-agnostic ensaios count (seed two filled cells under a test_key and assert missing decreases by 2 regardless of which row/col indices were used).
- `packages/domain/src/relatorio/nameplate-copy.ts` + `.test.ts` -- `suggestNameplateCopy` and the last-visit projection, per FR-34/AR-24.
- `packages/domain/src/parse/pt-br-number.ts` + `.test.ts` -- the three disambiguation cases from the AC text ("3.300"→"3300", "3.7"→"3.7", "13,8"→"13.8") plus a non-numeric input returning null.
- `packages/domain/src/index.ts` -- barrel-export the three new modules (`export * from`).
- `apps/web/src/state/page-title.tsx` (NEW) -- `PageTitleProvider`/`usePageTitleValue`/`usePageTitle`, mirroring `back-target.tsx`; wire into `app.tsx`; extend `app-shell.tsx`'s title read to prefer it.
- `apps/web/src/app.tsx` -- add the `/relatorio/:id/ficha/:blockId` route.
- `apps/web/src/surfaces/ficha/ficha-ops.ts` (NEW) -- op builders for every sheet path this batch writes, plus `location/{id}/se/{field}`, `location/{id}/env/{field}`, `block/{id}/concluded_by`.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx` (NEW) -- loads the block + snapshot from IndexedDB/session, renders header, stepper, sticky bar, cabine block (only on the cabine's first sheet, `firstInTree`), nameplate section, checklist section, the two stub section hosts, autosave "Salvo" live region (throttled, visually hidden), draft recovery banner. "Concluir ficha" reads `sheetProgress`; complete -> commits `concluded_by` + navigates to the next sheet in tree order (or "Próxima coluna"/back to Sumário on the relatório's last sheet); incomplete -> scrolls/expands `firstIncompleteStep`, commits nothing.
- `apps/web/src/surfaces/ficha/ficha-header.tsx`, `section-stepper.tsx`, `sticky-action-bar.tsx` (NEW) -- per 60-ficha.html/key-equipment-sheet.html markup (`.sheet-header`, `.section-stepper[role=group]` with `.step[aria-current]`/`data-missing`, `.bar-buttons` with the empty camera slot).
- `apps/web/src/surfaces/ficha/cabine-block.tsx` (NEW, Story 5.2) -- `TIPO DE SE`/tensões/potência/ambiente fields, editable only on the cabine's first sheet (`.section.is-readonly` elsewhere per the mock, `role=textbox aria-readonly=true`), "Copiar da cabine anterior" chip, humidity-threshold "Observações rápidas" note surfacing (check `packages/domain/src/checks/` for an existing threshold constant before inventing one; if none exists, this is an OPEN QUESTION -- keep a conservative fixed threshold and say so in the PR body).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx` (NEW, Story 5.3) -- empty-group copy chips + "Digitar" reveal; filled-field rendering per kind (text/number-with-suffix/date/select/manufacturer-chips/voltage-class-chips) per `.field`/`.measurement-field`/`.field.combobox` classes.
- `apps/web/src/components/tri-state-control.tsx` (NEW) -- per the Code Map.
- `apps/web/src/surfaces/ficha/checklist-section.tsx` (NEW, Story 5.4) -- rows, tri-state, NC expansion (chips: pre-seeded + 5 most-recent-typed-for-this-item-in-this-relatório, Observation field with required border), bulk action bar (`aria-disabled` + reason), legend (`<details>`, open only for the session's first checklist), "Repetir da ficha anterior do mesmo tipo".
- `apps/web/src/surfaces/ficha/ensaios-section.tsx`, `conclusao-section.tsx` (NEW, stubs) -- render nothing visible (an anchor `<section id="...">` the stepper can scroll to, no content), one code comment each naming the owner story/batch.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` -- wire the equipment-row `onOpen`/click to the new route (minimal, additive change only).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the two stub entries.
- `e2e/ficha.spec.ts` (NEW, `@p0` unless noted) -- cover: open a sheet from the tree (header shows type+TAG, breadcrumb, stepper); fill every nameplate field by typing and reload to see it persisted; tap a checklist row through C/NC/NA with the keyboard (arrows, Delete) and mouse; NC expansion shows the required-observation border and blocks nothing but is visibly required; bulk "Marcar Conforme" + its undo toast; "Copiar da cabine anterior" chip + undo; nameplate "Copiar da última visita"/"Igual à" chip (seed a second matching block first) `@p1` if it needs extra fixture setup; "Rascunho encontrado" after a reload with uncommitted text; Concluir ficha with missing fields jumps to the first incomplete step and concludes nothing; Concluir ficha on a block whose sheet was seeded fully complete (direct IndexedDB seed for the ensaios/conclusion cells this batch doesn't render UI for) emits `concluded_by` and navigates onward.

**Acceptance Criteria:** epics.md `## Epic 5` Stories 5.1-5.4 (`_bmad-output/planning-artifacts/epics.md:1359-1464`), Given/When/Then as written, narrowed only by the Design Notes below. E3-A3: `_bmad-output/implementation-artifacts/epic-3-retro-2026-09-23.md` item G-2 / action item 3 -- done, verify `packages/domain/src/ops/apply.test.ts`'s new `E3-A3` describe block stays green.

## Spec Change Log

_Empty until the first bad_spec loopback._

## Review Triage Log

_Empty until the first review pass._

## Design Notes

- **Naming resolution (must-follow):** Story 4.3 already shipped `progress(snapshot): Progress` (relatório-wide sheet counts, `packages/domain/src/relatorio/progress.ts`). Epics.md's Story 5.1 AC names a *different*, per-sheet function `progress(snapshot, blockId)`. To avoid breaking the shipped export, this spec's kernel function is named `sheetProgress` instead (see Code Map). Keep this name; Batch B/C import it as `sheetProgress`, not `progress`.
- **na_defaults semantics:** `block.config.na_defaults` (set at template instantiation, `packages/domain/src/seed/template.ts:62`) is never written as a checklist cell. The Tri-state control must render NA as pre-selected for an item in `na_defaults` with no stored cell (a display default, not a commit) -- tapping any segment on such a row commits a real cell from then on. `sheetProgress` must treat this the same way (not missing).
- **Ensaios/Conclusão counting without their UI:** `sheetProgress`'s `ensaios`/`conclusao` counts are real and will almost always show as incomplete until Batch B/C ship, because a block's `conclusion` sub-block is always required (`conclusion: true` in every `BlockDefinition`). That is correct, not a bug -- do not special-case it away. The e2e "Concluir ficha succeeds" test therefore seeds the test/conclusion cells directly (IndexedDB, not through UI) rather than waiting for Batch B/C.
- **Number parsing scope:** nameplate number fields (fixed unit, e.g. `corrente_nominal` in A) use only `parseDecimalPtBr`'s comma/dot disambiguation -- no unit-suffix cycling (MΩ/GΩ/TΩ tap-cycle is Story 5.5's Measurement field, out of scope).
- **Route uses `blockId`, not TAG** (the mock's `data-go="#/ficha/{tag}"` is illustrative prototype routing; every other real route in this app keys off ids, which survive a TAG rename) -- an accepted, documented deviation from the mock's literal href.
- **OPEN QUESTIONS (do not resolve beyond the conservative reading, list in the PR body):** (1) the humidity-threshold constant for the "Observações rápidas" rain note if none already exists in `packages/domain/src/checks/`; (2) the exact equipment-row `onOpen` case name in `sumario-row.tsx`'s row-kind union (grep it, do not guess a shape that does not exist); (3) whether "Igual à ⟨TAG⟩?" and "Copiar da última visita" ever both apply to the same empty group (AC implies both chips can show; if so, order them "Igual à" first, most-specific-match first, and say so in the PR body).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit -- sheet-progress nameplate-copy pt-br-number apply.test.ts` -- expected: new + existing kernel tests green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/ficha.spec.ts --grep @p0` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: green, full output pasted in the PR body (final run of the batch).

**Manual checks (if no CLI):**
- Playwright MCP pass at 390/768/1280 px on the ficha route plus one dialog (TagDialog), per AGENTS.md's mock-selector convention, only if a new `.frame-*` rule actually appears (investigation found none expected).
