---
title: 'Story 14.12: learned company options (NC phrases per type and item, FABRICANTE, office review)'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
baseline_revision: 'f064f45c53b0f488c54cc696214e31ebb122c379'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: ['batched', 'oversized']
deferred: []
---

Batched: batch e14e holds one story, 14.12, run as a wave-4 batch beside e14d (Story 14.14, contract 22, seed v7);
the `batched` warning marks the parallel-lane delivery, not several stories. Contract 23, no seed change.
Sources: `epics.md` Story 14.12 (line ~3781) with its 2026-10-21 note and answers 1-4; `source-deltas.md` rows 106
and 110; `epic-14-context.md` § "Wave 4 batches".

<intent-contract>

## Intent

**Problem:** A technician who types an NC observation the chips lack, or a FABRICANTE the company list lacks, must
type it again on every later sheet; Bruno asked that such a value "become an item for the next ones".

**Approach:** On a client push the server learns, under the company lock and deduplicated, each typed NC phrase
(per equipment type and checklist item, a new registry kind `nc_phrase`) and each typed FABRICANTE (a
`manufacturer` registry row, AD-19's existing registry) as server ops on the company stream; one kernel function
gives a row's chips (seed phrases, then live learned ones, then the relatório's recents); the office renames or
removes learned phrases in a new Cadastros tab "Frases de NC", and manufacturers in the existing Fabricantes tab.

## Boundaries & Constraints

**Always:**
- Architecture decisions (recorded here and as a dated note in the spine, below) are binding: store = registry
  rows (`registry/{kind}/{id}` families, AD-5/AD-10 company stream, AD-24 pull); learning = server-side post-pass of
  a client push, idempotent and deduplicated; offered list = kernel; stored sheet values never touched.
- A learned option never changes any stored value, any relatório or any generated document (AD-15, AD-19, AD-21);
  the seed's lists never change.
- Dedupe by `normalizeRegistryName` (`packages/domain/src/text/normalize-name.ts`) against the seed phrases of the
  item (every shipped seed version that defines that type and item) and against EVERY row of the same key, live or
  removed: an option the office removed is never re-learned (conservative reading; listed as open question).
- `CONTRACT_VERSION = 23`, `MIN_CONTRACT_VERSION = 23` with a "23" paragraph in both doc blocks of
  `packages/domain/src/contract/version.ts` (a version-22 bundle cannot parse `registry/nc_phrase/...`: its
  `registryKindSchema` refuses the kind, failing the whole pulled page). Keep e14d's 22 paragraphs when merging.
- pt-BR copy in the three homes (AGENTS.md); authored strings marked `// authored:` and listed in the PR body.
- New `@p0` e2e asserts committed state (IndexedDB rows), not only the screen (E12-A6).

**Never:**
- No seed change, no new seed version, no change to `getDefinition`, closed type enums or select `options`.
- No learned extinction medium (Story 14.14), no other select field, no site-checklist (Verificações do local)
  learning, no approval queue, no client-created `nc_phrase` row.
- `apps/*` never merges, orders or dedupes chip lists; `apps/web` never derives a learned phrase.
- Do not change the "Criar ⟨nome⟩?" flow of FABRICANTE, nor the server merge of client manufacturer creates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| NC typed | push leaves block (disjuntor) item X result NC, observation "Fuga no bujão" | one server create `registry/nc_phrase/{id}` `{block_type, item_key: X, name: 'Fuga no bujão'}` in the push's transaction | none |
| Chip + typed | observation "Seed phrase A, fuga no bujão" | splits at every offered phrase (seed + live learned) occurrence; learns "fuga no bujão" only (pieces trimmed of whitespace and `,;.`) | empty pieces skipped |
| Only chips | observation is seed/learned phrases joined by insertPhrase separators | nothing learned | none |
| Not NC | result C, NA or null at end of push | nothing learned from that item | none |
| Too long | a piece > 200 chars after trim | not learned | none |
| Duplicate | same normalized text already a row (live or removed) of that key, or a seed phrase | nothing created | none |
| Two devices | two pushes with "Fuga no Bujão" and "fuga no bujao" | one row (company lock serializes; second finds the first) | none |
| Same push twice | re-sent op_ids (dedupe hit) | no second learn (learn reads final rows; dedupe keeps it single) | none |
| FABRICANTE typed | push leaves a nameplate `manufacturer`-kind field = "Celtta" with no manufacturer row of that normalized name | one server create `registry/manufacturer/{id}` `{name: 'Celtta', gender: null, number: null}` | none |
| FABRICANTE known | value equals a live or removed manufacturer row (normalized), or the push's own "Criar" create | nothing created | none |
| Removed block | block `removed_at` set at end of push | nothing learned | none |
| Client nc_phrase create | client pushes `registry/nc_phrase/{id}` create | refused `op_server_only` | per-op rejection |
| Office rename/remove | client put `registry/nc_phrase/{id}/name` or remove `removed_at` | accepted; chips follow; sheets unchanged | `block_type`/`item_key` puts: `op_path_unknown` |
| Other select | value outside a select's options | `SeedPathError` -> `op_invalid` (unchanged, pinned by a test) | per-op rejection |
| Old client | contract 22 header on pull | `426 contract_outdated` | client shows "Atualizar" |
| Other company | company B pulls | never receives A's learned rows | AD-10 |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts` L113-206 -- `registryKindSchema`, `registryRowSchemas`, union: add
  `nc_phrase: {id, removed_at, kind, block_type: equipmentBlockTypeSchema, item_key: itemKeySchema, name}`.
