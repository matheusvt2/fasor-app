---
title: 'Stories 2.4, 2.5, 2.6: clients, manufacturers, voltage classes and acceptance criteria'
type: 'feature'
created: '2026-09-22'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      A device whose manufacturer/voltage_class create gets server-merged into another
      device's existing row keeps the merged-away id as a permanent, unreconciled
      duplicate in its own local Dexie.
    evidence: |-
      The sync protocol has no "your create was superseded, rewrite to id X" signal, so
      the creating device's optimistic local row is never corrected by a later pull.
      Fixing this needs a sync-protocol extension (e.g. a redirect/tombstone instruction
      in the pull response), out of scope for this batch.
    location: >-
      apps/api/src/sync/apply.ts, apps/web/src/sync/engine.ts
    severity: medium
  - summary: >-
      The manufacturer/voltage_class normalized-name merge scans every live registry
      row for the company (all kinds) on every create, an O(n) scan with no SQL-level
      kind filter.
    evidence: |-
      Fine at MVP registry scale (a handful of manufacturers/voltage classes per
      company); revisit if registries grow large.
    location: >-
      apps/api/src/sync/apply.ts:167-169
    severity: low
  - summary: >-
      The registry edit panels (Clientes, Fabricantes, Classes de tensão) offer two
      differently-labeled controls that both close the panel ("Fechar edição" icon
      button, "Fechar" footer button).
    evidence: |-
      A pre-existing pattern carried forward verbatim from instrument-panel.tsx (Story
      2.1, already merged), not introduced by this diff. Not this story's problem.
    location: >-
      apps/web/src/surfaces/registries/client-panel.tsx, word-registry-panel.tsx
    severity: low
dev_model: 'sonnet'
dev_effort: 'medium'
baseline_revision: 'dd15194f8a77ac615fbdcf579b08c4cf0fccc816'
---

<intent-contract>

## Intent

**Problem:** Story 2.1 shipped the Registries surface shell and Instrumentos; Clientes, Fabricantes, Classes de tensão and Critérios de aceitação still render only the stub "Disponível em uma próxima etapa" placeholder, so no client/manufacturer/voltage-class/criteria reference data exists yet for later epics to consume.

**Approach:** Fill the four placeholder tab files, reusing Story 2.1's registry list/panel/autosave (`useFieldCommit`+`commitBatch`) and `.field-grid` CSS verbatim. Extend the `client` kernel schema with sites/contact; add a shared `RegistryPickerField` component (Chip row of 5 recents + "Outro…" + Combobox-with-"Criar…") used by both Clientes and Fabricantes/Classes de tensão; add a criterion seed module with `compareCriterion`; add a server-side normalized-name merge for manufacturer/voltage_class creates.

## Boundaries & Constraints

**Always:** every field autosaves via `useFieldCommit`→`commitBatch` (no Save button, first-field-of-a-new-row is a `create` op, every later field a `put`, mirroring `instrument-panel.tsx:64-85`); reuse `.registry-layout`/`.registry-main`/`.registry-panel`/`.registry-toolbar`/`.field-grid` from `registries.css`; manufacturer/voltage_class rows keep the existing `{name,gender,number}` shape (`registryRowSchemas.manufacturer`/`.voltage_class`, unchanged); row/sort/text composition lives in `packages/domain`, never in `apps/web` (AGENTS.md "composed row"); Critérios renders straight from the new seed module's exported constants only, never through `registry/criterion` ops (NFR-14); every new op-reachable field only needs to pass through the already-generic `apply.ts`/`path.ts` — do not add per-kind branches there except the one merge check described below.

