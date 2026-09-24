# Independent review: PR #25, Stories 4.1 and 4.3 (Epic 4 batch A)

- Branch: `story/4-1-4-3-project-relatorio-and-sumario`; head reviewed: `394fe69cbb94cb684c789358122f72cbaa2add6f` (three commits over `origin/main` `9603635`: the story, the build workflow's review-layer patches, the orchestrator's later fixes; the patches were re-read as part of the diff, not only the original).
- Reviewer: independent (worktree `agent-a11eaae8db3738210`, compose project `fasor-e4a`). No source file edited; this file is the only write.
- Date: 2026-09-24.

## What I ran (all in the `tools` container of `fasor-e4a`)

| Command | Result |
|---|---|
| `pnpm --filter @app/domain exec vitest run src/relatorio src/ops/order-key.test.ts src/ops/apply.test.ts src/format/datetime.test.ts src/templates/list.test.ts src/schemas/entities.test.ts src/ops/path.test.ts` | 13 files, 204 tests, green |
| `pnpm --filter @app/web exec vitest run src/surfaces/relatorio src/surfaces/project src/surfaces/home src/components/date-field.test.tsx src/db/home-store.test.ts src/db/prefs.test.ts src/surfaces/templates src/styles` | 15 files, 172 tests, green |
| `pnpm test:api` | 17 files, 106 tests, green (includes `relatorio-creation.integration.test.ts`) |
| `pnpm exec playwright test e2e/relatorio.spec.ts e2e/home.spec.ts --project=desktop-chrome` | 7 passed (4.1-E2E-001/002, 4.3-E2E-001 `@p0`; 4.3-E2E-002, 1.6-E2E-001/002/003 `@p1`) |
| `pnpm exec playwright test e2e/durability.spec.ts --project=durability-android-chrome --grep 4.3-E2E-003` | 1 passed |
| Throwaway Playwright script (`.playwright-mcp/review-a/review-run.mjs`, gitignored, forwarder `localhost:14073 -> web:5173`, Empresa A with unique names) | see F-1; 12 of 13 checks passed, the failing one is the defect below |
| Direct API probes (`fetch` with a session cookie and `x-contract-version: 2`), `psql` on the compose Postgres | evidence for F-1 |
| Screenshots `reviews/qa-epic-4-A/01-24` compared with `30-project.html` and `40-relatorio-overview.html` | see mock parity below |

