---
title: 'e27a slice 2: the company the screen shows, and the impossible refused (Stories 27.1 and 27.2)'
type: 'bugfix'
created: '2026-11-21'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-27-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e27a-grave-fixes.md'
warnings: ['batched', 'multiple-goals']
batched_why: 'Slice 2 of the Epic 27 wave 1 batch e27a, on the branch and PR (#345) of slice 1; both stories ride on one contract number.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** F1: the PDF carried another company's identity, because the server snapshot and the web pick the first `empresa` registry row each in its own way, and a company held two live rows, one with no op. F2-F6 and F11: humidity of 150 %, 999 °C, 0 µΩ on an absolute criterion, an invalid CNPJ, a non-numeric ART and an out-of-range altitude reached the document or the store.

**Approach:** Read Stories 27.1 and 27.2 in `_bmad-output/planning-artifacts/epics.md` (grep `### Story 27.1` and `### Story 27.2`, read with offset/limit; never the whole file); they are the source of truth for the criteria, the DoR tasks and the DoD tests. This spec adds only the decisions and anchors below.

## Boundaries & Constraints

**Always:**
- **Contract 56, one bump for both stories:** `CONTRACT_VERSION` 56 and `MIN_CONTRACT_VERSION` 56 in `packages/domain/src/contract/version.ts`, with a dated reason naming 27.1 (second `empresa` refused) and 27.2 (the new value refusals). A device on 55 gets 426 and the update notice. Update the count and list assertions e26a also touched (`contract.test.ts`, `path.test.ts`, `measurement-table.test.ts`, `edited-since.test.ts`, `entities.test.ts`, `value-limits.test.ts`, `sync.integration.test.ts`) only where your change moves them.
- **Refusal codes:** reuse existing reject codes. Use the code the value limits already give for an out-of-range value; use the code that best fits the second `empresa` (for example `op_forbidden` or `op_invalid`). Do not add a code to `contract/errors.ts` unless 27.2 strictly needs one. If it does, say so in your report.
- **27.1 rule placement:** in `apps/api/src/sync/rules.ts`, `checkClientOp`, after e26a's early role block and beside its registry permission check, which it does not replace. Refuse a `create` on `registry/empresa/{id}` in a company that already holds a live `empresa` row with another id. The first row stays unchanged.
- **`pickEmpresa(rows)`** goes in `packages/domain/src/registry/empresa.ts`: the live `empresa` rows (`removed_at === null`), the smallest id first. Registry rows carry no `created_at`. Ids are UUIDv7 and therefore time-ordered, so the smallest id is also the earliest row; say this in the report as a narrowing of the coordinator's "earliest created_at, then the smaller id". It is used by `empresaRow` (`apps/web/src/db/home-store.ts:83`) and by both reads of `packages/domain/src/schemas/snapshot.ts` (`:227`, `:368`). The Gerar dialog's "Controle do documento" and `print/document-control.ts` read it through the same snapshot; a kernel test compares them field by field.
- **27.2 limits:** humidity 0 to 100 inclusive (refused outside, in the kernel's value rules so both the device's input and the server's fold refuse it). A temperature outside -10 to 60 °C is saved with an amber remark and one pre-issue row naming the ficha (or the local). A resistance reading of zero or below on an absolute criterion takes the existing `not_positive` refusal. The CNPJ must pass modulo-11 check digits; the message says the number is not valid. An ART/TRT that is not numeric (digits and the councils' separators) gets an amber remark and a pre-issue row and never blocks. The altitude field shows the range message and writes nothing out of range; report in one line whether 99999 was written as an op before your change. A reading's remark cites its criterion in the unit typed, on screen only; the printed criterion is unchanged.
- **`pre-issue.ts`:** only append your kinds and rows. 27.4 owns `EXPLICIT_KINDS` and the count sentence. Decide whether your two kinds are listed in the dialog and say which.
- Old data is not judged again: a stored op prints as before. A queued op refused by the new limits takes the existing rejected-ops path.
- Derived text in `packages/domain`; static copy in `apps/web/src/copy/pt-br.ts`. Every new pt-BR sentence is marked `// authored (Story 27.x, listed for Bruno)`.
- Grep `e2e/` and the web and kernel tests for every string, count and code you change; update the hits; list the grep and its hits in your report.

