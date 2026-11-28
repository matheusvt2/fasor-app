---
type: Delivery Plan
title: Delivery slice and dated items
description: History. What the first slice (due 2026-10-03) held, what waited and was built after it, and the dated post-MVP items still ahead. Open only to read why something was ordered as it was, or for the dated items.
tags: [scope, slice, roadmap, history]
timestamp: 2026-11-28T00:00:00Z
sources: [_bmad-output/specs/spec-fasor/delivery-slice.md]
---
# Delivery slice

This is history. The slice was approved on 2026-09-21 and was due on 2026-10-03; it was delivered, everything that waited was built after it, and the product is in production (v0.17.0 on 2026-11-28, Epics 1 to 32 delivered). What is in the product today is in [epics-map](/planning/epics-map.md) and `sprint-status.yaml`, not here.

Principle of the slice: keep everything needed to produce the relatório; defer the rest. A build that captures and cannot generate is worth nothing.

In the slice: registries and identity, templates, setup/Sumário/tree/blocks, the whole equipment sheet (insulation at 1 minuto only), one assist (nameplate from photo with confirm contract, offline queue, registry cross-check, wrong-digit protection), photos, points as section 8 bullets, one-device offline sync, DOCX generation with PDF stored, parecer and pre-issue list.

Waited, in order: display reading (FR-36, needs the OCR sidecar), PDF download, multi-device merge and full sync status (CAP-23), vision captions (FR-39), equipment identity from photo (FR-38), NC draft (FR-75) and dictation (FR-40), then move block (FR-20), save as template (FR-14), rich text (FR-12), location stamp switch (FR-8). These were built as Epics 8 to 11.

Cut order, had the slice run late: generation ships regardless; assists retreat FR-75, FR-38, FR-39, FR-36, FR-33 last.

Dated items of the canonical file, read on 2026-11-28:

- 2026-11-30, LibreOffice 26.2 end of life, move to 26.8: not done. `apps/api/Dockerfile` still pins `LIBREOFFICE_VERSION=26.2.6`, and no row for it was found in `deferred-work.md`.
- Before 2027-06-01: a grounding measurement sheet (NR-10 10.15.3), section 5 text switching to 10.13.1 (seven steps), an action plan with priority, deadline and owner (10.7.11). Partly built since: the Malha de aterramento is a seeded library type from seed v13 (Story 23.21), and a point of attention carries a priority and a deadline (Story 28.5). Check the rest against `SPEC.md` § Non-goals before planning it.
- After the first real job: a 50/51 relay sheet, vision proposing NC rows, "Revisar em sequência".
- The canonical file also dates competitor re-checks; read them there (competitor material is cited by path only).

Canonical: `_bmad-output/specs/spec-fasor/delivery-slice.md`.
