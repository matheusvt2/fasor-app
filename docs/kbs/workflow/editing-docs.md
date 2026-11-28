---
type: Process
title: Editing planning documents
description: Which document wins on conflict and how to change a sentence without deleting it.
tags: [workflow, docs, planning]
timestamp: 2026-11-28T00:00:00Z
sources: [AGENTS.md]
---
# Editing planning documents

- Precedence when documents disagree: `source-deltas.md`, then the architecture spine, then `EXPERIENCE.md` and `DESIGN.md`, then `prd.md`.
- Never delete or silently rewrite a sentence: strike the old text (`~~old~~`), add the new text beside it with the date, keep the reading order above. Example in the spine AD-27: CDK struck, Terraform added on 2026-09-29.
- Two exceptions, both of the repository clean-up of 2026-11-28 (Matheus). `AGENTS.md` is written clean, with no struck text: its superseded wording is kept in `AGENTS-history.md` at the repository root, so a rule that changes there is rewritten in place and its old wording goes to the history file. And a closed epic leaves `epics.md`: Epics 1 to 30 with all their stories are in `_bmad-output/planning-artifacts/epics-archive.md`, text unchanged, and a dated correction to a closed story is written there with the same strike-through rule.
- Moving is not deleting: rows that close move verbatim to an archive beside the live file (`deferred-work-archive.md`, `sprint-status-archive.yaml`, `docs/kbs/log-archive.md`).
- `prd.md` predates decisions: it says "Laudo", has wrong nameplate field counts, an export-time section-9 option and a Home "Continue" card. Each override is a row in `_bmad-output/specs/spec-fasor/source-deltas.md`; never build from a PRD sentence that file overrides.
- Current prototype screens for the Sumário and the Export dialog: `prototype/screens/40-relatorio-overview.html` and `73-exportar.html`; `key-relatorio-overview.html` and `key-export.html` are older and superseded there (MOCK-GUIDE v0.8). See [mockups-and-css](/ux/mockups-and-css.md).
- All new documents are English; Portuguese only for domain words, pt-BR UI copy and existing Portuguese READMEs.
- Keep [the KB](/index.md) in sync when a summarized document changes, and add a line to [log](/log.md) ([maintaining-the-kb](/workflow/maintaining-the-kb.md)).

Canonical: `AGENTS.md` "Conventions that differ from defaults" and "Known pitfalls"; `_bmad-output/specs/spec-fasor/source-deltas.md`.
