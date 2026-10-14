---
title: 'Stories 14.3 and 14.4: Verificações do local, captured per local and printed once in section 9'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_revision: 'f60fd938a573ca8222aeff5c17887605e687a044'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
deferred:
  - summary: >-
      The boot wiring of upgradeTemplateSeeds (main.ts, migrate-cli.ts) is exercised by no test.
    evidence: |-
      Verification Gap Reviewer, filed pre-verified: the integration test calls the function directly and the e2e seed creates templates on the current seed, so deleting the call in main.ts fails nothing. Ledger: deferred-work.md, review of batch e14b, first entry (owner: the coordinator's wave gate).
    location: >-
      apps/api/src/main.ts:45
    severity: low
  - summary: >-
      "Legendar" on a site photo is opened by no test.
    evidence: |-
      Verification Gap Reviewer, filed pre-verified: no test references PhotoCaptionDialog with a site photo; deleting either prefillText prop fails nothing. Ledger: deferred-work.md, review of batch e14b, second entry (owner: the epic QA).
    location: >-
      apps/web/src/surfaces/photos/photo-caption-dialog.tsx:36
    severity: low
---

Batched: Stories 14.3 and 14.4 are one data set (the site checklist of a local, captured and printed), so one spec, one review, one gate and one PR (batch `e14b`, branch `story/14-3-14-4-verificacoes-do-local`, stacked on Story 14.2's branch).

<intent-contract>

## Intent

**Problem:** A relatório records nothing about the room itself: its safety gear, fire protection, lighting, grounding, signage and condition. Story 14.3 (`epics.md` `### Story 14.3`, with its 2026-10-13 status-flow block) captures 19 site items once per local; Story 14.4 (`### Story 14.4`, with its 2026-10-13 criterion) prints them once per local in section 9.

**Approach:** Seed v4 (v3 plus the site item list and one Disjuntor MT item), a cell-shaped `checklist` on the root `cabine` row written through the new family `location/{id}/checklist/{itemKey}/{result|observation}` (contract 18), `location_id` on photo and point rows, kernel progress, pre-issue, caption and print functions, the capture surface built from mock 61 on the sheet checklist's own row component, and the VERIFICAÇÕES DO LOCAL table right after AMBIENTE DE ENSAIO.

## Boundaries & Constraints

**Always:**
- The checklist lives only on a root `kind = cabine` row of a relatório whose seed version ships a site list (v4 or later). A v1 to v3 relatório, a painel and a coluna show none, count none and print none.
- v1, v2 and v3 stay frozen: every earlier seed hash pin, the Porto Seguro goldens (`packages/domain/fixtures/porto-seguro/*.golden.json`, `apps/api/src/jobs/generate/golden/`) and `replay-small` keep matching with NO regeneration. New row fields are `.optional()` (absent and null both mean none) so no stored row changes bytes. Nothing an existing op log can contain may start to throw.
- Reuse, never fork: the site rows are the sheet checklist's `ChecklistRow`, `TriStateControl`, `BulkActionBar`, `RowPhotoAction`, `RowPhotoList`, `CreatePointAction` and the kernel's `mergeCell`, `insertPhrase`, `itensMarcadosConformeText`, `ncRowPointsText`; generalize their block coupling into a target the sheet and the local both supply.
- Ownership (AD-1/AD-13): every count, label, sentence, caption, order and print part is computed in `packages/domain`; `apps/web` renders from IndexedDB and writes ops only; the renderer reads the frozen snapshot only. Copy homes per AGENTS.md; every authored pt-BR string is marked `// authored:`.
- Removed locals: readers take locals from `snapshot.locations` (the live set), never from raw rows, and a photo or point whose `location_id` names a location absent from it is treated as a photo whose block is absent / left out of every point count, list and print. No tombstone of its own for checklist values; ops on a removed local still fold.
- `tokens.css` and `components.css` stay byte-identical; mock page rules are copied verbatim into the surface's CSS and each `.frame-*` rule first rendered gets its `app.css` translation.
- Host: containers through `podman compose` only; see Verification.

**Never:**
- Nothing of Story 14.5 (measurement table, CTA type, "Outros equipamentos", seed v5, contract 19) or 14.6 to 14.8. No company-type machinery.
- No rewrite of any relatório's `seed_version`. No edit of `epics.md` or `sprint-status.yaml`. No deletion or silent rewrite of a planning sentence (strike and date).
- No stored "concluded" state for the site checklist, no Conflict-view entry for site cells, no site items in `Progress.nc_open` or the "NC abertos" list, no photo-read NC draft (`reading_kind`) on a site item: each is an open question below.
- No material from `docs/context`, `docs/media` or `docs/concorrentes` in a tracked file. No emoji. No Playwright outside the host lock. No image build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Item answered | `location/{cabineId}/checklist/{itemKey}/result` put `'C'`, `'NC'`, `'NA'` or `null`; `/observation` put text or `null`, relatório on v4 | Row holds `checklist[itemKey].{result,observation}` as cells (`op_id`, provenance), written through `mergeCell` | none |
| Wrong kind | Same put on a `painel` or `coluna` row held in state | Refused: `LocationKindError` | Push answers `op_invalid`; nothing written |
| Wrong key or seed | `itemKey` outside `SITE_ITEM_KEYS` | Path fails `parsePath` | `op_invalid` |
| | Valid key, the relatório row held in state is on v1 to v3 (or its seed has no such item) | Refused: `SeedPathError` | `op_invalid`. A relatório row not in state is not checked (replay safety, the 14.2 precedent) |
| Two devices, same item | C on one, NC on the other, concurrent | NC stands (`nc_over_c`), as a sheet row; different items both stand; the NC device's observation stands (`nc_observation`); concurrent observations: latest text | A C or NC against NA keeps the `seq`-later value and marks the cell `conflict` as a sheet cell does; it is not listed in the Conflict view (O2) |
| Replay | A log with site ops, on kernel and api | Rows byte-equal on both layers; pre-14.3 logs (Porto Seguro, `replay-small`) byte-equal to the committed goldens | none |
| Mark the rest | 12 of 19 answered, "Marcar os restantes como Conforme" | 7 result puts `'C'` in one `batch_id`; toast "7 itens marcados Conforme" with "Desfazer" writing 7 inverse puts in a new batch | With a status op in the batch, the undo inverts it too |
| First content in Rascunho | First site put (or site photo, or point with `location_id`) on a Rascunho relatório | Same batch carries the Em campo status op; toast "Relatório em campo" | none |
| Edit in Emitido | A site put on an Emitido relatório | Reopened as Em revisão in the same batch; "Marcar como enviado ao cliente" withdrawn; next generate builds a new revision (not `unchanged`) | none |
| NC to point | "Criar ponto de atenção" on an NC item with 1 photo | Point created with `location_id` = the local, `equipment_id` null, text holding `[[foto:id]]`; the row then shows "Ponto de atenção N" | none |
| Site photo | "Adicionar foto" on an NC item | `file` photo row with `location_id`, `item_key`, `block_id` null, `reading_kind` null; caption prefilled "Verificação de ⟨item noun⟩ d⟨o/a⟩ ⟨local⟩" | A row carrying both `block_id` and `location_id` is read as its block's |
| Removed local | Local with answers, a site photo and a site point, then `removed_at` set | Its counter, its part of the pre-issue row, the photo's item line, the point (lists, counts, section 8) and its print are gone; restore brings all back | none |
| Print, v4 | Local with answers, any scheme, flag on or off | Under the local's first printed subsection heading and before any sheet title: CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO, then VERIFICAÇÕES DO LOCAL (ÍTEM, C, NC, NA, OBSERVAÇÕES; a shaded group row before each group; "N. LABEL" in upper case, N running 1 to 19), then the item photos; exactly once per local | Unanswered item prints with no mark |
| Print, v4, no equipment | Local with no sheet | Its numbered heading, SE, AMBIENTE and the table still print; section 9 prints even when no local holds a sheet | none |
| Print, v1 to v3 | Any relatório, Porto Seguro included | Output deep-equal to today's (SE and AMBIENTE stay inside the first sheet) | none |
| Type titles under a painel | Flag on, `por_local_e_tipo`, two painéis each with seccionadoras | Group titles name the painel: "Seccionadoras dos Cubículos de MT d⟨o⟩ ⟨painel⟩ — ⟨local⟩"; with no direct equipment the local's own numbered `cabine` heading (empty) comes before the first painel band | A local with no painel keeps the FO.SERV-03 titles byte for byte |
| Templates | Live templates on v1 to v3 (seeded, edited, company), relatórios on v3 | After the upgrade step every live template row reads v4; no relatório row changes; a second run writes no op | A template that fails the v4 row check is skipped and logged |
| Old client | Pull with `X-Contract-Version` 17 | `426 contract_outdated` | "Atualizar" as today |

</intent-contract>

## Code Map

Prefixes: `D/` = `packages/domain/src/`, `W/` = `apps/web/src/`, `A/` = `apps/api/src/`, `M/` = `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/mockups/`.

Seed: `D/seed/definitions.ts:30` `SEED_VERSION`, `:59` `SEED_VERSIONS`, `findSeed` `:101`; `D/seed/v3.ts` (the delta pattern to copy); `D/seed/v1.ts:114` `item(key, label, nc_phrases)`, `:193` `DISJUNTOR_MT_CHECKLIST` (15 items, frozen); `D/seed/schema.ts:46` `checklistItemSchema`, `:189` `reportSeedSchema` (v3's optional key at `:205` is the precedent); `D/schemas/block-config.ts:84` `ITEM_KEYS` (closed enum); pins `D/seed/seed.test.ts:256,600,616,654-665`, `D/seed/template.test.ts:19`. Carriers: template `D/schemas/entities.ts:216`, relatório `:322`, block `:445`; `D/relatorio/instantiate.ts:145`, `D/templates/from-relatorio.ts:83`, `D/seed/template.ts:200`; server upgrade precedent `A/db/seed.ts:404-445` (`upgradeStandardTemplate`, `applyServerBatch`, `provisioningOp`, server-only family `template/seed_version` `D/ops/path.ts:293`); migrations entry `A/db/migrate-cli.ts`, `A/db/migrate.ts`.

Ops and fold: `D/ops/path.ts:44` `CHECKLIST_FIELDS`, `:54` `FILE_FIELDS`, `:72` `POINT_FIELDS` (derived from the row keys), `:96,221,490` the `sheet/checklist` family (schema, table row, builder), `:150,306,485` `location/funcao` (the latest location family); `D/ops/path.test.ts:55` family count 43. `D/ops/apply.ts:93` `targetsOf`, `:128` `cellOf` (sheet cells through `mergeCell`), `:208` `SeedPathError`, `:229-246` `LocationKindError` and `assertLocationKind`, `:266` `assertSeedPath`, `:464` `writeRow`, `:548` the kind check in `applyOp`. Rows: `D/schemas/entities.ts:84` `cellSchema`, `:361` `locationRowSchema`, `:385` sheet `checklist` shape, `:480` `photoFileRowSchema`, `:532` `pointRowSchema`.

Merge and status: `D/merge/policy.ts:102-130` `mergePolicy` (the `sheet/checklist` branches), `:162` `mergeCell`; `D/merge/info.ts:35,71,83` (`mergeInfoOf` reads sheet cells); `D/merge/conflicts.ts:254,332` (block-scoped decisions, not extended). `D/status/edited-since.ts:34-82` `FAMILY_DECISIONS`, `:139` `countsAsFieldContent`; tests `edited-since.test.ts:245,319,358`. `D/relatorio/status-advance.ts:27` `advanceOnEdit`, `:81` `fichaIssuedBannerText`, `:103` toast; `D/relatorio/sumario.ts:432` `statusStepText`. `D/contract/version.ts:119,195` with their dated comment blocks; `contract.test.ts`, `examples.ts`.

Kernel readers: `D/relatorio/sheet-progress.ts:106` `checklistResultOf`; `D/relatorio/ficha.ts:117-124,171,199`; `D/relatorio/cabine.ts:73` `cabineProgress` (seed from the relatório); `D/relatorio/local.ts` (`funcaoLabel`); `D/relatorio/tree.ts:108-145` `TreeLocationNode`, `:256` `locationMetaTexts`; `D/relatorio/pre-issue.ts:50` kinds, `:425-447` the per-local rows, `:508`; `D/points/checks.ts:57` `newPointRow`, `:116-128` `ncRowPointPositions`; `D/points/summary.ts:55` `pointTitle`; `D/photos/gallery.ts:55` `photoItemLine`, `:73` `photoCabineId`; `D/photos/caption.ts:92` `activityOf`, `:151` `localOf`, `:274` `contextCaption`; `D/schemas/snapshot.ts:70` `live`, `:108` `buildSnapshot`, `:217` `createSnapshotBuilder`.

Print: `D/print/group-for-print.ts:78` `GROUP_WORDS`, `:89` `ofCabine`, `fieldOrder` (a root with no sheet is dropped), `byType`, `byTypeRuns`, `:270` `groupForPrint`; `D/print/section-9.ts:86` `SheetPart`, `:97` `PrintSheetSubsection`, `:291` `cabineParts`, `:326` `checklistPart`, `:589` `sheetPhotos`, `:614` `sheetOf`, `:647-675` `section9Layout`; `D/print/section-7.ts:47`, `D/print/section-8.ts:169-235`. Api: `A/jobs/generate/sections/section-9.ts:120` `drawTable`, `:163` `sheetChildren`, `:200` `section9Children`; `sections/section-7.ts:97`, `sections/section-8.ts:66`; `A/jobs/generate/toc.ts:27`; tests `A/jobs/generate/docx.test.ts:62,192,361`, `docx-structure.test-support.ts:124`. Sync: `A/sync/apply.ts:387,533`; `A/sync/sync.integration.test.ts:111-141,230,281,310,1082,1215`; `A/http/generate.ts:84,139`.

Web: `W/surfaces/ficha/checklist-section.tsx` (`useChecklistBulk` `:101`, `BulkActionBar` `:140`, `ChecklistSection` `:169`, private `ChecklistRow` `:239`: every `block.` read there is the coupling to lift), `ficha-api.ts`, `ficha-ops.ts:43-48`, `photo-openers.tsx:204,255`, `use-photo-capture.ts:33` `CaptureTarget`, `use-ficha-photos.ts:86`, `W/db/file-commit.ts:100`, `W/db/photo-store.ts:170`, `W/surfaces/points/create-point-action.tsx:16`, `point-editor.tsx:81` `PointSeed`, `W/surfaces/ficha/issued-banner.ts`, `ficha-surface.tsx:61,155` (the surface to model on), `sticky-action-bar.tsx`, `cabine-block.tsx:43-184` (the "Do local" block), `W/surfaces/relatorio/relatorio-editor.ts:30,82`, `relatorio-gate.tsx:18`, `relatorio-tree.tsx:596-711` `SumarioLocation` (slot inside `.s9-loc-body`), `:863-891` `RailLocation`, `relatorio.css:94`; router `W/app.tsx:160`; copy `W/copy/pt-br.ts`; `W/styles/app.css`.

Mocks (grep, then read ranges; never whole): `M/prototype/screens/61-verificacoes-local.html` (style `:1-34`; header `:38-48`; `.vl-intro` `:52-55`; groups and rows `:57-106`, the NC expansion at item 11, the `.vl-obs-line` at items 8, 9, 13; sticky bar `:110-112`), `60-ficha.html:309` (`.cabine-line.ficha-local-line`, "Verificações do local" + "N de 19" + "Abrir"), `:459-460` (item 16 "No-break de comando" and its three chips), `40-relatorio-overview.html:125,234` (`.s9-verif` button "Verificações do local · N de 19"), `prototype/shell-foot.html:55` (rail row, `tree-meta` "19 itens · uma vez por local", `tree-state`), `M/key-print-section-9.html:25-34,60-99,146-164` (table classes `pt-check`, `pt-group`, order under the local heading). Items and groups: `sprint-change-proposal-2026-10-08.md` § 4.1.

E2E: `e2e/ficha.spec.ts:172,1362` (checklist, `context.setOffline`), `e2e/photos.spec.ts:106`, `e2e/points.spec.ts:205`, `e2e/local-painel-coluna.spec.ts:300-314` (generate, download, `extractStructure`), `e2e/status-flow-2026-10-10.spec.ts`; helpers `e2e/support/photos.ts`, `outbox.ts:188` `readStore`, `relatorio-seed.ts`, `local.ts:18`, `download.ts`; `e2e/support/groups.ts:11` `SERIAL_SPECS`; the durability projects match `/durability\.spec\.ts/` (`playwright.config.ts:75-89`).

## Tasks & Acceptance

**Execution.** Group 1 is the kernel slice another batch stacks on: finish it, run its tests, commit it alone and push, then STOP and report (see Verification). Groups 2 to 5 follow in a second pass; commit and push after each group. Messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.env`, `compose.local.yml` or `test-results/`.

1. Kernel slice (seed v4, family, rows, contract 18)
- `D/seed/schema.ts`, new `D/seed/v4.ts`, `D/seed/definitions.ts`, `D/schemas/block-config.ts` -- `ReportSeed` gains optional `site_checklist: { groups: { key, label, items: { key, label, nc_phrases (3 to 4) }[] }[] }`; export `SITE_ITEM_KEYS` (the 19 keys, closed, ASCII snake_case of the label) and `siteItemKeySchema`; v4 = `structuredClone(v3)` plus `site_checklist` (six groups, labels verbatim from § 4.1 in sentence case) plus `no_break_de_comando` ("NO-BREAK DE COMANDO", chips from `60-ficha.html:460`) appended to the Disjuntor MT checklist and to `ITEM_KEYS`; `SEED_VERSION = 'v4'`. NC phrases: the mock's where drawn, else authored, all under one `// authored:` note. Export `siteChecklistOf(seedVersion: string): SiteChecklist | null` (null for v1 to v3 and unknown) and `siteItems(seedVersion): readonly SiteItem[]` (flat, each with `key`, `label`, `groupKey`, `number` 1 to 19, `nc_phrases`). Tests: v4 differs from v3 only by those two additions (hash pin like `:665`), v1 to v3 pins untouched, the 19 keys and six groups pinned by name.
- `D/schemas/entities.ts` -- cabine member: `checklist: z.record(siteItemKeySchema-keyed string, { result?: cell, observation?: cell }).optional()`; photo row and point row: `location_id: nullableId.optional()`. `D/ops/path.ts` -- family `location/checklist` (`location/{id}/checklist/{item_key}/{result|observation}`, put only, `item_key` by `siteItemKeySchema`), builder `locationChecklistPath(id: string, itemKey: string, field: 'result' | 'observation'): string`; `location_id` appended to `FILE_FIELDS`.
- `D/ops/apply.ts`, `D/merge/policy.ts`, `D/merge/info.ts` -- fold the family through `mergeCell` with the checklist rules (the `sheet/checklist` branches of `mergePolicy` apply to both families; an observation is free text); `assertLocationKind` refuses it off a cabine; `targetsOf` also names the op's relatório row (read only, when `op.relatorio_id` is set) so the seed check of the matrix can run; `mergeInfoOf` reports a site cell's rule merge like a sheet cell's, `block_id: null`, and `mergeInfoText` names it "Verificações do local · Item N" with the local's name (authored). Tests per matrix row, including two-device merges and a byte-equal replay.
- `D/status/edited-since.ts` -- `'location/checklist': 'edit'`, field content in `countsAsFieldContent`; extend both test tables, with a photo create and a point create carrying `location_id`. `D/contract/version.ts` -- `CONTRACT_VERSION = 18`, `MIN_CONTRACT_VERSION = 18`, dated comments (a version-17 bundle cannot parse the new path, nor resolve seed v4); `examples.ts` and every test pinning 17; `D/ops/path.test.ts` family count.
- `D/relatorio/instantiate.ts` untouched (a relatório takes its template's version). `D/templates/from-relatorio.ts` -- a template saved from a relatório on an older shipped seed is created on `SEED_VERSION`; new `templateSeedUpgrade(row: Pick<TemplateRow, 'seed_version' | 'blocks' | 'skeleton'>): string | null` (the version to move to, null when already current or when the row would not validate there), with a test that every earlier version's standard template and default configs validate on v4.

2. Kernel readers, texts and print
- New `D/relatorio/site-checklist.ts` (exported from `index.ts`): `siteChecklistView(snapshot, locationId)` (null unless a live cabine of a seeded relatório; else groups with their "N de M", rows with number, label, result, observation, `nc_phrases`, and totals), `siteResultOf(location, itemKey)`, `siteUnsetItems(location, seedVersion)`, `siteChecklistProgress(snapshot, locationId): { answered, total } | null`, `siteCounterText` ("12 de 19"), `siteRowText` ("Verificações do local · 12 de 19"), `siteHeaderTitle` ("Verificações do local — ⟨name⟩") and `siteHeaderMeta` ("Função: ⟨funcaoLabel⟩", null with none), `siteMissingText` ("7 itens sem resposta — o primeiro é o item 6, EPI disponível"; null when none), `recentSiteObservations` (the same item on the relatório's other locals), `localIssuedBannerText(status, revision)` (the sheet's sentence with "estas verificações", authored). `Progress` is NOT widened (goldens capture it; verify before touching any golden-captured shape).
- `D/relatorio/tree.ts` -- the local's node gains `site: { answered, total, text, railCounter, railMeta ("19 itens · uma vez por local"), state: 'vazia' | 'pending' | 'concluida' } | null`. `D/relatorio/pre-issue.ts` -- one row, kind `site_checklist_unanswered`, `section_9`, `pending`, naming every live local with unanswered items and its count (authored; e.g. "Verificações do local sem resposta: Cubículo Enel (7 itens) e 1° Subsolo (19 itens)"). `D/relatorio/sumario.ts` `statusStepText` -- on a seeded relatório the Rascunho sentences say "preencher uma ficha ou as verificações do local" (authored); v1 to v3 text unchanged.
- `D/points/checks.ts`, `summary.ts`, `D/schemas/snapshot.ts` -- `newPointRow` takes `locationId?` (the key written only when set); `ncRowPointPositions` matches a local's points (`location_id`, a cited item photo) beside the equipment ones; `pointTitle` of a point with a live `location_id` is "⟨local⟩ · Verificações do local" (authored); `buildSnapshot` and `createSnapshotBuilder` leave out a point whose `location_id` names no live location. `D/photos/gallery.ts`, `caption.ts` -- `photoItemLine` and `contextCaption` resolve a site photo (`location_id`, `item_key`) against the site list and the live local ("Item 11 · Iluminação de emergência (autonomia mínima de 2 h) · NC"; caption "Verificação de ⟨item noun⟩ d⟨o/a⟩ ⟨local⟩"); `photoCabineId` returns the local.
- `D/print/group-for-print.ts` -- per the matrix: on a seeded relatório every live root cabine emits at least its `cabine` subsection (empty `blockIds`) under both schemes; under a painel the type-group title is `${words} ${ofCabine(painel)} — ${local}` (one exported function, listed as authored copy); flag on with painéis and no direct sheet emits the local's `cabine` subsection first. A local with no painel on v1 to v3 emits exactly today's parts (deep-equal test against the current output; check every other caller of `groupForPrint`). `D/print/section-9.ts` -- `PrintSheetSubsection` gains optional `localParts: SheetPart[]` (SE, AMBIENTE, the site table, then the site item photos), set on the first subsection printed for a local of a seeded relatório, whose sheets then carry no cabine parts; a `PrintRow` flag for the group rows; `section9Layout` is non-null when a local part prints. v1 to v3 untouched.

3. Api
- `A/jobs/generate/sections/section-9.ts` -- draw `localParts` after the subsection heading and before its sheets; group rows shaded `F0F0F0`, bold, spanning the five columns (`.pt-group`). Tests in the `docx.test.ts` style, asserted from their own headings: one table per local under both schemes with the flag on and off, a local with no equipment, the painel titles, a removed local, uppercase labels, an unanswered row, item photos after the table; the Porto Seguro golden test green untouched. Section 7 and 8 tests for a site photo's caption and a site point.
- `A/db` -- `upgradeTemplateSeeds(db): Promise<number>`: for every company and every live template whose `templateSeedUpgrade` is non-null, one server batch (`system:` actor, under the company lock, the row re-read there) putting `template/{id}/seed_version` and leaving `version`, `blocks` and `skeleton` as they are; idempotent; called wherever migrations are applied at start (`migrate-cli.ts` and the dev boot path, find it). Integration test per the matrix row.
- `A/sync/sync.integration.test.ts` -- through `POST /api/sync/ops`: an accepted site batch whose server rows equal the kernel replay; each refusal row answers `op_invalid` and writes nothing; a contract-17 pull answers 426; a site put on an Emitido relatório makes the next generate a new revision.

4. Web
- Lift `ChecklistRow` out of its block coupling (a target object giving the entity id, result, committed flag, observation, the two op builders, the NC draft or none, the point seed, the row's point mark, the recents) and export it; `ChecklistSection` and `useChecklistBulk` keep their behaviour for sheets with the existing tests green. `CaptureTarget`, `commitPhotoCapture` and the photo tile query accept a local (`locationId`, `itemKey`).
- New `W/surfaces/local/verificacoes-surface.tsx` (+ css, test) at route `/relatorio/:id/local/:locationId/verificacoes` (the mock's `/local/:id/verificacoes`), from mock 61 with its class names: header (title, Função, the "Uma vez por local…" line, attribution as the sheet composes it, `progress-counter`), `.vl-intro` bulk bar and legend, six `.vl-group` sections with their "N de M", the rows, the `.vl-obs-line` on an answered C or NA row with an observation ("Editar"), the sticky bar ("Ver árvore" to the relatório tree; "Concluir verificações" announces `siteMissingText` and focuses the first unanswered row, or returns to the tree when none is left). Read-only and issued banner exactly as the sheet (`localIssuedBannerText`). A painel, a coluna, a v1 to v3 relatório or an unknown id shows the surface's not-found state and no entry point.
- `relatorio-tree.tsx` -- the `.s9-verif` button on a local's Sumário row and the rail's level-1 row, both from `node.site`; `cabine-block.tsx` -- the `.ficha-local-line` under the "Do local" block ("Verificações do local", counter, "Abrir"). Copy in `pt-br.ts`; page CSS verbatim from the mocks; `.frame-phone` rule translated in `app.css`.
- Unit tests beside each component: every matrix row that has a screen, the bulk action and its undo, the point seed (`locationId`, tokens), the banner, 390 px wrap of the header.

5. E2E and documents
- New `e2e/verificacoes-local.spec.ts` in `SERIAL_SPECS` (it generates). `@p0` at 768 px: create a relatório (v4), open the surface from the local's tree row, go offline, answer all 19 (one NC with a chip, an observation and a photo; one NA with an observation; "Marcar os restantes como Conforme" and its "Desfazer" once), assert the first answer's batch holds the Em campo status op and the toast, create the point from the NC item, reload offline, go online, sync, and assert in the device store and the outbox: the 19 cells, the photo's `location_id` and `item_key`, the point's `location_id` and token; then generate and assert in the DOCX the table once per local right after AMBIENTE DE ENSAIO with group rows, uppercase labels and the NC mark, the photo's caption in section 7 and the point in section 8; a second local with no equipment prints its heading and table. `@p0`: an item answered on an Emitido relatório (banner sentence, reopened, mark-as-sent withdrawn, next generate is a new revision). `@p1`: entry from the sheet's "Do local" line; no horizontal overflow at 390 px; a coluna and a v3 relatório offer no entry.
- New `e2e/verificacoes-local.durability.spec.ts`: answers typed and tapped offline survive a reload with the outbox intact and drain on sync; run on the three durability projects.
- Grep `e2e/` for assertions seed v4 moves (Disjuntor MT item counts, "avisos" counts, Sumário and tree rows, status step text) and update them without weakening; list every touched spec in the report.
- Documents, appended and dated 2026-10-13: spine AD-3/AD-13 (family, contract 18), AD-6 (row fields, `location_id` on file and point, the removed-local rule), AD-15 and AD-22 (site items are an edit and field content), AD-21 (v4; how templates reach it); `docs/kbs/architecture/kernel-and-seed.md`, `data-model.md`, `rendering.md`, `sync.md`, `docs/kbs/log.md`; `deferred-work.md` entries for O1 to O6 and every narrowing, each with its owner.

**Acceptance Criteria:**
- Given a relatório on v4, when "Verificações do local" is opened from a local's tree row or from the sheet's "Do local" line, then the 19 items show under six group headings and every answer is a `location/{id}/checklist/...` op, written offline and present after a reload.
- Given an NC site item with a photo, when "Criar ponto de atenção" is used, then the point carries `location_id` and the photo token, the row shows its point mark, and both print (section 7 caption naming the local and the item; section 8).
- Given locals with unanswered items, when the Sumário and the Export dialog are read, then each local's row shows its counter and one non-blocking row names those locals; "Parecer" stays the only blocking row.
- Given any relatório on v1 to v3, when it is opened, synced or generated, then nothing differs from today and every golden matches unregenerated.
- Given a relatório on v4, when it is generated under each scheme with the flag on and off, then each local prints its table once, right after its AMBIENTE DE ENSAIO, as `key-print-section-9.html` draws it.

## Spec Change Log

- 2026-10-13, review pass: the matrix row "Wrong key or seed" names `op_invalid` for a key outside `SITE_ITEM_KEYS`. The path does fail `parsePath` as the row says, and the sync route answers an unparseable path with `op_path_unknown`, its standing rule for every family; only the wrong kind and the wrong seed answer `op_invalid`. The row's intent (refused, nothing written) is what was built and tested; the code name in its last cell was the spec author's slip. The intent contract is left as written. KEEP: the route's rule for unparseable paths is not changed for this family.

## Review Triage Log

### 2026-10-13 — Review pass

Layers run: Edge Case Hunter, Verification Gap Reviewer (opus). Blind Hunter and Intent Alignment skipped: token economy; the integrated epic review covers them. One fix loop (commit `c49e84d9`).

- verdicts: 14 findings — high 0, medium 2, low 12, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` `audit/input.ts` `sheets` branch never reads `localParts`, so on a seeded relatório the document audit loses CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO and never sees the site table (Edge Case Hunter) — verified at `packages/domain/src/audit/input.ts:191-196`; the branch now emits the local's lines after the heading, with a v4 case in `audit.test.ts`; the v1 audit text is byte-equal.
  - `[low]` `[patch]` Claim "a relatório on v1 to v3 prints exactly as before" is false for a v3 relatório that already holds painéis with *Agrupar por tipo* on (new painel titles, the local's heading before its first painel) — verified at `print/group-for-print.ts` `byTypeRuns`: neither rule reads the seed, as the 2026-10-13 criterion of Story 14.4 asks ("a local with no painel keeps the FO.SERV-03 titles"); the behaviour stands, the comments in `section-9.ts` and `group-for-print.ts` now say it precisely, and the ledger carries the note (entry e).
  - `[low]` `[patch]` The boot step moves `seed_version` alone, after which `upgradeStandardTemplate`'s refresh of blocks and skeleton never fires for an unedited standard template — verified in `apps/api/src/db/seed.ts` `needsUpgrade`; a new kernel pin shows `standardTemplate` builds equal `blocks` and `skeleton` at every shipped version, so nothing is lost; dated notes on both comments.
  - `[low]` `[patch]` `merge/restore.ts` `clearedMarks` handles only `sheet/*`, so the undo of a site put that cleared a cell's `conflict` does not put the mark back — verified at `restore.ts:25`; site cells go through `cellAt`, kernel test added.
  - `[low]` `[patch]` `location_id` on a file or point is not checked at the fold; `pointTitle` titled a point by a painel or coluna row — the title half verified and fixed (`pointTitle` resolves the local through `siteLocalOf`, else "Geral"); the fold check is rejected: no client writes such an op and the guard needs a new read ref on two families. Ledger entry (c).
  - `[medium]` `[patch]` `apps/api/src/main.ts:45` runs `upgradeTemplateSeeds` outside `withRetry`, so a transient database error at boot kills the process — verified; wrapped as its neighbours.
  - `[low]` `[patch]` Claim "each refusal answers `op_invalid`": a key outside `SITE_ITEM_KEYS` or an unknown field fails `parsePath` and the route answers `op_path_unknown` (the route's standing rule for an unparseable path) — verified in `sync.integration.test.ts:1527`; the matrix's "Error Handling" cell named the wrong code for that one row (the refusal itself, nothing written, is as specified); the contract-18 comment now names both codes. Recorded in the Spec Change Log.
  - `[medium]` `[patch]` Missing-adoption gap: the audit input on a v4 relatório (Verification Gap Reviewer) — filed pre-verified; same root cause as the first row, fixed with it.
  - `[low]` `[defer]` Regression gap: the boot wiring of `upgradeTemplateSeeds` (`main.ts`, `migrate-cli.ts`) is exercised by no test — filed pre-verified with disposition defer; the entry points have no harness; ledger entry (a), a wave-gate check.
  - `[low]` `[patch]` Regression gap: the denied-camera import of a site photo drops no test when `locationId` is lost — filed pre-verified; one case in `photo-import.test.ts`, failing without the spread.
  - `[low]` `[patch]` Regression gap: a recovered point draft of a site item is not checked to keep its local — filed pre-verified; new `point-draft-recovery.test.tsx`, failing without the line.
  - `[low]` `[defer]` Regression gap: "Legendar" on a site photo is never opened in a test — filed pre-verified with disposition defer (only a cleared caption is affected); ledger entry (b).
  - `[low]` `[patch]` Two template-upgrade rules coexist and `standard-template.integration.test.ts:369` with the `seed.ts` comment describe a rule production no longer follows — verified; same root cause as the third row: the test title says what it pins (the seed path alone) and the comments carry dated notes.
  - `[low]` `[reject]` `MergeInfoContext.relatorios` has no production caller, so a site merge entry numbers its item by the current seed — verified (`mergeTextContext` passes none); harmless while every seed ships the same site list, and wiring it adds a store read to the merge text path. Ledger entry (d).

## Design Notes

- Storage is the sheet checklist's cell shape so one merge policy serves both; the seed check needs the relatório row, which `targetsOf` now names read-only. Contract 18, minimum 18.
- How templates reach v4 (settled here): a server data step moves every live template row by the existing server-only path, and a template saved from an older relatório is born current. A relatório made offline from a template row the device has not pulled yet is still born on the old version and has no checklist; accepted.
- Print on a seeded relatório lifts SE and AMBIENTE from the first sheet to the local's own parts (as the approved mock), which is what lets a local with no equipment print. v1 to v3 keep the old placement.
- Open questions, listed and not decided (each gets a `deferred-work.md` entry and a PR line): O1 "Concluir verificações" stores nothing: it only names what is missing or returns to the tree (owner Matheus). O2 a C or NC against NA contradiction on a site item keeps the later value and its cell mark but is not a decision in the Conflict view (owner Matheus). O3 NC site items are not in `Progress.nc_open` nor in the "NC abertos" list, and the local's sheet counter stays sheets-only (owner Matheus). O4 no photo-read NC draft on a site item (owner Matheus). O5 authored copy for Bruno: the NC phrases of the 19 items and of NO-BREAK DE COMANDO, the pre-issue row, the banner sentence, the status step sentence, the point title, the merge-info line, the painel type-group title wording. O6 the print mock's unnumbered group headings (14.2's O3) stay with Bruno; only the painel wording is built.
- Numbers recomputed against their sources (E12-A5): 19 items in groups of 7, 2, 2, 2, 3, 3 (§ 4.1); Disjuntor MT 15 to 16; contract 17 to 18; seed v3 to v4; family count 43 to 44.

## Verification

Stack `fasor-e14b` (api `:7030`, web `:7073`); bring it up with `podman compose up -d` only when first needed. Tools: `podman compose --profile tools run --rm --user root tools <cmd>` from the worktree root, output redirected to `test-results/e14b/<stage>.log`, tail read. After a kernel edit, `podman compose restart api` before an api integration run or a Playwright run. One focused Vitest file may run without the lock; every Playwright run and every full `test:unit` or `test:api` runs under it, in the background, polled with short calls:
`mkdir -p test-results/e14b && nohup sh -c 't0=$(date +%s); lockf -t 20000 /tmp/fasor-verify.lock sh -c "echo LOCKED_AFTER=\$(( \$(date +%s) - $t0 ))s; podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/<spec>.spec.ts --project desktop-chrome"; echo EXIT=$?' > test-results/e14b/e2e.log 2>&1 &`
Another batch shares the lock: wait for it, never skip it, never `pkill` by pattern, never pass `-v`, never build an image.

**Commands:**
- `pnpm lint`, `pnpm static` -- expected: no errors.
- `pnpm exec vitest run packages/domain/src/<file>`, `pnpm exec vitest run --project @app/web <file>` -- narrow runs while iterating.
- `pnpm test:unit`, `pnpm test:api` (under the lock) -- expected: green; `quantity-stepper.test.tsx` "commits a typed number on blur or Enter" is a known flake (re-run once).
- The new specs and every spec changed, on `desktop-chrome`; the durability spec also on `durability-desktop-chrome`.

## Auto Run Result

Status: done (2026-10-13). Code head `ec9140b0` (the merge of main is `50e4afff`); this section is a document-only commit after the gate.

**Summary.** Every local of a relatório on seed v4 carries its "Verificações do local": 19 items in six groups, answered once on the root `cabine` row, captured on a surface built from mock 61 on the sheet checklist's own row, and printed once per local right after AMBIENTE DE ENSAIO. Kernel: seed v4 (v3 plus the site list and NO-BREAK DE COMANDO on the Disjuntor MT checklist), the cell family `location/{id}/checklist/{itemKey}/{result|observation}` folded through `mergeCell`, `location_id` on photo and point rows, contract 18 (minimum 18), `relatorio/site-checklist.ts`, the pre-issue row, the removed-local rule on points, `localParts` in section 9 and the painel wording of the type-group titles. Api: the renderer draws the local's parts, `upgradeTemplateSeeds` moves every live template at start, sync refusals. Web: the surface, its three entry points, site photos and points.

**Files changed (main ones).**
- `packages/domain/src/seed/{v4,schema,definitions}.ts`, `schemas/{block-config,entities}.ts` -- seed v4, `SITE_ITEM_KEYS`, the row fields.
- `packages/domain/src/ops/{path,apply}.ts`, `merge/{policy,info,stamp,restore}.ts`, `status/edited-since.ts`, `contract/version.ts` -- the family, its fold, merge and status decisions, contract 18.
- `packages/domain/src/relatorio/{site-checklist,tree,pre-issue,sumario}.ts`, `points/{checks,summary}.ts`, `photos/{gallery,caption}.ts`, `schemas/snapshot.ts`, `audit/input.ts` -- readers, texts, the removed-local rule.
- `packages/domain/src/print/{group-for-print,section-9,section-7,section-8}.ts`, `apps/api/src/jobs/generate/sections/section-9.ts` -- the printed table and the painel titles.
- `packages/domain/src/templates/from-relatorio.ts`, `apps/api/src/db/template-seed-upgrade.ts`, `apps/api/src/{main.ts,db/migrate-cli.ts}` -- how templates reach v4.
- `apps/web/src/surfaces/local/*`, `surfaces/ficha/{checklist-section,cabine-block,issued-banner}.tsx`, `surfaces/relatorio/{relatorio-tree,tree-actions}.ts*`, `surfaces/points/*`, `surfaces/photos/*`, `db/{photo-store,file-commit}.ts`, `copy/pt-br.ts` -- the surface and its entry points.
- `e2e/verificacoes-local.spec.ts`, `e2e/verificacoes-local.durability.spec.ts`, six updated specs, `e2e/support/groups.ts`.
- Spine AD-3, AD-6, AD-13, AD-15, AD-21, AD-22 (dated notes), `docs/kbs/*`, `deferred-work.md`.

**Review.** Two layers (Edge Case Hunter, Verification Gap Reviewer), one fix loop (`c49e84d9`, then `ec9140b0` for a kernel assertion the fix made stale). 14 findings: 11 patched (3 medium in 2 entries, 8 low), 2 deferred (the boot wiring and "Legendar", both test gaps), 1 rejected (`MergeInfoContext.relatorios` has no production caller: harmless while every seed ships the same site list; ledger entry). The fold check of `location_id` on a file or point was rejected inside its patched row (no client writes it; ledger entry).

**Follow-up review recommended: true.** Patched this pass: medium 2 entries, low 8. The risk to re-check in the integrated epic review: the document audit's input on a v4 relatório (it lost the cabine tables until the fix; covered by one kernel test, no audit run end to end), and the merge with Story 14.2's second pass in `schemas/snapshot.ts` (site points now follow the ancestor rule `liveStructure` gives; covered by the kernel tests of each side, none of the two together).

**Merge.** PR #126 was merged by squash (`cbce841b`) while this batch ran. The 14.2 branch tip `9afb99ef` (same tree as the squash) was merged first (8 conflicts, both sides kept), the squash recorded as merged, then `origin/main` (`c4ae8c02`).

**Verification (story gate, one lock hold on `50e4afff`, lock wait 0 s, 1522 s; re-runs on `ec9140b0`).**
- `pnpm lint`: 0 errors, 25 warnings (13 s). `pnpm static`: clean (22 s). `pnpm test:api`: 79 files passed (209 s).
- `pnpm test:unit`: 3839 of 3840 on `50e4afff`. The red was `ops/site-checklist.test.ts`, an assertion of the kernel slice that `clearedMarks` ignores a site cell, which the review fix deliberately changed and whose own run did not include that file; the assertion now pins the new behaviour (`ec9140b0`). Full re-run on `ec9140b0` (lock wait 1074 s behind this batch's own gate): 299 files, 3840 tests passed (170 s). The base failure in `relatorio-tree-edges.test.tsx` went away with the merge of Story 14.2's second pass.
- Playwright, 28 spec files on `desktop-chrome` and `durability-desktop-chrome` (the 8 this batch created or changed and 20 untouched ones that drive the lifted checklist row, the tree, photos, points, merge and generation): 260 tests, 256 passed, 1 failed, 3 skipped, 0 flaky (923 s). Every spec this batch touched passed. The red is `points.spec.ts` 6.6-E2E-011, the open ledger entry of the status-flow story (`Escape` lands on `BODY` before React Aria hands the focus back to the photo viewer; 20 to 80 percent alone on main); alone on `ec9140b0`: 4 of 5 passed.
- Durability on `durability-android-chrome` and `durability-webkit`, five specs: 56 tests, 50 passed, 1 failed, 5 skipped (195 s). `verificacoes-local.durability.spec.ts`, the one this batch owes, passed on both. The red is `ficha.durability.spec.ts` F-11 on WebKit, an untouched spec added to this run by choice; it is one of the open failures of integrated main (ledger, E13-A1 wave gate entry) and fails alone on `ec9140b0` (2 of 2).
- Not run (wave gate): the full `@p0`, `test:e2e:full`, the full matrix.

**Residual risks.** The open questions O1 to O6 and the narrowings in `deferred-work.md`; contract 18 makes every version-17 device update on its next pull; every live template moves to seed v4 at the first start of this build; a v3 relatório that already holds painéis prints the new painel titles.
