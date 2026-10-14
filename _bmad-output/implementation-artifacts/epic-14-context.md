# Epic 14 Context: Locals, the site checklist and office-created equipment types

<!-- Compiled from planning artifacts on 2026-10-13 (epics.md Epic 14, sprint-change-proposal-2026-10-08.md §§ 9-11,
source-deltas.md rows 2026-10-08 to 2026-10-13, spine AD-3/6/15/21/22/26, MOCK-GUIDE "Epic 14"). Current decisions
only: where an older line of the epic disagrees, the latest dated note wins and this file already applies it.
Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A masonry room is a **local** that holds its equipment directly, with no invented coluna, and a switchgear line-up is
a **painel** grouping its colunas inside the local. Every local carries its **Verificações do local** (19 site items,
C · NC · NA with observation and photos) and prints them once. The first equipment the base lacked, the chave ASCO,
ships as a seeded library type on a new generic measurement table, so the next real job is one relatório with nothing
recorded beside it. Success signal for this cycle: on the next real relatório every local carries its checklist and
no equipment is recorded outside the sheets. Company-owned types and their editor are in the epic but not in this
cycle.

## Stories

| Wave | Story | State | Dev model |
|---|---|---|---|
| 0 | 14.1 The mocks | done (approved 2026-10-13, redrawn for Local › Painel › Coluna) | - |
| 1 | 14.2 A local holds its equipment; the painel level | **next** | opus · high |
| 1 | 14.3 Verificações do local: capture (seed v4) | needs 14.2 merged | opus · high |
| 1 | 14.4 Verificações do local: the printed table | needs 14.3 merged | opus · high |
| 2 | 14.5 The measurement table and one library type, Chave de transferência automática (seed v5) | needs 14.3 merged | opus · high |
| 3 | 14.6 Company types in the kernel, 14.7 The type editor, 14.8 Office types end to end | **not this cycle** | - |

Wave 3 starts only after two or three real jobs have used the library type, with the count of new-type and
adjustment requests recorded under Story 14.6, and after the architect settles the proposed AD-21, AD-3 and AD-15
amendments. Nothing in 14.2 to 14.5 builds company-type machinery: no registry, no resolver context, no open enum.

Dropped, do not build: a node above the cabine ("Local › Cabine › Coluna"), wrapping or migrating existing rows,
the "Fonte auxiliar da proteção" type and its screen 62, rows added on site and the derived Δ% column, a fusível
sheet, a mufla sheet.

## Requirements & Constraints

**Tree (14.2).** Local › Painel › Coluna. The root row is the local: it keeps kernel `kind = cabine`, owns Função,
CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO, *Agrupar por tipo* and the site checklist, and holds equipment directly
plus zero or more painéis. A painel only groups colunas: no data, no equipment; an empty painel says why it cannot
take equipment. A coluna holds equipment. Rows created before 14.2 (a coluna directly under a cabine) read, sync,
show and print as before; nothing is migrated and the structure is tied to no seed version. Add, rename, move and
remove work at each level by the four reorder ways, announcing as today, in the Template composer and the relatório
tree.

**Print (14.2, 14.4, 14.5).** In section 9 a painel is always a heading over its colunas. With *Agrupar por tipo* on,
sheets are grouped by type inside each painel, and equipment placed directly on the local is its own type-grouped
run before the painéis; with it off each run is in tree order. A local with no painel prints exactly as today. The
VERIFICAÇÕES DO LOCAL table (ÍTEM · C · NC · NA · OBSERVAÇÕES, group rows, item labels uppercase) prints once per
local right after its AMBIENTE DE ENSAIO under both schemes, never per painel, coluna or sheet; a local with no
block still prints its header, cabine data and table. The CTA prints in an "Outros equipamentos" group after
Transformadores. A relatório on an older seed version prints unchanged and the Porto Seguro golden documents (seed
v1) keep matching after every story.

