---
title: 'Status flow 2026-10-10: Rascunho advances by work, Em revisão means not yet sent, every status change is said'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_commit: '80f3d085eacf8d786cbb9e8ba8d977e40cd84142'
route: 'dispatch'
review_loop_iteration: 0
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/AGENTS.md'
warnings: ['oversized']
# oversized: Matheus kept every finding of the 2026-10-09 walk-through in one story (2026-10-10); M2, m1 and m2 are small and live in the same files.
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 2026-10-09 Playwright walk-through (screens in `.playwright-mcp/fluxo-*.png`, gitignored) found the status flow opaque and one dead end: generating while Rascunho issues a revision and leaves the status Rascunho for good (B1); Rascunho leaves only through Setup's "Concluir", which nothing on the Sumário points to; Setup names one gap at a time (M2); every status change is silent (M3); the Sumário foot sentence is the same in every status (M6); the Controle do documento row says "Rev. 1 na primeira emissão" after rev 1 (m1); the Export pre-issue list repeats identical "Último envio" lines (m2).

**Approach:** Change AD-22's table (Matheus, 2026-10-10): `rascunho --setup_complete--> em_campo`, `rascunho --edit--> em_campo`, `rascunho --generate--> em_revisao`, `em_campo --generate--> em_revisao`, `em_revisao --issue--> emitido`, `emitido --edit--> em_revisao`; manual backward moves stay. Em revisão is informational: a revision was generated and has not been sent to the client. `issue` is no longer emitted when a revision arrives; it is the explicit action "Marcar como enviado ao cliente". Then make every surface say the status and the next step.

**Decisions (Matheus, 2026-10-10):** (1) Only field work moves Rascunho to Em campo: an edit in the families location, block, sheet, file (photo), point or equipment; a `relatorio/setup` edit in Rascunho does not, so the office fills Setup in Rascunho and "Concluir dados do relatório" stays. (2) "Marcar como enviado ao cliente" is offered only in Em revisão when nothing was edited since the latest revision; with newer edits the next-step sentence asks to generate rev N+1 first, so Emitido always means the client has the current content.

**Decisions after the first implementation pass (Matheus, 2026-10-10), which amend the text above where they differ:** (3) Only content counts as field work: a sheet value, a cabine's data fields (CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO), a photo, a point of attention. Structure does not move Rascunho: creating, removing, restoring, reordering, moving or renaming a location, a block, an equipment or a Sumário section, and a block's config. The office prepares the tree in Rascunho. (4) The Controle do documento row says "Rev. N gerada" while the relatório is not Emitido and nothing was edited since revision N, "Rev. N emitida" only once Emitido, "Rev. N+1 na próxima emissão" with newer edits. (5) The status's next-step sentence sits in the Sumário header, right under the status pill, at every width; the Sticky action bar keeps only the blocking reason and the buttons (it was 299 px of 844 at 390 px with the sentence in it). (6) The setup gap list follows the kernel's fixed `setupGaps` order.

## Boundaries & Constraints

**Always:** `statusTable` stays the only transition rule; every status move is one client `relatorio/status` op. Derived pt-BR text (foot sentence, banners, toasts with a status word, gap list, controle meta) lives in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`; authored copy marked `// authored:` and listed in the PR body for Bruno. One toast at a time: a status toast never drops a live undo toast. Planning docs amended per AGENTS.md (strike-through + dated text): `source-deltas.md` row, AD-22 in `ARCHITECTURE-SPINE.md`, `EXPERIENCE.md` status pill row (l.261) and its open question (l.623); matching `docs/kbs/` concept and `docs/kbs/log.md`.

