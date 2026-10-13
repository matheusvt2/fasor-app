---
title: 'Story 14.2: Local › Painel › Coluna (a painel groups colunas, equipment on the local or on a coluna)'
type: 'feature'
created: '2026-10-13'
status: 'in-review'
baseline_revision: '9b42b262b1cd503cf8c4f834a5b9d74f42193746'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: ['batched', 'oversized']
deferred: []
---

Batched: one story, one spec, one PR (batch `e14a`); kernel, api, web, e2e and documents land together because the
contract bump, the fold and the screens cannot merge apart.

<intent-contract>

## Intent

**Problem:** The location tree is cabine › coluna, so a switchgear line-up cannot be grouped and a masonry room has no Função. Story 14.2 (`epics.md` `### Story 14.2`, criteria blocks of 2026-10-10 and 2026-10-13; the 2026-10-09 block is superseded and must not be built) makes it Local › Painel › Coluna.

**Approach:** Add `kind = painel` and the cabine field `funcao` to the kernel (location row, template skeleton, op path, fold, tree, composer functions, print grouping, status decisions), bump the contract to 17, draw the three levels in the Template composer and the relatório tree from the redrawn mocks, rename the root to "local" in every on-screen string, and print a painel as a heading over its colunas.

## Boundaries & Constraints

**Always:**
- The cabine row stays the root: `kind = cabine`, keeps `se`, `env`, `agrupar_por_tipo`; identifiers, paths and the generated DOCX keep "cabine" and the FO.SERV-03 titles. On screen it reads "local" everywhere.
- A painel is a child of a cabine, carries no data and takes no block. A coluna is a child of a painel; a coluna directly under a cabine (every row and template that exists today, the seeded standard template included) stays valid, is never migrated, and reads, syncs, shows (directly under its local) and prints exactly as before.
- Replay safety: nothing an existing op log can contain may start to throw. New refusals apply only to shapes that could not exist before (`painel`, `funcao`).
- Ownership (AD-1/AD-13): every label, count, plural, announcement, meta line, TAG, order and print grouping is composed in `packages/domain`; `apps/web` renders from IndexedDB and writes ops only. Copy homes per AGENTS.md; authored pt-BR is marked `// authored:`.
- `tokens.css` and `components.css` stay byte-identical; mock page-level rules are copied verbatim into the surface's own CSS and each `.frame-*` rule first rendered gets its translation in `apps/web/src/styles/app.css` (AGENTS.md "Mock container selectors").
- TAG rule unchanged (`relatorio/tag.ts` logic untouched; `TagLocation.kind` stays `'cabine' | 'coluna'`): the painel never enters a TAG.
- The Porto Seguro golden documents and snapshot goldens keep matching with no regeneration.
- Host: every command runs in containers through `podman compose` (never `docker`, never pnpm/node on the host); see Verification.

