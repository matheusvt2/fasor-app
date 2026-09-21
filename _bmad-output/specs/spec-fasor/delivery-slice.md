# Delivery slice

Approved 2026-09-21, due **2026-10-03**. Principle: the slice keeps everything necessary to produce the FO.SERV-03 relatório; anything the report does not need waits. The product is defined by SPEC.md; this file is the order it arrives in. Source: `prd.md` §7.3 plus the decisions of 2026-09-21.

## The test the slice must pass

A relatório is composed from the seeded Template, filled with the Porto Seguro job's data, and generated as a DOCX that Bruno recognizes as his own FO.SERV-03 (SM-4). A build that captures and cannot generate is worth nothing on 2026-10-03.

## Ships by 2026-10-03

| Capability | Scope in the slice |
| --- | --- |
| CAP-1 to CAP-7 registries and identity | Full, minus the photo location switch (FR-8) |
| CAP-8 Templates | FR-9, FR-10, FR-11, FR-13; section boilerplate seeded as fixed text, no rich text editor (FR-12); the Template composer stays (S3 rejected 2026-09-19) |
| CAP-9 to CAP-11 setup, Sumário, tree, blocks | FR-15 to FR-19, FR-21; no move between locations (FR-20) |
| CAP-12 to CAP-18 the whole equipment sheet | FR-22 to FR-32, not cut anywhere; insulation at 1 minuto only |
| CAP-19 assists | One assist: nameplate from a photo (FR-33) with the confirm contract (FR-41), the offline queue (FR-42), the registry cross-check (FR-35) and wrong-digit protection (FR-37) treated as part of it; dictation control hidden |
| CAP-20 photos | FR-43 to FR-48 with context captions, import with "De qual equipamento?", stamps, numbering; no vision captions |
| CAP-21 points of attention | FR-49, FR-51, FR-53 as section 8 bullets with photo references; no priority, deadline, owner or table (FR-50, FR-52 post-MVP) |
| CAP-22 offline and sync | One device, durable, draft recovery: FR-54, FR-55, FR-56, FR-57, FR-61; sync status counts as the badge, not the full surface |
| CAP-24 generation | DOCX with table of contents, native tables, both ordering schemes in the kernel, revision history: FR-62 to FR-70, FR-74. LibreOffice runs and the PDF is stored from day one; only the PDF download waits |
| CAP-25 parecer and pre-issue list | FR-71 to FR-73, full |

## Waits, in this order

1. Instrument display reading, FR-36: typing stays the primary path; with signal it fills instantly, without signal it only checks the typed value. Needs the Python OCR sidecar for seven-segment displays.
2. PDF download alongside DOCX (the renderer already runs).
3. Multi-device merge, conflicts and the full sync status surface: FR-58, FR-59, FR-60 (CAP-23). One device per relatório was accepted by Matheus on 2026-09-21; a second person's photos enter by import.
4. Photo auto-caption by vision, FR-39; context captions already work locally.
5. Equipment identity from a photo, FR-38; the type list in the field palette still creates the block.
6. NC observation draft, FR-75, and dictation beyond captions, FR-40; a speech engine for caption dictation.
7. Nothing: FR-35 and FR-37 ship with FR-33 (see above).
8. Move a block between locations (FR-20); save a relatório as a Template (FR-14); the rich text editor (FR-12); the photo location switch (FR-8); "Revisar em sequência" review walk.

**Cut order if the slice itself slips:** generation ships regardless; assists retreat FR-75, then FR-38, then FR-39, then FR-36, with FR-33 last; the Template composer is the first place to look after that.

## What the deadline costs

- SM-1, SM-3 and SM-5 to SM-8 cannot be validated on 2026-10-03: no real job is scheduled. The date tests SM-4 on re-entered Porto Seguro data and nothing else.
- SM-3 misses its target in the slice: with only the nameplate assist a sheet still costs the typed readings (about 36 keystrokes offline). The budget of at most 20 taps and 15 keystrokes is a claim about connectivity and needs FR-36.
- The offline proof is a scheduled check, confirmed 2026-09-21: first on desktop Chrome or Firefox, then on iPadOS Safari; if Safari fails, the slice ships for Android Chrome and desktop only and the zero-loss guarantee stays unchanged.
- Seed data is the hidden cost: the eight block types in `addendum.md` §9 are a day of careful transcription that nothing else can start without.

## Dated post-MVP items

| Date | Item |
| --- | --- |
| 2026-10-01 | Re-check GroundPRO "Checklists Online" |
| 2026-11-01 | Re-check Mesh Labs terms and its Bluetooth integration |
| 2026-11-30 | LibreOffice 26.2 end of life; move to 26.8 |
| 2026-12-01 | Re-check Mesh, Minipa and GroundPRO prices and features; re-verify NR-10 |
| 2027-03-01 | Re-check Mesh Labs traction |
| before 2027-06-01 | Dedicated grounding measurement sheet (NR-10 10.15.3); section 5 text switches to 10.13.1 (seven steps); structured action plan with priority, deadline, owner and table for 10.7.11 (FR-50, FR-52); re-verify NR-10 |
| after the first real job | 50/51 relay sheet; vision proposing NC rows; multi-device merge; "Revisar em sequência"; NC chip content review |
