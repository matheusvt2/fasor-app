---
title: 'UX pass fixes: ratio verdict, section numbering, instrument field, phone wrap, double period'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'dispatch'
baseline_commit: '659e2338a53ddaa2b4e77e606291f2a233ebf3c2'
review_loop_iteration: 0
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/test-artifacts/manual/ux-pass-2026-10-22.md'
  - '{project-root}/docs/kbs/architecture/layers.md'
warnings: ['batched', 'multiple-goals']
batched_reason: 'Matheus chose one batch for the six P1 findings of the 2026-10-22 hands-on pass (precedent: review-fixes 2026-09-30).'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 2026-10-22 hands-on pass found defects that reach the client document or block a field: a ratio test out of limit prints "—" in Condição and offers no shortcut (F42); section numbers disagree across wizard, export dialog, palette, Sumário and the fixed Conclusão text (F43/F17); the instrument "Padrão de ensaio" value input is 24 px wide (F6); the ficha's "Do local" line breaks words mid-word at 390 px (F51); "{cliente}." prints ".." (F40).

**Approach:** Kernel computes the missing verdict, the TAP label and every section number from the Sumário position; the web renders them; two authored CSS rules fix the layouts; variable substitution collapses "..". One branch, one PR, story gate per AGENTS.md.

## Boundaries & Constraints

**Always:**
- Test first (unit in kernel/web, Playwright for what a human sees); each fix has a test red before the fix.
- Verdicts, labels and section numbers live in `packages/domain`; `apps/web` only renders them. Static copy in `apps/web/src/copy/pt-br.ts` (new sentences marked `// authored:`).
- `tokens.css` and `components.css` stay byte-identical; CSS fixes go in `app.css` or the surface CSS with a comment naming the mock rule mirrored or `authored`.
- Printed headers keep the FO.SERV-03 wording; only screen headers gain units.
- Run tools only in the `tools` container (`podman compose --profile tools run --rm tools pnpm ...` on this machine).

**Never:**
- Edit seed versions v1–v7 in place; change `CONTRACT_VERSION`, any op path or the goldens unless a decision below asks for a new seed version.
- Change the composer's canonical `section_N` numbering (`templates/text.ts`) or the `SUMARIO_TITLES` keys.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ratio row out of limit | transformador row, V 13,8 kV / 380 V, measured 36,3 vs calc 36,32 within; 99,9 % deviation out | `condicao` = `'INSATISFATÓRIO'` as soon as any capture is `out` (an empty sibling does not hold it back); `'SATISFATÓRIO'` when all within; `null` while no capture is out and one is unjudged | N/A |
| Ratio row partially typed | one of three ratio cells empty | `condicao` null, Condição "—" on screen and print | N/A |
| TAP nº | plate `tap_atual` = "5", seed connection row typed-empty | screen label and printed TAP Nº = "5"; empty plate, or a value that is not a tap number (an integer of up to 3 digits; "13200" is a voltage) → "—" | N/A |
| Section captions | template with sections 1, 5, 8, 10 (+7, 9) | wizard notes, export dialog note, points copy and kernel texts say the Sumário position (Pontos = 4, Ensaios = 5, Conclusão = 6); a caption of an absent section names it by title without a number ('Seção "Certificados"'), and a sentence that would promise printing into an absent section says instead that it does not print (the `absent-sections.ts` wording) | N/A |
| Fixed Conclusão text | v8 seed text with one variable for the results reference, template with sections 1,5,8,10 | "nos itens 4 e 5"; only section 9 present → "no item 5"; neither → "no corpo" ("encontram-se no corpo deste relatório"); v7 relatórios unchanged | N/A |
| Variable ending in "." | "{cliente}." with "Vale Verde S.A." | "Vale Verde S.A." once, no ".." (also across rich-text runs and cover rows) | N/A |
| Palette title | section 5 | palette and Sumário both read "Recomendações gerais (NR-10)" | N/A |

## Decisions (Matheus, 2026-10-22)

