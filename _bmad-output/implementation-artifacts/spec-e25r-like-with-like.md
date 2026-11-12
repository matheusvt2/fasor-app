---
title: 'e25r: like with like survives the issue (R-1, E24-A1) and the test gaps of Story 25.4'
type: 'bugfix'
created: '2026-11-11'
status: 'in-progress'
baseline_revision: '132ad4a1'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: max
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-retro-2026-11-11.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-25-context.md'
warnings: ['batched']
batched_reason: 'Fix batch of wave 1: the retrospective item E24-A1 (items 1 to 3) and the test gaps the wave review found in batch e25b share the issue job and its api tests.'
---

<intent-contract>

## Intent

**Problem (R-1, in production since 2026-11-11, seed v14).** The v14 rule `history_needs_like_with_like`
(fix batch e24y, Y1) compares no reading when this visit was corrected from the cabine's ambient and the
previous visit from its plate's temperature. It learns the second half from the equipment's
`last_nameplate`, accepted only when it is the previous visit's (`relatorio/visit-context.ts`). The issue job
overwrites `last_nameplate` with the issuing relatório's own plate. After that the previous visit is
`last_results.prior`, the plate no longer matches, the rule reads "plate not known" and compares as v13: the
false drop or variation comes back on the sheet, in the conclusion, the points, the parecer, the progress,
and in the note line and cell marks revision 2 prints. The same happens to a draft that reads `prior` after
a later-dated relatório is issued on top.

**Approach.** What the rule needs travels with the visit's results. Each `last_results` entry keeps
`plate_measured`: the plate temperature keys that held a finite number when that visit was issued. It moves
into `prior` with the entry. `visitContextOf` reads it first; the `last_nameplate` match stays as the
fallback for entries written before this fix. When the issue job is about to overwrite a plate that still
knows an entry's answer, it fills the field on that entry. A previous temperature counts only as a finite
number (item 2). The row shape changes, so the contract moves to 49 and MIN follows (item 3).

**Second part.** The test gaps of the wave review of batch e25b (Story 25.4): T1, T3, T4. No behaviour
change there.

## Boundaries & Constraints

- Kernel and api only. Batch e25x edits `apps/web/src/` at the same time: nothing under `apps/web/` changes
  here, except a test that must follow the kernel change (a contract literal); name each one in the report.
- Seed v14 is frozen and in production: no seed content change; `history_needs_like_with_like` stays as it
  is. No golden of v5 to v14 changes. If one would move, stop and report the bytes and the reason first.
- No change to what B1 does (see T4): pin and ledger only. B2 and B3: ledger rows only (the orchestrator
  writes them).
- `last_results` and `last_nameplate` stay server-only puts (`ops/value-limits.ts` `SERVER_ONLY`,
  `status/edited-since.ts` `never`); no new path family, no new op kind, no target or attribution pointer
  (the new key holds field keys, not ids or instants).
- Nothing is run in phase A (the machine is busy). Write code and tests statically; the orchestrator runs
  them later.
- English, plain words, no emoji. Public repository: nothing from `docs/context/` or `docs/media/`.

## Design

**D1. The row (`schemas/entities.ts`, `lastResultsEntryShape`).** New optional key, never defaulted:
`plate_measured: z.array(z.string()).optional()`. Meaning: the plate temperature keys of the visit's sheet
that held a finite number when the revision was issued, sorted, no duplicate. Present (even empty) means
"this visit's plate is known". Absent means "not recorded": an entry written before contract 49, or a sheet
whose definition names no plate temperature. Both `prior` and the top carry it (one shared shape).

**D2. One parse, one list (a small kernel module, no import cycle).**
- `plateCelsiusOf(value: unknown): number | null`: the parse `plateCelsius` uses today
  (`relatorio/temperature-correction.ts`): an object, `state === 'measured'`, `raw` a string matching
  `^-?\d+(\.\d+)?$`, a finite number. `plateCelsius` calls it, so the current visit and the previous one are
  read by the same rule (item 2).
- `plateTemperatureFields(definition): string[]`: every `oil_field` and `dry_field` of the definition's
  tests' `temperature_correction` and measurement tests' `winding_correction`, sorted, unique.

