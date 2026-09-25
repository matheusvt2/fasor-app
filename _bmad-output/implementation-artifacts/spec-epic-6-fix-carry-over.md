---
title: 'Epic 6 carry-over: refactors, gate cost, sheet on touch and the Epic 5 kernel leftovers'
type: 'refactor'
created: '2026-09-25'
status: 'in-review'
baseline_revision: '130eaa27dd5caa631873cae07ec10ca8694cea40'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Carry-over retro items from Epics 3, 4, 5 and 12 share the relatorio, templates and sheet surfaces and the e2e gate; one branch saves tokens (Epic 6 token economy) and lands them beside the Epic 6 story batches.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Retro action items left open across Epics 3-5 and 12 (E3-A4, E3-A9, E4-A7 with E5-A5, E5-A2, E5-A4, E12-R2): oversized surface files and duplicated focus helpers, op paths composed as strings in `apps/web`, a kernel that ignores `criterion_override` and prints a confirmed conclusion text after the result was cleared, a confirm that can store a stale basis, no touch/durability coverage of the sheet, a slow jsdom/axe unit suite with the 3.6-E2E-001 flake, a lost-tap spec that can pass without the fix it guards, and small Epic 3 polish.

**Approach:** In this order: (1) behavior-preserving refactors with the existing tests unchanged and green; (2) kernel fixes with unit tests; (3) the sheet durability specs and the deterministic 12.1-E2E-007; (4) E3-A9 polish; (5) the unit-suite cost cut, reporting `pnpm test:unit` duration before and after.

## Boundaries & Constraints

**Always:** AD-1/AD-13: statuses, verdicts, counts, derived text and op paths come from `packages/domain`; `apps/web` renders from Dexie and writes ops only; `applyOp` stays the only reducer. New pt-BR strings follow the three homes in AGENTS.md (`// authored:` when no mock gives them). Refactor steps change no rendered DOM, class, label, focus order or op: every existing unit and e2e test passes unchanged (only import paths may change in tests). Everything runs in Docker (`docker compose --profile tools run --rm tools ...`), iterating with the narrowest suite. Close each resolved `deferred-work.md` entry (`state: closed (2026-09-25, spec-epic-6-fix-carry-over.md: ...)`). No emoji; code and comments in English.

