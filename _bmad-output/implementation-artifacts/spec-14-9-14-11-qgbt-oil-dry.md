---
title: 'Stories 14.9 and 14.11: QGBT/QD library type and oil vs dry, seed v6'
type: 'feature'
created: '2026-10-20'
status: 'in-progress'
baseline_revision: 'bfaf0325be3405cd93f64d7fb20f7d2fcf1e566a'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-14-5-measurement-table-cta.md'
warnings: ['batched', 'oversized']
deferred: []
---

Batched: Stories 14.9 and 14.11 share one new seed version v6 and one contract number, 21 (`epics.md` seed-version
plan of 2026-10-20), so they ship as one batch, one PR. Modelled on Story 14.5 (`spec-14-5-measurement-table-cta.md`).
Stories: `epics.md` lines 3457 (14.9) and 3681 (14.11) with their dated 2026-10-20 lines; `source-deltas.md` rows
102-108 (2026-10-20) win.

<intent-contract>

## Intent

**Problem:** Low-voltage boards (QGBT/QD) have no sheet, and a dry transformer, TP, TC or a non-oil disjuntor still
asks about oil (only a stopgap chip, `relatorio/dry-insulation.ts`); TIPO DE ISOLAÇÃO has no ÓLEO option and MEIO DE
EXTINÇÃO only AR and SF6.

**Approach:** Seed v6 = v5 plus (a) one library type `quadro_eletrico` on the seeded nameplate, checklist and
single-table insulation grammars, with a criterion the kernel derives from its TENSÃO NOMINAL by the NBR 5410 bands;
(b) the new option lists and a seed-declared oil rule on Transformador de força, TP, TC and Disjuntor MT. One kernel
rule says which items and fields are oil and when they are derived NA / excused; a crossing between oil and non-oil
clears them in the same undoable batch. Contract 21, minimum 21.

## Boundaries & Constraints

**Always:**
- v1 to v5 parse to the bytes they shipped with: pin `V5_HASH` in `seed/seed.test.ts` from the untouched tree FIRST.
  Every schema addition is `.optional()`, never `.default()`. Porto Seguro goldens match with no regeneration; a
  relatório on v1 to v5 reads, captures and prints unchanged, and keeps the "Marcar N itens de óleo como NA" chip and
  the never-overwritten rule.
- v6 is derived from v5 (clone, as `v5.ts` derives from `v4.ts`); a kernel test pins that v6 differs from v5 only by
  the `quadro_eletrico` type, the three option lists and the oil rules (and the new optional definition keys).
- `applyOp` stays the only reducer; replay of an existing log is byte-equal on both layers. No new op family: every
  write is an existing family (`sheet/.../nameplate/...`, `sheet/.../checklist/...`, `file/{id}/item_key`, ...).
- Every status, count, verdict, criterion, label, helper text, toast text and print part is computed in
  `packages/domain`; `apps/web` renders from IndexedDB and writes ops only. Authored pt-BR is marked `// authored:`
  and listed in the PR body for Bruno.
- The QGBT sheet reuses the existing sheet components (nameplate, checklist with bulk bar and chips, insulation with
  instrument picker, conclusion, Não ensaiado, photos, points, TAG). Only addition on screen: the item hint line.
- Spec reads closed lists (block types, palette rows, seed version) from the kernel, never as literals (E14-A3).

