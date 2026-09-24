---
title: 'Epic 4 fixes: integrated QA findings Q1-Q14'
type: 'bugfix'
created: '2026-09-24'
status: 'done'
baseline_revision: '6e660907ffe7220a14d4922754314782eb3238ff'
route: 'freeform'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-4-3-project-relatorio-and-sumario.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-4-6-4-7-setup-status-section-text.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      Q4 reuse matches only the base TAG a template position would get, so an equipment whose TAG was renamed in an earlier relatório, or that got a suffix at creation from a cross-type collision, is not reused and the next relatório mints a new row.
    evidence: |-
      instantiate.ts binds a prior row when normalizeTag(row.tag) equals the position's base TAG (suggestTag over this run's TAGs only) and the type matches. The coordinator's 2026-09-24 decision fixed this key. A rename-aware or location-path/ordinal key needs a new product decision (Blind Hunter and Edge Case Hunter, review pass 2026-09-24).
    location: >-
      packages/domain/src/relatorio/instantiate.ts
    severity: medium
  - summary: >-
      With equipment now shared across a project's relatórios, an equipment op (a TAG rename, later a nameplate) made in one relatório never advances another, already Emitido relatório that prints the same equipment.
    evidence: |-
      Pre-existing: deferred-work.md already holds the open entry "advanceOnEdit skips project-scoped equipment ops" (batch C review finding 9). Q4 widens the exposure from rare to routine. The rename dialog also gives no sign that the TAG is shared (Blind Hunter, review pass 2026-09-24).
    location: >-
      apps/web/src/db/commit.ts buildBatch
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The integrated QA pass over main at `6e66090` (`git show origin/qa/epic-4:_bmad-output/implementation-artifacts/reviews/epic-4-review-qa.md`; screenshots under `reviews/qa-epic-4/` on that branch) found 14 defects: one must-fix (Q3, a cover field silently lost), six should-fix (Q1 creation lands on the Sumário, Q2 responsável not prefilled, Q4 a second relatório mints 94 new equipment rows with suffixed TAGs, Q5 Home card title disagrees with the Sumário, Q6 `pnpm test:e2e:full` red, Q7 ~650 ms redraw per reorder) and seven nits (Q8-Q14).

**Approach:** One PR on `fix/epic-4-qa`, one fix per Q, each must/should-fix with a regression test (e2e where user-visible). Kernel owns every derived text/rule (AD-1..AD-3); the file:line hints in the QA review are verified, not trusted.

## Boundaries & Constraints

**Always:**
- Derived text and rules in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts` (new sentences marked `// authored:`); component chrome in `copy/ui.ts`. No emoji. `relatorio`, never `laudo`.
- Seed v1 stays frozen (`seed.test.ts` pins its hash): no edit of `seed/sections-v1.ts` or any v1 content.
- Every destructive/undo action keeps a deliberate focus target with an e2e assertion (E3-A8). Mock class names; `tokens.css`/`components.css` byte-identical.
- Tests are strengthened, never weakened; a touch-only test is skipped only on projects without `hasTouch`.

**Never:**
- No schema change or migration (the `setup.escopo` key stays in `relatorioSetupSchema`).
- No seed v2, no change of D-2 or the R-009 deferral.
- No "Mover para…", no sub-block toggles, nothing from Epics 5-7.
- Do not rewrite or delete planning sentences; append dated notes beside them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Q4 first relatório | Project with no equipment, seeded template | 94 `equipment` creates, TAGs as today (SEC-C05, TR-1..) | none |
| Q4 second relatório | Same project, first relatório's 94 equipment live | 0 `equipment` creates; each of the 94 blocks carries the first relatório's `equipment_id` for the same TAG | none |
| Q4 partial reuse | Prior project equipment: SEC-C05 live, SEC-C05-2 removed, DJ-C05 live but type `tp` | SEC-C05 reused; second SEC in Coluna 5 is created as SEC-C05-2 (removed rows never reused, never count as taken); DJ block creates a new row (type mismatch) with `suggestTag` over all live rows | none |
| Q4 no double binding | Template with 2 SEC in Coluna 5, project has only SEC-C05 | first block reuses SEC-C05, second creates SEC-C05-2 | none |
| Q4 remove shared | Relatório 2 removes a block whose equipment another live block on this device (any relatório of the project) references | Only the `block/removed_at` op; the equipment stays live; Restaurar still works | none |
| Q3 cover | `additional_info: 'Parada programada'`, `escopo: 'x'` | DOCX cover "Informações adicionais" = "Parada programada" | blank additional_info prints the row's empty/placeholder value as any missing variable does today |
| Q9 name | cabine named "Cabine QA" / "1° Subsolo" | "Cabine QA sem equipamento" / "Cabine 1° Subsolo sem equipamento" | case-insensitive "cabine " prefix check |
| Q11 idle number | Last revision 1, no edit since its snapshot, nothing pending | idle line "como a revisão 1" | an edit (pulled op past `snapshot_seq` or a pending outbox op that `countsAsEdit`) → revisão 2 |

