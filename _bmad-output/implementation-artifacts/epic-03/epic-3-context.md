# Epic 3 Context: Seed data and Templates

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An office user opens the seeded "Cabine primária — padrão" template that reproduces FO.SERV-03 exactly, duplicates it for a new site, builds the location skeleton (cabines and columns) with equipment quantities per column, sets sub-block defaults and subtypes so the field engineer sees only what a given unit needs, and edits the plain-text boilerplate with variables. The versioned seed (Story 3.1) is pure kernel data with no UI dependency and is parallelizable from day 1; everything downstream — relatório creation, sheets, the renderer, the acceptance-criteria comparison — resolves against it rather than copying it. The epic closes with the Porto Seguro fixture, a full re-entered op log of the real delivered job, which every renderer/Sumário/pre-issue test from here on runs against.

## Stories

- Story 3.1: Seed the eight equipment block types from the decoded FO.SERV-03
- Story 3.2: Seed the section boilerplate and the "Cabine primária — padrão" template
- Story 3.3: List, duplicate and archive templates
- Story 3.4: Compose a template with its location skeleton and quantities per column
- Story 3.5: Set sub-block defaults and subtypes per block type
- Story 3.6: Edit the section boilerplate as plain text with variables
- Story 3.7: Build the Porto Seguro fixture relatório

## Requirements & Constraints

- Seed data is the source of truth for every block type's nameplate fields, checklist items and test-table grammar; counts follow the decoded FO.SERV-03, not the older PRD numbers (para-raio 5, chave seccionadora 10, disjuntor 13, TC 14 — a documented override of stale PRD counts).
- Every measurement/nameplate field carries a `kind` (text/number/date/select/manufacturer/voltage_class), optional `unit` and `options`; the two source checklist column orders normalize to one, and `EPOXI`/`EPÓXI` normalize to one spelling.
- Insulation is captured at 1-minute reading only; the app never computes índice de absorção/polarização (the instrument does) — those cells print "-" unless a template turns on the optional, off-by-default "IA e IP lidos do visor" sub-block.
- Subtypes only pre-mark checklist items NA; they never remove items, and marked items stay editable (manual seccionadora → Motor/Fusíveis NA; dry-type TP/TC/transformer → the eight oil-related items NA).
- A sub-block switched off is omitted from the generated document, never printed empty; a disabled sub-block's values are excluded from progress/groupForPrint computations.
- Section boilerplate (sections 1-6, 10, plus the cover) carries named variables resolved at generation; the MVP template editor is **plain text with variable chips and no toolbar** — the rich-text toolbar version described in older UX prose is explicitly out of the MVP slice (FR-12 is cut; deferred to Epic 11). Editing a section's text inside one relatório never flows back to its template.
- Editing a Template never touches a relatório already created from it (structure, quantities, sub-block defaults, boilerplate all copy-on-create, not by reference).
- A template referenced by relatórios can only be archived, not deleted; an unreferenced one can be removed with confirm + undo.
- Seed content ships append-only by version so every previously-shipped version keeps resolving; a Template/relatório records the `seed_version` it was created with.
- The Porto Seguro fixture reuses the real client's data under the standing R-023 waiver (already reflected in AGENTS.md) and must produce byte-stable ops (fixed ids/timestamps) so replay and golden-file tests are deterministic; a second, small fixture (one cabine, three blocks) exists for tests that don't need the full document.
- Per-item NC (non-conformity) observation phrases are domain knowledge not derivable from the source report; this epic delivers them as a reviewable document for a domain expert to sign off before the seed freezes, and the automated seed test only checks presence/count, not wording.
- A named human review gate exists before Epic 4 starts: the seeded definitions must be checked against the decoded source document (labels, counts, criteria, sources) and the check recorded with a date in Story 3.1.

## Technical Decisions

