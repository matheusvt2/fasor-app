---
title: 'Stories 15.3 and 15.6: seed v9 (one oil item, TC without POTENCIA NOMINAL, two site items) and the transformer ratio with sqrt(3)'
type: 'feature'
created: '2026-10-22'
status: 'in-review'
baseline_revision: 'db776880a0e472d2254027a99a1026823cee8320'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
warnings: ['batched', 'oversized']
batched_reason: "coordinator's cut: the two stories share seed v9 and contract 25"
deferred:
  - summary: >-
      The Story 15.6 formula helper under the ratio table is not asserted below 768 px (phone and tablet card layout).
    evidence: |-
      ensaios-section.tsx renders one p.helper after both the table and the cards block; e2e/ficha.spec.ts UX-F42 runs at 1280 px only. Risk is CSS-only; the integrated 390/768 real-browser pass should check it.
    location: >-
      apps/web/src/surfaces/ficha/ensaios-section.tsx:473
    severity: low
---

<intent-contract>

## Intent

**Problem:** Bruno's feedback of 2026-10-22: the shared transformer checklist asks about the oil level twice, the TC asks for a POTÊNCIA NOMINAL it does not have, the local's checklist lacks paint and grades/doors, and the transformador de força's VAL CALCULADO is U1/U2 where it must be U1·√3/U2 (a good transformer, 13,8 kV / 380 V measured 62,8, is flagged). Stories 15.3 and 15.6 in `epics.md` (read `### Story 15.3` and `### Story 15.6` there for the full ACs) and the three `source-deltas.md` rows of 2026-10-22 naming Epic 15.

**Approach:** One new seed version **v9 derived from v8** (`seed/v9.ts`, the `v8.ts` derivation pattern), `SEED_VERSION = 'v9'`, `CONTRACT_VERSION = 25`, `MIN_CONTRACT_VERSION = 25`; an optional `ratio_factor: 'sqrt3'` on the ratio table schema set only on v9's transformer table; the kernel computes, the web renders.

## Boundaries & Constraints

**Always:**
- v1 to v8 stay byte-identical: their hashes pinned in `seed/seed.test.ts` (add `const V8_HASH = '<sha>'` the way `V7_HASH` is, and assert v1..v8). `ratio_factor` is `.optional()` with no default, so v1..v8 parse to the same JSON.
- Counts derive from the definition (`oilNaChipItems`, `oil_rule.items`, `siteItems`): no literal 7, 8, 14, 19 or 21 in `apps/*` source (tests may read counts from the kernel).
- AD-1/AD-13: the formula helper text and its presence are kernel output; `apps/web` only renders it.
- PR #156's ratio behavior stays: `condicao` INSATISFATÓRIO when a capture is out, `nameplateTap`, unit-named input headers; their tests stay green.
- The Porto Seguro fixture is on v1: `apps/api/src/jobs/generate/golden/*` and `packages/domain/fixtures/porto-seguro/*golden*` must not change. If one changes, STOP and report why; never regenerate.
- E2E reads closed lists and counts from the kernel (the `e2e/support/palette.ts` precedent), never a literal.