- `packages/domain/src/ops/path.ts` L72-140, L276-281 -- `mutableKeys(keys, alsoImmutable)`; make `block_type`,
  `item_key` immutable for `nc_phrase` (refine on `registry/field`).
- `packages/domain/src/relatorio/ficha.ts` L167-211 -- `recentChecklistObservations`, `insertPhrase` (the separator
  rule the splitter mirrors); `nameplateWordRecents` L215+ (manufacturer chips; learned rows already reach it).
- `packages/domain/src/seed/definitions.ts`, `seed/schema.ts` L22, L59 -- field kind `manufacturer`, item
  `nc_phrases`; shipped versions list for the seed-phrase dedupe.
- `packages/domain/src/registry/word-row.ts` -- precedent for a kernel registry row module (sort, row text).
- `apps/api/src/sync/apply.ts` L143-188 `validate` (client checks), L262-370 registry name cache and merge,
  L733-789 `upgradePushedTemplates` -- THE precedent for the new post-pass (savepoint, `validate(...,'server')`,
  `applyOneIn`, logging, `cache.clear()` on refusal).
- `apps/api/src/sync/server-op.ts` -- `serverOp` envelope; actor `system:registry` (`REGISTRY_MERGE_ACTOR`).
- `apps/api/src/sync/registry-names.integration.test.ts`, `merge.integration.test.ts`, `sync.integration.test.ts`
  L1000ff -- patterns for push-route integration tests and cross-tenant checks.
- `apps/web/src/surfaces/ficha/checklist-section.tsx` L290-312 `sheetRowTarget`, L457 `[...item.nc_phrases, ...recents]`
  (replace by the kernel list); `apps/web/src/surfaces/local/verificacoes-surface.tsx` L122 (site rows: kernel list
  with no learned rows).
- `apps/web/src/surfaces/ficha/use-ficha-data.ts` L20-49 -- live registry queries; add `ncPhraseRows`.
- `apps/web/src/db/home-store.ts` L93-102 -- `manufacturerRows`; add `ncPhraseRows`.
- `apps/web/src/surfaces/registries/registries-surface.tsx` L21 `TAB_IDS`; `word-registry-tab.tsx`,
  `word-registry-panel.tsx` -- list/panel chrome to reuse (classes `registry-row`, `rr-text`, `rr-primary`,
  `registry-panel`, `panel-head`, `field-grid`, `sticky-action-bar`, remove Confirm and undo toast).
