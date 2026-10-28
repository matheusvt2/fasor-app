---
title: 'Stories 15.7 and 17.6: the TC''s own checklist (seed v10); "Altitude do site" takes N/A and says when the device gave none (contract 27)'
type: 'feature'
created: '2026-10-28'
status: 'in-review'
baseline_revision: '1a2f0b0f2a56872166008bf6c628366a9380323a'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'medium'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-17-context.md']
warnings: ['batched']
# batched: Stories 15.7 and 17.6 share one seed/contract entry (seed v10, contract 27, minimum 27) assigned to batch
# e17c by epic-17-context.md, so they ship on one branch, one gate and one PR (Epic 17 wave B).
deferred: []
---

<intent-contract>

## Intent

**Problem:** (15.7) A TC sheet asks the transformer's fifteen (fourteen on v9) items, so Bruno marks valves, fans and radiators NA on every TC; his list (spreadsheet of 2026-10-15, answer 8 of 2026-10-27) has seven items. (17.6) "Altitude do site" (Etapa 5) is a native number input that refuses N/A, and on a device whose position carries no altitude the field sits empty with no word (QA G3; Bruno's answer 4: N/A, or the phone's position).

**Approach:** One seed version **v10 derived from v9** (`seed/v10.ts`) that gives `tc` its own seven-item checklist with `epoxi`/`a_seco` marking only VASAMENTO NA; one contract entry **27, minimum 27** for both stories; `site_altitude_na: boolean` beside `site_altitude_m`, the Story 17.3 "N/A" control on the Etapa 5 field (one shared button component, never a second control), an authored hint when the device answered no altitude, and "N/A" through the existing readers (`NOT_APPLICABLE_TEXT`, `NOT_APPLICABLE_NUMBER`).

## Boundaries & Constraints

**Always:** the defaults of `epic-17-context.md` (Matheus, 2026-10-27) bind: the only oil item is "VASAMENTO", spelled as the spreadsheet's; `site_altitude_na` default false. AD-1/AD-13: every text, count and value shape lives in `packages/domain`; `apps/web` renders and writes puts only. v1 to v9 byte-identical (pin `V9_HASH` the way `V8_HASH` is). Counts and keys read from the kernel, never literals in `apps/*` or `e2e/` (E14-A3). Porto Seguro goldens (v1, no N/A, no altitude N/A) byte-identical: if one changes, STOP and report. pt-BR copy in its three homes; authored strings marked `// authored:` and listed in the PR for Bruno. No emoji; English code and docs.

