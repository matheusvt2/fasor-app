# Sprint change proposal: field journey and visual refresh (2026-09-24)

Prepared by Amelia after the journey review with Sally, at Matheus's request. Mode: batch (Matheus approved the plan "review plus ready stories" on 2026-09-24 and is not in the session). Source of every number and finding: `_bmad-output/planning-artifacts/ux-designs/ux-fasor-2026-09-18/review-journey-2026-09-24.md`.

## 1. Issue summary

Epics 1 to 5 are merged and the field journey exists end to end, but nobody had measured it as an engineer uses it. Measured on 2026-09-24 in the real app (tablet 768 px, standard template, one instrument):

- Four taps in one session did nothing (bulk actions, "Repetir", the instrument picker), always right after a field commit or a section collapse. In the field this is silent rework (J-01).
- The forward path has three dead ends and the Home "Continuar" has been disabled since Epic 1 (J-05, J-06).
- The second sheet of a type costs 9 taps against the spine's 5; four of them pick the same instrument twice. The cabine block, the NC observation and the per-unit plate fields are repeated or copied wrongly (J-02, J-07, J-08, J-10).
- The skin breaks two rules of DESIGN.md (caps labels, three progress indicators) and reads as a desktop form; Matheus asked for a more current look.

## 2. Impact analysis

**Epics.** Epic 5 (sheet) and Epic 4 (Sumário, setup, Home card) receive corrections; Epic 6 (photos) should wait for the sticky bar and sheet header restyle; Epic 8 keeps its contract (the nameplate tile sits above visible fields instead of replacing them).

**Stories.** No merged story is reopened; each finding becomes a story of a new Epic 12. Story 5.9's narrowing on the preselected reason and Story 5.3's "Digitar" link are superseded by rows in `source-deltas.md`.

**Artifacts.** `EXPERIENCE.md` (five dated strike-throughs: nameplate, environment, stepper collapse, instrument picker, copy), `DESIGN.md` (§ v0.9 direction, three dated strikes), `source-deltas.md` (eight rows), `MOCK-GUIDE.md` and the mock gallery (two v0.9 mocks and two override CSS files), `epics.md` (Epic 12), `sprint-status.yaml`. `tokens.css` and `components.css` are untouched until Story 12.5, so the byte-identical rule and `app-css.test.ts` keep holding on `main`.

**Technical.** Kernel gains `suggestedInstrument`, `cabineProgress`, `screenLabel`, `sheetSummaryText` and the seed flag `per_unit`; web changes are in the shared press path, three navigation handlers, the nameplate and conclusion sections, and one CSS promotion. No API or schema change; no cloud dependency.

## 3. Recommended approach

Direct adjustment: add Epic 12 with six ordered stories and run it before Epic 6. Story 12.1 ships alone and first because every other measurement depends on taps landing. Effort: about six developer days on opus at high effort for 12.1, 12.3 and 12.5; medium for the rest. Risk: the lost-tap root cause is in React Aria press handling against blur commits; if the fix cannot be made in the shared path, the story falls back to deferring the blur commit until pointer up, which the race test in 12.1 covers either way. Timeline: Epic 6 starts about a week later; the 2026-10-03 slice still closes on Epic 7 because 12.2 to 12.4 shrink the field time the slice is judged on.

Alternatives considered: folding the fixes into Epic 6 stories (rejected, it hides the measurements), and shipping the visual refresh first (rejected, taps before paint).

## 4. Proposed edits (applied in this change)

| Artifact | Edit |
|---|---|
| `epics.md` | New "Epic 12: Field journey and visual refresh" in the Epic List and as a full section with Stories 12.1 to 12.6, each with a Dev model line, Given/When/Then criteria citing FR/AR/UX-DR and the review's finding ids, and DoD additions |
| `sprint-status.yaml` | `epic-12: backlog` and its six stories; 12.4 noted as not ready until the Não ensaiado preselection is decided |
| `EXPERIENCE.md` | Dated strikes on § Smart Input › Nameplate ("Digitar"), § Environment (first sheet only), § Section stepper (collapse timing), § Instrument picker (remembers last used), "Igual à" (per-unit fields) |
| `DESIGN.md` | § v0.9 direction (2026-09-24, proposed) with the token and rule table and contrast checks; dated strikes in § Colors › Surfaces and ink, § Typography (ramp), § Shapes (buttons) |
| `source-deltas.md` | Eight rows dated 2026-09-24 (D-2 to D-10) |
| `mockups/` | `tokens-v09.css`, `components-v09.css`, `key-equipment-sheet-v09.html`, `key-relatorio-overview-v09.html`, `MOCK-GUIDE.md` § v0.9, `index.html` cards |
| `reviews/journey-review-2026-09-24/` | Screenshots `J*`, `A*`, `M*` |

## 5. Decisions needed from Matheus before the stories start

1. Não ensaiado reason preselection (blocks Story 12.4): none, or the last used in the relatório.
2. Whether the printed sheet OBSERVAÇÕES repeats the NC items (with Bruno, before Epic 7.1).
3. The nameplate TAG field: prefilled and editable (proposed) or hidden and printed from the block.
4. Status on generate: confirm AD-22 (Em revisão) or accept the observed jump to Emitido.
5. Confirm Epic 12 before Epic 6 in the sprint order.

## 6. Handoff

Stories 12.1, 12.2, 12.3, 12.5 and 12.6 meet the Definition of Ready once item 5 is confirmed; 12.4 waits for item 1. `bmad-build` picks the model from each story's Dev model line. The review's § 6 scripts are the acceptance baseline for the re-measurements each story records.

## Answers from Matheus (2026-09-24, later the same day)

- Não ensaiado: three standard reasons plus a fourth free text. Recorded in Story 12.4 and `source-deltas.md` (third reason "Equipamento inacessível", nothing preselected).
- Epic 12 runs before Epic 6: confirmed.
- The nameplate TAG field, the printed observation and the status on generate: later, not blocking Epic 12. Story 12.3 keeps the proposed prefilled, editable TAG.