Greps over the whole diff: no emoji, no `laudo`; no client name, CNPJ or address outside the fixture (the substation location names in `instantiate.test.ts`, `tag.test.ts` and the comment in `tag.ts` are the seed template's own skeleton names already on `main` in `packages/domain/src/seed/template.ts`, and the QA screenshots show only synthetic names). Planning documents untouched by the PR (`git diff --stat -- _bmad-output/planning-artifacts/` empty). Worktree clean before and after the runs.

## Findings

### F-1 (must-fix) A row moved to the first slot makes the relatório undownloadable on every other device, silently

- Where it is reached: `packages/domain/src/ops/order-key.ts:385-391` (`orderKeyBetween(null, 'a0')` returns `'4'`, a digit-only key; the next one below is `'1'`), through `orderKeyForMove` for `toIndex 0`, which every path of Story 4.3 uses: Position box "1" or "0", Overflow "Subir" on row 2, Alt+ArrowUp on row 2.
- Root cause: `apps/api/src/sync/pull.ts:49` reads `ops` through drizzle and returns `value: row.value` (`pull.ts:34`). drizzle's `jsonb` column re-parses any string the driver hands it (`node_modules/.pnpm/drizzle-orm@0.45.2_*/node_modules/drizzle-orm/pg-core/columns/jsonb.js:24-33`: `if (typeof value === 'string') try { return JSON.parse(value) }`), while postgres-js has already decoded the jsonb. So every op whose string value is itself valid JSON text comes back type-changed. Postgres holds it correctly (`psql`: seq 26812 `value = "4"`, `jsonb_typeof = string`; the server's own `entities` row keeps `order_key 'a1'` as a string), so the corruption is on the read path only.
- Evidence: `GET /api/sync/relatorios/01a0d173-de95-71a6-a0c7-fc94423f5b04?since=0` returned the three puts of my run as `{"value":"n"}`, `{"value":4}`, `{"value":"a1"}` (the middle one is a JSON number). A direct probe pushing four `relatorio/setup/*` puts and pulling them back returned `"2026"` as `2026` (number), `"true"` as `true` (boolean), `"null"` as `null`, and `"Sala 12"` intact: the bug is general, not order-key specific. (The probe left those four setup puts on the Empresa A QA relatório `01a0d173-de95-...`; test data only.)
- Consequence in the app (device 2 of my script): Home card "Não está neste aparelho · baixa ao abrir" tapped; the Sumário showed "Baixando o relatório…" for 3.3 s and then "Relatório não encontrado neste aparelho."; `sync_state` for the relatório stayed `cursor_seq: 0, complete: false`; a reload with a fresh engine did not help; the Sync badge read "Sincronizado OK" throughout. Mechanism: the mangled op passes `opSchema` (`parsePulled`, `apps/web/src/sync/policy.ts:91-99`), then `applyPulled` -> `rematerialize` -> `applyOp` `entityRowSchemas[...].parse(written)` (`packages/domain/src/ops/apply.ts:268`) throws on `order_key: 4`, the whole page is dropped (`apps/web/src/sync/engine.ts:317`, `PhaseEnd('stop', {kind: 'apply'})`, cursor untouched), and every later cycle fails the same way. For setup fields the failure mode is worse in a different way: a `"null"` or `"2026"` typed by the user is silently changed on the pulling device instead of refusing the page.
- Why no test caught it: no api or e2e test pushes a string value that is valid JSON text (grep of `apps/api/src/**/*.test.ts` finds none); `4.3-E2E-001` moves rows only between existing keys (`'a0…'` forms); `4.1-E2E-002` syncs before any move; the orchestrator's QA pass also moved rows only within the list.
- Fix I expect before merge (the root is Story 1.5 code, but this PR is the first to put a user's ordinary action on it, so it gates this PR or a coordinated fix merged first): stop the double parse in the api read path (a raw-text jsonb parser on the postgres-js client so drizzle's `JSON.parse` sees the JSON text, or a `customType` that does not re-parse strings), plus an api integration test that pushes `"4"`, `"2026"`, `"true"`, `"null"` as put values and asserts byte-identical pull-back. Defence in depth in the kernel is cheap and worth adding in this PR: make `orderKeyBetween` never mint a key that parses as JSON (keys that always start with a letter, as the fixtures' `a0…` scheme does), with a property test asserting `Number.isNaN(Number(key))` over the random-insertion run in `order-key.test.ts`.

### F-2 (should-fix) An `apply` failure of the pulled stream is invisible and mislabelled

- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:90-100`: once `syncRelatorio` resolves, `state === null` shows `copy.sumario.notFound` ("Relatório não encontrado neste aparelho.") even when the company summary lists the relatório and the pull failed (F-1 path); the Sync badge shows "Sincronizado OK" because `{kind: 'apply'}` is not an unreachable failure. The user has no way to tell "does not exist" from "could not be applied", and no retry short of remounting.
- Suggest: when `sync.lastFailure?.kind === 'apply'` (or when `summaryRelatorios` holds the id) render a different sentence ("Não foi possível baixar o relatório neste aparelho") with a "Tentar de novo" action; belongs with the F-1 test. Not a blocker on its own.

### F-3 (should-fix) Kernel ownership leaks in `apps/web` (AD-2, AGENTS.md "Nothing in `apps/*` derives a status, count, text, order")

- `apps/web/src/surfaces/project/new-relatorio-dialog.tsx:36` `blockTotal` sums `templateTotals` in the surface: a count derived in the web app (feeds the option meta "94 blocos" and the helper). Move to the kernel (`templateBlockTotal(template)` beside `templateTotals`).
- `apps/web/src/surfaces/home/new-project-dialog.tsx:41-47` filters the client's live projects and sorts them by site with `localeCompare`: an order derived in the web app. Move to the kernel (`projectsOfClient(projects, clientId)`).
- `apps/web/src/surfaces/home/new-project-dialog.tsx:104-105` compares obra names `trim().toLocaleLowerCase('pt-BR')` in the web app while the client path uses the kernel's `normalizeRegistryName`: the same rule written twice, once outside the kernel.
- `apps/web/src/surfaces/project/new-relatorio-dialog.tsx:152` repeats the kernel's `end < start` rule of `newRelatorioReason` to set `isInvalid`.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:178,425` decide the status-driven behaviour (`status === 'em_campo'` opens section 9, `status === 'em_revisao'` sets `.is-review`) in the surface; the `isAutoPulled` precedent puts a "which statuses" rule in `packages/domain/src/status/table.ts`.
- All small; none changes behaviour. Batch B will build on the Sumário, so the last one is best moved before it lands.

### F-4 (should-fix) Story 4.3 AC 3 "scrolled to the last sheet" is not implemented and not recorded as a narrowing

- `apps/web/src/surfaces/relatorio/section-9.tsx` marks the cabine `.is-current` with "você parou aqui" and the unit/e2e tests assert the class; nothing scrolls (no `scrollIntoView`/`scrollTo` under `surfaces/relatorio/`). With six cabines and the foot bar this is a one-line `scrollIntoView({block: 'center'})` on the current row (or a recorded narrowing in the spec's Design Notes with the date, since the equipment rows the AC scrolls to are batch B's).

### F-5 (nit) Two removed sections of the same type share one accessible name in "Restaurar ficha removida"

- `packages/domain/src/relatorio/sumario.ts:233-245` names a removed section by its FO.SERV number and title ("2 Definições"), so after Duplicar + two removals both rows read "Restaurar 2 Definições" (`restore-dialog.tsx:37`, `copy.sumario.restoreLabel`). The review-layer patch that added per-row names covers distinct types only. Adding the removal date or an ordinal to the label would do.

### F-6 (nit) Focus after "Desfazer" of a removal is asserted only in the QA script

- `4.3-E2E-001` asserts focus after Remover (`e2e/relatorio.spec.ts:328`), after Restaurar (`:339`) and after Desfazer of a move (`:274`); focus after Desfazer of a removal (`sumario-surface.tsx:362`, target the restored row's Overflow) is exercised only by the orchestrator's throwaway script (screenshot 20). One `toBeFocused()` after the undo of the removal in the e2e or the unit test closes it (E3-A8).

### F-7 (nit) Dangling comment in `apps/web/src/copy/ui.ts:95-96`

- The review-layer patch deleted `ui.dateField.format` and left its comment ("authored: the segments of a date field name themselves…") with no key under it.

### F-8 (note) Narrowings recorded outside the planning documents

- Rows 7 and 9 offer Subir · Descer only, and "Restaurar ficha removida" is a dialog whose empty state is the mock's toast sentence: both are in the spec's Design Notes but not yet struck through in `epics.md` under Story 4.3 (the spec's own `deferred` entry hands it to the coordinator).
- The four header counts all expand section 9 (AC: "each count opening its list") and the mock's recent-templates chip row (`30-project.html` `.chips-recent`) is absent from the dialog: both rejected in the Triage Log with a reason, neither in the Design Notes. EXPERIENCE.md § Component Patterns › Combobox puts chip rows on field surfaces and plain Comboboxes in the office, so the Combobox is defensible; record it.
- `4.1-E2E-002`'s second context signs in as the same user (Empresa B has one seeded user); AR-23 speaks of another device, which a second context is.

### F-9 (note) Observed and fine

- The section 9 chevron drawn as a small corner glyph in screenshots 08/12/22 is the 150 ms rotation caught mid-transition; my script read `transform: none` on the open chevron after settling (screenshot `r1-section-9-open-settled-1280.png`, gitignored).
- Position box edge cases in the browser: "99" clamps to 11 and announces "Seção 2 movida para a posição 11 de 11"; "0" committed by Tab (blur) clamps to 1; an emptied box is a no-op and the number is put back.
- Home dialog opens with the focus on the Cliente combobox; the Project dialog's Tab order is radio > Template input > six date segments > Cancelar > Criar relatório (chevron out of the tab order), as the spec's manual pass reports.
- The spec's flagged risk (a flash of the not-found sentence while a cycle is running) did not reproduce: with every `/api/sync/*` request slowed by 3 s and "Sincronizar agora" running, the Sumário opened from the card showed "Baixando o relatório…" and a MutationObserver over `<main>` saw no not-found text until the pull itself failed for the F-1 reason. The `busy` handling is correct; the download is not.

## Checks with evidence

- Mock parity and copy: every class of `40-relatorio-overview.html`'s Sumário block and `30-project.html` is used verbatim (`.sumario`, `.sum-row`, `.sum-pos-empty`, `.pos-box.sum-pos`, `.sum-open`, `.sum-body`, `.sum-title`, `.sum-status[.is-blocking]`, `.sum-ctrls`, `.sum-ro`, `.has-pend`, `.sum-s9`, `.sum-s9-head`, `.tree-chevron`, `.s9-note`, `.s9-tree`, `.s9-cabine`, `.s9-cab-row/-body/-name/-meta`, `.sum-here`, `.is-current`, `.is-open`, `.is-review`, `.sum-summary`, `.sheet-header/-title/-meta`, `.header-side`, `.sticky-action-bar`, `.btn-reason`, `.bar-buttons`; `.project-head`, `.crumbs`, `.project-meta`, `.relatorio-list-head`, `.relatorio-list`, `.relatorio-row` with `.lr-*`, `.progress-counter`; the dialog's `.form-dialog`, `.field[role=radiogroup]`, `.option-row.is-selected`, `.radio.is-on`, `.grow`, `.lr-meta`, `.type-note`, `.field-pair`, `.dialog-actions`). Page rules copied into `relatorio.css` with the mock named; `.frame-phone/-tablet/-desktop` rules translated in `app.css:182-297,293-306,344-345` with comments; authored rules marked. Copy verbatim: titles, "sempre no início", "montado sozinho", "texto padrão", the Overflow items, the toasts, "Expandir ou recolher a seção 9", the s9 note, the header menu label, "Nenhuma ficha removida para restaurar", "Local (obra)" (`50-relatorio-setup.html:106`), the dialog description, type note and helper. Screenshots 05/08/12 (Sumário at 1280/768/390, light and dark), 13/24 (six columns at 1280, stacked at 390), 04/14/17 (dialog), 16/23 (Home dialog), 20/21 (focus after Remover, Restaurar with two rows) match the mocks.
- 64 px rows: `4.3-E2E-001` asserts `>= 64` on rows 0/2/5/12; the Position box is the row number (`sum-row > input.pos-box.sum-pos`, value = position; unit test asserts `'1'..'11'`).
- Focus after destructive actions: Remover -> the row now in the slot (`sumario-surface.tsx:117-130`, e2e `:328-329`, unit `:261`); Restaurar -> the restored row (`:383`, e2e `:339`, unit `:272`); Desfazer of a move -> the row's Position box (`:334-339`, e2e `:274`, unit `:250`); Desfazer of a removal -> the restored row (`:362`, QA script only, F-6). `use-reorder.ts:92-102,129-141` now ends a watch once its target exists, with the composer's tests still green.
- Keyboard: Position box (typed, Enter, blur), Overflow arrows (Enter opens, Escape returns to the box, e2e `:281`), Alt+ArrowUp/Down (e2e `:287-292`), dialog Tab order (my script). `4.3-E2E-003` types the box by touch on Android emulation.
- a11y: `aria-disabled` + visible reason on every disabled control (`Button` invariant, `button.tsx:23-27`); `aria-describedby` to the foot reason (unit `:191`); `role="status"` announcer and `role="status"` loading notes; `role="group"` summary; `role="radiogroup"/"radio"` per the mock; `aria-expanded`/`aria-controls` on the chevron; `aria-current` on the current cabine; per-row "Restaurar ⟨name⟩" labels; axe clean on the Sumário, the Project surface (both states), the dialogs and the DateField.
- Kernel ownership: every status word, count, meta, title, order (`sortByOrderKey`, `relatoriosOfProject`), reason and verdict rendered comes from `packages/domain` (`sumarioRows`, `preIssue`, `progress`, `generateReason`, `restorableBlocks`, `dateRangeText`, `relatorioSubText`, `newRelatorioReason`, `defaultTemplateFor`, `templateHelperText`). Leaks listed in F-3.
- Copy homes: derived text in the kernel, surface copy in `pt-br.ts` (`project`, `newRelatorio`, `sumario`, `setupStub`, `sectionText`, `home.newProject`) with `// authored:` marks, chrome in `ui.ts` (the `OverflowMenu` `label` prop reuses the existing template); the review-layer patch removed the duplicated `templateMeta`/`responsibleMeta`. Each string has one home (F-7 is a leftover comment, not a string).
- D-4: `path.ts:45-50` drops `version` from `IMMUTABLE_KEYS`; `apply.ts:76,235-241` bumps on `name|blocks|skeleton`; tests `apply.test.ts` "4.1-UNIT D-4" (bump 4 after three puts, archive/restore/remove untouched, explicit put), composer tests updated (`version: 5`, `version: 2`), FR-13 copy-on-create test (`instantiate.test.ts:190-227`).
- Creation batch: 1 + 23 + 11 + 94 + 94 = 223 drafts with one `batch_id` and mixed scopes (`instantiate.test.ts:36-68`; web `new-relatorio-dialog.test.tsx:126-145`; e2e `relatorio.spec.ts:128-137` on the outbox; api `relatorio-creation.integration.test.ts` 224 applied with the project, zero rejected, 94 equipment and 105 blocks materialized). AR-23: the relatório stream returns the 94 project-scope equipment ops with the relatório's 129 ops in seq order and without the project op (`:135-146`); the cross-device e2e `4.1-E2E-002` passes.
- Tracked stubs: `Section9Tree` (owner batch B; cabine rows with `cabineProgress`, no children), `setup-stub-surface.tsx` (`/relatorio/:id/setup?etapa=`, owner batch C), `section-text-surface.tsx` (read-only `resolveSectionText`, owner batch C), `generate-action.tsx` (toast, `reasonId`/`blocked` contract, owner batch D): all four in `deferred-work.md` as `class: stub` with owners; two ledger items closed (`templateUseCount` local rows, FR-13 test) with the tests named.
- Test quality: assertions are concrete (exact titles, positions, op counts, paths, focus targets, accessible descriptions); no weakened test found; the composer tests were tightened for D-4 (`version` asserted) rather than loosened, except `template-composer.test.tsx:359-360` which accepts `expect.any(Number) > 1` for the quantities round trip (acceptable, the count depends on the number of `blocks` puts). `@p0` covers creation online/offline, the two-device pull and the whole Sumário flow; status behaviour is `@p1` with a gated unit test.

## Per-AC table

Story 4.1

| AC | Verdict | Evidence |
|---|---|---|
| 1. Project created from Home ("Novo relatório" › client) emits `project/{id}` (company scope); surface lists relatórios newest first, six desktop columns stacking on phone; empty state text and button | pass | `new-project-dialog.tsx:114-127`, `new-project-dialog.test.tsx:158`; `project-surface.tsx:148-198`, `project-surface.test.tsx:285-323`; e2e `4.1-E2E-001:113-118,139-149`; screenshots 03/13 (1280), 24 (390) |
| 2. Dialog: "Cabine primária" preselected, template defaults to last used, end follows start, "Criar relatório" `aria-disabled` with reason | pass | `new-relatorio-dialog.tsx:59-72,102-104`; kernel `defaultTemplateFor`, `newRelatorioReason` (`sumario.test.ts`); `new-relatorio-dialog.test.tsx:92-124`; e2e `createRelatorio:84-101`; screenshot 04 |
| 3. Client Combobox "Criar “⟨texto⟩”" creates inline, offline, e2e through the mounted dialog | pass | `new-project-dialog.tsx:80-100`; e2e `4.1-E2E-002` with `context.setOffline(true)` then Cadastros › Clientes; unit `:138,213` |
| 4. One client batch: relatório (template_id/version/seed, Rascunho), locations with order_key/se/env/agrupar, one equipment + one block per template block with copied config; server copies nothing; 94 with the reference distribution, each in its column | pass | `instantiate.ts`; `instantiate.test.ts:36-143,177-188`; api integration test; e2e outbox assertions |
| 5. `suggestTag` matrix and uniqueness among live equipment | pass | `tag.ts`, `tag.test.ts` (8 tests), `integrity.test.ts`; `instantiate.test.ts:119-131,166-174`; web `new-relatorio-dialog.test.tsx:147-161` (SEC-C05 taken -> SEC-C05-2) |
| 6. Relatório stream pulled on another device carries the relatório ops and the project-scope equipment ops (AR-23) | pass, with F-1 caveat | api test `:135-146`; e2e `4.1-E2E-002:188-202`. The union is right; a relatório whose stream holds any JSON-looking string value (F-1) fails to apply on the other device |

Story 4.3

| AC | Verdict | Evidence |
|---|---|---|
| 1. 13 rows in FO.SERV-03 order at 64 px, "Pré-visualizar" (disabled, reason) and "Gerar relatório" at the foot | pass | `sumario.ts:21-35`, `sumario-surface.tsx:424-466`; unit `:153-196`; e2e `:217-231`; screenshots 05 |
| 2. Meta lines from `preIssue`/`progress`, blocking rows red and bold, four header counts each opening its list | pass (narrowed) | `pre-issue.ts`, `progress.ts`, `sumario.ts:131-142`; unit `:180-188,366-385`; e2e `:221-223`; all four counts open section 9 (Triage 3.5 rejection, F-8) |
| 3. Em campo opens section 9 expanded on the last sheet's cabine; Rascunho/Em revisão/Emitido collapsed with pendências leading | pass (narrowed, F-4) | `sumario-surface.tsx:178`, `section-9.tsx:181-189`, `readLastSheet`; unit `:275-345`; e2e `4.3-E2E-002` (`@p1`, green); `.is-review` styling for Em revisão; no scroll to the current row |
| 4. Overflow / Position box reorder as `block/{id}/order_key` ops, numbering redraws, announced and undoable; fixed rows have notes and no controls; "Restaurar ficha removida" in the header Overflow | pass, with F-1 | `sumario-surface.tsx:311-387`, `sumario-row.tsx:57-68`; unit `:198-273`; e2e `:260-345`; `4.3-E2E-003` by touch. A move to the first slot mints a digit-only key that the api mangles on pull (F-1). Rows 7/9 Subir · Descer only (recorded narrowing) |
| 5. Rows 1 and 3 open setup Etapa 2; rows 2/4/5/6 open the resolved text read-only; 7/8/10/11 status only | pass | `sumario-surface.tsx:341-345`; `setup-stub-surface.tsx`, `section-text-surface.tsx`; unit `:198-231`; e2e `:233-254` (plus the cover row at `?etapa=1`); screenshots 10/11 |

## Verdict

Verdict: changes-requested

- must-fix: F-1 (digit-only `order_key` from a first-slot move is mangled by the api's jsonb read path and the relatório then never downloads on other devices, silently; fix the read path with a round-trip api test, and keep `orderKeyBetween` from minting JSON-parsable keys as defence in depth).
- should-fix: F-2 (apply failure shown as "not found" with a green badge), F-3 (kernel ownership leaks: `blockTotal`, project option order and name matching, `end < start`, status-driven rules), F-4 (scroll to the current cabine, or record the narrowing).
- nits: F-5, F-6, F-7. Notes: F-8, F-9.

## Fix status (batch orchestrator, 2026-09-24)

- F-1 (must-fix) fixed: `apps/api/src/db/schema.ts` replaces drizzle's `jsonb()` with a custom `jsonb` type whose `fromDriver` returns the driver's already-decoded value (postgres.js parses oids 114/3802 itself) and whose `toDriver` serializes, on `ops.value`, `ops.meta` and `entities.row`; new `apps/api/src/sync/jsonb-round-trip.integration.test.ts` pushes `"4"`, `"2026"`, `"true"`, `"null"`, `"Sala 12"` and an `order_key` of `"4"` and pulls them back as the identical strings. Defence in depth: `orderKeyBetween` never mints a key that `JSON.parse` accepts (an `m` is appended), with a 300-insertion property test.
- F-2 (should-fix) fixed: when the pull ran, no row exists and the company summary lists the relatório, the Sumário says "Não foi possível baixar o relatório neste aparelho." with "Tentar de novo" (pulls again); the not-found sentence stays for an unknown id; unit test.
- F-3 (should-fix) fixed: `templateBlockTotal`, `projectLabel`, `projectsOfClient`, `projectNamed`, `endBeforeStart`, `sumarioOpensExpanded`, `sumarioReadingMode` moved into the kernel with tests; the web calls them.
- F-4 (should-fix) fixed: the Sumário scrolls the `.s9-cabine.is-current` row into view once when it opens expanded; unit test (one `scrollIntoView` call) and `4.3-E2E-002` asserts the row lies inside a 600 px viewport after the reload.
- F-5 (nit) left: two removed sections of the same type share the accessible name; recorded here for batch B (Story 4.5), which owns the restore list once equipment sheets join it.
- F-6 (nit) fixed: unit test of Remover then "Desfazer" with the focus on the restored row's Overflow.
- F-7 (nit) fixed: dangling comment removed.
- F-8 (note): the narrowings and the epics.md strike-through are handed to the coordinator (spec `deferred`).
- Re-verified: `pnpm verify` green (lint, static, kernel 606, web 618, tooling 20, api 107, Playwright `@p0` 39).

## Orchestrator's real-browser pass (2026-09-24, scripted Playwright in the tools container, Empresa A, synthetic names)

Screenshots 16-24 under `qa-epic-4-A/`. 38/38 checks: Home dialog at 768 (client and obra created inline, "Continuar" tapped right after "Criar" keeps the obra), Project dialog at 768 (template preselected, Criar `aria-disabled` with its reason, end follows start), Sumário at 768 (13 rows, header count, 0 px overflow), keyboard only (Tab reaches the Position box, "4" + Enter announces and keeps the focus, Alt+ArrowUp announces "Seção 4 movida para a posição 3 de 11", Desfazer puts the focus on the box, the Overflow menu walked with the arrows to Remover, focus on the row now in slot 5, Desfazer puts the focus on the restored row), "Sincronizar agora", a second context at 1280 dark pulling the relatório on open, two removals and the Restaurar dialog with two distinct names, row 7's Overflow reading Subir · Descer, a header count expanding section 9 with the focus on its chevron, and at 390 the Home dialog picking the existing client and obra, the Project without a dialog, one relatório row, the Sumário's back to the project. Two defects this pass found and fixed before the review: the Home dialog lost a just-created selection on an input event or blur before the live query listed the row; a `restoreFocus` watch left by a Position box move stole the focus from the removal that followed. One observation, not fixed: an Alt+Arrow pressed inside the tick between a move's commit and the live-query re-render uses the row's previous position (the announcement then names the old number); a person reading the new order first never meets it.

| AC | Result |
|---|---|
| 4.1 AC1 Project from Home, rows, empty state | pass |
| 4.1 AC2 dialog defaults and reason | pass |
| 4.1 AC3 inline client create, offline | pass (e2e offline context; orchestrator pass online) |
| 4.1 AC4 one batch, 94 blocks in place | pass |
| 4.1 AC5 suggestTag and uniqueness | pass (kernel tests) |
| 4.1 AC6 stream union on another device | pass (after F-1) |
| 4.3 AC1 13 rows, foot buttons | pass |
| 4.3 AC2 preIssue metas, counts | pass (counts all open section 9, recorded) |
| 4.3 AC3 status-driven opening, scroll | pass (after F-4) |
| 4.3 AC4 reorder, undo, focus, Restaurar | pass (rows 7/9 Subir · Descer only, recorded) |
| 4.3 AC5 rows 1/3 setup, 2/4/5/6 text, others status only | pass |
