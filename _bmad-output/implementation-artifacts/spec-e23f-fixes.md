---
title: 'e23f: three print defects, two load-hardened tests and the R8LAY run-end focus'
type: 'bugfix'
created: '2026-11-08'
status: 'in-progress'
baseline_revision: 'fb09ee55'
review_loop_iteration: 1
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-e22g-wave-b-fixes.md'
warnings: ['batched']
batched_reason: 'Six small ledger rows Matheus approved on 2026-11-08 as one fix batch: three print defects in section 8 and the conclusion text, two test-hardening carry-overs and the R8LAY decision; one gate, one PR.'
deferred: ['stored confirmed texts keep the doubled period (decision, Matheus)', 'glued references the editor never writes (bullet lead-in, after a token, the removed word)', 'an NC observation with line breaks splits the section 9 conclusion paragraph (pre-existing)']
---

# e23f: print defects, test hardening and the R8LAY run-end focus

## Intent

Close exactly six rows of `deferred-work.md` on main `fb09ee55`, approved by Matheus on 2026-11-08, nothing else:
the three print defects of the production check after `ae3d37e0` (2026-11-07), the two test-hardening rows of e22h,
and the R8LAY decision row of e22g. Layout protection (Bruno likes the document and its photo grouping,
`relatorio-layout-protected`): the printed document changes only by these three deltas. No seed, contract, op or
schema change. Dev model opus, effort high; the orchestrator implements it itself (token economy, as e22g).

## Decisions of record

1. **Matheus, 2026-11-08 (R8LAY, the e22g row).** At the end of an Enter run the focus goes to the Sticky action bar's
   primary with `preventScroll`: the page does not scroll. The focus stays visible: the bar is sticky on the ficha
   (`ficha.css:85`), so the primary is on screen; where it is not (the bar is static below 480 px of viewport height,
   `ficha.css:86`), the primary is brought into view with `scrollIntoView({ block: 'nearest' })`, never left off
   screen. *Reading (2026-11-08, implementation): "an Enter run" covers every run that ends on the primary: the
   readings' run and the measurement tests' run (`ensaios-section.tsx`) and the plate and cabine fields' run
   (`focusNextMissingField`, `ficha-fields.tsx`) when no missing field is left. One helper, `focusRunEnd`, serves the
   three.*
2. **Print defect (a), line breaks.** The kernel's section 8 strings already carry the observation's line breaks
   (`points/derived.ts:158`, `trim()` only); the DOCX renderer wrote each bullet and each action-plan cell as one
   `TextRun`, whose `\n` LibreOffice prints as a space. The renderer now prints each `\n` as a line break (`<w:br/>`)
   inside the bullet's paragraph (one bullet, its lines under it) and inside the cell, as section 9 already prints a
   cell line by line (`sections/section-9.ts` `cellParagraphs`). A string with no `\n` renders exactly as before (one
   run, same XML). *Reading (2026-11-08): the fix is in the renderer, so it covers every section 8 bullet and cell
   that carries a typed line break, not only the derived "Equipamento reprovado" entry: the same observation reaches
   section 8 as a stored point when the user keeps the entry with "Editar" (origin `reprovado`), and a manual point
   typed on two lines in its multi-line editor (`point-text-editor.ts`, `<br>`) printed as one run for the same
   reason. Nothing without a line break moves.*
3. **Print defect (b), the doubled period.** The conclusion's NC clause (`relatorio/conclusion.ts:458`) drops the
   observation's final period(s) before " (item N, NC)"; "etc." keeps its period (the section 8 rule, `SENTENCE_END`).
   The basis hash is unchanged (it hashes `ncs`, not the text), so a stored confirmed text stays confirmed and prints as
   the engineer confirmed it; only texts composed from now on read without the doubled period.
4. **Print defect (c), the glued reference.** The action-plan cell's token resolution (`resolvePhotoTokens`,
   `print/section-8.ts:77`) puts one space before "Imagem N" when the text before the token ends in a letter, a digit,
   a closing bracket or a sentence mark (`.`, `!`, `?`, `,`, `;`, `:`), as the point editor spaces an inserted chip
   (F-09, `spacingAt`). The bullet (`resolveBulletPhotoTokens`, ", conforme Imagem N.") is unchanged; so is a removed
   photo's word.
5. **Goldens.** Defect (a) cannot move the structure golden (`docx-structure.test-support.ts` reads `<w:br/>` and a
   literal `\n` alike as "\n"); (b) and (c) move it only if a Porto Seguro point or NC observation carries the pattern.
   Rule: a golden that moves is updated only with the moved line named in the PR and checked to be one of the three
   deltas; nothing is seed-gated (the defects are wrong on every seed, and the protected layout is about the layout, not
   these typos).

## Code map

