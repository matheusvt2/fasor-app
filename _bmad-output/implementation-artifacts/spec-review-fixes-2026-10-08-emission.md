---
title: 'Review fixes 2026-10-08: emission and export (barrier guards, visible refusals, toasts that never cover the field)'
type: 'bugfix'
created: '2026-10-08'
status: 'done'
baseline_revision: '66b476140e8d579fa2bd7426daa741b58c213ff8'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-fixes-2026-10-08-context.md'
warnings: ['batched', 'oversized']
# batched: the review-fixes round cuts its batches by surface (context row r8emit, Matheus 2026-10-08); these items share the Export dialog, the Sumário foot and the toast slot.
deferred:
  - summary: >-
      An env reading for a ficha whose cabine block is collapsed may be neither drawn nor announced.
    evidence: |-
      Edge Case Hunter, maybe-false: `suggestionOnScreen` treats every `location/{cabine}/env/*` row as on screen on any ficha of that cabine; settle by checking whether the collapsed "Da cabine" line draws a pending env suggestion.
    location: >-
      packages/domain/src/relatorio/arrivals.ts
    severity: medium (unverified)
  - summary: >-
      A panel suggestion arriving while its Sumário ?panel= result dialog shows it is still announced by the arrival toast.
    evidence: |-
      Pre-existing: every arrival was announced before this batch; `ArrivalScreen` has no kind for the panel dialog.
    location: >-
      apps/web/src/state/reading-arrivals.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The 2026-10-08 review (`_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-field-ux-and-code-2026-10-08.md`, "the report"; grep each ID) found, all verified on `origin/main` 66b4761: "Pré-visualizar" and "Conferir antes de emitir" run with dead ops that "Gerar relatório" refuses, the audit drain ignores an expired session, and neither stops when the dialog closes or the surface unmounts (QW25: XC-V2, XC-7, WEB-6, WDT-V1; `use-preview.ts:78-127`, `use-audit.ts:56-96` vs `use-generate.ts:366-369`); the Sumário rename drops its refusal (WEB-3, `sumario-surface.tsx:233-251`); "1 aviso — estão nas linhas do sumário" and "+1, outras condições" (XC-4); the audit worker's invalid-payload path never writes `finished_at` (API-V1, `audit/worker.ts:56`; deferred-work.md entry "audit worker's invalid-payload path"); toasts cover the field just changed, the focused field and the last rows at 390 px (H-7, FLD-7 covering part, DE-6); reading-arrival toasts fire for suggestions already on screen and for caption rows, cover what they announce, never leave, and "Ver" is a no-op on the open sheet or leaves the gallery (DC-4 merging DB-5, DE-5, DG-3; `reading-arrivals.tsx`); "Pré-visualizar" and "Gerar relatório" sit at the end of a long Sumário (DF-1); the issue confirmation never names the CNPJs printed "—" nor the missing logo (DF-6).

**Approach:** One shared drain for preview and audit with dead-op, re-auth and abort guards; visible refusals; kernel plurals and confirmation parts; one row invariant fixed with a test; a toast clearance (scroll padding plus bottom room) and a focused-field rule in the toast mechanism; arrival toasts filtered by what is on screen and withdrawn once served; a sticky Sumário bar.

## Boundaries & Constraints