- Seed definitions (field lists, checklists, table grammars, criteria, not-tested reasons, section boilerplate) are never copied into a row; every consumer resolves them through `getDefinition(seed_version, report_type, block_type)` with `report_type = "cabine_primaria"` the only value for the MVP. `BlockConfig = {block_type, subtype?, role?, sub_blocks: Record<SubBlockKey,{enabled, options?}>, na_defaults}` is the *only* thing ever copied — into a Template block and again into a relatório's Block row at creation, alongside the `seed_version` that resolves it.
- Company owns Templates (tenant-scoped); a relatório's creation copies a Template's `BlockConfig`s and location skeleton via kernel `instantiateTemplate` in one client batch — the server never copies, which is what keeps a template edit from ever touching an existing relatório.
- Location is a tree node (`cabine` root, `coluna` child); only `cabine` nodes carry `se`, `env` and `agrupar_por_tipo`. A block's `role` (entrada/saida/alimentacao) lives only in its `BlockConfig`. Cabos-de-saída pairs with its transformador via `feeds_block_id`, resolved by `groupForPrint`, never by name matching.
- Manufacturer and voltage-class values are stored by value (with `{name, gender, number}` metadata) on sheets/captions, never by reference, so a later normalized-name merge never rewrites existing sheets. Instruments and clients are referenced by id elsewhere in the system (not this epic's concern beyond seeding pick-lists).
- Criteria are kernel-typed `{operator, value, unit, type, source: {name, edition?}}`; a criterion without operator/type/source is a kernel schema-test failure (edition and "aceitável na ficha" are the only nullable/allowed defaults).
- The seed's own reference/source of truth is the decoded FO.SERV-03 document itself, not any UX or PRD count; kernel tests are written against the decoded sheet lists directly.

## UX & Interaction Patterns

- Templates surface: list with name, block count, seed version, an archived group below; "Novo template", per-row "Duplicar"/"Arquivar"; empty state offers seeding the standard template directly. Mockups of record: `41-templates.html` / `key-templates.html`.
- Template composer: palette and composition side by side on desktop, a right drawer on tablet. Cabines and columns are added/renamed/reordered (drag, Overflow "Subir · Descer", Alt+Up/Down, a typeable Position box); every move is announced. A cabine may hold blocks directly with no column.
- Block palette in the composer is headed by the current column and grouped "Seções"/"Equipamentos"; a Quantity stepper (-/+ 48px, typeable, "—" at zero, press-and-hold repeats) sets per-column counts and the header shows per-type totals. Section Block cards show the FO.SERV-03 section number and the same Overflow pattern (Adicionar abaixo · Subir · Descer · Duplicar · Remover) as elsewhere.
- Sub-block defaults render as Toggle rows (state word beside them); checklist and conclusion sub-blocks are locked "Sempre", not controls. Picking a subtype (e.g. "manual" on Chave seccionadora) shows an explicit count like "2 itens marcados NA por padrão".
- Section boilerplate editor: plain text, autosave, a wrapping Chip row "Inserir dado do relatório" (cliente/obra/datas/empresa executora/responsável) that inserts an atomic, remove-only variable chip, plus "Restaurar texto padrão" with undo. No toolbar in the MVP.
- Mockups of record for the composer: `42-template-composer.html` / `key-template-composer.html`; for in-relatório section text editing: `45-secao.html`. Mockups win on conflict with prose.

## Cross-Story Dependencies

- Story 3.1 (block-type seed) and Story 3.2 (boilerplate + standard template) block everything else in the epic; Story 3.1 is parallelizable with Epic 1 and has no UI dependency.
- Story 3.1's `not_tested_reason` list and per-item NC phrases require sign-off from a domain expert (Bruno via Matheus) before the seed freezes; this can trail the rest of the story's code.
- Stories 3.3-3.6 (list/duplicate/archive, composer skeleton+quantities, sub-block defaults/subtypes, boilerplate text editor) all build on the `BlockConfig`/Template schema fixed in 3.1/3.2.
- Story 3.7's fixture depends on the full seed (3.1, 3.2) being frozen, since it re-enters the Porto Seguro job onto the seeded template; it is otherwise parallelizable with Epic 1 and feeds every later epic's renderer, Sumário and pre-issue tests as "the Porto Seguro fixture."
- Downstream: Epic 4 (`instantiateTemplate`, relatório creation) and Epic 5-8 (sheets, renderer, reading pipeline) all resolve seed definitions and consume Template rows produced here; the acceptance-criteria seed from Epic 2 (Story 2.6) is what this epic's test definitions bind to via `compareCriterion`.
