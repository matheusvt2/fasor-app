---
type: Architecture Rule
title: Data model: ownership, location tree, sheet state, registries, equipment
description: AD-5, AD-6, AD-18, AD-19, AD-25. Open when adding an entity, touching Location/Cabine, sheet state, registries or Equipment.
tags: [architecture, data-model, ad-5, ad-6, ad-18, ad-19, ad-25]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-5, ARCHITECTURE-SPINE.md#ad-6, ARCHITECTURE-SPINE.md#ad-18, ARCHITECTURE-SPINE.md#ad-19, ARCHITECTURE-SPINE.md#ad-25]
---
# Data model

- **Ownership (AD-5)**: Company owns users, Templates, Projects and registries (Empresa, Clients, Instruments, Manufacturers, Voltage classes, Atividades, Locais, Criteria). Project = client plus site (Site collapsed into Project) and owns Equipment `{id, project_id, tag, type, last_nameplate?, removed_at?}`. Relatório owns its Location tree, blocks, sheet values, photos, points, suggestions, generation jobs, revisions, `export.scheme`. Creation is one client batch from `instantiateTemplate`; the server never copies a Template. A company- or project-scope row never references a relatório-scope row.
- **Location (AD-6)**: `{id, relatorio_id, parent_id?, kind cabine|coluna, name, order_key, se?, env?, agrupar_por_tipo?, removed_at?}`; `se`, `env`, `agrupar_por_tipo` only on `kind = cabine`. "First sheet" of a cabine is computed (`firstInTree`), never stored. `feeds_block_id` pairs a cabos-de-saída block to its transformer; `groupForPrint` pairs only by it.
- **Sheet state (AD-18)**: `not_tested != null` -> Não ensaiada; else `concluded_by != null` -> Concluída (kept through edits; `integrity` flags "concluída com pendências"); else any non-empty enabled cell -> Em preenchimento; else Vazia. Attribution fields are materialized by `applyOp`, never emitted. Values in a disabled sub-block are kept but ignored by progress, pre-issue, conclusion, integrity, counts and renderer.
- **Registries (AD-19)**: Clients and Instruments by id; selecting an instrument copies its whole header onto the sheet at that moment (`calibrationCheck` compares `valid_until` with the service period end, expiring within 30 days). Manufacturer, Voltage class, Atividade, Local are stored by value; registries are suggestion lists deduplicated server-side by normalized name.
- **Equipment (AD-25)**: `equipment/*` ops are project scope and reach every relatório stream of the project. Uniqueness of `(project_id, tag)` is a kernel `integrity` check, not a DB constraint. `equipment/{id}/last_nameplate` is a `system:generate` op emitted when a revision is stored; "Copiar da última visita" reads it from Dexie and never fetches.

Schemas: `packages/domain/src/schemas/`, `packages/domain/src/relatorio/`, `packages/domain/src/registry/`. Drizzle tables: `apps/api/src/db/schema.ts`.