| File | Change |
|---|---|
| `apps/api/src/jobs/generate/sections/section-8.ts` | `lineRuns`: a string split at `\n`, the lines after the first as `TextRun({ break: 1 })`; bullets and action-plan cells |
| `packages/domain/src/relatorio/conclusion.ts` | NC clause: the observation without its final period (`withoutFinalPeriod`) |
| `packages/domain/src/print/section-8.ts` | `resolvePhotoTokens`: the lead space before a label |
| `apps/web/src/surfaces/ficha/ficha-fields.tsx` | `focusRunEnd(primary)`; `focusNextMissingField` uses it for the primary |
| `apps/web/src/surfaces/ficha/ensaios-section.tsx` | `onRun`, `onMeasurementRun` end through `focusRunEnd` |
| `apps/web/src/surfaces/templates/template-composer-local.test.tsx` | every DOM read after an async write waits on the rendered state |
| `e2e/photo-order.durability.spec.ts` | every tile-order read is `expect.poll(() => tileIds(page))` |
| `e2e/review-layout-interaction-2026-10-08.spec.ts` | R8LAY-E2E-001: the run's end focuses "Próxima ficha" with no page scroll, focus visible |
| tests | `packages/domain/src/print/e23f-print-fixes.test.ts`, `apps/api/src/jobs/generate/docx-line-breaks.test.ts`, `ficha-fields.test.tsx`, `e2e/points-derived.spec.ts` (23f-E2E-001) |
| docs | `deferred-work.md` (six rows struck, new rows), `docs/kbs/log.md`, `epic-23-context.md` if it exists |

## Acceptance criteria (each with its test)

- **(a)** Given a sheet concluded Reprovado with OBSERVAÇÕES "Item 1: a\nItem 3: b\nfrase.", When section 8 is laid
  out, Then its bullet and its action-plan cell keep the three lines (`e23f-print-fixes.test.ts`); When the DOCX
  renders, Then the bullet is one bulleted paragraph with two `<w:br/>` and no `<w:t>` holds a line feed, the cell
  likewise, and a bullet with no line break is one run as before (`docx-line-breaks.test.ts`); end to end, the issued
  revision's DOCX prints the lines with `<w:br/>` (`points-derived.spec.ts` 23f-E2E-001).
- **(b)** Given an NC item whose observation is "acúmulo de poeira.", When the conclusion is composed, Then it reads
  "acúmulo de poeira (item 1, NC)" with one period at the end of the sentence; "...etc." keeps "etc. (item 1, NC)";
  an observation with no period is unchanged; the basis is the same as before the fix for the same sheet (kernel); the
  sheet's Conclusão suggestion on screen reads it (23f-E2E-001).
- **(c)** Given a manual point "Porta danificada.[[foto]]" and "Porta[[foto]]", When the action plan is resolved,
  Then the cells read "Porta danificada. Imagem 1" and "Porta Imagem 1"; "Ver [[foto]]", "([[foto]])" and a token at
  the start are unchanged; the bullet still reads "Porta danificada, conforme Imagem 1." (kernel); the DOCX cell of
  23f-E2E-001 reads it.
- **R8LAY.** Given the TTR at 1280 with the run on its last capture, When Enter ends the run, Then "Próxima ficha" is
  focused and matches `:focus-visible`, `window.scrollY` is unchanged and the button is inside the viewport
  (R8LAY-E2E-001, `--repeat-each 10`); the plate run's last Enter focuses the primary with `{ preventScroll: true }`
  (`ficha-fields.test.tsx`). Mutation: the plain `focus()` back makes the e2e assertion red.
- **Hardening.** `template-composer-local.test.tsx` green under artificial CPU load in repeated runs, and every
  sync DOM read after a write is a `waitFor`; 21.3-E2E-005 and -006 read the order only through `expect.poll`, green
  with `--repeat-each` on the durability projects.

## Spec Change Log

- 2026-11-08, implementation: the composer red is not a timeout (no red under 10 busy loops, three runs) but one-shot DOM
  reads after the announcer, which speaks when the commit resolves while the live query redraws on its own schedule; an
  experiment delaying the live query 150 ms turned 3 of 17 red on the old file and 0 on the hardened one (three runs).
  The measurement tests' run and the readings' run end through one `endRun` in `ensaios-section.tsx`.
- 2026-11-08, review loop (Edge Case Hunter 1, 2, 3, 5, 6; Verification Gap 2, 3, 4, 5, 7, 8, 9): `focusRunEnd` never
  reveals a primary inside a sticky bar (a fractional box edge on a tablet's pixel ratio no longer reads as off screen)
  and calls `scrollIntoView?.`; `GLUED_BEFORE_REF` adds closing quotes, "%" and "°"; `withoutFinalPeriod` strips
  trailing periods and spaces, then gives "etc" back its one period ("etc..." -> "etc."); `lineRuns` splits CRLF and
  CR too; tests pin a pre-fix confirmed text staying confirmed and printing as stored, the cell's 9 pt on every line,
  a manual point typed on several lines through the kernel, a whitespace-only observation, the fallback both ways;
  the last one-shot composer read waits; 23f-E2E-001 is `@p0`. Known open, not patched: Edge Case Hunter 4 (the removed
  word glued; ledger row), 7 (an NC observation with line breaks splits the section 9 conclusion paragraph,
  pre-existing; noted in the PR), 8 (the conflict dialog shows the recomposed text; only texts stored before the fix);
  a token glued to the word after it (ledger row).

## Auto Run Result
