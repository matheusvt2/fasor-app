# Reconcile — FO.SERV-03

Input: `imports/extract-fo-serv-03.md` (+ `imports/fichas-fo-serv-03/image83|100|120.png`). Spines: `DESIGN.md`, `EXPERIENCE.md`. Question: can an architect/developer (a) let the user compose this report from blocks and (b) generate a DOCX/PDF matching FO.SERV-03 from the spines alone.

## Captured

- Cover, index, sections 1–11, header/footer — EXPERIENCE § Capture-to-Document Transformation (table, one row per part); Laudo setup surface owns cover/§1/§3 variables.
- 8 sheet models with nameplate field counts, checklist counts, test sub-blocks and row sets — EXPERIENCE § Block Model (8-row table); sub-blocks defined (test, checklist item, nameplate group, observation box).
- Instrument header (instrument, type, serial, RBC, test voltage/current, aceitável) — EXPERIENCE § Registries › Instruments; § Component Patterns › Instrument picker / Measurement table.
- Observations, conclusion (two exclusive pairs) — Conclusion control, Observation field (both spines).
- SE characteristics + test environment as cabine/visit attributes inherited by sheets, printed on the first sheet of each cabine — § Block Model › Location; § Transformation row 9.
- Photo grid 2-per-row, "Imagem NN:" auto-numbering frozen at export, caption pattern with three selectors — § Transformation row 7; Caption composer; DESIGN Photo tile.
- Points of attention with photo references, recurring items as quick chips, not-tested equipment auto-listed — § Transformation row 8; Point of attention card; Flow 5.
- Signature block (name, Eng. Eletricista, CREA, ART), signature image out of MVP — § Transformation row 10; Open Questions.
- Calibration certificates of referenced instruments — § Transformation row 11; Registries.
- Defects to fix: transformer conclusion restored, ">40", unit mixing, free-text identification, duplicate photo numbers, absent not-tested equipment, no executor/date — § Transformation closing paragraph; § Inspiration & Anti-patterns; DESIGN § Typography (no ALL-CAPS truncation), Not-tested chip, Sheet header.
- Derived rules: COM RESTRIÇÕES ⇒ observation; NC ⇒ observation (+ photo recommended); calculated absorção/polarização/valor calculado/condição; out-of-limit amber suggestion, never a verdict — Conclusion control, Tri-state control, Measurement table, Measurement field; DESIGN § Colors.
- Field vs office split — § Foundation "Two contexts, one app"; § IA (office vs field surfaces); § Responsive & Platform.
- Capture by column vs print by type — § Capture-to-Document Transformation (tree by location, regrouping at generation, rule owned by Template).

## Dropped or weakened

1. **Test-table column headers not specified.** Input §3 (T7–T12) gives exact header groups: PONTO DE ENSAIO/CONEXÃO {LINHA, TERRA, GUARD} · VALORES {30 SEGUNDOS, 1 MINUTO, ESTAB./10MIN} · QUALIDADE ISOLAÇÃO {ABSORÇÃO, POLARIZAÇÃO}; the open/closed variant has a single VALORES column; TTR tables have CÁLCULO TEÓRICO / LIGAÇÕES / CONDIÇÕES groups. EXPERIENCE § Block Model lists row sets only ("Isolação (Fase A/B/C/Reserva × Massa)"). Severity: **high** for (b). Fix: add to § Block Model, after the 8-row table: "Column headers and row sets per test sub-block are those of `imports/extract-fo-serv-03.md` §3 T3–T13, which is the print spec for section 9."
2. **Checklist item names and distinct lists.** Input §2 Modelos 1–8 give five distinct lists (cables ≠ para-raio, both 5; seccionadora 14; disjuntor 15 ≠ trafo/TP/TC 15). Spine shows counts only and lets "5 items" read as one list. Severity: **medium**. Fix: same pointer, plus in § Block Model note "five distinct item lists (extraction §2, Modelos 1–8); the seed template carries them verbatim."
3. **Nameplate field names.** Input §2 lists the 6/9/12 fields per model (incl. units, e.g. TAP ATUAL kV, RELAÇÃO "500/5"). Spine: "9 fields", "12 fields (incl. AJ. RELÉ 50/51)". Severity: **medium**. Fix: same pointer in § Block Model › Nameplate sub-block column.
4. **Unit at print time.** Input §6.5: unit varies MΩ/GΩ by model and "2T" is typed in a GΩ column. Spine fixes capture (unit control per cell) but § Transformation row 9 does not say how a mixed-unit column prints. Severity: **medium**. Fix: add to row 9: "each value prints with its own unit; the column header reads 'VALORES' without a unit when cells differ."
5. **Acceptance value carries an operator.** Input: ">400 MΩ", "<250 µΩ", "0,5 %". EXPERIENCE § Registries › Instruments has "default acceptance value" with no direction. Severity: **medium** (contact resistance would be compared the wrong way). Fix: "acceptance = operator (>, <, ±) + value + unit; the Measurement field compares in that direction."
6. **Per-row observation only on NC.** Input Bloco B has an OBSERVAÇÕES cell on every row. EXPERIENCE › Checklist row: "When NC is selected, the row expands to show the Observation field." Severity: **low**. Fix: add "an optional observation is reachable on any row via long-press/overflow; required only on NC."
7. **Printed sheet title role.** Input notes "CHAVE SECCIONADORA DE ENTRADA" used for all disconnectors; § Block Model has "Para-raio (entrada / saída)" but no role for seccionadora/cabos. Severity: **low**. Fix: "printed title = type label + role (entrada/saída/alimentação TRn) + TAG."
8. **Fixed-text sources and page furniture.** Sections 2/4/5/6 "Fixed text" and §10 bullets are transcribed in input §4; footer "Página X de Y", A4 1,27 cm margins, "Revisão 00" are in input §1. Spine names none. Severity: **low**. Fix: in § Transformation header row add "content per extraction §1 and §4; export revision number is distinct from the form's 'Revisão 00'."

## Qualitative ideas from the input not reflected

- **TAP Nº ↔ TAP ATUAL consistency check** (§6.3) — not adopted, not listed.
- **Plausibility validation of nameplate values** (§6.5, "10 kVA" on a 13,8 kV cubicle) — no range hints anywhere.
- **Client acknowledgement/acceptance signature** (§5: "Sem assinatura do cliente") — neither adopted nor an Open Question.
- **Relé de proteção** has a procedure in section 6 but no sheet — a possible 9th block type is not raised.
- **Visit-level climate flag** driving the rain/humidity quick observation (§6.2 item 6) — spine has the chip, not the flag.
- **Seed lists** for Atividade/Local comboboxes (§2, section 7) — chips are an Open Question, activity/location seeds are not mentioned.

## Verdict

The spines carry every structural fact needed to compose the laudo from blocks and every rule the input derived; what an architect cannot rebuild from them alone is the exact print geometry of section 9 (column headers, item names, nameplate labels), which lives only in the import. One pointer sentence in § Block Model plus the operator-on-acceptance and print-unit rules close the gap; nothing else needs redesign.
