---
title: 'e25a: what is typed is saved (conclusion text, manufacturer, readings) and a sheet edit is sent by itself (Stories 25.2 and 25.3)'
type: 'feature'
created: '2026-11-11'
status: 'in-progress'
baseline_revision: '203226f5545f77aebbc0b26a01c4e156002756e1'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-25-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Stories 25.2 and 25.3 are wave 1 of Epic 25 (decision 2): both change the commit path (apps/web/src/db/commit.ts, use-field-commit) and ship with one deploy, so they run as one batch with one gate (epic-25-context.md, batch plan).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno's M02 and M03. (a) Text typed in the sheet's conclusion text, the manufacturer (FABRICAÇÃO) and a reading is lost when the technician moves to another sheet without tapping outside the field: `useFieldCommit` disposes the pending value on unmount and drafts are saved only on `visibilitychange`/`pagehide`. The confirmed conclusion text also looks like a field before "Editar". (b) A sheet edit asks for no sync cycle: it waits for the 60 s tick, for every photo upload of a running cycle, or for "Sincronizar agora"; file transfers have no time limit, and nothing tells the technician that edits have waited for minutes while online.

**Approach:** 25.2: each of the three fields commits on unmount as its own leave would (number: as a blur; manufacturer: as `commitLeft`; text: flush), an unparseable reading is saved as a draft at unmount, the conclusion text commits on a 500 ms pause while typing, an explicit clear of an unregistered manufacturer is written, and the confirmed text renders as the frame draws it. 25.3: every local commit announces itself from `db/commit.ts`; the sync provider coalesces the announcements in a 2 s window into one `nudge`; visibility-to-visible and the Sync screen opening nudge too; the engine pushes pending ops between file uploads; `send` gets a bound; the kernel adds the `late` badge state and its sentence. Web and kernel only: no fold change, no contract, no seed.

## Boundaries & Constraints

**Always:**
- `AGENTS.md` binds, with `epic-batch-orchestrator.md`. Ownership: the one-minute rule, the late count, the badge state and every pt-BR sentence derived from data live in `packages/domain/src/sync/`; `apps/web` renders and writes ops only. Static copy goes in `apps/web/src/copy/pt-br.ts`, component chrome in `copy/ui.ts`.
- Sentences: the frames' are the reference ("Envio atrasado", "Atraso", "O aparelho está com conexão, mas N alterações aguardam envio há mais de 1 minuto."). Each new one (the singular of the line, the announcement word) is marked `// authored (e25a, listed for Bruno)` and listed in the Auto Run Result.
- Screens from the mocks with their class names (`.e25-late`, `.e25-late-line`, `.generated-text`): each mock rule is translated in `apps/web/src/styles/app.css` with a comment naming the mock rule (`AGENTS.md` § Mock container selectors; `.frame-phone X` becomes `@media (max-width: 767.98px)`); `tokens.css` and `components.css` stay byte-identical. Check 390, 768 and 1280 px.
- A commit on unmount never writes a value the field's own validation refuses, never doubles with a blur that fires during removal (the dirty flag is cleared by the first settle), and keeps "Desfazer" at one undo step per edit.
- Red first: each defect fix gets a test that fails on `ef7894d4`. A mechanism fix (commit on unmount, push between files, coalescing) gets a mutation run in the Auto Run Result (revert the fix, the gate test goes red, restore).
- Each changed or rewritten existing test gets one line of reason in the Auto Run Result ("Changed tests"). A spec that needs an op to stay pending goes offline first (`context.setOffline(true)`) or holds the push route; the list of such specs goes in the Auto Run Result.
- Commands: only after the orchestrator says the machine is free. `podman compose --profile tools run --rm --user root tools pnpm ...` in this worktree (project `fasor-e25a`, port base 49, images `app-api-e25a`/`app-tools-e25a` already tagged; never build). Every unit, api or Playwright run under `nohup caffeinate -i lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'`, logged in `.scratch-e25a/`, polled with bounded loops of at most 55 s. Stack: `podman compose up -d postgres minio api` (plus `install`/`migrate` as compose needs; `web` stays stopped). `podman compose restart api` after a change under `packages/domain`. Spec paths go before `--project` with `scripts/e2e.ts`. Narrowest suite while iterating.

