---
title: 'Stories 3.1 and 3.2: seed the eight block types, the section boilerplate and the standard template'
type: 'feature'
created: '2026-09-22'
status: 'done'
baseline_revision: 'bf82e9ad9547a705bf7ea7e1dbecdbdb2347b513'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/addendum.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/imports/extract-fo-serv-03.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/prototype/screens/41-templates.html'
warnings: ['multiple-goals', 'oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nothing downstream (relatório creation, sheets, renderer) can exist until the kernel knows what FO.SERV-03 contains: the eight equipment block types (nameplate fields, checklists, test tables bound to the Story 2.6 criteria), the fixed section text, and a standard Template that reproduces the reference job. Today `template.blocks` and every definition are untyped JSON.

**Approach:** Add a versioned, append-only seed (`packages/domain/src/seed/v1.ts` plus siblings) resolved through `getDefinition(seed_version, report_type, block_type)`; add the `BlockConfig`/template zod schemas and a pure `standardTemplate(...)` builder; let the seeding CLI create the template through the op log behind a flag; add a minimal `/templates` route whose empty state seeds the same template from the device.

## Boundaries & Constraints

**Always:**
- Labels, item texts and boilerplate are verbatim pt-BR from FO.SERV-03 (source order: `addendum.md` §9 for the seed lists, `extract-fo-serv-03.md` §2/§4 and the original DOCX for text). Where addendum §9 and the extract disagree, addendum §9 wins (it is what the story ACs cite); record every such choice in `## Design Notes` › "Transcription choices" so Matheus can check it (R-009).
- Seed version identifier is the string `'v1'` (`SEED_VERSION = 'v1'`): the existing `seed_version: z.string()` columns and every fixture already use `'v1'`; the AC's "`seed_version = 1`" means seed version 1 = `'v1'`. Do not change the column type.
- Seed data is code, never rows: definitions resolve through `getDefinition`; only `BlockConfig` (inside Template blocks) is copied. Reuse `SEEDED_CRITERIA` (`seed/criteria.ts`) by `criterion_key`; do not duplicate a criterion number.
- `v1` is frozen once merged: a test pins a content hash of the v1 seed so any edit fails and must become `v2` (append-only, AR-20); `getDefinition` resolves every version in a `SEED_VERSIONS` map.
- The template is created only through ops: the CLI builds a `create` op and calls `applyOps` like `projectUser` does; the web commits a `template/{id}` create through `commitBatch`. Both build the value with the same kernel `standardTemplate` builder.
- Strings: derived text (counts, totals) in `packages/domain`; static surface copy in `apps/web/src/copy/pt-br.ts` (`// authored:` where not from a mock). Mock class names from `41-templates.html`; `.frame-*` rules translated in `apps/web/src/styles/app.css` per AGENTS.md.
- No emoji anywhere. English identifiers; `relatorio`, `cabine`, `ficha`, `parecer` kept; seed keys ASCII snake_case.

**Never:**
- No Templates list features of Story 3.3 (block count / seed version secondary line, Novo template, Duplicar, Arquivar, Restaurar, archived group), no composer (3.4-3.6), no fixture relatório (3.7).
- Do not narrow `blockRowSchema.block_type`/`config` (relatório blocks are Epic 4's `instantiateTemplate`); only `templateRowSchema` is narrowed.
- No registry rows for Atividade/Local chips or NC phrases: they are kernel constants in this story.
- Do not copy client material (Porto Seguro names, serials, people) into the seed; the seed carries only FO.SERV-03's own form text. The skeleton names below are the story's own AC text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resolve | `getDefinition('v1','cabine_primaria','disjuntor_mt')` | definition with 13 nameplate fields, 15 checklist items, tests `isolacao` (open/closed tables) and `resistencia_contato`, conclusion | none |
| Unknown version / type | `'v9'`, or report_type `'x'`, or block_type `'foo'` | throws an Error naming the bad argument | caller bug, not user-facing |
| Section text by date | `sectionText('v1', 5, '2027-07-01')` | current text (the empty `2027-06-01` slot is skipped) | none |
| CLI flag | `seed-users ... --standard-template` run twice | exactly one live "Cabine primária — padrão" template for the company | second run is a no-op |
| `--test` | global setup | Empresa A has the standard template, Empresa B has none | none |
| Empty state | Empresa B opens `/templates` | "Nenhum template. Crie um a partir do relatório padrão FO.SERV-03." + action; action creates the template, list shows it, survives reload and reaches the server on sync | action disabled while committing (no double create) |

</intent-contract>

## Code Map

- `packages/domain/src/seed/criteria.ts` -- `SEEDED_CRITERIA` keys `isolacao`, `resistencia_contato`, `relacao_transformacao`; tests bind to these keys. Read-only.
- `packages/domain/src/seed/` -- new home: `v1.ts` (block types, fields, checklists, grammars, subtypes, not-tested reasons, NC phrases, chip lists), `sections-v1.ts` (boilerplate + cover), `definitions.ts` (`SEED_VERSION`, `SEED_VERSIONS`, `getDefinition`, `sectionText`, schemas of definitions), `template.ts` (`standardTemplate`, `templateTotals`). Split as you see fit; export via `packages/domain/src/index.ts` (`export *` lines, like `./seed/criteria.ts`).
- `packages/domain/src/schemas/entities.ts:154` -- `templateRowSchema`: narrow `blocks` from `jsonValueSchema` to `z.array(templateBlockSchema)` and add `skeleton: z.array(skeletonNodeSchema)`. `TEMPLATE_FIELDS` (`ops/path.ts:52`) follows automatically. `BlockConfig` schema lives in a new `packages/domain/src/schemas/block-config.ts` (AD-21 names `schemas/block`).
- `packages/domain/fixtures/replay-small/op-log.ts:161` -- template create value needs `skeleton: []`; update any golden/snapshot this changes (run the replay tests). Same for `packages/domain/src/contract/examples.ts` if it carries a template.
- `apps/api/src/db/seed.ts` -- `seedUser`/`projectUser` (op envelope + `applyOps`, `system:identity` actor). Add `seedStandardTemplate(db, companyId)` following `projectUser`; idempotent (skip when a live template with the standard name exists). `seedTestCompanies` seeds it for company A only.
- `scripts/seed-users.ts` -- add `--standard-template` flag (USAGE text too); `--test` path unchanged apart from company A getting the template.
- `apps/web/src/app.tsx` -- `createBrowserRouter`; add `{ path: '/templates', element: <TemplatesSurface/>, handle: { title } }` beside `/cadastros`.
- `apps/web/src/surfaces/home/shortcut-row.tsx` -- Templates card is an `aria-disabled` AriaButton; turn it into `<Link className="shortcut-card" to="/templates">` like Cadastros (update its doc comment and `home-surface.test.tsx:369-371`).
- `apps/web/src/db/home-store.ts` -- `templateRows(db)` already reads `entity = 'template'`; reuse it (filter `removed_at === null` for the surface).
- `apps/web/src/db/commit.ts` -- `commitBatch(db, ops, { newId, now })`; pattern in `apps/web/src/surfaces/registries/word-registry-panel.tsx:~100`.
- `apps/web/src/copy/pt-br.ts` -- add a `templates:` block; `apps/web/src/styles/app.css` -- translate the `41-templates.html` `.frame-*` rules actually rendered.
- `e2e/support/merged-fixtures.ts` -- `test`, `expect`, `TEST_SEED`, `signIn(page, email)`; `e2e/support/global-setup.ts` resets and seeds; `scripts/test-reset.ts` exists for resetting test companies.
- Source text for boilerplate and captions: the FO.SERV-03 DOCX in `docs/context/` (gitignored, main checkout only); a plain-text extraction of it was made in the session scratchpad (never committed).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/block-config.ts` -- `blockTypeSchema` (8 equipment types `cabos_entrada, para_raio, chave_seccionadora, disjuntor_mt, tp, tc, cabos_saida, transformador_forca` + section block types `section_1..section_6, section_8, section_10, section_11`), `subBlockKeySchema` (`nameplate, checklist, isolacao, ia_ip_display, resistencia_contato, relacao_transformacao, observations, conclusion`), `itemKeySchema` (union of all checklist item keys), `subtypeSchema` (`manual, epoxi, a_seco`), `roleSchema` (`entrada, saida, alimentacao`), `blockConfigSchema` = AD-21 shape with `sub_blocks` a `z.partialRecord`, `templateBlockSchema` = `blockConfigSchema` + `{quantity: int >= 1, skeleton_location_ref: string | null}` (null for section blocks), `skeletonNodeSchema` `{ref, kind: 'cabine'|'coluna', parent_ref: string|null, name, agrupar_por_tipo?: boolean (cabine only)}` -- AD-21 schema with enumerated keys.
- `packages/domain/src/seed/*` -- seed v1 per the Design Notes; `getDefinition` returns a zod-validated `BlockDefinition` `{block_type, label, nameplate: FieldDef[], checklist: ChecklistItem[] | null, tests: TestDef[], sub_blocks: SubBlockKey[], subtypes: SubtypeDef[], conclusion: true}`; `FieldDef {key, label, kind, unit?, options?}`; `TestDef {key, label, criterion_key, tables: TableDef[]}`; `TableDef {key, title?, connection_columns, value_columns, capture_column, rows}`.
- `packages/domain/src/seed/*.test.ts` -- kernel tests: every AC count and verbatim list (golden arrays written in the test from addendum §9, compared with `toEqual`), each `criterion_key` found in `SEEDED_CRITERIA`, subtype NA sets, select options, not-tested reasons, NC phrase presence (3-4 per item, every item of every list), chip list sizes, rain/humidity note, section counts, variables, `2027-06-01` empty slot, v1 hash pin, every version x every block type resolves, bad-argument throws, `standardTemplate` skeleton/quantities/totals/flags.
- `packages/domain/src/schemas/entities.ts` + fixtures -- narrow `templateRowSchema`; fix fixtures and tests that build template rows.
- `apps/api/src/db/seed.ts`, `scripts/seed-users.ts`, `apps/api/src/db/*.integration.test.ts` -- flag, idempotent seeding through `applyOps`; integration test: flag seeds one template whose row parses with `templateRowSchema` and equals `standardTemplate` output (ids aside), re-run adds nothing, `--test` leaves company B empty, no cross-company row.
- `apps/web/src/surfaces/templates/templates-surface.tsx` (+ test) -- minimal surface: `.screen[data-route="/templates"] > .tpl-content`, `section-head` h2 "Templates (n)", mock `section-note`; zero live templates -> empty sentence + primary button that commits `standardTemplate` (disabled while pending); otherwise a `registry-list` of `registry-row tpl-row` with the name in `.rr-primary` only (no actions, no secondary line: Story 3.3).
- `apps/web/src/app.tsx`, `shortcut-row.tsx`, `pt-br.ts`, `app.css`, `home-surface.test.tsx` -- route, enabled shortcut, copy, CSS translation.
- `e2e/templates.spec.ts` -- `@p0 3.2-E2E-001` as Empresa B: Home -> Templates shortcut -> empty sentence -> action -> "Cabine primária — padrão" listed -> reload still listed -> "Sincronizar agora" -> server holds it (check via a second signed-in context or the api). `@p0 3.2-E2E-002` as Empresa A: the CLI-seeded template is listed. Make 001 re-runnable (reset company B first, e.g. via the existing test-reset path).
- `docs/nc-chip-phrases.md` -- English document listing, per checklist list and item, the seeded NC phrases (pt-BR) for Bruno's review, with a dated "pending review" status line; a tooling test (`scripts/tooling.test.ts` or sibling) asserts every seeded phrase appears in it.
- This spec -- keep the `## Human review pending` section below and copy it into the PR.

**Acceptance Criteria:**
- Given seed v1, when `getDefinition('v1','cabine_primaria',t)` runs for the eight types, then nameplate counts are cabos_entrada 0, para_raio 5, chave_seccionadora 10, disjuntor_mt 13, tp 12, tc 14, cabos_saida 0, transformador_forca 12, with labels verbatim from addendum §9.1 and every field's `kind` in the six AD-11 kinds; checklists are cabos 5, para_raio 5, chave_seccionadora 14, disjuntor_mt 15, tp/tc/transformador_forca the same 15 (one shared constant), verbatim §9.2, column order `ÍTEM | C | NC | NA | OBSERVAÇÕES`.
- Given the four grammars, when resolved, then rows/columns match §9.3 exactly (single-table insulation per type with `capture_column = '1 MINUTO'` and print columns `30 SEGUNDOS | 1 MINUTO | ESTAB./10MIN | ABSORÇÃO | POLARIZAÇÃO`; open/closed contact `T1/T2, T3/T4, T5/T6` and `FASE A/B/C` with `VALORES`; contact resistance `T1-T2, T3-T4, T5-T6` in µΩ; ratio TP `H1-H2 / X1-X2`, TC `P1-P2 / S1-S2`, transformer per TAP `H1-H3 / X1-X0 | H2-H1 / X2-X0 | H3-H2 / X3-X0`), each test's `criterion_key` resolves in `SEEDED_CRITERIA`, and transformador_forca carries `conclusion`.
- Given subtypes and selects, then `TIPO DE SE` options `SIMPLIFICADA - POSTE, ALVENARIA - CONVENCIONAL, BLINDADA`, `MEIO DE EXTINÇÃO` `AR, SF6`, `TIPO DE ISOLAÇÃO` `EPÓXI, Á SECO` (no `EPOXI` anywhere), `ACIONAMENTO` `MANUAL/PUNHO`; `manual` on chave_seccionadora yields `na_defaults = ['motor','fusiveis']`; `epoxi` and `a_seco` on tp, tc, transformador_forca yield the eight oil-related keys.
- Given the rest of the seed, then not-tested reasons are exactly Impossibilidade de desligamento, Solicitação do cliente, Outro with justification text; every checklist item has 3 or 4 NC phrases; Atividade has 9-11 and Local 7-9 entries; the quick notes include the rain/humidity note.
- Given section boilerplate, then sections 1-6 and 10 plus the cover resolve with the counts in Design Notes and only the six named variables; section 5 has a `2027-06-01` slot with no text.
- Given `seed-users --standard-template` (and `--test` for Empresa A), then one template "Cabine primária — padrão" exists with `seed_version 'v1'`, section blocks 1-6, 8, 10, 11 in order, the skeleton and per-location quantities of Design Notes (totals 25/21/11/11/8/4/9/5), `agrupar_por_tipo` true only on 1° Subsolo and Geradores, seccionadoras `subtype 'manual'`, `ia_ip_display` disabled everywhere it applies.
- Given Empresa B with no template, when `/templates` renders, then the empty state and its action behave as in the I/O matrix, at 390/768/1280 px, light and dark, keyboard-only.

## Design Notes

**Seed keys.** Field and item keys are ASCII snake_case of the label (`n_serie`, `tensao_de_placa`, `abertura_e_fechamento_manual`, `motor`, `fusiveis`). Kinds: `FABRICAÇÃO` -> `manufacturer`; `TENSÃO DE PLACA` and the single `TENSÃO NOMINAL` (para-raio, disjuntor) -> `voltage_class`; `DATA DE FABRICAÇÃO`/`DATA FABRICAÇÃO` -> `date`; `MEIO DE EXTINÇÃO`, `TIPO DE ISOLAÇÃO`, `ACIONAMENTO` -> `select`; values with a unit in §9.1 (kA, A, VA, kVA, V, kV for `TENSÃO NOMINAL AT`, L for `VOL. ÓLEO`) -> `number`; the rest `text`. transformador_forca `POTÊNCIA NOMINAL` unit kVA (TP/TC: VA).

**Oil-related eight (dry subtypes):** `valvula_de_alivio, elemento_secante, juntas_vedacoes_e_vazamentos, indicador_nivel_de_oleo, registros_radiadores, rele_de_gas_funcionamento, termometro, oleo_isolante_indicador_de_nivel`. Not enumerated in any source: flagged for R-009.

**Sub-blocks per type:** all eight have `checklist`, `observations`, `conclusion` (locked on); `nameplate` where fields > 0; `isolacao` for all; `ia_ip_display` on single-table insulation types (cabos, para_raio, tp, tc, transformador_forca), default off; `resistencia_contato` for chave_seccionadora and disjuntor_mt; `relacao_transformacao` for tp, tc, transformador_forca. Section blocks: `sub_blocks: {}`.

**Grammar rows.** Cabos entrada/saída and para-raio: `FASE A, FASE B, FASE C, FASE RESERVA` vs `MASSA/BLIND.` (cabos) or `MASSA` (para-raio); TP/TC `FASE R/S/T` vs `MASSA`; transformer `PRIMÁRIO|MASSA|SECUNDÁRIO`, `PRIMÁRIO|SECUNDÁRIO|MASSA`, `SECUNDÁRIO|MASSA|PRIMÁRIO`. Transformer ratio has one default TAP row (`TAP Nº` typed); `VAL CALCULADO` is a derived column (flag `derived: true`), `CONDIÇÕES` too.

**Sections (plain text blocks `{kind: 'heading'|'paragraph'|'item', text}`):** 1: two paragraphs; the first reads `O presente relatório tem por objetivo apresentar, de forma clara e objetiva, as atividades realizadas pela {empresa_executora}, referentes à manutenção preventiva e à execução de ensaios dielétricos nas Cabines Primárias de Proteção, Distribuição e Transformação de {obra} da {cliente}.` 2: seven definition paragraphs (six definitions + `Obs:`) then the NR-10/PIE line. 3: scope paragraph, `Exclusões:`, three items. 4: five headings (Documentação 5, EPC's 7, EPI's 7, Equipamentos de Ensaio 6, Ferramentas e Materiais 4 items). 5: the paragraphs, the quoted 10.5.1 sequence as six items `a-)`..`f-)`, the re-energization list of nine items. 6: eight headings incl. `Relé de Proteção` and `Cubículos, QGBT’s e Quadros de Distribuição`. 10: three items. Cover `DADOS DO CLIENTE`: Cliente `{cliente}`, Cidade/local `{obra}`, Data da execução do serviço `{datas}`, Informações adicionais `{escopo}`, Responsável `{responsavel}`. Keyed `(section, effective_from)`; base `effective_from = '2000-01-01'`; section 5 also `{effective_from: '2027-06-01', blocks: null}`.

**Not-tested justification (derived from section 8):** Impossibilidade de desligamento -> `Não foi possível realizar os ensaios elétricos devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações.`; Solicitação do cliente -> `Os ensaios não foram realizados conforme solicitação do cliente.`; Outro -> justification `null` (free text).

**Standard template skeleton and quantities** (refs are stable strings, e.g. `enel`, `subsolo-1`, `subsolo-1/coluna-5`): Cubículo Enel (no columns): cabos_entrada 1 (role entrada), para_raio 2 (entrada 1, saida 1), chave_seccionadora 2 (entrada 1, saida 1), tp 1, tc 1, disjuntor_mt 1, cabos_saida 1 (saida). 1° Subsolo, Coluna 1..17: chave_seccionadora at colunas 1, 2 (x2), 3, 5, 6, 7, 8, 10, 11, 12, 13, 17 (13); disjuntor_mt at 2, 3 (x2), 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16 (14); tp and tc each at 2, 3 (x2), 4, 14, 16 (6); on the cabine itself transformador_forca 5 and cabos_saida 5 (role alimentacao). Oxigênio: cabos_entrada 1, chave_seccionadora 1, para_raio 1 (saida), cabos_saida 1, transformador_forca 1. Cobertura A and Cobertura B each: cabos_entrada 1, para_raio 1 (entrada), chave_seccionadora 1, disjuntor_mt 1, cabos_saida 1, transformador_forca 1. Geradores (no columns, as the AC lists none): chave_seccionadora 7, disjuntor_mt 4, tp 4, tc 4. Name `Cabine primária — padrão`, `version: 1`.

**Transcription choices** (append as you go): `CAPACIDADE INTERRUPTOR` (addendum) over `INTERRUPTORA` (extract); TC = TP 12 + `RELAÇÃO`, `EXATIDÃO` (addendum) where the extract replaces AT/BT; para-raio 5 fields (the duplicated `FABRICAÇÃO` is a truncation artefact).

Added during implementation (2026-09-22), each for the R-009 check:

- Boilerplate text is byte-verbatim from the DOCX extraction (checked line by line), including its curly apostrophes and quotes (`EPC’s`, `EPI’s`, `QGBT’s`, `SE’s`, `“…”`); trailing spaces the DOCX carries on three paragraphs are trimmed; `Medidor de relação de espiras TTR` keeps the missing semicolon of the source.
- Section 1: `Fasor Engenharia` became `{empresa_executora}` and `das Torres A e B da Porto Seguro` became `de {obra} da {cliente}` exactly as the Design Notes write it; the fixed `de` and `da` may read awkwardly for some obra or cliente names.
- Section 4: the five group names (`Documentação`, `EPC’s`, `EPI’s`, `Equipamentos de Ensaio`, `Ferramentas e Materiais`) are `heading` blocks, their lines `item` blocks.
- Section 5: the five opening lines are `item` blocks (the extract calls them bullets, the last being `Conforme NR-10, capítulo 5.1, item 10.5.1:`); the quote's opening sentence is a `paragraph`; `a-)` to `f-)` are six `item` blocks; the three following sentences are `paragraph` blocks; the nine re-energization lines are `item` blocks. Counts: 4 paragraphs, 20 items.
- Section 6: `heading` per equipment group, `item` per line (2, 4, 7, 3, 5, 3, 6, 5). Section 10: three `item` blocks. Section titles 1 to 11 are the DOCX index entries.
- Cover labels drop the DOCX's trailing colon (`Cliente:` became `Cliente`), as addendum §9.5 lists them.
- `TPS` is kept as the connection-column label of the TC ratio table (addendum §9.3 verbatim), although the extract §6.5 calls it a copy error from the TP sheet; `TP's` keeps the addendum's straight apostrophe.
- A blank GUARD cell is stored as `''` (the cable sheets print `___` there).
- Insulation units follow the extract per sheet model: cabos de entrada and para-raio MΩ; cabos de saída, TP, TC and transformador GΩ; open and closed contact GΩ; contact resistance µΩ. Ratio input units: TP V/V, TC A/A, transformador kV/V.
- `AJ. BOBINA` and `TAP ATUAL` are `text` (the addendum gives no unit; the extract suggests VCA and kV). `voltage_class` fields carry `unit: 'kV'` as well.
- `CARACTERÍSTICAS DA SE` and `AMBIENTE DE ENSAIO` use the location row's own keys (`type`, `primary_kv`, `secondary_kv`, `installed_kva`, `altitude_m`, `temperature_c`, `humidity_pct`); units kV, V, kVA, m (source `mts`), °C, %.
- Block labels follow the glossary (`Cabos de saída` for `cabos_saida`); test labels follow the extract's block names (`ENSAIO DE ISOLAÇÃO`, `ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO`, `ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO`). Column groups (`PONTO DE ENSAIO/CONEXÃO`, `VALORES`, `QUALIDADE ISOLAÇÃO`) exist only on single-table insulation, the only grammar §9.3 draws them for.
- `capture_column` names the first column with role `capture`; the transformer ratio table captures three connection columns, each marked `capture`. `VAL CALCULADO` and `CONDIÇÕES` are `derived`; the ratio's primary and secondary values are `input`.
- The Local chip list carries the reference job's own caption locations (`cubículo da Enel`, `subsolo`, `cubículos de Média Tensão`, `Oxigênio`, `cobertura lado A`, `cobertura lado B`, `cubículos de geração`, `QGBT`), as the AC asks, although they are site names rather than generic ones; the Atividade list has ten caption activities. The quick note is the extract's "Observação padrão dentro das fichas".
- Roles are set only where the Design Notes name one: Oxigênio's and the Coberturas' cabos de entrada and cabos de saída carry no role.

## Human review pending

- R-009 seed review — pending Matheus review (entry dated 2026-09-22): check the resolved v1 definitions (labels, counts, criteria, sources, the oil-related eight, the transcription choices and the section 1 variable placement) against the FO.SERV-03 in `docs/context/`, and record the date in Story 3.1 before Story 4.1 starts. Does not block this merge.
- NC chip phrases — pending Bruno review of `docs/nc-chip-phrases.md` before the seed freezes (a change after merge becomes seed `v2`).

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, unit, api, e2e `@p0` all green.
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/seed-users.ts --company-id <v7> --company X --email x@x.local --password ... --name X --council crea --number 1 --standard-template` twice -- expected: one template.

**Manual checks:**
- Real-browser pass on `/templates` (Empresa B empty state, then list; Empresa A list) at 390/768/1280 px, light and dark, keyboard-only, offline reload; screenshots in `_bmad-output/implementation-artifacts/reviews/3-1-3-2-seed-and-standard-template/`. The surface has no dialog; record that.

Pass recorded 2026-09-22 (headless Chromium driven by a Playwright script in the `tools` container, since the shared MCP browser was held by another session): Empresa B empty state and list and Empresa A list at 390, 768 and 1280 px in light and dark, no horizontal overflow at any width. Keyboard only: Tab reaches "Criar template padrão" with its focus ring, Enter creates the template and the list replaces the empty state. Offline: a full reload of `/templates` cannot be checked against the Vite dev server (no service worker there; the durability suite owns the offline cold open on the built bundle), so offline was checked as in-app navigation from Home to Templates with the network cut: the list reads from the device. The surface has no dialog. After review fixes: Empresa B list also in light at 390/768/1280, the focused action at 390 and 1280, and the action disabled with "Aguardando o primeiro download da empresa" while the first company pull has not completed (`b-empty-awaiting-download-768-light.png`).

## Spec Change Log

## Review Triage Log

### 2026-09-22 — Review pass
- verdicts: 29 findings — high 0, medium 5, low 10, false 8, maybe-false 0 (plus 6 low rejected on cost; intent-alignment layer descriptive only, recorded below)
- findings:
  - `[medium]` `[patch]` Blind: empty state allows a duplicate standard template on a device before its first company pull — action disabled until the COMPANY_STREAM sync_state has `downloaded_at`, reason "Aguardando o primeiro download da empresa"; unit test added.
  - `[medium]` `[patch]` Blind: template/BlockConfig cross-field rules unchecked — `checkTemplateRow` superRefine on `templateRowSchema` (sections bare, subtype/sub_blocks/na_defaults from the definition, refs resolve, unique refs, coluna under cabine); tests per rejection.
  - `[low]` `[patch]` Blind: locked sub-blocks not enforced (spec listed observations too; UX says checklist and conclusion) — enforced in the same superRefine for `LOCKED_SUB_BLOCKS` (checklist, conclusion), UX wins.
  - `[low]` `[reject]` Blind: `sectionText` throws for sections 8 and 11 — correct loud failure; those sections are generated, not boilerplate.
  - `[low]` `[reject]` Blind: narrowing `templateRowSchema` without migration — no template row was ever written outside fixtures and tests (confirmed by the verification-gap layer); MVP not deployed.
  - `[low]` `[patch]` Blind: client name in `templates-surface.test.tsx` — renamed to a generic name. The Local chip list keeps the source caption locations because the AC demands them; flagged for R-009.
  - `[low]` `[reject]` Blind: 3.2-E2E-001 resets Empresa B mid-suite — it re-seeds the user, later specs pass; restoring afterwards adds complexity for no observed failure.
  - `[medium]` `[patch]` Blind: empty state never checked for overflow — 390 px overflow assertion in 3.2-E2E-001 (`.home-empty` is an existing shared app.css class, that sub-claim is false).
  - `[medium]` `[patch]` Blind: failed-write path untested — QuotaExceededError unit test (toast, button re-enabled, empty outbox). The `as never` cast matches the existing registry-panel pattern; not changed.
  - `[low]` `[reject]` Blind: `seedStandardTemplate` check-then-write race and name match — two concurrent operator runs are unlikely; a lock adds complexity.
  - `[false]` `[reject]` Blind: hash pin bypass — a key zod strips never reaches consumers, so behaviour cannot change unpinned; item keys live inside the pinned bundle; the template is a row, not seed.
  - `[low]` `[patch]` Blind: duplicated company cleanup in two integration tests — shared `dropCompany` in `apps/api/src/db/test-cleanup.ts`.
  - `[low]` `[patch]` Blind: screenshot gaps — Empresa B list light at 3 widths, focus at 390/1280, awaiting-download state added.
  - `[low]` `[reject]` Edge: seed race (same as above).
  - `[medium]` `[patch]` Edge: fresh device before first pull (same root cause as the first Blind row).
  - `[low]` `[reject]` Edge: two offline devices both create the template — inherent to offline-first; Story 3.3 archiving resolves a duplicate.
  - `[false]` `[reject]` Edge: legacy template rows — none exist (see above).
  - `[medium]` `[patch]` Edge: dangling skeleton refs (grouped with the superRefine patch).
  - `[medium]` `[patch]` Edge: section block with subtype/role (grouped with the superRefine patch).
  - `[low]` `[patch]` Edge: `sectionText` with a non ISO date — now throws naming the argument; test added.
  - `[false]` `[reject]` Edge: sections 8/11 (same as Blind row).
  - `[low]` `[patch]` Edge: `--standard-template yes` silently ignored — `wantsStandardTemplate` throws a usage error; tooling test.
  - `[false]` `[reject]` Edge: `--test` with `--standard-template` — `--test` is its own documented mode that already seeds Empresa A.
  - `[false]` `[reject]` Edge: user/db null — the route is session-gated; loading state is correct while the database opens.
  - `[low]` `[patch]` Edge: ui-hygiene Templates wait uses the default timeout — now 30 s.
  - `[false]` `[reject]` Edge: `agrupar_por_tipo` required on cabine — matches `locationRowSchema`; the spec's `?` meant cabine-only.
  - `[medium]` `[patch]` Verification gap: failed-write path (same as Blind row).
  - `[medium]` `[patch]` Verification gap: empty-state overflow (same as Blind row).
  - `[false]` `[reject]` Verification gap other: legacy rows (same as above).
  - Intent alignment (descriptive): the diff follows the addendum for `1 MINUTO`/`VALORES` casing, `'v1'` for seed version 1, `src/seed/` path, a conclusion on all eight types; fidelity to the DOCX is closed by the pending R-009 review.

## Auto Run Result

- Summary: seed v1 (eight block types, five checklists, four grammars bound to `SEEDED_CRITERIA`, subtypes, not-tested reasons, NC phrases, chip lists, section boilerplate and cover), `BlockConfig`/template schemas with cross-field rules, `standardTemplate`, CLI `--standard-template`, minimal `/templates` surface with the empty state and the Home shortcut enabled, NC phrases document.
- Patches applied: 5 medium entries (grouped), 8 low; deferred 0; rejected as listed above.
- Follow-up review recommended: true — two or more medium entries patched; the unverified risk is the first-pull gate and the superRefine on real sync (covered by the independent review).
- Verification: `pnpm verify` green before review; after patches the touched suites passed (domain 440, web 80 targeted, scripts 20, api db 16, e2e templates + ui-hygiene 8); full verify rerun before PR.
- Residual risks: R-009 and NC phrase reviews pending; Local chips are site names from the reference job.
