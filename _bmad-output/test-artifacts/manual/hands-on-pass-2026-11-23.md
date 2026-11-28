# Hands-on pass, 2026-11-23: Epics 28 and 29 as a user, local stack

The hands-on pass of the Definition of Done of Epic 28 (`implementation-artifacts/epic-28/epic-28-context.md`, "Gates"): drive the new behavior through the browser as a person would, before the deploy.

## How it was run

- Main at `82529122` (after the wave review fixes of #374), local compose stack, local dev company (`dev@local.dev`).
- Viewports: 1280 px and tablet widths.
- Evidence: screenshots under `test-results/pass-e28/` of the main checkout (untracked); cited by path only.

## Result

No blocker. Three should-fix findings (S1 to S3) and six notes (N1 to N6). All three should-fix findings and note N2 were fixed in PR #377 (`e28w`), each with a test that failed first. The remaining notes went to `deferred-work.md` or stayed as readings for Matheus.

## Should-fix findings

| Id | Finding | Outcome |
|---|---|---|
| S1 | The Gerar dialog drew the blocking row "Nome da concessionária em branco" with the parecer's words, link and reason. | Fixed in #377: the row draws the kernel's text alone with "Abrir ficha", and `issueBlockedReason` names it. |
| S2 | The device's back from a ficha to the Sumário of an "Em revisão" relatório lost the expanded sections and the scroll. | Fixed in #377 (the Sumário view is kept; the return arrival of "Voltar" lasts until the Sumário reads it). |
| S3 | "pt100" printed in lower case in the point text and in sections 9 and 10. | Fixed in #377: the rule flag `label_acronyms_inline` keeps "PT100" in a label lowered into a sentence on v18; `V18_HASH` was re-pinned. |

## Notes

| Id | Note | Outcome |
|---|---|---|
| N1 | The Gerar dialog has no "Cancelar" button. | Open: `deferred-work.md`. |
| N2 | The in-app "Voltar" pushed a history entry. | Fixed in #377. |
| N3 to N6 | Four notes: TAG suggestions were still offered after their locals were removed (open: `deferred-work.md`); three further minor notes, not recorded in detail. | Only the TAG one is tracked. |

## Not checked in the pass

- A sheet with no TAG.
- A read-only role on "Itens adicionais".
- A v17 relatório.
- Revisions issued on different days.
- The hashed icon sprite (#369) in a real browser.
- Change password offline.
- A real Android or iPad device.

These are one row in `deferred-work.md`, chiefly the real Android or iPad device.

## What came after

- The paid plate evaluation of 2026-11-24 and its two structuring fixes (#375, #376): `implementation-artifacts/epic-28/epic-28-context.md`, "Delivery record, 2026-11-24".
- Deployed 2026-11-24 as `de79700b` (tag `v0.14.0`, smoke 8 of 8).