**Never:** No new op family, enum value, reducer change or `CONTRACT_VERSION`/`MIN_CONTRACT_VERSION` change. No server-side status write. No story in `epics.md` (Matheus, 2026-10-10: out of epic, like the 2026-10-08 review fixes). No device label in the sync contract (m2 collapses per user instead).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Field work in Rascunho | Rascunho, a sheet value, a cabine data field, a photo or a point edit | Same batch carries `em_campo`; toast "Relatório em campo" |
| Structure in Rascunho | Rascunho, a location/block/equipment/section created, removed, reordered, moved or renamed | Status stays Rascunho, no status op, no status toast |
| Generate from Rascunho | Rascunho, generate queued | `em_revisao`; revision arrives, status stays Em revisão |
| Revision arrives | Em campo/Em revisão, generate queued, revision pulled | Status stays Em revisão; dialog says "ainda não enviada ao cliente" and offers "Marcar como enviado ao cliente" |
| Mark as sent | Em revisão, latest revision current | One `issue` op, Emitido, toast names it |
| `unchanged` generate | Em campo after backward move, nothing edited | `generate` op only, ends Em revisão (not Emitido) |
| Edit after sent | Emitido, a counted edit | Em revisão in the same batch; toast says it reopened and generates rev N+1 |
| Setup gaps | Setup with 3 gaps | Reason names all three in `setupGaps` order: "falta a data de fim, o número da ART e um instrumento" |
| Other devices | Two other devices of one user | One "Último envio" line per user, newest time |

</frozen-after-approval>

## Code Map

