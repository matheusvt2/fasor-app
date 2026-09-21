# Reconcile — Reference tool "Estudo de Carga e Demanda"

> **Nota de 2026-09-19.** Depois desta revisão o produto trocou "laudo" por "relatório" (decisão registrada no `.memlog.md` e no addendum do brief). Os mocks citados abaixo mudaram de nome: `key-laudo-overview.html` → `key-relatorio-overview.html`, `key-laudo-setup.html` → `key-relatorio-setup.html`. O texto desta revisão é mantido como estava na data.

Inputs: `docs/concorrentes/extract-media-reference-tool.md` (sections 3, 4 and 5: the editor, the generated PDF, the analysis) and `docs/concorrentes/frames-reference-tool/*.jpg`, both taken from Bruno's WhatsApp media on 2026-09-18. The user classified the tool as a reference for the project, not a competitor. Delta contract: `.working/change-signal-reference-tool-2026-09-18.md` (D1–D8). Checked against `DESIGN.md` and `EXPERIENCE.md` v0.6.0 and `.memlog.md`. Applied under the user mandate of the same day: simplicity and ease of use above completeness; no emoji anywhere. The extract carries real third-party names, registrations and CNPJs; none of them entered the spines, only the existing placeholder data (Porto Seguro, Bruno, Eduardo, PRODUTO).

## Captured

- Plano de ação com prioridade P0–P4 e prazo (§4, section 13 of the PDF) → EXPERIENCE › IA › Points of attention; Smart Input › "Priority fills the deadline"; Component Patterns › Point of attention card, Priority pill, Priority picker; Capture-to-Document › 8 (action-plan table after the bullets); Voice and Tone; Accessibility Floor. DESIGN › Components › Priority pill, Priority picker; tokens `components.priority-pill`, `components.priority-picker`; Colors table (P0 red, P1 amber reused, no new color). Simplicity: the priority is one tap and writes the deadline as a suggestion, so no extra field is typed.
- Registro profissional CRT/TRT beside CREA/ART (§4, page 1) → EXPERIENCE › IA › Laudo setup and Account; Component Patterns › Segmented control ("Conselho"), Settings row ("Registro profissional"); Capture-to-Document › 0 Capa, Controle do documento, 10 Conclusão (title and echo line by council); Flow 1 step 5 (prefilled from the profile, one tap). DESIGN › Segmented control row.
- Identidade visual por empresa: logo, fundo de capa, marca d'água, cabeçalho/rodapé (§3 top bar, §4 every page) → EXPERIENCE › IA › Registries (Empresa tab, first), Surface closure row "Document identity → Registries › Empresa → Flow 5 step 0", Registries › Empresa row, Clients gain CNPJ, Component Patterns › Brand preview, Toggle ("Marca d'água"), Tabs; Capture-to-Document › Header / footer and 0 Capa; State Patterns › Brand not set; Flow 5 step 0. DESIGN › Brand & Style (edited only in Registries › Empresa, the app chrome stays PRODUTO), Do's and Don'ts row, Components › Brand preview, Shortcut card sub-line; token `components.brand-preview`. Simplicity: only razão social and logo are required; everything else optional.
- Tabela "Controle do documento" (§4, page 1) → EXPERIENCE › Capture-to-Document (new printed part between 0 Capa and Índice), Export dialog summary, Component Patterns › Document control table, IA › Export, Flow 5 step 4 and 6. DESIGN › Components › Document control table; token `components.doc-control`. Every row is composed from data already entered; nothing typed. It also closes the open question on printing the export revision: yes, in this table only (decision, memlog).
- Texto técnico gerado a partir dos dados, com a fórmula mostrada (§3 item 8, §4 section 9) → EXPERIENCE › Smart Input › "Generated conclusion text" (device-side template, not an AI call, never a verdict, optional at sheet level), Component Patterns › Generated text field and Criteria line, Capture-to-Document › 9 (Conclusão row) and 10 (Parecer box), Section band ("Conclusão e parecer"), Export dialog and State Patterns ("Parecer não preenchido", the one blocking item), Flow 2 step 9 (one confirming tap; budget case 19 taps, still inside ≤ 20), Flow 5 step 4, Accessibility Floor (criteria line readable by screen readers), Voice and Tone. DESIGN › Components › Generated text field, Criteria line, Parecer box; tokens `components.generated-text-field`, `components.criteria-line`, `components.parecer-box`.
- Parecer em caixa destacada (§4, sections 3 and 15) → the Parecer box above; the verdict (Apto · Apto com restrições · Não apto) is the engineer's pick, Não apto is never suggested (standing decision on auto-verdicts kept).
- Fotos com carimbo de data/hora e GPS, mini-tabela de status por foto (§4, annexes) → EXPERIENCE › Capture-to-Document › 7 (stamp line; one status line for checklist-linked photos), Component Patterns › Photo tile, Photo viewer, Photo stamp, Settings row ("Localização nas fotos"), State Patterns › Location denied, Flow 4 step 2, Handed to architecture. DESIGN › Photo tile, Photo viewer, Photo stamp; token `components.photo-stamp`. The per-photo value table was reduced to one status line (simplicity).
- Seções numeradas editáveis com "Adicionar abaixo · Subir · Descer · Excluir" e texto rico (§3 item 3) → EXPERIENCE › Component Patterns › Block card, Overflow menu, Point of attention card (menu order Adicionar abaixo · Subir · Descer · Duplicar · Remover), Rich text editor (Template composer only), Block Model › Section block, Interaction Primitives, Accessibility Floor (non-drag reorder path), Voice and Tone. DESIGN › Block card, Overflow menu, Point of attention card, Rich text editor; token `components.rich-text`.
- The whole reference as inspiration (§5.2 item 4) → EXPERIENCE › Inspiration & Anti-patterns, new entry "Lifted from the peer-built load-study tool" with its rejected list.
- Both spines: version 0.6.0, `updated: 2026-09-18`, `status: draft`, the extract added to `sources:`; every new statement tagged `[ASSUMPTION — reference tool 2026-09-18]`; the "→ Mock:" lines now cite the files worker B is producing (`key-registries`, `key-points-of-attention`, `key-laudo-setup`, `key-export`, `key-equipment-sheet`, `key-photos`, `key-template-composer`, `key-account`).