**Site checklist (14.3).** 19 fixed items in six groups (Segurança e EPC no local, Combate a incêndio, Iluminação,
Aterramento, Sinalização e documentação, Ambiente), answered once per local on the root row, never on a painel or
coluna. Same row behaviour as a sheet checklist: tri-state, observation, NC chips, photos, "Marcar os restantes como
Conforme", "Criar ponto de atenção" on an NC item. Unanswered items count in the local's progress (tree row and
Sumário) and raise one non-blocking pre-issue row naming the locals; the parecer stays the only blocking row. Only
relatórios on seed v4 or later have the checklist; templates reach v4 without any relatório's `seed_version` being
rewritten (mechanism settled in the 14.3 spec). The extinguisher item fixes no type: type, charge and validity go in
its observation.

**Library type (14.5).** One type, `chave_transferencia_automatica`: configurable tensão BT/MT, polos, neutro,
transição, bypass; nameplate, 17 checks with authored NC phrases, tests E1 to E6 and the E5 options (método, carga,
fonte dos tempos). The measurement table needs only what the CTA uses: fixed named rows, several value columns with
units, yes/no and choice results, a limit relative to a column, equality to another cell (deixado = projeto). Every
criterion names its source; a criterion without one is rejected by the kernel. The sheet behaves as a seeded sheet
(bulk actions, criteria evaluation, suggested conclusion and text, Não ensaiado, photos, points) and is offered
after the eight in both palettes, offline. Content is Matheus's draft, adjusted after first use.

**Status flow (all).** Painel create, rename, move, remove and a local's `funcao` are structure: they keep Rascunho
in Rascunho and are an edit for `editedSince`. A site item's result, observation or photo, a point with
`location_id`, and every measurement-table value are field content and an edit: the first one on a Rascunho
relatório carries the Em campo status op in the same batch and says "Relatório em campo"; on an Emitido relatório it
reopens it as Em revisão, withdraws "Marcar como enviado ao cliente" and makes the next generate build a new
revision. The status step sentence that names what moves a relatório to Em campo gains the site items in 14.3.

**Gate (2026-10-08 story gate).** Each story PR pastes `lint`, `static`, `test:unit`, `test:api` (the first two
phases of `pnpm verify`) and the Playwright specs it touched on `desktop-chrome` and `durability-desktop-chrome`;
14.2, 14.3 and 14.5 change the op fold or a live ficha query, so their touched durability specs also run on the
matrix projects. Generate specs run in the serial group. The full `@p0`, `test:e2e:full` and the full matrix run
once per wave on integrated main, launched by the coordinator; a red wave gate becomes a fix batch before the next
wave. 14.2, 14.3 and 14.5 each owe a Playwright spec that walks the whole feature as a user (offline where the
story says so, through generation); 14.4 checks the DOCX and its PDF against the approved print mock.

**This host.** Compose runs through `podman compose` (no `docker`), the host lock is `lockf` on
`/tmp/fasor-verify.lock` (no `flock`), the `tools` container runs `--user root`, and a new compose project reuses
the api and tools images by `podman tag` instead of building. No Playwright run outside the lock, at most two batch
stacks up, the main checkout's stack stopped (never `-v`) while batches run. Never queue a review pass on the lock:
use a separate stack.

## Technical Decisions

- **Location shape.** `kind` becomes `cabine | painel | coluna`. `se`, `env`, `agrupar_por_tipo`, `funcao` and
  `checklist` are valid only on `kind = cabine`. `funcao` is `entrada | primaria | transformacao | distribuicao` or a
  typed name; it is a location field, never a `se` key. A block attaches to a cabine or a coluna, never a painel.
  "Cabine anterior" stays the previous root node by `order_key`. The UI renders up to three levels.
