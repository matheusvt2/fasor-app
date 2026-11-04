---
title: 'Stories 20.7 to 20.10: the server enforces the business rules of every op (contract 29)'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_revision: '71ede5af83dadfe0ad823dc2cb7c54303d3b9337'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: opus
dev_effort: max
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
  - '{project-root}/_bmad-output/test-artifacts/manual/security-pass-2026-11-03.md'
warnings: ['batched', 'oversized']
batched_because: 'all four stories change the server per-op validation (apps/api/src/sync/apply.ts validate and the apply transaction), packages/domain/src/contract/errors.ts and one new spec, e2e/security-ops.spec.ts'
deferred:
  - summary: >-
      An op refused op_attribution because the device clock ran more than 10 min behind the relatorio's creation is resent with the same client_ts and refused again on every resend.
    evidence: |-
      apps/web/src/db/sync-store.ts resends dead rows unchanged; re-stamping client_ts on resend changes what the op says, a product choice for Matheus.
    location: >-
      apps/web/src/db/sync-store.ts
    severity: medium
  - summary: >-
      A create or put that copies a stored value already over its new cap (template save, copy from the last visit) is refused op_value_invalid.
    evidence: |-
      Real only if production holds values over a cap; the read-only count query in the PR body settles it.
    location: >-
      packages/domain/src/ops/value-limits.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The server applies any op whose shape is valid (security pass S1, S3, S4, S5): a forged `relatorio/status` put issues a Rascunho, a value can name another user or a 2099 instant, a 5 MB string makes a relatório ungeneratable, and a put may land on a row that does not exist or under another relatório's id. `contract/errors.ts` and AD-24 say a refusal is "never a domain rule".

**Approach:** The kernel gains four rule modules (status transition, attribution, value limits, and the per-code refusal sentences); the server calls them for every client op in `validate` (stateless checks) and inside the apply transaction under the company lock (checks that read server state). A refusal under the four new codes refuses that op alone; the other ops of its push and of its client batch apply. Contract 29 carries all six new codes (two of them only reserved for e20e).

## Boundaries & Constraints

**Always:**
- Every rule is a kernel export (`packages/domain`), unit-tested red first; `apps/api` only loads the state the rule needs and calls it. Checks apply to `origin: 'client'` only; server ops (`applyServerBatch`, replay with `origin: 'server'`, the learn and seed post-passes) are never checked.
- Check against what the server holds when the op applies (rows in `entities`, ops in `ops`, both inside the push transaction, so a row created earlier in the same push counts as existing).
- A refused op writes nothing (no log row, no entity) and answers its own code: `op_status_transition`, `op_attribution`, `op_value_invalid`, `op_target_missing`, or `op_forbidden` (removal of an Emitido relatório). These five refusals never roll back the rest of the op's client batch (`batch_id`): the edit that carried an Em campo status op still applies when the status op is refused ("No edit is lost").
- Order inside `applyOneIn`: merge redirect (`redirectOp`, `mergeTarget`) first, then target check, then the stateful rules, then insert and `applyOp`.
- Edits to an Emitido relatório stay allowed. Past instants stay allowed (a tablet works offline for days). A put on a tombstoned row still applies (LWW).
- Contract 29: `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` go to 29 once, with a dated comment block like 28's. Append (never reorder) to `opRejectCodeSchema`: `op_status_transition`, `op_attribution`, `op_value_invalid`, `op_target_missing`; append to `errorCodeSchema` after `telemetry_invalid`: `quota_exceeded`, `forbidden_origin`, each with a comment naming Story 20.12 / 20.13 (batch e20e implements them; nothing here uses them).
- New pt-BR sentences are kernel text (derived from a code or a count), each marked `// authored: 2026-11-03, Story 20.x`.

