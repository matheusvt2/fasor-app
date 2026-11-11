---
title: 'e24s: seed v14 sheets: TP and TC lists, the transformer oil and dry items, QGBT inspection, the No-break de comando, the oil sampling "Outro" text and the ground grid block (Stories 24.10 to 24.14)'
type: 'feature'
created: '2026-11-11'
status: 'in-progress'
baseline_revision: 'dee6d567b16680b154b0f843cfff0f3a1aa54e4e'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e24a-conclusion-rules.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 24 wave 2 "seed lane" (epic-24-context.md § Batch plan): the five stories each add a fenced section to seed/v14.ts, share seed.test.ts, schemas/block-config.ts and one contract; one spec, one review, one gate, one PR. Effort: 24.10, 24.12, 24.14 medium; 24.11, 24.13 high (run at high).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno's answers of 2026-11-10 (questions 18, 19, 22, 34) and the hands-on pass (F10, F18) change what five sheets ask on seed v14: the TP and TC lists, the transformer's oil and dry items, the Inspeção de QGBT, a new No-break de comando type, and two small fixes. Every v1 to v13 relatório must keep its screen lists and print byte-identical, and Bruno's layout is protected: a v14 sheet prints only each story's delta.

**Approach:** Each story is data in its own fenced section of `seed/v14.ts`, or a new optional definition key that only v14 sets (never a version comparison). New closed-enum values (six No-break item keys, `tanque_e_aletas`, `limpeza_das_bobinas`, `trincas_na_resina`, `teste_de_funcionamento`, the type `no_break_comando`) and the new keys (`oil_rule.dry_items`, a measurement value of kind `text`, `nameplate_title`, `nameplate_photo: false`) take one contract number, the next free on main at the PR (45 today), minimum the same.

## Boundaries & Constraints