**D3. Writing (`print/last-results.ts` `lastResults`).**
- `own` gains `plate_measured` when `plateTemperatureFields(definition)` is not empty: the fields whose cell
  in `block.sheet.nameplate` gives a number by `plateCelsiusOf` (the very cells the sheet's own judgement
  read; the nameplate sub-block's switch is not consulted, as `testTemperature` does not consult it). No key
  when the definition names none, so every entry of v1 to v12 keeps its bytes.
- The fill: an entry (top or prior) of the value the job writes that has no `plate_measured`, while the
  snapshot's `equipment.last_nameplate` is that entry's (same `relatorio_id` and `revision_number`), gets
  `plate_measured` = the block's definition's plate temperature fields that hold a number in
  `last_nameplate.fields`. Applied to the whole written value in every branch (own on top with the old top
  as prior; the old top kept with own as its prior; a re-issue keeping `existing.prior`).
- The same fill where today nothing is written for an equipment while this issue may still overwrite its
  plate (the two skip branches, and a live equipment block with no reading, marked not tested included, as
  `lastNameplates` does not skip those): when the fill changes the existing value, the existing value is
  written with the field filled and nothing else changed. When the fill changes nothing, nothing is written,
  as today.
- `print/reading-slots.ts` `withoutPrior` carries `plate_measured` when the entry has it (no key otherwise).

**D4. Reading (`relatorio/visit-context.ts`).** `VisitContext.previousPlate` is replaced by
`previousPlateKeys?: readonly string[]` (the keys that held a number; absent when not known):
1. the previous visit's own `plate_measured` when present;
2. else the fallback: `last_nameplate` when it is that visit's (relatório and revision), its fields read with
   `plateCelsiusOf` (item 2 applies to the fallback too);
3. else absent.
`previousPlateMeasured(visit, key)` keeps its signature and its three answers (true, false, null). The two
rule sites (`reading-evaluation.ts`, `measurement-evaluation.ts`) do not change. Every reader takes the same
`VisitContext`, so the Measurement table, the conclusion, the points, the parecer, the progress and the
document agree without a change of their own. The memo keys do not change (a new equipment row is a new
object).

**D5. Entries already in production without the field.** An entry whose plate was already overwritten (a
v14 relatório issued, or re-issued, between the 2026-11-11 deploy and this fix) stays "plate not known:
compared as v13". No backfill here; the read-only count in the PR body tells Matheus how many equipment rows
are in that state. An entry whose plate is still in `last_nameplate` is healed by the fallback now and by the
fill at the next issue.

**D6. Contract 49, MIN 49 (item 3).**
- Strictness: the equipment schema is a plain `z.object` (it strips unknown keys). A contract-48 bundle that
  pulled an entry with `plate_measured` would fold it without the key and keep the stripped row after it
  updates (a pulled op is not folded again): its sheet would compare as v13 while the server prints the
  like-with-like result, R-1 again on that device. So its pull answers `426 contract_outdated` and it updates
  first; its pushes are still accepted. Same reasoning as 46 and 48.
- An offline client: it keeps working and pushing; at its next pull it meets the "Atualizar" notice.
- Value limits: the path is `SERVER_ONLY`; no client can push the key; no cap needed.
- Op targets and attribution: no id and no instant in the key; no new row in `ops/targets.ts` or
  `ops/attribution.ts`. If a kernel completeness test over the schema asks for a row, add the exemption with
  its reason.
- Server side: the server's `equipmentRowSchema` is the same module; an old row parses to the same bytes.

</intent-contract>

## I/O & Edge-Case Matrix

A = first visit (issued), B = second visit (v14 transformer, same equipment), C = a later relatório.
"oil" = TEMPERATURA DO ÓLEO (`temperatura_oleo_c`); the dry twin is `dry_field`.

| # | State | Before the fix | After |
|---|---|---|---|
| 1 | A typed oil; B did not (ambient 25 °C), readings equal to A's; B not issued; top = A without the field, `last_nameplate` = A's | no flag (F9) | no flag (fallback) |
| 2 | Row 1, then B issues revision 1, nothing edited | flags come back (R-1) | no flag: `prior` = A carries `plate_measured: ['temperatura_oleo_c']` (filled) |
| 3 | Row 2, then B issues revision 2, nothing edited | flags printed in revision 2 | no flag; revision 2 prints as revision 1 (no note line, no mark) |
| 4 | A issued by the new code (field present); B draft, then B issued | as 1, 2 | no flag before and after |
| 5 | A typed oil; B draft (did not type); C dated after B's visit is issued on top (top C, prior A, plate C's) | B's draft flags | no flag: prior A keeps or receives the field |
| 6 | Neither visit typed it (`plate_measured: []`, or the fallback plate without the key) | compared, as v13 | compared, as v13 |
| 7 | Both typed it | compared, as v13 | compared, as v13 |
| 8 | Entry without the field and a plate of another visit (the production leftovers, D5) | compared, as v13 | compared, as v13 (pinned) |
| 9 | Previous plate's oil cell `measured` with a raw that is no number (`'abc'`, `''`, `'1e5'`, `'NaN'`), by the field or by the fallback | counts as typed (ECH 5) | does not count: compared, as v13 |
| 10 | Seed v13 reader in any row | compared | compared (the flag is v14's) |
| 11 | A v1 to v12 sheet issued | entry bytes | the same bytes (no key) |
| 12 | Dry unit: A typed TEMPERATURA DO ENROLAMENTO, B did not | as 1 to 3 | as 1 to 3 with the `dry_field` key |
| 13 | A skip branch (nothing written for the equipment) while the top lacks the field and the plate is the top's | plate lost at this issue | the top is written with the field filled, nothing else changed |
| 14 | A contract-48 pull on the company, relatório and project streams | 200 | 426 `contract_outdated`; a 49 pull is answered; a 48 push is accepted |

## Code Map

- `packages/domain/src/schemas/entities.ts` `lastResultsEntryShape`: D1.
- `packages/domain/src/relatorio/temperature-correction.ts` (`plateCelsius`), new small module for D2.
- `packages/domain/src/print/last-results.ts` `lastResults`; `print/reading-slots.ts` `withoutPrior`,
  `previousResultsFor` (unchanged logic); `print/last-nameplate.ts` (unchanged; read it for which blocks it
  writes).
- `packages/domain/src/relatorio/visit-context.ts`: D4. Rule sites: `reading-evaluation.ts:1029-1037`,
  `measurement-evaluation.ts:990-999`.
- `packages/domain/src/contract/version.ts`: `CONTRACT_VERSION` 49 with its text; `MIN_CONTRACT_VERSION` 49
  with its text. Literals to follow: `contract/contract.test.ts:115-118`,
  `apps/api/src/sync/relatorio-creation.integration.test.ts:164`, `apps/api/src/sync/sync.integration.test.ts:1120`,
  `apps/api/src/jobs/generate/e25b-revision-verdicts.integration.test.ts:395`; grep `e2e/` and `apps/web/src`
  for a literal 48 or a "version-47" skew that must become 48.
- `apps/api/src/jobs/generate/job.ts:504-516`: the two projections (no change expected: the kernel does it).
- Tests to model on: `packages/domain/src/relatorio/e24y-pass-fixes.test.ts:268-360` (`copiedWithoutOil`,
  `withPreviousPlate`, `historyFlags`, `verdictsOf`); `print/last-results.test.ts`;
  `apps/api/src/jobs/generate/e24p-v14-print.integration.test.ts` (the DOCX of a v14 second visit, its note
  lines); `e25b-revision-verdicts.integration.test.ts` (route, worker, pull, DOCX helpers);
  `e2e/previous-visit-judges.spec.ts` 23.6-E2E-003 (A issued, B of the same obra).
- Records: `_bmad-output/specs/spec-fasor/source-deltas.md` (a row), the spine's AD-25 (`ARCHITECTURE-SPINE.md:262`),
  `docs/kbs/architecture/{data-model,kernel-and-seed,decisions}.md`, `docs/kbs/log.md`.

## Tasks & Acceptance

**Tasks (in order; tests first, written to fail on 132ad4a1).**

1. Kernel red tests, new file `packages/domain/src/relatorio/e25r-like-with-like.test.ts`, ids `e25r-R1-UNIT-*`.
   A helper folds an issue the way the job does: `lastNameplates` and `lastResults` over the snapshot, each
   entry put on its equipment row. Cases: matrix rows 1 to 13. Rows 2, 3 and 5 are the red ones on 132ad4a1.
   For rows 2 and 3 assert, before and after each issue, the same `historyFlags`, the same `verdictsOf`, the
   same `printedVerdicts(snapshot)` (conclusion and parecer), the same `sheetProgress` of the block, the same
   points if the fixture derives any, and the same history note (`testHistoryNote`, `measurementHistoryNote`).
2. Kernel unit tests for D1 to D3 beside their modules: the schema (an entry without the key parses to the
   same JSON; with it, the same JSON; a non-array is refused); `plateCelsiusOf` boundaries (0, negative,
   decimal, `'abc'`, empty, `'1e5'`, state not measured, array, null); `lastResults` writes the key sorted, no
   key on a v12 definition, the fill in each branch, the skip-branch write, and "the fill changes nothing:
   nothing written"; `withoutPrior` carries the key.
3. The fix: D1 to D4.
4. Contract 49: the constant, the two texts in `version.ts`, the literals. A sync-route test: a version-48
   pull answers 426 on the three streams, a 49 pull is answered, a 48 push is accepted (beside the existing
   25.4-API-002).
5. Api integration test through the real issue job, new file
   `apps/api/src/jobs/generate/e25r-like-with-like.integration.test.ts`, ids `e25r-R1-API-*`: the v14
   layout-lock relatório on Empresa A, its transformer on its second visit in the R-1 state (the previous
   visit's plate with oil typed written as the server would, this visit's oil not typed, the cabine's ambient
   typed, readings equal to the previous ones). Issue revision 1 through the route: the DOCX prints no
   history note line under the transformer's insulation and winding tables and no history mark on their
   cells; the equipment's `last_results.prior` carries `plate_measured`. Issue revision 2 with nothing
   edited: the same assertions, and the transformer's tables of revision 2 equal revision 1's. Assert from
   the section's own heading, never from a position. Then a contrast case in the same file: the plate of
   another visit and no field (matrix row 8) prints the note line (as v13), so the test proves it can see
   the line.
6. T1, T3, T4 in `e25b-revision-verdicts.integration.test.ts` (or a sibling file if order matters):
   - T1 `25.4-API-003`: a revision create without the two printed keys (as a pre-48 job wrote it) applied by
     the server, pulled through the relatório stream at the current contract: the op value has neither key
     (nothing defaulted). Then revision 2 issued through the route carries both keys; revision 1 is unchanged.
   - T3 `25.4-API-004`: after an issue, an op that changes what would print (a stored parecer, a reading
     that flips a ficha) is applied; the revision's two keys, pulled again, are unchanged and still equal
     what that revision's DOCX prints.
   - T4 `25.4-UNIT (g)` in `print/printed-verdicts.test.ts`, and through the job if the handler can be called
     without the route's check: a sheet reopened before the snapshot is frozen. Pin today's behaviour: the
     document prints "[Parecer]" in section 10 and the revision records `printed_parecer: null`, the same
     value as "section 10 not printed". The test's title says it pins, not approves.
7. E2E, `e2e/previous-visit-judges.spec.ts` (queue lane), `@p1 e25r-R1-E2E-001`, modelled on 23.6-E2E-003 on
   seed v14: relatório A with TEMPERATURA DO ÓLEO typed, issued; relatório B of the same obra, oil not typed,
   the cabine's ambient typed, the same readings: the sheet shows no drop; issue B; reload; the sheet still
   shows no drop and the stored equipment row's `last_results.prior.plate_measured` holds the oil key; issue
   revision 2: its DOCX has no history note line for the transformer.
8. Records the dev writes: `source-deltas.md` row, the spine's AD-25 line (strike-through convention, dated
   2026-11-11), the three `docs/kbs` concept lines and `docs/kbs/log.md`. The orchestrator writes the ledger,
   the Auto Run Result and the sprint-status line.

