---
title: 'e25b: the revision keeps the verdicts it printed (Story 25.4)'
type: 'feature'
created: '2026-11-11'
status: 'in-progress'
baseline_revision: '4da9493b7b381dc7839369aee665497e2b9ec587'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-25-context.md'
warnings: ['batched', 'oversized']
batched_reason: 'One story alone in batch e25b (wave 1, beside e25a); the tag is kept for the epic batch plan.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** An issued relatório's stored verdicts can differ from what its document printed: `relatorio.setup.parecer` is written only by a verdict tap, and a ficha's stored pair only by "Concluir ficha" or the "Conclusão ajustada" Confirmar, while the screen and the document read the effective values (`effectiveParecer`, `printedConclusionPair`). A raw reader (SQL, a count, a later export) reads a value older than the signed one (Bruno M17, the stored half of M01).

**Approach:** At issue, the generate job stores on the new `revision` row, computed once by the kernel from the frozen snapshot it rendered, the parecer as section 10 printed it and each ficha's pair as section 9 printed it, in two optional keys. The technician's stored choices are never written. One kernel function answers a raw reader: the last revision's recorded verdicts, else the effective ones. Contract 48.

## Boundaries & Constraints

**Always:**
- The two keys are optional and never defaulted: a revision row written before parses to the same bytes (`JSON.stringify` equal).
- The values are the kernel's (AD-1, AD-13): `printedVerdicts(snapshot)` uses the very calls the layout uses (`printsSection`, `effectiveParecer`, `printedConclusionPair` with `visitContextOf`), and the set of fichas is exactly the sheets section 9 prints a CONCLUSÃO row for. The api calls it once on `frozen.snapshot` and never recomputes or edits a value.
- "Absent" means "not recorded": every reader (the raw-reader function first) falls back to the effective values, never to Aprovado or Apto.
- A preview stores nothing new (`commitPreview` unchanged).
- `CONTRACT_VERSION` 48 and `MIN_CONTRACT_VERSION` 48, each with its paragraph in `contract/version.ts` in the form of 44 to 47.