**Never:** touch `empresa-tab.tsx`, `instrumentos-tab.tsx`, `instrument-panel.tsx`, or `app.tsx`'s route table; do not build Epic 7's full `preIssue` aggregator (it reads a `RelatorioSnapshot`, which does not exist until Epic 4) — add only a small, separate, pure warning-row helper in its own file that Epic 7 can call later, so a parallel batch's own `preIssue` work never merge-conflicts with this one; do not wire the client/manufacturer/voltage-class picker into an actual "Novo relatório" or field screen (Epic 4/5 don't exist yet) — satisfy those ACs at the component level with `RegistryPickerField`'s own tests; do not implement a full CNPJ checksum, only the AC's literal "14 digits when present" length check; do not touch the existing `registryRowSchemas.criterion` kind in `entities.ts` (unused by this story, reserved).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Client CNPJ 14 digits | user types digits | field commits, row `meta` shows formatted CNPJ | non-14-digit input shows inline error, field does not commit |
| Client CNPJ blank | `cnpj: null` | row shows "—"; `clientPreIssueRows` returns the warning row | none |
| Client referenced by a Project | `isClientReferenced` true | panel offers only "Arquivar", no Confirm dialog | "Remover" hidden |
| Two devices create "Schneider"/"SCHNEIDER" offline | two `registry/manufacturer` create ops reach the server | server materializes exactly one live manufacturer entity | neither op is rejected; both `applied` |
| `compareCriterion` unit scaling | 147 GΩ vs `> 400 MΩ` | passes | — |
| `compareCriterion` boundary | 251 µΩ vs `< 250 µΩ` | fails | — |
| Criterion seed missing operator/type/source | seed module loaded | zod parse throws at seed-test time | test fails loudly, never silently renders |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:89-95` -- extend `registryRowSchemas.client`: replace `address: nullableString` with `contact_name: nullableString`, `contact_phone: nullableString`, `sites: z.array(z.object({ id: uuidV7Schema, address: z.string() }))`. No `registryKindSchema`/`ops/path.ts` change needed (already generic per-kind, `client`/`manufacturer`/`voltage_class` already valid kinds).
- `packages/domain/src/contract/examples.ts:24` -- update the `clientCreate` fixture's `value` to the new shape (`contact_name: null, contact_phone: null, sites: []`).
- `packages/domain/src/checks/references.ts` -- pattern to mirror in new `packages/domain/src/checks/client-reference.ts` (+`.test.ts`): `isClientReferenced(clientId, projects: readonly ProjectRow[]): boolean` (`project.client_id === clientId && project.removed_at === null`), analogous to `isInstrumentReferenced`.
- `packages/domain/src/checks/cnpj.ts` (+`.test.ts`) -- new: `isValidCnpjFormat(value: string): boolean`, strips non-digits, requires exactly 14.
- new `packages/domain/src/checks/pre-issue-client.ts` (+`.test.ts`) -- small, isolated: exports a minimal `PreIssueRow = { key: string; text: string }` and `clientPreIssueRows(client: ClientRow | null): PreIssueRow[]`, returning `[{key:'cnpj_do_contratante_em_branco', text:'CNPJ do contratante em branco'}]` when `client !== null && client.cnpj === null`, else `[]`. Deliberately not named `pre-issue.ts` and not an aggregator -- Epic 7 composes the real `preIssue(snapshot)` later and can import this.
- new `packages/domain/src/text/normalize-name.ts` (+`.test.ts`) -- `normalizeRegistryName(value: string): string` = NFD-normalize, strip diacritics, trim, lowercase. Used by both the server merge (apps/api) and, optionally, client-side duplicate hinting.
- `packages/domain/src/registry/instrument-row.ts` -- pattern to mirror in new `packages/domain/src/registry/client-row.ts` (+`.test.ts`) (`clientRegistryRowText(client): {primary, secondary}`, secondary = CNPJ or "CNPJ não informado") and new `packages/domain/src/registry/word-row.ts` (+`.test.ts`) (`wordRegistryRowText(row): {primary, secondary}` shared by manufacturer and voltage_class, alphabetical comparator).
- new `packages/domain/src/seed/criteria.ts` (+`.test.ts`) -- `criterionTypeSchema` (`absolute_min|absolute_max|deviation_between|deviation_vs_calculated|pass_fail`), `criterionSeedSchema` (`{key, operator: string, value: number, unit: string|null, type, source:{name,edition:string|null}}`), `SEEDED_CRITERIA` (the 3 rows: isolação `>400 MΩ`, resistência de contato `<250 µΩ`, relação de transformação `±0,5 %`, source `{name:'aceitável na ficha', edition:null}`), and `compareCriterion(measured:{value:number,unit:string|null}, criterion): boolean` -- generic-operator dispatch (`>`,`<`,`>=`,`<=`) after a small internal Ω-unit scale table (µΩ/mΩ/Ω/kΩ/MΩ/GΩ) converts `measured` into `criterion.unit`; `±` operator instead checks `Math.abs(measured.value) <= criterion.value` (no unit conversion, used for the percent deviation type). Seed-time test asserts a hand-built invalid row (missing operator/type/source) throws on `.parse`.
- `packages/domain/src/index.ts` -- barrel-export all 6 new modules above (mirror the existing flat `export * from './x.ts'` list).
- `apps/api/src/sync/apply.ts:92-160` (`applyOne`) -- before computing `refs`/`next` for a `kind:'create'` op whose `path` matches `registry/manufacturer/{id}` or `registry/voltage_class/{id}`: query existing live (`removed_at is null`) entities of the same kind+company, compare `normalizeRegistryName(existing.name)` to the incoming row's `name`; on a match, rewrite the op's effective target id to the existing row's id before the rest of `applyOne` runs (so the write merges into the canonical row instead of creating a duplicate). Import `normalizeRegistryName` from `@app/domain`.
- `apps/api/src/sync/sync.integration.test.ts:167-193` (`instrumentCreate` pattern) -- add `manufacturerCreate`/`voltageClassCreate` op-builder helpers, then one new test: two create ops ("Schneider"/"SCHNEIDER", different literal ids) applied for the same company, assert the pull stream / `entities` table has exactly one live manufacturer row.
- `apps/web/src/components/combobox.tsx`, `apps/web/src/components/chip.tsx` -- reuse verbatim, unchanged; both are already generic and support everything 2.4/2.5 need (`onCreate` trailing "Criar…" option already implemented, plain tap `Chip` already implemented).
- new `apps/web/src/components/registry-picker-field.tsx` (+`.test.tsx`) -- `RegistryPickerField({label, options, recentIds, value, onChange, onCreate})`: renders a `.chip-row` of the up-to-5 `recentIds` options as tap `Chip`s plus a trailing "Outro…" `Chip`, and a `Combobox` (from `combobox.tsx`) with `onCreate`; CSS shows the chip row and hides the Combobox below the tablet breakpoint and the reverse above it (mirror the existing `.frame-*` show/hide convention in `app.css`, not a JS `matchMedia`). Component tests cover: recents render as chips, tapping "Outro…" reveals the Combobox, typing an unmatched name and selecting "Criar…" calls `onCreate` and the caller's updated `options` makes the new entry immediately selectable. This is the shared "Combobox + chip row" component 2.4 and 2.5 both need, tested standalone since no sheet consumes it yet (Epic 5).
- `apps/web/src/components/index.ts` -- export `RegistryPickerField`.
- `apps/web/src/copy/ui.ts:54` -- add `registryPicker: { other: 'Outro…' }` beside `combobox`.
- `apps/web/src/db/home-store.ts:38-48` (`clientRows`/`instrumentRows` pattern) -- tighten `clientRows` to a type-predicate filter like `instrumentRows` (returns `ClientRow[]`); add `manufacturerRows`/`voltageClassRows` following the identical pattern.
- `apps/web/src/surfaces/registries/instrumentos-tab.tsx`, `instrument-panel.tsx` -- the list+panel structure and op-commit pattern to mirror exactly for the three new tabs below.
- `apps/web/src/surfaces/registries/clientes-tab.tsx` -- replace the placeholder: list (via `clientRows`, alphabetical) + persistent panel, "Novo cliente" toolbar button, empty state "Cadastrar cliente".
- new `apps/web/src/surfaces/registries/client-panel.tsx` (+`.test.tsx`) -- fields name, CNPJ (`isValidCnpjFormat`), contact_name, contact_phone, and a sites sub-list editor (add/remove address rows, each change re-commits the whole `sites` array as one field, same "whole-value" pattern `instrument-panel.tsx` uses for `test_isolacao` etc.); Arquivar/Remover footer driven by `isClientReferenced(id, projectRows)`.
- `apps/web/src/surfaces/registries/fabricantes-tab.tsx`, `classes-tensao-tab.tsx` -- replace the placeholders: each a thin wrapper around a new shared `apps/web/src/surfaces/registries/word-registry-tab.tsx` (+`word-registry-panel.tsx`, +tests) parameterized by `kind: 'manufacturer'|'voltage_class'` and its own copy, list+panel with `name`/`gender`/`number` fields, using `RegistryPickerField` is NOT needed here (the tab itself just lists/edits rows directly like Instrumentos; `RegistryPickerField` is the *field*-level picker other future surfaces will use to pick-or-create a manufacturer/voltage-class value, tested standalone per the component note above).
- `apps/web/src/surfaces/registries/criterios-tab.tsx` -- replace the placeholder: imports `SEEDED_CRITERIA` from `@app/domain` directly (no Dexie query), renders a read-only `<table className="data-table">` (reuse `apps/web/src/styles/components.css:791-796` `.data-table`/`.cell-crit`/`.cell-dim`, no new shared CSS needed) with columns test sub-block type · criterion (`.cell-crit`) · source (`.cell-dim`) · used by; "used by" is static seed-authored prose per criterion (no block/sheet data exists before Epic 5), added as a 4th field on each `SEEDED_CRITERIA` entry, not derived.
- `apps/web/src/surfaces/registries/registries.css` -- add Clientes' sites sub-list rows and the `.chip-row`/`Outro…` breakpoint rule for `RegistryPickerField`, following the file's existing "base rules here, `.frame-*` variants in `app.css`" split (see its own header comment).
- `apps/web/src/copy/pt-br.ts:206-219` (`registries` block) -- add sibling nested objects `clientes`, `fabricantes`, `classesTensao`, `criterios` (field labels, empty states, archive-only reason, sites add/remove labels), following the existing `instrumentos` block's flat-key style.
- `e2e/cadastros.spec.ts:18-58` (`instrumentOp`, `seedUser`, `syncNow` helpers) -- add `clientOp`/`manufacturerOp`/`voltageClassOp` builders; new tests tagged `2.4-E2E-00X`/`2.5-E2E-00X`/`2.6-E2E-00X` (`@p0` for each tab's core create+autosave+row-render flow, `@p1`/`@p2` for CNPJ validation, archive-only, offline create+sync, chip-row/Combobox reveal, and the read-only Critérios table).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts`, `contract/examples.ts` -- extend the `client` schema and its fixture (sites/contact) -- unblocks every client op path.
- `packages/domain/src/checks/{client-reference,cnpj,pre-issue-client}.ts` (+tests) -- pure kernel checks for 2.4's referenced/CNPJ/pre-issue ACs.
- `packages/domain/src/text/normalize-name.ts` (+test) -- shared normalization, used by the server merge.
- `packages/domain/src/registry/{client-row,word-row}.ts` (+tests) -- composed row text/sort for Clientes/Fabricantes/Classes de tensão.
- `packages/domain/src/seed/criteria.ts` (+test) -- criterion schema, `SEEDED_CRITERIA`, `compareCriterion` with unit scaling -- covers 2.6's kernel AC and I/O matrix rows.
- `packages/domain/src/index.ts` -- barrel-export the new modules.
- `apps/api/src/sync/apply.ts` -- the normalized-name merge for `registry/manufacturer`/`registry/voltage_class` creates.
- `apps/api/src/sync/sync.integration.test.ts` -- the merge test (2.5's AC) plus `manufacturerCreate`/`voltageClassCreate` helpers.
- `apps/web/src/components/registry-picker-field.tsx` (+test), `components/index.ts`, `copy/ui.ts` -- the shared Chip-row+Combobox field component (2.4 & 2.5).
- `apps/web/src/db/home-store.ts` -- typed `clientRows`/`manufacturerRows`/`voltageClassRows`.
- `apps/web/src/surfaces/registries/clientes-tab.tsx`, `client-panel.tsx` (+test) -- the real Clientes tab.
- `apps/web/src/surfaces/registries/{fabricantes,classes-tensao}-tab.tsx`, `word-registry-tab.tsx`, `word-registry-panel.tsx` (+tests) -- the real Fabricantes/Classes de tensão tabs.
- `apps/web/src/surfaces/registries/criterios-tab.tsx` -- the real, read-only Critérios de aceitação tab.
- `apps/web/src/surfaces/registries/registries.css`, `apps/web/src/styles/app.css` -- Clientes sites sub-list + `RegistryPickerField` breakpoint rules.
- `apps/web/src/copy/pt-br.ts` -- `clientes`/`fabricantes`/`classesTensao`/`criterios` copy blocks.
- `e2e/cadastros.spec.ts` -- new `@p0`/`@p1`/`@p2` cases per tab.

**Acceptance Criteria:**
- Given the Clientes tab, when a client is added with name, optional 14-digit CNPJ, one or more sites (address), and a contact name/phone, then each change autosaves as a `registry/client/{id}` op, the row shows name + CNPJ (or "—"), and a client referenced by a Project offers only "Arquivar" (Story 2.4 AC1).
- Given the client's CNPJ is blank, when `clientPreIssueRows` runs over that client, then it returns the "CNPJ do contratante em branco" row (Story 2.4 AC3).
- Given the Fabricantes/Classes de tensão tabs, when a manufacturer (name+gender+number) or voltage class is added, then it autosaves as `registry/manufacturer/{id}`/`registry/voltage_class/{id}` and is immediately queryable on this device (Story 2.5 AC1).
- Given `RegistryPickerField` with a typed name absent from `options`, when "Criar "texto"" is selected, then `onCreate` fires with the trimmed text and, once the caller adds it to `options`, the field can select it at once, offline (Story 2.4 AC2, Story 2.5 AC3, satisfied at component level per Boundaries).
- Given two devices create "Schneider" and "SCHNEIDER" while offline, when both ops reach the server, then exactly one live manufacturer entity is materialized (Story 2.5 AC4).
- Given the seed module's three criteria and `compareCriterion`, when the seed tests run, then a criterion missing operator/type/source is rejected, and 330 MΩ/251 µΩ/0,4% deviation/147 GΩ each compare as specified in the I/O matrix (Story 2.6 AC1-2).
- Given the Critérios de aceitação tab, when it renders, then it is a read-only table sourced only from the seed module, with no row actions (Story 2.6 AC3).

## Spec Change Log

_None — no bad_spec loopback occurred._

## Review Triage Log

### 2026-09-22 — Review pass

- verdicts: 16 findings — high 1, medium 3, low 10, false 2, maybe-false 0
- findings:
  - `[high]` `[patch]` `apps/api/src/sync/apply.ts:157-183` -- the normalized-name merge only redirects a `kind:'create'` op; a `put`/`remove` on the same locally-minted manufacturer/voltage_class id, pushed in the same sync batch right after its own create (the normal flow: name commits as create, gender/number commit as separate puts), silently no-ops once the create merges into another device's existing row (`packages/domain/src/ops/apply.ts:255`'s missing-entity no-op) -- no rejection, no error, fields vanish. Verified by tracing `applyOps`' per-request op loop and `applyOp`'s missing-`current` branch. Fixed: an in-memory id-redirect map scoped to one `applyOps` request, built as creates merge, consulted before every later op in the same request resolves its target.
  - `[medium]` `[defer]` Corollary of the above: the *creating* device's own local Dexie keeps the merged-away id as a permanent, unreconciled duplicate row (the sync protocol has no "your create was superseded, rewrite to id X" signal). Real but requires a sync-protocol extension outside this batch's scope; added to `deferred-work.md`.
  - `[low]` `[patch]` `packages/domain/src/registry/client-row.ts` -- the row's CNPJ text is the raw, unformatted string the user typed (no "CNPJ " label, no punctuation), unlike the mock's `"CNPJ 00.000.000/0001-00 · ..."`. Grouped with the next finding (same root cause: no canonical CNPJ format anywhere in the pipeline). Fixed: format for display in `client-row.ts`.
  - `[low]` `[patch]` `packages/domain/src/checks/cnpj.ts` -- no canonicalization step before persisting `cnpj`, so two visually different strings (punctuated vs. digits-only) for the same real CNPJ can coexist. Fixed: canonicalize to the standard punctuated form at commit time in `client-panel.tsx`.
  - `[low]` `[patch]` `apps/web/src/surfaces/registries/client-panel.tsx` (`CnpjField`) -- the inline `role="alert"` error fires on every keystroke of an in-progress, not-yet-14-digit CNPJ, so a screen reader announces "CNPJ inválido" repeatedly during normal typing. Verified: the component validates on every `onChange`, not on blur. Fixed: validate/announce only after blur.
  - `[medium]` `[patch]` `apps/web/src/components/registry-picker-field.tsx:36-49` -- `.rpf-chip-row` (with its own `field-label`) is never hidden once "Outro…" reveals `.rpf-combobox` (which renders its own `field-label` via `Combobox`), so on tablet/phone -- the component's primary target -- two identical labels are visible at once. Verified directly against the component and `app.css:221-227` (the chip-row-hiding rule only applies at `min-width:1280px`, i.e. desktop, where the chip row never shows regardless). Fixed: stop rendering the chip row once the Combobox is shown.
  - `[low]` `[patch]` `e2e/cadastros.spec.ts` (2.6 Critérios test) -- hardcodes `'>400 MΩ'`/`'<250 µΩ'`/`'±0,5 %'` as literal strings, a second, hand-synchronized copy of the seed module's numbers (the one place outside `packages/domain/src/seed/criteria.ts` a criterion value appears verbatim) -- a defensible reading of NFR-14 excludes test assertions (it names "application code and the document layout"), but asserting via `formatCriterionValue(criterion)` imported from `SEEDED_CRITERIA` is strictly more robust and just as simple. Fixed.
  - `[false]` `[reject]` `RegistryPickerField` is imported only by its own test, not by any real Clientes/Fabricantes surface -- refuted: the spec's own Boundaries explicitly required exactly this ("do not wire the picker into an actual 'Novo relatório' or field screen... satisfy at the component level"), matching the task's own stated build policy for future-epic-dependent ACs. This is compliance, not a defect.
  - `[low]` `[patch]` `packages/domain/src/registry/client-row.ts`/`word-row.ts` (`compareClientRows`/`compareWordRows`) -- plain `<`/`>` string comparison sorts accented pt-BR names (e.g. "Água") by UTF-16 code unit, not locale order. Mirrors an existing precedent (`compareInstrumentRows`) but applied to free-text proper names, a materially different case. Fixed: `localeCompare(b, 'pt-BR')`.
  - `[false]` `[reject]` `clientPreIssueRows` is never rendered in the Clientes UI, so AC3 has no end-to-end visibility -- refuted: the spec's Boundaries/Design Notes explicitly scoped the full `preIssue` aggregator out (it reads a `RelatorioSnapshot` that does not exist before Epic 4; Epic 7 owns the aggregator), consistent with the task's explicit "keep your preIssue additions small and separate" instruction. This is compliance, not a defect.
  - `[low]` `[reject]` `packages/domain/src/schemas/entities.ts` (`client.sites`) has no `min(1)`, and no UI validation blocks saving a client with zero sites, despite AC1's "one or more sites" wording -- consistent with this app's established "no field required, nothing blocks" autosave philosophy, already applied identically and accepted in Story 2.1's own review (instrument/Empresa fields); adding a min-1 guard here would introduce inconsistent blocking behavior for a confusion-only harm. Not worth the fix.
  - `[medium]` `[patch]` `apps/web/src/surfaces/registries/criterios-tab.tsx` + `apps/web/src/styles/components.css:791-796` -- every `<td>` carries a `data-label` attribute with no CSS consuming it anywhere in the repo (verified by grep), and `.data-table` has no mobile/overflow handling at all -- a real, verified risk of horizontal overflow at 390px for the "used by" column's long free text, which the spec's own manual-check step calls for but was not evidenced as performed. Fixed: wired the existing `data-label` attributes to a mobile card-stacking rule for `.data-table`, verified with a live 390px snapshot showing no page-level sideways scroll.
  - `[low]` `[defer]` `apps/api/src/sync/apply.ts:167-169` -- the normalized-name merge loads every live registry row for the company (all kinds) on every manufacturer/voltage_class create, an O(n) full-registry scan with no SQL-level kind filter. Fine at MVP registry scale; added to `deferred-work.md` as a known scaling limit to revisit if registries grow large.
  - `[low]` `[patch]` `packages/domain/src/text/normalize-name.ts` -- only folds case/accents/surrounding whitespace, not internal whitespace runs (e.g. "Schneider" vs "Schneider  Eletric" double-space would not merge). Fixed: collapse internal whitespace too. (Comma-vs-period decimal separators were considered and rejected: this app is pt-BR only and already uses comma consistently per its own copy conventions, so that specific collision is not realistic.)
  - `[low]` `[patch]` `packages/domain/src/seed/criteria.ts` (`compareCriterion`) -- when `measured.unit`/`criterion.unit` differ and either is outside the Ω scale table, the function silently falls through to a raw unscaled comparison instead of failing loudly, the opposite of the module's own eager-`.parse()` philosophy. No live caller exercises this today (no block/sheet exists, `compareCriterion` is unwired), but it is a latent footgun for Epic 5. Fixed: throw on incompatible/unknown units.
  - `[low]` `[defer]` `apps/web/src/surfaces/registries/client-panel.tsx`/`word-registry-panel.tsx` -- two differently-labeled controls ("Fechar edição" icon button, "Fechar" footer button) both close the panel, a pre-existing pattern carried forward verbatim from `instrument-panel.tsx` (Story 2.1, already merged), not introduced by this diff. Not this story's problem.