**Never:** edit v1..v8 seed files' content; edit `epics.md`, `sprint-status.yaml`, `source-deltas.md`; touch `services/ocr` (its plate is the transformer, which keeps its kVA); switch the factor by LIGAÇÃO SECUNDÁRIA; change TP or TC tables; print the helper; Playwright MCP browser passes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| v9 transformer ratio | V PRIMÁRIO 13,8 kV, V SECUNDÁRIO 380 V | VAL CALCULADO `62,90` (13800·√3/380 = 62,9008; toFixed(2) as today). Capture 62,8 within ±0,5 %, 36,3 out; `condicao` follows (PR #156 rule) |
| v8 transformer ratio | same | `36,32` (U1/U2), unchanged |
| v9 TP ratio | 13.800 V / 220 V | `62,73` (U1/U2), unchanged; TC plate ratio unchanged |
| plate fallback | V SECUNDÁRIO empty, plate `tensao_nominal_bt` stored `{raw:'380/220', unit:'V', state:'measured'}` (or raw `'380 V'`) | secundário fallback 380 (first number), shown as the nameplate placeholder; `'220/127'` gives 220; a non-numeric raw gives null as today |
| v9 dry TC/TP/transformer | subtype epoxi or a_seco | `na_defaults` = 7 oil items; chip "Marcar 7 itens de óleo como NA" (text from `oilNaChipText(count)`) |
| v9 oil rule crossing | TIPO DE ISOLAÇÃO to/from ÓLEO | marks/clears 7 items |
| v9 TC plate reading returns `potencia_nominal` | fake or real structuring output | dropped (`unknown_key`, `reading/build.ts` line 65 already does this); pin it with a v9 TC test and a v8 TC test that still suggests it |
| learned NC phrases of `indicador_nivel_de_oleo` | registry rows exist | not offered on a v9 sheet (no such item), kept and offered on v8 sheets; nothing deleted |
| v9 local | Verificações do local | 21 items, the two new ones items 20 and 21 in Ambiente; progress counts 21; v4..v8 keep 19 |
| company template with a dry (epoxi/a_seco) transformer whose `na_defaults` hold `indicador_nivel_de_oleo` | server `templateSeedUpgrade` | fails v9 validation and stays on v8 (Story 14.3 rule "only seed_version moves" kept). The standard template has no dry subtype (`seed/template.ts` `SUBTYPE_OF`) and moves. Record as open question + `deferred-work.md` entry |

</intent-contract>

## Code Map

