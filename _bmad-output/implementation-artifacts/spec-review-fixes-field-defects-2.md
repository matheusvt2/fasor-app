---
title: 'Review fixes 2026-10-06, batch 2: field defects'
type: 'bugfix'
created: '2026-10-06'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_revision: 'b5b35c547d992bf1f9d0815fe3fedbceb37092cc'
dev_model: opus
dev_effort: high
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Matheus chose three PRs for the 2026-10-06 review batch on 2026-10-06; this is the second (field defects), after Story 11.11 (PR #98).'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/mvp-review-2026-10-06/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The MVP hands-on review of 2026-10-06 found field defects the engineer meets every day: a setup value typed and left is lost (F-02), a relatório with 93 empty sheets issues in one tap and prints placeholders (F-03, F-04), section 8 glues the photo reference and the action (F-05), setup shows an empty "Empresa executora" with no pointer (F-08), a new company has no voltage classes so every plate starts with "Criar" (F-09), "Concluir ficha" leaves the sheet before its toast (F-12), queued wording while online (F-13), a Sync page that contradicts itself (F-14), Cadastros opening on the third tab (F-20), "0 fotos" read as a total (F-21), an instrument picker ignoring the setup and the test (F-27), two dialogs titled "Novo relatório" in a row (F-28).

**Approach:** Fix each in place, test first (unit for kernel and component rules, Playwright as a human for what a human sees), keeping derived text in the kernel and copy in `pt-br.ts`; the four product choices below are decided by Matheus and recorded here.

## Boundaries & Constraints

**Always:** test first, see it fail, then fix; `@p0` specs assert the committed state (outbox or store), not only the screen; status, count and derived text in `packages/domain`, static copy in `copy/pt-br.ts` (`// authored:` when not from a mock), chrome in `copy/ui.ts`; no emoji; `tokens.css`/`components.css` byte-identical; tools only in the `tools` container (podman on this host); every e2e that encodes the old behaviour is updated, never deleted; goldens regenerated in the container and the diff named in the PR.

**Never:** change `CONTRACT_VERSION` or an op path; add optimistic sheet state that bypasses IndexedDB (AD-13); touch Story 11.11's files beyond what a task names; change the merge, sync engine or api routes except where a task names them; move session or security behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| F-02 blur | setup Etapa 5, type 760 in Altitude, tap Justificativa | `relatorio/setup/site_altitude_m = 760` in the outbox (confirmed as the typed value); reload shows 760 | non-numeric text keeps the field editable, nothing written |
| F-02 Concluir | type 760, tap "Concluir dados do relatório" | the altitude op lands before the status op; the sheet shows "760 m · Do setup do relatório" | - |
| F-02 Confirmar | type 760, tap the field's "Confirmar" | exactly one altitude write | - |
| F-03 issue with empty sheets | 94 blocks, 1 concluded, "Gerar relatório" | D1 (Matheus, 2026-10-06): the rule stays (only the parecer blocks); the dialog asks for a confirmation that names the counts ("Emitir com 93 fichas vazias e 2 campos em branco?", authored) with Pré-visualizar offered first, and only then issues; the Sumário and the dialog carry a new info row "93 fichas vazias" (kernel count of `sheetState === 'vazia'`); no confirmation when both counts are zero | the confirmation's "Voltar" issues nothing |
| F-04 empty optional field | `additional_info` empty | D1: the cover row "Informações adicionais" is omitted when empty (no `[Informações adicionais]`); `[Empresa executora]` stays as the printed placeholder of a required field and counts in the confirmation | - |
| F-05 bullet | point text "… etc. [[foto:id]]" and action "Instalar placas…" | bullet "… etc., conforme Imagem 1. Instalar placas…" (token = "conforme Imagem N" unless the text already says "conforme" before it; a period and a space between text and action when the text has no terminal punctuation); the table unchanged | a removed photo's token prints nothing, as today |
| F-08 hint | company not registered | under the "Empresa executora" box: the export dialog's sentence with a link to Cadastros › Empresa; gone once registered | - |
| F-09 seed | a company that receives the standard template | D4 (Matheus, 2026-10-06): 13,8 · 15 · 24,2 · 36,2 kV exist as `registry/voltage_class` rows (names stored as the kV numbers), seeded in the same server batch as the template; no manufacturer | a company that already has any voltage class gets none |
| F-12 | sheet complete, primary pressed | D2 (Matheus, 2026-10-06): the jump stays; the primary reads "Concluir e avançar" (authored) and the toast "Ficha concluída" shows on the next sheet as today; the menu item stays "Concluir ficha" with the same effect; EXPERIENCE.md :273 gets the dated note | - |
| F-13 online | plate shot or display shot while online and the server reachable | "Lendo…" line and a toast that does not speak of a queue; offline: the queued wording as today | - |
| F-14 headline | a background cycle runs with nothing pending | the headline and the button never disagree: both read one state (running: "Sincronizando…" as the word and the reason; idle: "Sincronizado", button enabled) | - |
| F-14 device word | this device's own last push row | "Este aparelho", on every load; nothing is drawn as "Outro aparelho" while the device id is still unknown | - |
| F-20 | `/cadastros` with the company not registered and no remembered tab | opens on Empresa; once registered, the remembered tab, else Instrumentos as today | arrival state still wins |
| F-21 | 2 relatórios, 4 photos on the device, none awaiting | "5,0 MB · 2 relatórios · 4 fotos neste aparelho" (the originals kept on the device), and a second line only when some await upload | - |
| F-27 | setup ticked 1T, 2E; test isolação; registry 1T, 2E, 3M | order: fitting and ticked (2E), fitting (none), ticked (1T), the rest (3M); the last-used rule keeps its "Sugerido" pill on top of this order | - |
| F-28 | Home "Novo relatório" | D3 (Matheus, 2026-10-06): two steps stay; the second dialog is titled "Novo relatório — tipo e datas" (authored) and opens at once on the Obra page, which keeps listing the obra's relatórios | - |

</frozen-after-approval>

## Code Map

- F-02: `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx:33,67-76,117-135` plain `<input type=number>` with local state and `onConfirmAltitude`; reuse `useNumberInput` (`components/number-input.tsx:76`, blur/Enter/500 ms idle, draft) and `useFlushOnUnmount` (`ficha/ficha-fields.tsx:117-128`); `setup/setup-fields.ts:23-69` (`useTextField`, `useDateField` on `useFieldCommit`, the "Concluir then navigate" note at :62-66); `input/use-field-commit.ts:124-126` drops a pending value on unmount; `setup-surface.tsx:185-201` `onComplete` writes the status op then navigates. Tests `setup-surface.test.tsx:385-509`, e2e `relatorio.spec.ts:526` (altitude :602-620 presses Confirmar).
- F-03: `packages/domain/src/relatorio/pre-issue.ts:33-42` (only `parecer_missing` blocks), kinds :49-74, `sheets` row :306-308, `exportPrecheck` :463-468; `sumario.ts:345-358` `generateReason`; `sheet-state.ts:88-97` `sheetState() === 'vazia'`; `progress.ts:14-56`; `apps/web/src/surfaces/export/export-dialog.tsx:176-220,372-385` (buttons, count line, `copy.export.countMeta` pt-br :489); api `http/generate.ts:342-350` `pre_issue_blocked`. Tests `pre-issue.test.ts:27-43,70`, `pre-issue-export.test.ts:67-87,256`, `sumario.test.ts:273`, `fixtures/porto-seguro/pre-issue.golden.json`, `export-dialog.test.tsx:867`, e2e `parecer-export.spec.ts:131,168,176`, `export.spec.ts:55,196,310`, `relatorio.spec.ts:289`.
- F-04: `templates/section-text.ts:139-157` `[Label]` fallback, labels :16-25; `relatorio/section-variables.ts:33-46`; `print/layout.ts:160-210` (rule :190-195); `seed/sections-v1.ts:39,243`; api `docx.ts:306-318`. Tests `layout.test.ts:50,133,137,192`, `section-text.test.ts:91-103`, golden `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json:33` (`docx.test.ts`).
- F-05: `print/section-8.ts:71-79` `resolvePhotoTokens`, :104-110 the join; `photos/numbering.ts:30` `photoRefLabel`; `points/refs.ts`; api `sections/section-8.ts:66-69`. Tests `section-8.test.ts:72-82,163,210`, `docx.test.ts:351-355`, e2e `points.spec.ts:169-193`.
- F-08: `setup/etapa2-escopo.tsx:118-121`; reuse `copy.export.empresaMissing` (pt-br :495) and `empresaRegistered` (`registry/empresa.ts:60`); link pattern `setup/etapa4-instrumentos.tsx:110-124` (`navigate('/cadastros', {state:{tab}})`).
- F-09: `apps/api/src/db/seed.ts:255-298` `seedStandardTemplate` (one server op, `provisioningOp`, idempotent under the company lock); kinds `schemas/entities.ts:175-176`, `registry/word-row.ts:25-38` (name stored as the kV number); new kernel constant beside `seed/template.ts:200` and `seed/criteria.ts:43`; `components/registry-picker-field.tsx:81,126` empty list. Tests `standard-template.integration.test.ts:117`, e2e `cadastros.spec.ts:500` (counts voltage_class ops), `tap-budget.spec.ts:146`, `tap-budget-signal.spec.ts:112`, `sheet-knows-12-3-12-4.spec.ts:54` (type "15" and count the "Criar" tap).
- F-12: `ficha/use-ficha-actions.ts:116-119,130-163,166-181`; copy pt-br :949-954,985; EXPERIENCE.md :273,523; e2e `ficha.spec.ts:365,780`, `lost-taps.durability.spec.ts:241`, `journey-taps.spec.ts:133`, `tap-budget.spec.ts:118`, `tap-budget-signal.spec.ts:209`, `journeys-12-3-12-4.spec.ts:96`, `sheet-knows-12-3-12-4.spec.ts:186,407`, `journey-forward.spec.ts:181`, `sync-status.spec.ts:81`.
- F-13: `ficha/read-display.tsx:228-243` already branches on `online`; `ficha/plate-photo.tsx:77-83` does not (online read at :138); `camera-view.tsx:245-258` `copy.photos.doneToast`/`doneOneToast` (pt-br :746-748); connection = `useSync().online && unreachable === null` (`state/sync.tsx:79,86`). Tests `plate-photo.test.tsx:72-86`, e2e `photos.spec.ts:81`, `review-field-defects.spec.ts:436`.
- F-14: `surfaces/sync/sync-status-surface.tsx:27-32,66-92` (headline from `syncBadgeLabel`/`syncHeadlineText`, button reason from `sync.running`); `sync-sections.tsx:205-236` `mine = push.device_id === sync.deviceId` with `deviceId` null until `state/sync.tsx:268` resolves; kernel `sync/status.ts:54-61`. Tests `sync-status-surface.test.tsx:67-108`, e2e `sync-status.spec.ts:209-232`, `sync.spec.ts:55-96`.
- F-20: `registries/registries-surface.tsx:17,37-45,65,78-96`; tests `registries-surface.test.tsx:118-164`, e2e `cadastros.spec.ts:133-144,175-231`, `files.spec.ts:75`.
- F-21: `packages/domain/src/device/storage.ts:37-60` `storageLine`; `account-surface.tsx:70,141`; `db/home-store.ts:344` `originalFileCount`; tests `storage.test.ts:34-50`, `account-surface.test.tsx:170`.
- F-27: `relatorio/instrument-pick.ts:120-182` (`instrumentPickerOrder`); `ficha/instrument-picker.tsx:69-74`; `ensaios-section.tsx:183` (no snapshot passed); `setup.instrument_ids` (`schemas/snapshot.ts:137`); fit = non-null `test_<testKey>` (`entities.ts:155-174`). Tests `instrument-pick.test.ts:94-107`, e2e `sheet-knows-12-3-12-4.spec.ts:186-239`.
- F-28: `home/new-project-dialog.tsx:28-32,151-155`; `project/project-surface.tsx:67-79,201`; `project/new-relatorio-dialog.tsx:34-41,92-115`; `e2e/support/relatorio-flow.ts:21,43`; e2e `relatorio.spec.ts:108,172,222`, `journey-forward.spec.ts:230`, `app-layout.spec.ts:33`, `home.spec.ts:185`.
- e2e pattern: `e2e/review-field-defects.spec.ts` (setUp, resetEmpresaB, pushDrafts, flat `@pN F-NN` titles); `SERIAL_SPECS` in `e2e/support/groups.ts` (a spec that issues documents goes there with a `why`).

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx` + `setup-surface.test.tsx` -- the altitude through `useNumberInput` + `useFlushOnUnmount` (blur, Enter, idle and unmount commit the typed value; "Confirmar" keeps writing `site_altitude_confirmed` in one batch; no double write); a test per matrix row.
- [ ] `packages/domain/src/relatorio/pre-issue.ts` (+ `progress.ts`, `sumario.ts`, tests, `pre-issue.golden.json`) and `apps/web/src/surfaces/export/export-dialog.tsx` (+ test, pt-br) -- per D1.
- [ ] `packages/domain/src/print/layout.ts`, `templates/section-text.ts` (+ tests, api skeleton golden) -- per D1's cover rule.
- [ ] `packages/domain/src/print/section-8.ts` + `section-8.test.ts` + `apps/api/.../docx.test.ts` -- the token as "conforme Imagem N" (not doubled) and the sentence boundary before the action.
- [ ] `apps/web/src/surfaces/relatorio/setup/etapa2-escopo.tsx` + test -- the hint and link under the empty box.
- [ ] `packages/domain/src/seed/voltage-classes.ts` (new, exported) + `apps/api/src/db/seed.ts` (+ integration test) -- per D4, seeded with the standard template in the same batch, idempotent; `components/registry-picker-field.tsx` -- the authored empty-list hint; update `cadastros.spec.ts:500` and the three "Criar 15" specs.
- [ ] `apps/web/src/surfaces/ficha/use-ficha-actions.ts` + pt-br + EXPERIENCE.md (dated note) + the listed e2e -- per D2.
- [ ] `apps/web/src/surfaces/ficha/plate-photo.tsx`, `camera-view.tsx`, pt-br (+ tests) -- online wording ("Lendo…", toast without the queue) when `online && unreachable === null`.
- [ ] `apps/web/src/surfaces/sync/sync-status-surface.tsx`, `sync-sections.tsx` (+ tests, kernel `sync/status.ts` if a word is needed) -- one state for headline and button; no device word until the id resolves.
- [ ] `apps/web/src/surfaces/registries/registries-surface.tsx` (+ test, `cadastros.spec.ts`) -- Empresa first until registered.
- [ ] `packages/domain/src/device/storage.ts` (+ test) and `account-surface.tsx` -- "N fotos neste aparelho" and the awaiting line.
- [ ] `packages/domain/src/relatorio/instrument-pick.ts` (+ test), `ficha/instrument-picker.tsx`, `ensaios-section.tsx` -- order by fit and setup, then last used, then code; pass `setup.instrument_ids`.
- [ ] `apps/web/src/surfaces/home/new-project-dialog.tsx`, `project/*` (+ tests, `relatorio-flow.ts`, listed specs) -- per D3.
- [ ] `e2e/review-field-defects-2.spec.ts` (new, `SERIAL_SPECS` if it issues) -- one `@p0` per high/medium finding (F-02, F-03, F-05, F-09, F-12, F-14) asserting store or document, `@p1` for the rest; `docs/kbs/log.md` one line.

**Acceptance Criteria:**
- Given setup Etapa 5, when 760 is typed and the user taps another field or "Concluir dados do relatório", then the altitude is in the outbox and the sheet shows it (F-02).
- Given 93 empty sheets, when "Gerar relatório" is pressed, then the behaviour of D1 holds and the Sumário names "93 fichas vazias" (F-03).
- Given a point with a photo token and an action, when revision 1 is generated, then the section 8 bullet reads "…, conforme Imagem 1. <ação>" in the DOCX structure (F-05).
- Given a company seeded with the standard template, when a plate's "Tensão de placa" list opens, then the D4 classes are offered without typing (F-09).
- Given a complete sheet, when the primary is pressed, then D2 holds and the toast is read on the sheet it names (F-12).
- Given the camera online, when a plate or display is shot, then no queued wording appears (F-13).
- Given the Sync page during a cycle with nothing pending, then the headline and the button agree, and the device's own row says "Este aparelho" on every load (F-14).
- Given the remaining findings (F-08, F-20, F-21, F-27, F-28), then each matrix row holds on screen and in the store.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Decided here (user-invisible or minor): F-20 opens on Empresa only while `empresaRegistered` is false and no arrival state exists; afterwards the remembered tab or Instrumentos, so Story 2.1's e2e keeps its default once the company is registered. F-21 counts the originals kept on the device (what `originalFileCount` already counts) and adds "N aguardando envio" only when the outbox holds photos. F-27 keeps the last-used "Sugerido" pill; the order is a kernel rule with a test. F-13 toasts: authored, online variant "Fotos salvas — enviando" / "Foto salva — enviando". F-14: the headline word comes from the kernel (`syncBadgeLabel`); if a "syncing" state is missing there, add it rather than branching in the surface.

## Verification

**Commands:**
- `podman compose --profile tools run --rm tools pnpm test:unit -- packages/domain apps/web/src/surfaces/relatorio apps/web/src/surfaces/export apps/web/src/surfaces/ficha apps/web/src/surfaces/sync apps/web/src/surfaces/registries apps/web/src/surfaces/account apps/web/src/surfaces/home apps/web/src/surfaces/project` -- green.
- `podman compose --profile tools run --rm tools pnpm test:api -- generate docx seed` -- green (the seed CLI test needs `/.dockerenv`, absent under podman: pre-existing).
- `podman compose --profile tools run --rm tools pnpm test:e2e -- e2e/review-field-defects-2.spec.ts` plus every spec a task lists -- green, all tags.
- The gate stage by stage in the `tools` container (the orchestrator), output pasted in the PR; hands-on pass in the Playwright MCP browser at 390, 768 and 1280.