</intent-contract>

## Code Map

- `packages/domain/src/relatorio/instantiate.ts:60-65,150-166,221-246` -- `InstantiateInputs`; setup built at creation; equipment loop that always creates (Q2, Q4).
- `packages/domain/src/relatorio/tag.ts:31,79` -- `TagEquipment` (tag, removed_at only), `suggestTag` (Q4 reuses it unchanged).
- `apps/web/src/surfaces/project/new-relatorio-dialog.tsx:76-94` -- builds inputs from `equipmentRows(db, project.id)` and `navigate('/relatorio/:id')` (Q1, Q2, Q4).
- `apps/web/src/surfaces/relatorio/tree-actions.ts:255-265,402-409` -- `removeBlock` always tombstones the equipment; `restoreSheetOps` (Q4 shared-equipment guard).
- `apps/web/src/db/home-store.ts:129-136` -- `blockRowsOf`, `equipmentRows`; Dexie `block` table indexes (check for an `equipment_id` index before querying).
- `apps/web/src/surfaces/relatorio/setup-surface.tsx:222,349-393,437-444,679-711` -- Etapa 1 additional info, Etapa 2 escopo field, Etapa 3 responsible Combobox, Etapa 5 altitude field (Q2, Q3, Q8).
- `packages/domain/src/relatorio/section-variables.ts:23-34` -- `sectionVariables`, the one mapping `print/layout.ts:171-178` resolves the cover against (Q3).
- `packages/domain/src/seed/sections-v1.ts:237-246` -- read-only evidence: v1 cover row "Informações adicionais" = `{escopo}`; section 1 text has no `{escopo}` (the phrase is fixed text).
- `packages/domain/fixtures/porto-seguro/op-log.ts:198-211`, `data.ts:118` -- fixture already treats `{escopo}` as the cover's "Informações adicionais" (`COVER.escopo`); golden docs under `apps/api/src/jobs/generate/golden/`.
- `packages/domain/src/home/cards.ts:196` -- card title `join([clientName, source.local])` (Q5); `relatorio/sumario.ts:296-299` `sumarioTitle` is the Sumário header's.
- `e2e/durability.spec.ts:395-396,440-441,473,494-495` -- webkit-only skips and stale "2 Definições" (Q6); `playwright.config.ts:21-40` projects.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `relatorio-tree.tsx`, `relatorio-editor.ts:53,83` -- live query + `buildSnapshot` per op (Q7).
- `packages/domain/src/relatorio/pre-issue.ts:46-48` -- `cabineSemEquipamentoText` (Q9).
- `apps/web/src/copy/pt-br.ts:484,637` -- `previewReason`, `parecerNote` (Q10).
- `packages/domain/src/print/revisions.ts:122-125,153-155`, `status/edited-since.ts:66`; `apps/web/src/surfaces/export/use-generate.ts:86-89,120-158`, `export-dialog.tsx:98-102,127-128` (Q11).
- `packages/domain/src/relatorio/setup-complete.ts:13-22,51-54`; `registration.ts:45` `artOrTrtLabel` (Q12).
- `apps/api/src/jobs/generate/docx.ts:175-186,220-225` -- footer PAGE/NUMPAGES runs, `Document` options (`creator`, no `lastModifiedBy`) (Q13).
- `apps/web/src/surfaces/relatorio/section-text-surface.tsx` -- no focus on mount; `setup-surface.tsx` focuses the band `h2` (tabIndex -1) (Q14).
- `_bmad-output/planning-artifacts/epics.md:1108-1143` -- Story 4.1 (dated note for Q4).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/instantiate.ts` -- Q4: widen `existingEquipment` to `Pick<EquipmentRow,'id'|'tag'|'type'|'removed_at'>[]`; per template block compute the base TAG with `suggestTag` over only the TAGs this instantiation has already produced or bound; if a live prior row has that TAG (normalized) and the same `type` and is not yet bound in this run, the block takes its `equipment_id` and no `equipment` create is emitted; else create as today (`suggestTag` over prior ∪ produced). Q2: add `responsible_user_id: string | null` to `InstantiateInputs`, written into `setup`. Update the header comment. -- AD-24/AD-25, glossary "TAG is the stable identity".
- `packages/domain/src/relatorio/instantiate.test.ts` -- kernel tests: second relatório of the Porto Seguro-shaped (seeded standard) template yields 0 equipment creates, 94 blocks, same TAGs and same ids as the first; the partial-reuse and no-double-binding rows of the matrix; `responsible_user_id` carried.
- `apps/web/src/surfaces/project/new-relatorio-dialog.tsx` -- Q1: navigate to `/relatorio/:id/setup?etapa=1` (focus lands on the Etapa 1 band heading as setup already does); Q2: pass `responsible_user_id` = session user id when the session user carries a registration (council and number), else null.
- `apps/web/src/surfaces/relatorio/tree-actions.ts` (+ a kernel helper, e.g. `equipmentSharedElsewhere(blocks, equipmentId, blockId)` in `relatorio/tree.ts`) -- Q4: `removeBlock` emits the equipment tombstone only when no other live block this device holds (any relatório of the project) references that equipment; unit test both branches.
- `packages/domain/src/relatorio/section-variables.ts` -- Q3: `escopo` resolves from `setup.additional_info` (seed v1's cover names the "Informações adicionais" value `{escopo}`; section 1's text carries no `{escopo}`), with a comment citing the evidence. Tests in `section-variables.test.ts` and a `print/layout` test asserting the cover row prints `additional_info` and never `setup.escopo`.
- `apps/web/src/surfaces/relatorio/setup-surface.tsx`, `copy/pt-br.ts` -- Q3: remove the Etapa 2 "Escopo" field (it would print nowhere in v1); keep "Local" and the exclusions. Q8: show `data-state="suggested"` and the "Sugerido" pill only when a geolocation reading exists; the confirmed line gets an "Alterar" TextButton that puts `site_altitude_confirmed` false (value kept) and focuses the altitude input.
- `packages/domain/fixtures/porto-seguro/op-log.ts` + golden docs -- Q3: fixture's `additional_info: COVER.escopo`, `escopo: null`; regenerate golden outputs through the existing snapshot-update path and confirm the only diff is the cover row.
- `packages/domain/src/home/cards.ts` -- Q5: title = `sumarioTitle(client, project)` when the project row is known (identical to the Sumário header); fallback unchanged otherwise. Unit test with a `setup.local` override.
- `e2e/durability.spec.ts` -- Q6: skip the three touch tests with `!testInfo.project.use.hasTouch`; fix l.473 to the rendered "Seção 2 — Definições" (or whatever the title renders, verified).
- `apps/web/src/surfaces/relatorio/*` -- Q7: measure first on the production bundle (see Verification); if the move is not immediate there (announcement and row move in the same frame, target well under 100 ms after the op commits), memoize per-node rendering / narrow the live query; else record the numbers and why no change was made in Design Notes.
- `packages/domain/src/relatorio/pre-issue.ts` -- Q9: no "Cabine" prefix when the name already starts with "Cabine" (case/diacritic-insensitive); test.
- `apps/web/src/copy/pt-br.ts` -- Q10: `previewReason` = "Pré-visualizar: disponível em uma próxima etapa"; `parecerNote` without "deste épico" (e.g. "Disponível em uma próxima etapa"); update assertions that pin them.
- `packages/domain/src/print/revisions.ts`, `apps/web/src/surfaces/export/*` -- Q11: kernel `idleRevisionNumber(revisions, edited)`; the hook computes `edited` from the local op log with `editedSince`/`countsAsEdit` past the last revision's `snapshot_seq` plus pending outbox ops; in the ready state the pill shows the relatório's status after the `issue` op (Emitido) — fix the stale-closure/ordering cause, verified in a unit test and the e2e.
- `packages/domain/src/relatorio/setup-complete.ts` -- Q12: the ART/TRT gap names `artOrTrtLabel(responsible.council)` ("o número da ART"/"o número da TRT", article agreed) when the council is known, keeping "o número do ART/TRT" otherwise; test.
- `apps/api/src/jobs/generate/docx.ts` -- Q13: footer page-field results render at the footer size (put the size where the field result inherits it, e.g. paragraph run properties or a footer style; verify in the LibreOffice PDF); set `lastModifiedBy: PRODUTO`; docx test asserts both.
- `apps/web/src/surfaces/relatorio/section-text-surface.tsx` -- Q14: focus the page `h2` (tabIndex -1) on mount; e2e asserts focus after opening row 2.
- `e2e/*.spec.ts` -- e2e: update `4.1-E2E-001` (lands on setup Etapa 1, heading focused); add `@p0` steps for Q2 (Etapa 3 shows the session user), Q3 (additional info typed in Etapa 1 is what the cover prints, via DOCX download or the layout endpoint the existing 4.8 e2e uses), Q4 (second relatório in the same obra shows SEC-C05, not SEC-C05-2), Q5 (Home card equals Sumário header), Q8 (Alterar reopens the field, focus in input), Q11 (idle line after "Gerar de novo" names the last revision; ready pill Emitido), Q14 (focus on section text heading).
- `_bmad-output/planning-artifacts/epics.md` -- append beside Story 4.1's AC (no rewrite) a dated note: "2026-09-24, coordinator (Epic 4 QA Q4, AD-24/AD-25, glossary TAG): a later relatório of the same obra reuses the project's live equipment by base TAG and type; `equipment` is created only for positions with no live match."
- `_bmad-output/implementation-artifacts/deferred-work.md` -- record Q4's cross-device limit (a shared equipment referenced only by a relatório this device never pulled can still be tombstoned by a remove) if not closed.

**Acceptance Criteria:**
- Given a project with no relatório, when "Criar relatório" is pressed, then Relatório setup opens at Etapa 1 with focus on its band heading, and Etapa 3 shows the signed-in user as Responsável técnico.
- Given the Etapa 1 "Informações adicionais" text, when the relatório is generated, then the DOCX cover row of that label prints it and no Etapa 2 "Escopo" field exists.
- Given an obra that already has a relatório, when a second one is created, then no new equipment is created and the tree shows the same TAGs.
- Given `docker compose --profile tools run --rm tools pnpm test:e2e:full`, when it runs, then it exits 0.
- Given each nit Q8-Q14, when its QA reproduction step is re-driven, then the defect no longer shows.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 40 findings — high 0, medium 15, low 21, false 4, maybe-false 0
- findings:
  - `[medium]` `[defer]` (Blind Hunter) Q4 reuse misses a TAG renamed in relatório 1 or one that got a suffix at creation; the next relatório mints a new row. Real, but the matching rule (base TAG of the position plus type) is the coordinator's decision in the intent. A wider key (location path + ordinal, or a rename-aware match) needs a new decision. Deferred.
  - `[medium]` `[defer]` (Blind Hunter) With equipment shared across relatórios, an equipment op (a TAG rename in relatório 2) never advances an Emitido relatório 1 (`advanceOnEdit` skips project-scope ops). This is pre-existing: `deferred-work.md` already has an open entry, and Q4 makes it more common. Deferred, entry extended.
  - `[medium]` `[patch]` (Blind Hunter) When `additional_info` is blank, the cover prints "[Escopo]", which names a field the setup no longer has. `SECTION_VARIABLE_LABELS.escopo` becomes "Informações adicionais" and the layout test asserts the placeholder.
  - `[low]` `[patch]` (Blind Hunter) Stale comments in `entities.ts:234` and `section-text.ts` are reworded. The data carry-over half is rejected: `setup.escopo` was editable only since PR #27, merged the same day, and pre-MVP there is no deployed data. A fallback would print an uneditable value on the cover.
  - `[low]` `[patch]` (Blind Hunter) Behavior changes without dated notes in `epics.md`. Story 4.1's phrase is struck through with a dated replacement, and dated notes are added under Stories 4.2 (Escopo field) and 4.5 (remove keeps shared equipment). Q2 needs no note, because the AC already says "prefilled from the account".
  - `[medium]` `[patch]` (Blind Hunter) The rewritten 4.8-E2E-004 lost the check that the revision lands with the dialog closed. The original order is restored, and 4.8-E2E-001 asserts the ready pill reads "Emitido" with the dialog open.
  - `[medium]` `[patch]` (Blind Hunter) `settle` is untested, and the 1 s fallback hides a broken `drawn()`. Move tests are added with a timeout below `SETTLE_TIMEOUT_MS`. The "predicates disagree" half is false: the tree's `ul`s hold only row `li`s, and only the Sumário `ol` holds fixed rows, which its predicate filters.
  - `[medium]` `[patch]` (Blind Hunter) The Q4 remove and restore wiring is untested; a hook-level test is added. The "stale `projectBlockRows` read before the queued edit" half is rejected: the window is milliseconds, and closing it means extending the editor's Fresh rows.
  - `[low]` `[patch]` (Blind Hunter) `restoreSheetOps`'s `equipment` parameter defaults to `[]`. It is made required.
  - `[low]` `[reject]` (Blind Hunter) The Q5 fallback without a project row still uses `local`. A relatório row whose project row is absent on the device is rare. The fallback is a deliberate degradation, and better than "Sem título".
  - `[low]` `[reject]` (Blind Hunter) `useEditedSince` defaults to true, so the number flips 2 to 1 after one IndexedDB read, and it scans `remote_ops`. The flip lasts one read, and `.btn-reason` is not a live region. The scan is bounded to ops after the last revision.
  - `[medium]` `[patch]` (Blind Hunter) The `finishReady` once-guard is never reset, so the dialog can be stranded in the job-done/`latestRevision` branch. The guard is now reset once ready is set.
  - `[false]` `[reject]` (Blind Hunter) Q8 "Alterar" is authored without a mock and un-confirms at once. The QA review prescribes "Alterar". `.row` is a `components.css` class. Un-confirming on press is the honest state: the user confirms again.
  - `[low]` `[reject]` (Blind Hunter) The spec's Verification hardcodes the scratch path, and the Q7 numbers come from `vite preview` rather than prod. The fix is a spec edit. The prod profile was refused by the permission classifier as a deploy, and `vite preview` serves the same production bundle.
  - `[low]` `[reject]` (Blind Hunter) The spec's ACs and sources are thin. The fix is a spec edit.
  - `[false]` `[reject]` (Blind Hunter) The goldens are missing from the reviewed diff. The two golden JSON files are modified in the tree. They were deliberately left out of the review diff (single-line JSON).
  - `[low]` `[patch]` (Blind Hunter) Q9 misses "Cabine-7"/"Cabine7" and trims inconsistently. It now uses `/^cabine(?![a-z])/`, trims both branches, and has tests.
  - `[low]` `[defer]` (Edge Case Hunter) A suffixed TAG from a cross-type collision is never reused, so rows multiply. Same root and route as the first row (the coordinator's rule), and it needs a manual cross-prefix rename to arise.
  - `[low]` `[patch]` (Edge Case Hunter) A pending `settle` can show an older move's undo toast after a newer edit's. `undoable` and `announce` now flush the pending settle first.
  - `[low]` `[patch]` (Edge Case Hunter) Memoized duplicate-TAG rows keep a stale location path in their accessible name. `shared` is now keyed on the locations' content.
  - `[medium]` `[patch]` (Edge Case Hunter) A create in a collapsed location waits the 1 s fallback, because the tree's reveal render does not re-render the Sumário. The tree now runs the settle check in its own layout effect.
  - `[low]` `[patch]` (Edge Case Hunter) `reading` was kept after Confirmar, so "Alterar" showed "Sugerido" again. It is now cleared on confirm.
  - `[low]` `[reject]` (Edge Case Hunter) A Dexie read error in `projectBlockRows` gives no toast. This is unlikely and matches the chain's existing `.catch(() => undefined)` for edit errors.
  - `[low]` `[reject]` (Edge Case Hunter) The stale read race before the queued edit is the same as the Blind Hunter's second half, rejected there.
  - `[low]` `[patch]` (Edge Case Hunter) The Q9 "Cabine-7" row is grouped with the Blind Hunter's Q9 row.
  - `[low]` `[reject]` (Edge Case Hunter) The idle number flips while loading, the same as the Blind Hunter's `useEditedSince` row.
  - `[low]` `[reject]` (Edge Case Hunter) Stored `setup.escopo` is no longer printed. Rejected with the Blind Hunter's data carry-over half: no deployed data.
  - `[medium]` `[defer]` (Edge Case Hunter) The claim "the second relatório reuses" holds only when the first run's TAGs are the base TAGs. Same root and route as the first row.
  - `[medium]` `[patch]` (Verification Gap) The Q4 shared-remove path has no hook-level test. The `relatorio-tree.test.tsx` test is added.
  - `[medium]` `[patch]` (Verification Gap) The Q11 pulled-edit branch is untested. An `applyPulled` case for both relatório and project scope is added.
  - `[medium]` `[patch]` (Verification Gap) The `settle` `drawn()` predicates are masked by the fallback. Grouped with the Blind Hunter's `settle` row.
  - `[medium]` `[patch]` (Verification Gap) The 4.8-E2E-004 title no longer matches its body. Grouped with the Blind Hunter's 4.8-E2E-004 row.
  - `[low]` `[patch]` (Intent Alignment) Story 4.2 had no dated note for the Escopo removal. Grouped with the Blind Hunter's `epics.md` row.
  - `[low]` `[patch]` (Intent Alignment) Story 4.1's sentence was not struck through. Grouped with the Blind Hunter's `epics.md` row.
  - `[false]` `[reject]` (Intent Alignment) Q6 was reached by skipping in e2e:full. That is the QA review's own prescribed fix (`!hasTouch`). The dev ran the three tests on `durability-android-chrome`, and they passed.
  - `[medium]` `[patch]` (Intent Alignment) Q7 has no automated test. Grouped with the `settle` rows.
  - `[medium]` `[patch]` (Intent Alignment) The 4.8-E2E-004 closed-dialog path was replaced. Grouped with the Blind Hunter's 4.8-E2E-004 row.
  - `[low]` `[reject]` (Intent Alignment) Q13 is checked in the XML, not the PDF. The dev rendered the fixture through LibreOffice and read it with pdfjs: 9 pt on all 8 pages. The scripted browser pass re-checks a generated DOCX.
  - `[low]` `[reject]` (Intent Alignment) Q9, Q12 and part of Q10 are kernel-only. The orchestrator's scripted browser pass re-drives each Q's reproduction steps.
  - `[false]` `[reject]` (Intent Alignment) Q5 differs from the QA review's suggested fix. The QA's "Expected" is "the Sumário header and the Home card agree", which `sumarioTitle` satisfies exactly; the suggested `local ?? site` would not.

## Design Notes

**Q4 decision (coordinator, 2026-09-24, AD-24/AD-25, glossary "TAG is the equipment's stable identity, unique within the Project").** A later relatório reuses the project's live equipment instead of minting rows. Match key = the base TAG the position would get with no prior equipment, plus type; removed rows are never reused. A block removal no longer tombstones an equipment another live block on this device references. The same physical switch keeps SEC-C05 and, later, its `last_nameplate`, across relatórios.

**Q3 decision (orchestrator, 2026-09-24).** FO.SERV-03 prints two distinct texts. The cover's "Informações adicionais" reads "Manutenção Preventiva nas Cabines Primárias" (`extract-fo-serv-03.md:42`). Section 1 fixes the scope phrase in seed v1's own text. So in v1, `{escopo}` exists only on the cover, and the fixture already fills it with the cover text. The field the user types into with that label, in the Capa band (mock `50-relatorio-setup.html:134`), is `additional_info`, so `{escopo}` resolves from it. `setup.escopo` would print nowhere, so its input leaves Etapa 2. The key stays in the schema for a seed v2 in which section 1 gains a variable after R-009.

**Q2.** The responsável is written in the creation batch, so nothing looks filled without a committed op. This keeps the batch C review finding 3 intact.

**Q7 measurement (dev agent, 2026-09-24).** Measured on the production bundle (`pnpm --filter @app/web build`, served by `vite preview` on :5200 inside the `tools` container, proxying `/api` to the compose api; the `prod` profile was not started). Throwaway Playwright script outside the repo: Empresa B reset with the standard template, a relatório pushed from an "office" device, section 9 and every location expanded (94 equipment rows drawn), the 4th row of Coluna 3 moved with Alt+ArrowUp/Alt+ArrowDown alternately, 5 runs, times from the keydown (capture listener) to the DOM mutation that moves the row and to the announcer's new text.

- Before: row moved 251, 229, 241, 222, 218 ms (median 229); announcement 115, 112, 93, 98, 112 ms, i.e. about 120 ms before the row. A CPU profile showed React re-rendering all 94 rows (React Aria buttons and menus) about four times per move: the empty announcement, its text, the toast and the live query.
- Change 1: every tree row (`SumarioLocation`, `SumarioEquipment`, `RailLocation`, `RailEquipment`) is memoized on its node's content and on a `shared` context that keeps its identity while the expand state, the last sheet and the actions hold. After it, the row moved at 107, 88, 103, 100, 73 ms (median 100) and the announcement at 24-67 ms, still ahead of the row.
- Change 2: `useRelatorioEditor().settle(drawn, text, then)` says the move and shows its toast in the layout effect of the render that draws the row in its new slot (a 1 s fallback if it is never drawn). Tree moves, location moves, Sumário section moves and the palette's "criada" toast use it. After it: row and announcement in the same mutation, 151 (first, cold), 88, 89, 111, 104 ms after the keydown (median 104). The commit itself lands at about 45 ms, so the row is drawn about 55 ms after the op commits.
- The live query was not narrowed: what remains after the commit is one IndexedDB read and the zod parse of the relatório's rows (about 15-20 ms) plus one render of the changed rows.

**Parallel-story checklist (P6).** Ports 19xxx (web 19073, api 19030, Postgres 19032, MinIO 19090/19091, api-prod 19001, caddy 19080/19443), compose project `fasor-e4f`. No shared component is stubbed. Merge-back: `git merge origin/main` into `fix/epic-4-qa`, conflicts resolved by this batch's orchestrator, then re-verify.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: all stages green.
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: exit 0 (Q6).
- Q7: `docker compose --profile tools run --rm tools pnpm --filter @app/web build`, `docker compose --profile prod up -d`. Then a throwaway Playwright script (outside the repo, in `/tmp/claude-1000/-home-matheus-Documentos-fasor/632e5689-e8d0-4161-9f87-0724620f0f51/scratchpad/F/`) against `http://localhost:19001` takes the Alt+ArrowUp keydown-to-DOM-order time with section 9 fully expanded, 5 runs, before and after. Expected: numbers recorded in Design Notes.

**Manual checks (if no CLI):**
- A LibreOffice PDF of a generated DOCX: the footer numbers are the same size as "Página … de".

## Auto Run Result

Status: done (2026-09-24). The PR is not merged: the coordinator owns the merge.

**Summary.** All 14 findings of the Epic 4 integrated QA review (`reviews/epic-4-review-qa.md` on `qa/epic-4`) are fixed:

- **Q1:** "Criar relatório" opens Relatório setup at Etapa 1, with its heading focused.
- **Q2:** the responsável is written in the creation batch, from the account's registration.
- **Q3:** the cover's `{escopo}` resolves from Etapa 1 "Informações adicionais", and the dead Etapa 2 "Escopo" field is removed.
- **Q4:** a later relatório reuses the project's live equipment, matched by base TAG and type. Remover keeps any equipment that another live block holds.
- **Q5:** the Home card title comes from `sumarioTitle`.
- **Q6:** the touch-only e2e tests are skipped on projects without `hasTouch`, and the stale title is fixed.
- **Q7:** the tree rows are memoized, and `settle` announces a move in the render that draws it.
- **Q8:** "Sugerido" appears only when there is a geolocation reading, and a confirmed altitude gets "Alterar".
- **Q9:** "Cabine" is never doubled.
- **Q10:** two copy fixes.
- **Q11:** the idle line names the right revision, and the ready pill reads Emitido.
- **Q12:** the reason names the ART or the TRT.
- **Q13:** the footer gets a paragraph style carrying its size, and `lastModifiedBy` is PRODUTO.
- **Q14:** section text focuses its heading on open.

**Files changed.**

- **Kernel** (`packages/domain`):
  - `instantiate.ts`: the reuse rule and `responsible_user_id`.
  - `registration.ts`: `defaultResponsibleId`.
  - `section-variables.ts` and `templates/section-text.ts`: `escopo` resolves from `additional_info`, with the placeholder label.
  - `home/cards.ts`: the card title.
  - `pre-issue.ts`: Q9.
  - `setup-complete.ts`: Q12.
  - `print/revisions.ts`: `idleRevisionNumber`.
  - `status/edited-since.ts`: `editedOnDevice`.
  - `relatorio/tree.ts`: `equipmentSharedElsewhere`.
  - `schemas/entities.ts`: a comment only.
  - The Porto Seguro fixture and its two goldens: only the cover row changed.
- **Web** (`apps/web`):
  - `new-relatorio-dialog.tsx`: Q1, Q2 and the Q4 inputs.
  - `setup-surface.tsx`: Q3 and Q8.
  - `section-text-surface.tsx`: Q14.
  - `tree-actions.ts` and `home-store.ts`: the Q4 remove and restore.
  - `relatorio-editor.ts`, `relatorio-tree.tsx` and `sumario-surface.tsx`: Q7.
  - `use-generate.ts`, `export-dialog.tsx` and `generate-store.ts`: Q11.
  - `copy/pt-br.ts`: Q8 and Q10.
- **Api:** `jobs/generate/docx.ts` for Q13.
- **E2E:** `relatorio.spec.ts`, `export.spec.ts`, `home.spec.ts`, `durability.spec.ts` and `support/relatorio-flow.ts`. Unit tests sit next to each changed unit.
- **Planning:**
  - `epics.md`: the Story 4.1 strike-through, plus dated notes under 4.1, 4.2 and 4.5.
  - `deferred-work.md`: two entries, one new and one extended.

**Review findings.** The four layers (Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment) reported 40 findings: high 0, medium 15, low 21, false 4.

- **Patched: 14 entries** (8 medium, 6 low). I re-engaged the dev agent, which fixed:
  - a hook test for the Q4 shared-equipment remove;
  - tests for the Q11 pulled edit;
  - `settle` tests with a timeout below the fallback;
  - the 4.8-E2E-004 closed-dialog path, restored, and the Emitido pill asserted in 4.8-E2E-005;
  - the "[Informações adicionais]" placeholder;
  - stale comments;
  - the `epics.md` strike-through and notes;
  - `restoreSheetOps`, whose equipment parameter is now required;
  - the Q9 regex;
  - the `finishReady` guard, which is now reset;
  - `undoable` and `announce`, which now flush a pending settle first;
  - `shared`, now keyed on the locations;
  - `settleCheck`, now also called from the tree;
  - `reading`, now cleared on confirm.
- **Deferred: 2 entries**, recorded in the frontmatter `deferred` list and in `deferred-work.md`:
  - reuse is keyed on the base TAG only;
  - the equipment status-advance gap, which Q4 widens.
- **Rejected: all other findings**, each with its reason in the Review Triage Log:
  - no deployed `setup.escopo` data;
  - the tree predicates "disagree" claim is false;
  - the millisecond stale-read race;
  - the Q5 fallback without a project row;
  - the idle-number flip while loading;
  - "Alterar" as authored UI;
  - fixes that only edit the spec;
  - the goldens, deliberately left out of the review diff;
  - the Dexie read error in `projectBlockRows`;
  - the Q6 skip design;
  - Q13, Q9 and Q12 surface coverage, which the browser pass checks instead;
  - the Q5 fix that differs from the QA's suggestion.

**Follow-up review recommended: true.** Eight medium entries were patched. The unverified risk is the timing change from `settle`: every move and create toast now waits for the draw, with a 1 s fallback. The reordered ready phase in `use-generate.ts` adds to it. The epic QA re-check after the merge should drive moves, creates and a generate by hand.

**Verification.**

- **`pnpm verify`:** exit 0 on the final tree.
  - lint and static: clean.
  - unit tests: domain 60 files / 709 tests, web 80 / 718, tooling 2 / 20.
  - api: 25 / 139.
  - e2e `@p0`: 49 passed.
- **`pnpm test:e2e:full`:** exit 0, 90 passed and 3 skipped.
  - The first run failed once on `4.3-E2E-001`. That race is pre-existing and reproduced on the baseline `6e66090` (2 of 12 runs): Voltar was pressed while the setup scrolled its band to the top under a static App bar.
  - The test now waits for the band heading's focus, and 12 of 12 repeats passed.
- **Touch tests on `durability-android-chrome`:** 3 of 3 passed.
- **Scripted browser pass on the production bundle:** every Q passes (`reviews/epic-4-F-review.md`, screenshots in `reviews/qa-epic-4-F/`). For Q7, the row moves a median 91 ms after the keydown, in the same mutation as the announcement.

**Residual risks.**

- A remove can still tombstone equipment shared with a relatório this device never pulled (`deferred-work.md`).
- The Q4 key does not follow renamed TAGs (deferred).
- Q7 was measured on `vite preview` of the production build, not on the `prod` compose profile, which the permission classifier refused as a deploy.
