---
type: Delivery Plan
title: Delivery slice and dated items
description: What shipped by 2026-10-03, what was deferred and in which order, cut order, dated post-MVP items.
tags: [scope, slice, roadmap]
timestamp: 2026-09-30T00:00:00Z
sources: [_bmad-output/specs/spec-fasor/delivery-slice.md]
---
# Delivery slice

Approved 2026-09-21, due 2026-10-03. Principle: keep everything needed to produce the relatório; defer the rest. A build that captures and cannot generate is worth nothing.

In the slice: registries and identity, templates, setup/Sumário/tree/blocks, the whole equipment sheet (insulation at 1 minuto only), one assist (nameplate from photo with confirm contract, offline queue, registry cross-check, wrong-digit protection), photos, points as section 8 bullets, one-device offline sync, DOCX generation with PDF stored, parecer and pre-issue list.

Waited, in order: display reading (FR-36, needs the OCR sidecar), PDF download, multi-device merge and full sync status (CAP-23), vision captions (FR-39), equipment identity from photo (FR-38), NC draft (FR-75) and dictation (FR-40), then move block (FR-20), save as template (FR-14), rich text (FR-12), location stamp switch (FR-8). These were later built as Epics 8 to 11; check status in `sprint-status.yaml`, not here.

Cut order if late: generation ships regardless; assists retreat FR-75, FR-38, FR-39, FR-36, FR-33 last.

Dated items: 2026-11-30 LibreOffice 26.2 end of life (move to 26.8); before 2027-06-01 grounding sheet (NR-10 10.15.3), section 5 text switches to 10.13.1 (seven steps), action plan with priority, deadline, owner (10.7.11); after first real job: 50/51 relay sheet, vision NC rows, "Revisar em sequência".

Related: [epics-map](/planning/epics-map.md).
