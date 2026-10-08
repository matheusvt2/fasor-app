---
type: Change Log
title: KB change log
description: Chronological record of changes to this knowledge base. Read only when checking freshness.
tags: [kb, log]
timestamp: 2026-09-30T00:00:00Z
---
# Log

- 2026-09-30: bundle created from AGENTS.md, SPEC, glossary, delivery slice, ARCHITECTURE-SPINE (AD-1 to AD-27) and the repository layout at commit 6b21909. Epic 11 was still in progress in sprint-status.yaml at that date.
- 2026-09-30: added verified `Code:` lines (real file paths, functions and constants) to the architecture, ux and workflow concepts, after the A/B test showed agents without KB reached exact code faster. sync.md now lists all five reject codes (`op_tenant_mismatch` was missing); merge-gate.md gives the full `flock` command.
- 2026-09-30: rendering.md and files-and-photos.md name the pdftoppm rasterizer (`pdf-raster.ts`), the sha256 page cache (`certificate-cache.ts`) and the certificate failure rule (Matheus 2026-09-30).
- 2026-10-01: infra-aws.md names the `app_domain` variable and the domain site in the Caddyfile (Matheus 2026-10-01: the app is served under a host name in the client's domain, DNS kept at the registrar).
- 2026-10-05: epics-map.md and suggestions-and-reading.md record that Story 11.6 is unblocked with Claude Haiku 4.5 as the reference model (Matheus 2026-10-05; Sonnet 5.5 still at 0 TPM).
- 2026-10-05: suggestions-and-reading.md and infra-aws.md describe the Story 11.6 Bedrock provider (Converse tool use, the `BEDROCK_*` settings, prices and error classes), the plate escalation (`shouldEscalate`, `betterReading`), the evaluation script and the narrowed IAM; `LLM_PROVIDER` no longer lists `anthropic`.
- 2026-10-05: suggestions-and-reading.md takes the Story 11.6 review-pass escalation rule (more `suggested` wins, an empty reading escalates, a failed escalation keeps the first) and when no Bedrock or escalation provider is built.
- 2026-10-05: epics-map.md lists Story 11.11 (sheet photo strip and direct file picker, Matheus field feedback).
- 2026-10-06: suggestions-and-reading.md records `BEDROCK_PANEL_MODEL_ID` (panel fronts on Qwen3 VL 235B).
- 2026-10-06: Story 11.11 added dated notes to DESIGN.md › Photo capture sheet (two sentences struck through: "Adicionar fotos" opens the system file picker directly, the sheet remains for the denied camera with "Escolher arquivos" a 56 px secondary Button; a sheet batch also goes through "De qual equipamento?", preselected) and to EXPERIENCE.md › Photo capture sheet (the same step from a sheet, and the denied chooser); no KB concept summarized them, so none changed.
- 2026-10-06: epics-map.md gains Epic 13 (photo capture hardening and the emission audit), added to epics.md and sprint-status.yaml from the field UX analysis `ux-fasor-2026-09-18/review-field-ux-2026-10-06.md`; its scope explicitly excludes the 2026-10-06 MVP review findings F-01 to F-29, owned by the review-fix batches.
- 2026-10-06: review fixes batch 2 (`spec-review-fixes-field-defects-2.md`) added dated notes to EXPERIENCE.md › Sticky action bar (the sheet primary reads "Concluir e avançar", D2), › Registries Empresa (struck: Instrumentos as the default tab; Empresa opens first while the company is unregistered, F-20), › Form dialog (the "Novo relatório — tipo e datas" title, opened at once from Home, D3), › Export dialog (the "N fichas vazias" line and the issue confirmation, the empty optional cover row left out, D1) and › Photo queued for reading (the online "Lendo…" and "— enviando" wording, F-13); no KB concept summarized those sentences, so none changed.
- 2026-10-07: review fixes batch 3 (`spec-review-fixes-layout-copy-3.md`, decisions D5 to D12) added dated notes to EXPERIENCE.md › App bar (sticky, never fixed, unsticks under 480 px height, F-06; the Sumário heading visually hidden from 768 px, F-16) and › Measurement readings (the display mismatch on two lines, F-22), to MOCK-GUIDE.md › App bar (F-16) and the phone Sync badge word (struck: "OK", now "Sinc.", F-29), and struck the 11.9 pick and clear undo toast in epics.md (F-25, D12); no KB concept summarized those sentences, so none changed.
- 2026-10-07: Story 13.4 (`spec-13-4-keyboard-and-salvo.md`) makes the sheet's "Salvo" a visible header line ("Salvo às HH:MM", offline "Salvo neste aparelho às HH:MM") where EXPERIENCE.md › Autosave still says "visually hidden"; the empty fabrication date becomes a text input taking dd/mm/aaaa, mm/aaaa or aaaa, and empty service dates gain a "Hoje" chip; no KB concept described "Salvo" as hidden, so none changed.
- 2026-10-07: Story 13.8 appended CAP-26 (the emission audit) to SPEC.md; index.md and project/overview.md now say CAP-1 to CAP-26.