## Design Notes

**"Used by" column has no live data source yet.** No block/sheet exists before Epic 5, so this column cannot be derived; each `SEEDED_CRITERIA` entry carries its own static, seed-authored `usedBy` prose string instead (e.g. which test sub-block it governs), consistent with NFR-14 ("no criterion number outside the seed module") since it names sub-blocks, not values.

**`preIssue` is not built here.** The architecture spine defines `preIssue` as a pure function over a `RelatorioSnapshot` (AD-15), which only exists from Epic 4 onward. `clientPreIssueRows` is a small, separately-named, standalone helper -- Epic 7's real aggregator calls it later. Keeping it in its own file (`checks/pre-issue-client.ts`, not `checks/pre-issue.ts`) is deliberate: a parallel batch (Stories 2.2/2.3) may add its own isolated warning helper for razão social/logo, and two same-named small files never conflict on merge the way two edits to one shared `preIssue.ts` would.

**Server merge scope.** Because manufacturer/voltage_class are stored on sheets *by value* (AR-18), the merge only needs to prevent two live registry rows with the same normalized name from existing after both ops land -- no id-reference rewrite is needed anywhere else.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm verify` -- expected: lint, static, test:unit (new kernel tests), test:api (new merge + cross-tenant coverage), test:e2e `@p0` all green.
- `docker compose --profile tools run --rm tools pnpm test:e2e:full` -- expected: new `@p1`/`@p2` cases also pass (evidence in the PR body, not gating).

**Manual checks (if no CLI):**
- Real-browser pass (390/768/1280, light/dark, keyboard-only, offline) on `/cadastros`'s four new tabs: chip row wraps and never scrolls sideways, Combobox reveal/create works offline, Critérios table has no interactive row controls, sites sub-list add/remove keeps focus sane.

## Auto Run Result

**Summary:** Implemented Stories 2.4 (Clientes), 2.5 (Fabricantes/Classes de tensão) and 2.6 (Critérios de aceitação) in one PR, filling the four placeholder Registries tabs on top of Story 2.1's shell, plus the kernel/server work each story needed.

**Files changed (one line each):**
- `packages/domain/src/schemas/entities.ts` -- extended `registryRowSchemas.client` with `contact_name`/`contact_phone`/`sites`.
- `packages/domain/src/checks/{client-reference,cnpj,pre-issue-client}.ts` (+tests) -- referenced-client check, CNPJ format check + canonicalizer, isolated pre-issue warning row.
- `packages/domain/src/text/normalize-name.ts` (+test) -- case/accent/whitespace-fold used by the server merge.
- `packages/domain/src/registry/{client-row,word-row}.ts` (+tests) -- composed row text/sort for Clientes/Fabricantes/Classes de tensão, pt-BR locale sort.
- `packages/domain/src/seed/criteria.ts` (+test) -- criterion schema, `SEEDED_CRITERIA`, `compareCriterion` with unit scaling and a loud failure on incompatible units.
- `packages/domain/src/contract/examples.ts`, `fixtures/replay-small/*` -- updated fixtures for the new `client` shape.
- `apps/api/src/sync/apply.ts` (+test) -- the normalized-name merge for manufacturer/voltage_class creates, with an in-request id-redirect map so a same-batch put/remove on a merged-away id still lands.
- `apps/web/src/components/registry-picker-field.tsx` (+test) -- the shared chip-row+Combobox field component (2.4 & 2.5), no longer double-labels when the Combobox is revealed.
- `apps/web/src/db/home-store.ts` -- typed `clientRows`/`manufacturerRows`/`voltageClassRows`.
- `apps/web/src/surfaces/registries/clientes-tab.tsx`, `client-panel.tsx` (+tests) -- the real Clientes tab (CNPJ canonicalized + validated on blur, sites sub-list, Arquivar-only when referenced).
- `apps/web/src/surfaces/registries/{fabricantes,classes-tensao}-tab.tsx`, `word-registry-tab.tsx`, `word-registry-panel.tsx` (+tests) -- the real Fabricantes/Classes de tensão tabs.
- `apps/web/src/surfaces/registries/criterios-tab.tsx` -- the read-only Critérios table, sourced only from the seed module.
- `apps/web/src/styles/app.css`, `registries.css` -- Clientes sites sub-list, `RegistryPickerField` breakpoint rules, and the `.data-table` mobile card-stacking rule.
- `apps/web/src/copy/pt-br.ts`, `copy/ui.ts` -- new tab copy blocks.
- `e2e/cadastros.spec.ts` -- 8 new tests (`2.4-E2E-001..004`, `2.5-E2E-001..003`, `2.6-E2E-001`).

**Review findings breakdown:** 16 findings from one combined review pass (adversarial + edge-case + intent-alignment). 8 patched (1 high, 2 medium, 5 low), 3 deferred (1 medium, 2 low -- added to frontmatter `deferred:` and `deferred-work.md`), 3 rejected (2 false -- `RegistryPickerField`'s and `clientPreIssueRows`' scoping matched the spec's own explicit Boundaries; 1 low -- allowing `sites: []` matches this app's established "no field required, nothing blocks" precedent from Story 2.1's own accepted review). Patching the high finding (apply.ts merge dropping same-batch puts on a just-merged id) surfaced a stale e2e assertion (`2.4-E2E-001` still expected the pre-canonicalization raw CNPJ string) -- fixed directly.

**Follow-up review recommendation:** true. Named risk: the deferred corollary of the high-severity patch -- a device whose manufacturer/voltage_class create gets server-merged into another device's row keeps that id as a permanent, unreconciled duplicate in its own local Dexie (no sync-protocol signal tells it to rewrite/drop it). The in-request redirect fix verified in this pass only covers ops arriving in the *same* push batch as the merging create; a follow-up pass should assess whether this residual client-side drift needs a protocol-level fix before Story 2.5 sees real multi-device use.

**Verification performed:** `docker compose --profile tools run --rm tools pnpm verify` run three times across this pass (post-implementation, post-patch, post-e2e-fix) -- final run fully green: lint, static, `test:unit` (domain 345+ tests, web 460+), `test:api` (71+ including the new merge/redirect tests), `test:e2e --grep @p0` (20/20 desktop-chrome + durability-desktop-chrome). Full `e2e/cadastros.spec.ts` (all tags) run directly: 13/13 passed, including all 5 pre-existing Story 2.1 tests (no regression). One `scripts/tooling.test.ts` timeout on the first post-patch `pnpm verify` run was confirmed an unrelated pre-existing flake (passed in isolation, file untouched by this diff) and did not recur on the final run.

**Residual risks:** the named follow-up-review risk above; the O(n) per-create registry scan in the merge (deferred, fine at MVP scale); the panel's two differently-labeled close controls (deferred, pre-existing Story 2.1 pattern).