**Never:**
- No change to the op fold, `applyOp`, an op path, a schema, `CONTRACT_VERSION`, a seed, a golden, a fixture op or any printed text. If one proves necessary, stop and report.
- No "Salvo às hh:mm" line per field (M-4, Matheus 2026-11-11). No toast or banner for the late state: one line and one badge state.
- Out of scope (Story 25.3): the 60 s tick, the retry table (`MAX_ATTEMPTS`, `backoffMs`), the order of the phases, what a cycle does when the server refuses an op. Out of scope (25.2): the Etapa 6 parecer text (`etapa6-parecer.tsx`) keeps its look and its blur commit (open question O1).
- Never touch the main checkout or another compose project; never `docker`; never `down -v`; providers stay `fake`. Never edit `epics.md`, `source-deltas.md`, `epic-25-context.md`.
- Do not break fix batch e24y's TAG field (`nameplate-section.tsx`, `commitOnLeave`, `flushOnUnmount`, `tagRenameFollows`): its specs are in the touched list.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Notes |
|---|---|---|---|
| Text idle | conclusion text in editing, typed, cursor stays | one commit 500 ms after the last key (`confirmText(text,'edited')`) | no commit when the text equals the stored one |
| Text leave | typed 100 ms ago, tree / "Voltar" / stepper, no blur | committed before the screen leaves | one op, never two |
| Text confirmed | concluded sheet, text confirmed | a `<p>`/div with no role `textbox`, no border, no padding; "Editar" the only way to type | ficha only; Etapa 6 unchanged |
| Maker known | typed name the registry holds, focus in field, sheet left | that row's name stored | as `commitLeft` selects |
| Maker new | typed name the registry lacks, sheet left | word created and stored once, one batch | as "Criar" |
| Maker clear | stored unregistered name, emptied, left (blur or unmount) | `put null` written; screen and store agree | today ignored by the `onChange` guard |
| Maker untouched | stored name focused and left untouched | nothing written | existing rule |
| Reading ok | "548" typed, sheet left without blur | 548 committed with its unit, once | as a blur |
| Reading bad | "abc" typed, sheet left | nothing committed; a `drafts` row written now; on return "Rascunho encontrado — Recuperar" | a lone ">" left by "> limite" is discarded, no draft |
| Reading 3.3 | "3.3", 2 s pause, "00", left | 3300 committed once; no idle commit | |
| Offline | any row above, offline | same local result | |
| Commit burst | 10 commits in 1 s, online, idle engine | one cycle, starting within 5 s of the first | window 2 s |
| Edit during uploads | 5 photos uploading, edit commits during the 2nd | the edit is pushed before the 3rd upload request starts | one push at a time, op order kept |
| Hung upload | a file PUT whose answer never comes | aborted at its bound; retry table; cycle goes on to pulls; photo stays pending; next cycle retries | |
| Late | op waiting > 60 s, online, reachable, not paused | badge `late` "Envio atrasado" ("Atraso" on the phone); Sync line with "Sincronizar agora" | 60 000 ms exactly is not late |
| Not late | offline, or session expired, or server unreachable, or paused | the explaining state shows (`offline`, `retrying`), never `late` | conflict and error win first |

</intent-contract>

## Code Map