- `apps/web/src/copy/pt-br.ts` -- `copy.registries.*` (tab label, empty text, panel copy).
- `e2e/cadastros.spec.ts`, `apps/web/src/surfaces/registries/registries-surface.test.tsx` -- assert the tab list
  (closed list, E14-A3: read tab labels from copy, update).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/schemas/entities.ts`, `ops/path.ts` -- add the `nc_phrase` kind and its immutable keys.
- `packages/domain/src/registry/nc-phrase-row.ts` (new, exported from `index.ts`) -- `ncChipPhrases({seeded,
  learned, blockType, itemKey, recents})` (seed, then live learned of that key by id order, then recents; deduped by
  normalized text; the ONLY chip-list function); `learnedOptionCandidates(block, touched, registryRows)` returning
  `{ncPhrases: {block_type,item_key,name}[], manufacturers: string[]}` per the matrix (split, trim, 200 cap, NC
  only, live block, dedupe vs seed of every shipped version and every row live or removed, and within the result);
  `ncPhraseRegistryRows(rows)` sorted by type label, item label, name with `{primary, secondary}` text (type and
  item labels from the current seed definitions, fallback the key). Unit tests for every matrix row.
- `packages/domain/src/contract/version.ts` -- 23 / MIN 23 paragraphs; contract test updated.
- `apps/api/src/sync/apply.ts` -- `validate`: client `create` on `registry/nc_phrase/*` -> `op_server_only`;
  `learnPushedOptions` post-pass after `upgradePushedTemplates` (client origin only): blocks touched by applied
  `sheet/{id}/checklist/{item}/{result|observation}` and `sheet/{id}/nameplate/{field}` ops, read final rows plus the
  company's `nc_phrase` and `manufacturer` rows, call the kernel, apply one server batch of creates (`system:registry`,
  scope company, new ids) under a savepoint; refusal logged and skipped, never failing the push; the push's answer
  lists only the device's ops.
- `apps/api/src/sync/learned-options.integration.test.ts` (new) -- through the sync route: NC learn, chip+typed
  split, FABRICANTE learn, no duplicate across two devices and case/diacritics, removed not re-learned, client create
  refused, rename/remove by client accepted, cross-tenant pull, contract 22 pull -> 426, a relatório's snapshot and
  print layout byte-equal before and after rename/remove, other select value still `op_invalid`.
- `apps/web/src/db/home-store.ts`, `surfaces/ficha/use-ficha-data.ts`, `checklist-section.tsx`,
  `local/verificacoes-surface.tsx` -- target carries `chips: string[]` from `ncChipPhrases`; `ChecklistRow` renders
  `target.chips` only.
- `apps/web/src/surfaces/registries/frases-nc-tab.tsx` (new) + panel, `registries-surface.tsx` -- tab id
  `frases-nc` after `fabricantes`; list grouped by type with item as secondary line; panel: "Frase" text field
  (rename on commit), Remover with Confirm and undo toast (restore = put `removed_at` null); empty state.
- `apps/web/src/copy/pt-br.ts` -- authored copy (tab "Frases de NC", empty text, panel labels).
- `e2e/learned-options.spec.ts` (new) -- `@p0`: on a disjuntor sheet mark an item NC, type an observation by hand,
  type a new FABRICANTE, "Sincronizar agora"; open a second relatório of the company, add a disjuntor, find the chip
  on that item after the seed chips and the manufacturer chip offered; in Cadastros › Frases de NC remove the phrase,
  sync, chip gone on the second relatório; the first relatório still holds and shows its observation (IndexedDB
  cell asserted); Fabricantes lists the learned name. `@p1`: a second browser context of the company sees the chip
  only after its own sync; a 390 px fit of the new tab.
- `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md` -- dated
  "Added 2026-10-21 (Story 14.12, as built)" note under AD-19 stating these decisions and that Story 14.6 extends
  the same registry and server-learn mechanism.
- `docs/kbs/architecture/kernel-and-seed.md`, `docs/kbs/architecture/sync.md`, `docs/kbs/log.md` -- dated notes.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- entries: site checklist not learned (owner: a later
  dated decision); idle-commit partial text may be learned (500 ms idle commit, 60 s push; office removes it).

**Acceptance Criteria:**
- Given an NC row on a sheet of any seeded or library type, when an observation typed by hand syncs, then every
  later sheet of that type in the company offers it as a chip on that item after the seed chips, once.
- Given a FABRICANTE typed with no matching registry row, when the relatório syncs, then later sheets offer it and
  Registries › Fabricantes lists it, the sheet keeping the spelling typed.
- Given the office renames or removes a learned phrase, when a later sheet opens, then it offers the new spelling
  or nothing, and no stored value or generated document changes.
- Given two devices of one company, when one learns an option, then the other offers it only after its next pull,
  and a device of another company never sees it.
- Given a client on contract 22, when it pulls from a contract-23 server, then it gets `426 contract_outdated`.

## Design Notes

Why server-side post-pass and not an op written by the device: the DoR asks for learning "at sync, server-side,
idempotent and deduplicated"; the company lock already serializes pushes, so two devices typing the same value
converge on one row with no client merge (the manufacturer merge-on-create exists only for client creates). Why
learn from end-of-push rows and not from each op: a push carries several idle commits of one field; reading the
final cell learns the settled text of that push.

Why a new registry kind rather than a field on the seed: AD-21 keeps the seed frozen; registry rows are the company
data that already reach every device through the company stream (offline before first pull: nothing learned is
offered, the seed chips still are). Story 14.6 extends this same registry family for company types.


**Open questions taken at their conservative default (list each in the PR body):**
1. What FABRICANTE adds to the registry: a typed name is registered at sync by the server with no "Criar" tap,
   gender and number null; "Criar ⟨nome⟩?" stays as it is.
2. A removed learned option (phrase or manufacturer) is never re-learned when typed again; the office can only
   restore it through the undo toast.
3. Learned phrases are pieces of the observation split at the offered phrases, at most 200 characters; a confirmed
   AI NC draft or a dictated text counts as typed text.
4. The site checklist (Verificações do local) learns nothing: answer 7 scopes phrases per equipment type.
5. The office review surface was not drawn with `bmad-ux` (DoR 3): it reuses the Fabricantes list and panel
   classes; its copy is authored for Bruno.
6. Every Cadastros user may rename or remove a learned phrase, as with Fabricantes (no office-only role exists).

## Verification

**Commands (inside tools, `podman compose --profile tools run --rm --user root tools ...`, under the host lock):**
- `pnpm lint`, `pnpm static` -- expected: clean.
- `pnpm test:unit` and `pnpm test:api` -- expected: green, including the new kernel and integration tests.
- `pnpm exec tsx scripts/e2e.ts e2e/learned-options.spec.ts e2e/cadastros.spec.ts e2e/ficha.spec.ts
  e2e/verificacoes-local.spec.ts e2e/nameplate-values.spec.ts e2e/nc-draft.spec.ts --project desktop-chrome
  --project durability-desktop-chrome` -- expected: green.