**Never:**
- Write `relatorio/setup/parecer`, `sheet/{id}/conclusion/*` or `block/{id}/concluded_by` from the job or anywhere new.
- Change a screen, a printed byte, a seed, a golden, a fixture op (layout-lock v5, v11, v12, v13 and the Porto Seguro golden stay byte-identical). No `GOLDEN_UPDATE`.
- Close the `deferred-work.md` § e22c row on a stricter parecer that stays stored (line ~3045): the story names it out of scope (Bruno's). The batch annotates it, dated, as checked and still open.
- Add a device reader of the keys (no screen reads them).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Issue, stored looser than effective | `setup.parecer` Apto; a concluded Aprovado ficha whose reading was later typed out | DOCX: NÃO APTO, ficha X on REPROVADO; revision `printed_parecer: 'nao_apto'`, `printed_conclusions[blockId]: {result:'reprovado', restriction:null}` (v14) ; `setup.parecer` and the stored pair unchanged | none |
| Re-issue after the correction | the reading corrected, fichas clear | screen: derived Apto, ficha Aprovado; revision 2 stores `apto` and `aprovado`/`sem_restricoes`; revision 1 unchanged | none |
| Section 10 switched off | no section-10 block live | `printed_parecer: null` (the key present) | none |
| Section 9 off, or no sheet prints a CONCLUSÃO row | | `printed_conclusions: {}` | none |
| Sheet not tested / conclusion sub-block off / unknown definition | | no entry for that block (section 9 prints no CONCLUSÃO row) | none |
| Open sheet at issue | pair partly chosen | entry with the printed halves, `null` where no X printed | none |
| Revision before 25.4 | row without the keys | parses unchanged; `relatorioVerdicts` answers `source: 'effective'` | never Apto/Aprovado by default |
| Preview | "Pré-visualizar" | no revision, nothing stored | none |
| Client on contract 47 | pull with header 47 | `426 contract_outdated` on every stream | the "Atualizar" state, as before |
| Company B | B asks A's revision (`/api/revisions/{id}/docx`, pdf, A's relatório stream) | refused exactly as today | none |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts` ~808 `revisionRowSchema` -- add `printed_parecer: parecerVerdictSchema.nullable().optional()` and `printed_conclusions: z.record(uuidV7Schema, printedConclusionSchema).optional()`, where `printedConclusionSchema = z.object({ result: z.enum(['aprovado','reprovado']).nullable(), restriction: z.enum(['sem_restricoes','com_restricoes']).nullable() })` (types must equal `ConclusionResult`/`ConclusionRestriction` of `relatorio/conclusion.ts:32`; add a type-level check). `parecerVerdictSchema` is at ~415. Doc comment naming Story 25.4 and "absent = not recorded".
- `packages/domain/src/print/section-9.ts` ~1485 `sheetOf` -- the CONCLUSÃO row prints when `block.not_tested === null`, `definition !== null` and `enabledSubBlocksOf(block).has('conclusion')`. Extract that test into one exported predicate and use it in `sheetOf` (no behaviour change), so the verdict function cannot drift from print.
- `packages/domain/src/print/layout.ts` 190-262 -- `printedSections`/`printsSection(snapshot, n)`; section 9 prints `section9Layout` over `groupForPrint(snapshot)` (`print/group-for-print.ts:458`) subsections' `blockIds`; section 10 prints `section10Layout` whose title is `effectiveParecer` (`print/section-10.ts:132`).
- `packages/domain/src/relatorio/conclusion.ts` 263-335 -- `effectiveConclusionPair`, `printedConclusionPair` (read-only; reuse).
- `packages/domain/src/relatorio/parecer.ts` 199 `effectiveParecer` (read-only; reuse).
- `packages/domain/src/print/revisions.ts` -- `latestRevision`; new kernel functions go in a new `print/printed-verdicts.ts` (exported from the package index): `printedVerdicts(snapshot): { printed_parecer, printed_conclusions }` (what the job stores) and `relatorioVerdicts(snapshot, revisions): { source: 'revision' | 'effective'; revisionNumber: number | null; parecer; conclusions }` (the raw reader: the latest live revision of that relatório when it carries both keys, else `effectiveParecer` when section 10 prints (else null) and `effectiveConclusionPair` over the same set of fichas).
- `apps/api/src/jobs/generate/job.ts` 465-500 `commitRevision` -- spread `printedVerdicts(frozen.snapshot)` into the `revision` value. Nothing else in the job changes.
- `apps/api/src/jobs/audit/job.ts` 78-81 + `packages/domain/src/audit/input.ts` 205-207, 229-251 -- the Conferência por IA reads the draft `layoutSpec`: section 10's title (`effectiveParecer`) and section 9's marks (`printedConclusionPair`). Already the effective values: verify with a test, no fix expected. If a stored value is found read, fix it here.
- `packages/domain/src/ops/value-limits.ts` 182, 360-372 -- `revision` is server-only and outside the relatório budget; confirm no cap refuses the larger value.
- `packages/domain/src/contract/version.ts` 539-557 and 874-883 -- add paragraph 48 to both blocks; bump both constants to 48.
- Exact contract asserts to move to 48: `packages/domain/src/contract/contract.test.ts:116-117`, `apps/api/src/sync/sync.integration.test.ts:1120-1121`, `apps/api/src/sync/relatorio-creation.integration.test.ts:164`.
- Test patterns: `apps/api/src/sync/e24s-seed-v14-sheets.integration.test.ts` 234-246 (426 test, `routeHarness`); `apps/api/src/jobs/generate/e24a-v14-print.integration.test.ts` (layout-lock fixture on v13/v14 pushed and issued, DOCX structure via `extractStructure`, `conclusionOf`); `apps/api/src/jobs/generate/job.integration.test.ts` (generate through the api route, revision read); `e2e/conclusion-v14.spec.ts` 95-160 (conclude, `storedPair`, `issue`, DOCX CONCLUSÃO table, `BOXES`).
- Fixtures: `packages/domain/fixtures/layout-lock` (`layoutLockFixture(version, …)`, `layoutLockSnapshot`), read-only.
- `e2e/support/groups.ts` `SERIAL_SPECS` -- a spec that issues through the document queue goes in lane `queue` (`scripts/e2e.test.ts` checks).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts` -- the two optional keys and their schema -- the stored record.
- `packages/domain/src/print/section-9.ts` -- the exported CONCLUSÃO-row predicate, used by `sheetOf` -- one rule for print and record.
- `packages/domain/src/print/printed-verdicts.ts` (+ index export) -- `printedVerdicts`, `relatorioVerdicts` -- the kernel owns every verdict.
- `packages/domain/src/print/printed-verdicts.test.ts` -- "25.4-UNIT": (a) on `layoutLockSnapshot('v13')` and `('v14')`, the block ids of `printed_conclusions` equal, in order, the layout's sheets that carry a CONCLUSÃO table, each pair equals the X marks of that table, and `parecerVerdictLabel(printed_parecer)` equals the `section_10` title; (b) stored Apto with fichas giving Não apto records `nao_apto` and leaves the snapshot's `setup.parecer` unread-and-unchanged; (c) section 10 off gives `null`; not tested, conclusion off and open-sheet cases per the matrix; (d) `relatorioVerdicts` with no revision, with a pre-25.4 revision (source `effective`, never Apto by default: use a relatório whose effective parecer is Não apto), with a 25.4 revision (source `revision`, its number), with two revisions (the latest); (e) a pre-25.4 row parses to the same JSON; (f) the serialized size of the keys on the v14 fixture, logged in the test name or asserted under 120 bytes per ficha.
- `packages/domain/src/audit/audit.test.ts` -- AC6: a snapshot whose `setup.parecer` is Apto and whose ficha's stored pair is Aprovado but whose effective values are Não apto/Reprovado: `auditInput(layoutSpec(draft), snapshot).text` holds `PARECER: <label of nao_apto>` and that sheet's REPROVADO mark, and no `PARECER: <label of apto>`.
- `apps/api/src/jobs/generate/job.ts` -- `commitRevision` spreads `printedVerdicts(frozen.snapshot)` -- written once in the batch that writes the revision.
- `packages/domain/src/contract/version.ts` + the three exact asserts -- contract 48, MIN 48, two paragraphs: what 48 adds; what a version-47 bundle sees (its revision schema strips the two keys when it folds the create, so its store would hold the revision without them; no device reader reads them, nothing on screen changes; refused at pull with 426 so that no device stores a stripped revision it would keep after updating; its pushes are still accepted).
- `apps/api/src/jobs/generate/e25b-revision-verdicts.integration.test.ts` -- "25.4-API-001" and "25.4-INT" through the api's real worker and route: push the layout-lock fixture on v13 and on v14 (the v14 breaker is Reprovado with no restriction), `POST /api/relatorios/{id}/generate`, wait for the revision; read the revision create op from `GET /api/sync/relatorios/{id}` and assert both keys; download its DOCX and assert, in sheet order, each CONCLUSÃO table's boxes equal `printed_conclusions` and section 10's verdict equals `printed_parecer`; `setup.parecer` and every block's stored pair equal before and after; a relatório with the section-10 block removed issues `printed_parecer: null`; a preview writes no revision; a version-47 pull answers 426 on the three streams; company B gets A's `/api/revisions/{id}/docx` and `/pdf` and A's relatório stream refused exactly as the existing generate tests assert.
- `e2e/revision-verdicts.spec.ts` (`@p1`, lane `queue` in `e2e/support/groups.ts`) -- AC1 to AC3 from the UI (E8-A6): a v14 relatório, one sheet concluded Aprovado inside its criterion, Etapa 6 tapped Apto; the reading typed out of criterion; "Gerar relatório" issues revision 1: the DOCX prints NÃO APTO and REPROVADO, the device store's revision 1 holds `nao_apto` and `{reprovado, null}`, the relatório row's `setup.parecer.verdict` is still `apto` and the block's stored pair still Aprovado; the reading corrected: the ficha and Etapa 6 show Aprovado and Apto; revision 2 holds `apto` and `{aprovado, sem_restricoes}`; revision 1 unchanged.
- Records (the orchestrator): spine dated note under AD-25; `source-deltas.md` row 191 "(planned, Story 25.4)" struck and the built record beside it; `docs/kbs/architecture/data-model.md` + `docs/kbs/log.md`; `deferred-work.md` § "e25b"; the § e22c row annotated; `sprint-status.yaml` 25.4 to `review`.