- `packages/domain/src/seed/v8.ts` -- derivation pattern to copy (structuredClone, per-block functions, header comment, `CABINE_PRIMARIA_V8`).
- `packages/domain/src/seed/v1.ts` 88-103 (`instrumentTransformerFields`, `TC_FIELDS`), 254-345 (`TRANSFORMADORES_CHECKLIST`; item `oleo_isolante_indicador_de_nivel` phrases there: 'nível de óleo abaixo do mínimo', 'óleo com coloração escura', 'indicador de nível ilegível'; the Disjuntor MT's item of the same key uses `OLEO_NIVEL_PHRASES`, leave it), 445-500 (ratio tables). Block keys `tp`, `tc`, `transformador_forca`.
- `packages/domain/src/seed/v6.ts` 30-62 -- `transformerOilItems` derives oil items from the epoxi subtype; v9 recomputes `oil_rule.items` from its own (filtered) na_defaults, so 7.
- `packages/domain/src/seed/v4.ts` -- `site(...)` helper and `SITE_CHECKLIST_V4` groups; Ambiente is the last group (`key: 'ambiente'`).
- `packages/domain/src/schemas/block-config.ts` 195-231 -- `SITE_ITEM_KEYS` closed enum (append-only): append `grades_e_portas_estado_e_fixacao`, `pintura_e_corrosao`. This is the contract reason (a v24 bundle refuses `location/{id}/checklist/<new key>/...`).
- `packages/domain/src/seed/schema.ts` 106-126 -- `tableDefSchema`: add `ratio_factor: z.enum(['sqrt3']).optional()` with a doc comment (Story 15.6, seed v9).
- `packages/domain/src/seed/definitions.ts` 46, 96-105 -- `SEED_VERSION`, `SEED_VERSIONS` (append v9).
- `packages/domain/src/contract/version.ts` ~195-210, ~320-330 -- add the `25` paragraphs to both doc comments (seed v9, two site keys, the ratio factor) and bump both constants.
- `packages/domain/src/seed/seed.test.ts` 824-864 (v4 test asserts `SITE_ITEM_KEYS` length 19: change to compare v4's items with the first 19 keys), 1605-1650 (v8 block: `SEED_VERSION` 'v8' assertion moves to a new v9 block).
- `packages/domain/src/relatorio/reading-evaluation.ts` 148-262 -- `evaluateTable`; `value = primary / secondary` becomes `× Math.SQRT3` (use `Math.sqrt(3)`) when `table.ratio_factor === 'sqrt3'`. Expose on `EvaluatedTable` (`reading-cells.ts` line ~100) a `formulaHelper: string | null`, the kernel's text `'Calculado: U1 · √3 / U2'` (authored) when the factor is set, else null.
- `packages/domain/src/relatorio/reading-cells.ts` 240-285 -- `nameplateNumber` requires `DECIMAL`; the ratio fallback (`nameplateRatioInput`, BT side) gains a first-number read of a measured raw like `'380/220'` / `'380 V'` (leading number before `/`, space or unit; `parseDecimalPtBr` then `canonicalDecimal`). Keep `nameplateNumber` itself strict if other callers rely on it.
- `packages/domain/src/relatorio/dry-insulation.ts`, `oil-rule.ts` -- already definition-driven; only tests change (v9 counts read 7).
- `packages/domain/src/print/section-9.ts` 344-400 -- nameplate pairs and checklist rows are definition-driven; add v9 cases to `section-9.test.ts` (TC 11 fields, last row padded; transformer checklist 14 rows; site table 21 rows; ratio VAL CALCULADO for the three tables on v8 and v9).
- `packages/domain/src/reading/build.ts` 65 -- unknown keys dropped; pin with v9 TC.
- `packages/domain/src/templates/from-relatorio.ts` 89 -- `templateSeedUpgrade` (behavior unchanged; add a test pinning the dry-template case).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` ~362-470 -- render `table.formulaHelper` once as `<p className="helper">` after the `.mt-scroll` table and the cards block (visible at every width). `.helper` exists in `components.css` line 80.
- `apps/api/src/scripts/make-plate-fixtures.ts` 121-135 -- drop the TC `potencia_nominal` row; regenerate ONLY tc (`... make-plate-fixtures.ts tc` in the tools container), delete the old `fixtures/0b5dce48....json`, update the sha in `apps/api/src/jobs/reading/kinds/plate.ts` line 69, and the README if it lists the sha. The generator reads `SEED_VERSION` labels.
- `docs/nc-chip-phrases.md` 88-108 -- the shared transformer list: dated v9 note (item 5 dropped, item 13 gains 'indicador de nível danificado'), plus a site-items note with the two new items and their phrases.
- E2E: `e2e/ficha.spec.ts` 630-668 (`@p1 UX-F42` transformer ratio: becomes v9 values: 13,8 / 380 gives `62,90`; 62,8 within, 36,3 out → INSATISFATÓRIO, back to 62,8 → SATISFATÓRIO; assert the helper text), `e2e/verificacoes-local.spec.ts` and `.durability.spec.ts`, `e2e/oil-dry.spec.ts`, `e2e/oil-dry.durability.spec.ts`, `e2e/dry-transformer.durability.spec.ts`, `e2e/seed-v7.spec.ts`, `e2e/templates.spec.ts`, `e2e/plate-every-type.spec.ts`, `e2e/plate.spec.ts`, `e2e/review-layout-interaction-2026-10-08.spec.ts` -- grep each for counts 8/19, `indicador_nivel_de_oleo`, `potencia_nominal` on TC, `'v8'`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/schema.ts` -- optional `ratio_factor` -- 15.6 seed field.
- `packages/domain/src/schemas/block-config.ts` -- append the two site keys (doc comment: seed v9, contract 25) -- closed list.
- `packages/domain/src/seed/v9.ts` -- new: from v8, (a) on `tp`, `tc`, `transformador_forca` remove checklist item `indicador_nivel_de_oleo`, set item `oleo_isolante_indicador_de_nivel` phrases to its three plus `'indicador de nível danificado'` (4, the schema max), filter the epoxi/a_seco `na_defaults` to drop the key, recompute `oil_rule.items` from the filtered dry defaults in checklist order; (b) on `tc` remove nameplate field `potencia_nominal`; (c) append to the Ambiente group `site('grades_e_portas_estado_e_fixacao', 'Grades e portas: estado e fixação', ['Grade ou porta danificada', 'Grade ou porta solta ou mal fixada', 'Dobradiças, trincos ou fechos corroídos'])` and `site('pintura_e_corrosao', 'Pintura e corrosão', ['Pintura descascada ou desgastada', 'Pontos de corrosão em estruturas metálicas', 'Corrosão em suportes ou ferragens'])` with an `// authored:` note (pending Bruno); (d) `TRANSFORMADOR_RATIO` table of `transformador_forca` gains `ratio_factor: 'sqrt3'`. Header comment like v8's.
- `packages/domain/src/seed/definitions.ts`, `contract/version.ts` -- v9 current, contract 25/25.
- `packages/domain/src/seed/seed.test.ts` -- `V8_HASH` pinned; v9 block: is current; v9 minus its differences equals v8 exactly (strip: re-add item 5 at index 4 with its v8 object, restore item 13 phrases, restore na_defaults and oil_rule items, re-insert TC `potencia_nominal` at its v8 index, drop the two site items, delete `ratio_factor`; then `JSON.stringify` equal); `ratio_factor` present only on v9 `transformador_forca`; v1..v8 hashes; site items numbered 1..21 on v9 with 20/21 the new keys.
- `packages/domain/src/relatorio/reading-evaluation.ts`, `reading-cells.ts` -- factor, `formulaHelper`, first-number plate fallback -- 15.6.
- `packages/domain/src/relatorio/*.test.ts` (`readings.test.ts`, reading-cells tests, `dry-insulation.test.ts`, `oil-rule.test.ts`, NC chip phrases test for the dropped item, `reading/build.test.ts`, `print/section-9.test.ts`, `templates/*.test.ts`) -- the matrix rows above, with boundary values (exactly ±0,5 %: 62,90·1,005 and ·0,995 within; just beyond out).
- `apps/web/src/surfaces/ficha/ensaios-section.tsx` (+ its component test if one covers the ratio table) -- helper.
- `apps/api` -- TC plate fixture regenerated; any api test naming the TC `potencia_nominal` updated; a `test:api` integration test through the sync route that a v25 push of `location/{id}/checklist/pintura_e_corrosao/...` on a v9 relatório is accepted (and, if the route checks the seed version's site list, refused on a v8 relatório).
- E2E -- one new `@p0` spec `e2e/seed-v9.spec.ts`: relatório on v9 from the standard template (the existing helpers create on `SEED_VERSION`); transformer sheet counts 14 checklist rows (count from the kernel) and, with TIPO DE ISOLAÇÃO Á SECO / EPÓXI, the chip "Marcar 7 itens de óleo como NA" (text from `oilNaChipText`); TC sheet has no POTÊNCIA NOMINAL; local answers items 20 and 21 (assert the committed outbox ops); a preview's DOCX shows them in VERIFICAÇÕES DO LOCAL (follow the existing preview/DOCX helper used by `verificacoes-local.spec.ts`). Update the specs listed in the Code Map; collect the exact list of spec files touched or asserting the seed version for the gate.
- `docs/nc-chip-phrases.md`, `docs/kbs/architecture/kernel-and-seed.md` (dated note), `docs/kbs/log.md` (dated line), `_bmad-output/implementation-artifacts/deferred-work.md` (the dry-template upgrade row, owner: coordinator / Bruno answer 1) -- docs.

**Acceptance Criteria:**
- Given seed v9, when the kernel tests run, then v9 differs from v8 by exactly the 15.3 and 15.6 differences, `SEED_VERSION` is v9, contract 25 minimum 25, and v1..v8 hash as shipped.
- Given a v9 transformer, TP or TC sheet, when it renders and prints, then 14 numbered checklist rows, the dry chip reads "Marcar 7 itens de óleo como NA", the oil rule marks/clears 7, the TC shows and prints 11 nameplate fields (last printed row padded); a v8 sheet is as today and the goldens match.
- Given a v9 transformer ratio row with 13,8 kV and 380 V, when it evaluates, then VAL CALCULADO is 62,90, a helper "Calculado: U1 · √3 / U2" shows under the table on screen (not in the print), and the F42 e2e asserts SATISFATÓRIO with 62,8.
- Given a v9 local, when Verificações do local opens and the relatório previews, then items 20 and 21 show in Ambiente, progress counts 21, and the DOCX table holds them; a v4..v8 relatório keeps 19.

## Review Triage Log

### 2026-10-22 — Review pass
- layers: Edge Case Hunter, Verification Gap Reviewer (Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them)
- verdicts: 10 findings — high 0, medium 0, low 8, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` BT raw carrying its own unit ("0,38 kV") stored with unit V reads 0,38 V — a number nameplate field stores only a canonical decimal through the UI (`ficha.ts numberFieldValue`) and the reading path converts units before storing; only hand-built data reaches it, and the fix adds unit parsing.
  - `[low]` `[patch]` a leading sign is accepted, "-380/220" shows a -380 placeholder — patched: LEADING_NUMBER takes no sign; test added.
  - `[low]` `[reject]` AT side stays strict — the stories ask only for the BT "380/220" reading; an AT plate is one decimal (kV field).
  - `[low]` `[reject]` the first-number fallback is not seed-gated (v1..v8 and TP gain a fallback) — the spec's Design Notes decide it on purpose; listed as an open question in the PR; goldens unaffected.
  - `[low]` `[reject]` "a v8 sheet is as today" claim vs the same fallback — same root cause as above, intended and disclosed.
  - `[false]` `[reject]` itemLabelOf newest-first relies on SEED_VERSIONS insertion order — SEED_VERSIONS is append-only by contract (definitions.ts comment, seed.test.ts pins the key order v1..v9), so the order is the version order.
  - `[low]` `[patch]` fallback only tested on a v9 transformer — patched: v8 transformer and v9 TP cases added to readings.test.ts.
  - `[low]` `[defer]` helper not asserted below 768 px — deferred (frontmatter).
  - `[false]` `[reject]` a typed "380/220" in V SECUNDÁRIO computes nothing while the plate's computes — a typed cell is validated by the cell's own decimal rule and shows invalid (pre-existing, PR #156); the plate is a fallback reading and is not a cell value.
  - `[low]` `[patch]` stray blank line in verificacoes-surface.test.tsx imports — removed.

## Design Notes

The story text says 62,89; 13800·√3/380 = 62,9008, which the kernel formats `62,90` (E12-A5: the formula is the decision, the number a slip). Report it in the PR as an open question for the coordinator to amend.

The first-number BT fallback is not seed-gated (it is a parsing rule of the plate value, and a v1..v8 empty secundário with a "380/220" plate now gets U1/U2 = 36,32 instead of no value). Goldens are unaffected because every Porto Seguro ratio row types its secundário. List it in the PR under open questions.

## Verification

All commands from the worktree root in the tools container: `podman compose --profile tools run --rm --user root tools pnpm <cmd>`, output redirected to `.scratch-e15b/*.log`, only the tail read.
- `pnpm lint`, `pnpm static`, `pnpm test:unit`, `pnpm test:api` -- green.
- Playwright only under the host lock (`nohup lockf -t 20000 /tmp/fasor-verify.lock sh -c '...' > /tmp/verify-e15b.log 2>&1 &`, then poll); the implementer may run at most the new spec and the ratio test with `--grep`; the orchestrator runs the full touched list.
