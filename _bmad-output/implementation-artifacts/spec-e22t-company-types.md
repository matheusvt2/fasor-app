---
title: 'e22t: Stories 14.6 to 14.8, company equipment types (contract 33)'
type: 'feature'
created: '2026-11-07'
status: 'in-progress'
baseline_revision: 'b811ace93d5ddc75062421de7c21afab6deea5a6'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: max
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md'
warnings: ['batched', 'oversized', 'multiple-goals']
batched_why: 'Epic 22 wave C plan: 14.7 and 14.8 build only on 14.6 ops and resolver; one spec, one review, one gate. Built by two implementation subagents in series: part A (14.6, opus max), part B (14.7 and 14.8, opus high).'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Equipment types exist only as versioned seed code, so the office cannot add or adjust a type (Bruno's "cadastrar equipamentos e editar informações padrões") without a release.

**Approach:** Company equipment types become company data (a mutable type row with a draft and an immutable version row per publish), resolved beside the seeds through a pure resolver context on device and server (14.6); an office editor under Templates duplicates, edits, publishes and retires them (14.7); palettes, the sheet, the snapshot and section 9 carry them end to end (14.8). The architecture is settled: the spine's notes "Settled 2026-11-06" under AD-3 (line 79), AD-15 (line 179) and AD-21 (line 221) are normative; read them whole before coding.

## Boundaries & Constraints

**Always:**
- Matheus's ten wave C decisions (2026-11-06): two company records (type + immutable version); a publish conflict is refused `op_invalid` (`SeedPathError`); `blockTypeSchema` is a union with `type:{uuidv7}`, `BlockConfig.type_version?: int>=1` required exactly on a company type; resolver `findDefinitionIn` / `getDefinitionIn` over `DefinitionContext`; contract 33 and MIN 33; a library type is renamed only via Duplicar; no subtypes and no role on a company type; company criteria take `>=`, `<=`, `between`, `±`, `pass_fail` plus seeded `>` and `<`; learned NC phrases skip company-type blocks; a new block / instantiated template takes the latest published version (a retired type's included for templates).
- Byte-equal: every snapshot of a relatório with only seeded types, every seed v1 to v12 hash pin, the replay pins, the Porto Seguro goldens and Bruno's v5 relatório render unchanged. `equipment_types` on the snapshot and `type_version` on a config are optional and never defaulted.
- AD-1/AD-13: every status, count, validation sentence, label, noun-composed text and print group comes from `packages/domain`; `apps/web` renders from Dexie and writes ops only; `applyOp` is the only reducer. Old `getDefinition` / `findDefinition` keep their signatures and throw / answer null for a `type:` key.
- Layout protection: a company-type block prints only in "Outros equipamentos" after Transformadores with the existing grammars; nothing else in the document moves.
- Screens from `41-templates.html` § Tipos de equipamento and `43-tipo-equipamento.html` with their class names; React Aria; no Tailwind; `.frame-*` translations in `app.css`. pt-BR copy in the three AGENTS.md homes; every authored string marked `// authored:` and listed for the PR.
- Every new kernel refusal ships an api integration test through the sync route; a cross-tenant test proves company B never resolves company A's type; a two-device test for the publish conflict.
- On any product doubt, check `docs/concorrentes/` (README, extracts, `frames-reference-tool/`) and cite by path; never copy third-party names, CNPJs or coordinates.