**Never:**
- No "Verificações do local" row, counter or entry (Story 14.3), no printed site table (14.4), no CTA or "Outros equipamentos" palette entry or print group (14.5), no seed version change, no migration or wrapping of rows or templates, no node above the cabine.
- Do not edit `epics.md` or `sprint-status.yaml`. Never delete or rewrite a sentence of a planning document: append a dated note.
- No location removal in the relatório tree, no cross-parent move of a painel or coluna ("Mover para outro local"), no "Duplicar" or "Adicionar abaixo" for locations: none exists today for a cabine or coluna on that surface and no criterion asks for them (Open questions O1, O2).
- No cross-field rule in `checkTemplateRow` (`seed/template-rules.ts` header explains why); no Playwright run outside the host lock; no build of the api/tools images.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Painel create | `location/{id}` create, `kind: 'painel'`, `parent_id` of a cabine | Row stored; tree shows it at level 1 under its local | `parent_id: null` fails the row schema (`op_invalid` on push) |
| Block on a painel | `block/{id}` create or `block/{id}/location_id` put naming a painel row held in state | Refused: `applyOp` throws `LocationKindError`; nothing written | Push answers `op_invalid` for that op; a client batch is refused whole as today |
| Data on a painel | `location/{id}/se/*`, `/env/*`, `/agrupar_por_tipo` or `/funcao` put on a painel; `/funcao` put on a coluna | Refused with `LocationKindError` | `op_invalid`. `se`/`env`/`agrupar_por_tipo` on a coluna stay the silent no-op they are today |
| `funcao` put | `location/{id}/funcao` put `'primaria'`, a typed `'Medição'`, or `null`, on a cabine | Row holds the value; `funcaoLabel` gives "Primária", "Medição", null | Blank string or non-string fails the row schema |
| Pre-14.2 log | Porto Seguro and `replay-small` logs (cabine › coluna, no `funcao`) | Replay byte-equal to the committed goldens on kernel and api; tree, TAGs and section 9 unchanged | none |
| Legacy coluna beside painéis | A cabine with a direct coluna and one painel | Tree and composer show the coluna directly under the local; its sheets print in the local's direct run, before the painéis | none |
| Empty painel | A painel with no live coluna | Composer and tree show the mock's `.pnl-empty` note; "Adicionar bloco" on it is not offered; `paletteLocationFor` returns null; it prints nothing | none |
| Print, flag off or `ordem_de_campo` | Local with 2 direct transformers and painel P (3 colunas with sheets) | Subsections: `cabine` (title = local name, the direct sheets in tree order; emitted even when the direct run is empty), then `painel` (title = P's name, its sheets in tree order) | A painel with no sheet emits nothing |
| Print, `por_local_e_tipo` and flag on | Same local plus a second painel | Direct run split by type first (existing titles, local's name); then per painel a `painel` heading subsection with no sheets followed by that painel's type groups (existing title words with the local's name, `painelId` set) | A cable whose transformer is in another run prints last in its run's group without a warning; the `unpaired_cable` warning keeps its meaning (no live transformer in the cabine) |
| Local with no painel | Any cabine with no live painel holding a sheet | `groupForPrint` and `section9Layout` output deep-equal to today's | none |
| TAG collision across painéis | Two painéis of one local, each with "Coluna 5" holding a seccionadora | `SEC-C05` then `SEC-C05-2`, from `instantiateTemplate` and from the palette | none |
| Status | Painel create/rename/reorder/remove or a `funcao` put on a Rascunho relatório; the same on an Emitido one | `countsAsFieldContent` false (stays Rascunho); `countsAsEdit` true (Emitido reopens as Em revisão in the same batch, as a location rename does today) | none |
| Template block on a painel ref | `setQuantity(template, painelRef, ...)`; a stored template block whose ref names a painel | `setQuantity` throws; the stored block parses and every reader ignores it like an orphan | none |
| Old client | Pull with `X-Contract-Version` 16 | `426 contract_outdated` (`MIN_CONTRACT_VERSION = 17`) | Client shows "Atualizar" as today |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `schemas/entities.ts:343-362` -- `locationRowSchema`: add the `painel` member (`parent_id` non-null) and `funcao` on the cabine member.
- `schemas/block-config.ts:191-206` -- `skeletonNodeSchema`: add `painel` (`parent_ref` string) and `funcao` on the cabine node; `seed/template-rules.ts:30-36` skeleton-only parent rules.
- `ops/path.ts:34,88-92,203-211,473-478` -- family table; add `location/funcao` beside `location/agrupar_por_tipo`. `ops/apply.ts:60-76` `targetsOf`, `:343-351` and `:405-414` location read/write, `:183` `SeedPathError` (model for the new error), `:477-494` `applyOp`.
- `contract/version.ts` -- `CONTRACT_VERSION` 16, `MIN_CONTRACT_VERSION` 16 with the dated comment blocks to extend; `contract/contract.test.ts`, `contract/examples.ts`.
- `status/edited-since.ts:36-82` `FAMILY_DECISIONS`, `:132-158` `countsAsFieldContent`; `edited-since.test.ts` family-decision and content tables.
- `relatorio/tree.ts` -- `TREE_MAX_LEVEL` (:57), `TreeLocationNode` (:106), `buildLocationTree` (:290-351), `paletteLocationFor` (:437), `LocationChoice`/`locationChoices` (:478-498), `paletteItems`, `duplicateTagSuggestion`, `newLocation` (:581). `relatorio/move.ts` `moveTargets`, `movePlan`. `relatorio/sumario.ts` `cabineMetaText`. `relatorio/cabine.ts` `cabineOf` (already depth-generic). `relatorio/ficha.ts:66` `previousCabineEnv`. `relatorio/progress.ts`, `relatorio/pre-issue.ts:120,430,443`, `relatorio/sheet-progress.ts:255`, `relatorio/project.ts:170`, `photos/gallery.ts:94`, `relatorio/block-texts.ts`.
- `templates/compose.ts` -- `cabinesOf`/`colunasOf`/`canonical` (:71-84), `addCabine`, `addColuna`, `moveNode`, `removeNode`, `setQuantity`, `composerView` (:464), `findComposerNode`. `templates/text.ts:81,91,102-164` summary, heading, `nodeSummaryText`, `KIND_NOUN`, announcements, default names. `templates/from-relatorio.ts:83`. `relatorio/instantiate.ts:109-116,199-219,243-283`.
- `print/group-for-print.ts` (whole file, 203 lines) and `print/section-9.ts:97-108,636-653` (`PrintSheetSubsection`, `section9Layout`).

Api (`apps/api/src`): `sync/apply.ts:530` `isPermanentRefusal` (add the new error); `sync/sync.integration.test.ts:103-137,370,388` (push helpers and the refusal precedents); `sync/replay.integration.test.ts`, `sync/porto-seguro.integration.test.ts`; `jobs/generate/sections/section-9.ts:161-176` (`section9Children`, one `HEADING_2` per subsection); `jobs/generate/docx.test.ts`, `docx-structure.test-support.ts`; `jobs/generate/toc.ts:27`.

Web (`apps/web/src`): composer `surfaces/templates/template-composer.tsx` (:120-122 current node, :192-252 handlers, :395-403 palette props, :474 announcer, :530-542 rename), `skeleton-list.tsx` (:41 list, :60-72 actions, :79-93 menu, :130 `CabineCard`, :200 `ColunaRow`), `block-palette.tsx:45-108`, `use-reorder.ts`, `reorder-controls.tsx`, `template-ops.ts`. Tree `surfaces/relatorio/relatorio-tree.tsx` (:181, :325 `paletteLocation`, :353-358 foot, :516-533 menu, :536 `SumarioLocation`, :717 `RailLocation`), `tree-actions.ts` (:189 `moveLocation`, :262 `createPair`, :444 `addLocation`, :471 `renameLocation`, :496 `toggleAgrupar`), `relatorio-ops.ts:48-58`, `tag-dialogs.tsx:130` `NameDialog`, `block-palette-field.tsx:87-247`, `move-block-dialog.tsx`. Sheet `surfaces/ficha/cabine-block.tsx:43-184`. Copy `copy/pt-br.ts:338-345,429,502,636,662,807,1026-1039`. Styles `styles/app.css`, `styles/components.css:370-371` (tree indents, read-only).

Mocks (`_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/`; never read whole, grep then read ranges): `prototype/screens/42-template-composer.html` (style :1-151; palette target :175-190; heading :207-210; local cards :212-337; painel card :223-236,257-296; empty painel :321-332; menus :587-624; Função dialog `#tc-dlg-local` :628-657), `prototype/screens/40-relatorio-overview.html` (style :1-152; local rows :233-300; painel rows :236-259; menus :346-371; palette line :387), `prototype/shell-foot.html:42-158` (`rail-tree`), `MOCK-GUIDE.md:143-162`. Skip the 14.3 rows (`.s9-verif`, "Verificações do local": 42 at :215,:248,:309,:343,:377,:411,:445,:631; 40 at :125,:234,:243,:264,:273,:282,:291,:301; rail at :55,:82,:117,:127,:135,:143,:151) and the 14.5 CTA entries (42 at :187-188,:283; 40 at :302-305,:470-480; rail :153).

E2E (`e2e/`): `templates.spec.ts`, `tree.spec.ts`, `ficha.spec.ts:273,316`, `sheet-knows-12-3-12-4.spec.ts:385`, `gallery.spec.ts`, `durability.spec.ts:403,516`, `status-flow-2026-10-10.spec.ts`, `review-layout-interaction-2026-10-08.spec.ts`, `ui-hygiene.spec.ts`, `save-template.spec.ts` assert today's strings; helpers in `support/` (`merged-fixtures.ts` `signIn`, `horizontalOverflow`; `outbox.ts:188` `readStore`; `relatorio-flow.ts` `createProjectFromHome`, `createRelatorio`; `download.ts`; `tree.ts` `expandLocation`); generate-and-wait is inline in `export.spec.ts:69` and `action-plan.spec.ts:332`; `support/groups.ts:11` `SERIAL_SPECS` (checked by `scripts/e2e.test.ts:446-476`).

## Tasks & Acceptance

**Execution** (after each numbered group: run its narrow tests, commit a checkpoint on branch `story/14-2-local-painel-coluna` with a message ending in the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, and `git push -u origin story/14-2-local-painel-coluna`; never commit `.env`, `compose.local.yml` or `.scratch-e14a/`):

1. Kernel model and contract
- `schemas/entities.ts`, `schemas/block-config.ts`, `seed/template-rules.ts` -- `painel` kind in both unions; cabine `funcao: z.string()` non-blank, at most 80 characters, `.nullable().optional()` (absent and null both mean none, so no stored row or golden changes); export `FUNCAO_KEYS = ['entrada','primaria','transformacao','distribuicao']`. Skeleton rules: a painel sits under a cabine, a coluna under a cabine or a painel.
- `ops/path.ts`, `ops/apply.ts` -- family `location/funcao` (`location/{id}/funcao`, put only, `locationFuncaoPath(id)`); `LocationKindError` (exported, shaped like `SeedPathError`) thrown per the matrix; `targetsOf` also names the location a block create or a `location_id` put points at, so the check sees it (a location not in state is not checked, as today).
- `contract/version.ts` -- `CONTRACT_VERSION = 17`, `MIN_CONTRACT_VERSION = 17`, each with a dated comment (a version-16 bundle cannot parse a `painel` create nor the `funcao` path); update `examples.ts` and every test pinning 16.
- `status/edited-since.ts` -- `'location/funcao': 'edit'`, not field content; extend both test tables with the `funcao` path and painel create, rename, reorder and remove paths.
- New `relatorio/local.ts` (exported from `index.ts`) -- `funcaoLabel(funcao: string | null | undefined): string | null` ("Entrada", "Primária", "Transformação", "Distribuição", else the trimmed typed text), `FUNCAO_OPTIONS` (key and label), `defaultLocalName(funcao: string): string` ("Cabine de entrada", "Cabine primária", "Cabine de transformação", "Cabine de distribuição"; a typed função gives `Cabine de ⟨função in lower case⟩`, authored). Every surface naming a local's Função calls `funcaoLabel`.

2. Kernel tree, composer, print
- `relatorio/tree.ts`, `move.ts`, `sumario.ts` and the readers in the Code Map -- `TREE_MAX_LEVEL = 3`; nodes carry `kind` of three values and the local's `funcao`; `cabineMetaText` leads with the Função label when set; rail and Sumário meta lines composed in the kernel as the mocks word them (local, painel, coluna), without the 14.3 part; `newLocation(locations, { id, relatorioId, kind, parentId, name?, funcao? })` (default names "Painel n", "Coluna n" among siblings of that kind); `paletteLocationFor(snapshot, locationId, lastSheetId): string | null` reads only `coluna` children (a local with no coluna gives the local, a painel with none gives null); `locationChoices` and `moveTargets` leave painéis out; `movePlan` refuses a painel target (`reason: 'not-a-block-location'`).
- `templates/compose.ts`, `text.ts`, `from-relatorio.ts`, `relatorio/instantiate.ts` -- `addCabine(skeleton, ref, name, funcao?)`, `addPainel(skeleton, cabineRef, ref, name)`, `addColuna(skeleton, parentRef, ref, name)` (parent a painel or, for the legacy shape, a cabine), `setFuncao(skeleton, cabineRef, funcao)`; canonical order is cabine, its direct colunas, then each painel with its colunas; `moveNode` among siblings of the same kind and parent; `removeNode` cascades through painéis; `composerView` gives each cabine `funcao`, its direct quantities, `colunas` (legacy) and `paineis` (each with `colunas`), plus `painelCount`; `ComposerItemKind` gains `painel`; instantiate and save-as-template carry painéis and `funcao`.
- On-screen kernel text says "local": `KIND_NOUN.cabine` becomes "Local" with masculine participles ("Local Cubículo Enel movido para a posição 1 de 6", authored), painel masculine ("Painel 2 adicionado"), coluna unchanged; heading and summary "N locais · N painéis · N colunas · N blocos" (the painéis part only when there is one); `cabineSemEquipamentoText`, `summaryMissingParts`, `templateHelperText`, `galleryCabineOptions` reworded to "local" (authored). Stored default names and anything printed keep "cabine".
- `print/group-for-print.ts`, `print/section-9.ts` -- per the matrix: `PrintGroupKind` gains `'painel'`, `PrintSubsection` gains optional `painelId` (absent on every subsection of a local with no painel); a local's runs are its direct run (own blocks and everything under non-painel children) then one per live painel in tree order. `PrintSheetSubsection` gains optional `painel: true`; a painel subsection's `heading` is the painel's name in upper case (pt-BR) with no number, and the "N.k" counter skips it; the cabine's SE and environment stay on the first sheet emitted for the cabine.

3. Api
- `sync/apply.ts` -- `LocationKindError` is a permanent refusal. `jobs/generate/sections/section-9.ts` -- a `painel` subsection renders as a band paragraph (bold white on `404040`, as `.pp-painel` in `key-print-section-9.html:20`), not a `HEADING_2`, so the ÍNDICE is unchanged; a subsection with no sheets renders its heading alone.
- Integration tests through `POST /api/sync/ops` (`sync.integration.test.ts` helpers): every refusal row of the matrix answers `op_invalid` and writes nothing; a painel tree with `funcao` is accepted and the server rows equal the kernel replay of the same log; a contract-16 pull is answered 426. `docx.test.ts`-style test on a snapshot with direct transformers and a painel: band text, order and SE/env placement, asserted from its own section heading.

4. Web
- New shared Função dialog (React Aria; mock `#tc-dlg-local`: radiogroup Entrada · Primária · Transformação · Distribuição · Outra, "Qual função" only with Outra, "Nome" prefilled by `defaultLocalName` until the user edits it, "Cancelar" / "Adicionar local"); the same dialog in edit mode serves "Função e nome".
- `surfaces/templates/*` from mock 42 with its class names -- local card (kicker, flag, sub-line with Função and Agrupar por tipo, `.loc-direct` "Equipamentos no local" with the local's own steppers and `.loc-none`), "Adicionar equipamento" (makes the local the palette's current node; `.pal-target` line and "Selecione um local ou uma coluna."), "Adicionar painel", painel card with "Adicionar coluna", `.pnl-empty` note, legacy colunas directly under the local, foot "Adicionar local". Each level keeps the menu items its surface has today (rename, "Subir", "Descer", remove) through `useReorder` (drag, Alt+arrows, menu, Position box) with kernel announcements; the local's rename item is "Função e nome"; local menu adds "Adicionar painel", painel menu adds "Adicionar coluna". Removal confirm bodies per level (local: equipment, painéis and colunas; painel: its colunas).
- `surfaces/relatorio/*` from mock 40 and the rail tree -- three levels (`.s9-local`, `.s9-painel`, `.s9-col` and the rail rows, sheets under a painel's coluna at level 3 with the mock's indent mirrored in `app.css`), foot "Adicionar local" (opens the dialog; writes the create with `funcao` and name), local row "Adicionar equipamento" (targets the local itself unless it has legacy colunas, where `paletteLocationFor` stands), "Adicionar painel", painel "Adicionar bloco" (its current coluna) and "Adicionar coluna", "Função e nome" (one batch: `funcao` and `name` puts, undoable), rename and the four reorder ways at each level, every toast undoable through the existing `undoable` path.
- `copy/pt-br.ts`, `cabine-block.tsx` -- every string of the investigation list reworded to "local" (mock wording where drawn: "Locais do template", "Adicionar local", "Abrir primeira ficha (dados do local)"; authored otherwise); the sheet block reads "Do local" and the chip "Copiar do local anterior", both `// authored:`. `'Cabine primária'` as a report type stays.
- Unit tests beside each changed component and kernel module (the existing files in the Code Map), including one test per matrix row.

5. E2E and documents
- New `e2e/local-painel-coluna.spec.ts`, listed in `SERIAL_SPECS` (it generates): `@p0` at 1280 px -- compose a template with one local (Função Transformação) holding two transformers placed directly and one painel with three colunas (one seccionadora each), create a relatório from it, assert in the device `entities` store the three kinds, the `funcao`, each block's `location_id` and the TAGs `TR-1`, `TR-2`, `SEC-C01` to `SEC-C03`, fill and conclude one sheet on the local and one in a coluna, reload, generate, and assert in the DOCX the local heading, CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO once, the painel band over its sheets and the direct sheets before it; `@p0` at 768 px -- the composer and tree walk (add local through the dialog, add painel, add coluna, empty-painel note, rename, the four reorder ways with announcements, "Função e nome" and its undo) asserting outbox paths; `@p1` -- no horizontal overflow at 390 px on the composer, the Sumário with a painel, and the dialog.
- Update every spec whose strings or flows changed (list above) without weakening an assertion; `durability.spec.ts` keeps its checks on the reworded strings.
- Documents, appended and dated 2026-10-13: spine AD-6 (the `funcao` path and string shape, optional on stored rows; legacy colunas print in the direct run; the unnumbered painel band; `LocationKindError`), AD-3 or AD-13 (family `location/funcao`, contract 17), AD-15 and AD-22 (painel ops and `funcao` are an edit and structure); `docs/kbs/architecture/data-model.md`, `rendering.md`, `sync.md`, `project/vocabulary.md` and `docs/kbs/log.md`; `deferred-work.md` entries for O1 and O2 below and for anything else narrowed, each naming its owner.

**Acceptance Criteria:**
- Given the Template composer, when "Adicionar local" is used, then the dialog asks for the Função, the local appears with that Função and name, and no on-screen string calls the root "cabine".
- Given a local in the composer or the tree, when "Adicionar equipamento" is used, then new blocks are born on the local with the TAG rule for a block on a cabine; when "Adicionar painel" then "Adicionar coluna" are used, the coluna takes equipment as today, and a painel with no coluna shows why it cannot.
- Given each of the three levels on both surfaces, when a node is renamed or reordered by drag, Alt+arrow, menu and Position box, then the committed op is the existing `location/{id}/name` or `order_key` put (template: one `skeleton` put), the kernel announcement is spoken, and "Desfazer" restores the earlier value; the composer also removes at each level.
- Given a relatório created from the template of the e2e, when it is generated under each scheme with *Agrupar por tipo* on and off, then section 9 follows the matrix, and a local with no painel and the Porto Seguro goldens are unchanged.
- Given any device on contract 16, when it pulls, then it is told to update; given this bundle, when it pushes a painel tree, then both layers hold byte-equal rows.

## Spec Change Log

## Review Triage Log

### 2026-10-13 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer (opus). Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them.

- verdicts: 14 findings — high 0, medium 2, low 10, false 1, maybe-false 1
- findings:
  - `[medium]` `[patch]` `merge/info.ts` `LATEST_EDIT_FAMILIES` lacks `location/funcao` — verified at `packages/domain/src/merge/info.ts:35-45`: concurrent Função puts fold with no `latest_edit` entry, unlike the sibling location families; family added with a test.
  - `[low]` `[patch]` `tree-actions.ts` `updateLocal` writes back the untouched field when a pull changed it while "Função e nome" was open — verified: the answer was compared with the fresh row; now compared with what the dialog opened on.
  - `[low]` `[patch]` `template-composer.tsx` `onSubmitLocal` (edit mode), same defect on the skeleton — verified; same fix.
  - `[low]` `[patch]` `skeleton-list.tsx`: "Adicionar painel" or "Adicionar coluna" from the Overflow of a collapsed card adds the node hidden — verified (`collapsed` set is never cleared on add); the parent expands on add.
  - `[low]` `[reject]` `local-dialog.tsx` `funcaoOf`: "Outra" typed as a reserved label ("Primária") is stored as a typed name — real, reads the same on screen; unlikely in everyday use and the fix adds a mapping branch (spec Design Notes accept a typed text beside the keys).
  - `[low]` `[reject]` `relatorio/panel.ts` `panelLocation`: a panel label read with the palette on a local matches no coluna inside a painel, so the block is proposed on the local (`matched: false`) — real; the conservative answer when two painéis may hold the same coluna number, and the fix needs an ambiguity rule the story does not give. Listed as known open.
  - `[low]` `[patch]` `relatorio-tree.tsx` painel branch draws no equipment — verified: a block on a painel (accepted by the fold only when the painel was not in state) was counted and undrawn; the branch renders its equipment list. The other half (a painel under a non-local row) is rejected: no client writes it and the kernel tree still returns it.
  - `[false]` `[reject]` `ops/apply.ts`: a block op applied before its painel row is in state is accepted — by design: the intent contract says a location not in state is not checked (replay safety, as depth was never enforced, AD-6); no client can name a painel another device has not synced.
  - `[low]` `[patch]` `tree-actions.ts` `updateLocal` on a tombstoned local — verified (`removed_at` not read); the row is treated as gone.
  - `[low]` `[reject]` `print/section-9.ts`: a bare numbered local heading, or a bare band, when every sheet under it fails to resolve — real only for a sheet `sheetOf` cannot build (an unknown seed version); unlikely, and the fix adds a second pass over the subsections.
  - `[medium]` `[patch]` Regression gap: no tree test moves a location in a local holding a direct coluna and painéis (`tree-actions.ts:203` kind argument unobserved) — filed pre-verified; the mixed-local case added to `relatorio-tree-painel.test.tsx`.
  - `[low]` `[patch]` Broken-verification gap: `e2e/tree.spec.ts` 5.2-E2E-004 asserted a rail line that no longer changes with the edit — filed pre-verified; the test now writes from the open sheet and asserts the rail line moves.
  - `[maybe-false]` `[reject]` Thirteen specs the diff did not touch drive the redrawn section-9 rows and first meet them in the wave gate — no stale selector found by search; settled by running them: the orchestrator adds them to this batch's Playwright run (results in Auto Run Result).
  - `[low]` `[reject]` `targetsOf` now names the location of a block create or `location_id` put, so the device's `targets` index is mixed across bundles and a pulled block create re-materializes its location — traced: no wrong row (server and device write changed rows only; a location replay ignores the block ops); extra work only, and a read-only ref list would be a new public surface. Listed as known open.

## Design Notes

- `funcao` is one string: a reserved key or a typed name. A typed text equal to a key reads as that key; accepted.
- Print keeps today's flat, numbered subsections so a local with no painel is untouched. Open for Bruno and Matheus (O3): type-group titles inside a painel keep the FO.SERV-03 words with the local's name ("Seccionadoras dos Cubículos de MT do 1° Subsolo") under an unnumbered band that is not in the ÍNDICE; the print mock's unnumbered group headings under one numbered local heading are Story 14.4's check against the approved mock.
- Open questions, listed and not decided (each gets a `deferred-work.md` entry with its owner): O1 removal of a location in the relatório tree (the mock draws "Remover … recuperável até a emissão"; no location can be removed there today, see the ledger entry on `block/{id}/location_id`), so the painel "remove / Restaurar" pair exists only as the undo of a create and at the fold level -- owner Matheus; O2 the mock menu items "Mover para outro local", "Duplicar" and "Adicionar abaixo" for locations -- owner Matheus; O3 above -- owner Story 14.4; O4 announcement wording (the mock's toasts carry hints and bare names with gender agreement; this spec keeps today's noun-led sentences) -- owner Bruno's copy review; O5 a local with legacy colunas keeps the "current coluna" palette target -- owner Matheus. Scope boundaries, not narrowings: the "Verificações do local" rows (Story 14.3), the printed site table (Story 14.4), the CTA entries (Story 14.5).
- Numbers recomputed against their sources (E12-A5): contract 16 to 17 (`contract/version.ts`); tree levels 2 to 3 (rail mock, sheets at level 3); TAGs follow the kernel rule (`TR-1`, `TR-2`; the mock's "TR1 e TR2" is example text, not a rule change).

## Verification

Host rules: `podman compose` only (stack `fasor-e14a`, already up; api `:6030`, web `:6073`); tools run as `podman compose --profile tools run --rm --user root tools <cmd>` from the worktree root; redirect output to `/tmp/<stage>-e14a.log` and read the tail, never the whole log. Playwright runs only under the host lock, in the background, polled with short foreground calls (never block a call on it, never `pkill` by pattern):
`cd <worktree> && nohup sh -c 't0=$(date +%s); lockf -t 20000 /tmp/fasor-verify.lock sh -c "echo LOCKED_AFTER=\$(( \$(date +%s) - $t0 ))s; podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/<spec>.spec.ts --project desktop-chrome"; echo EXIT=$?' > /tmp/e2e-e14a.log 2>&1 &` then `grep -E "EXIT=|passed|failed" /tmp/e2e-e14a.log | tail`. Spec paths go before `--project`. Run the new spec and each spec you changed this way until green; the orchestrator runs the full story gate afterwards.

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint` -- expected: no errors
- `podman compose --profile tools run --rm --user root tools pnpm static` -- expected: no errors
- `podman compose --profile tools run --rm --user root tools pnpm test:unit` -- expected: green except the known host-only `theme.test.tsx` (and `export-dialog.test.tsx` under load, which passes alone)
- `podman compose --profile tools run --rm --user root tools pnpm test:api` -- expected: green
- Narrow runs while iterating: `pnpm exec vitest run --project @app/web <file>`, `pnpm exec vitest run packages/domain/src/<file>`.
