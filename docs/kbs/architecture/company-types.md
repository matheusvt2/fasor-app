---
type: Architecture Rule
title: "Company equipment types and learned options"
description: "What an office adds beside the frozen seed: learned NC phrases and manufacturers, its own equipment types and their versions, the nominal plus or minus percent criterion. Open for Cadastros, the type editor or a block of a company type."
tags: [architecture, company-types, registry, ad-19, ad-21]
timestamp: 2026-11-28T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-21, ARCHITECTURE-SPINE.md#ad-19, packages/domain/src/types, packages/domain/src/registry/nc-phrase-row.ts]
---
# Company equipment types and learned options

The seed is frozen code ([seed-versions](/architecture/seed-versions.md)); what a company adds lives in its own data, in the op log. The dated notes below were moved unchanged from `kernel-and-seed.md` on 2026-11-28; a note marked "planning, not built" is kept as history beside the "as built" note that followed it.

*(2026-10-21, Story 14.12 as built: the company's learned options, with no seed change. `packages/domain/src/registry/nc-phrase-row.ts` holds the whole rule: `learnedOptionCandidates` (what a push teaches from a block's end-of-push row: NC observations split at the offered phrases, at most 200 characters, and FABRICANTE values, deduplicated by `normalizeRegistryName` against the item's seed phrases in every shipped version and every row of the same key, live or removed), `ncChipPhrases` (the only chip-list function: seed, live learned by id, recents) and `ncPhraseRegistryRows`/`ncPhraseRegistryGroups` (Cadastros › Frases de NC). The registry gains the kind `nc_phrase` `{block_type, item_key, name}`, its type and item immutable (`ops/path.ts`). Contract 23. Spine AD-19 carries the dated note.)*

*(2026-11-06, planning, not built: company equipment types, Epic 22 wave C, Stories 14.6 to 14.8. The spine's notes of 2026-11-06 under AD-3, AD-15 and AD-21 settle the 2026-10-08 amendment: two company-scope entities, `equipment_type` (whole-draft puts, `retired_at`, derived `latest_version`) and the create-only `equipment_type_version`; `blockTypeSchema` becomes a union of the closed enum and `type:{uuidv7}`, with `BlockConfig.type_version`; definitions resolve through a `DefinitionContext` (`findDefinitionIn`/`getDefinitionIn`) that `applyOp` builds from state and snapshot readers from `snapshot.equipment_types`; the old `getDefinition`/`findDefinition` stay seed-only; a library type is renamed only through "Duplicar"; contract 33; no seed version. Coordinator's reading under Matheus's "Cadastro e padrões", open to his correction.)*

*(2026-11-07, fix batch e22h, the wave C integrated review, contract 33 amended in place, minimum 33: a company block's config also carries `type_version_id`, the id of the version row it was created with, and every lookup resolves a block through that id (`TypeVersionRef`, `DefinitionContext.byId`, `versionRowIn`); `applyOp` refuses a company block create without it or naming a row not of that type and number, so a refused publish never binds a block to another device's definition, and "Reenviar" renumbers a refused publish and the blocks naming it (`resendRenumberedVersions`, `sync/resend.ts`). "Duplicar" keeps the source's `criterion_bands`, `criterion_class_field` and `oil_rule`, and the vector-group plate field is read from the data for a company type, so a copy judges as its source; the Critérios tab shows plate-picked criteria read-only. A version row reads with a structural schema (`companyTypeVersionDefinitionSchema`), the strict one only on its create. Every kernel helper that can meet a block takes the definition context as a required argument, and snapshot-shaped inputs require `equipment_types`. `criterionRulesFor` offers `pass_fail` only on a row no test uses and `±` only on the ratio deviation.)*

*(2026-11-11, Stories 24.18 to 24.20 as built, batch e24c, contract 45 with minimum 45, `spec-e24c-company-types.md`; company types only, no seed change, no golden moved.)*

- *"nominal ± %" (24.18): `COMPANY_CRITERION_OPERATORS` gains `nominal_pct` after `between`, with the optional `tolerance_pct` (above zero) on the criteria row; `criterionRulesFor` offers it wherever `between` goes except the ratio's deviation. `seed/criteria.ts` `nominalBounds(value, tolerance)` (12 significant digits, ordered) and `formatCriterionValue` ("220 V ±5 %", B-9 open). `asBlockDefinition` reads the row as a `between` over the bounds with its own `text`, so every reader judges and prints it as a range row. The editor's row: `.tipo-nominal`, `draftCriterionText`.*
- *A copy hides its original (24.19): `relatorio/tree.ts` `hidingCopies(ctx, seed)` maps a seeded or library type to its published, non-retired copies (`base_block_type`, label order); `paletteTypeGroups` stands them in its place, `PaletteItem.company` marks the row "Tipo da empresa"; `panelTypeChips` and `panelProposal` take the context (one copy proposed, several none); `libraryTypeListRows(seed, ctx)` gives `hiddenText`.*
- *The publish rule (24.20): `types/validate.ts` `vectorGroupPublishIssue` (a ratio table by vector group with no valid `ligacao_secundaria`) is one issue of `validateTypeDraft`, outside the strict schema; the push route refuses the version create `op_invalid` (`apps/api/src/sync/rules.ts`); `updateDraftFieldRefusal` refuses a kind or options change of the valid field.*

## Canonical sources

- `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`: the notes of 2026-11-06 under AD-3, AD-15 and AD-21; the dated note under AD-19.
- Stories 14.6 to 14.8, 14.12 and 24.18 to 24.20: `_bmad-output/planning-artifacts/epics-archive.md`.
- `_bmad-output/implementation-artifacts/epic-24/spec-e24c-company-types.md`.
- Code: `packages/domain/src/types/`, `packages/domain/src/registry/nc-phrase-row.ts`, `packages/domain/src/relatorio/tree.ts`, `packages/domain/src/sync/resend.ts`.