**Never:**
- No seed version bump, no seed file edit (`SEED_VERSION` stays v12). No new Postgres table or migration: the api's generic `entities` table (`apps/api/src/db/schema.ts:91`, keyed `company_id, entity, id`) holds the two new entities under the AD-10 company filter, as `template` and `registry` do (reading of AD-21's "two company-scoped tables": two entity kinds in the company-scoped table).
- Not built (open, listed in the PR): hiding library types from palettes; a phone frame of the editor (tables stack into cards by page CSS only); Bruno's no-break de comando content (the e2e uses the 2026-10-09 re-sliced DoD on the CTA). Not built by decision: renaming a library type in place; subtypes or role on a company type; learned NC phrases for company types.
- No change to `registry/nc_phrase`'s closed `block_type`; no edit of `epics.md` or `sprint-status.yaml`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Duplicate seeded | "Duplicar" on library CTA (v12) | new `equipment_type` with `derived_from {seed_version, block_type}`, draft = full copy, seeded criteria materialized into `criteria[]` with their source | none |
| Autosave | edit in editor | one `equipment_type/{id}/draft` put (whole draft), coalesced in outbox | loose draft schema: incomplete drafts save |
| Publish valid | draft passes `validateTypeDraft` | `equipment_type_version` create, version = latest+1; fold sets `latest_version`, clears `draft` when deep-equal | none |
| Publish conflict | two devices publish v2 | later push refused `op_invalid`; its device drops the op, keeps its draft, publishes again as v3 | api integration + two-device test |
| Invalid definition | criterion without `source.name`, bad TAG prefix, duplicate key | `applyOp` refuses version create (`SeedPathError`); editor shows issues inline, Publicar disabled with first issue | kernel message pt-BR |
| Edit after publish | draft put after v1 | type keeps `latest_version 1`, draft open as v2 | none |
| Retire / reactivate | `retired_at` put | hidden from palettes; blocks, templates, relatórios keep resolving and printing; template shows "Aposentado" and still instantiates | none |
| Discard draft | `removed_at` put with latest 0 | type removed | refused when latest > 0 |
| Block create | `block` create with `type:{id}` and `type_version` | resolves through context | refused when no version row in state (also cross-tenant guard on server) |
| Config change | `block/{id}/config` put changing `block_type` or `type_version` of a company block | refused | seeded-only logs unaffected |
| Sheet write | `sheet/*` on company block with key not in resolved definition | refused (`assertSeedPath` via context) | |
| Type edited later | relatório R1 created on v1, then v2 published, R2 created | R1 keeps v1 label, rows, criteria on screen and print; R2 takes v2 | |
| Seeded-only relatório | no company block | snapshot has no `equipment_types` key; bytes equal to before | replay pins |
| Old client | contract 32 bundle | pull 426 `contract_outdated`; pushes accepted | |

</intent-contract>

## Code Map

Kernel (`packages/domain/src`):
- `seed/definitions.ts` -- `getDefinition`, `findDefinition`, `getSeed`, `findSeed`, `equipmentTypesOf`, `isLibraryType`, `naDefaultsFor`; add `DefinitionContext`, `definitionContext(rows)`, `definitionContextOf(state)`, `findDefinitionIn`, `getDefinitionIn`, `offeredTypes(ctx, seedVersion)`, `tagPrefixOf`, noun/gender helpers here or in a new `types/` module.
- `seed/schema.ts:311` `blockDefinitionSchema` (closed enums stay for seeds); `BlockDefinition` TS type widens keys to `string`, `block_type` to `BlockTypeKey`; new `companyTypeDefinitionSchema` (strict) and `companyTypeDraftSchema` (deep-partial, loose) per AD-21 item 2; `asBlockDefinition(versionRow)` (`library: true`, `sub_blocks` derived, `criteria` carried).
- `seed/criteria.ts:124` `compareCriterion` -- add `between` (`value_max`) and `pass_fail`; `reading-evaluation.ts:42`, `measurement-evaluation.ts:333`, `templates/text.ts:367` look criteria up in `SEEDED_CRITERIA`: resolve from the definition's own `criteria` first for a company type.
- `schemas/block-config.ts:61` `blockTypeSchema` -> union with `companyBlockTypeSchema` (`type:` + uuidv7); `blockConfigSchema` gains `type_version` + refinement; `templateBlockSchema` inherits it; company `na_defaults` / `sub_blocks` keys are strings checked by `applyOp`.
- `schemas/entities.ts:734` `entityRowSchemas`, `ENTITY_SCOPE` (company), row types; `schemas/snapshot.ts` `equipment_types?` (ordered `type_id`, `version`).
- `ops/path.ts:99` families `equipment_type`, `equipment_type/field` (`draft|retired_at|removed_at`), `equipment_type_version` (create only); `ops/apply.ts` (`assertSeedPath` 375, block create check 343-357, `SeedPathError` 260) refusals of AD-3 note; `ops/targets.ts` names the type row for a version create; `ops/materialize.ts` derived `latest_version`; `editedSince` / `countsAsFieldContent` exclude the families; `ops/replay.test.ts` gains the AD-3 log.
- Call sites to migrate (measured on 186cacee): getDefinition 56 refs/25 files, findDefinition 52/21, getSeed 29/13, findSeed 17/7, equipmentTypesOf 11/6, naDefaultsFor 6/3, isLibraryType 5/3. `grep -rn` them; move every one that can receive a block's type to the `...In` form; leave seed-only ones.
- `print/group-for-print.ts:64,114` -- company type -> `outros`, titled `print_title ?? label` of its version; `relatorio/instantiate.ts` latest version per company template block; `templates/compose.ts`, `templates/list.ts` totals; `photos/caption.ts` `contextCaption` noun; `relatorio/conclusion.ts` text with noun/gender; `registry/nc-phrase-row.ts` + learner skip company blocks; `relatorio/pre-issue.ts`, Sumário counters.
- `contract/version.ts:319,508` -> 33 / 33 with a paragraph after 32's (e22r may append notes under 32; keep order).
- New `types/validate.ts` (or similar): `validateTypeDraft(draft) -> {path, message}[]` pt-BR, same rules as strict schema; `duplicateSeededType(seedVersion, blockType)`, `duplicateCompanyType(versionRow)`, type status words (`Rascunho`, `Publicado · versão N`, `Aposentado · versão N`, "Rascunho da versão N+1 aberto").