**Never:**
- Change a golden document, a layout lock or `pdf-text.json`. If one turns red, stop and report. `pre-issue.golden.json` may gain rows.
- Edit seeds v1 to v16 or their pinned hashes, `ops/path.ts`, `http/session.ts`, `auth/auth.ts`, `permissions/`, `apps/web/src/app.tsx`, `epics.md`, `sprint-status.yaml` or `docs/kbs/`.
- Touch the main checkout's database or any container not named `fasor-e27a-*`. Do not clean the local stray row yourself: write the cleanup command in your report.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| two empresas | live rows with ids B > A, in either insertion order | web `empresaRow`, both snapshot reads and the print pick A | a removed row is never picked |
| second create | company holds live A; device pushes create `registry/empresa/B` | rejected with the named code; A unchanged | a put on A still applies |
| humidity | 0, 100 / -0,1, 100,1, 150 | accepted / refused on device (no op) and on the server fold | stored 150 from before prints as before |
| temperature | -10, 60 / -10,1, 60,1, 999 | saved; outside: amber remark + one pre-issue row; Gerar enabled | — |
| zero reading | 0 on an absolute criterion / 0 on a relative one | refused `not_positive` / as today | — |
| CNPJ | 11.111.111/1111-11 / a valid one | refused with the new message / accepted (Clientes and Etapa 1) | — |
| ART | "abc" / "2620262602583" | saved with amber remark + pre-issue row / no remark | never blocks |
| altitude | 99999 | range message, nothing out of range stored | — |
| contract | device on 55 | 426 and the update notice | — |

</intent-contract>

## Code Map

- `apps/api/src/sync/rules.ts` `checkClientOp` (e26a's role block first); `apps/api/src/sync/apply.ts:595-625` the fold (the only `entities` insert; `:615` deletes a refused op's log row).
- 27.1 Task 1 leads (unconfirmed; verify before fixing). Every cleanup that deletes `ops` and `entities` with different predicates: `apps/api/src/db/sample-relatorio.ts:116-124` and `apps/api/src/db/test-fixtures.ts:115-137` (ops by `op_id in log OR relatorio_id OR project_id`, entities by created ids, relatorio_id or project_id, so a company-scope row the log only put keeps its row and loses its op); also `seed.ts:526,563`, `smoke-seed.ts:97`, `test-cleanup.ts:16`, `e2e/support/reset-empresa-b.ts`. The stray local row id `01a0f32f-2052-7c4a-87af-da665ab05007` is UUIDv7-shaped (minted at run time, not a `fixedId`). The full fixture creates its empresa (`packages/domain/fixtures/porto-seguro/op-log.ts:108-129`, `EMPRESA_ID = fixedId(4)`); the small fixture (used by the sample relatório) creates none. Name the file and function that leaves a row with no op, with a reproduction on an empty company in an api test ("27.1-API-002"), and fix it. If nothing reproduces, say so.
- `packages/domain/src/registry/empresa.ts`, `packages/domain/src/schemas/snapshot.ts:225-228,367-369`, `apps/web/src/db/home-store.ts:82-86`, `packages/domain/src/print/document-control.ts`, the Gerar dialog's document control (`apps/web/src/surfaces/export/`).
- 27.2: `packages/domain/src/ops/value-limits.ts:115` (`ENV_VALUE_RULES`, `SITE_ALTITUDE_RANGE_M`), `packages/domain/src/checks/input-refusal.ts:34,42` (`not_positive`), `packages/domain/src/relatorio/measurement-evaluation.ts:1667` (`parseMeasurementReadingPtBr`), `packages/domain/src/checks/cnpj.ts:8`, `apps/web/src/copy/pt-br.ts` (`cnpjInvalid`), `apps/web/src/surfaces/relatorio/setup/etapa3-responsavel.tsx:43`, `setup/etapa5-local.tsx` (altitude input), `packages/domain/src/relatorio/pre-issue.ts` (append kinds), `packages/domain/src/contract/version.ts:657,1049`.

## Tasks & Acceptance

**Execution:** the criteria and DoD tests of Stories 27.1 and 27.2 in `epics.md`, built with the decisions above. Tests by name: "27.1-UNIT", "27.1-API-001", "27.1-API-002", `e2e/document-company.spec.ts` "27.1-E2E-001 @p0" (queue lane in `e2e/support/groups.ts`: it generates a document); "27.2-UNIT", "27.2-API-001" (humidity 150 refused by the fold, a queued op refused into the rejected list, the 426), `e2e/value-limits.spec.ts` "27.2-E2E-001 @p0" (the seven screens as a user types them, asserting outbox and store as well as the screen). New `@p0` specs assert committed state.

**Acceptance Criteria:**
- Given the whole slice on the merge with `origin/main`, when `lint`, `static`, `test:unit`, `test:api` and every new or touched spec run under the host lock, then all are green, and no golden, layout lock or `pdf-text.json` changed.

## Verification

**Commands:** this worktree, compose project `fasor-e27a`. Write the code first. Before `podman compose up -d postgres minio api`, run `podman ps`; bring the stack up only if fewer than two batch stacks (`fasor-e2*`) are running. Otherwise wait with a Monitor until-loop polling every 60 s or more, never busy polling. Every test command runs as `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c 'podman compose --profile tools run --rm --user root tools pnpm ...' > .scratch-e27a/<name>.log 2>&1`, polled in bounded loops of at most 55 s, reading only the tail. Run `podman compose restart api` after any change under `packages/domain` or `apps/api`. With `scripts/e2e.ts`, spec paths go before `--project`. Use the narrowest suite while iterating.
