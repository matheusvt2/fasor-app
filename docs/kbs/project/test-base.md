---
type: Source Map
title: Bruno's test base (Base de Ensaios MT, rev03)
description: Map of Bruno's spreadsheet of tests, field characteristics and acceptance criteria per medium-voltage equipment type, and how each part relates to the product. Open before planning tests, criteria, equipment types or field help.
tags: [domain, seed, criteria, equipment-types, source]
timestamp: 2026-11-08T00:00:00Z
sources: [docs/context/Fasor_Base_Ensaios_MT_rev03.xlsx, docs/context/Fasor_Base_Ensaios_MT_rev08.xlsx, docs/context/Fasor_Base_Ensaios_MT_rev08.json]
---
# Bruno's test base (rev03)

**What it is.** Bruno's spreadsheet, dated 2026-11-06 and received 2026-11-07, is at `docs/context/Fasor_Base_Ensaios_MT_rev03.xlsx`. That path is gitignored and missing on other machines. The file lists, for each medium-voltage equipment type:

- the tests;
- when each test applies;
- the method and instrument;
- the test voltage;
- the measuring points;
- the criteria for Aprovado, Aprovado com restrições and Reprovado;
- the standard behind each criterion;
- the default recommendation when a test fails.

Bruno meant it as the source the app reads. The technician fills in the equipment's characteristics, and the app picks the tests and judges them. Its LEIA-ME says a JSON with the same content goes with it. ~~That JSON has not been received yet (2026-11-07).~~