Api (`apps/api/src`): `sync/apply.ts` (generic fold; company stream; `targetsOf` loads pushing company only), `sync/pull.ts` company stream carries both entities, `sync/snapshot.ts` `toSnapshot` fills `equipment_types`, `http/generate.ts` + document renderer `.../sections/section-9.ts` resolve via `definitionContext(snapshot.equipment_types)`; `jobs/reading/*` and `jobs/audit/job.ts` must not throw on a `type:` block (resolve via the company rows; if a reading job cannot, the kernel says "no plate fields" and the PR lists it as a narrowing).

Web (`apps/web/src`): `db/schema.ts` generic `entities` (no Dexie version bump needed unless an index is); `db/snapshot.ts`, `db/relatorio-snapshot.ts` fill `equipment_types`; a live query hook over version rows -> `definitionContext`, passed to every kernel call that takes it; `surfaces/templates/templates-surface.tsx` (list section), new `surfaces/templates/type-editor.tsx` (route `/templates/tipos/:id` in `app.tsx:144`), `template-composer.tsx`, `block-palette.tsx`; field palette and sheet under `surfaces/ficha/` and `surfaces/relatorio/`; `copy/pt-br.ts`, `copy/ui.ts`.

Mocks: `ux-fasor-2026-09-18/mockups/prototype/screens/41-templates.html` lines 21-178 (Tipos section from 88), `43-tipo-equipamento.html` (grep class names, read ranges); `MOCK-GUIDE.md:227`; `EXPERIENCE.md:50-51`.

E2E: `e2e/support/palette.ts` (palette from the kernel); `e2e/support/groups.ts` `SERIAL_SPECS` (a spec that generates a DOCX goes there).

## Tasks & Acceptance