**Never:** edit v1..v9 seed files' content; change TP or Transformador de força; change the TC's nameplate, insulation or ratio tables; a new op kind or path family; a second "N/A" control implementation; `type="number"` of the altitude input changed (its `spinbutton` role is asserted by `setup-surface.test.tsx`, `relatorio.spec.ts`, `review-field-defects-2.spec.ts`); edit `epics.md`, `sprint-status.yaml`, `tokens.css`, `components.css`; touch `docx.ts`, `layout.ts` or any golden; run Playwright from the implementation subagent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| A1 v10 TC list | `getDefinition('v10','cabine_primaria','tc').checklist` | seven items, keys in order: `limpeza_pintura_e_corrosao`, `vasamento`, `fusiveis`, `aterramento`, `conexoes`, `fiacao_secundaria`, `buchas`; labels "LIMPEZA, PINTURA E CORROSÃO", "VASAMENTO", "FUSÍVEIS", "ATERRAMENTO", "CONEXÕES", "FIAÇÃO SECUNDÁRIA", "BUCHAS" |
| A2 v10 TC dry | `epoxi`, `a_seco` `na_defaults`; `oil_rule.items` | both `['vasamento']`; `oil_rule.field`, `oil_values`, `fields` as v9's |
| A3 v10 diff | strip v10 (restore v9's `tc.checklist`, `tc.subtypes`, `tc.oil_rule.items`) | `JSON.stringify` equals v9; `hash('v9') === V9_HASH`; v1..v8 hashes unchanged; `SEED_VERSION === 'v10'`; keys `['v1',…,'v10']` |
| A4 v10 TP, força | `getDefinition('v10', …, 'tp' / 'transformador_forca')` | `toEqual` v9's |
| A5 v10 TC sheet | TC block on v10, screen and print | 7 checklist rows in definition order, numbered 1..7; Á SECO: `vasamento` derived NA, `limpeza_pintura_e_corrosao` not, no "Marcar … de óleo como NA" chip (the oil rule marks, as since v6); section 9 prints 7 rows; TC on v9 unchanged (14 rows) |
| A6 learned phrases | registry `nc_phrase` rows on `valvula_de_alivio` for `tc` | kept and offered on v9 TC sheets; not offered on a v10 TC (no such item); `nc-phrase-row.ts` labels them from v9 |
| A7 new item keys | `ITEM_KEYS` | appends `limpeza_pintura_e_corrosao`, `vasamento`, `fiacao_secundaria`, `buchas` at the end (the contract reason beside the seed: a version-26 bundle's `itemKeySchema` refuses a `file`/`point` row or `na_defaults` naming them) |
| A8 sync | v27 push `sheet/{tc}/checklist/vasamento/result = 'C'` on a v10 TC; same on a v9 TC | accepted and carried; refused `op_invalid` (`assertSeedPath`, the 15.3 site-item precedent) |
| B1 schema | relatório row JSON without `site_altitude_na` | parses with `site_altitude_na: false`; `RELATORIO_SETUP_KEYS` includes it; `parsePath('relatorio/setup/site_altitude_na')` ok; `applyOp` of the put folds it |
| B2 kernel value | `siteAltitudeValue({ site_altitude_m, site_altitude_na })` | na true: `{ raw: '', unit: null, state: 'not_applicable' }` (na wins over a number); m 840: `{ raw: '840', unit: 'm', state: 'measured' }`; both empty: null |
| B3 print | `cabineParts` with na true and the cabine's own `env.altitude_m` null | ALTITUDE cell "N/A"; a stored cabine `altitude_m` still wins; na false + m null prints "-" as today |
| B4 Etapa 5, no altitude | position answer `coords.altitude === null` (or denied) | field empty, no "Sugerido", hint "O aparelho não informou a altitude: digite o valor ou marque N/A" under it (`aria-describedby`), "N/A" button (name "Marcar Altitude do site como não aplicável") beside it |
| B5 Etapa 5, altitude | answer 763.6 | prefilled 764, "Sugerido", no hint, the control still beside the field |
| B6 no geolocation API | `navigator.geolocation` undefined | no hint (nothing answered), control present, field as today (open question 2) |
| B7 tap N/A | field empty or holding typed text, tap the control | one batch: `relatorio/setup/site_altitude_na = true`, `relatorio/setup/site_altitude_m = null`; the idle timer cleared and the text marked clean (a blur that already wrote the typed value is harmless); the field is replaced by the line "Altitude do site: N/A" with "Alterar"; no focus move |
| B8 stored N/A | row `site_altitude_na: true` (any `site_altitude_m`, any `site_altitude_confirmed`) | the N/A line renders (na wins); no position question asked |
| B9 Alterar from N/A | tap "Alterar" | put `site_altitude_na = false`; the empty field reopens with the focus in it (`restoreFocus`), the hint shown again when the device gave none; typing 760 + blur writes `site_altitude_m = 760` as today |
| B10 readers | na true | sheet's read-only Altitude `.mf-value` "N/A", no `.mf-unit`, helper "Do setup do relatório"; `cabineLineText` unchanged (it never carried the altitude, open question 1) |
| B11 old client | version-26 pull | 426 `contract_outdated` on every stream; a 27 pull answered; a `site_altitude_na` put applied, stored in `relatorio.setup`, carried by the stream |

</intent-contract>

## Code Map

### Part A, Story 15.7

- `packages/domain/src/schemas/block-config.ts:103-191` `ITEM_KEYS` -- append the four keys with a comment "Appended (seed v10, Story 15.7, contract 27): the TC's own list (`docs/nc-chip-phrases.md`, "TC"); `fusiveis`, `aterramento` and `conexoes` are the keys other lists already use".
- `packages/domain/src/seed/v9.ts` -- the derivation pattern (header comment, `structuredClone(v9)`, per-block functions). New `packages/domain/src/seed/v10.ts`: `CABINE_PRIMARIA_V10 = cabinePrimariaV10()` from `CABINE_PRIMARIA_V9`; `tcV10(definition)`: `checklist: TC_CHECKLIST_V10`, `subtypes: definition.subtypes.map(s => ({ ...s, na_defaults: ['vasamento'] }))`, `oil_rule: { ...definition.oil_rule!, items: ['vasamento'] }`. `TC_CHECKLIST_V10` built with a local `item(key, label, nc_phrases)`: items 3, 4 and 5 reuse phrases read from v9 by key (`fusiveis` from the first v9 block whose checklist holds it, `aterramento` and `conexoes` from v9's `tc` checklist), so the chips match the other sheets; items 1, 2, 6 and 7 are `// authored (Story 15.7, open for Bruno):` 1 `['acúmulo de poeira e sujeira', 'pintura descascada', 'pontos de corrosão']`; 2 `['vazamento de óleo pela junta', 'vazamento de óleo pela bucha', 'resíduos de óleo na base']`; 6 `['fiação secundária danificada', 'terminal secundário frouxo', 'fiação secundária sem identificação']`; 7 `['trinca na bucha', 'lascamento na bucha', 'sinais de aquecimento na bucha']`. Header comment names Bruno's spreadsheet by path (`docs/context/`, never copied) and the "VASAMENTO" spelling decision.
- `packages/domain/src/seed/definitions.ts:31,47,97-106` -- import v10, `SEED_VERSION = 'v10'`, append `v10: bundle('v10', CABINE_PRIMARIA_V10)`.
- `packages/domain/src/seed/seed.test.ts:1652-1760` -- `V9_HASH` pinned (compute it in the tools container); the v9 block keeps its assertions but `expect(SEED_VERSION).toBe('v9')` and the keys list move to a new v10 block (A3); v10 block: A1, A2, A4, `naDefaultsFor('v10','tc','epoxi')` length 1, `naDefaultsFor('v10','tp','epoxi')` 7, `getDefinition('v10', …, 'tc').nameplate` equals v9's, the ratio and insulation tests equal v9's.
- `packages/domain/src/relatorio/oil-rule.test.ts`, `dry-insulation.test.ts`, `sheet-progress.test.ts` -- v10 TC cases: `oilDerivedNaKeys` of an `a_seco` TC is `{'vasamento'}`; `isOilItem(tcV10, 'vasamento')` true, `'buchas'` false; `oilNaChipItems` of a v10 TC empty (seed v6+ rule).
- `packages/domain/src/print/section-9.test.ts` (v9 checklist patterns, `sheetOf` / `layoutOf` helpers) -- a v10 TC prints 7 VERIFICAÇÕES GERAIS rows in order; a v9 TC 14.
- `packages/domain/src/registry/nc-phrase-row.ts` + test -- a learned phrase on `valvula_de_alivio` for `tc` keeps its label from v9 (A6); pin it.
- `packages/domain/src/contract/version.ts:214-227,322-335` -- the `27` paragraphs in both comments (seed v10: the TC's own seven-item checklist, `ITEM_KEYS` gains four keys; `site_altitude_na` on the relatório setup, Story 17.6; a version-26 bundle cannot resolve seed v10, parse a `relatorio/setup/site_altitude_na` op (`RELATORIO_SETUP_KEYS`), nor a `file`/`point` row naming a new item key; a row written before 27 parses to the same bytes), `CONTRACT_VERSION = 27`, `MIN_CONTRACT_VERSION = 27`.
- `apps/api/src/sync/sync.integration.test.ts:1081-1100` -- the contract test becomes 27 (26 joins the refused list with its reason; `expect(CONTRACT_VERSION).toBe(27)`); new test after the 15.3 one (l.1605, `site('v10')` / `site('v9')`, `blockCreate(..., 'tc')`): A8 and B11's put (the 16.4 test at l.1636 is the pattern: `pushOk`, `rowOf`, `pullOk` carried, `pull(..., '26')` 426).
- `apps/web/src/surfaces/project/new-relatorio-dialog.test.tsx:198`, `templates/templates-surface.test.tsx:491` -- `'v9'` literal becomes `SEED_VERSION`. `template-composer-local.test.tsx:116-118` stays on v9 explicitly (consistent).
- `e2e/seed-v9.spec.ts:81` -- `expect(SEED_VERSION).toBe('v9')` becomes `expect(Object.keys(SEED_VERSIONS)).toContain('v9')`-style (its sheets are the current seed's and every other assertion holds on v10; `seed-v7.spec.ts` precedent: no pinned version).
- `e2e/seed-v10.spec.ts` (new) -- 15.7-E2E-001 `@p0` (parallel group, the `seed-v9.spec.ts` 15.3-E2E-001 pattern: `pushStandard`, `openSheet`, `checklistRow`, `plateField`, `checked`): `expect(SEED_VERSION).toBe('v10')`; the TC sheet's `#ficha-step-verificacoes li.checklist-row` count and `data-item-key` order equal `TC.checklist`; the rows show the labels "VASAMENTO" and "BUCHAS" and none of "VÁLVULA DE ALÍVIO"; select Á SECO: `checked(page, 'vasamento')` `data-value="na"`, `checked(page, 'limpeza_pintura_e_corrosao')` count 0, no chip; the TC's "Relação de transformação" step still present (heading or `#ficha-step-relacao_transformacao`, read the sheet's step ids from `ficha.spec.ts`); the TP sheet keeps `TP.checklist.length` rows. 15.7-E2E-002 `@p1`: `smallRelatorio()` plus one `tc` block in Enel with every item answered C (the `officeDraft` pattern of `review-field-defects-2.spec.ts` `completeSheet`), generate the DOCX as 15.3-E2E-002 does, read the TC's VERIFICAÇÕES GERAIS table from its own heading (E7-A6): 7 item rows in order. Add the file to `SERIAL_SPECS` (`e2e/support/groups.ts`) with its why (DOCX through the shared queue), or `scripts/e2e.test.ts` fails.
- `docs/nc-chip-phrases.md:88-110` -- a dated note under the shared list ("2026-10-28, Story 15.7, seed v10: the TC leaves this list") and a new section "TC (seed v10)" with the seven rows (key, label, phrases) marking the authored ones pending Bruno.

### Part B, Story 17.6

- `packages/domain/src/schemas/entities.ts:340-342` -- `site_altitude_na: z.boolean().default(false)` after `site_altitude_m` with a comment (Story 17.6, contract 27: the device gave no altitude and none applies; wins over `site_altitude_m` in every reader). `relatorio/instantiate.ts:180`, `contract/examples.ts:76` -- `site_altitude_na: false`.
- `packages/domain/src/relatorio/setup-complete.ts:59` -- beside `siteAltitudeText`: `export function siteAltitudeValue(setup: Pick<RelatorioSetup, 'site_altitude_m' | 'site_altitude_na'>): NumberValue | null` (B2; import `NOT_APPLICABLE_NUMBER` from `../parse/pt-br-number.ts`; the number value type is the one `cabine-block.tsx` builds inline today). Export through `index.ts`. Tests in `setup-complete.test.ts`.
- `packages/domain/src/print/section-9.ts:332-341,437,839` -- `cabineParts(cabine, definition, siteAltitude: NumberValue | null)`: `env.altitude_m` falls back to it when the cabine's own is null/undefined and it is non-null; both call sites pass `siteAltitudeValue(ctx.snapshot.relatorio.setup)`. `storedValueText` already prints `NOT_APPLICABLE_TEXT` for the state (Story 17.3). Tests B3 in `section-9.test.ts` (cabine block cases l.789-870).
- `packages/domain/src/ops/path.test.ts:82`, `apply.test.ts:235` -- B1 cases.
- `apps/web/src/components/not-applicable-button.tsx` (new) + barrel `components/index.ts` -- `NotApplicableButton({ label, onPress })`: the exact element `NumberField` renders today (`ficha-fields.tsx:386-403`: `button.btn.btn-secondary.btn-na`, `type="button"`, `aria-label={ui.notApplicable.markLabel(label)}`, text `ui.notApplicable.control`). `NumberField` renders it (pure refactor: `ficha-fields.test.tsx` and `na-number-field.spec.ts` unchanged and green).
- `apps/web/src/surfaces/relatorio/setup/etapa5-local.tsx` -- (a) the position effect returns early when `setup.site_altitude_na` too; it also records `deviceGaveNone` (state) when the answer's `altitude === null` (kept or fresh); (b) render order: `site_altitude_na` -> the N/A line (`div.field.suggestion-field.altitude-field.span-2`, `span.field-label`, `span.row` with `span.helper.helper-ok` `t.altitudeNotApplicable(NOT_APPLICABLE_TEXT)` and the `TextButton` "Alterar" with `t.altitudeChangeLabel`, whose press does `altitudeUserEdited.current = true`, `onCommit('site_altitude_na', false)`, `restoreFocus` into the input); then `site_altitude_confirmed` as today; else `AltitudeInput`; (c) `AltitudeInput` gains `deviceGaveNone: boolean` and `onNotApplicable: () => Promise<void>`: wraps its `.measurement-field` in `div.field-na-row` with `<NotApplicableButton label={t.altitudeLabel} onPress={…}>` after it (clear the idle timer, `altitude.markClean()`, then `onNotApplicable()`), and renders `<span className="helper" id={hintId}>{t.altitudeNoneHint}</span>` after the row while `deviceGaveNone && stored === null && altitude.text.trim() === ''`, the input's `aria-describedby` naming it then; (d) `onNotApplicable` in `Etapa5Local`: `lastWritten.current = null; setReading(null); await onCommitFields([['site_altitude_na', true], ['site_altitude_m', null]])`.
- `apps/web/src/copy/pt-br.ts:1452-1463` (`setup` block) -- `// authored (Story 17.6, open for Bruno):` `altitudeNoneHint: 'O aparelho não informou a altitude: digite o valor ou marque N/A'`; `// authored:` `altitudeNotApplicable: (text: string) => \`Altitude do site: ${text}\``.
- `apps/web/src/surfaces/ficha/cabine-block.tsx:102,198-199` -- `ReadOnlyField value={siteAltitudeValue(snapshot.relatorio.setup)}` (drop the inline shape).
- `apps/web/src/surfaces/relatorio/setup-surface.test.tsx:428-560` (geolocation stub pattern l.452-468, `seeded()`, `renderSetup()`, `database.entities`) -- B4 (stub `ok({ coords: { altitude: null } })`), B5 (no hint), B6, B7 (empty, and with "12" typed: final row `site_altitude_na: true, site_altitude_m: null`; the line shown; no spinbutton), B8, B9 (focus in the reopened input, then type 760 + blur: `site_altitude_m: 760`, na false). A `cabine-block` or `ficha` component test for B10 if one renders the read-only Altitude (grep `Do setup do relatório` in `apps/web/src/surfaces/ficha/*.test.tsx`); else the e2e covers it.
- `e2e/altitude-na.spec.ts` (new, parallel group; `test.use({ permissions: ['geolocation'], geolocation: { latitude: -23.5505, longitude: -46.6333 } })` gives `coords.altitude === null`; setup helpers of `review-field-defects-2.spec.ts` F-02: `setUp`, `outbox`, `entities`, `openSheet`, `enelSeccionadoras`) -- 17.6-E2E-001 `@p0`: Etapa 5 shows the hint and the control; tap it; `expect.poll` the outbox holds `relatorio/setup/site_altitude_na` true and `relatorio/setup/site_altitude_m` null (one batch: same `batch_id`), the entities row `setup.site_altitude_na === true`; the line "Altitude do site: N/A" visible, no spinbutton; reload keeps it; the Enel sheet's read-only Altitude (`getByRole('textbox', { name: 'Altitude', exact: true })`) `.mf-value` "N/A" and `.mf-unit` count 0; back to Etapa 5, "Alterar": control and hint back, `site_altitude_na` false in the outbox, fill 760 + leave: `site_altitude_m` 760. 17.6-E2E-002 `@p1`: `page.addInitScript` stubbing `navigator.geolocation.getCurrentPosition` to answer `{ coords: { altitude: 763.6 } }`: prefilled 764 with "Sugerido", no hint, the control present.
- `e2e/altitude-na.durability.spec.ts` (new; the durability projects match `*.durability.spec.ts` only, `na-control.durability.spec.ts` is the pattern) -- 17.6-DUR-001: the same geolocation stub; tap "N/A"; the entities row `site_altitude_na: true` and the outbox puts; reload keeps the line; the sheet's Altitude "N/A".
- Docs (both parts): `_bmad-output/specs/spec-fasor/source-deltas.md` (two "as built" rows after l.130: 15.7 seed v10 and 17.6, contract 27), `_bmad-output/specs/spec-fasor/glossary.md:42` (N/A row: "and the relatório's Altitude do site through `site_altitude_na` (Story 17.6)"), `docs/kbs/architecture/kernel-and-seed.md` (dated note after the 16.4 one, l.41), `docs/kbs/log.md` (one dated line), `_bmad-output/implementation-artifacts/deferred-work.md:2369-2372` (G3 row: state closed with this spec's path).

## Tasks & Acceptance

**Execution (order by dependency):**
1. `block-config.ts` ITEM_KEYS; `seed/v10.ts`; `definitions.ts`; `seed.test.ts` (A1-A4, `V9_HASH`); oil/dry/progress/section-9/nc-phrase tests (A5, A6).
2. `entities.ts`, `instantiate.ts`, `examples.ts`; `setup-complete.ts` `siteAltitudeValue` + test; `section-9.ts` + test; path/apply tests (B1-B3).
3. `contract/version.ts` 27/27; `sync.integration.test.ts` (A8, B11).
4. `components/not-applicable-button.tsx`, `ficha-fields.tsx` refactor; `copy/pt-br.ts`; `etapa5-local.tsx`; `cabine-block.tsx`; `setup-surface.test.tsx` (B4-B10).
5. Web tests on `'v9'`; `e2e/seed-v9.spec.ts`; new `e2e/seed-v10.spec.ts`, `e2e/altitude-na.spec.ts`, `e2e/altitude-na.durability.spec.ts`; `e2e/support/groups.ts`.
6. Docs: `docs/nc-chip-phrases.md`, `source-deltas.md`, `glossary.md`, `kernel-and-seed.md`, `docs/kbs/log.md`, `deferred-work.md`.
7. After every kernel change the batch's api is restarted before any api test: `podman compose restart api` in the worktree, then wait for `curl -s http://127.0.0.1:31030/api/health`.

**Acceptance Criteria (Story 15.7):**
- Given seed v10, when it lands, then it is v9 plus the TC's seven-item checklist, its `epoxi`/`a_seco` `na_defaults` and `oil_rule.items` naming `vasamento`, TP and Transformador de força unchanged; v1 to v9 frozen and resolvable; a kernel test pins that v10 differs from v9 only by this (AR-20; AD-21).
- Given a TC sheet on v10, when it renders, is counted and prints, then the checklist shows and prints Bruno's items numbered from 1 with their chips, a dry TC shows VASAMENTO NA through the oil rule (no chip: seed v6+ rule, E12-A5 recomputation of "the dry chip counting the TC's oil items"), a TC on v1 to v9 is unchanged, and the Porto Seguro goldens match (FR-68; AD-15).

**Acceptance Criteria (Story 17.6):**
- Given Etapa 5 on a device whose position answer carries no altitude, when the step renders, then the altitude field is empty with the authored hint under it and the "N/A" control beside it; a device that answered an altitude prefills it as today (FR-44; AD-11).
- Given the "N/A" control tapped, or a value typed after "Alterar" from N/A, when the relatório saves, then `site_altitude_na` and `site_altitude_m` change through the existing setup put, the step shows the field resolved (the N/A line), the sheet's read-only Altitude shows "N/A", and the document prints "N/A" in the altitude's place.
- Given a device on contract 26, when it pulls a relatório with `site_altitude_na: true`, then its schema strips the key and shows the field empty without throwing, and the server answers its next pull 426 so it reloads to 27 (AD-26).

## Design Notes

- Open question 1 (17.6, narrowing): the AC says "the cabine line show N/A"; `cabineLineText` (`relatorio/cabine.ts:126`) never carried the altitude (type, kV, V, kVA, °C, %), so it stays unchanged and the sheet's read-only Altitude (Ambiente de ensaio) is where "N/A" shows. Also "the step counts the field as filled": no counter reads the altitude today (`setupGaps` does not), so the resolved line is what "filled" looks like; no new count.
- Open question 2 (17.6): the hint shows when the device *answered* with no altitude (denied, unavailable or a fix without altitude all answer null); a device with no geolocation API shows no hint (nothing answered). Matheus may want the hint there too.
- Open question 3 (17.6): "a value typed over an N/A" is reached through "Alterar" (the N/A line replaces the `type="number"` input, which cannot display "N/A"); the control is one shared component, since the altitude field is not a `NumberField` (it keeps the geolocation suggestion flow, `Confirmar`, the idle write and the `spinbutton` role).
- Open question 4 (15.7): the four authored phrase sets and the reuse of `fusiveis`/`aterramento`/`conexoes` phrases; "VASAMENTO" kept as the spreadsheet spells it (confirmation 4).
- Contract 27 is one entry for the batch (seed v10 + `ITEM_KEYS` + `site_altitude_na`); no new op kind, no undo change (the N/A commit is the existing setup put batch).

## Verification

Every command from the worktree root in the tools container: `podman compose --profile tools run --rm --user root tools pnpm <cmd>`, output redirected to `.scratch-e17c/<name>-e17c.log`, only the tail read. The implementation subagent runs the narrowest suites only: `pnpm test:unit -- packages/domain/src/seed`, `-- packages/domain/src/relatorio/setup-complete`, `-- packages/domain/src/print/section-9`, `-- apps/web/src/surfaces/relatorio/setup-surface`, `-- apps/web/src/surfaces/ficha/ficha-fields`, then `pnpm static`, `pnpm lint`, and `pnpm test:api -- sync.integration` after `podman compose restart api`. It never runs Playwright; the orchestrator runs the touched specs (`seed-v9`, `seed-v10`, `altitude-na`, `altitude-na.durability`, `na-number-field`, `na-control.durability`, `review-field-defects-2`, `relatorio`, `oil-dry`, `dry-transformer.durability`, `plate-every-type`, `templates`) under the host lock, plus the durability ones on `durability-android-chrome` and `durability-webkit`.

## Review Triage Log

### 2026-10-28 — Review pass
- layers: Edge Case Hunter, Verification Gap Reviewer (Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them)
- verdicts: 5 findings — high 0, medium 1, low 3, false 0, maybe-false 1
- findings:
  - `[medium]` `[patch]` (gap) the WebKit no-focus tap of the altitude "N/A" over typed, uncommitted text is never exercised: the B7 typed case uses `userEvent.click`, whose blur commits the text before `onPress`, so removing `altitude.markClean()` or the idle-timer clear turns no test red — patched: a `fireEvent.click` case in `setup-surface.test.tsx` (the `ficha-fields.test.tsx:573` pattern) asserting the stored `{ site_altitude_na: true, site_altitude_m: null }` and no late `site_altitude_m` put; mutation run reported in the PR body.
  - `[low]` `[patch]` (edge) a geolocation answer still in flight when "N/A" is tapped, answering an altitude, calls `setReading` because `altitudeUserEdited` is still false, so "Alterar" from N/A reopens the field prefilled "Sugerido" — patched: `onNotApplicable` marks the field user-edited; test with a deferred position answer.
  - `[low]` `[reject]` (edge) two devices racing a confirm against an N/A merge per field to `na: true, confirmed: true, m: null`, and "Alterar" from N/A then renders the confirmed line with no value — a two-device race on an office-side step; the fix adds a render guard for a state no surface writes; listed as known open in the PR.
  - `[low]` `[reject]` (edge) "Alterar" from N/A on a device that mounted with `na: true` never asks the device, so no prefill or hint — by design: the position is asked once per relatório on mount (Story 4.2, F-11/W-14) and the hint follows a kept answer (open question 2 in the Design Notes).
  - `[maybe-false]` `[reject]` (edge) on desktop the mousedown on "N/A" blurs a dirty input, so one `site_altitude_m` put of the typed value lands before the N/A batch — by design, spec B7 ("a blur that already wrote the typed value is harmless"), the same two-put sequence as Story 17.3 A9; the stored end state is N/A.