*(2026-11-08: Bruno sent revision rev08, dated 2026-11-07 inside the file, as `docs/context/Fasor_Base_Ensaios_MT_rev08.xlsx` plus the promised `docs/context/Fasor_Base_Ensaios_MT_rev08.json`, also gitignored. The JSON carries the same 44 tests as the workbook: same IDs, with the per-row `regra` objects and the reference tables in machine-readable form. rev08 is now the current base; rev03 is kept beside it for comparison. In short, rev08:*
- *closes every pending point: the Pendências sheet is empty and each decision is folded into its test row;*
- *adds two tests (TR-SE-07, PR-04) and two reference tables (`FP_OLEO_NETA_100_3`, `INSTRUMENTOS_FASOR`, the reading limit of Fasor's insulation tester);*
- *gives every insulation rule a `limite_instrumento` object with a standard observation;*
- *makes a new arrester field a prerequisite of PR-02;*
- *adds capacitor tolerance fields and more TC accuracy classes;*
- *cites ANSI/NETA MTS-2023 throughout.*

*The mapping of rev08 against the 37 questions sent to Bruno on 2026-11-07, with what is still open, is `docs/context/epic-23/respostas-bruno-rev08-2026-11-08.md` (gitignored, pt-BR).)*

**Policy.** The base is client material, so never copy its values, procedures or recommendations into tracked files: cite the path and the row ID. The product's seed takes a value only through a story, as FO.SERV-03 content did through `prd-fasor-2026-09-19/addendum.md` § 9.

## Sheets

| Sheet | Shape | Product counterpart |
| --- | --- | --- |
| LEIA-ME | Purpose, validation-status legend, five general software rules | The rules map to [kernel-and-seed](/architecture/kernel-and-seed.md) (see "Rules" below). |
| Ensaios | 42 rows, one per test *(2026-11-08, rev08: 44)*. 19 columns: ID, equipment, test, mandatory, "Aplica-se quando", objective, instrument, voltage or current, points, procedure, quantity, unit, three verdict columns, standard, validation status, recommendation, and a JSON "Regra (software)". | A seed `TestDef` plus `seed/criteria.ts`. The procedure and recommendation have no counterpart yet. |
| Características | Common fields plus per-type fields, each with key, app label, kind (text, number, list, yes/no), options or unit, mandatory flag and what it feeds. | Nameplate `FieldDef`s of a definition. Some fields drive test choice or criteria. |
| Tabelas de referência | Insulation minimums by voltage (equipment and windings, oil vs dry), polarization index classes, cable VLF voltages, thermography ΔT actions, breaker pole simultaneity, temperature-correction and TTR formulas. | Partly in the kernel: the TTR group formula is `relatorio/vector-group.ts`. The rest is not built. |
| Normas | 22 standards with edition and status. | None. Citations exist only in the definition sources. |
| Pendências | 10 open points (P01 to P14) that need Fasor's decision before the base backs relatórios with ART. *(2026-11-08, rev08: empty; a "Decisão do Bruno" column was added and every decision now lives in its test row.)* | Open decisions; route them to Matheus and Bruno. |

**Equipment IDs in the base:**

| ID | Equipment |
| --- | --- |
| TR-OL | oil transformer |
| TR-SE | dry transformer |
| DJ | breaker |
| SC | switch |
| TC | current transformer |
| TP | potential transformer |
| PR | arrester |
| CB | MV cable |
| CM | switchgear and busbar |
| AT | ground grid |
| CP | capacitor bank |
| GE | thermography, applying to all equipment |

CM, AT, CP and GE have no seeded type today. The others map to the seeded eight. The transformer splits into oil and dry, the way the oil rule does.

**Validation status per row:**

- CONFIRMADO: checked against a public source.
- CONFERIR NA NORMA: check the standard's text before use.
- FABRICANTE: the criterion needs the manufacturer's value.
- PADRÃO FASOR: Fasor's own adopted value.

## Rules (LEIA-ME) against the product (2026-11-07)

- **Manufacturer value prevails over table values.** Not built: criteria are seeded constants.
- **A reading over the instrument limit is "> limite" and approved, with a standard observation.** Built in Story 22.10, except the standard observation.
- **Automatic temperature correction.** Not built.
- **Every Reprovado appears in the ficha, the points of attention and the relatório's conclusion.** Built in Stories 22.4 to 22.6.
- **Never fill a measured value automatically.** Consistent with the product: readings are Suggestions the technician confirms.

## Where the base and Epic 22 differ

The detail is in `_bmad-output/implementation-artifacts/epic-22-context.md` § "Bruno's test base against Epic 22". In short, the base:

- judges the protection accuracy classes and the TP's protection classes differently from Story 22.9's reading *(2026-11-07, taken by fix batch e22g: TC 5P ± 1 %, 10P ± 3 %; TP 3P ± 3 %, 6P ± 6 %)*;
- picks the insulation test voltage by winding voltage *(2026-11-07, taken by e22g for the transformer's high-voltage rows: 2,5 kV from 601 V to 5000 V, 5 kV above)*;
- uses insulation minimums by voltage and medium where the product keeps one fixed minimum;
- names the transformer's insulating liquid where the product has TIPO DO ÓLEO A or B;
- uses the previous visit's value to judge Aprovado com restrições. Story 22.12 only shows that value.

The base's "Aplica-se quando" column, its procedure text and its recommendations are candidate scope for after wave C. Company equipment types (Stories 14.6 to 14.8) are the natural carrier.

## Epic 23 (planned 2026-11-08)

Matheus decided groups A to N on 2026-11-08 (`docs/context/epic-23/decisoes-epic-23.md` § 5, gitignored). The base becomes the product's criteria on seed v13, for new relatórios only, with every older relatório printing byte-identical. The pieces:

- versioned NETA tables with edition and status per row;
- the optional manufacturer's value, which absorbs Story 14.13;
- temperature correction;
- three levels per reading, with the previous visit judging;
- the instrument-limit rule;
- applicability from the nameplate, with an override;
- "Como ensaiar" on screen only;
- decision I's wave 1 tests;
- a Malha de aterramento type.

The stories are `epics.md` § Epic 23 (23.1 to 23.21). The batch plan is `_bmad-output/implementation-artifacts/epic-23-context.md`, the plan and its open items for Bruno (B-1 to B-11) and Matheus (M-1 to M-6) are in `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-08.md`, and the overrides are the `source-deltas.md` rows of 2026-11-08.

The base's procedure and recommendation texts enter the product only after Matheus's decision M-1, on a waiver like R-023 or through a private load path (Story 23.12). Values reach the seed only through the story that names their row.

## Story 23.12 as built: the private import (2026-11-09, batch e23x)

Matheus decided M-1 (b): the base's procedure and recommendation texts never enter git. The office loads the base's JSON once, through the app, as that company's data.

- **Where.** Modelos > Tipos de equipamento, the action "Importar base de ensaios" in the section head. The file is read on the device; the kernel planner `planTestBaseImport` (`packages/domain/src/types/test-base-import.ts`) shows a preview, and "Importar" writes one batch of the two existing company-scope creates (`equipment_type/{id}`, `equipment_type_version/{id}`). No route, no op family, no contract.
- **What it makes.** One company type copy ("Duplicar" of the current seed's type) per base equipment and seeded type, named "⟨seeded label⟩ (⟨equipment ID⟩)", each mapped test carrying its row's `help` and `recommendation`, published as version 1 (a draft only when the copy has validation issues). The copies stay editable in the type editor. The library's seeded types carry no text: the texts show only on sheets of the imported types.
- **Row map** (`TEST_BASE_ROW_TESTS`): `*-02` rows of TR-OL, TR-SE, DJ, SC, TC, TP, PR, CB to `isolacao`; TR-OL-04, TR-SE-04, TC-03, TP-03 to `relacao_transformacao`; DJ-03, SC-03 to `resistencia_contato`; TR-OL-05, TR-SE-05 to `resistencia_enrolamento`; TR-OL-07, DJ-07 to `coleta_oleo`; SC-04 to `resistencia_fusiveis`; AT-01, AT-02 to `resistencia_malha`, `continuidade_malha`; GE-01 (TODOS) to `termografia` on every copy whose definition has it. Equipment map `TEST_BASE_EQUIPMENT_TYPES` (CB makes two copies, entrada and saída; TR-OL and TR-SE two transformer copies). A row attaches only where its test exists in the seed's definition.
- **Texts.** Kept as the file has them; an empty, blank or dash-only value is left out; the criterion is composed "Aprovado: …", "Com restrições: …", "Reprovado: …", one per line; no NR-10 column. A text over 1000 characters is never cut: the heading is left out and the row listed as refused.
- **Idempotent.** A copy whose seeded source and name the company already holds (not removed) is "já importado"; a discarded or renamed copy is planned again. Later edits are never overwritten.
- **How to import.** Locally: sign in as the office user, Modelos, "Importar base de ensaios", choose `docs/context/Fasor_Base_Ensaios_MT_rev08.json` (gitignored). In production: the same action, by the company's office user, with the file Bruno sends. Tests use the synthetic `packages/domain/fixtures/test-base/base-ensaios-sintetica.json` (rev08's shape and IDs, invented text).

## Fix batch e23z (2026-11-10, contract 40)

- The IP rows (TR-OL-03, TR-SE-03) attach to the insulation test as its IP row (`TEST_BASE_INDEX_ROWS`), filling `index_recommendation` only.
- A copy made by "Duplicar" or by the import carries `base_block_type` and prints in its base type's group.
- A Reprovado chosen by hand starts with the in-force tests' recommendations (`reprovadoRecommendations` in `points/derived.ts`).
- Narrowings and Bruno's open readings: `deferred-work.md` § "Epic 23 fix batch e23z".