**Execution, part A (Story 14.6, implementer A):**
- kernel schemas, families, fold, refusals, resolver, `asBlockDefinition`, `compareCriterion`, `validateTypeDraft`, duplicate helpers, snapshot `equipment_types`, print group, composed texts, NC-learner skip, call-site migration, contract 33 -- per Code Map.
- unit tests: schema round trips (seed configs byte-equal), every refusal of the matrix with a boundary (version = latest, latest+1, latest+2; removed type; latest 0 vs 1 for discard), `compareCriterion` seven operators incl. `between` at both bounds, `validateTypeDraft` messages, replay byte-equal with the AD-3 log on both adapters, snapshot without company blocks byte-equal.
- api: both toSnapshot adapters, pull/push of the families, generate path with a company block (renders under "Outros equipamentos"); integration tests through the sync route for every new refusal, cross-tenant (company B block create naming A's type refused; B's pull never carries A's rows), publish conflict two-device.
- web plumbing only: Dexie snapshot fill and the context hook, so part B can render.

**Execution, part B (Stories 14.7 and 14.8, implementer B):**
- `templates-surface.tsx` Tipos de equipamento list (Da empresa / Da biblioteca, pills, Editar · Duplicar · Aposentar with Confirm, Descartar rascunho, Reativar; toasts with "Desfazer"); reachable only from Templates.
- `type-editor.tsx` with the six tabs of the mock, autosave as draft ops, inline kernel issues with tab counts, "Publicar versão N" disabled with the first issue as reason, Aposentar in the Sticky action bar, Pré-visualização built from the sheet components, never saved.
- palettes (composer + field) offer published non-retired company types after the seeded ones, label order, Quantity stepper, suggested TAG; composer shows recorded and newer version; retired types marked "Aposentado".
- sheet rendering for company blocks (nameplate, checklist, tests incl. measurement table, bulk actions, evaluation, suggested conclusion + text, Não ensaiado, photos, points); section 9, Sumário, pre-issue.
- e2e: `e2e/type-editor.spec.ts` @p0 (copy, publish, edit to v2, retire; 768 and 1280 px; asserts committed outbox/Dexie state); `e2e/company-type.durability.spec.ts` @p0 (14.8 DoD: duplicate library CTA, change one criterion and one checklist item, publish, place in a template, create relatório, fill offline, reload, sync, generate DOCX and read its table under "Outros equipamentos"; a relatório from the library CTA created before is unchanged; R1 on v1 keeps v1 after v2). Add the DOCX one to `SERIAL_SPECS`. Update every spec that asserts palettes, block counts, Sumário counts, section 9 group order or the settings menu, reading lists from the kernel.

**Acceptance Criteria:**
- Given Templates, when the "Tipos de equipamento" list renders, then library types show read-only with "Duplicar" only, company types show Rascunho / Publicado · versão N / Aposentado · versão N, and no field surface links to it.
- Given a duplicated draft, when the user edits identification, placa, verificações, ensaios (format picker incl. Tabela de medições) and critérios (with source), then each change is a draft op, kernel issues show inline, and the preview renders the sheet.
- Given a valid draft, when "Publicar" is tapped, then version N is frozen; a later edit opens N+1; "Aposentar" confirms, hides the type from palettes and every block using it keeps working.
- Given a renamed company type published as v2, when palettes, composer, sheet header and print are read, then relatórios created after show the new name and earlier ones keep v1's.
- Given a published company type, when the composer and field palette open, then it is offered after the seeded types with Quantity stepper and suggested TAG; a template records `type_version`.
- Given a company block filled offline, when the relatório generates, then section 9 prints it under "Outros equipamentos" after Transformadores with its tables, and the Sumário and pre-issue count it.
- Given the replay test with company types, when folded on both layers, then snapshots are byte-equal and seeded-only snapshots are unchanged.

## Design Notes

- Duplicate of a seeded type: copy `label`, `print_title`, nameplate, checklist (every subtype's items applicable, no `na_defaults`), tests, `measurement_tests`, `config_fields`, `oil_rule` only if the strict schema allows it (otherwise drop and list as narrowing); materialize `criteria[]` from `SEEDED_CRITERIA` for each `criterion_key` (and measurement `seeded` refs) so the Critérios tab edits the copy's own values; `tag_prefix` from `TAG_PREFIX`; noun/gender from the existing composed-text tables. The copy's label is the seeded label plus " (cópia)" -- authored, listed.
- `asBlockDefinition` makes every reader take one type: readers that switch on a seeded `block_type` (transformer ratio, oil, vector group) see a `type:` key and fall to the generic path; check each such switch.
- Context threading: `applyOp` builds the context from version rows in state; kernel functions over a snapshot build from `snapshot.equipment_types`; functions over rows take it as an argument. Memoize `definitionContext` by rows identity.

## Verification

All inside the tools container (`podman compose --profile tools run --rm --user root tools ...`), under `lockf -t 20000 /tmp/fasor-verify.lock` for Vitest and Playwright, logs in `.scratch-e22t/`:
- `pnpm lint`, `pnpm static` -- exit 0.
- `pnpm test:unit`, `pnpm test:api` -- all green (restart api after kernel/api changes).
- `pnpm exec tsx scripts/e2e.ts <touched specs> --project desktop-chrome --project durability-desktop-chrome` -- green; touched durability specs also on `durability-android-chrome` and `durability-webkit`.

Machine facts (this host): `podman compose`, never docker; the stack is `fasor-e22t` (`.env`, `compose.local.yml` in the worktree), images `localhost/app-api-e22t` and `localhost/app-tools-e22t` exist: never build, `podman untag` or `podman rmi`. One Vitest file: `pnpm exec vitest run --project @app/web <file>` (or the domain/api project). Host lock: `lockf -t 20000 /tmp/fasor-verify.lock sh -c '...'` started with nohup in the background, output to `.scratch-e22t/<name>.log`, never a foreground wait over 60 s; never let full test output into context (tail the log). `podman compose restart api` after a change under `packages/domain` or `apps/api`, before test:api and e2e. Before any Vitest or Playwright run, if `/private/tmp/claude-502/-Users-matheusvilella-Documents-estudos-fasor-app/4b366af1-2a1f-4c68-adfe-40511ad7328a/scratchpad/wave-b-gate/gate.running` exists, do not run: keep implementing and check again later. Never `pkill` by pattern; never `podman compose down -v`. Commit WIP on branch `e22t-company-types` at milestones (messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), no emoji.

Split of work: implementer A builds part A only (14.6) and the web plumbing, ends with lint, static, test:unit and test:api green, commits, and reports. Implementer B starts from A's commit and builds part B (14.7, 14.8) and its e2e. Each records in its report: narrowings, authored pt-BR strings, open questions.