- `apps/web/src/input/use-field-commit.ts:112-114` -- passive cleanup disposes the pending value; layout cleanups that flush must run before it (`ficha-fields.tsx` `useFlushOnUnmount` :236 is the pattern; `number-input.tsx` :189-195).
- `apps/web/src/input/field-commit.ts` -- pure controller, `FIELD_COMMIT_IDLE_MS` 500, `idleMs: null`.
- `apps/web/src/components/generated-text-field.tsx` -- :99-121 textarea (onChange sets text only; onBlur commits) and the `div role="textbox"` before "Editar"; :154-171 "Editar" stores at once. Callers: `surfaces/ficha/conclusao-section.tsx:533` (`confirmText` :365 writes text, `text_status`, `text_basis` in one `api.edit` batch) and `surfaces/relatorio/setup/etapa6-parecer.tsx:171` (unchanged).
- `apps/web/src/components/registry-picker-field.tsx` -- `commitLeft` :126-147, `heldNull`/`leaving` :90-103, focus baseline `textOnFocus` :125, `onFocus`/`onBlurCapture`/`onBlur` :180-196; `combobox.tsx` sets `allowsCustomValue` only while "Criar" is offered.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx:761-824` `WordField` -- the guard :793 drops every null while `created.current` is set or the stored name is unregistered.
- `apps/web/src/components/number-input.tsx` -- `useNumberInput`; `flushOnUnmount` :189-195 settles parseable text only; `typeText`/`discard` (the "> limite" path); `useDraftSource` returns a persist-now function (`state/drafts.tsx:250-256`, `persistOne`).
- `apps/web/src/surfaces/ficha/measurement-field.tsx:229-305` -- the reading's `useNumberInput` (no `flushOnUnmount`), `chooseLimit` :286, the ">" discard on blur :300.
- `apps/web/src/surfaces/ficha/nameplate-section.tsx:549` -- e24y TAG field, `flushOnUnmount: true`; keep working.
- `apps/web/src/db/commit.ts` -- `commitOps` :109, `commitBatch` :163, `commitBatchIf` :193, `commitFileBatch` :304, `commitPhotoBatch` :344, `undoBatch` :369 (through `commitOps`). Pulls do not pass here.
- `apps/web/src/state/sync.tsx` -- `requestSyncCycle` :258 (module set of nudges), engine built :297-336, badge state :548 (`syncBadgeState`), `unreachableCause` :393, live outbox rows :353.
- `apps/web/src/sync/engine.ts` -- `nudge` :826 (`onlineWhileRunning`), `cycle` :613, `pushPhase` :293, `uploadPhase` :434 (two workers), `uploadOne` :384 (retry table), `withRetry` :278.
- `apps/web/src/sync/client.ts` -- `requestHeadersTimeoutMs` :145 (60 s + body at 1 KB/s, share capped 300 s), `request` :226, `send` :274 (no bound: `uploadFile`, `fetchFile`, `rereadPhoto`).
- `apps/web/src/db/sync-store.ts:59` `takePending` -- `pending` and `sent` rows by `client_ts`.
- `packages/domain/src/sync/counts.ts` -- `SyncBadgeState` :129, `syncBadgeState` :165, `syncBadgeLabel` :275, `syncAnnouncementText` :298, `syncStatusWord` :325, `syncBadgeShortLabel` :341.
- `apps/web/src/surfaces/sync/sync-status-surface.tsx:66-96` -- headline and `.sync-actions` button; `components/sync-badge.tsx`; `styles/app.css:617-624` (the `retrying` translation to mirror).
- Frames: `mockups/prototype/screens/60-ficha.html:375-383` (conclusion text), `85-sync-atrasado.html:1-40` (late badge, headline, line); `MOCK-GUIDE.md:306-321`.
- e2e: `e2e/support/sync.ts` (`syncNow` opens the Sync screen, which now starts a cycle itself), `e2e/support/outbox.ts`, `e2e/review-photo-failures.spec.ts:354-388` (`createManufacturer`, R8CAP-E2E-010).
- Ledger: `deferred-work.md` e24z row on R8CAP-E2E-010 (:3990), e24x B1 (:3847) and X8 (:3870).

## Tasks & Acceptance

**Execution (25.2):**
- `apps/web/src/components/generated-text-field.tsx` -- add `presentation?: 'field' | 'text'` (default `'field'`, today's markup) and `commitWhileTyping?: boolean`. With `'text'` the text before "Editar" is a plain element (class `generated-text`, no role `textbox`, `aria-labelledby` kept). With `commitWhileTyping`, `onChange` feeds `committer.change` (500 ms idle), `onBlur` settles it, and a layout cleanup flushes a pending value on unmount; a value equal to the last committed or stored text is never committed (no "edited" mark when nothing changed). -- AC 1 to 3.
- `apps/web/src/surfaces/ficha/conclusao-section.tsx` -- pass `presentation="text"` and `commitWhileTyping`. -- Etapa 6 unchanged.
- `apps/web/src/styles/app.css` -- translate `60-ficha.html:382-383` to the app's markup (`.ficha-conc-text .suggestion-field.is-generated > .generated-text`, and the confirmed state by the field's `data-state`), comment naming the mock rule.
- `apps/web/src/components/registry-picker-field.tsx` -- (1) on unmount (layout cleanup) with the focus baseline set (the field held the focus and was not left), run the leave decision of `commitLeft` (select a match, create a new name once, write nothing for untouched text); (2) new prop `onClear?: () => void`, called when the field's text was emptied by the technician (baseline non-empty, text now empty) and the field is left or unmounts; (3) the e24z lead: reproduce first (Design Notes D2), and if a leave can clear a stored value, fix it with a test red on the baseline.
- `apps/web/src/surfaces/ficha/ficha-fields.tsx` `WordField` -- `onClear` commits `null` whatever the guard :793 says; the guard keeps dropping React Aria's own null selections.
- `apps/web/src/components/number-input.tsx` -- with `flushOnUnmount`, an unmount with dirty text that does not parse writes its draft now (the persist function of `useDraftSource`), except the lone ">" of "> limite" (discarded). `apps/web/src/surfaces/ficha/measurement-field.tsx` -- set `flushOnUnmount: true` on the reading, keeping the ">" discard (move it to the hook or mirror it in the unmount path).
- Investigation (DoR item 4): check that the cell menu ("Não medido", "> limite" with a range), the unit choice and tap-cycle, "Copiar da última visita" and an accepted display reading each write an outbox op at once, offline included; write what was found in Design Notes D3; fix only a path proven not to write.
- Tests "25.2-WEB": `generated-text-field.test.tsx` (idle commit with the cursor in the field; unmount flush; no commit when unchanged; one commit when an idle commit is followed by a blur), `registry-picker-field.test.tsx` and/or a `WordField` test (unmount with a known name, with a new name created once, the clear of an unregistered name, the untouched name), `number-input.test.tsx`/`measurement-field` test (unmount "548" commits once with its unit; unmount "abc" writes a draft row; "3.3", 2 s, "00" commits 3300 once; ">" alone writes nothing).
- `e2e/typed-values-kept.spec.ts` -- "25.2-E2E-001 @p0" on a tablet viewport (768 x 1024): the conclusion text, FABRICAÇÃO and one reading are each typed and the sheet is left with no blur (navigate with `locator.dispatchEvent('click')` on the tree item, "Voltar" or the stepper, which moves no focus, as a tablet tap does not); assert the outbox op of each, then reload, `syncNow`, and assert the server holds each value; one test does it offline and asserts the outbox only. "25.2-E2E-002": the confirmed text has no role `textbox` and computed `border-top-width` 0; "Editar" opens the field; plus the unparseable reading's draft offered on return.
- `e2e/review-photo-failures.spec.ts` `createManufacturer` -- the retry clears the field before filling again, so a closed list reopens.

**Execution (25.3):**
- `apps/web/src/sync/commit-signal.ts` (new) -- `announceCommit()` and `onCommit(listener): () => void`; `apps/web/src/db/commit.ts` calls `announceCommit()` once after each committed transaction that wrote at least one outbox op (`commitOps`, `commitBatch`, `commitBatchIf` when not null, `commitFileBatch`, `commitPhotoBatch`; `undoBatch` through `commitOps`).
- `apps/web/src/state/sync.tsx` -- subscribe to `onCommit` with a coalescing window `COMMIT_SYNC_WINDOW_MS = 2000` (exported from `commit-signal.ts`): the first announcement arms one timer, later ones within the window join it, the timer calls `engine.nudge()`; a `visibilitychange` to visible calls `nudge()`; compute the late count from the live outbox rows (`pending`, `sent`) with the kernel and re-render when the oldest turns late (one timer at the kernel's `syncLateAt`); pass `late` and `paused` into `syncBadgeState`; expose the late count and text.
- `apps/web/src/surfaces/sync/sync-status-surface.tsx` -- on mount call `requestSyncCycle()`; when the state is `late`, render `<div class="e25-late"><p class="e25-late-line">{kernel text}</p>{the one "Sincronizar agora" Button}</div>` under the headline (the button leaves `.sync-actions` while the alert holds). `components/sync-badge.tsx` and every exhaustive switch on `SyncBadgeState` handle `late`. `app.css`: translate `85-sync-atrasado.html:10-21` (`.sync-badge[data-state="late"]` and its `.pill`, `.sync-headline[data-tone="late"] .sh-state`, `[data-route="/sync"] .e25-late`, `.e25-late-line`, the phone full-width button).
- `apps/web/src/sync/engine.ts` -- in `uploadPhase`, before each file attempt after the phase's first (and before each retry attempt in `uploadOne`), when the outbox holds `pending` rows run the push (the body of `pushPhase`) under a single-flight lock both workers await before their next attempt; a `PhaseEnd` with `reauth`/`outdated` ends the upload phase as `uploadOne`'s does; any other failure is recorded and stops mid-upload pushes for the rest of the cycle.
- `apps/web/src/sync/client.ts` -- `send` gets an `AbortController` bound: an upload by `requestHeadersTimeoutMs(blob.size)` until the answer's headers; a download (`fetchFile`) by `SYNC_REQUEST_TIMEOUT_MS` until the headers, then its body read by `requestHeadersTimeoutMs(Content-Length)` (the capped share when the length is unknown); `rereadPhoto` by `SYNC_REQUEST_TIMEOUT_MS`; an abort is `{kind: 'network'}`.
- `packages/domain/src/sync/` -- `SYNC_LATE_AFTER_MS = 60_000`; `lateOpCount(waitingClientTs, nowMs)` (strictly more than 60 s); `syncLateAt(waitingClientTs)` (ms when the next one turns late, or null); `SyncBadgeState` gains `'late'`; `syncBadgeState` takes `late?: number` and `paused?: boolean`, order conflict, error, offline, retrying/unreachable, late (only when `late > 0` and not paused), pending, ok; labels "Envio atrasado", short "Atraso", announcement and `syncStatusWord` ("Sincronizando…" while a cycle runs, as for `pending`); `syncLateText(count)`: plural from the frame, singular authored. Exported from the package index.
- Tests "25.3-UNIT" (kernel): the 60 000 / 60 001 boundary, the precedence rows of the matrix, singular and plural. "25.3-WEB" with injected timers: the window (10 announcements in 1 s, one nudge; none offline, nothing when no provider), the visibility nudge, the Sync screen nudge, the push between files (5 uploads, an op committed during the 2nd is pushed before the 3rd starts; ops in `client_ts` order; one push at a time), a hung upload aborted at its bound with the cycle reaching its pulls and the next cycle retrying, three hung push attempts of one cycle ending the push phase (closes e24x X8), the late clock (badge flips at 60 001 ms, clears when the op is acked).
- `e2e/sync-by-itself.spec.ts` -- "25.3-E2E-001 @p0": an edit reaches the server with no tap and no screen change (poll the server), and opening the Sync screen starts a cycle; "25.3-E2E-002": photos uploading on a delayed file route, an edit committed during the second upload is pushed before the third upload request starts (request order from `page.on('request')`). "25.3-E2E-003 @p1": the late alert (hold the push route, `page.clock` past 60 s while the push bound has not run out; release; the alert goes away). Place each spec in its lane (`e2e/support/groups.ts`) by the rules of `AGENTS.md`.
- Existing specs: grep `e2e/` and the web tests for every changed behaviour (the pending badge, `data-state', 'pending'`, "pendente", "aguardando envio", a `pending`/`sent` outbox status, a count of outbox rows on one path that relied on coalescing, the conclusion text's role `textbox`, the Sync screen's button position, the R8CAP manufacturer flow) and fix each that asserts the old behaviour; list them all.

