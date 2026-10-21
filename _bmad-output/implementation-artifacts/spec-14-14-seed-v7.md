---
title: 'Story 14.14: seed v7, fixed extinction media with Outro, SELV/PELV help, test voltage checked against the photo'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '798cefcf48c787a66cc4d85a81eb56164b905fb3'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-14-9-14-11-qgbt-oil-dry.md'
warnings: ['batched', 'oversized']
deferred: []
---

Batched: one story, batch e14d, run beside e14e (Story 14.12, contract 23) in wave 4 (`epic-14-context.md` § "Wave 4
batches"); `batched` because the batch playbook runs every story as a batch. Numbers fixed by the coordinator:
**contract 22, seed v7**; take no other. Story: `epics.md` "Story 14.14" (line ~3883) with its dated 2026-10-21 notes
and Story 14.11's 2026-10-21 note (line ~3751); `source-deltas.md` rows 109 and 111. Continuity: the v6 spec
`spec-14-9-14-11-qgbt-oil-dry.md` (its Code Map and Design Notes are the starting map).

<intent-contract>

## Intent

**Problem:** v0.2.3's seed v6 offers the disjuntor's medium as AR, SF6, VÁCUO, ÓLEO (PVO), ÓLEO (GVO) and has no
"Outro"; the SELV/PELV mark does not say what it means nor warns when it disagrees with TENSÃO NOMINAL; nothing checks
the instrument's TENSÃO ENSAIO against the NBR 5410 band. Bruno's answers 1, 3 and 4 of 2026-10-21 change all three.

**Approach:** Seed v7 = v6 plus (a) the disjuntor's MEIO DE EXTINÇÃO "Ar", "Gás SF6", "Vácuo", "Óleo", "Outro", its
oil rule naming "Óleo" as oil and "Outro" as a value that shows the oil items in full, and the old spellings mapped
to the new; (b) a help text on "Circuito SELV/PELV" and a SELV voltage ceiling of 50 V for a non-blocking notice;
(c) a test voltage on each band, compared in the kernel with the header's TENSÃO ENSAIO when a live display shot of
the test exists. Contract 22, minimum 22. v1 to v6 frozen.

## Boundaries & Constraints

**Always:**
- Pin `V6_HASH` in `seed/seed.test.ts` from the untouched tree FIRST; v1 to v6 parse to the bytes they shipped with.
  Every schema addition is `.optional()`, never `.default()`. Porto Seguro goldens match with no regeneration; a
  relatório on v6 (and earlier) keeps its list, values, notices (none) and print. Tests that described v6 behavior
  through `SEED_VERSION` pin `'v6'` instead, so v6 stays covered; v7 gets its own cases.
- v7 is derived from v6 (clone, as `v6.ts` derives from v5); a kernel test pins that v7 differs from v6 only by the
  disjuntor's options and oil rule, the field aliases, the SELV help, `selv_max_voltage` and the band test voltages.
- `applyOp` stays the only reducer; no new op family. Every notice, state, mapping and text is computed in
  `packages/domain` (authored pt-BR marked `// authored:`, listed in the PR body for Bruno); `apps/web` renders only.
- The notices are non-blocking: no verdict, count, pre-issue row, Export row or print changes because of them.
- Closed lists in specs are read from the kernel (E14-A3).

**Never:**
- No value typed by hand on the medium (Story 14.12's scope is not touched). The seccionadora keeps AR and SF6 and no
  oil rule (open question 2 default). No notice in the pre-issue check or Export dialog (Q3 default). No tolerance on
  the test voltage (Q4 default). No edit of a frozen seed, `epics.md`, `sprint-status.yaml`.
- The SELV help is never printed; the band test voltage is never printed.
- Do not add option validation to `applyOp` (out of scope).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Media on v7 | disjuntor MEIO DE EXTINÇÃO | options exactly `Ar`, `Gás SF6`, `Vácuo`, `Óleo`, `Outro`; stored and printed as spelled (Q1 default) | none |
| Outro | medium "Outro" | oil item `oleo_isolante_indicador_de_nivel` unanswered and counted, never derived NA; VOL. ÓLEO required, prints as typed | none |
| Óleo ↔ Outro | either direction | no crossing, nothing cleared | none |
| To non-oil | Óleo or Outro → Ar, Gás SF6, Vácuo | the crossing batch of today (items, VOL. ÓLEO, photo ties cleared), count toast with "Desfazer" | undo inverts |
| Non-oil → Outro | Ar → Outro | crossing (nothing filled to clear, items return unanswered) | none |
| Old spelling copied | v6 `last_nameplate` or "Igual à" source with AR, SF6, VÁCUO, ÓLEO (PVO), ÓLEO (GVO) onto a v7 disjuntor | `Ar`, `Gás SF6`, `Vácuo`, `Óleo`, `Óleo` | a select value with no option and no alias is not copied (field left empty) |
| Old spelling read | plate reading returns `SF6`, `ÓLEO (PVO)`, `vacuo`, `AR` | suggested as the v7 option | no match: invalid as today |
| v6 untouched | v6 disjuntor, any value | v6 list, rule and print as shipped; no SELV help, no notices | none |
| SELV help | v7 Quadro elétrico, field "Circuito SELV/PELV" | helper "SELV e PELV: tensão até 120 V em corrente contínua ou 50 V em corrente alternada, conforme a NBR 5410" under the field; never in the DOCX | none |
| SELV notice | SIM and TENSÃO NOMINAL 380 V (or 0,38 kV) | notice under the field (authored text); `>= 0.25 MΩ` still applies | none |
| SELV no notice | SIM with 50 V, empty or unparsable voltage; NÃO or empty mark with any voltage | no notice | never a throw |
| Test voltage band | v7 bands | SELV 250 V, up to 500 V: 500 V, up to 1000 V: 1000 V | none |
| Voltage check: match | band picked, header TENSÃO ENSAIO "500 V" (or "0,5 kV", "500 Vcc") on a 380 V board, live display shot of `isolacao` | state `match`; nothing shown | none |
| Voltage check: mismatch | "5.000 V" or "5 kV" on a 380 V board, live shot | state `mismatch`, notice on the test with both voltages (authored) | none |
| Voltage check: no photo | header and band, no live shot (none taken, or removed) | state `not_checked`, text "Tensão de ensaio não conferida" (authored) | none |
| Voltage check: unparsable | header text "alta", live shot | state `not_checked` (same text) | never a throw |
| Voltage check: n/a | no band picked (no criterion), no header or no test_parameter, a test without bands, v6 | null, nothing shown | none |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `seed/schema.ts:31-55` `fieldDefSchema` -- add optional `help` (string, sheet-only) and optional `option_aliases`
  (record old spelling -> option; only on a select; every target an option). `:117-144` `bandCriterionSchema` gains
  optional `test_voltage` (positive number, V); `criterionBandsSchema` gains optional `selv_max_voltage` (V).
  `:170-181` `oilRuleSchema` gains optional `full_values` (options that show the oil items in full; disjoint from
  `oil_values`); `checkSeedV6Definition` checks them.
- `seed/v6.ts` -- read-only; `seed/v7.ts` (new) clones v6 like `v6.ts` clones v5. `seed/definitions.ts:28,44,95-96`
  -- register v7, `SEED_VERSION = 'v7'`; `bundle()` checks stay valid.
- `relatorio/oil-rule.ts:51-56` `oilStateOf` -- a value in `full_values` reads as `true` (shows the oil items), one
  line; everything else (crossing, excused, derived NA) follows unchanged.
- `relatorio/reading-evaluation.ts:41-80` -- `voltsOf`, `bandCriterion`: expose the picked band (with
  `test_voltage`) for the check; new kernel module (e.g. `relatorio/test-voltage.ts`) for
  `testVoltageCheck(snapshot-like {block, files}, test) -> {state: 'match'|'mismatch'|'not_checked', text, expected, given} | null`
  and `selvVoltageNoticeText(block) -> string | null` (SIM and volts > `selv_max_voltage`). Live display shot: a
  `files` row with `kind === 'photo'`, `removed_at === null`, `block_id` the block's, whose `reading_target` parses
  with `displayCellTargetSchema` (`reading/target.ts:32`) and `table_key === test.key`, any reading state (Q5 default).
  TENSÃO ENSAIO: `storedInstrumentHeader(block.sheet.test[test.key]?.instrument?.value)?.test_parameter`
  (`relatorio/instrument-pick.ts:54-80`; written as `formatDecimalGroupedPtBr(raw) + ' ' + unit`, e.g. "5.000 V",
  "5 kV"): parse the pt-BR number (`parse/pt-br-number.ts`) and a unit V/Vcc/Vca (x1) or kV/kVcc/kVca (x1000).
- Select mapping: one kernel function (e.g. `seed/select-option.ts` `selectOptionFor(field, value): string | null`:
  exact option, else option matched by `normalizeRegistryName`, else alias matched the same way, else null). Callers:
  `reading/value.ts:217-222`, `relatorio/suggestion-group.ts:167-171`, `relatorio/nameplate-copy.ts:53-61`
  (`nameplateCopyFields`) and `:104-117` (`lastNameplateCopy`): a select field's value goes through it and is
  dropped when null.
- `relatorio/readings.ts:25` re-exports; `index.ts` exports for web.
- `contract/version.ts:186-281` -- `CONTRACT_VERSION = 22`, `MIN_CONTRACT_VERSION = 22`, dated paragraph (a v21
  bundle cannot resolve seed v7, which the server's template upgrade carries, and would count an "Outro" disjuntor's
  oil item NA); keep the file tidy for e14e's 23 (append, do not reflow). `contract/contract.test.ts`.
- Tests that hard-code `'v6'` as "current": `seed/template.test.ts:23,215`, `templates/from-relatorio.test.ts:280`,
  `relatorio/instantiate.test.ts`; v6-behavior tests (`oil-rule.test.ts`, `quadro-eletrico.test.ts`) keep `'v6'`.

Web (`apps/web/src`): `surfaces/ficha/nameplate-section.tsx:390-410` (fields already take a `helper`: show the seed
`help` and the SELV notice; reuse an existing notice/helper class from `styles/components.css`, grep `helper`,
`notice`, `warn`), `surfaces/ficha/ensaios-section.tsx:350-365` (`.mt-criterion` line: the test-voltage notice or
"not checked" under it). No new copy in `copy/pt-br.ts` unless static chrome is needed.

Api (`apps/api/src`): `jobs/generate/docx-qgbt.test.ts` and `docx-cta.test.ts` patterns -- new
`docx-seed-v7.test.ts` (a v7 disjuntor on "Outro" prints the oil item and VOL. ÓLEO as typed; a v7 QGBT prints no
help text and no voltage notice; a v6 disjuntor prints as before); `sync/sync-v6.integration.test.ts` pattern -- new
`sync-v7.integration.test.ts` (v7 disjuntor writes through the route; contract 22 header pin; old client 21 refused);
`jobs/reading/kinds/plate.ts` fake fixture: if it emits a disjuntor medium, the reading maps it.

E2E: new `e2e/seed-v7.spec.ts` (`@p0`); `e2e/oil-dry.spec.ts` 14.11-E2E-002 asserts the v6 list through
`SEED_VERSION`: move its disjuntor assertions to v7's media (read from the kernel) or pin its relatório to v6 --
choose the one that keeps the spec's intent; `e2e/read-display.spec.ts` (fake camera, display shot pattern),
`e2e/qgbt.spec.ts` (QGBT setup pattern), `e2e/support/groups.ts` (`SERIAL_SPECS` if the new spec times taps or
generates).

## Tasks & Acceptance

**Execution, phase 1 (kernel):**
- `seed/seed.test.ts` -- pin `V6_HASH` on the untouched tree, then the v7 block: differs from v6 only by the listed
  keys; media order; aliases; oil rule `oil_values ['Óleo']`, `full_values ['Outro']`; help text; band voltages
  250/500/1000; `selv_max_voltage` 50.
- `seed/schema.ts`, `seed/v7.ts` (new), `seed/definitions.ts`, `relatorio/oil-rule.ts`, select mapping module and its
  four callers, test-voltage module, `contract/version.ts` -- as the Code Map says; unit tests for every matrix row
  (oil: Outro, Óleo↔Outro, Outro→Ar crossing, Ar→Outro; mapping: each old spelling, unknown dropped, v6 untouched;
  SELV notice: 50, 51, 380, 0,38 kV, empty, NÃO; test voltage: match, mismatch, unparsable, no photo, removed photo,
  each band, no band, v6).
- Commit and push the kernel slice when lint, static and the kernel tests are green.

**Execution, phase 2:**
- Web as the Code Map says. Api tests as listed. `e2e/seed-v7.spec.ts` and the `oil-dry.spec.ts` update.
- Documents: `source-deltas.md` dated rows for v7 as built (strike-and-add per AGENTS.md), `docs/kbs/architecture/kernel-and-seed.md`
  and `docs/kbs/log.md` dated notes, `deferred-work.md` only for a narrowing (keep e14e's side tidy).

**Acceptance Criteria:**
- Given a v7 relatório offline, when the user picks "Outro" on a disjuntor's MEIO DE EXTINÇÃO, then the oil item and
  VOL. ÓLEO show in full and unanswered; when the user answers the oil item, types VOL. ÓLEO and switches to "Ar",
  then the item shows NA and VOL. ÓLEO excused with the count toast, and "Desfazer" restores both; the outbox holds
  the ops (asserted), and reload and sync keep the state.
- Given a v7 Quadro elétrico with TENSÃO NOMINAL 380, when the user marks "Circuito SELV/PELV" SIM, then the help
  text and the SELV notice show under the field; NÃO removes the notice.
- Given that board's insulation test with an instrument whose registry test voltage is 5.000 V (band 250 V once SIM,
  or 500 V on NÃO), when the user shoots the display through the fake reading, then the test-voltage notice names
  both voltages; when the photo is removed, then "Tensão de ensaio não conferida" shows; no verdict changes.
- Given the Porto Seguro fixture and a v6 relatório, when generated, then the goldens match and the v6 print is
  unchanged; the seed v6 hash pin holds.
- Given the 390 px viewport, the notices wrap with no horizontal page scroll.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass

Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the
integrated epic review covers them). One review-fix loop, as the batch playbook allows.

- verdicts: 7 findings — high 0, medium 1, low 4, false 2, maybe-false 0
- findings:
  - `[low]` `[patch]` Edge: `fieldDefSchema` alias refine throws a TypeError on a select with aliases and no options — reachable only with a malformed seed; guard on `f.options !== undefined` added with a schema test.
  - `[low]` `[reject]` Edge: "Copiar da última visita" from a v7 visit onto a still-open v6 sheet drops "Óleo", "Gás SF6", "Outro" — this is the AC's "leaves the field empty for the user when no mapping applies"; before the change the copy wrote a value outside the v6 options, which is worse; a reverse map would add surface for a rare path.
  - `[false]` `[reject]` Edge: a v6 spelling stored on a v7 block by an outdated client reads as non-oil — `MIN_CONTRACT_VERSION` is 22, so a client that knows no v7 is refused by the push route; every v7 write path maps through `selectOptionFor`.
  - `[false]` `[reject]` Edge: the SELV help is hidden while a pending plate suggestion fills "Circuito SELV/PELV" — the plate reading never suggests that field (`qgbt.spec.ts`: the mark is never on a plate).
  - `[low]` `[patch]` Edge: `testParameterVolts` refuses "5 kV cc" and "500 Vdc" — regex widened to an optional space and cc/ca/dc/ac; kernel cases added.
  - `[low]` `[reject]` Edge (claim): no e2e drives a v6 disjuntor's VÁCUO / ÓLEO (GVO) any more — new relatórios are born on v7, so a v6 sheet exists only as an old relatório; the v6 rule and list stay pinned by `oil-rule.test.ts` (on `'v6'`), the `V6_HASH` pin and `docx-seed-v7.test.ts`'s v6 print case.
  - `[medium]` `[patch]` Gap: the read-only rendering of the SELV help, the SELV notice and the test-voltage line is untested — a web unit case renders the read-only v7 QGBT nameplate and asserts both texts.


## Design Notes

```ts
// v7 disjuntor
{ key: 'meio_de_extincao', label: 'MEIO DE EXTINÇÃO', kind: 'select',
  options: ['Ar', 'Gás SF6', 'Vácuo', 'Óleo', 'Outro'],
  option_aliases: { AR: 'Ar', SF6: 'Gás SF6', 'VÁCUO': 'Vácuo', 'ÓLEO (PVO)': 'Óleo', 'ÓLEO (GVO)': 'Óleo' } }
oil_rule: { field: 'meio_de_extincao', oil_values: ['Óleo'], full_values: ['Outro'], items: ['oleo_isolante_indicador_de_nivel'], fields: ['vol_oleo'] }
// v7 QGBT bands
{ ..., selv_max_voltage: 50, selv: { ...minimum(0.25), test_voltage: 250 },
  bands: [{ up_to: 500, ...minimum(0.5), test_voltage: 500 }, { up_to: 1000, ...minimum(1.0), test_voltage: 1000 }] }
```

`full_values` is chosen over listing "Outro" in `oil_values` so the rule keeps naming "Óleo" as the only oil value
(AC 1) while `oilStateOf` gains a single condition. Authored texts (proposals, listed for Bruno): SELV notice
"Marcado SELV/PELV, mas a TENSÃO NOMINAL passa de 50 V: confira a marcação ou a tensão."; test-voltage mismatch
"Tensão de ensaio do instrumento (⟨given⟩) diferente da prevista para a faixa (⟨expected⟩)."; not checked
"Tensão de ensaio não conferida". Voltages print as `formatDecimalGroupedPtBr` + " V".

Open questions, recorded defaults taken (PR body lists each): Q1 spelling as given, stored and printed as is; Q2 the
seccionadora keeps AR and SF6; Q3 sheet only; Q4 equal after unit conversion, no tolerance; Q5 a live display shot
naming the test, whatever its reading state.

## Verification

**Host (macOS, compose project `fasor-e14d`, `.env` in the worktree):** never run pnpm or node on the host. Use
`podman compose`; tools runs as `podman compose --profile tools run --rm --user root tools pnpm <script>` (kernel
alone: add `--no-deps`); redirect every run to `.scratch-e14d/<name>.log` and read its tail. Keep `web` stopped. Every
Playwright run and every full test:unit / test:api run goes through the host lock, detached:
`nohup sh -c "lockf -t 30000 /tmp/fasor-verify.lock podman compose --profile tools run --rm --user root tools <cmd>; echo EXIT=\$?" > /tmp/<name>-e14d.log 2>&1 &`
then poll with calls of at most 60 s. Never touch containers not named `fasor-e14d-*`. Never build images.

**Commands:**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts e2e/seed-v7.spec.ts e2e/oil-dry.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green (the orchestrator runs the closed-list set and the matrix).

## Auto Run Result

Status: done (PR opened by the orchestrator, not merged).

**Summary.** Seed v7 = v6 plus: the Disjuntor MT's MEIO DE EXTINÇÃO "Ar", "Gás SF6", "Vácuo", "Óleo", "Outro" with the
v6 spellings as `option_aliases`; its oil rule `oil_values ['Óleo']`, `full_values ['Outro']`; the help text on the
Quadro elétrico's "Circuito SELV/PELV", `selv_max_voltage` 50 and the band test voltages 250/500/1000 V. Kernel
`seed/select-option.ts` (`selectOptionFor`, read by the plate reading, the typed suggestion, "Igual à" and "Copiar
da última visita"), `relatorio/test-voltage.ts` (`selvVoltageNoticeText`, `selvNoticeFieldOf`, `testVoltageCheck`,
`testParameterVolts`), `pickedBand` in `reading-evaluation.ts`. Contract 22, minimum 22. Web: help and amber notice
under the field, test-voltage line under the criterion. Api: `docx-seed-v7.test.ts`, `sync-v7.integration.test.ts`.
E2E: `seed-v7.spec.ts` (two `@p0`), `oil-dry.spec.ts` E2E-002 reads the media from the kernel.

**Review.** 7 findings: 3 patched (1 medium, 2 low; commit e665f0f8), 4 rejected with reasons in the triage log,
none deferred. Follow-up review not recommended (one medium patched, a test addition).

**Verification (under the host lock).** lint 0, static 0, test:api 666/666, test:unit 4331/4331 (gate 814 s,
LOCKED_AFTER 445 s); touched and closed-list specs on desktop-chrome and durability-desktop-chrome 141/141 (1005 s).

**Residual risks.** The read-only test-voltage line has no dedicated test (the editable line is covered by e2e);
a v7 select value copied onto a still-open v6 sheet is dropped (the AC's empty field).