- `packages/domain/src/status/table.ts:66-81` -- `TABLE` and its comment; add the two Rascunho rows.
- `packages/domain/src/status/edited-since.ts:17,148` -- `EDITED_SINCE_FAMILIES`; `issueOnRevision` becomes dead, remove it and its 3 tests.
- `packages/domain/src/relatorio/status-advance.ts:19,34` -- `advanceOnEdit` (Decision 1: in Rascunho, ignore `relatorio/setup` drafts); `issuedBannerText` says "emitido" for em_revisao: split into Emitido text and Em revisão "gerada, ainda não enviada" text; add the ficha's Emitido banner text and the status toast texts here.
- `packages/domain/src/relatorio/setup-complete.ts:68` -- `setupIncompleteReason` maps every `setupGaps` entry (keep the ART/TRT council rule) and joins with `listPtBr` (`text/plural.ts:7`).
- `packages/domain/src/relatorio/sumario.ts:139,258,352` -- `META.controle` constant -> use `idleRevisionNumber` (`print/revisions.ts:34`): none "Rev. 1 na primeira emissão", edited "Rev. N+1 na próxima emissão", current "Rev. N emitida"; `generateReason` gains `{status, latest, edited}` for the status-aware foot sentence.
- `packages/domain/src/relatorio/pre-issue.ts:258,484` -- `last_send` rows; add a kernel helper collapsing pushes per user to the newest `at`, used by `apps/web/src/surfaces/export/use-pre-issue.ts:30` and `apps/web/src/surfaces/sync/sync-sections.tsx:204`.
- `packages/domain/src/print/revisions.ts:187-197` -- `readyTitle`, `readyToast`, `nextEditNote`: ready view says not yet sent.
- `apps/web/src/state/generate-watcher.tsx:33,72` -- stop `emitIssueFor` in `finishGenerate`; keep the toast and wait-clear.
- `apps/web/src/surfaces/export/use-generate.ts:162-224,282,302-306` -- drop the `unchanged` branch's issue; simplify `finishReady`; expose `markSent()` = `emitStatus('issue')`.
- `apps/web/src/surfaces/export/export-dialog.tsx:276-347` -- "Marcar como enviado ao cliente" above "Gerar de novo" when `statusTable(status,'issue')` allows and nothing was edited since the latest revision (Decision 2).
- `apps/web/src/db/commit.ts:157,184,219-253` -- `commitBatch`/`commitBatchIf` already return `ops` incl. the appended status op; `apps/web/src/surfaces/relatorio/relatorio-editor.ts:88-117` drops it: surface it so the editor (or `use-undoable-edits.ts:92`) raises the status toast via `showToast` from `apps/web/src/state/toast.tsx`, queued behind an undo toast.
- `apps/web/src/surfaces/relatorio/setup-surface.tsx:181-204,246` -- all-gaps reason; replace toast "Dados salvos" with the status toast.
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx:183-199,446` -- banner via new texts; foot sentence with status, `latestRevision`, `useEditedSince` (`db/generate-store.ts:92`, true until first read); mark-as-sent in the foot while Em revisão; backward move (`sumario-actions.ts:234`) also toasts.
- `apps/web/src/surfaces/ficha/ficha-surface.tsx:146-157` -- add the Emitido banner candidate to `pickBanner` (`state/banner-slot.tsx`), reading revisions from `EntityState`.
- Keep as is: `isAutoPulled`, `sumarioReadingMode`, `sumarioOpensExpanded`, `photos/eviction.ts`, `home/cards.ts`, `suggestion-group.ts:112`, `suggestion-store.ts:203`, api `sync/apply.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/{status,relatorio,print}/**` -- table, advance rule, texts, gap list, controle meta, foot sentence, push collapse -- red unit tests first (`table.test.ts`, `status-advance.test.ts`, `edited-since.test.ts`, `setup-complete.test.ts`, `sumario.test.ts`, `pre-issue-export.test.ts`, `revisions.test.ts`).
- [x] `apps/web/src/state/generate-watcher.tsx`, `surfaces/export/{use-generate.ts,export-dialog.tsx,use-pre-issue.ts}` -- no automatic issue; mark-as-sent; one line per user -- update `generate-watcher.test.tsx`, `export-dialog.test.tsx`.
- [x] `apps/web/src/surfaces/relatorio/{relatorio-editor.ts,setup-surface.tsx,sumario-surface.tsx,sumario-actions.ts}`, `surfaces/ficha/ficha-surface.tsx`, `surfaces/sync/sync-sections.tsx`, `copy/pt-br.ts` -- status toasts, banners, foot, setup reason -- update `setup-surface.test.tsx`, `sumario-surface.test.tsx`, `commit.test.ts`.
- [x] `e2e/status-flow-2026-10-10.spec.ts` (new, `@p0`) -- the whole I/O matrix as a user, at 1280 and 390 px; update `export.spec.ts` 4.8-E2E-004/005, E4-E2E-001, `parecer-export.spec.ts` 7.4-E2E-002, 7.5-E2E-003, `photo-numbers.spec.ts` 7.2-E2E-001, `journey-forward.spec.ts` 12.2-E2E-003 ("Dados salvos"), foot-sentence specs (`relatorio.spec.ts` 4.3-E2E-001, `parecer-export.spec.ts` 7.4-E2E-001, `review-field-defects-2.spec.ts` F-03 F-04, `review-emission-2026-10-08.spec.ts` R8E-E2E-008).
- [x] Planning docs and `docs/kbs/` -- dated amendments listed in Always.

**Acceptance Criteria:**
- Given a relatório in any status, when the Sumário renders, then a sentence right under the status pill in the header names the status's next step (Rascunho: what is missing or that field work moves it; Em revisão: not yet sent + "Marcar como enviado ao cliente"; Emitido with nothing edited: nothing changed since rev N), and the Sticky action bar's reason is the blocking sentence alone, as before this story.
- Given the Sumário at 390 x 844 in Em revisão with mark-as-sent offered, when it renders, then the Sticky action bar is no taller than it was before this story plus one button row, and nothing scrolls sideways.
- Given an Emitido relatório, when a ficha opens, then a banner says editing reopens it as Em revisão and generates rev N+1.
- Given rev 1 generated and nothing edited, when the Sumário renders, then Controle do documento says "Rev. 1 gerada" in Em revisão and "Rev. 1 emitida" once Emitido; after an edit, "Rev. 2 na próxima emissão", matching the Export dialog's Rev. line.
- Given a Rascunho relatório and the first field edit made by a tap that follows a keystroke within 50 ms (the lost-tap durability specs, seeded Rascunho), when the status toast is raised, then no tap is lost on Chromium, Android emulation or WebKit.
- Given an undo toast on screen, when a status toast is raised, then the undo toast is not lost.

## Implementation Notes

- Three passes by one implementation subagent (`bmad-dev-opus-medium`): the spec as approved; decisions 3 to 6 and the WebKit lost tap; review patches P1 to P14.
- Departures from the Code Map, kept on purpose: status toasts are raised centrally (the commit path publishes each change in `apps/web/src/db/status-changes.ts`, the shell's `StatusToaster` says it), not from `relatorio-editor.ts` or `sumario-actions.ts`; `readyTitle` and `readyToast` are unchanged (mock verbatim), the "not yet sent" wording is in `nextEditNote` and the banners; `MARK_SENT_LABEL` lives in the kernel because a derived sentence quotes it; the foot-sentence specs (`relatorio.spec.ts`, `review-field-defects-2.spec.ts`, `review-emission-2026-10-08.spec.ts`) carry no diff since decision 5 put the foot back.
- The lost tap (12.1-E2E-006 on WebKit): WebKit focuses a button on `mousedown`; with "Relatório em campo" overlapping the chip, the toast's focus rule scrolled the newly focused chip clear of it (46 px) between press and release, so `pointerup` landed on a label. Fix in `components/toast.tsx`: a focus given by a pointer press (or within 500 ms of its release) is never scrolled, for any toast, and an edit's status toast is passive (no scroll on display, `pointer-events: none`). Keyboard focus keeps the H-7 scroll.
- Specs seeded Em campo (their first edit is content and their subject is not the status): `support/photos.ts`, `support/reading-ops.ts`, `ficha.spec.ts`, `dry-transformer.durability`, `action-plan`, `review-layout-copy-3`, `review-layout-interaction-2026-10-08`. `lost-taps.durability` and `tree.spec.ts` carry no diff.
- Final gate, run by the coordinator on the patched tree (tools container, host lock): eslint with `--ignore-pattern '.playwright-mcp/**'` 0 errors; static clean; `test:unit` 282 files, 3391 passed; `test:api` 77 files, 577 passed; `test:e2e:full` 466 tests, 461 passed, 1 failed, 4 skipped; `test:e2e:matrix` 108 tests, 96 passed, 1 failed, 11 skipped. The two failures are not this story's: `points` 6.6-E2E-011 fails the same way with every tracked file reverted to the baseline (a focus-restore race, deferred-work row of 2026-10-10); `ficha.durability` F-11 on WebKit is the ledger's known red on this host, not re-checked on the baseline in this run. `pnpm lint` as written fails only on gitignored scratch files under `.playwright-mcp/dyn/` on this machine.
- Hands-on browser pass by the coordinator on the final tree (768 and 390 px, light): Rascunho next step under the pill; a section removed keeps Rascunho; a cabine data field typed on a sheet gives "Relatório em campo" (passive); Setup past Rascunho says "Falta o número da ART e um instrumento."; generate gives Em revisão, "Ainda não enviada ao cliente"; mark as sent gives Emitido, its toast, "Rev. 1 emitida"; the Emitido sheet's banner; an edit reopens it with its toast. The subagent's pass covered 390, 768 and 1280 in light and dark and keyboard-driven actions; a full Tab walk and an `unchanged` generate by hand were not done (SF-E2E-002 covers the latter).
- Open for the independent review (Epic 1 lesson a): re-examine the review-layer patches P1 to P14 and the toast focus change, not only the story's first diff.

## Spec Change Log

- 2026-10-10, after the first implementation pass (coordinator's read of the diff, answered by Matheus): decisions 3 to 6 added to the frozen block with his authorization; the matrix gained "Structure in Rascunho" and its "Setup gaps" example took the kernel's order; three ACs changed (next-step sentence under the pill, Controle "gerada"/"emitida", the 390 px bar) and one was added (no lost tap with the status toast). Avoids: a relatório leaving Rascunho while the office is still building its tree; "emitida" said of a revision not yet sent; a Sticky action bar covering 35% of a phone; a WebKit tap lost to the "Relatório em campo" toast, which the first pass hid by seeding `lost-taps.durability` as Em campo. KEEP: the central publication of status changes from the commit path and the shell's `StatusToaster`; the `status` toast option that never takes the slot; `useMarkSent`/`markSentNow` re-reading the store at write time; `latestPushPerUser`; the Em revisão banner texts; `e2e/support/tree.ts`.

## Review Triage Log

Pass 1 (2026-10-10; blind hunter BH, edge-case hunter EC, verification gap VG). No intent_gap or bad_spec; patches P1 to P14 sent to the implementation subagent.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH1, EC2 | `markSentNow` checks and writes outside one transaction; a double press or an edit landing between them writes Emitido over unsent content or two issue ops; a refused press says nothing | medium | `use-mark-sent.ts:23-34` reads, then `commitBatch`; `commitBatchIf` exists in `commit.ts` for this | patch P1 |
| BH1b | The check sees only ops this device holds; another device's unpulled edit is not seen | low | Inherent to the offline-first store; the op carries `prev_op_id` and the other device's edit carries its own status op when it lands | rejected: unlikely, fix needs a pull barrier |
| BH2, EC6, VG-o1 | Setup shows "Dados salvos" with gaps open once the relatório left Rascunho by field work or a generate | medium | `setup-surface.tsx:243-249` shows `t.completeDone` whenever `canComplete` is false; before this story leaving Rascunho required no gap | patch P2 |
| BH3 | `nextEditNote` says "Ainda não enviada ao cliente" of a revision that was sent, after an edit reopened the relatório | medium | `revisions.ts` reads the status only; Emitido, edit, Em revisão, ready block of revision N | patch P3 |
| BH4 | Toasts answering the user's own press (mark as sent, backward move, Concluir) are passive: no press reaches them and they cannot be closed | low | `status-toaster.tsx` passes `status: true` for every cause; `toast.tsx` sets `data-passive` from it. The queueing behind a live toast is the spec's rule, not a defect | patch P4 (passivity only) |
| BH5 | A displaced status toast shows again for its full time; "Desfazer" can flash the queued "Relatório em campo" | low | `state/toast.tsx` re-queues at the head; needs a status toast and another toast inside 6 s | rejected: unlikely, fix adds queue rules |
| BH6a, EC11, EC12 | A passive toast, and any toast after a pointer press, no longer scrolls the focused field clear (H-7) | low | `components/toast.tsx:316-327`; the exemption is what fixed the WebKit lost tap, and a timer re-check would move the page after a tap again | rejected (behaviour); the EXPERIENCE note is patch P11 |
| BH6b, EC13 | `pointer.down` is one boolean, wrong for two fingers or a release outside the window | low | `toast.tsx:284-290`; worst case one focus is or is not scrolled clear | rejected: unlikely, fix adds pointer bookkeeping |
| BH7, EC7 | The Sumário shows "há alterações" and "Rev. N+1 na próxima emissão" on every open until the edited-since read lands | medium | `generate-store.ts:92-98` defaults to `true`; the banner, the Controle row and the next step read it at once | patch P5 |
| BH8 | Docs say every status change is said; only the ones this device writes are | low | `db/status-changes.ts` publishes from the commit path only; a pulled status op says nothing | patch P11 (wording) |
| BH9 | `countsAsFieldContent` ends in `default: false` and no test forces a decision per family | low | `edited-since.ts`; a new content family would keep Rascunho silently | patch P9 |
| BH10, VG1, VG2 | Coverage gaps: `commitPhotoBatch`'s status publication, the Sync status per-user collapse, the ficha banner | medium | VG demonstrations: deleting `publishStatusChanges` at `commit.ts:360` or reverting `sync-sections.tsx:224` fails no test | patch P7, P8 |
| VG3 | No test makes `markSentNow`'s write-time check refuse | medium | No test file references `markSentNow`; removing lines 26-29 fails nothing | patch P1 |
| BH11, EC5 | The `unchanged` branch lost its pull of an answered revision this device does not hold: no file buttons, and mark-as-sent would name the older held revision | medium | `use-generate.ts` old lines 289-297 removed with the issue op | patch P6 |
| BH12 | Em revisão is written when the job is queued; a failed job leaves it with no revision | low | AD-22 as amended emits at queue; `statusStepText` has the "gere a revisão 1" sentence for it; a backward move recovers | rejected: by the table, unlikely |
| BH13, EC14 | `showsConfirmedGlyph` and `issued()` test Emitido, now "marked as sent" | low | Same behaviour Em revisão already had after an edit; no user harm named | rejected |
| BH14, VG-o3 | EXPERIENCE.md l.262, 337, 389, 577, 579 and the mock note still describe the old flow | low | Only l.261 and l.623 were amended; source-deltas wins, but a reader of those lines builds the old flow | patch P11 |
| BH15a | `app.tsx:73` comment still says the watcher brings the issue op | low | Read | patch P12 |
| BH15b, EC17 | The spec's Code Map and ticked tasks name files not in the diff | n/a | Fix would edit this build's spec | rejected (spec); departures are in Implementation Notes |
| BH16 | `home.spec.ts` 1.6-E2E-001 depends on other specs' leftovers | low | Its parada was moved to December to outrank them | patch P13 |
| EC1 | Emitido with edits (an edit undone) then a queued generate keeps Emitido, so revision N+1 reads "Enviada" | low | `statusTable(emitido, generate)` is null; reaching it needs an edit and its "Desfazer" on an Emitido relatório, then a generate; before this story the same path also stayed Emitido | rejected: unlikely, the fix adds a row to the frozen table |
| EC3 | "Desfazer" after the status moved again puts the older status back | low | `undoBatch` inverts the batch's status op; the undo toast does not outlive a generate or a navigation; same mechanism as before for Emitido | rejected: unlikely |
| EC4 | A generate answered `running` (retry after a lost response) emits no `generate` op | medium, unverified in a run | `use-generate.ts:243` emits for `queued` only; the line predates this story | defer |
| EC8 | A throw inside one chained step leaves `StatusToaster` silent for the session | low | `chain = chain.then(async ...)` with no catch | patch P10 |
| EC9, VG-o2 | A project-scope equipment rename reopens another Emitido relatório and the toast reads as the open one's | medium | `commit.ts` `buildBatch` touches every relatório of the project that references the equipment; the sentence names none | patch P10 |
| EC10 | `statusChangeToastText` says "Relatório em revisão" for any unhandled `to` | low | Last line of the function | patch P10 |
| EC15 | "Desfazer" in Emitido changes content without reopening | false | The undone batch is the edit that reopened it: the inverse restores the sent content and Emitido together; an older undo toast does not survive the ready toast | rejected |
| EC16 | The ficha's Emitido banner is outranked by a conflict or "Sugestões prontas" | false | One banner slot with the documented priority (EXPERIENCE Banner row); the others fold into the chip | rejected |
| VG-o4 | The no-lost-tap AC has one end-to-end observer, which asserts neither Rascunho nor the toast | medium | `lost-taps.durability.spec.ts` `setUp` leaves Rascunho by default only | patch P14 |

## Verification

**Commands (inside `podman compose --profile tools run --rm --user root tools`, under `lockf -t 20000 /tmp/fasor-verify.lock`):**
- `pnpm lint && pnpm static` -- expected: clean.
- `pnpm test:unit` and `pnpm test:api` -- expected: green.
- `pnpm exec tsx scripts/e2e.ts e2e/status-flow-2026-10-10.spec.ts <every touched spec> --project desktop-chrome --project durability-desktop-chrome` -- expected: green; the change touches the commit path (`advanceOnEdit`), so the touched durability specs also run on the matrix projects.

**Manual checks:**
- Playwright MCP pass of the matrix at 390/768/1280 px, light and dark, keyboard only; one offline Rascunho sheet edit.