**Execution (G1, coordinator item of 2026-11-11, from the Epic 24 final hands-on pass on main `ee0859cc`; built with Story 25.2):**
- Defect: in the point editor, a "Prazo" typed by hand and then "Concluir" stores the point with its deadline, but leaves a `drafts` row of it; every later load raises "Rascunho encontrado · Recuperar · Fechar" on any screen ("Recuperar" changes nothing and drops it). Seen on the three create routes (a test's "Criar ponto de atenção", the "Não ensaiado" band, an NC checklist item) at 1280, 768 and 390 px. Controls with no draft: text plus a priority tap with no typed deadline; a plain point from Pontos › Criar.
- Cause (orchestrator's reading, to confirm with the red test): `apps/web/src/surfaces/points/point-editor.tsx` `persistDeadline` (:354) and the create branches (`persist` :296, `noteFieldsWrite` :348, `pickLink` :444) call `saveDraftRef.current()` right after the write lands, but the draft source's `read()` (:514) compares the typed Prazo with `shownDeadline`, which catches up only on the next render from the live row (:325-330). At that moment the stored deadline still reads as unsaved, so the row is written with `pending.deadline`, and nothing rewrites it once the editor closes (`finish` :561-597 calls `onDone` without saving the draft again). The code is the same at production `1528183f`, from Story 11.9 (`31740f59`, 2026-09-30); Epic 24 (`d58825b0`, Story 24.17) only added the seeded action.
- `apps/web/src/surfaces/points/point-editor.tsx` -- keep a ref of the deadline the store holds as far as this editor wrote or read it (set from the live row as today, and at once when a deadline write lands as `written` or `unchanged`, or a create lands carrying a held pending deadline); `read()` compares the typed Prazo with that ref. After a close whose writes all settled unrefused, write the draft once more (`saveDraftRef.current()`, which drops the row when `read()` is null) before `onDone`. A refused commit keeps the editor open and its draft row.
- Tests "G1-WEB" (red on the baseline): a component test of `PointEditor` for a new point from a test (`origin: 'reading'`) and from an NC item (`origin: 'nc'`): type text and a Prazo by hand, "Concluir", assert no `drafts` row of the point is left; a refused deadline write keeps the draft row; the controls (priority tap, no typed Prazo) still leave none. One e2e on the test route (in `e2e/points.spec.ts` or `typed-values-kept.spec.ts`): Prazo typed, "Concluir", reload, no "Rascunho encontrado" toast and no `drafts` row.

**Acceptance Criteria:** Story 25.2's ten and Story 25.3's nine, as written in `epics.md` § Story 25.2 and § Story 25.3 (lines 9405-9445 and 9479-9515 on `ef7894d4`), each proved by the test named above; the Auto Run Result maps each AC to its test. G1: Given a new point from a test or an NC item with a Prazo typed by hand, When "Concluir" stores it, Then no draft of that point is left (no toast on the next load); Given a refused commit, Then its draft stays.

## Spec Change Log

## Review Triage Log

## Design Notes

- **D1, the window.** 2 s, fixed from the first commit and not restarted, so continuous typing never starves it and the first edit is sent within 2 s plus one cycle (the AC asks 5 s). The engine's single-flight plus `onlineWhileRunning` keeps it at one cycle at a time; during non-stop typing that is at most one cycle per about 2 s: one push and one small pull per followed stream, each a few hundred bytes when nothing changed (about 1.5 MB over ten minutes of non-stop typing on a relatório with a few streams). No cycle runs offline, paused or signed out (`nudge` returns). A shorter window would send more cycles while typing; a longer one would miss the 5 s target under a slow cycle.
- **D2, the manufacturer lead (fix batch e24z).** Unproven: under load, after "Criar" and two `syncNowAndReturn`, FABRICAÇÃO was empty with "1 pendente". Suspects in order: `commitLeft`'s `release()` letting a held null go out on a leave whose text equals the focus baseline (`before === latest`), and the `WordField` guard dropping its protection once `created.current` resets (:772) while React Aria later reports a null for a label that does not match. Reproduce with a component test driving React Aria (Criar, leave before and after the entry lands, a re-render with the options late) and, if needed, the e2e under `--repeat-each`. A proven clear is fixed in this batch with a red test; an unproven one is written up here with what was tried.
- **D3, values that changed with no typing.** To be filled by the investigation task.
  *(2026-11-11, e25a, read on the code; the runs of phase B confirm it.)* Every control of a reading that changes the value without typing writes an op at once, offline included (the write is a local commit): the cell menu's "Não medido" (`write` in `measurement-field.tsx`), "> limite" with an instrument range (`write`) and without one only types "> " (Story 22.10, now dropped at unmount too); the unit choice and the tap-cycle (`chooseUnit` → `commitValue` → `committer.immediate`) when the cell holds a value, while on an empty cell they change only the slot's unit, which is no stored value; "Copiar da última visita" (`copyFrom` in `nameplate-section.tsx`, one `api.edit` batch, plate fields only); an accepted display reading (`read-display.tsx`, `confirmSuggestionOps` in `api.edit`) and a dictated one (`confirm` in `measurement-field.tsx`). None was found not to write, so no path was changed. The most likely reading of Bruno's report is M03 itself: values written on the device that waited for a sync cycle (60 s tick, the uploads, or "Sincronizar agora"), which Story 25.3 now starts by itself. The other candidate seen: a corrected insulation value (temperature correction) changes on screen when the temperature changes, but it is derived and never stored, so it never "reaches the server" as a value of its own.
- **D2, found (e25a).** Not reproduced by reading. On the sheet, `WordField` drops every null React Aria reports while a created name has not landed (`created`) or while the stored name is not in the registry; `RegistryPickerField`'s `release()` can only hand such a null to it. Since this batch a clear the technician made goes through `onClear` alone. Component tests drive "Criar" then leaves before the entry lands, after the registry row lands and after the value lands, with the options late (`registry-picker-field.test.tsx` and `ficha-fields.test.tsx`, "D2"); `createManufacturer` now changes the text on each try (the e24z cause (1)). If R8CAP-E2E-010 goes red again, the outbox dump at that point names the op (ledger, § e25a). *(2026-11-11, phase B: the component tests ran green, so a leave cannot clear a stored value through the sheet's field. `ficha-fields.test.tsx` "D2": "Criar", then a leave before anything lands, a leave once the registry row lands with the value still null, and a leave once the value lands: `commit` is never called with null, `onCreateWord` once, the field keeps "Fabricante R8CAP". `registry-picker-field.test.tsx` "D2" runs the same through the picker alone: one create, no clear. The released null of `commitLeft` reaches `WordField` only while its guard drops it (a created name not landed yet). The gate's empty FABRICAÇÃO stays unexplained by a leave; R8CAP-E2E-010 ran in the touched specs below.)*
- **D4, the bound of a transfer.** One attempt of a 4 MiB photo waits at most 60 + 300 s; with the retry table one file can hold a worker about 18 min, but pending edits are pushed between attempts, so an edit waits at most one attempt's bound (the coordinator's reading: a push in parallel with an upload in flight is not taken).
- **D5, e24x rows.** X8 (no test of three hung push attempts) is closed by the engine test above. B1 (a hung push holds its cycle up to about 18 min) stays open as a note: this batch bounds the file transfers, not the push.
- **O1, open question for Matheus.** The Etapa 6 parecer text uses the same component and keeps its blur-only commit and its bordered look (the frame did not draw it). Apply the same saving there?

## Verification

**Commands (after "machine free", each under the host lock, logged in `.scratch-e25a/`):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green.
- `pnpm exec tsx scripts/e2e.ts <touched durability specs> --project durability-desktop-chrome --project durability-android-chrome --project durability-webkit` -- green.

## Auto Run Result

*(Phase A, 2026-11-11: written before any command ran; the gate results, the mutation runs and the 390/768/1280 checks are added in phase B.)*

**Authored sentences (e25a, listed for Bruno):**
- "O aparelho está com conexão, mas 1 alteração aguarda envio há mais de 1 minuto." (the singular of the late line; the plural is the frame's), `packages/domain/src/sync/late.ts` `syncLateText`.
- "Envio atrasado" as the live region's announcement of the late state (the frame's badge word, reused), `packages/domain/src/sync/counts.ts` `syncAnnouncementText`.

**Acceptance criteria and their tests:**

| AC | Test |
| --- | --- |
| 25.2 confirmed text reads as text, "Editar" the only way | `generated-text-field.test.tsx` 25.2-WEB "confirmed, the text reads as text"; `e2e/typed-values-kept.spec.ts` 25.2-E2E-002 |
| 25.2 a 500 ms pause commits the text | `generated-text-field.test.tsx` 25.2-WEB "a 500 ms pause" and "an idle commit followed by a blur is one commit" |
| 25.2 leaving the screen 100 ms after typing commits the text | `generated-text-field.test.tsx` 25.2-WEB "the field leaving the screen"; 25.2-E2E-001 |
| 25.2 a registered name typed and left is stored | `registry-picker-field.test.tsx` and `ficha-fields.test.tsx` 25.2-WEB (unmount); 25.2-E2E-001 uses a new name |
| 25.2 a new name is created once | the same tests ("created once"); 25.2-E2E-001 (one create, one put, one batch) |
| 25.2 the clear of an unregistered name is written | `registry-picker-field.test.tsx` and `ficha-fields.test.tsx` 25.2-WEB (blur and unmount) |
| 25.2 "548" left with the sheet is committed with its unit | `measurement-field-unmount.test.tsx` 25.2-WEB; 25.2-E2E-001 |
| 25.2 an unparseable reading is a draft offered on return | `measurement-field-unmount.test.tsx`, `drafts.test.tsx` 25.2-WEB; 25.2-E2E-002 |
| 25.2 "3.3", 2 s, "00" commits 3300 once | `measurement-field-unmount.test.tsx` 25.2-WEB (and the existing `number-input.test.tsx`) |
| 25.2 offline, the same | 25.2-E2E-001's offline half |
| 25.3 a commit starts a cycle within 5 s, the op leaves the outbox | `nudges.test.ts` 25.3-WEB (window, commit.ts announcements); 25.3-E2E-001 |
| 25.3 ten edits in one second, one cycle | `nudges.test.ts` "ten commits within one second" |
| 25.3 an edit during the second of five uploads is pushed before the third | `engine.test.ts` 25.3-WEB "five photos uploading"; 25.3-E2E-002 |
| 25.3 back to the front, a cycle | `nudges.test.ts` "a visibilitychange to visible" |
| 25.3 Sync status opening, a cycle | `sync-status-surface.test.tsx` 25.3-WEB; 25.3-E2E-001 |
| 25.3 a hung upload ends at its bound, pulls run, retried next cycle | `client.test.ts` 25.3-WEB (bounds), `engine.test.ts` 25.3-WEB "a hung upload" |
| 25.3 the late alert, gone once sent | `late.test.ts` 25.3-UNIT, `late-ops.test.tsx`, `sync-status-surface.test.tsx`, `sync-badge.test.tsx` 25.3-WEB; 25.3-E2E-003 |
| 25.3 offline, session expired or paused: no alert | `late.test.ts` 25.3-UNIT precedence rows |
| 25.3 nothing lost, doubled or out of order | `engine.test.ts` 25.3-WEB "five photos uploading" (op order, one push at a time, every op once), "a push between files that fails" |

**Changed tests (one line of reason each):**
- `e2e/ficha.spec.ts` (Story 5.8 conclusion steps; the read-only sheet): the text before "Editar" is read through `.ficha-conc-text .generated-text`, and the read-only text asserts no textbox, since the text is no longer a `textbox` (Story 25.2).
- `e2e/qgbt.spec.ts`, `e2e/cta.spec.ts`, `e2e/parecer-names-finding.spec.ts`: the suggested text is read through `.ficha-conc-text .generated-text`, for the same reason.
- `e2e/review-concluir-text.spec.ts`: the confirmed text is read through `.generated-text`, and the R8CONC-E2E-003 locator reads whichever of the text and the field is shown.
- `e2e/cta.spec.ts` (palette add): the read of the badge's non-zero `data-pending` right after the add is dropped (the add is now sent within seconds); the outbox creates are still asserted.
- `e2e/review-photo-failures.spec.ts` `createManufacturer`: each retry retypes the name's last letter so a list a failed try left closed opens again (fix batch e24z, R8CAP-E2E-010 cause (1)).
- `e2e/sync-status.spec.ts` 10.4-E2E-004 (phase B): no tap on "Sincronizar agora" after opening Sync status; the opening's own cycle starts the download, and its held relatório page keeps the button disabled (Story 25.3).
- `e2e/sync-status.spec.ts` 14.10-E2E-002 (phase B): the push route is released only once no cycle runs; the commit and the opening now each start a cycle, and a push held across the release hung the next one (red once in phase B).
- Phase B fixes to this batch's own new tests: `ficha-fields.test.tsx` 25.2-WEB clicks "fora" by its text (the open combobox list hides the rest of the page from the accessibility tree); `sync-badge.test.tsx` 25.3-WEB reads the badge's name case-insensitively ("Sincronização: envio atrasado"); `typed-values-kept.spec.ts` picks reading cells only (`input.mf-value[data-cell-input]`) and finds "Voltar" by its label, for the same accessibility-tree reason.

**Specs that keep an op pending, found by grep (`'pending'`, `pendente`, `aguardando envio`, `data-pending`, `status !== 'acked'`):** they already go offline (`auth`, `cadastros`, `tree`, `verificacoes-local`, `verificacoes-local.durability`, `test-applicability.durability`, `sync-status` 10.4-E2E-001) or refuse or hold the push route (`home`, `security-device`, `sync`, `sync-status` 10.4-E2E-009 and 14.10-E2E-002) before the edit; no change was needed in them. Photo pills read "Aguardando envio" under held file routes, as before. The new ones: `sync-by-itself.spec.ts` 25.3-E2E-003 holds the push route; `typed-values-kept.spec.ts` 25.2-E2E-001's second half goes offline.

**Lanes:** `e2e/sync-by-itself.spec.ts` in `solo` (it times a push against its commit and jumps the page's clock); `e2e/typed-values-kept.spec.ts` in the parallel group.

**Mutation runs (phase B, each reverted, then restored and the tree checked clean):**
- Commit on unmount (the generated text's layout flush off, the picker's unmount decision off, the reading's `flushOnUnmount: false`): 10 red, `generated-text-field.test.tsx` "the field leaving the screen", `registry-picker-field.test.tsx` three unmount tests, `ficha-fields.test.tsx` three unmount tests, `measurement-field-unmount.test.tsx` "548", "abc" and "3.3 ... 00". Restored: green.
- The push between files (`beforeAttempt` never pushes): 2 red, `engine.test.ts` "five photos uploading" and "a push between files that fails". Restored: green.
- The 2 s window (every announcement arms its own timer): 2 red, `nudges.test.ts` "ten commits within one second" and "continuous commits". Restored: green.

**Phase B commands (2026-11-11, stack fasor-e25a, each under the host lock):**
- `pnpm lint` 0 errors (27 warnings, all `no-wait-for-timeout` in older specs); `pnpm static` green.
- `pnpm test:unit`: first run 10 red in four files outside this batch (`export-dialog`, `measurement-test-section`, `relatorio-tree-painel`, `sumario-surface`: 15 s timeouts and one late status line, the machine shared with the main checkout's browser pass); the four files alone: 164 of 164 green. A second whole run, beside another batch's `test:api` (load 10 to 15): 13 red, every one a timeout or a late element, in nine other files and none the same as the first run; those files alone: green (`scripts/e2e.test.ts`, `scripts/tooling.test.ts` and three web files at once; the four others on a third run, 81 of 81). The touched files: 56 files, 678 tests, green after the two test fixes above.
- `pnpm test:api` (api restarted): 131 files, 995 passed, 6 skipped.
- Playwright, `desktop-chrome` and `durability-desktop-chrome`: the eight touched specs (`typed-values-kept`, `sync-by-itself`, `ficha`, `qgbt`, `cta`, `parecer-names-finding`, `review-concluir-text`, `review-photo-failures`): 58 tests, all green after the `typed-values-kept` selector fixes (`sync-by-itself` 3 of 3 in `solo`). The grep list (`auth`, `cadastros`, `tree`, `home`, `security-device`, `sync`, `sync-status`, `ui-hygiene`, `verificacoes-local`, `verificacoes-local.durability`, `test-applicability.durability`, `conflicts`, `manufacturer-value`, `learned-options`, `review-layout-interaction-2026-10-08`, `review-field-defects`, `review-field-defects-2`, `nameplate-values`, `keyboard-salvo`, `keyboard-salvo.durability`, `lost-taps.durability`, `ficha.durability`, `over-range`, `over-range.durability`, `e24y-screen-fixes`, `e24y-tag-rename`, `points-derived`, `sheet-knows-12-3-12-4`, `ratio-feeds-conclusion`, `durability`, `device-clock.durability`, `photos`, `gallery`, `merge`, `captions`, `files`): 234 tests, 230 passed, 3 skipped, 1 red (10.4-E2E-004, fixed above); `sync-status.spec.ts` again: 10 of 10 green after the 14.10-E2E-002 fix (a run before it had 10.4-E2E-008 and -009 red at a camera shutter and a tree chevron under load, green in both other runs).
- Not run here: the matrix projects for the touched durability specs (the coordinator's gate).

