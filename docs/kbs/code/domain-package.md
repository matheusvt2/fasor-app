---
type: Code Map
title: packages/domain/src folders
description: What each kernel subfolder owns, so new pure logic lands in the right place.
tags: [code, domain, kernel]
timestamp: 2026-09-30T00:00:00Z
sources: [packages/domain/src]
---
# packages/domain/src

- `ops/` op type, `path.ts` (OpPath families), `apply.ts` (applyOp), `materialize`, `replay`, `outbox`, `order-key`.
- `schemas/` entity, block, file, snapshot zod schemas. `contract/` typed API routes, errors, `ocr.ts`, `reading.ts`, `generate.ts`, `sync.ts`, `version.ts` (CONTRACT_VERSION).
- `relatorio/` sheet and relatório logic: `ficha`, `cabine`, `conclusion`, `parecer`, `progress`, `pre-issue`, `integrity`, `instantiate`, `move`, `readings`, `reading-evaluation`, `nameplate-copy`, `resume`, suggestion builders.
- `status/` status table, `edited-since`. `merge/` policy, rules, conflicts (multi-device). `sync/` counts, status, streams.
- `seed/` versioned definitions (`v1`..`v3`, `criteria`, `sections-v1`, `template*`). `templates/`, `registry/`, `registration.ts`.
  *(2026-10-13: `seed/` holds `v1`..`v5` and `measurement.ts` (the measurement-table grammar, Story 14.5); `relatorio/measurement-evaluation.ts` evaluates it; `ops/path.ts` gains the family `sheet/test/value`; `CONTRACT_VERSION` is 19. See [measurement-table](/architecture/measurement-table.md).)*
  *(2026-11-07, Story 14.6, batch e22t: `types/` holds the company equipment types: `definition.ts` (the strict definition and the loose draft schemas), `validate.ts` (`validateTypeDraft`, its pt-BR issues), `block-definition.ts` (`asBlockDefinition`), `duplicate.ts` ("Duplicar" and the status words); `seed/definitions.ts` gains the resolver context (`DefinitionContext`, `findDefinitionIn`, `offeredTypes`); `ops/path.ts` gains the families `equipment_type`, `equipment_type/field` and `equipment_type_version`; `CONTRACT_VERSION` is 33.)*
- `print/` `group-for-print`, `section-7..11`, `document-control`, `layout`, `revisions`, `last-nameplate`, `sm-c1`.
- `parse/` and `format/` pt-BR numbers, dates, units (the only place). `text/` plural and composed texts (derived pt-BR lives here, see [copy-homes](/ux/copy-homes.md)). `home/`, `points/`, `photos/`, `files/`, `drafts/`, `device/`, `prefs/`, `reading/`, `checks/`.
- `ids.ts` UUIDv7, `clock.ts`, `product.ts` (the `PRODUTO` constant; *2026-11-03, Story 20.1: value `Conforme`*).

Rule: no I/O, no framework, zod only. Exported through `src/index.ts`. Decision context: [kernel-and-seed](/architecture/kernel-and-seed.md).