**Acceptance Criteria:**
- Given a relatório whose stored parecer is "Apto" and whose fichas give "Não apto", when it is issued, then the document prints "Não apto", the new revision stores `nao_apto`, and `setup.parecer` is as it was (e2e, API).
- Given a ficha concluded Aprovado whose reading was later typed out of its criterion, when issued, then the revision stores Reprovado for it as section 9 printed it, and its stored pair is as it was (e2e, INT, UNIT).
- Given that relatório after the reading is corrected, when issued again, then the screen shows the derived verdict and the second revision stores what it printed, the first unchanged (e2e).
- Given section 10 switched off, when issued, then the revision stores `printed_parecer: null` (API, UNIT).
- Given a revision written before this story, when a device pulls it, then it parses as before and `relatorioVerdicts` answers with the effective values (UNIT).
- Given the Conferência por IA on a relatório whose stored and effective verdicts differ, when its payload is built, then it holds the effective ones (audit UNIT).
- Given a client on contract 47, when it syncs, then its pull is refused 426 `contract_outdated` (API).
- Given company A's revision, when company B asks for it, then it is refused as every revision read is (API).
- No golden, fixture op or seed moves: `git diff --stat origin/main -- apps/api/src/jobs/generate/golden packages/domain/fixtures packages/domain/src/seed` is empty and `docx-layout-lock.test.ts` is green.

