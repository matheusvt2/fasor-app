# Review fixes 2026-10-08: batch context

Matheus asked on 2026-10-08 to investigate further and fix the problems found by the field UX, AI and code review of the same day (`_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-field-ux-and-code-2026-10-08.md`, "the report"). This file is the planning context every batch orchestrator loads in place of `epic-<N>-context.md`; the process is `epic-batch-orchestrator.md`. The finding IDs below are the report's own (`CAPT-`, `FLD-`, `AIR-`, `AIB-`, `JRN-`, `WEB-`, `WDT-`, `XC-`, `API-`, `TST-`, `G<n>-`, and `H-<n>` for the manual browser pass in its section 12). Each finding in the report carries its file:line, evidence and proposed fix; read it, verify it against the code on `origin/main`, then fix it with a test that fails before the fix.

## Coordinator decisions

- Scope (Matheus, 2026-10-08): four fix batches that need no product decision (photo failures, plate reading, emission and export, gate integrity) and two decided product changes (the conclusion text confirmed by "Concluir ficha"; NA for oil items on a dry transformer). Everything else in the report, including the rest of the proposed Epic 14 roadmap and every row of its section 10, stays out: do not change that behaviour.
- Decision 1 (Matheus, 2026-10-08, source-deltas row of the same date): "Concluir ficha" and "Concluir e avançar" confirm the kernel-composed conclusion text in the same batch as the conclusion when the result and restriction pair is set and the text was not edited (`conclusion/text`, `text_status = confirmed`, `text_basis`); an edited text is untouched; a text whose basis no longer matches shows as stale through the existing rule. Story 5.8's separate text "Confirmar" stays available. Findings JRN-V1, AIB-1 (the stale row only; AIB-16's single print rule is out).
- Decision 2 (Matheus, 2026-10-08, source-deltas row of the same date): on a block with no subtype, confirming a nameplate `TIPO DE ISOLAÇÃO` of EPÓXI or Á SECO (alone or through "Confirmar todos") writes, in the same undoable batch, the matching dry subtype's NA marks (`OIL_RELATED_ITEMS`, `packages/domain/src/seed/v1.ts:328-342`) on items that have no value yet, and `VOL. ÓLEO` stops counting as missing on a block whose subtype or confirmed insulation is dry. A value already marked is never overwritten. Findings H-4, MKT-7 (the subtype part of Story 14.16 only).
- A finding whose fix would contradict a story AC or a dated note in `epics.md` or `source-deltas.md` is an open question, not a fix.
- ~~No `MIN_CONTRACT_VERSION` raise in this round.~~ *(2026-10-09, Matheus: raised to 16 for PR #121's merge rule (the conclusion text), deployed as a release train in an evening window with the field asked to sync first, G2-5.)* `CONTRACT_VERSION` may rise for an additive shape; if a fix cannot avoid raising the minimum, stop and report it as an open question (G2-1: every minimum raise blocks capture on every online tablet within about 60 s).
- New pt-BR copy goes in the three homes of AGENTS.md; text not taken from a mock is marked `// authored:` and listed in the PR body for Bruno's wording review.
- Lows: fix them when they sit in files the batch already touches or cost minutes; otherwise list them as known open in the PR body. Every high and medium in the batch's list is fixed or explained.
- Every fix gets a test in the project's style. Mechanism fixes (focus, toast, outbox, commit path, wake lock, a browser API with a fallback) ship a mutation run (revert, show red, restore). A story adopting a browser API with a fallback ships an e2e that stubs the API to reject (E13-A7).
- A change to `apps/web/src/state/toast.tsx` or the toast CSS is a wave-level change (R13-4): the batch runs every spec that asserts a toast (grep `toast` in `e2e/`), not only the specs it edited.
- Merges (Matheus, 2026-10-08): the coordinator squash-merges each PR after its green story gate, in arrival order; a batch that merges a changed main re-runs its story gate.

## Batches

| Tag | Wave | Port base | Branch | Dev model · effort | Owns (files) | Findings |
|---|---|---|---|---|---|---|
| r8gate | 1 | 5 | `fix/review-2026-10-08-gate-integrity` | opus · high | `playwright.config.ts`, `scripts/`, `e2e/support/**`, test ids and arrange steps in `e2e/*.spec.ts`, the three unit tests of E13-A2 and their harness (`apps/web/src/**/theme.test.tsx`, `export-dialog.test.tsx`, `number-input.test.tsx`) | TST-V1, TST-V2, TST-2, E13-A2 |
| r8read | 1 | 6 | `fix/review-2026-10-08-plate-reading` | opus · high | `apps/api/src/jobs/reading/**`, `apps/api/src/jobs/audit/provider.ts` (imports only), new `apps/api/src/ai/`, `packages/domain/src/contract/reading.ts`, the kernel parse and reading rules the fixes need (`packages/domain/src/parse/`, `packages/domain/src/reading/` or where the date and unit rules live), nameplate date suggestion display in `apps/web/src/surfaces/ficha/nameplate-suggestions.tsx` only if the year-only value needs it | AIR-1, AIR-V1, AIR-17 and API-1, the shared AWS error and timeout layer of C4 (`classifyAwsError`, `callWithTimeout`; API-3 and API-V2 if they fall out of it); PLN-13 (typed year over a suggested date) if it sits in the same parse |
| r8cap | 2 | 7 | `fix/review-2026-10-08-photo-failures` | opus · high | `apps/web/src/surfaces/ficha/{camera-view.tsx,plate-photo.tsx,photo-openers.tsx,read-display.tsx,reading-line.tsx}`, `apps/web/src/surfaces/relatorio/panel-capture.tsx` (pending row only), a new `apps/web/src/input/use-screen-wake-lock.ts` or similar, `packages/domain/src/{reading,relatorio,photos,prefs}/` for the kernel views and texts, `apps/web/src/surfaces/account/` (wake-lock switch only) | CAPT-V1, FLD-V1, CAPT-V2, FLD-1 (with the "Manter a tela ligada" switch, default on, vocabulary in `packages/domain/src/prefs`), CAPT-16 if the pending row needs one clock; from the browser pass (section 13): DE-2 (closing the camera scrolls the sheet half a viewport: `focus-restore.ts` focuses without `preventScroll`), DB-4 (the camera stays 7.5-8 s after a single shot with no saving indicator), DG-4 ("está demorando" for a photo not uploaded yet), DG-2 (a reading that lands after an offline conclusion offers only "Substituir"; add keeping the typed value) |
| r8emit | 2 | 8 | `fix/review-2026-10-08-emission` | opus · high | `apps/web/src/surfaces/export/**` (except `export-dialog.test.tsx`'s E13-A2 case, owned by r8gate), `apps/web/src/surfaces/relatorio/sumario-surface.tsx` (rename refusal), `packages/domain/src/relatorio/pre-issue.ts` (plural only), `apps/web/src/copy/pt-br.ts` (its keys), `apps/api/src/jobs/audit/{worker.ts,job.ts}`, `apps/web/src/state/toast.tsx` and the toast CSS for H-7 | QW25 (XC-V2, XC-7, WEB-6, WDT-V1), WEB-3, XC-4, API-V1, H-7 (FLD-7's covering part: a toast never covers the field it just changed or the focused field; arrival toasts do not sit over content for minutes); from the browser pass (section 13): DB-5, DG-3, DC-4, DE-5 (reading-arrival toasts: never expire, cover the suggestion, fire for readings already on screen or for caption rows, "Ver" is a no-op on the open sheet or leaves the gallery), DE-6 (bottom clearance so an undo toast never blocks the last rows at 390 px), DF-1 ("Pré-visualizar" and "Gerar relatório" reachable without scrolling the whole Sumário), DF-6 (the issue confirmation names blank CNPJs and a missing logo with the other blank fields) |
| r8conc | 3 | 5 | `fix/review-2026-10-08-concluir-text` | opus · high | `apps/web/src/surfaces/ficha/{use-ficha-actions.ts,conclusao-section.tsx}`, `packages/domain/src/relatorio/conclusion.ts` and the sheet actions it needs, the tap-budget specs (J1, J3) | Decision 1: JRN-V1, AIB-1 (stale row) |
| r8dry | 3 | 6 | `fix/review-2026-10-08-dry-transformer` | opus · high | `packages/domain/src/{seed/,relatorio/,schemas/block-config.ts}` for the subtype rule and required-field rule, `apps/web/src/surfaces/ficha/{nameplate-section.tsx,nameplate-suggestions.tsx,checklist-section.tsx}` | Decision 2: H-4, MKT-7 (subtype part) |
| r8lay | 4 | 7 | `fix/review-2026-10-08-layout-interaction` | opus · high | `apps/web/src/styles/app.css` (mock translations; `tokens.css` and `components.css` stay byte-identical), `apps/web/src/surfaces/ficha/{ficha.css,ficha-fields.tsx,measurement-field.tsx,ensaios-section.tsx}`, `apps/web/src/surfaces/relatorio/{relatorio.css,relatorio-tree.tsx}`, `apps/web/src/components/{registry-picker-field.tsx,form-dialog.tsx}`, `apps/web/src/surfaces/registries/instrument-panel.tsx` | from the browser pass (section 13): DB-1, DC-1, DG-1 (the TTR table at every tablet width: fixed layout sizes 6 of 8 columns, 24-36 px inputs, hidden third phase and Condição), DA-1 (phone: the second Novo relatório dialog cannot scroll to "Criar relatório" at 800 px height or less), DA-8 (ficha at 768 with the rail open scrolls sideways and clips the primary button), DB-3 and DA-6 (tables and tree rows break mid-word at 390 px), DB-7 (Enter moves to the next field in the plate and cabine blocks), DB-2 (a stray tap on the unit button changes GΩ to TΩ, even on a concluded sheet), DH-1 (a manufacturer typed under "Outro…" is lost unless "Criar" is tapped), DH-3 (the instrument panel hides a manufacturer missing from the registry) |

Waves start from `origin/main` after every PR of the previous wave merged. Wave 4 (`r8lay`) was added on 2026-10-08 from the browser pass of the report (section 13); it owns the CSS translations in `app.css`, so a wave 2 or 3 batch that needs an `app.css` rule adds it in its own clearly commented block and `r8lay` merges around it. Wave 3 shares the ficha: `r8conc` owns the conclusion files, `r8dry` the nameplate and checklist files; a change either needs in the other's files goes through a `deferred-work.md` entry, not an edit.

## Cross-batch contracts

- `r8gate` lands `forbidOnly: true` (and `allowOnly: false` where Vitest supports it) first; later batches must not use `.only`.
- `r8read` owns the new `apps/api/src/ai/` module; `r8emit`'s audit fixes import from it only after `r8read` merged (wave 2 starts after wave 1).
- `r8cap` and `r8read` both touch the reading's "done" outcome: `r8read` does not change what a reading with zero suggestions stores; `r8cap` builds the "Nada foi lido nesta foto" view on the stored state as it is.
- `r8emit` and `r8conc` both touch toast-adjacent flows; `r8conc` builds on the merged toast rule.
- Both wave 3 batches change the ficha's commit batches: each runs its touched durability specs on `pnpm test:e2e:matrix` (E10-A4).

## Load and lock

- The coordinator's review stack `fasor-review` (port base 4) is stopped since the browser pass ended; at most two batch stacks run at a time.
- Every Playwright run is under `lockf -t 20000 /tmp/fasor-verify.lock`, started with `nohup` and polled through a tagged log.
- A new worktree reuses the existing images with `podman tag localhost/app-api-review:latest localhost/app-api-<tag>:latest` and `podman tag localhost/app-tools-review:latest localhost/app-tools-<tag>:latest` (the images of commit `e0efac7`).

## Outcome (2026-10-09)

| Tag | PR | Merge |
|---|---|---|
| r8read | #115 | e2527c8 |
| r8gate | #116 | 66b4761 |
| wave 1 gate fixes | #117 | 342911f |
| r8cap | #118 | f0adf33 |
| r8emit | #119 | f057f9b |
| r8dry | #120 | 9027abf |
| r8conc | #121 | 326e676 |
| r8lay | #122 | 375c2d6 |

What each PR changed, the gates, the decisions taken during the round and the open questions it leaves are in section 14 of the report.