- F41: KEEP_FORM. The seed follows FO.SERV-03 (cabos de saída in GΩ, cabos de entrada in MΩ); no seed change. F41 is reclassified in the report as form-faithful; the unit hint (F28) goes to `deferred-work.md` for Bruno.
- F43 fixed text: SEED_V8_VARIABLES. Seed v8 = v7 plus a Conclusão text that says "itens {secao_pontos} e {secao_ensaios}"; the two variables resolve to the section's Sumário position (fallback: the canonical FO.SERV-03 number when the section is absent). v1–v7 relatórios keep their text. Contract minimum bumps as the v7 precedent did; logged in `source-deltas.md`.
- Spec kept whole (~2000 tokens) at Matheus's choice.
- Review checkpoint (Matheus, 2026-10-22): TAP Nº reads TAP ATUAL only when it is a tap number (integer of up to 3 digits), else "—"; the Porto Seguro golden may change where the seeded criterion now prints INSATISFATÓRIO (5 TP/TC rows), recorded in `source-deltas.md` with a note for Bruno; an absent section is never referenced by a number (Conclusão omits the reference, screen sentences use the "não sai no documento" wording); one capture out fails the ratio row even while a sibling is empty.

</frozen-after-approval>

## Code Map

- `packages/domain/src/relatorio/reading-evaluation.ts:248` -- `condicao` computed; widen to INSATISFATÓRIO. `:249` connection label; resolve typed-empty connection from `block.sheet.nameplate.tap_atual` (helper beside `nameplateRatioInput`, `reading-cells.ts:237`). `:164` `headerText` gets the column unit for screen.
- `packages/domain/src/relatorio/reading-cells.ts:88-89,145-154` -- `condicao` type and `HEADER_TEXT`.
- `packages/domain/src/print/section-9.ts:537,611` -- prints `condicao` and connection; use evaluated row connection; header stays FO.SERV-03.
- `apps/web/src/surfaces/ficha/ensaios-section.tsx:361,412-415` -- renders Condição and connection cells; find why ratio cells lack the `measurement-field.tsx:278-283` shortcut (same gate `verdict === 'out' && helperText`), reproduce, fix.
- `packages/domain/src/relatorio/sumario.ts:363` -- `sumarioLineOf(rows, key)`: the position helper to reuse everywhere a number is spoken. `print/layout.ts:178-222` -- `printedSections` (canonical + position).
- `apps/web/src/copy/pt-br.ts:1362,1378,1391,1422,542,991,998,1048,1051,1113,1117,477` -- hardcoded "Seção/seção N" and the palette title; make them templates taking the position; `etapa2-escopo.tsx:116`, `etapa3-responsavel.tsx:52`, `etapa4-instrumentos.tsx:68`, `etapa6-parecer.tsx:106`, `export-dialog.tsx:239,539`.
- Kernel strings with "seção 8": `relatorio/parecer.ts:248`, `print/absent-sections.ts:49` (+`pointSavedText`, `pointMovedText`), `points/checks.ts:108` -- take the position from the snapshot. `templates/text.ts:136,264,287` stays canonical.
- `packages/domain/src/templates/section-text.ts:150-167` `resolveSectionText`, `rich-text.ts:240` `richRunsResolved`/`mergeRuns`, `print/layout.ts:160-171,216` -- collapse ".." after substitution at paragraph level and for cover rows.
- `apps/web/src/surfaces/registries/instrument-panel.tsx:548-606` `TestDefaultField`; `registries.css:136-140` -- authored rule sizing `input.mf-unit` (`flex: 0 0 auto; width ~1.5×--touch-min`) and `input.mf-value {width:100%}`, mirroring `components.css:484/486` (span unit in the mock, `80-cadastros.html:337`).
- `apps/web/src/surfaces/ficha/cabine-block.tsx:110-120` `.cabine-line`; `app.css:276-279` (phone block from :117) -- add `.cabine-line .cl-values { flex-basis: 100% }` beside the P-6 `overflow-wrap` rule; check `.ficha-local-line` (:214).
- Tests to extend: `relatorio/readings.test.ts:92,219,262`, `print/section-9.test.ts:539`, `templates/section-text.test.ts:80-108` ("Cliente S.A." fixture :104), `rich-text.test.ts:81`, `sumario.test.ts:238`, `audit/audit.test.ts:134`, `export-dialog.test.tsx:1012`, `sumario-surface.test.tsx:300`, `template-composer-palette.test.tsx:324`, `instrument-panel.test.tsx:132`, `suggestion-field.test.tsx:80`; e2e `ficha.spec.ts:578-625` (ratio), `:1207` (390 px bounding boxes pattern), `cadastros.spec.ts:149,866`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/relatorio/reading-cells.ts`, `reading-evaluation.ts` -- INSATISFATÓRIO verdict, TAP label from `tap_atual`, screen header with unit -- F42
- [x] `packages/domain/src/print/section-9.ts` -- print the evaluated connection and verdict -- F42
- [x] `apps/web/src/surfaces/ficha/ensaios-section.tsx` (+ the component the ratio cells use) -- shortcut on out-of-limit ratio cells -- F42
- [x] `packages/domain/src/relatorio/sumario.ts` (or a sibling) -- one exported helper answering "position of section_N, or null" for copy and print; use it in `parecer.ts`, `absent-sections.ts`, `points/checks.ts` -- F43
- [x] `apps/web/src/copy/pt-br.ts` + the four etapa surfaces, `export-dialog.tsx`, points copy -- numbers from the helper; palette title aligned with `SUMARIO_TITLES` -- F43/F17/F16
- [x] `packages/domain/src/seed/v8.ts` (derived from v7, Conclusão text with the two variables), `seed/definitions.ts` (`SECTION_VARIABLES`, `SEED_VERSION`), `relatorio/section-variables.ts`, `contract/version.ts`, `seed.test.ts:541`, `section-text.test.ts:111-117`, `source-deltas.md` -- seed v8 per decision -- F43
- [x] `packages/domain/src/templates/section-text.ts`, `rich-text.ts`, `print/layout.ts` -- collapse ".." -- F40
- [x] `apps/web/src/surfaces/registries/registries.css` -- size the unit input -- F6
- [x] `apps/web/src/styles/app.css` -- `.cl-values` wraps under the name at phone width -- F51
- [x] tests listed in the Code Map; new e2e assertions in `ficha.spec.ts` (ratio INSATISFATÓRIO + shortcut; `.cl-values` box width at 390) and `cadastros.spec.ts` (value input ≥ 120 px wide at 1280)
- [x] `_bmad-output/test-artifacts/manual/ux-pass-2026-10-22.md` -- reclassify F41 as form-faithful; `deferred-work.md` entry for the unit hint (F28)

**Acceptance Criteria:**
- Given a transformador ratio row with one measured ratio outside ±0,5 %, when the ficha renders and the document is generated, then Condição reads INSATISFATÓRIO on screen and in section 9, and the out cell offers "Marcar Com restrições".
- Given a plate with TAP atual "5", when the ratio table renders and prints, then its row label and TAP Nº read "5".
- Given a template with sections 1, 5, 8 and 10, when the wizard, the export dialog, the points screen and the Sumário render, then every spoken section number equals that section's Sumário position and no "Seção 9/10/11" literal remains; the palette names section 5 as the Sumário does.
- Given a section text ending in "{cliente}." and a client "X S.A.", when the document is generated, then the sentence ends in "X S.A." with one period.
- Given Cadastros › Instrumentos at 1280 px, when the panel opens, then the "Padrão de ensaio — Isolação — Valor" input is at least 120 px wide and the unit input at most 96 px.
- Given a ficha at 390 px, when the collapsed "Do local" line renders, then `.cl-values` spans the line width and no word breaks inside.

## Implementation Notes

- F42: `condicao` is `INSATISFATÓRIO` when any capture is out (also with another capture still empty), `SATISFATÓRIO` when all are within, else null. A typed-blank TAP Nº reads the plate's TAP ATUAL verbatim (`reading-cells.ts` `nameplateTap`), on screen and in print; ratio input headers show their unit on screen only (`inputHeaderText`). The "Marcar Com restrições" gap could not be reproduced on the current build (the shortcut renders on out ratio cells at 390/820/1180/1280 px); the new `@p1 UX-F42` e2e locks it.
- F43/F17/F16: `relatorio/section-position.ts` (`sectionPosition`, `sectionRefText`, `sectionsCaption`) feeds the parecer sentence, the absent-section texts (an absent section is named by its Sumário title, no number), the point toasts, the wizard Etapas 2/3/4/6, the Export dialog, the points surface, the ficha not-tested toast and band, the Sumário chevron and "Agrupar por tipo". Palette section 5 reads "Recomendações gerais (NR-10)". Seed v8 (`seed/v8.ts`), `SECTION_VARIABLES` + `secao_pontos`/`secao_ensaios`, contract 24 / minimum 24, `V7_HASH` pinned.
- F40: `resolveSectionText` drops a value's trailing period before a following period (`followedBy` across rich-text runs).
- F6, F51: authored rules in `registries.css` and `app.css`; both e2e assertions were shown red with the rule reverted (24 px value input; 253 px values box).
- The DOCX structure golden was regenerated (`GOLDEN_UPDATE=1`): ~~8 rows TAP Nº "-" -> "13200",~~ (reverted by the review fix below) 5 TP/TC rows Condição "-" -> "INSATISFATÓRIO" (fixture deviations 0,57-0,84 %), read as allowed by the Never-list's "unless a decision asks for a new seed version"; flagged for the coordinator.
- 2026-10-22, coordinator follow-up: the ficha conclusion helpers (`copy.ficha.conclusao.textHelper`, `textConfirmed`) and the gallery `note` and photo viewer `removeDescription` are templates fed by `sectionRefText(snapshot, 9)` and `sectionRefText(snapshot, 7)`; `ConclusaoSection` takes a `section9` prop from `ficha-surface.tsx`, `gallery-surface.tsx` and `photo-viewer.tsx` read the snapshot they hold. `conclusao-section.test.tsx` asserts the helper with "seção 5". The Conta/settings sentences (no relatório) stay.

- 2026-10-22, coordinator review fixes: TAP Nº reads TAP ATUAL only when it is an integer of up to 3 digits (the Porto Seguro "13200" prints "-"); the DOCX golden now changes only on the 5 TP/TC INSATISFATÓRIO rows. Seed v8 uses one variable, `{itens_resultados}` ("nos itens 4 e 5", "no item 5", "no corpo"; label "Itens dos resultados"; `SECTION_VARIABLES` holds seven). `sectionMention` (kernel) gives `{ref, prints, absent}`; a sentence promising print into an absent section says the absent wording instead (points, gallery, not-tested band and toast, Etapa 4, Export section 9 note, ficha conclusion helpers). `artTrtEchoText` takes the section reference; `s9Toggle` takes the kernel text; `blockingWhere` renders only with the snapshot; `pointMovedText`/`pointSavedText` take the section as a required parameter. Compact-template tests: `setup-surface.test.tsx` and the new `apps/web/src/surfaces/compact-template-sections.test.tsx` (points, gallery, ficha conclusion helper, not-tested band). The published local password was removed from the UX pass report.

## Spec Change Log

- 2026-10-22 review pass 1: findings 1–4 touched the frozen block; Matheus renegotiated them at the review checkpoint (decisions above) instead of a revert-and-replan loop, because the four fixes are local (a tap-number guard, one seed variable, absent wording, a matrix sentence) and the remaining 60-file diff is unaffected; the patches go to the same implementation subagent. KEEP: `section-position.ts` as the one numbering helper, seed v8 derived from v7, the authored CSS rules and their e2e proofs.

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | Golden TAP Nº prints "13200" (fixture `tap_atual` is a voltage); golden change unrecorded | medium | `nameplateTap` copies verbatim; delivered doc printed "-" | intent_gap → decided by Matheus (tap-number rule; golden INSATISFATÓRIO accepted and logged) → patch |
| 2 | blind | Matrix says null while a capture is unjudged; code returns INSATISFATÓRIO with one out and one empty | low | `reading-evaluation.ts` `some(out)` first | intent_gap → decided (out wins); matrix amended |
| 3 | blind, edge ×2 | v8 fallback prints "itens 8 e 4" / "itens 8 e 8" when section 8 is absent | medium | `sectionVariables` falls back to String(8); position 8 may be section 9 | intent_gap → decided (omit the reference) → patch |
| 4 | edge, verification | Sentences promise printing into an absent section ('entra na seção "Certificados"') | medium | `sectionRefText` title fallback used in positive sentences | intent_gap → decided (absent wording) → patch |
| 5 | blind | Custom section-10 texts keep "itens 8 e 9"; variables not insertable | low | true; user-authored text is outside the seed fix | defer |
| 6 | blind | `sectionPosition` re-implements `printedSections`' rule | low | agreement test covers one case; moving it into `print/layout.ts` risks an import cycle (relatorio → print) | rejected (low, fix adds coupling) |
| 7 | blind | INSATISFATÓRIO feeds no conclusion suggestion, pre-issue row or parecer count | medium | `condicao` read only by screen and print | defer (pre-existing: the suggestion engine never read ratio verdicts) |
| 8 | blind | Only F28 of the pass is in the ledger | low | report lives in `test-artifacts/manual` | defer (one ledger row pointing at the report) |
| 9 | blind | Test password published in the public report | low | `senha-local-campo-123456` in a tracked file | patch |
| 10 | blind, verification | "Na seção 10" (`registration.ts:56`) still fixed in Etapa 3; `s9Toggle` falls back to 9 in web | medium | both verified in the tree | patch |
| 11 | blind | Composer absence sentences and Conta/settings keep canonical numbers | false | composer is canonical by spec; Conta has no relatório (spec Never-list and follow-up scope) | rejected |
| 12 | blind, verification ×2 | No compact-template test for the wizard, points, gallery, not-tested, ficha wiring; new e2e are @p1 | medium | grep confirms only standard-template assertions | patch (tests); @p1 stays (full suite per wave) |
| 13 | blind, edge | `blockingWhere('')` renders " —  " while snapshot is null | low | `export-dialog.tsx:445` | patch |
| 14 | blind | `pointMovedText`/`pointSavedText` default `'seção 8'` lets a caller regress silently | low | default param | patch (required) |
| 15 | blind | `sectionsCaption([])`, duplicate `sectionRef` on host and shared | false | `[]` never passed; host and shared serve different consumers | rejected |
| 16 | blind | TAP Nº wrong once a second TAP row exists | low | seed has one row, no site-added rows | rejected (not reachable) |
| 17 | edge | Numeric row label "5" may be read as a value by dictation (`parse/utterance.ts:418`) | maybe-false (medium if true) | not verified; needs a dictation parse test with a numeric row name | defer |
| 18 | edge | Value "." before an ellipsis loses its own period | false | "X S.A..." reads as the ellipsis; no doubled period | rejected |


## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm lint && ... pnpm static && ... pnpm test:unit && ... pnpm test:api` -- expected: green (story gate phases 1–2)
- `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/ficha.spec.ts e2e/cadastros.spec.ts e2e/export.spec.ts --project desktop-chrome --project durability-desktop-chrome` under `lockf -t 20000 /tmp/fasor-verify.lock` -- expected: green, output pasted in the PR

**Manual checks (if no CLI):**
- Real-browser pass at 390/768/1280: ficha "Do local" line, Instrumentos panel, Sumário captions; regenerate the Vale Verde preview and read section 6 and the TR-1 sheet.