## Rejected or reduced

1. **Desktop-only, file-fed, mouse-driven use; "Salvar projeto / Salvar HTML" as a local project file** (§3 items 1 and 8, §5.1). Rejected: the product is a tablet-first SaaS with local-first sync (memlog); listed in Inspiration & Anti-patterns as not lifted.
2. **Risk matrix and NR-10 / NBR 5410 adequacy table** (§4, sections 11 and 15). Not adopted: neither is in FO.SERV-03; recorded as an Open Question for the PRD (optional section blocks).
3. **Calibration certificates pasted as images** (§4, annexes). Rejected: section 11 already attaches the certificate files from Registries › Instruments.
4. **Per-photo value table (Item / Valor / Un. / Status / Obs.)** (§4, annexes). Reduced to a single status line under checklist-linked photos ("Item 8 · Contatos · NC"); the readings already print in section 9.
5. **Full rich-text toolbar (font, size, color, highlight, alignment)** (§3 item 3). Reduced to Negrito · Itálico · Lista · Numeração · Variável, limited to what the DOCX and PDF renderers share, and only in the Template composer; field surfaces never show an editor.
6. **"Recarga veicular" and "Estudo de carga e demanda" as modules** (§3 item 1). Not adopted; recorded as an Open Question (future report types, conditional on the brief's pending input).
7. **Generated narrative as an AI feature.** The reference tool composes its paragraphs from numbers; the spines keep that as a device-side template with a visible criteria line, not a backend model call, so it works without signal and stays auditable. AI remains backend-only (memlog).
8. **Delta detail "surface-sunken" for P2–P4 pills.** Adopted as one new neutral token `colors.surface-sunken` (#E6E9ED / #2A2F37), already in `mockups/tokens.css`; used by Priority pill P2–P4 and the Criteria line.
9. **Delta detail "heading labels" on the document control table.** The table title is `heading`; the key column is `label` in `ink-secondary` like every other key/value row in the app (Settings row, Data table), values `body` tabular.

## Conflicts surfaced

- **Menu verb "Excluir" vs. "Remover".** Closed in the reconciliation below: "Remover" everywhere (Overflow item, Confirm dialog "Remover ficha …", Undo toast "Ficha removida — Desfazer", "Restaurar ficha removida"); D7's "Excluir" is not adopted.
- **Pre-issue list "informative, not blocking".** D5 adds one blocking item ("Parecer não preenchido"); a missing logo stays informative (the document prints with the razão social). Recorded in the Export dialog row and State Patterns as the single exception.
- **Interaction budget.** The generated conclusion text adds one confirming tap on the sheet; Flow 2 now counts 30 taps for the NC case and 19 for the budget case (was 29 / 18), still inside ≤ 20 taps / ≤ 15 keystrokes. Confirmation is optional at sheet level so the tap can be skipped.

## Open

- Risk matrix and NR-10 / NBR 5410 adequacy table as optional section blocks (PRD decision).
- "Estudo de carga e demanda" and "Recarga veicular" as future report types (brief's pending input).
- Whether the client's logo prints on the cover next to the company logo (already open in DESIGN.md; the reference prints only the provider's brand).
- Watermark content (razão social vs. "Cópia controlada" vs. image) and whether it prints on the DOCX too.
- Every D1–D8 statement stands as `[ASSUMPTION — reference tool 2026-09-18]` until Bruno reviews the five priority names and day counts, the two council titles, the Empresa field list, the document control rows, the conclusion templates per block type, and the printing of coordinates on client premises (LGPD).

## Verdict

All eight delta items are in both spines with matching component names, order and tokens (68 components, 0 unresolved token references, every "→ Mock:" link resolves to an existing file). The reference raised the output bar (brand, document control, action plan, generated narrative, stamps) without moving the product off its field-first, confirm-before-write, backend-AI decisions; the office-only patterns (rich text, project file, desktop modules) were reduced or rejected. Two verb and one blocking-rule conflicts are recorded for a one-pass fix after the design partner's review.

## Reconciliation after the parallel update (2026-09-18)

Three workers applied the delta at once (spines, static mocks, prototype). The differences between them were closed as follows, every one under the user's principle of ease of use and simplicity:

- Deletion verb: "Remover" everywhere, including the new Overflow menu ("Adicionar abaixo · Subir · Descer · Duplicar · Remover"); "Excluir" is not used.
- Token: `surface-sunken` added to DESIGN.md (light #E6E9ED, dark #2A2F37) to match `tokens.css`; Priority pill P2–P4 and the Criteria line use it.
- Suggested deadline counts from the day the point of attention is created; P0 is that same day.
- Parecer: one three-segment control, nothing preselected, suggestion as the hint under it, one tap; the print box appears after the choice.
- Export: only "Parecer não preenchido" blocks generation; a missing logo is information.
- Generated text actions: "Confirmar" secondary button, "Editar" and "Substituir" text buttons, Dictation at the right, one row under the paragraph.
- Placeholders aligned across mocks and prototype: Rafael Lamonde (CREA), Eduardo (CRT example), CNPJs 00.000.000/0001-00 and 00.000.000/0001-01.
- Empresa tab autosaves (no "Salvar"); Instrumentos stays the default tab; the Rich text toolbar uses words, not icons.
- Prototype aligned to `components.css` (fallback CSS removed, sub-class names unified).