**Acceptance criteria.**

- AC1 (R-1 reproduced). Given 132ad4a1, when the tests of tasks 1 and 5 run, then matrix rows 2, 3 and 5 are
  red and the red api test shows what revision 2 printed. If they are not red, the batch stops and reports
  the code path.
- AC2 (after its own issue). Given a v14 transformer on its second visit, the first visit having typed the
  plate temperature and this one not, when revision 1 is issued and nothing is edited, then the history flags,
  the verdicts, the conclusion pair, the parecer, the progress and the note line are what they were before
  the issue; and again after revision 2.
- AC3 (a later relatório on top). Given the same B as a draft, when a later-dated relatório C is issued on
  the same equipment, then B's sheet still flags nothing.
- AC4 (travels). Given any issue by the new code of a sheet whose definition names a plate temperature, then
  its entry carries `plate_measured` (possibly empty), and it is still on the entry when it becomes `prior`.
- AC5 (transition). Given an entry without the field whose plate is still the equipment's `last_nameplate`,
  when any issue of that equipment's obra runs that would write or overwrite that equipment's projections,
  then the entry is written with the field filled.
- AC6 (leftovers). Given an entry without the field and a plate of another visit, then the rule compares as
  v13, as today.
- AC7 (item 2). Given a previous plate temperature that is not a finite number, by the field or by the
  fallback, then it does not count as typed.