## Spec Change Log

## Review Triage Log

## Design Notes

- Why on the revision, not over the stored values (M-3): a stored verdict is the technician's choice (`effectiveParecer` keeps a stricter stored verdict; `effectiveConclusionPair` takes the stricter of floor and store). Writing the effective "Não apto" over `setup.parecer` would hold it as a choice in the next revision after the fichas clear.
- Raw reader vs. printed: the revision stores what section 9 printed (`printedConclusionPair`: on an open sheet the chosen halves, the floor alone prints no mark); the fallback with no recorded revision is the effective pair (`effectiveConclusionPair`), as the story says. Both use the same set of fichas.
- Size: one entry is a block id (36 characters) and two short enums, about 90 bytes serialized; 200 fichas are about 18 KB per revision. The row is relatório scope (`ops/path.ts` revision family), so it reaches only devices that pull that relatório, once per revision; no device reader reads the keys, and server-only rows are outside the 4 MiB relatório budget.
- Matrix durability run: not required (no device commit path, no fold of a device op, no live query on the ficha changes; the revision create is server-only).

## Verification

**Commands (tools container, under the host lock for Playwright):**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `static` / `test:unit` / `test:api` -- green.
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/revision-verdicts.spec.ts e2e/export.spec.ts e2e/parecer-export.spec.ts e2e/conclusion-v14.spec.ts e2e/emission-audit.spec.ts e2e/security-ops.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green.
- `git diff --stat origin/main -- apps/api/src/jobs/generate/golden packages/domain/fixtures packages/domain/src/seed` -- empty.