**Always:**
- Story text, ACs and DoD are `epics.md` § Story 24.10 to 24.14 (read each by its heading, never the file whole). Checklist labels, hints and field labels come from the stories verbatim. Every pt-BR sentence the batch writes itself (NC phrases, the No-break print title, "Descreva o motivo", "Dados da malha", reasons) is marked `// authored (e24s, listed for Bruno)` and listed in the Auto Run Result.
- Seed: `seed/v14.ts` gets one fenced section per story (`// --- batch e24s (Story 24.N): ... ---`) applied after `withE24aRules`. `seed.test.ts`: a strip helper `withoutE24s` beside `withoutE24a` (undoes every e24s delta so `withoutE24s(withoutE24a(v14))` stringifies equal to v13), `V14_HASH` re-pinned, every shipped hash held, `equipmentTypesOf('v14')` = v13's list plus `no_break_comando`.
- New optional keys are optional and never defaulted on `blockDefinitionSchema`/`oilRuleSchema`/the measurement grammar, so v1 to v13 parse to their shipped bytes. A company definition accepts and carries them: `types/definition.ts` (`companyOilRuleSchema`, `companyTypeDefinitionShape`), `types/block-definition.ts` `asBlockDefinition`, `types/duplicate.ts` `duplicateSeededDefinition`. Keep these edits small and additive (batch e24c edits the same files).
- AD-1/AD-13: every list, count, N.A., reason line, title and printed text is the kernel's; `apps/web` renders and writes ops. Strings in their AGENTS.md home (derived in `packages/domain`, static surface copy in `apps/web/src/copy/pt-br.ts`).
- A test that asserts a v13 (or older) list, verdict or print is pinned to v13 by an addition (`seedVersion: 'v13'`), never rewritten. A spec reads a closed list (types, palette, item counts) from the kernel (E14-A3).
- Commands only in this worktree's stack (compose project `fasor-e24s`): `podman compose --profile tools run --rm --user root tools pnpm ...`; every unit, api or Playwright run under `nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'` wrapped in `caffeinate -i`, logged in `.scratch-e24s/`, polled in bounded loops of at most 55 s; `podman compose restart api` after a change under `packages/domain` or `apps/api`, before `test:api` or an e2e. Narrowest suite while iterating. Spec paths before `--project` with `scripts/e2e.ts`. English code, no emoji, no story ids as inline comments beyond the seed's "Batch e24s (Story 24.N):" convention.

**Never:**
- Never move a v5, v11, v12 or v13 layout-lock golden or a Porto Seguro golden (`apps/api/src/jobs/generate/golden/**`, `packages/domain/fixtures/porto-seguro/*.golden.json`): `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` shows additions only (plus the fixture source `layout-lock/op-log.ts` if it must learn the new type). If one would move, stop and report. No v14 golden.
- No automatic point of attention (fix batch e24h). No change to the conclusion rules of e24a. No test of the no-break; the Disjuntor MT's item NO-BREAK DE COMANDO stays.
- No paid model call: `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`; the prompt eval is the coordinator's.
- Never touch the main checkout or another compose project; never `down -v`; never build an image. Never edit `epics.md`, `epic-24-context.md`, the sprint change proposal; `sprint-status.yaml`, `deferred-work.md` and the KB are written by the orchestrator after the review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| TP v14 | new v14 TP | 7 items, hint "ÍNTEGROS E COM ESPECIFICAÇÃO CORRETA" under FUSÍVEIS; prints FUSÍVEIS | v13/v12 TP and TC: 7 items, no hint |
| TC v14 | new v14 TC | 6 items, no FUSÍVEIS; "item N" of the conclusion follows the list | any subtype `na_defaults` naming `fusiveis` drops it on v14 |
| Oil unit v14 | TIPO DE ISOLAÇÃO ÓLEO ISOLANTE | 17 items; items 5 (VENTILAÇÃO FORÇADA), 16, 17 derived N.A., not missing | a stored answer on a dry item wins |
| Dry unit v14 | Á SECO or EPÓXI | the 8 oil items derived N.A.; 3 dry items asked; `coleta_oleo` not applicable | dry subtypes' `na_defaults` = the 8 oil items |
| Unknown medium | TIPO empty | all 17 asked | - |
| Crossing dry to oil | dry items answered, then ÓLEO ISOLANTE | one batch clears the 3 dry items' result and observation (mirror of `oilCrossingPuts`) | unknown to oil clears nothing |
| Oil field on a dry unit | v6 to v14 definition with `oil_rule.fields`, unit not oil | drawn read-only and empty with "Não se aplica: {field label} é {value}."; stored value kept; not missing; prints "-" as before | unknown unit: editable as today |
| QGBT inspection v14 | new sheet | 12 items (REAPERTO GERAL, TESTE DE FUNCIONAMENTO with hints), `termografia` switch on, NA until "Equipamento em carga" Sim | thermography unanswered: not missing, no table printed; v12/v13: 10 items, no test |
| No-break v14 | palette at a local | "No-break de comando" under "Outros equipamentos", TAG "NB-01", 18 plate fields, 6 items (2 hints), no test | v13 palette does not offer it; company fixture type of the same name told apart by "Tipo da empresa" |
| No-break NC | item 4 NC with a chip, rest C | floor Aprovado · Com restrições; conclusion names item 4 and says nothing about measured values; row offers "Criar ponto de atenção" | no point without the tap |
| Plate read, fake | photo on No-break, on a cable | fields suggested from the type's default fixture | before: cable reading failed permanently |
| "Outro" text | `coleta_oleo` Não coletado, Motivo Outro | text value "Descreva o motivo" shown, required (missing while empty), dictation as an observation; prints "MOTIVO: OUTRO, <text as typed>" | reason changed or Coletado: text hidden, not counted, not printed (stored text kept); string over the cap refused by the fold (sync 4xx) |
| Ground grid v14 | Malha de aterramento | first block titled "Dados da malha" on the sheet and in the composer; no "Fotografar placa" (nor its retake row); fields, copy chips and the design-value verdict unchanged; prints as v13 | v13 Malha: "Dados de placa" and "Fotografar placa" |
| Old client | contract 44 syncing a v14 relatório with the new type or keys | 426 | - |

</intent-contract>

## Code Map

All under `packages/domain/src/` unless named.
- `seed/v14.ts` -- clone of v13 + `withE24aRules`; add `withE24s...` sections. v13's TERMOGRAFIA is not exported: take it from a v13 block's `measurement_tests` (`structuredClone`). Pattern for a type: `seed/v13.ts:705-718` (MALHA_ATERRAMENTO), sub-block helpers `withSubBlocks`/`withMeasurementTests` (`v13.ts:439-455`, copy, not import, if not exported).
- `seed/v12.ts:141-202` -- the TP list (copy of v10's TC list `seed/v10.ts:39-50`), `inspecaoQgbt` (ten items from the Quadro; Quadro's `reaperto_geral` at `seed/v6.ts:132`).
- `seed/schema.ts` -- `checklistItemSchema.hint` (:112), `oilRuleSchema` (:487-513, add `dry_items` optional, disjoint from `items`, refs checked in `checkSeedV6Definition` :535-545), `blockDefinitionSchema` (:810-841, add `nameplate_title`, `nameplate_photo: z.literal(false)`), `seedRulesSchema` (:1005, untouched unless a flag is truly needed).
- `seed/measurement.ts` -- `measurementKindSchema` (:31) is shared by columns, rows and values; add `text` for values only (a separate value-kind schema; :75-88 `typed`/`kindRefinements`; `measurementValueSchema` :135-145; `when` checks :469-489).
- `seed/seed.test.ts:2190-2260` -- `V14_HASH`, `withoutE24a`, 24.2-UNIT (also `equipmentTypesOf('v14')` assertion at :2214 changes).
- `schemas/block-config.ts` -- append to `EQUIPMENT_BLOCK_TYPES` (:39, doc comment :29-38) and `ITEM_KEYS` (:163+, append with a "seed v14, batch e24s, contract N" comment). `no_break_de_comando` already exists (Disjuntor item): no collision allowed.
- New type tables (typecheck forces): `relatorio/tag.ts` `LEGACY_TAG_PREFIX` (:24) and `TAG_PREFIX` (:39), NB in both; `relatorio/conclusion.ts` `NOUNS` (:480); `templates/text.ts` `NOUNS` (:30) and `TOTALS_ORDER` (:57); `photos/caption.ts` (:26); `types/duplicate.ts` `SEEDED_NOUNS` (:32); `types/test-base-import.ts:64` prefix map; `apps/web/src/copy/pt-br.ts:559` `composer.equipmentNames`. Palette is data (`seed/definitions.ts` `equipmentTypesOf` :176, `relatorio/tree.ts` `paletteTypeGroups` :792); print grouping already puts a library type before the Malha (`print/group-for-print.ts:354-390`).
- `relatorio/oil-rule.ts` -- `oilDerivedNaKeysUnder` (:84, mirror for `dry_items` on an oil unit), `isOilItem` (:90), `oilCrossingPuts` (:155, mirror to oil), `oilCrossingClearedCount`/`oilItemsClearedText` (:192-216), `dryFieldExcusedReason` (:115, add the oil-field mirror reason). Web: `apps/web/src/surfaces/ficha/nameplate-section.tsx:389-417` (title, `PlateCameraGroup` :395, `PlatePhotoRow` :251/:397, read-only reason :414), `apps/web/src/surfaces/ficha/ficha-ops.ts:72` (crossing).
- `relatorio/measurement-evaluation.ts` -- `read`/`displayOf` (:376-387), `evaluateValues` (:1039-1063), `shownUnder` (:1066-1085: must follow the chain, a value under a hidden value is hidden), value display (:1605-1624), counts (:1392, read by `relatorio/sheet-progress.ts:208`). `relatorio/reading-cells.ts:514` `readStored`.
- `ops/apply.ts:498-501,673-678` (test value fold), `ops/value-limits.ts` (`TEXT_CAPS` :25; `sheet/test/value` cap :185/:82): a text value takes `TEXT_CAPS.medium`, as a checklist observation.
- `print/section-9.ts:1099-1119` `valuesLineOf`, `:1271-1273` the reason line (choice through `printLabel`; the text appended as typed: "MOTIVO: OUTRO, <text>").
- Web values: `apps/web/src/surfaces/ficha/measurement-test-section.tsx` `SingleChoiceTest` (:256-310, `reasons` keep only choices :273), `TestValue` (:318+); dictation `apps/web/src/speech/dictation.tsx` (`DictationButton`, `useProseDictation`), as `checklist-section.tsx:419,545`.
- Composer sub-block name: `apps/web/src/copy/pt-br.ts:472` `subBlockLabels.nameplate`, read in `apps/web/src/surfaces/templates/type-defaults-dialog.tsx:88`; the title must come from the definition (kernel helper) when `nameplate_title` is set.
- Company types: `types/definition.ts` (`companyOilRuleSchema` :256-271, `companyTypeDefinitionShape` :274-301, strips unknown keys), `types/block-definition.ts:54-95`, `types/duplicate.ts:90-113`.
- Plate reading: `apps/api/src/jobs/reading/kinds/plate.ts:62-82` `fakeDefaults` (cables missing, :78-79), fixtures `apps/api/src/jobs/reading/fixtures/<sha>.json` + `images/plate-<type>.png`, `fixtures/README.md`; generator `apps/api/src/scripts/make-plate-fixtures.ts` (`PlateSpec.blockType` :85, `PLATES` :98, malha :437); prompt `apps/api/src/jobs/reading/providers/bedrock.ts:73-81` (version + changelog), `plateFieldNotes` (~:221-270); the 7 and 8 bumps (`bff390d9`, `4a2c4505`) also touched `bedrock.test.ts`, `apps/api/src/scripts/bedrock-eval.ts:71-73`, `scripts/eval-samples.ts:89,112`.
- `contract/version.ts` (`CONTRACT_VERSION` :513, `MIN_CONTRACT_VERSION` :813, history paragraphs :440-453, :764-772).
- Layout fixture: `packages/domain/fixtures/layout-lock/op-log.ts` builds one sheet of every type the version offers; `apps/api/src/jobs/generate/docx-layout-lock.test.ts:95-130` 24.2-UNIT-SAME compares v13 and v14 (flags off) and asserts equal log lengths.
- e2e: `e2e/plate-every-type.spec.ts` (:132, :155-163, 14.9-E2E-005 :203 needs a plate for every library type of the current seed that offers a plate photo), `e2e/qgbt-inspecao.spec.ts`, `e2e/oil-dry.spec.ts`, `e2e/oil-liquid-sampling.spec.ts`, `e2e/oil-dry.durability.spec.ts`, `e2e/dry-transformer.durability.spec.ts`, `e2e/seed-v14.spec.ts`, the four tap-budget specs (`tap-budget.spec.ts:178`, `tap-budget-signal.spec.ts:126`, `journey-taps.spec.ts:155`, `journeys-12-3-12-4.spec.ts:133`; v13 numbers in `deferred-work.md` row at ~3269), `e2e/support/relatorio-seed.ts` (`newRelatorioDrafts`), `e2e/support/palette.ts`.
- Docs: `docs/nc-chip-phrases.md` (+ `scripts/nc-chip-phrases.test.ts`), `_bmad-output/specs/spec-fasor/source-deltas.md` rows of 2026-11-10 (24.10, 24.11, 24.12 "planned"), `_bmad-output/specs/spec-fasor/SPEC.md` line on seeded types (24.13).

## Tasks & Acceptance

**Execution (in story order; each story green on its narrow tests before the next):**
- 24.10 -- `seed/v14.ts` section: TP FUSÍVEIS hint; TC list without `fusiveis` (and from any `na_defaults`/`oil_rule.items`). `seed.test.ts` "24.10-UNIT" and the strip helper start. Section 9 print test of both v14 tables (7 and 6 rows, "item N" numbering). `e2e/seed-v14-tp-tc.spec.ts` "24.10-E2E-001 @p0" (palette to DOCX; plus a v14 TC "Igual à" a v13 TC copies the plate only). The four tap-budget specs gain a v14 run beside the v12 one (J1 <= 11 taps, SM-3 <= 22; journey-taps and journeys-12-3-12-4 at their v13 counts), with a dated comment. `docs/nc-chip-phrases.md` v14 TP and TC tables.
- 24.11 -- schema `oil_rule.dry_items` (seed + company); v14 transformer: append `tanque_e_aletas` (oil), `limpeza_das_bobinas`, `trincas_na_resina` (dry) with three authored NC phrases each; item 5 label VENTILAÇÃO FORÇADA and dry; `oil_rule.items` + `tanque_e_aletas`, `dry_items` the three; dry subtypes' `na_defaults` the 8 oil items. Kernel: derived N.A. both ways, crossing to oil clears dry items, oil-field reason on a non-oil unit (every seed with `oil_rule.fields`); web nameplate draws it read-only with the reason. Tests per DoD: "24.11-UNIT", kernel both ways (v6, v12, v14 definitions), "24.11-API-001" (company type with `dry_items` through sync; contract 44 client 426), `e2e/seed-v14-transformer.spec.ts` "24.11-E2E-001 @p0" and "24.11-E2E-002".
- 24.12 -- v14 `inspecao_qgbt`: append `reaperto_geral` (Quadro's phrases, hint "TORQUE CONFORME O FABRICANTE") and `teste_de_funcionamento` (hint "ACIONAMENTO MANUAL DOS DISJUNTORES, MULTIMEDIDOR, SINALIZAÇÃO, DPS", 3-4 authored phrases); the v13 `termografia` test as on the eight, sub-block before observations. Kernel tests of the conclusion wording with the thermography off, NA and measured. "24.12-UNIT"; `e2e/seed-v14-qgbt-inspecao.spec.ts` "24.12-E2E-001 @p0" (both items, thermography applied with a thermal photo, DOCX); `e2e/qgbt-inspecao.spec.ts` pinned to v13.
- 24.13 -- type `no_break_comando` per the story's DoR (18 plate fields in order, six items with hints, sub-blocks nameplate/checklist/observations/conclusion, `library: true`, `print_title` "NO-BREAK DE COMANDO", no test, no subtype); every type table above; NB prefix. Plate: one synthetic No-break plate and one cable plate (both cable types point at it, or one each) generated with `make-plate-fixtures.ts` in the tools container, `fakeDefaults` entries, README rows; prompt `bedrock-structuring-9` with a battery-fields note (changelog line, tests, eval scripts as the 8 bump did; do not run the eval). Tests: "24.13-UNIT" (seed, composer, palette, caption), "24.13-API-001", "24.13-INT" (DOCX group and order), `e2e/no-break.spec.ts` "24.13-E2E-001 @p0" (palette, plate read from a photo and confirmed, six items, conclusion, DOCX under "Outros equipamentos"), `plate-every-type.spec.ts` covers No-break and the cables. `SPEC.md` dated line.
- 24.14 -- measurement value kind `text` (values only); `coleta_oleo` on v14 (transformer and disjuntor) gains value `motivo_texto` "Descreva o motivo", `when` Motivo = `outro`; `shownUnder` follows the chain; fold accepts a string up to `TEXT_CAPS.medium`; evaluation counts it missing while shown and empty; web renders a text field with dictation in `SingleChoiceTest`/`TestValue`; section 9 prints "MOTIVO: OUTRO, <text>". Definition keys `nameplate_title` and `nameplate_photo: false` (seed + company carry), set on the v14 Malha ("Dados da malha"); sheet title, composer label and the plate camera/retake gated by a kernel helper. Tests per DoD: "24.14-UNIT", "24.14-API-001", section 9 reason line v14 and v13, `e2e/seed-v14-sheet-fixes.spec.ts` "24.14-E2E-001 @p0" and "24.14-E2E-002".
- Cross-cutting -- `contract/version.ts` one paragraph and the bump (45, MIN 45 unless main moved); an api integration test of the 426. `docx-layout-lock.test.ts` 24.2-UNIT-SAME: v14's e24s data differs from v13 by design; the test compares v13 and v14 (flags off) over every sheet except the types e24s changes (a named list `E24S_TYPES` with the reason), asserts those sheets and the No-break are the only differences, and the e24s print tests pin each changed sheet's delta. Every spec asserting a type, palette or item-count list (`grep -rln` over `e2e/`) is run and reads the kernel.

**Acceptance Criteria:**
- Given the ACs of Stories 24.10 to 24.14 in `epics.md`, when the batch's tests run, then each AC has a named test (unit, api, integration or e2e) that passes, and the I/O matrix above holds.
- Given the batch diff, when `git diff origin/main --name-status -- apps/api/src/jobs/generate/golden packages/domain/fixtures` runs, then it lists additions only (and `layout-lock/op-log.ts` if modified), and the v5, v11, v12, v13 layout-lock and Porto Seguro tests pass unchanged.
- Given seed v1 to v13, when `seed.test.ts` runs, then every shipped hash holds and `withoutE24s(withoutE24a(v14))` equals v13.
- Given a client on contract 44, when it syncs a relatório holding a No-break block, a v14 text value or a company type with `dry_items`, then the sync route answers 426.

## Design Notes

- **Why data keys, not `rules` flags:** each change is a list or a definition shape, already per-version by being on v14's definition; a company copy carries it by being copied. The oil-field reason on a dry unit is the one screen change on every seed with an oil rule (decided by Matheus, row ~3494); print is unchanged there.
- **`nameplate_photo: false`** reads as "this block has no plate to photograph"; absent means a photo is offered, so every older definition behaves as today.
- **Text value cap**: `TEXT_CAPS.medium` (1000), the checklist observation's, because the value is filled by typing or dictation as an observation. Stored as a string; hidden-and-kept when its condition fails (no write by the kernel), as the Motivo choice is kept today.
- **24.2-UNIT-SAME**: the comparison keeps its purpose (nothing of v14 moves outside the named stories) by excluding exactly the e24s-changed types and asserting they are the only differences.

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint` / `pnpm static` -- clean.
- `... pnpm exec vitest run packages/domain/src/seed packages/domain/src/relatorio packages/domain/src/print packages/domain/src/types` -- green.
- `... pnpm test:api` (after `podman compose restart api`) -- green, layout-lock v5/v11/v12/v13 and Porto Seguro included.
- `... pnpm exec tsx scripts/e2e.ts e2e/seed-v14-tp-tc.spec.ts e2e/seed-v14-transformer.spec.ts e2e/seed-v14-qgbt-inspecao.spec.ts e2e/no-break.spec.ts e2e/seed-v14-sheet-fixes.spec.ts <touched> --project desktop-chrome --project durability-desktop-chrome` -- green.