- AC8 (bytes). Given a v1 to v12 sheet, then its `last_results` entry has the same bytes as before; given any
  v5 to v14 layout-lock golden, then it is unchanged.
- AC9 (contract). Given a version-48 client, when it pulls any stream, then 426 `contract_outdated`; its push
  is accepted; `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` are 49 with their texts.
- AC10 (print). Given the api test of task 5, then revision 2's document prints no history note line and no
  history mark for the transformer, and the contrast case prints the line.
- AC11 (25.4 gaps). T1, T3 and T4 pass on the code as it is (no behaviour change in `job.ts` or
  `printed-verdicts.ts` for them).
- AC12 (every reader). No file under `apps/web/src` changes except a named test literal; no reader computes
  the previous plate on its own (grep `last_nameplate` in `apps/`: only `job.ts`, the copy helper and tests).

Wiring owner of every AC: this batch.

**Definition of ready.** The retro's R-1 and E24-A1 read; the code path confirmed by reading
(`visit-context.ts:95-96`, `job.ts:504-516`, `reading-slots.ts:108-118`); the design names its fields and
branches; contract number 49 assigned by the launch prompt; no open product question (the leftovers' fate is
D5, a count for Matheus).

**Definition of done.** Red tests seen red on the old code (mutation: the fix reverted, tests red, restored);
the story gate green on the final head with origin/main merged (lint, static, test:unit, test:api with every
layout-lock golden, the touched specs on desktop-chrome and durability-desktop-chrome); one review loop
(Edge Case Hunter, Verification Gap) triaged below; the records written; the grep of changed strings and
keys in the PR body; the read-only production count query in the PR body; the PR open, not merged.

## Spec Change Log

## Review Triage Log

## Design Notes

- Why not read the plate from somewhere else: `last_nameplate` is one slot per equipment with no `prior`;
  giving it a chain would copy the whole plate twice to answer a yes or no on two keys. The entry already
  travels with the visit.
- Why the key is absent on a definition with no plate temperature: every v1 to v12 entry, and every test
  that pins one, keeps its bytes.
- Why the fill uses the issuing block's definition: `previousResultsFor` only ever hands an entry to a sheet
  of the same block type, and the rule asks about that sheet's own field keys.

## Verification

Phase B, after "machine free" (compose project `fasor-e25r`, port base 52, images tagged from e25a; every
run under the host lock, logs in `.scratch-e25r/`): the new kernel and api tests red on the old code, then
green; lint, static, test:unit, test:api; the touched specs; the count query tried on the batch's Postgres.

## Auto Run Result
