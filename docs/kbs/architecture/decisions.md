---
type: Decision Lookup
title: AD-1 to AD-27 lookup
description: One line per architecture decision with the concept file that summarizes it.
tags: [architecture, adr]
timestamp: 2026-09-30T00:00:00Z
sources: [_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md]
---
# Decision lookup

| AD | One line | File |
| --- | --- | --- |
| 1 | UI reads only IndexedDB; writes are ops in the outbox | [ops](/architecture/ops-and-local-first.md) |
| 2 | Status, count, text, order, verdict computed once in the kernel | [kernel](/architecture/kernel-and-seed.md) |
| 3 | Typed op log; applyOp is the only reducer | [ops](/architecture/ops-and-local-first.md) |
| 4 | Client-generated UUIDv7 ids | [ops](/architecture/ops-and-local-first.md) |
| 5 | Ownership: Company, Project, Relatório, Cabine | [data](/architecture/data-model.md) |
| 6 | Location tree carries cabine data; "first sheet" computed | [data](/architecture/data-model.md) |
| 7 | File entity, durability, photo variants | [files](/architecture/files-and-photos.md) |
| 8 | Service worker shell, sync only while tab open, Safari envelope | [sync](/architecture/sync.md) |
| 9 | Same-origin session, per-user Dexie database | [sync](/architecture/sync.md) |
| 10 | company_id explicit on every read | [sync](/architecture/sync.md) |
| 11 | Field kinds and value shapes; pt-BR parse/format only in kernel | [kernel](/architecture/kernel-and-seed.md) |
| 12 | Suggestion entity, lifecycle as ops, provenance column | [suggestions](/architecture/suggestions-and-reading.md) |
| 13 | Dependency direction, typed API contract, error envelope | [kernel](/architecture/kernel-and-seed.md) |
| 14 | Reading pipeline: OcrProvider plus LLM, LLM never emits coordinates | [suggestions](/architecture/suggestions-and-reading.md) |
| 15 | One server renderer over a frozen snapshot | [rendering](/architecture/rendering.md) |
| 16 | Capture order is not print order; scheme is typed | [rendering](/architecture/rendering.md) |
| 17 | UTC wire, America/Sao_Paulo display, photo numbering at generation | [files](/architecture/files-and-photos.md) |
| 18 | Sheet state precedence and attribution | [data](/architecture/data-model.md) |
| 19 | Registry refs: Instruments and Clients by id, rest by value | [data](/architecture/data-model.md) |
| 20 | Soft delete with tombstones | [ops](/architecture/ops-and-local-first.md) |
| 21 | Seed is versioned code; BlockConfig only thing copied | [kernel](/architecture/kernel-and-seed.md) |
| 22 | Status table has one home in the kernel | [kernel](/architecture/kernel-and-seed.md) |
| 23 | Mockup CSS is the design system; React Aria behavior | [ui](/architecture/ui-system.md) |
| 24 | Sync cycle, rebase, rejection semantics | [sync](/architecture/sync.md) |
| 25 | Equipment is project scope; last_nameplate projection | [data](/architecture/data-model.md) |
| 26 | Section 8: photo tokens, derived untested entries | [rendering](/architecture/rendering.md) |
| 27 | Containers, AWS, Terraform | [infra](/architecture/infra-aws.md) |