**Always:**
- Kernel owns every derived text, plural and rule (AD-1/AD-13): new texts go in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`; new pt-BR not from a mock carries `// authored:` (list them all in the final report).
- "Like Gerar": a dead op (outbox `status = 'dead'`) stops the press before anything is asked of the server; the button stays enabled and the sentence says why (Gerar's `phase.kind === 'blocked'` pattern, `export-dialog.tsx:365-366`).
- Toasts keep EXPERIENCE.md:262/:412 and Q-1/R-1 (`state/toast.tsx` header): an action toast does not expire on a timer; undo toasts stay until dismissed; the queue rules and `arrival`/`outcome` options are unchanged.
- The toast clearance is the toast's own height plus the `--sp-3` gap, never derived from its position (`--toast-bar` already depends on the sticky bar; a position-derived clearance feeds back into itself).
- `tokens.css` and `components.css` stay byte-identical; CSS goes in `app.css` or the surface CSS in a block headed `/* Review fixes 2026-10-08 (batch r8emit): <ID> */` (r8lay merges around it in wave 4).
- Tests in the project's style; every e2e test id unique and prefixed `R8E-`; no `.only`; new `@p0` specs assert committed state (outbox/store) where a write is involved; a spec matching the serial guard regex of `scripts/e2e.test.ts:487` goes in `SERIAL_SPECS`.

**Never:**
- No timed expiry for action toasts (DE-6 refuted it; open question below). No change to the confirmation's trigger (decision D1, EXPERIENCE.md:337: empty sheets or `[Rótulo]` blanks). No `MIN_CONTRACT_VERSION` or `CONTRACT_VERSION` change. No server-job barrier refactor of `use-generate.ts` or `generate-watcher.tsx` (report 3.1 / C1 stays out). No edit of `camera-view.tsx`, `focus-restore.ts` (r8cap), `tree-actions.ts`, `relatorio-tree.tsx`, `sprint-status.yaml`, `epics.md`, `tokens.css`, `components.css`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Preview, dead op held | `counts.dead > 0`, press "Pré-visualizar" (dialog or Sumário foot) | No tab opened, no sync drain, no `/preview` POST; refusal sentence shown (`role="alert"`) where the preview failure shows today | Button stays enabled; the next press re-checks |
| Preview, op dies mid-drain | a drain round finds a dead op | Tab closed, no POST, same refusal | — |
| Audit, dead op | dead op held or found mid-drain | No `/audit` POST; refusal in the audit block; button enabled | — |
| Audit, session gone | `session.reAuthRequired` true before or during the drain | No POST; `SessionExpiredNote` in the audit block (not `copy.audit.failed`) | 401 still calls `publishReAuth()` |
| Close during drain | dialog closed (`isOpen` false) or hook unmounted while draining or between ask attempts | Waits abort, no POST after the abort, the preview tab closed, no failure line | An abort is never logged as a failure |
| Rename refused | Sumário TagDialog "Salvar" while the fresh store holds the TAG on another row (or the row is gone) | Toast with the refusal (`tagTakenText` / `emptyTag` / `copy.sumario.tree.gone`, "A ficha mudou em outro aparelho; nada foi alterado."); nothing written | — |
| Precheck count 1 | one summarized warning | "1 aviso — está na linha do sumário; não impede gerar." (N: "N avisos — estão nas linhas do sumário; nenhum impede gerar.") | — |
| "+N" chip | 1 / N folded banners | aria-label "+1, outra condição — abrir status de sincronização" / "+N, outras condições — …" | — |
| Confirmation names identity gaps | asked (empty sheets or blanks) with client CNPJ blank, empresa CNPJ blank, no logo | "Emitir com 93 fichas vazias, 2 campos em branco, os CNPJs do contratante e da contratada em branco e o logo da empresa não cadastrado?"; foot reason "Emitir pede confirmação: …" names the same | Not asked when only CNPJ/logo are missing (trigger unchanged) |
| Invalid audit payload | queue job with parseable run/company ids, unparseable rest, run row exists | Run row: `status failed`, `error audit_failed`, `finished_at` = `deps.now()`; row passes `auditRunRowSchema` | No row / bad ids: logged only, never throws |
| Arrival on the open sheet | pulled suggestions all target the open ficha (block id, or env fields of its cabine) | No toast | — |
| Arrival elsewhere | suggestions of another sheet | Toast "N leituras prontas para confirmar · Ver"; withdrawn once none is pending or all are on screen | — |
| Caption arrival | only caption rows; gallery of that relatório not on screen / on screen | Toast `legendasSugeridasText(n)` with "Ver" opening `/relatorio/{id}/fotos` / no toast | Caption rows never count as "leituras" |
| "Ver" on its own target | target equals the current pathname | Scrolls to and focuses the first pending suggestion on the page; no navigation | No suggestion element: closes only |
| Focused field under a toast | a toast appears, or focus moves, onto an element the toast box overlaps | The element scrolls clear above the toast | Elements inside a dialog or the toast are left alone |

</intent-contract>

## Code Map

- `apps/web/src/surfaces/export/use-preview.ts` -- press, drain `:84-91`, ask `:94-105`, poll `:109-124`; `reAuthRequired` ref `:58`; tab open/close `:39-76`.
- `apps/web/src/surfaces/export/use-audit.ts` -- drain `:60-66` (no re-auth), ask with `audit_running` `:68-84`, poll `:87-95`, reopen poller `:101-116`.
- `apps/web/src/surfaces/export/use-generate.ts:366-369` -- the dead-op rule to mirror (`counts.dead > 0` -> `blocked`); read-only.
- `apps/web/src/surfaces/export/session-expired.tsx` -- `SessionExpiredError`, `isSessionExpired`, `SessionExpiredNote`.
- `apps/web/src/surfaces/export/export-dialog.tsx` -- preview button `:236-244`; audit block `:461-484`; preview failure slot `:521-529`; precheck count `:444-456`; `isOpen` prop (the hooks stay mounted while closed: GenerateAction always renders the dialog).
- `apps/web/src/surfaces/relatorio/sumario-surface.tsx` -- `onRename` `:233-251` (refusal dropped); foot bar `:428-460` (its own `usePreview`, failure slot); `showToast` comes from `useToast()` or the editor.
- `apps/web/src/surfaces/relatorio/tree-actions.ts:391-421` -- the tree's rename with its refusal toast and `t.gone`: the pattern to copy (read-only).
- `apps/web/src/surfaces/relatorio/relatorio.css:131-132` -- Sumário bar `margin-top: auto` only; `apps/web/src/surfaces/ficha/ficha.css:85-88` -- the ficha's sticky rule and 480 px unstick to mirror.
- `apps/web/src/components/toast.tsx` -- `useStickyBarClearance` (`--toast-bar`), `stickyBarCovered`, `useStickyBarScrollPadding` (`--sticky-bar-covered`, mounted by `surfaces/ficha/sticky-action-bar.tsx:38`).
- `apps/web/src/state/toast.tsx` -- provider, queue, `withdrawToast`, `ToastOutlet` (inside the router).
- `apps/web/src/styles/app.css:747-756` (`.toast` fixed), `:784-796` (`scroll-padding-*`).
- `apps/web/src/state/reading-arrivals.tsx` -- `arrivalStep`, `arrivalTarget` (`:84-99`), `ReadingArrivals` (`:102-139`).
- `packages/domain/src/relatorio/suggestion-rows.ts` (`suggestionBlockId`, `suggestionTarget`), `photos/captions.ts` (`captionSuggestionPhotoId`, `legendasSugeridasText`), `relatorio/plate-suggestions.ts:151-158` (`arrivedReadingsCount`, `leiturasProntasText`), `relatorio/progress.ts` (`cabineLocationIds`).
- Suggestion DOM: `[data-suggestion-id]` (`read-display.tsx:299`, `nameplate-suggestions.tsx:426`), `.suggestion-field[data-state="suggested"]` (`components/suggestion-field.tsx`).
- `packages/domain/src/relatorio/pre-issue.ts` -- `exportPrecheck` `:483-487`; `issueConfirmation`/`issueBlanksText`/`issueConfirmText`/`issueConfirmReason` `:500-547`.
- `packages/domain/src/print/document-control.ts:47-52` -- `partyLine`: when "CNPJ —" prints; `checks/pre-issue.ts:33` -- the logo rule.
- `apps/web/src/copy/pt-br.ts:154` (`banner.moreLabel`), `:479` (`deadOpsReason`), `:491` (`countMeta`), `:1581-1600` (`audit`); `apps/web/src/state/banner-slot.tsx:171`.
- `apps/api/src/jobs/audit/worker.ts:38-64` -- `recordInvalidPayload`; `job.ts:133` and `http/audit.ts:145` write `finished_at`; pattern test `apps/api/src/jobs/generate/worker.integration.test.ts:88-115`.
- Tests to extend: `surfaces/export/{export-dialog,audit}.test.tsx`, `surfaces/relatorio/sumario-surface.test.tsx`, `state/{toast,reading-arrivals,banner-slot}.test.tsx`, `packages/domain` tests beside each kernel file. E2E helpers: `e2e/support/outbox.ts` (`serverOnlyOp` + `seedOutbox` makes a dead op), `e2e/support/relatorio-flow.ts` (`confirmIssue`), reading arrivals in `e2e/reading-wait.spec.ts` / `e2e/plate.spec.ts`.
- Existing assertions this changes: `e2e/review-field-defects-2.spec.ts:218,225` (anchored question and foot texts; the worker seed's empresa has no CNPJ and no logo), `export-dialog.test.tsx` confirmation texts.

## Tasks & Acceptance

**Execution:**
- `apps/web/src/surfaces/export/server-job.ts` (new) -- `drainForServerJob(db, engine, { maxRounds, retryMs, signal, isSessionExpired })`: per round abort check, re-auth check (`SessionExpiredError`), `syncNow`, dead count (`DeadOpsError`), unsent + uploads; abortable `wait(ms, signal)`; `JobAborted`. Unit-test it.
- `use-preview.ts`, `use-audit.ts` -- use it; check `sync.counts.dead` synchronously at press (before `openBlankTab`); new `blocked` state; audit re-auth and `sessionExpired` flag; `cancel()` aborting the press in flight; abort on unmount; abort checked before every POST and between ask attempts.
- `export-dialog.tsx` -- call `preview.cancel()`/`audit.cancel()` when `isOpen` turns false; render the preview refusal and the audit refusal / `SessionExpiredNote`; precheck count from the kernel.
- `sumario-surface.tsx` -- foot preview refusal; rename refusal toast (and the gone case); mount `useStickyBarScrollPadding()` for the now sticky bar.
- `relatorio.css` -- DF-1 block: Sumário bar `position: sticky; bottom: 0`, static under 480 px height.
- `copy/pt-br.ts` -- `// authored:` `export.deadOpsPreviewReason` "Há alterações rejeitadas — resolva em Sincronização antes de pré-visualizar." and `audit.deadOpsReason` "Há alterações rejeitadas — resolva em Sincronização antes de conferir."; remove `countMeta` and `banner.moreLabel`.
- `packages/domain/src/relatorio/pre-issue.ts` -- `ExportPrecheck.countMetaText`; `IssueConfirmation` gains `blankCnpjs: readonly ('contratante' | 'contratada')[]` and `logoMissing: boolean`, named after the counts only when the question is asked; authored parts "o CNPJ do contratante em branco", "o CNPJ da contratada em branco", "os CNPJs do contratante e da contratada em branco", "o logo da empresa não cadastrado".
- `packages/domain/src/sync/status.ts` -- `outrasCondicoesLabel(n)`; `state/banner-slot.tsx` uses it.
- `apps/api/src/jobs/audit/worker.ts` -- invalid path also puts `finished_at`; new `worker.integration.test.ts`; close the deferred-work.md entry (dated line, state done).
- `apps/web/src/components/toast.tsx` + `state/toast.tsx` -- `--toast-clearance` on the root while a toast is up; focused-element rule on display and `focusin`.
- `app.css` -- `scroll-padding-bottom` adds `--toast-clearance`; bottom room so the last rows scroll above the toast, placed before a page's sticky bar where there is one (padding after the bar does not help: the bar and the toast rise with it).
- `packages/domain` (arrival filter beside `plate-suggestions.ts` or a new `relatorio/arrivals.ts`) + `state/reading-arrivals.tsx` -- on-screen filter, caption split, "Ver" on its own target, withdraw once served.
- E2E: `e2e/review-emission-2026-10-08.spec.ts` and `e2e/review-toasts-2026-10-08.spec.ts`; update `review-field-defects-2.spec.ts` assertions.

**Acceptance Criteria:**
- Given a relatório with one dead op, when the engineer presses "Pré-visualizar" in the dialog and on the Sumário foot, and "Conferir antes de emitir", then no popup opens, no `/preview` or `/audit` request is sent, the dead op stays dead in the outbox, and each surface shows its refusal sentence (`@p0`, R8E-E2E-001).
- Given a press of "Conferir antes de emitir" or "Pré-visualizar" draining, when the dialog closes, then no POST follows and nothing reads as failed on reopen (unit, with a mutation run).
- Given the audit drain with the session expired, then no POST and the sign-in note shows (unit).
- Given a Sumário with section 9 expanded and at least 20 sheets, at 390, 768 and 1280 px, when it opens at the top, then "Pré-visualizar" and "Gerar relatório" are in the viewport, are the topmost elements at their centres, and a click opens the dialog without scrolling (`@p0`, R8E-E2E-002).
- Given the Sumário rename dialog and a TAG taken in the store meanwhile, when "Salvar" is pressed, then the refusal toast shows and no op is written (unit).
- Given 390 px and an undo toast on screen in the gallery and on the ficha photo strip, when the engineer scrolls to the end, then the last row's centre is not under the toast (`elementFromPoint`) and a tap on it acts (`@p0`, R8E-E2E-003, mutation run).
- Given a focused field the toast would cover, when the toast appears, then the field ends fully above the toast's top edge (`@p0`, R8E-E2E-004).
- Given a reading that lands for the open ficha, then no arrival toast; for another sheet, the toast's "Ver" opens it and the toast is gone there; a caption-only arrival reads "N legendas sugeridas" and "Ver" opens the gallery; none while on the gallery (`@p0`/`@p1`, R8E-E2E-005..007; kernel unit tests for the filter).
- Given the issue confirmation asked with blank CNPJs and no logo, then the question and the foot reason name them (`@p1`, R8E-E2E-008, plus kernel units); given no empty sheet and no blank field, then no question (unit).
- Given an invalid audit payload with a run row, then the row is failed with `finished_at` set (api integration).

## Spec Change Log

## Review Triage Log

### 2026-10-08 — Review pass
Layers run: Edge Case Hunter, Verification Gap Reviewer. Skipped: Blind Hunter, Intent Alignment (token economy; the integrated epic review covers them).
- verdicts: 20 findings — high 1, medium 8, low 10, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` VG: an env reading for the open ficha's cabine (`arrivalScreen` deriving `cabineId`) has no web test — web unit case added (env row on the open ficha, no toast).
  - `[medium]` `[patch]` VG: no test that an unmount aborts the audit tap — `unmount()` case added to `audit.test.tsx`.
  - `[medium]` `[patch]` VG: no test that Tab onto a row of the now sticky Sumário stops above the bar — Tab leg added to R8E-E2E-002 at 390 and 1280 px.
  - `[medium]` `[patch]` VG: the no-sticky-bar toast clearance rules of `app.css` are untested — R8E-E2E-003 leg on a page with no sticky bar.
  - `[medium]` `[patch]` VG: the Sumário rename's "row gone" refusal has no test — unit case added.
  - `[low]` `[patch]` VG other (grouped with ECH "confirmed field"): "Ver" can focus a confirmed nameplate cell carrying `data-suggestion-id` — selector excludes `data-state="confirmed"`.
  - `[medium]` `[patch]` VG other: announcements held by text merge ids across a dismissed or replaced toast, so a later same-text toast is never served and stays over its fields — a new toast replaces its text's set; dismissing drops it.
  - `[high]` `[patch]` ECH: `keepClearOfToast` scrolls a focused element taller than the room above the toast (a `.ficha-step` host focused by the stepper) to its end — the rule never scrolls past the element's own top and skips when it cannot fit.
  - `[low]` `[patch]` ECH: `focusFirstSuggestion` picks a confirmed nameplate cell — same fix as the grouped VG row.
  - `[low]` `[reject]` ECH: "Ver" on the shown address with nothing to focus only closes — the matrix row says "No suggestion element: closes only"; the Sumário fallback of `arrivalTarget` is pre-existing.
  - `[medium]` `[patch]` ECH: "Ver" targets the first sheet with any pending suggestion, so an open ficha with older pending suggestions keeps it from opening the announced sheet — the target is computed among the announced rows still pending first.
  - `[maybe-false]` `[defer]` ECH: an env suggestion on a ficha whose cabine block is collapsed may be neither drawn nor announced — settle by checking whether the collapsed "Da cabine" line draws a pending env suggestion (if true: medium, unverified).
  - `[low]` `[defer]` ECH: a panel suggestion arriving while its Sumário `?panel=` dialog shows it is still announced — pre-existing (every arrival was announced before); needs a screen kind for the panel dialog.
  - `[low]` `[reject]` ECH: one pull with captions of two relatórios counts both while "Ver" leads to one gallery — one engineer works one relatório at a time; the fix adds grouping.
  - `[low]` `[reject]` ECH: readings and captions in one pull announce only the readings — one toast at a time; the captions stay on the gallery line and Sumário row 7; listed as known open.
  - `[low]` `[reject]` ECH: a route change during the `arrivalScreen` read judges the screen just left — a milliseconds window; the fix adds a re-check loop.
  - `[low]` `[patch]` ECH: `arrivalScreen` rejecting drops arrivals — `.catch` to `{ kind: 'other' }`.
  - `[low]` `[patch]` ECH: the `blocked` refusal stays after the dead op is gone or across a close/reopen — cleared when `counts.dead` is 0 and on `cancel()`.
  - `[low]` `[patch]` ECH: with no client or no empresa the question names a blank CNPJ while the whole party prints "—" — named only for a party with a name and a blank CNPJ.
  - `[medium]` `[patch]` ECH: before the first outbox read `counts.dead` is 0, so a press right after load opens and closes a tab and R8E-E2E-001 can flake — the e2e waits for the Sync badge's `data-dead="1"`; the product race (a tab flash, the refusal still shown by the drain) is inherent to opening the tab inside the press.

### 2026-10-08 — Independent review of PR #119 (coordinator, four lenses with adversarial verification)
- verdicts: 19 kept findings — high 1, medium 3, low 15 (severities as corrected by the verifiers); 1 refuted.
- findings:
  - `[high]` `[patch]` r8emit-toast-1: an env reading on a non-first ficha of a complete cabine (block collapsed) was neither drawn nor announced, and an announcement made elsewhere was withdrawn there — kernel `fichaArrivalScreen` gives the cabine only on its first sheet or while it is incomplete; unit tests and R8E-E2E-009. This settles the frontmatter deferral "env reading on a collapsed cabine".
  - `[medium]` `[patch]` r8emit-toast-3: dropping the toast's bottom room shifted a page scrolled to its end — the room (`--toast-room`, `data-toast-room`) is separate from the scroll padding and lingers until a scroll takes it out of view, a route change or the next toast; unit tests and R8E-E2E-010.
  - `[medium]` `[patch]` r8emit-rules-4 with r8emit-correctness-tests-2: four new fixed waits, two before "announces nothing" checks — replaced by observable conditions (same-pull count, a recorded toast list ended by a positive control, a second `syncNow`); lint back to 24 warnings.
  - `[medium]` `[docs]` r8emit-rules-1 with r8emit-correctness-tests-3 and r8emit-rules-7: narrowings, open questions, deferrals and residual risks entered in `deferred-work.md` with owners; the E13-A1 row naming E5-A2-E2E-003 carries a dated note on the test-side fix.
  - `[low]` `[revert]` r8emit-rules-2: "Ver" opening the announced sheet first contradicted Story 8.2's AC and FR-42 — restored to the first sheet in tree order; raised as an open question (PR body, ledger).
  - `[low]` `[patch]` r8emit-rules-8: the readings-over-captions precedence moved to the kernel (`arrivalToAnnounce`), with a mixed-pull unit test.
  - `[low]` `[patch]` r8emit-toast-4: a toast leaving with the focus in it (not through its own controls) hands the focus back as Esc does.
  - `[low]` `[patch]` r8emit-export-barrier-1: `guardBeforeAsk` (abort, session, dead op) before every POST, the 409 retries included.
  - `[low]` `[patch]` r8emit-export-barrier-3: `publishReAuth` runs before the abort early-return.
  - `[low]` `[patch]` r8emit-export-barrier-4: the Sumário foot shows `SessionExpiredNote` for an expired session.
  - `[low]` `[docs]` r8emit-rules-5: a ledger row asks for dated EXPERIENCE.md amendments (:273, :337, :262/:379).
  - `[low]` `[patch]` r8emit-rules-6: the DF-1 comment cites DESIGN.md › Sticky action bar and `ficha.css`; files outside the ownership row are listed in the PR body.
  - `[low]` `[known open]` r8emit-toast-2 (nested scroller), r8emit-export-barrier-2 (poll ignores a gone session, pre-existing), r8emit-correctness-tests-1 (closing the dialog after the preview job was asked drops it): ledger row and PR body.
  - `[low]` `[known open]` r8emit-rules-3: 6.6-E2E-011 red on the gate and on the base; waiver is the coordinator's (PR body).

## Design Notes

- Open questions (report, do not decide): a timed expiry for arrival toasts; whether a blank CNPJ or a missing logo alone should ask before issuing; shortening undo copy to one line at 390 (DE-6, DC-4 "1-2 lines").
- Cross-batch: r8cap owns the camera's return focus (DE-2, `camera-view.tsx:313-317`); the "scroll to the read fields after the camera closes" part of DC-4 is theirs. r8conc builds on this batch's toast rule. r8lay merges around the CSS blocks.
- Mutation runs (report each in the final report): the press-time dead-op check, the abort on close, the toast clearance, the on-screen arrival filter.

## Verification

**Commands (inside the tools container, `podman compose --profile tools run --rm --user root tools ...`):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- expected: green.
- Targeted Playwright only under the host lock (orchestrator runs the gate): `pnpm exec tsx scripts/e2e.ts <spec> --project desktop-chrome --grep R8E` -- expected: green.

## Auto Run Result

Status: done (one review loop; story gate run by the orchestrator, results in the PR body).

**Summary:** Preview and audit share `drainForServerJob` (dead-op, re-auth and abort guards); a dead op refuses both at the press with their own sentence; closing the dialog or unmounting aborts the press; the audit shows the sign-in note when the session is gone. The Sumário rename toasts its refusals and its foot bar is sticky. Kernel plurals for the precheck sentence and the "+N" chip; the issue confirmation names a named party's blank CNPJ and the missing logo when it asks (trigger unchanged). The audit worker's invalid payload writes `finished_at`. Toasts reserve their own height (`--toast-clearance`, scroll padding and bottom room) and scroll a focused field clear; reading arrivals skip what the screen draws, captions are their own toast, an announcement is withdrawn once served, and "Ver" on its own address focuses the first pending suggestion.

**Files:** `apps/web/src/surfaces/export/{server-job.ts (new), use-preview.ts, use-audit.ts, export-dialog.tsx}` guards and refusals; `apps/web/src/surfaces/relatorio/{sumario-surface.tsx, relatorio.css}` rename refusal, sticky foot; `apps/web/src/components/toast.tsx`, `apps/web/src/state/toast.tsx`, `apps/web/src/styles/app.css` toast clearance and focused-field rule; `apps/web/src/state/{reading-arrivals.tsx, banner-slot.tsx}`; `apps/web/src/copy/pt-br.ts` two authored refusals, two keys moved to the kernel; `packages/domain/src/relatorio/{arrivals.ts (new), pre-issue.ts}`, `packages/domain/src/sync/status.ts`; `apps/api/src/jobs/audit/worker.ts` plus `worker.integration.test.ts`; e2e `review-emission-2026-10-08.spec.ts`, `review-toasts-2026-10-08.spec.ts`, `review-field-defects-2.spec.ts`.

**Review:** 20 findings (high 1, medium 8, low 10, maybe-false 1); 14 patched (1 high, 8 medium, 5 low counted by row; the confirmed-field pair is one entry), 2 deferred (frontmatter), 4 rejected with reasons in the triage log.

**Follow-up review recommended:** true. This first pass patched one high (the focused-field scroll for a tall element) and several mediums; the named unverified risk is the toast rule's interaction with section jumps and arrivals on a real tablet, which the wave's integrated QA browser pass should cover.

**Verification:** implementer: lint, static, unit, api green; the 43 toast specs plus the new specs on both desktop projects (353 passed, 2 failing also on the base); mutation runs red for the press-time dead check, the cancel on close, the clearance write, the on-screen filter, the bottom-room CSS and each review-loop rule. Orchestrator: the story gate after merging origin/main 342911f (see the PR body).

**Residual risks:** a pull carrying readings and captions announces only the readings; a press right after load, before the first outbox read, can flash and close a tab before the drain refuses; the deferred env-on-collapsed-cabine case.
