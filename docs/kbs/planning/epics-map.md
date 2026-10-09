---
type: Planning Map
title: Epics and stories map
description: Every epic and story title with a one-line scope, to find the right story without reading epics.md (308 KB).
tags: [planning, epics, stories]
timestamp: 2026-10-08T00:00:00Z
sources: [_bmad-output/planning-artifacts/epics.md, _bmad-output/implementation-artifacts/sprint-status.yaml]
---
# Epics and stories map

Open one story: `grep -n '### Story 5.3' _bmad-output/planning-artifacts/epics.md`, then Read 40 lines from that line. Status of each: `sprint-status.yaml` only (not copied here; epic 11 was in progress at 2026-09-30). Built record: `_bmad-output/implementation-artifacts/spec-<n>-<m>-*.md`.

1. **Sign in and work offline**: 1.1 one-command stack, 1.2 shared components from mock CSS, 1.3 sign-in and offline session, 1.4 ops applied locally first, 1.5 automatic sync, 1.6 Home and Account, 1.7 tablet over HTTPS, 1.8 no capture lost.
2. **Registries and identity**: 2.1 instruments with calibration, 2.2 certificate files, 2.3 company identity with brand preview, 2.4 clients and sites, 2.5 manufacturers and voltage classes, 2.6 acceptance criteria.
3. **Seed and Templates**: 3.1 eight block types seed, 3.2 boilerplate and standard template, 3.3 list/duplicate/archive templates, 3.4 composer, 3.5 sub-block defaults, 3.6 boilerplate editor, 3.7 Porto Seguro fixture.
4. **Projects, setup, Sumário, tree**: 4.1 project and relatório, 4.2 setup page, 4.3 Sumário, 4.4 location tree, 4.5 add/remove/restore/duplicate/reorder blocks, 4.6 status transitions, 4.7 section text, 4.8 DOCX skeleton.
5. **Equipment sheet offline**: 5.1 sheet shell and four steps, 5.2 cabine and environment, 5.3 nameplate, 5.4 checklist, 5.5 readings vs criterion, 5.6 continuous readings, 5.7 instrument by code, 5.8 conclusion, 5.9 not tested.
6. **Photos and points**: 6.1 burst capture, 6.2 no photo lost, 6.3 gallery, 6.4 import later, 6.5 captions, 6.6 points of attention.
7. **Generate the relatório**: 7.1 sheets as native tables, 7.2 photo record, 7.3 points and certificates, 7.4 parecer and section 10, 7.5 pre-issue, preview, issue.
8. **Nameplate from a photo**: 8.1 Suggestion entity, 8.2 plate capture, 8.3 local OCR service, 8.4 reading job, 8.5 digit coverage and registry check, 8.6 one-tap confirm.
9. **More assists**: 9.1 "Ler visor", 9.2 block from photo, 9.3 vision captions, 9.4 dictation, 9.5 NC drafts.
10. **Two devices**: 10.1 merge by rule, 10.2 true contradictions, 10.3 removed-vs-edited and duplicate TAG, 10.4 full sync status.
11. **Completions and AWS**: 11.1 PDF download, 11.2 move block, 11.3 save as template, 11.4 rich text, 11.5 location stamp switch, 11.6 Bedrock structuring (unblocked 2026-10-05, Haiku 4.5 as reference), 11.7 Textract, 11.8 AWS deploy and AI flag, 11.9 priority suggests deadline, 11.10 action-plan table, 11.11 sheet photo strip and direct file picker (field feedback 2026-10-05).
12. **Field journey and visual refresh**: 12.1 no lost taps, 12.2 forward never back, 12.3 sheet repeats nothing, 12.4 plate and NC in fewer taps, 12.5 v0.9 visual direction, 12.6 tap budget as a test. Ran before Epic 6 (`sprint-change-proposal-2026-09-24.md`).
13. **Photo capture hardening and the emission audit** (field UX analysis 2026-10-06, `ux-fasor-2026-09-18/review-field-ux-2026-10-06.md`): 13.1 capture resolution and ImageCapture, 13.2 torch/zoom/tap-to-focus, 13.3 pinch-zoom viewer, 13.4 keyboard attributes, month-year dates and visible "Salvo", 13.5 reading elapsed/cancel/retry and no orphaned panel photo, 13.6 quota-refused shot durability, 13.7 plate tile on every block type (DoR: E8-A3), 13.8 AI emission audit before Emitir (DoR: 2026-10-06 batch 2 merged), 13.9 dictation on behind consent (DoR: wording decided). Excludes the 2026-10-06 MVP review findings F-01 to F-29 (owned by the review batches). Delivered in PRs #103 to #107 (2026-10-07; 13.9 deferred), with dated narrowing lines under each story in epics.md (2026-10-08); the integrated QA report is `implementation-artifacts/reviews/epic-13-review-qa.md`. Fixes in PRs #109 and #110 (2026-10-08); 13.1 to 13.8 done, 13.9 deferred, so the epic stays in progress; retrospective `implementation-artifacts/epic-13-retro-2026-10-08.md` (machine verdict rejected on 13.9, action items E13-A1 to E13-A10).
14. **Locals, the site checklist and office-created equipment types** (Bruno, 2026-10-08, `sprint-change-proposal-2026-10-08.md`): 14.1 mocks, 14.2 a local holds equipment with no coluna, 14.3 Verificações do local capture (seed v4), 14.4 its printed table, ~~14.5 company equipment types in the kernel (behind the AD-21 amendment), 14.6 type editor, 14.7 office types in use with the no-break de comando end to end~~ re-sliced 2026-10-09: 14.5 measurement table and library types Fonte auxiliar da proteção and Chave de transferência automática (seed v5), then after 2-3 real jobs 14.6 company types in the kernel (behind the AD-21 amendment), 14.7 type editor, 14.8 duplicate-and-adjust in use. All backlog.