**Never:**
- No company-type machinery, no hand-typed option (Story 14.12), no per-equipment screen label, no editable type name.
- No new op family, no edit of a frozen seed version, `epics.md`, `sprint-status.yaml`.
- No check of the typed TENSÃO ENSAIO against the band; it is shown and printed as typed.
- The seccionadora's MEIO DE EXTINÇÃO does not change (AR, SF6), and it gets no oil rule.
- A photo is never deleted by the oil rule; its `reading_target` is never rewritten.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| QGBT on an old seed | block create of `quadro_eletrico` on v1 to v5 | refused by the fold (`SeedPathError`), as the CTA on v4 | sync `op_invalid`, never 500 |
| Palettes by seed | template or relatório on v5 / v6 | v5: eight then CTA; v6: eight, then "Outros equipamentos" CTA then QGBT, offline | none |
| Band criterion | TENSÃO NOMINAL 380, 500 | `>= 0,5 MΩ` source "NBR 5410", ACEITÁVEL MΩ prints `0,5` | none |
| Band criterion | 501, 690, 1000 | `>= 1,0 MΩ`, ACEITÁVEL prints `1,0` | none |
| No criterion | TENSÃO NOMINAL empty, invalid, or > 1000 | no verdict on the four rows; the test reads "critério não avaliado" (authored) on the sheet; ACEITÁVEL prints `-`; never a pass, never ok in the conclusion suggestion | never a throw |
| SELV/PELV | plate field "Circuito SELV/PELV" (authored) = SIM, any voltage | `>= 0,25 MΩ` source "NBR 5410"; NÃO or empty: the voltage bands | empty never counts as missing |
| Re-evaluation | edit TENSÃO NOMINAL 380 → 690 with a 0,8 MΩ row | row ok → out, helper "Abaixo do aceitável (>=1 MΩ)" by the existing text rule | none |
| Hints | items 8 and 16 | hint line under the label on the sheet only; never in the DOCX nor in OBSERVAÇÕES | none |
| IP | nameplate IP | select of IP20, IP30, IP31, IP40, IP41, IP42, IP43, IP44, IP54, IP55, IP65, IP66; never typed | none |
| Dry from start (v6) | transformer/TP/TC TIPO DE ISOLAÇÃO EPÓXI or Á SECO; disjuntor AR, SF6 or VÁCUO | oil items show NA with no cell, no chip, no tap; VOL. ÓLEO shown excused (never missing), prints `-` whatever is stored | none |
| Oil (v6) | ÓLEO; ÓLEO (PVO) or ÓLEO (GVO) | oil items unanswered, counted; VOL. ÓLEO required | none |
| Empty value (v6) | no insulation / medium picked, no subtype | no oil rule applies (as an oil unit today); a dry template subtype still derives its `na_defaults` NA | none |
| Stored value vs subtype (v6) | dry subtype, stored ÓLEO | the stored value wins: oil items not derived NA | none |
| Crossing | oil → non-oil or non-oil → oil (effective state: stored value if filled, else the subtype; empty and no subtype is unknown) | same batch: result and observation of every oil item holding a value put to null, VOL. ÓLEO put to null when filled, `file/{id}/item_key` put to null for every live photo of the block on an oil item; toast "N itens de óleo apagados" (authored, kernel text) with "Desfazer" | undo inverts the whole batch |
| No crossing | EPÓXI → Á SECO; empty → anything; anything → empty | nothing cleared | none |
| Cleared on dry | an oil item cell put to null on a dry v6 unit | still shows NA (derived NA applies whenever the item's own cell is not filled) | none |
| Answered on dry | user taps C on a dry unit's oil item | the stored C wins and prints | none |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `schemas/block-config.ts:16-35,102-175` -- `EQUIPMENT_BLOCK_TYPES` (append `quadro_eletrico` after the CTA), `ITEM_KEYS` (append the item keys of `docs/nc-chip-phrases.md:142-161` not already present; `aterramento`, `fusiveis`, `isoladores`, `lampadas_de_sinalizacao` exist).
- `seed/schema.ts:22-140` -- `fieldDefSchema` (add optional `optional: true`: an empty field never counts as missing), `checklistItemSchema` (optional `hint`), `testDefSchema` (optional band criterion, see Design Notes), `blockDefinitionSchema` (optional `oil_rule`). `blocks` is already a partial record (14.5).
- `seed/v1.ts:40-43,328-343` -- `MEIO_DE_EXTINCAO`, `TIPO_DE_ISOLACAO`, `VOL_OLEO`, `OIL_RELATED_ITEMS`, `DRY_SUBTYPES`, `singleInsulation`, `phaseRows` (read-only; v6 rebuilds what it needs).
- `seed/v5.ts:383-402` -- clone pattern for `seed/v6.ts`; `seed/definitions.ts:42,59-85` -- `SEED_VERSION`, `SEED_VERSIONS`, `bundle()` criterion check (extend to the band criterion: every band names a source).
- `seed/seed.test.ts:600-960` -- hash pins and the "differs only by" pattern (v5 block at 876).
- `relatorio/reading-evaluation.ts:35-60` -- `criterionOf`, `effectiveCriterion(block, test)`: the band criterion resolves here (nullable); every consumer of a null criterion gives no verdict. `templates/text.ts:355` reads `SEEDED_CRITERIA` by `criterion_key` (summary line: show the band text for a band test).
- `relatorio/dry-insulation.ts` -- `isDryBlock`, `oilNaChipItems`, `nameplateMissingKeys`: v6 path through the oil rule; the chip answers [] on a block whose definition has an `oil_rule`.
- `relatorio/sheet-progress.ts:116-135` -- `naDefaultsOf`, `checklistResultOf`: the derived oil NA joins here (one function, read by sheet, progress, pre-issue, conclusion, gallery, print).
- `relatorio/tag.ts`, `relatorio/conclusion.ts` (`NOUNS`), `photos/caption.ts`, `templates/text.ts` (`TOTALS_ORDER`), `print/section-9.ts`, `print/group-for-print.ts` -- compile-forced maps: prefix `QD`, noun "quadro elétrico" (masculine), totals, "Outros equipamentos" after the CTA, title `QGBT/QD's`.
- `contract/version.ts:186-216` -- `CONTRACT_VERSION = 21`, `MIN_CONTRACT_VERSION = 21` with the dated paragraph; `contract/contract.test.ts`.
- `templates/from-relatorio.ts` (`templateSeedUpgrade`) -- v1 to v5 answer `v6`; tests listing versions.

Web (`apps/web/src`): `surfaces/ficha/checklist-section.tsx:275-300` (hint line, derived NA display), `surfaces/ficha/nameplate-section.tsx:135-395` (chip off on v6; every insulation/medium write appends the crossing ops and shows the toast), `surfaces/ficha/nameplate-suggestions.tsx:259` and the copy paths at `nameplate-section.tsx:151,162` (same crossing ops when they write the field), `surfaces/ficha/ficha-ops.ts:40`, `surfaces/ficha/ensaios-section.tsx` ("critério não avaliado"), palettes `surfaces/relatorio/block-palette-field.tsx`, `surfaces/templates/block-palette.tsx`, `copy/pt-br.ts`.

Api (`apps/api/src`): `jobs/reading/kinds/plate.ts` (fake fixture for the QGBT, invented maker), `jobs/generate/docx-cta.test.ts` (pattern for `docx-qgbt.test.ts`), `sync/sync-cta.integration.test.ts` (pattern for `sync-v6.integration.test.ts`), `db/template-seed-upgrade.integration.test.ts`, `jobs/reading/job.integration.test.ts:860` (`panelFields`).

E2E: `e2e/cta.spec.ts`, `e2e/cta.durability.spec.ts` (patterns), `e2e/dry-transformer.durability.spec.ts` (touched by 14.11), `e2e/plate-every-type.spec.ts`, `e2e/support/palette.ts`, `e2e/support/groups.ts` (`SERIAL_SPECS`). Closed-list specs to run (E14-A3): `templates`, `tree`, `relatorio`, `panel-capture`, `panel-capture-pipeline`, `plate-every-type`, `nameplate-values`, `local-painel-coluna`, `cta`.

## Tasks & Acceptance

**Execution, phase 1 (kernel):**
- `seed/seed.test.ts` -- pin `V5_HASH` from the untouched tree, then the v6 block: differs from v5 only by the listed additions; the QGBT's 10 plate fields, 17 items (each 3 or 4 phrases, item 17 IDENTIFICAÇÃO DE CIRCUITOS, hints on 8 and 16), four rows FASE A, FASE B, FASE C, NEUTRO × MASSA, the bands; option lists; oil rules.
- `schemas/block-config.ts`, `seed/schema.ts`, `seed/v6.ts` (new), `seed/definitions.ts` -- the type, `SEED_VERSION = 'v6'`.
- `relatorio/reading-evaluation.ts` and consumers -- band criterion: boundary tests 500, 501, 1000, 1001, empty, invalid, SELV SIM.
- `relatorio/oil-rule.ts` (new) -- `oilRuleOf(block)`, `isOilUnit(block): boolean | null`, `oilDerivedNaKeys(block)`, `isOilFieldExcused(block, fieldKey)`, `oilCrossingPuts(snapshot, blockId, fieldKey, next): {path, value}[]`, `oilItemsClearedText(n)`; wired into `checklistResultOf`/`naDefaultsOf`, `nameplateMissingKeys`, `isDryBlock`, `oilNaChipItems`, print.
- Compile-forced maps and `print/` -- section 9 of the QGBT (DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS without hints, ENSAIO DE ISOLAÇÃO with instrument header and ACEITÁVEL MΩ = band minimum or `-`, OBSERVAÇÕES, CONCLUSÃO), and oil fields `-` on a non-oil v6 unit.
- `contract/version.ts` -- 21/21.
- Commit and push the kernel slice when lint, static and kernel tests are green.

**Execution, phase 2:**
- Web as the Code Map says; `copy/pt-br.ts` only for surface copy.
- Api: plate fixture; `docx-qgbt.test.ts` (from its own heading: tables, NC conclusion, band ACEITÁVEL, no hint text; a dry v6 transformer prints oil items NA and VOL. ÓLEO `-`); `sync-v6.integration.test.ts` (QGBT create and cells through the route on v6; `op_invalid` for the QGBT on v5; a crossing batch applied through the route equals kernel replay; contract 21 header pin).
- `e2e/qgbt.spec.ts` (`@p0`, in `SERIAL_SPECS` since it generates), `e2e/oil-dry.spec.ts` (`@p0`), `e2e/oil-dry.durability.spec.ts` (`@p0`, two-device convergence and reload), updates of touched specs.
- Documents: `docs/kbs/architecture/kernel-and-seed.md` and `docs/kbs/log.md` dated notes; `source-deltas.md` rows (section 6 catalogue line backed by a sheet; dated strike on row "Story 3.5 and FR-11" for v6) by strike-and-add; spine dated notes on AD-21 and AD-15; `deferred-work.md` for each narrowing; `scripts/nc-chip-phrases.test.ts` passes with the type's rows.

**Acceptance Criteria:**
- Given a template on v6, when the user adds one Quadro elétrico (QGBT/QD) from "Outros equipamentos" after the CTA to a local and one to a coluna of a painel, then the nodes show `QD-…` TAGs and the totals name it; the painel offers no placement; given a relatório on v6 offline, the field palette adds one and the create is in the outbox.
- Given the QGBT sheet offline on Rascunho, when the technician reads the plate (fake fixture fills the 9 fields as suggestions), sets TENSÃO NOMINAL 380 and IP from the list, answers one item NC with a chip and "Marcar os restantes como Conforme", types the four rows with one under 0,5 MΩ, then the out row is amber with its helper, the suggestion is "Reprovado"/"Com restrições" by the existing rule naming the item and the reading, the first write carried the Em campo status op, and every value is in the outbox (asserted). After reload and sync, the DOCX section 9 holds the "Outros equipamentos" group with the QGBT tables, ACEITÁVEL `0,5`, no hint text, and the NC conclusion.
- Given a v6 transformer, when Á SECO is picked, then the eight oil items show NA with no tap and VOL. ÓLEO is not missing; ÓLEO brings them back unanswered. Given an oil item answered C, VOL. ÓLEO typed and a photo on an oil item, when ÓLEO → Á SECO, then the item is NA, VOL. ÓLEO empty, the photo in the gallery but not on the item, the toast counts; "Desfazer" restores all three. Same on a disjuntor with VÁCUO and ÓLEO (GVO) (its one oil item); the seccionadora lists AR and SF6 only; a TP offers ÓLEO. Reload and sync keep it.
- Given two devices on one dry→oil crossing and one concurrent oil item answer, when both sync, then both converge on the same items and marks.
- Given a 390 px viewport, the QGBT sheet and its four-row table fit with no horizontal page scroll; the hint line wraps.
- Given the Porto Seguro fixture (v1) and a v5 relatório with a dry transformer, generated, then goldens match and the v5 chip still shows.

## Spec Change Log

## Review Triage Log

## Design Notes

Band criterion, on the test definition (optional, beside `criterion_key: 'isolacao'` which stays for the schema):

```ts
criterion_bands: {
  field: 'tensao_nominal',               // a number field of the plate, unit V
  selv_field: 'circuito_selv_pelv',      // select SIM/NÃO; SIM wins over the voltage
  selv: { operator: '>=', value: 0.25, unit: 'MΩ', source: { name: 'NBR 5410', edition: null } },
  bands: [ { up_to: 500, operator: '>=', value: 0.5, unit: 'MΩ', source }, { up_to: 1000, operator: '>=', value: 1.0, unit: 'MΩ', source } ],
}
```
`effectiveCriterion` answers the band's `CriterionSeed`-shaped criterion, or null (no verdict) when the field is empty,
not a number, or above the last `up_to`. Printed value uses one decimal (`0,5`, `1,0`, `0,25`).

Oil rule, on the definition (optional): `oil_rule: { field: 'tipo_de_isolacao' | 'meio_de_extincao', oil_values:
['ÓLEO'] | ['ÓLEO (PVO)', 'ÓLEO (GVO)'], items: ItemKey[], fields: ['vol_oleo'] }`. Transformador de força, TP, TC:
the field's options EPÓXI, Á SECO, ÓLEO; items = `OIL_RELATED_ITEMS` present in its checklist. Disjuntor MT: options
AR, SF6, VÁCUO, ÓLEO (PVO), ÓLEO (GVO); items `oleo_isolante_indicador_de_nivel`. Effective state: stored value when
filled, else the config subtype (`epoxi`/`a_seco` = non-oil), else unknown (no rule).

QGBT plate (10): IDENTIFICAÇÃO (per_unit), FABRICANTE (`manufacturer`), Nº SÉRIE (per_unit), TIPO, TIPO DE ISOLAÇÃO
(text), DATA DE FABRICAÇÃO (`date`, as the seeded ones), CORRENTE DE CURTO kA, TENSÃO NOMINAL V, IP (select),
Circuito SELV/PELV (select SIM, NÃO; `optional`; authored). Sub-blocks as para-raio's: nameplate, checklist,
isolacao, ia_ip_display, observations, conclusion. Library type, label "Quadro elétrico (QGBT/QD)".

Open questions kept with the conservative reading (PR body lists each): SELV/PELV as a plate yes/no field; no verdict
when TENSÃO NOMINAL is empty or above 1000 V; typed TENSÃO ENSAIO not checked; media labels as written (hand-typed
option is 14.12); no per-equipment screen label; photos untied, never deleted; an NC photo's `reading_target` kept.

## Verification

**Commands (tools container, `--user root`, logs tagged c17):**
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- green.
- `pnpm exec tsx scripts/e2e.ts e2e/qgbt.spec.ts e2e/oil-dry.spec.ts e2e/oil-dry.durability.spec.ts <closed-list specs> --project desktop-chrome --project durability-desktop-chrome` under the host lock -- green.
- Touched durability specs on the matrix projects under the lock -- green.

**Host (this macOS machine, compose project `fasor-c17`, `.env` already in the worktree):** never run pnpm or node on
the host. `podman compose` (no `docker`); tools runs as `podman compose --profile tools run --rm --user root tools pnpm <script>`
(the kernel alone: add `--no-deps`); redirect every run to a log under `.scratch-c17/` and read its tail. Keep the
`web` service stopped. Every Playwright run goes through the host lock:
`nohup sh -c "lockf -t 30000 /tmp/fasor-verify.lock sh -c 'podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts <specs> --project desktop-chrome --project durability-desktop-chrome'; echo EXIT=\$?" > .scratch-c17/e2e-<name>.log 2>&1 &`
then poll the log in calls of at most 60 s. Before reading a timeout as a defect, check `podman ps` for a restarting
container. Never stop containers that are not `fasor-c17-*`. Images are tagged `app-api-c17` and `app-tools-c17`; never build.