**Never:**
- Never put a cap or range into a row schema in `schemas/entities.ts` or into `applyOp`: rows already stored (and pulled ops the device replays) must keep parsing. Caps live in an op-value check only new client ops pass.
- Never touch `apps/web/src/copy/pt-br.ts`, `apps/web/src/state/session.tsx`, `apps/api/src/http/app.ts`, `docx.ts` or `print/*` (owned by batches e20w, e20d, e20e). Never rewrite a stored value. No roles: every member keeps every move.
- No seed bump. No paid provider. Do not implement `quota_exceeded` or `forbidden_origin`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Code |
|---|---|---|---|
| S1 forged issue | server Rascunho, client put `relatorio/status = emitido` | refused, row stays rascunho | `op_status_transition` |
| S1 em_revisao w/o generate | Rascunho/Em campo, put `em_revisao`, no issue job created after the latest status op and no unchanged latest revision | refused | `op_status_transition` |
| S1 create born issued | `relatorio/{id}` create with status ≠ `rascunho` | refused, no relatório | `op_status_transition` |
| UI paths | setup complete, first field value, generate (queued and unchanged), mark as sent, edit after Emitido, Overflow back move, Desfazer of each | applied as before | none |
| two devices | server Em revisão; A puts emitido (revision exists); B, which saw Rascunho, puts em_campo in its edit batch | A applied; B's status op refused, B's edit applied, in either arrival order | `op_status_transition` on B |
| S3 concluded_by | `block/{id}/concluded_by = {actor_id: colleague, at}` | refused, sheet keeps value | `op_attribution` |
| S3 not_tested / restore | `not_tested.by` or `meta.restore.removed_by` naming a colleague with no matching history | refused | `op_attribution` |
| undo restores history | value naming a colleague equal to a value that colleague's own op wrote earlier on the same path | applied | none |
| S3 clock | `client_ts` or a value instant > server now + 10 min, or < relatório creation − 10 min | refused | `op_attribution` |
| offline two days | ops with `client_ts` 2 days old, after creation | applied; section 9 prints their dates | none |
| S4 oversize | `relatorio/setup/additional_info` of 20 001 chars | refused | `op_value_invalid` |
| S4 body | push body over 4 MiB (the 5 MB string) | whole push refused | 413 `body_too_large` |
| S4 type / range | `sheet/{id}/observations` an object; `site_altitude_m = -99999` | refused | `op_value_invalid` |
| S5 foreign relatório | put naming a `relatorio_id` the company does not hold | refused, no orphan op stored | `op_target_missing` |
| S5 missing row | put on a block id that does not exist | refused | `op_target_missing` |
| S5 misfiled | put on R1's block filed under R2's `relatorio_id` | refused | `op_target_missing` |
| in-batch creates | local, equipment, block and values created in one offline batch | all applied in order | none |
| bad responsible | `relatorio/setup/responsible_user_id` (put or in a create) not a user of the company | refused | `op_value_invalid` |
| remove issued | `relatorio/removed_at` (non-null put or remove) on a server-Emitido relatório | refused; after a back move to Em revisão it applies | `op_forbidden` |

</intent-contract>

## Code Map