**Never:** Do not touch `apps/web/src/surfaces/ficha/sticky-action-bar.tsx`, `apps/web/src/surfaces/ficha/checklist-section.tsx`, the uploader (`apps/web/src/sync/engine.ts`, `sync/policy.ts`), the file stores (`apps/web/src/db/file-store.ts`, `db/file-commit.ts`), `components/upload-tile.tsx`, `apps/api/src/http/files.ts`, `apps/api/src/storage/variants.ts` (parallel batch P1, Stories 6.1/6.2). If a refactor needs them, leave it and list it in the Auto Run Result. No new op family, no `CONTRACT_VERSION` bump, no seed version. No UI that writes `criterion_override`. Do not render section 8 or build `derivedPoints` (Story 6.6 / Epic 7). Do not edit `sprint-status.yaml` or `epics.md`. Do not decide open product questions: keep current behavior and list them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Override applied | sheet `test.{key}.criterion_override.value = {raw:'1000', unit:'MΩ'}` on insulation (seed `>400 MΩ`) | verdicts, out-helper text, caption `criterionText` and conclusion criteria use `>1000 MΩ`; operator, type and source stay the seed's | none |
| Override malformed | value not `{raw: decimal string, unit}`, or unit not convertible to the seed unit | seed criterion used, as today | no throw |
| Result cleared | text confirmed, then `conclusion/result` put to null (or restriction null) | `conclusionTextForPrint` returns null | none |
| Stale confirm | composed basis at render B1; block changed so the fresh basis is B2 when the confirm edit runs | no text/text_status/text_basis written; the field shows the recomposed text to confirm again | none |
| Fresh confirm | fresh basis equals render basis | batch written as today (text, text_status, text_basis, suggested observation) | none |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/relatorio/setup-surface.tsx` (957 lines) -- `SetupContent` l.101, `Etapa1Capa` l.251 ... `Etapa5Local` l.720, field hooks `useTextField`/`useDateField`/`useServicePeriod`/`exclusionsKey` l.865-957; hand-built `relatorio/setup/${field}` l.142 and `cover_photo_file_id` l.297.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx` -- `Sumario` l.92 holds row actions (`insertBelow` l.169, remove/restore/undo l.250-330); pattern to follow: `tree-actions.ts`.
- `apps/web/src/surfaces/templates/use-reorder.ts:86` `restoreFocus` (focus only when lost, `once`), `apps/web/src/surfaces/relatorio/relatorio-focus.ts` `focusWhenRendered` (focus whatever holds it, wait for no `.dialog-scrim`) and `focusAfterRemoval`; a third `focusAfterRemoval` in `templates/template-composer.tsx:101`. Callers: `templates-surface.tsx:90`, `skeleton-list.tsx:120`, `tree-actions.ts:308`, `sumario-surface.tsx:264`.
- `packages/domain/src/relatorio/sumario.ts:310-460` -- project/new-relatorio helpers (`relatorioTitle` ... `newRelatorioSubject`); `index.ts:43` re-exports.
- `packages/domain/src/ops/path.ts` -- `OpPath` union, `formatPath` l.372; field lists l.34-50. Spine client family list: `ARCHITECTURE-SPINE.md:72`. Existing builders: `packages/domain/src/relatorio/ops.ts` (`putRelatorioStatusOp`, `putBlockOp`).
- Hand-built paths in web (grep `` `(registry|template|project|relatorio|location|block|equipment|sheet)/${ ``): `ficha/ficha-ops.ts`, `relatorio/relatorio-ops.ts`, `templates/template-ops.ts`, `registries/{client-panel,instrument-panel,word-registry-panel,empresa-tab}.tsx`, `home/new-project-dialog.tsx`, `fixtures/field-fixture-surface.tsx`, `setup-surface.tsx`. Leave `db/file-commit.ts`, `db/file-store.ts` (P1); `db/sync-store.ts` path queries may use the builders.
- `packages/domain/src/relatorio/readings.ts:240` `criterionOf`, `evaluateTest` l.444, `outHelperText`; `seed/criteria.ts` `CriterionSeed`, `formatCriterionValue`; `compareCriterion` (unit handling); sheet `test.{key}.criterion_override` in `schemas/entities.ts:322`.
- `packages/domain/src/relatorio/conclusion.ts:310` `conclusionTextForPrint`; `composeConclusion` l.223 (basis l.270); pair completeness as `relatorio/progress.ts` judges it.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx:221` `confirmText` uses render-time `composed.basis`; `api.edit((blocks, by) => ...)` gives fresh rows.
- `e2e/lost-taps.durability.spec.ts:264` 12.1-E2E-007, helpers `e2e/support/taps.ts` (`touchPressAcross`, `humanTap`), `signInForDurability`, `relatorio-seed.ts`; hold in `apps/web/src/input/press-hold.ts:136`, used at `ficha-surface.tsx:100`.
- `playwright.config.ts` -- durability projects match `/durability\.spec\.ts/`; android = Galaxy Tab S4 landscape (touch).
- Sheet targets for E5-A2: tri-state rows (`components/tri-state-control.tsx`), `.unit-suffix-row` M/G/T chips (`ficha/measurement-field.tsx:173`, insulation, shown while focused), sticky bar unsticks below 480 px height (UX-DR16), Não ensaiado (`relatorio/not-tested-dialog.tsx`, `ficha/sheet-read-only.tsx`).
- `e2e/ficha.spec.ts:1190` E5-Q18 block; (e) Sumário "não ensaiadas" count, (f) "Salvo" throttle `SAVED_THROTTLE_MS` `ficha-surface.tsx:79`.
- E3-A9: `templates/type-defaults-dialog.tsx:91` `.toggle-sub`; mock `prototype/screens/42-template-composer.html:320-325` (lines "9 campos · ...", "14 itens C · NC · NA", "T1/T2 · T3/T4 · T5/T6 × Massa · 10 kV · >400 MΩ (aceitável na ficha)"); composer card mock l.281 (`li.block-card` opens `#tc-dlg-rich`, `.block-sub` "... · toque para editar o texto"); composer rename dialog `template-composer.tsx:548` (tree's `copy.sumario.tagDialogs.emptyName` 'Informe o nome' is the precedent).
- Real names in non-fixture tests: `grep -rln -i 'porto seguro\|Torres A e B' apps packages e2e` minus files that load `packages/domain/fixtures/porto-seguro/` (those keep the data by the 2026-09-21 decision).
- Unit suite: `apps/web/vite.config.ts:96` (`environment: 'jsdom'` for all 89 files), `apps/web/src/test-setup.ts`, `components/gallery.test.tsx` (axe), `templates/section-text-editor.test.ts`; flaky `e2e/templates.spec.ts:711` 3.6-E2E-001.

## Tasks & Acceptance

**Execution:**
1. Refactors (no behavior change):
- `apps/web/src/surfaces/relatorio/setup/` (new: one file per Etapa + `setup-fields.ts` hooks) -- split `setup-surface.tsx`, which keeps `SetupSurface`/`SetupContent` -- E4-A7(1,8).
- `apps/web/src/surfaces/relatorio/sumario-actions.ts` (new) -- move the Sumário row actions (insert below, remove, restore, undo, focus routing) out of `Sumario` like `tree-actions.ts` -- E4-A7(2).
- `apps/web/src/input/focus-restore.ts` (new) -- one helper covering both semantics (options for "only when lost" vs "whatever holds it, after dialogs close", `frames`, `once`) plus one `focusAfterRemoval`; replace the three copies and update callers -- E4-A7(6).
- `packages/domain/src/relatorio/project.ts` (new) -- move the Story 4.1 project/new-relatorio helpers out of `sumario.ts`, re-export from `index.ts` -- E4-A7(4).
- `packages/domain/src/ops/path.ts` -- typed path builders for every client family the web writes (built with `formatPath`, unit-tested round trip through `parsePath`), including `file/*` for P1 to adopt; replace every hand-built path in the files listed in the Code Map (not the P1 files) -- E5-A5/G-3.
2. Kernel:
- `packages/domain/src/relatorio/readings.ts` -- effective criterion = seed with the override's value/unit when well formed and unit-convertible; used everywhere the criterion is read -- E5-A4.
- `packages/domain/src/relatorio/conclusion.ts` -- `conclusionTextForPrint` null when the pair is incomplete; a kernel predicate for "the composed basis still matches" -- E5-A4.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx` -- confirm recomposes from the fresh block inside `edit` and writes nothing when the basis changed -- E5-A4.
- `packages/domain/src/**/*.test.ts` -- cover the matrix rows.
3. E2E:
- `e2e/ficha.durability.spec.ts` (new) -- sheet on touch in the durability projects: tri-state taps (set, change, clear), the M/G/T unit chip row by tap at phone width, the sticky bar and focused field with the viewport shrunk as by an on-screen keyboard (below and above 480 px), Não ensaiado by tap then the sheet read-only after reload -- E5-A2.
- `e2e/lost-taps.durability.spec.ts` -- make 12.1-E2E-007 fail on every run without `useHeldWhilePressed` (e.g. several timings/iterations inside the test) while passing with it -- E12-R2.
- `e2e/ficha.spec.ts` -- E5-Q18 (e) the Sumário "não ensaiadas" count and (f) "Salvo" announced at most once per throttle window -- E5-A4.
4. E3-A9 polish:
- kernel text for the `.toggle-sub` lines per sub-block (nameplate field count, checklist "N itens C · NC · NA", tests rows × columns · voltage · criterion (source)), rendered in `type-defaults-dialog.tsx`; omit the out-of-slice "Ler placa da foto" part.
- composer rename: blank name shows an inline error and keeps the dialog open.
- composer section card: tapping the card body opens "Editar texto" for sections that carry text (mock l.281); Overflow item stays.
- synthetic names ("Seguradora Exemplo S.A.", etc.) in the non-fixture test files.
- section 8 merged bullet 4: not buildable (no section 8 renderer); add a `deferred-work.md` entry owned by Story 6.6/Epic 7.
5. Gate cost (E3-A4):
- measure `pnpm test:unit` wall time before any change to the suite; then run pure-logic web tests outside jsdom and cut axe cost (e.g. one axe run per component state, scoped rules) without losing coverage; stabilize 3.6-E2E-001 by waiting on committed state; report before/after.

**Acceptance Criteria:**
- Given the refactor commits, when `pnpm verify` runs, then every pre-existing test passes with no assertion changed; `setup-surface.tsx` is under 300 lines and `sumario-surface.tsx` shorter than today.
- Given `grep` for template-literal op paths in `apps/web/src` (excluding P1 files and tests), when run, then no hand-built path remains.
- Given the durability projects, when `pnpm test:e2e:matrix` runs the new sheet specs, then they pass on desktop chrome, android chrome emulation and webkit (touch-only steps skip on projects without touch, with a reason).
- Given `useHeldWhilePressed` replaced by identity locally, when 12.1-E2E-007 runs alone 3 times, then it fails 3 of 3; restored, it passes 3 of 3.
- Given the templates composer, when a section card body is tapped, then the text dialog opens with focus in the text; when a rename is saved blank, then "Informe o nome" shows and the name is unchanged.
- Given the unit suite, when the cut lands, then `pnpm test:unit` wall time drops and the before/after numbers are in the Auto Run Result.

## Design Notes

Open questions (keep conservative, list in PR): the `criterion_override` value shape (`{raw, unit}` of the AR-10 number kind, operator kept) since no document fixes it; whether a cleared restriction alone also makes the text unprintable (follow the kernel's own pair-completeness rule).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green, duration recorded before and after
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/ficha.durability.spec.ts e2e/lost-taps.durability.spec.ts --project durability-desktop-chrome --project durability-android-chrome --project durability-webkit` -- green
- `docker compose --profile tools run --rm tools pnpm verify` -- green (redirect to a log, read the tail)
