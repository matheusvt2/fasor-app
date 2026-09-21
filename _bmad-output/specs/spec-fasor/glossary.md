# Glossary

Fixed vocabulary for every downstream artifact. Portuguese terms are the domain's own and appear verbatim in the UI and the generated document. The PRD glossary predates the vocabulary decision of 2026-09-19 and says "Laudo"; this file is the corrected reference.

**Product and structure**

- **Releng** — working title of the product; the UI shows the placeholder **PRODUTO** until a name is confirmed. **fasor** is the internal codename and the design partner's company name (Fasor Engenharia); it never surfaces in a user-visible string, document or file name.
- **Relatório** — one visit's technical report: an instance of a Template inside a Project. Owns filled data, photos, points of attention and export revisions. The unit of delivery and of billing. Code, routes and paths use `relatorio`. "Laudo" is not used (the received form calls itself a relatório eight times; NR-10 names the required document a relatório).
- **Project** — one client and site. Owns many relatórios and the site's Equipment rows. Container only; carries no report data. Site is collapsed into Project in the MVP.
- **Template** — a reusable ordered composition of Blocks with quantities, sub-block defaults, subtypes and the **location skeleton** (cabines and columns with quantities per column). Not tied to a Project; editing one never touches relatórios created from it. Seeded: "Cabine primária — padrão".
- **Block** — a coarse unit of the relatório: a **Section block** (one FO.SERV-03 section, fixed text with variables) or an **Equipment block** (one sheet, one equipment, one TAG). Addable, removable, restorable, reorderable.
- **Sub-block** — a fine unit inside an Equipment block: one test, one checklist item, the nameplate group, an observation box. Switched off means omitted from print, never printed empty.
- **Location** — `Cabine › Coluna/Cubículo`, a tree node. The **Cabine** (root node) owns substation characteristics, test environment and the *Agrupar por tipo* flag, edited only in the "Da cabine" block on its first sheet.
- **Ficha (equipment sheet)** — the on-screen and printed form for one equipment: nameplate, checklist, tests, observations, conclusion. 94 in the reference job.
- **Equipment block type** — one of the eight MVP types: Cabos de entrada · Para-raio · Chave seccionadora · Disjuntor MT · TP · TC · Cabos de saída/alimentação · Transformador de força. Keys: `cabos_entrada, para_raio, chave_seccionadora, disjuntor_mt, tp, tc, cabos_saida, transformador_forca`.
- **TAG** — the equipment's stable identity, mandatory at block creation, suggested from type plus column ("SEC-C05"), unique within the Project, preserved through renaming.
- **Sumário** — the relatório overview: the document's own table of contents in FO.SERV-03 order (capa, controle do documento, sections 1 to 11), each row showing what is missing and each row an editable object. Section 9 opens into the location tree.
- **Sheet state** — Vazia · Em preenchimento · Concluída · Não ensaiada (with reason).
- **Relatório status** — Rascunho · Em campo · Em revisão · Emitido.

**Capture**

- **C / NC / NA** — conforme, não conforme, não se aplica: the tri-state result of one checklist item plus a free-text observation, required on NC.
- **Measurement table** — a test's value grid in one of four shapes: single-table insulation (rows of phases against massa; captured at 1 minuto, other columns print "-"), open and closed-contact insulation (T1/T2, T3/T4, T5/T6 and phases A/B/C), contact resistance (T1-T2, T3-T4, T5-T6 in µΩ), transformation ratio (theoretical against measured per phase or per TAP, VAL CALCULADO computed, verdict word SATISFATÓRIO).
- **Acceptance criterion** — operator, value, unit, type and source with edition, e.g. `> 400 MΩ`, `< 250 µΩ`, `± 0,5 %`. Belongs to the test sub-block type; seeded with source "aceitável na ficha".
- **Instrument** — a registered test instrument: code (e.g. "2E"), manufacturer, type, serial, calibration certificate, dates, validity, certificate file, default test parameter. Selecting the code copies the whole header onto a sheet.
- **Suggestion** — a value the app proposes and the engineer has not confirmed. Amber with a "Sugerido" pill and, for camera-derived values, the source crop. Never written, counted or printed until confirmed.
- **Verificar** — the trust level below Suggestion: an ungrounded or cross-check-failed guess, shown with its best guess on a dashed amber border, skipped by "Confirmar todos", confirmable only by a tap on that field.
- **Copy / default** — a value taken from the engineer's own earlier entry (last visit, previous cabine, previous row's unit). Written as a plain value with an undo toast, not as a Suggestion.
- **Reading** — one backend pass over a photo with a kind: plate, display, caption, panel, nc_obs. Queued offline, run at first connectivity.
- **Photo** — image plus caption plus capture stamp (date, time, coordinates when enabled), linked to a sheet, checklist row or point. Numbered automatically at generation.
- **Ponto de atenção** — a finding: text with photo tokens, equipment or TAG, recommended corrective action. Prints as a section 8 bullet, as in FO.SERV-03. Priority, deadline and owner are data-model fields with no UI in the MVP.
- **Parecer** — the relatório-level technical opinion with its composed summary. The one blocking pre-issue item.
- **Não ensaiado / Não ensaiada** — present, not tested, with a reason (Impossibilidade de desligamento · Solicitação do cliente · Outro). Prints nameplate and reason band; listed automatically in section 8.
- **Pre-issue list** — every outstanding condition shown before generating; the same kernel check feeds the Sumário rows.
- **Export revision** — the numbered output of one generation: a DOCX and a PDF of identical content. Distinct from the **form revision** ("Revisão 01") that identifies the form itself.
- **Preview** — the same generation with a RASCUNHO watermark and no revision number.

**Domain and regulation**

- **Cabine primária** — medium-voltage primary substation; the MVP's single subject.
- **FO.SERV-03** — Fasor Engenharia's report form: 11 numbered sections; the reference instance runs 124 pages. Received as "Laudo Técnico de Cabine Primária, Revisão 00"; the product prints it as "Relatório Técnico de Cabine Primária" at Revisão 01 with the code unchanged.
- **Ensaio de isolação / de resistência de contato / de relação de transformação** — insulation resistance (megôhmetro, MΩ or GΩ), contact resistance (microhmímetro, µΩ), turns ratio (TTR).
- **NR-10** — Brazil's electrical safety regulation. Current text until 2027-05-31; the text of Portaria MTE 737/2026 from 2027-06-01. Item **10.7.11** (from 2027-06-01) requires a report with an action plan and compliance schedule, today item 10.2.4 g. Item **10.5.1** (six-step de-energization, quoted in section 5) becomes **10.13.1** (seven steps) on that date. Item **10.15.3** (from 2027-06-01) requires documented grounding measurements.
- **PIE** — Prontuário de Instalações Elétricas; the relatório becomes part of the client's PIE and may be read in an audit.
- **PLH** — profissional legalmente habilitado, the professional legally in charge.
- **ART / TRT** — the technical responsibility registration under CREA (engineer) or CRT (technician). The relatório's validity line is bound to it; the product records council and number and does not arbitrate who may sign.