- `apps/api/src/sync/apply.ts` -- `validate` (l.149-195): add the stateless checks for client ops (value limits, the `client_ts` future bound, attribution of actor ids against the session). `applyOneIn` (l.402-518): after redirect/merge and before `insertOp`, call a new stateful step that may return a refusal code; `applyOps` (l.649) and `applyBatchIn` (l.683) must record that code for the op alone and continue, without `BatchRefusedError`. Update the file header comment (l.44-52).
- `apps/api/src/sync/rules.ts` (new) -- the server-state loaders for the kernel rules: relatório row and creation instant (the `client_ts` of its `relatorio/{id}` create op in `ops`), the latest `relatorio/status` op of the relatório (seq and value; implicit path, filter by `relatorio_id`), the value of the op named by `prev_op_id`, the newest issue `generation_job` create seq, revisions, user ids of the company, target row existence and owner, and the history checks for attribution. One function `checkClientOp(tx, companyId, target, deps): Promise<OpRejectCode | null>`.
- `apps/api/src/http/generate.ts` -- `editedAfter` (l.138-171): move it to an exported helper (e.g. `apps/api/src/sync/edited-after.ts`) that both generate and the status rule call; behavior unchanged.
- `apps/api/src/sync/routes.ts` -- `POST /api/sync/ops`: a 4 MiB body limit (`SYNC_PUSH_MAX_BYTES`) answering 413 `body_too_large` in the `app.ts` envelope shape (`hono/body-limit` in this file; `app.ts` keeps its 16 MB outer limit).
- `packages/domain/src/status/table.ts` -- add `statusMoveVerdict(input)` built on `statusTable` and `manualMove` (see Design Notes); `advanceOnEdit`/`advanceOnGenerate` in `relatorio/status-advance.ts` stay the emitters.
- `packages/domain/src/ops/attribution.ts` (new) -- `ATTRIBUTED_FIELDS` table and `attributionIssue(...)`; `CLOCK_SKEW_MS = 10 * 60_000`.
- `packages/domain/src/ops/value-limits.ts` (new) -- `TEXT_CAPS = {short: 200, medium: 1000, long: 20000}`, `SITE_ALTITUDE_RANGE_M = {min: -500, max: 9000}`, a `Record<PathFamily, ...>` value rule per family and field (create families check their row's user-typed strings), `opValueIssue(op, path)`, and `textCapOf(path | family+field)` for the web. Keep the existing `NC_PHRASE_MAX_LENGTH` (200) and `FUNCAO_MAX_LENGTH` (80) as they are and reuse them.
- `packages/domain/src/contract/errors.ts` -- the six codes, and the opRejectCode doc comment rewritten (no longer "never a domain rule").
- `packages/domain/src/contract/version.ts` -- 29 and its comment; `packages/domain/src/contract/sync.ts` -- `SYNC_PUSH_MAX_BYTES = 4 * 1024 * 1024`.
- `packages/domain/src/sync/counts.ts` -- beside `rejectedText` (l.205): `opRejectReasonText(code): string | null` (a sentence for each of the four new codes and `op_forbidden`; null for the others) and `charCountText(length, cap)`.
- `packages/domain/src/index.ts` -- export the new modules.
- `apps/web/src/state/sync.tsx` (l.345-365) and `apps/web/src/surfaces/sync/sync-status-surface.tsx` (l.104-121) -- expose the distinct `error_code`s of dead outbox rows and render each non-null `opRejectReasonText` in `.sr-secondary` under the rejected count.
- `apps/web/src/db/sync-store.ts` (l.77 marks a rejected op `dead`; l.137 rematerializes without dead rows) -- confirm, with a unit test in `sync-store.test.ts` or the engine test, that a refused status op's relatório converges on the server's status at the next pull; fix only if it does not.
- `apps/web/src/sync/policy.ts` `batches` (l.83) and `apps/web/src/sync/engine.ts` (l.289) -- also split pushes by serialized size under `SYNC_PUSH_MAX_BYTES` (never splitting a client batch), so a long offline backlog never earns a permanent 413.
- Web inputs (the free-text and number fields; inventory below) -- `maxLength={textCapOf(...)}` and the altitude `min`/`max`; one shared counter element shown at 90 % of the cap, `aria-live="polite"`, text from `charCountText`. Inventory: setup `etapa1-capa.tsx:102`, `etapa2-escopo.tsx:137,146`, `etapa3-responsavel.tsx:82`, `etapa5-local.tsx:191` and the altitude input `:293` (parse refuses out-of-range like non-finite, `:213`), `etapa6-parecer.tsx:161` via `components/generated-text-field.tsx`; sheet `ficha/checklist-section.tsx:501`, `ficha/conclusao-section.tsx:297,373`, `ficha/ficha-fields.tsx:286,295`; points `points/point-editor.tsx:557` (contenteditable), `:592`, `:627`; captions `photos/caption-composer.tsx:237,376`, `photos/capture-sheet.tsx:586`; section text `relatorio/section-text-surface.tsx:197`, `templates/section-text-dialog.tsx:69` (contenteditable hooks `input/use-rich-text-area.ts`, `input/use-section-text-area.ts`); names `home/new-project-dialog.tsx:165,191`, `project/new-relatorio-dialog.tsx:158`, `relatorio/tag-dialogs.tsx:47,150`, `relatorio/save-template-dialog.tsx:38`, `templates/template-composer.tsx:530,696`, `templates/local-dialog.tsx:175,203`, `relatorio/not-tested-dialog.tsx:66`; cadastros `registries/empresa-tab.tsx:312`, `client-panel.tsx:190-268`, `instrument-panel.tsx:455-587`, `word-registry-panel.tsx:250,293`; account `account/registration-dialog.tsx:114,129`; `components/combobox.tsx:132` takes an optional `maxLength`.
- Tests to extend: `packages/domain/src/contract/contract.test.ts` (l.102-103: 29), `apps/api/src/sync/sync.integration.test.ts` (l.1084-1085: 29), `apps/api/src/sync/apply-batch.integration.test.ts`; integration tests that seed forged states through a client push (`sync.integration.test.ts`, `db/friction-read.integration.test.ts`, `db/tombstone.integration.test.ts` push non-rascunho statuses) move that seeding to `origin: 'server'` or a valid path, keeping their assertions.
- Read-only evidence: `apps/api/src/sync/replay.integration.test.ts` replays as `origin: 'server'`; `merge.integration.test.ts`, `panel-retarget.integration.test.ts` must stay green unchanged. The reproductions are in the main checkout `/Users/matheusvilella/Documents/estudos/fasor-app/test-results/adhoc-sec/` (gitignored; read, never copy): the op pushes were curl calls, so build them from the findings.

## Tasks & Acceptance

**Execution:**
1. `packages/domain/src/contract/{errors,version,sync}.ts`, `contract.test.ts` -- contract 29 and the six codes; commit this first on its own ("kernel and contract") so it can be pushed early.
2. `packages/domain/src/status/table.ts` + test -- `statusMoveVerdict`, red-first over every (seen, server, to) triple and both preconditions and the create rule.
3. `packages/domain/src/ops/attribution.ts` + test -- the table, the check, and the guard test (below).
4. `packages/domain/src/ops/value-limits.ts` + test -- per-kind tests at cap and cap+1, finite, altitude bounds (-500, 9000 in; -501, 9001 out), object-where-string refused, and the guard test that every `PathFamily` has a rule (a family added without one fails `test:unit`).
5. `packages/domain/src/sync/counts.ts` + `text/plural.test.ts` or a new test -- the sentences and the counter text.
6. `apps/api/src/sync/{apply,rules,edited-after,routes}.ts`, `http/generate.ts` -- wire the checks as in the Code Map.
7. `apps/api/src/sync/status-transition.integration.test.ts` (new), `attribution.integration.test.ts` (new), `value-limits.integration.test.ts` (new, includes the 413), `targets.integration.test.ts` (new, includes in-batch creation order, misfiled put, orphan op absent from `ops`, removal of Emitido, responsible user) -- all through the sync route (`POST /api/sync/ops` with a session), each S1/S3/S4/S5 push and the two-device case in both orders; `apply-batch.integration.test.ts` gains "a refused status op does not roll back its batch".
8. `apps/web/src/state/sync.tsx`, `surfaces/sync/sync-status-surface.tsx`, `sync/policy.ts` (+ `policy.test.ts`), `sync/engine.ts` -- reasons line and size-aware pushes.
9. The web inputs of the inventory -- caps, counter, altitude bounds.
10. `e2e/security-ops.spec.ts` (new, `@p0`; add it to `SERIAL_SPECS` in `e2e/support/groups.ts` because it previews through the shared queue and LibreOffice): signs in as a seeded worker user, creates a relatório through the UI, then pushes through the page's own session (`page.evaluate(fetch('/api/sync/ops', ...))` with `x-contract-version`): forged `emitido` (answer `op_status_transition`, Home still counts it under Rascunho, server row rascunho), forged `concluded_by` (`op_attribution`), the 5 MB push (413) and a 20 001-char value (`op_value_invalid`) followed by a successful preview, and the misfiled put (`op_target_missing`). Plus one `@p0` UI test: paste past the cap into the sheet observations textarea and into a plain input; the field stops at the cap, the counter shows, and the outbox op holds exactly the cap.
11. Docs -- the architecture spine: AD-22, AD-24 and AD-11 amended with the date, struck-through per AGENTS.md; `_bmad-output/specs/spec-fasor/source-deltas.md`: the two rows already planned on 2026-11-03 get an "as built 2026-11-03" note with the narrowings below; `docs/kbs/architecture/sync.md` and `docs/kbs/log.md`; `deferred-work.md` entries under a heading "Epic 20 batch e20s" for anything left.

**Acceptance Criteria:**
- Given every row of the I/O matrix, when pushed through `POST /api/sync/ops` by a valid session, then the answer and the server rows are as the matrix says, and a refused op leaves no row in `ops`.
- Given the existing unit, api and e2e suites, when run, then every test is green; a test changed only to seed a state through a server op instead of a forged client op is listed in the PR body.
- Given a device whose status op was refused, when it next pulls, then its relatório shows the server's status, and Sync status shows "1 alteração rejeitada" with the code's sentence.
- Given a push backlog over 4 MiB, when the device flushes, then it sends several pushes under the cap and none answers 413.

## Spec Change Log

## Review Triage Log

### 2026-11-03 — Review pass
- layers: Edge Case Hunter and Verification Gap Reviewer ran; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 15 findings — high 1, medium 8, low 5, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` ECH-1 `apps/web/src/sync/policy.ts` slices of a unit over 500 ops are cut by count only, not bytes — patch: byte-check those slices; a single client batch over 4 MiB alone stays a known risk (`deferred-work.md`, accepted).
  - `[low]` `[reject]` ECH-2 a re-sent op the log already holds is refused by a stateless check before the dedupe — needs a value over cap applied before contract 29 plus a lost answer across the deploy; a contract-29 op passes the same checks again.
  - `[medium]` `[patch]` ECH-3 `rules.ts` creation instant is the creator's `client_ts`, itself up to 10 min fast — patch: the earlier of `client_ts` and `received_at`.
  - `[medium]` `[defer]` ECH-4 an op refused `op_attribution` for a slow clock is resent with the same `client_ts` and refused forever — re-stamping on resend is a product choice; deferred to Matheus.
  - `[maybe-false]` `[defer]` ECH-5 a copy of a stored value already over its cap is refused — medium if true; settled by the production count query in the PR body.
  - `[medium]` `[patch]` ECH-6 `targets.ts` creates carrying `project_id` are not checked against an existing project — patch: `op_target_missing`.
  - `[medium]` `[patch]` ECH-7 references carried in a value (`location_id`, `block_id`, `equipment_id`) are not checked to exist in the op's relatório — patch: `op_value_invalid`, with the e20w relink integration test.
  - `[low]` `[patch]` ECH-8 `rules.ts` history lookup capped at 100 ops misses an older matching value — patch: cap removed or filtered in SQL.
  - `[medium]` `[patch]` ECH-9 (claim) the 4 MiB AC fails for a large size chunk — same root cause and patch as ECH-1.
  - `[low]` `[reject]` ECH-10 (claim) resend across the deploy — same as ECH-2.
  - `[medium]` `[patch]` VG-1 the engine's byte split is never exercised through `engine.ts` — patch: an `engine.test.ts` case.
  - `[medium]` `[patch]` VG-2 the `same_relatorio_actor` history branch never runs with a colleague named — patch: an `attribution.integration.test.ts` case.
  - `[high]` `[patch]` VG-3 the undo of a refused (never logged) status op falls back to seen = server status and can move Emitido back to Rascunho — patch: a non-null `prev_op_id` that names no logged status op of the relatório is refused `op_status_transition`.
  - `[low]` `[patch]` VG-4 `opRejectReasonText('op_forbidden')` speaks only of removing an Emitido relatório, also shown for another user's row refusal — patch: a general sentence.
  - `[low]` `[reject]` VG-5 resend before dedupe — same as ECH-2.

## Design Notes

**Status verdict (20.7).** `statusMoveVerdict({server, seen, to, issueJobSinceLastStatus, unchangedRevision, hasRevision})`. `seen` is the status the device saw: the value of the op named by `prev_op_id` when the server log holds it on that relatório's `relatorio/status`, `rascunho` when `prev_op_id` is null (a relatório is born `rascunho`), ~~else `server`~~ *(review pass 2026-11-03, VG-3: a non-null `prev_op_id` that names no logged status op of the relatório is refused `op_status_transition`)*. The device's intent is backward when `manualMove(seen, to)` is non-null; a backward intent is always allowed (AD-22, including Emitido to Em revisão on edit and every Desfazer that steps back). `to === server` is allowed (an idempotent duplicate, e.g. two devices completing setup). Otherwise the intent is forward and must be a forward row from the server's status: some event with `statusTable(server, event) === to`, plus: to `em_revisao` from `rascunho`/`em_campo` needs `issueJobSinceLastStatus` (an issue `generation_job` create whose seq is greater than the relatório's latest status op seq; no status op yet counts as seq 0) or `unchangedRevision` (a latest revision exists and `editedAfter(latest.snapshot_seq)` is false: the server's `unchanged` answer, which `advanceOnGenerate` also turns into Em revisão); to `emitido` needs `server === 'em_revisao'` and `hasRevision`. The two-device case then refuses B in both orders (seen Rascunho, to Em campo is forward; from Em revisão or Emitido it is no row). Only compute the job and revision facts when the verdict needs them.

**Attribution (20.8).** `ATTRIBUTED_FIELDS` lists, per family and value pointer, the actor-id and instant leaves: `block/field` `concluded_by.{actor_id, at}`, `not_tested.{by, at}`; the `block` create's `concluded_by` and `not_tested`; `meta.restore.removed_by` and `meta.restore.removal_conflict.{removed_by, edited_by, removed_at, edited_at}` on `block/{id}/removed_at`; and every other instant or actor field of a client-writable value or create row (removed_at puts, `captured_at`, `created_at`, `issued_at`, dates kept as dates are not instants), each with `actor: 'op'|'history'|'none'` and `instant: 'bounded'|'future'|'exempt'` plus a one-line reason for each exemption (a photo's `captured_at` from the gallery predates the relatório: future bound only). Rule: an actor leaf must equal `op.actor_id`, or (history) be the actor of an earlier logged op on the same path whose value holds the same leaf (the Desfazer of a colleague's conclusion or removal); a bounded instant and every op's `client_ts` are at most `now + CLOCK_SKEW_MS` and, for an op naming a relatório, at least its creation instant minus `CLOCK_SKEW_MS`. Guard test: walk the zod shapes in `schemas/entities.ts` and `ops/op.ts` (unwrapping optional, nullable, default; objects and one level of records) and fail when a leaf whose schema is `actorIdSchema` or `isoTimestampSchema` has no table entry.

**Value limits (20.9).** Kinds from the epic table: short 200 (names, TAG, serial, place, labels, registry fields, `owner`, `art_trt_number`, `exclusions[]` items), medium 1 000 (`file/field caption`, `not_tested.text`, checklist observation cell, point `action`, `next_intervention_justification`), long 20 000 (`additional_info`, `escopo`, OBSERVAÇÕES, conclusion `text` and `text_basis`, point `text`, `parecer.text`, section text in block config and template blocks); a text family whose value is a JSON cell must be a string or null; a `numberValue` has `raw` at most short and, for altitude, a parsed value in range; numbers finite; ids and enums through their own schema. Structured values not listed (`config`, `reading_target`, `criterion_override`, template `blocks`) cap every string leaf at long. The kernel check runs in `validate` (no state); `responsible_user_id` membership is the stateful part in `rules.ts`.

**Targets (20.10).** For a put or remove: the target row (after redirect) exists in `entities` of the company, live or tombstoned; a relatório-scope row (`row.relatorio_id`, and the relatório itself for implicit families) equals `op.relatorio_id`; an `equipment` row's `project_id` equals `op.project_id`. For a create: `op.relatorio_id`, when set, names an existing relatório of the company and equals the row's `relatorio_id`. Company-scope rows have no parent check. A refused target never inserts the op.

**Narrowings and open questions (also for the PR body).** (1) The lower instant bound takes the same 10 min skew as the upper one (two devices' clocks). (2) An attributed value naming a colleague is accepted when it restores that colleague's own earlier value (undo), which the DoR's "must name the op's actor" does not mention. (3) To Em revisão also passes on the server's `unchanged` state, so a generate answered `unchanged` after a back move keeps working. (4) Only altitude carries a numeric range; other AD-11 kinds are finite only. (5) The 5 MB S4 push is refused 413 by the 4 MiB body cap, not `op_value_invalid`. (6) The counter appears at 90 % of the cap (authored). (7) The production count of oversized stored values is a SQL query in the PR body for Matheus to run; nothing was run against production.

## Verification

**Commands** (inside the worktree's `tools` container: `podman compose --profile tools run --rm --user root tools pnpm ...`; logs in `.scratch-e20s/`):
- `pnpm lint`, `pnpm static` -- clean.
- `pnpm test:unit` -- green, including the new kernel and guard tests.
- `pnpm test:api` -- green, including the four new integration files, `replay`, `merge`, `panel-retarget` (restart the api container first).
- `pnpm exec tsx scripts/e2e.ts e2e/security-ops.spec.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` under the host lock; the touched status durability specs on the matrix projects.

## Auto Run Result

Status: done (2026-11-04).

- **Summary:** contract 29 and the six codes (`f1a2d006`); kernel rules `statusMoveVerdict`/`statusSeen` (`status/table.ts`), `ops/attribution.ts`, `ops/value-limits.ts`, `ops/targets.ts`, `opRejectReasonText` and `charCountText` (`sync/counts.ts`); the server calls them in `validate` and in `applyOneIn` through `apps/api/src/sync/rules.ts` (refusals op-alone, never rolling back a client batch); `POST /api/sync/ops` caps the body at 4 MiB and the device splits pushes by bytes; the web inputs carry the kernel caps and a counter; Sync status shows each refusal's sentence; AD-11, AD-22, AD-24, source-deltas and the KB updated; `e2e/security-ops.spec.ts` (`@p0`, serial) and four new api integration suites.
- **Files:** see `git diff 71ede5af..HEAD --stat` (about 100 files: kernel rules and tests, `apps/api/src/sync/{apply,rules,edited-after,routes}.ts` and suites, the capped web inputs, `policy.ts`/`engine.ts`, test seeds moved to server ops or valid paths, docs).
- **Review:** 15 findings (high 1, medium 8, low 5, maybe-false 1). Patched 10 (1 high, 7 medium, 2 low) in one loop (`30e7e3dd`, `f638e517`); deferred 2 (slow-clock resend, copies of over-cap stored values); rejected 3 (one root cause: a resend refused by a stateless check before the dedupe, reachable only across the deploy with a pre-29 over-cap value and a lost answer).
- **Follow-up review recommended:** true. The patched high (VG-3, the basis of a status op whose `prev_op_id` names an unlogged op) and the value-reference check (ECH-7) were patched after the review and only re-tested, not re-reviewed; the integrated epic review should read them first.
- **Verification:** story gate on the merge `845a82ef` (e20w and e20d merged in): lint, static, api 790 (3 skipped), unit 5000, e2e 353/357 (3 skipped, 1 red: e20d's 14.2-E2E-005 seeded a reference to an unsynced local, fixed in `359c55ac`), matrix 26/27 (1 skipped). Follow-up on `359c55ac`: lint, static, and 99/99 over local-painel-coluna and 23 other draft-pushing specs.
- **Residual risks:** production's Caddy relaying the early 413 unchecked; the production count of over-cap stored values not run (query in the PR body); undo of "Voltar para Em campo" refused when the Em revisão it restores was edited since its revision.