- **Ops (append-only families, `applyOp` the only reducer on both sides, replay byte-equal).** 14.2: `painel` in
  the location kind list and `location/{id}/funcao`. 14.3: `location/{id}/checklist/{itemKey}/{result|observation}`
  (valid only on a cabine row, `itemKey` from the relatório's seed version), `file/{id}/location_id` beside
  `block_id` for a site-item photo (with `item_key`), and `location_id` on the point through the existing point
  field family. 14.5: whatever `sheet/{blockId}/test/{testKey}/...` family the measurement table needs beyond the
  existing cell family, its exact path settled in the story spec. Site items merge per item across devices as sheet
  checklist rows do.
- **Seed is versioned, append-only code.** v4 = v3 plus the site item list (19 keys, labels, groups, 3-4 NC phrases
  each) plus one Disjuntor MT checklist item, NO-BREAK DE COMANDO (15 to 16 items; NA when the breaker has none).
  v5 = v4 plus the CTA block type, with the closed type enums gaining that one key. TAG prefix, nouns for conclusion
  and caption text, template totals and the print group come from the kernel. Each version has a kernel test
  pinning exactly what it adds; earlier versions stay frozen and resolvable. AD-21 is unchanged in this cycle.
- **Status decisions live in one map.** `FAMILY_DECISIONS` in `packages/domain/src/status/edited-since.ts` is typed
  over every path family, so a new family fails `pnpm static` and a kernel test until it is decided as an edit or
  never one; `countsAsFieldContent` then needs its content-or-structure answer. AD-22 and AD-15 gain a dated note
  in the story that adds the family.
- **Section 8 and 7.** A point created from a site item carries `location_id` and the item's photos as
  `[[foto:id]]` tokens, and prints like any manual point. Site-item photos take their place in section 7 with a
  context caption naming the local and the item.
- **Ownership.** Progress, pre-issue rows, the issued banner sentence, composed labels, counts and print grouping
  are computed once in `packages/domain`; `apps/web` renders from IndexedDB and writes ops only; the renderer reads
  the frozen snapshot only.
- **Naming.** On screen the root is "local" everywhere. Identifiers, paths and the generated document keep `cabine`
  and the FO.SERV-03 titles.

## UX & Interaction Patterns

- Mocks per story (prototype screens, built with the mock's class names): 14.2 `42-template-composer.html`,
  `40-relatorio-overview.html` and the rail tree; 14.3 `61-verificacoes-local.html` and `60-ficha.html` (entry line
  under the "Do local" block, and the no-break item on the Disjuntor MT checklist); 14.4 `key-print-section-9.html`;
  14.5 `63-ficha-cta.html` and the palettes. The print mock does not yet draw type-inside-the-painel grouping:
  Story 14.2's criteria define it. Example data in these mocks is invented, not the reference relatório's.
- Buttons: "Adicionar local" (asks for the Função in a dialog), then "Adicionar equipamento" and "Adicionar painel"
  inside a local, "Adicionar coluna" inside a painel. "Adicionar equipamento" makes the local current for the
  palette steppers.
- The Verificações surface opens from the local's tree row (which shows "Verificações do local · N de 19") and from
  the line under the "Do local" block of a sheet; its header names one local (Função and name).
- The new mock CSS is page-level; `tokens.css` and `components.css` did not change. Each `.frame-*` rule first
  rendered gets its translation in `app.css` in the same change. Check 390, 768 and 1280 px plus a dialog.
- Authored pt-BR copy is marked `// authored:` and listed in the PR body for Bruno.

## Cross-Story Dependencies

Order is serial by Definition of Ready: 14.2, then 14.3, then 14.4 (wave 1), then 14.5 (wave 2). 14.4 and 14.5 both
need only 14.3 merged, but both touch section 9 (`packages/domain/src/print/group-for-print.ts` and the renderer),
so the planned waves keep 14.5 after 14.4.

One assertion per shared item (E10-A3); the undo of every new op kind is listed as a pair.

| Shared item | Owner | Assertion |
|---|---|---|
| Location `kind` | 14.2 | The kernel accepts `cabine`, `painel`, `coluna`; refuses a block, `se`, `env` or `checklist` on a painel; a pre-14.2 log (coluna under cabine) replays byte-equal on both layers. 14.3 to 14.5 read the kind and never widen it. |
| Location `funcao` | 14.2 | Written only through `location/{id}/funcao` on the root row; counts as structure; every surface that names a local (tree, composer card, Verificações header) takes the composed label from one kernel function. |
| Location `checklist` | 14.3 | Exists only on a root `kind = cabine` row of a relatório on seed v4 or later; a v1 to v3 relatório, a painel and a coluna show none and print none. 14.4 reads it from the snapshot and adds no op. |
| Undo pair: painel | 14.2 | create painel / remove it; remove painel / "Restaurar" (put `removed_at = null`); rename or move / put of the earlier `name`, `parent_id` or `order_key`. |
| Undo pair: `funcao` | 14.2 | put `funcao` / put of the earlier value. |
| Undo pair: site item | 14.3 | put `result` or `observation` / put of the earlier value (unanswered included); "Marcar os restantes como Conforme" is N ops in one `batch_id` / N inverse ops in a new batch; when the batch carried the Em campo or Em revisão status op, the undo inverts that status op too. |
| Undo pair: measurement-table value | 14.5 | put of a cell, yes/no or choice result / put of the earlier value, with the same status-op rule as a site item. |
| Photo and point `location_id` | 14.3 | A site-item photo is a `file` with `location_id` and `item_key`; a point from an NC item carries `location_id`; both count as field content; removing either follows the existing photo and point pairs. 14.4 prints them from these two fields only. |
| `groupForPrint` with painéis | 14.2 | Direct equipment first, then each painel as a heading, type grouping inside each run when *Agrupar por tipo* is on; a local with no painel emits exactly the pre-14.2 parts. 14.4 places the site table once per local right after its AMBIENTE DE ENSAIO and 14.5 appends "Outros equipamentos" after Transformadores without changing that order. |
| TAG rule | 14.2 | `relatorio/tag.ts` is unchanged: two painéis each with a "Coluna 5" seccionadora give `SEC-C05` and `SEC-C05-2`; the painel never enters a TAG. 14.5 adds only the CTA prefix. |
| Seed v4 | 14.3 | Differs from v3 only by the site item list and the NO-BREAK DE COMANDO item; frozen once 14.3 merges. 14.4 adds nothing to it. |
| Seed v5 | 14.5 | Differs from v4 only by the CTA block type; frozen once 14.5 merges. No story edits a merged version; a later change is a new version. |
| Contract version | each story that adds a path family or enum value | Current value 16, minimum 16. 14.2 (`painel`, `funcao`), 14.3 (checklist family, `location_id` on file and point) and 14.5 (block type key, any new sheet family) each bump once, in merge order, with the `MIN_CONTRACT_VERSION` decision written in the PR and an api integration test through the sync route. 14.4 is renderer work and is expected to bump nothing. |
| `FAMILY_DECISIONS` | the story that adds the family | 14.2: painel ops and `funcao` are an edit and structure. 14.3: `location/checklist` is an edit and field content. 14.5: every new sheet family is an edit and field content. The family-decision kernel test lists each new path. |
| "Do local" copy | 14.2 | The sheet block reads "Do local" and the chip "Copiar do local anterior", each from one entry in the copy modules; no on-screen string says "cabine" for the root. 14.3 links its entry line to that block and adds no second label. The DOCX still says "cabine". |
| Emitido banner on Verificações | 14.3 | The surface shows the issued banner with its own kernel sentence beside the sheet's one (which says "esta ficha"); the web holds neither sentence. |

**Open with Bruno (authored copy, reviewed before the first real job, none blocks a merge):** the NC chip phrases of
the 19 site items; the "Do local" and "Copiar do local anterior" labels; the wording and NC phrases of the NO-BREAK
DE COMANDO item; whether the section 3 sentence that excludes the no-break is reworded.

**To settle in a story spec, not decided here:** how templates reach seed v4 (14.3); the measurement table's exact
path family, and whether the E5 options are sheet values (field content) or block config (structure today) (14.5).

## Added 2026-10-13: location removal in the relatório tree (Story 14.2, review of PR #126)

Matheus decided that Story 14.2 also removes and restores a coluna, a painel and a local in the relatório tree (`epics.md` Story 14.2, criteria block of 2026-10-13). What the later stories of this epic take from it:

- A removed location is absent from the snapshot together with everything under it (`live()` in `packages/domain/src/schemas/snapshot.ts` gains an ancestor rule). Story 14.3's site checklist and its points of attention hang on a local: when the local is removed they leave the counters, the pre-issue list and section 8 with it, and come back with its restore. Story 14.3 states this in its spec and tests it; it adds no tombstone of its own for checklist values.
- The removal batch is `location/{id}/removed_at` and `block/{id}/removed_at` writes only. Story 14.3's `location/{id}/checklist/...` ops on a removed local are folded (the row keeps the values) and hidden by the same rule.
- Story 14.4 prints nothing for a removed local, painel or coluna; its site table follows the local.
- Contract stays 17 for this: no new path.

## Added 2026-10-13: batch plan in two parallel lanes (Matheus: run this epic as the earlier ones, batched and in parallel)

The wave table above ran the stories one by one, each waiting for the merge before it. From here the epic follows
`epic-batch-orchestrator.md` § 6 as Epic 13 did: stories batched along data dependencies, two batch stacks at a
time, stacked branches, one integrated review at the end.

| Batch | Stories | Branch, base | Contract, seed | State |
|---|---|---|---|---|
| e14a | 14.2 (with the removal pass of 2026-10-13) | `story/14-2-local-painel-coluna`, from main | 17, no seed | ~~PR #126, second pass running~~ merged 2026-10-13 as `cbce841` |
| e14b | 14.3 and 14.4 (site checklist: capture and print, one data set) | `story/14-3-14-4-verificacoes-do-local`, stacked on e14a at `6493597` | 18, seed v4 | ~~starts 2026-10-13~~ PR #127 merged 2026-10-13 as `f1f7ec9` |
| e14c | 14.5 (measurement table and the CTA type) | `story/14-5-measurement-table-cta`, stacked on e14b's first kernel commit | 19, seed v5 | ~~starts when the e14a stack frees~~ started 2026-10-13 from e14b kernel commit `fbcf432`, kernel phase first with no stack of its own; its stack comes up when the e14a stack stops |

Rules for the lanes:

- Numbers are assigned here, not by merge order: e14b takes contract 18 and seed v4, e14c takes contract 19 and
  seed v5 (v5 is v4 plus the CTA type and its "Outros equipamentos" group). Neither batch takes another number.
- e14b pushes its kernel slice first (seed v4, the `location/{id}/checklist/...` family, the row fields, contract
  18, the no-break item on the Disjuntor MT checklist) as its own early commit and tells the coordinator, so e14c
  can stack on it.
- A stacked PR is opened with `--base main` once the batch under it has merged; the batch merges `origin/main`
  into its branch first, resolves, and runs its story gate on that merge. No gate runs on a base that is still
  moving. Files both lanes edit and where conflicts are expected: `apps/web/src/copy/pt-br.ts`,
  `packages/domain/src/status/edited-since.ts` (`FAMILY_DECISIONS`), `packages/domain/src/contract/version.ts`,
  the seed index, `apps/web/src/surfaces/relatorio/relatorio-tree.tsx`, `apps/api/src/jobs/generate/sections/section-9.ts`,
  `packages/domain/src/print/`, `deferred-work.md`, the spine and `docs/kbs/log.md`. Keep both sides.
- Section 9 is shared by e14b (the site table after AMBIENTE DE ENSAIO, the type-group titles under a painel) and
  e14c (the "Outros equipamentos" group after Transformadores): each batch touches only its own part and adds its
  own golden or structure test; the Porto Seguro goldens match after each.
- The coordinator's check of each PR is the PR body, the gate record and the cross-batch contracts; the four-lens
  review and the browser pass run once, on the integrated main after the last merge (playbook § 6), followed by one
  fix batch.
- Wave gate (full `@p0`, `test:e2e:full`, the matrix) once, on the integrated main after e14c merges.
- Settled for e14c (coordinator, 2026-10-13, from Matheus's "deixe configurável as opções" of 2026-10-09 and
  `sprint-change-proposal-2026-10-08.md` § 8.4): the E5 options (método, carga with its % when "com carga", fonte
  dos tempos) say how the test was run on site, so they are **sheet values chosen by the technician on the sheet**,
  field content for the status flow, printed beside the E5 times. They are not `BlockConfig`. What stays block
  config is what shapes the sheet before the visit: tensão BT/MT, polos, neutro, transição, bypass.

