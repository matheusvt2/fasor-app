---
type: Source Map
title: Bruno's test base (Base de Ensaios MT, rev03)
description: Map of Bruno's spreadsheet of tests, field characteristics and acceptance criteria per medium-voltage equipment type, and how each part relates to the product. Open before planning tests, criteria, equipment types or field help.
tags: [domain, seed, criteria, equipment-types, source]
timestamp: 2026-11-07T00:00:00Z
sources: [docs/context/Fasor_Base_Ensaios_MT_rev03.xlsx]
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

Bruno meant it as the source the app reads. The technician fills in the equipment's characteristics, and the app picks the tests and judges them. Its LEIA-ME says a JSON with the same content goes with it. That JSON has not been received yet (2026-11-07).

**Policy.** The base is client material, so never copy its values, procedures or recommendations into tracked files: cite the path and the row ID. The product's seed takes a value only through a story, as FO.SERV-03 content did through `prd-fasor-2026-09-19/addendum.md` § 9.

## Sheets

| Sheet | Shape | Product counterpart |
| --- | --- | --- |
| LEIA-ME | Purpose, validation-status legend, five general software rules | The rules map to [kernel-and-seed](/architecture/kernel-and-seed.md) (see "Rules" below). |
| Ensaios | 42 rows, one per test. 19 columns: ID, equipment, test, mandatory, "Aplica-se quando", objective, instrument, voltage or current, points, procedure, quantity, unit, three verdict columns, standard, validation status, recommendation, and a JSON "Regra (software)". | A seed `TestDef` plus `seed/criteria.ts`. The procedure and recommendation have no counterpart yet. |
| Características | Common fields plus per-type fields, each with key, app label, kind (text, number, list, yes/no), options or unit, mandatory flag and what it feeds. | Nameplate `FieldDef`s of a definition. Some fields drive test choice or criteria. |
| Tabelas de referência | Insulation minimums by voltage (equipment and windings, oil vs dry), polarization index classes, cable VLF voltages, thermography ΔT actions, breaker pole simultaneity, temperature-correction and TTR formulas. | Partly in the kernel: the TTR group formula is `relatorio/vector-group.ts`. The rest is not built. |
| Normas | 22 standards with edition and status. | None. Citations exist only in the definition sources. |
| Pendências | 10 open points (P01 to P14) that need Fasor's decision before the base backs relatórios with ART. | Open decisions; route them to Matheus and Bruno. |

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
