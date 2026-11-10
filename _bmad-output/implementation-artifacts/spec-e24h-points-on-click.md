---
title: 'e24h: a point of attention exists only when the technician creates it (no automatic points; contract 41)'
type: 'bugfix'
created: '2026-11-10'
status: 'in-review'
baseline_revision: '72ed1f51733c8abfdfd16fb209bc5c8171737215'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-24-context.md'
warnings: ['batched', 'multiple-goals']
batched_reason: 'One urgent fix Matheus decided on 2026-11-10 from Bruno''s report (points created with no tap): every reader of the automatic entries changes together (Points screen, Sumário, pre-issue, section 8, the parecer counts) under one contract bump, one gate, one PR, as the coordinator launched it.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bruno (the client's engineer, through Matheus, 2026-11-10, in chat; no file) reports that points of attention appear when an NC is entered although nobody tapped "Criar ponto de atenção", and asks for an urgent correction: a point exists only when the technician creates it. How automatic points should work is to be thought through later and is NOT built now. Matheus decided the same day: every automatic kind stops (`DerivedPointKind`: `not_tested`, `nc`, `reading`, `reprovado`, `restricao`), for every relatório on every seed. This overrides Story 15.2's automatic "Não ensaiado" entry, Story 22.5 ("every NC and every reprovação is a point of attention by itself") and the automatic half of Story 23.11. The dated notes in `epics.md`, `source-deltas.md`, `epic-24-context.md` and the proposal are John's parallel planning PR; this batch does not edit those four files.

**Approach:** The kernel stops offering the derived entries as points: section 8's entries, the Points heading and Sumário row 8, the pre-issue rows and the parecer's point counts read the stored live points only. The ficha findings the entries were computed from stay in the kernel for two readers only: the parecer's verdict floor (so no verdict moves, H3) and "Origem resolvida" (H4). The web drops the automatic cards. Contract 41 with `MIN_CONTRACT_VERSION` 41.

## Boundaries & Constraints

**Always:**
- Red first: every item gets a test that fails on `72ed1f51` (unit first, then the e2e of its surface; `@p0` for the main path, asserting the outbox or the store, not only the screen).
- AD-1/AD-13: every count, list and text is the kernel's; `apps/web` renders. pt-BR strings in their AGENTS.md home; every sentence authored here is marked `// authored (e24h, listed for Bruno)`.
- Tests that pinned automatic points (Story 15.2 F34, Story 22.5, Story 23.11, e23p's point text, the Points and Sumário specs) are rewritten to the new rule, never deleted silently: each changed test file gets one line of reason in this spec's "Changed tests" list. A test of a kernel function that this batch removes goes with it, listed the same way.
- `LLM_PROVIDER`/`OCR_PROVIDER` stay `fake`. Repo is public: no text from `docs/context/`.
- Every container run: `podman compose ... run --rm --user root tools ...`; every unit, api or Playwright run under `lockf -t 20000 /tmp/fasor-verify.lock`, started with nohup, logged in `.scratch-e24h/`, polled with bounded loops of at most 55 s. `podman compose restart api` after any change under `packages/domain` or `apps/api`, before `test:api` or an e2e.

**Never:**
- Never add a new way to generate points, a new create action, a new button or a new screen (a create action on a reading out of its criterion needs a mock frame; Epic 24 plans it).
- Never delete, migrate or rewrite data: no op, no route, no seed change (`V13_HASH` unchanged), no migration. Stored points stay, including those created or edited from an automatic entry, with their `origin`, `item_key`, `test_key` and the "Origem resolvida" flag unchanged.
- Never change a verdict: the ficha's conclusion floor, the stored pair, `derivedParecer`/`effectiveParecer`.
- Never regenerate `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` nor `packages/domain/fixtures/porto-seguro/*.golden.json` (see Design Notes, D3). Never use docker; never touch the main checkout or its stack; never `down -v`.
- Never edit `epics.md`, `source-deltas.md`, `epic-24-context.md`, the sprint change proposal, `sprint-status.yaml`, or any section of `deferred-work.md` but this batch's own.

## I/O & Edge-Case Matrix

| Item | Input / State | Expected |
|---|---|---|
| H1 | v13 sheet, a checklist row answered NC, no stored point | Pontos lists nothing; heading "Pontos de atenção"; Sumário row 8 "Nenhum ponto de atenção"; section 8 prints its empty note; no pre-issue row names it |
| H1 | a local's site item NC, no point | as above |
| H1 | a reading out of its criterion; a restricted reading (v13); a ficha concluded Reprovado by hand; a sheet marked Não ensaiado | as above, each |
| H1 | 2 stored points + the four findings above | heading "Pontos de atenção (2)"; row 8 "2 pontos" (plus "sem ação"/"não ensaiadas" parts as today); section 8 two bullets, action plan two rows |
| H1 | a manual point written before contract 31 on an equipment with an NC row | no "Possível duplicado" flag, no `points_possible_duplicate` pre-issue row (no entry to pair with) |
| H2 | "Criar ponto de atenção" on an NC row of a ficha and of a local | one stored point, `origin: 'nc'`, `item_key`, text `withPhotoTokens(ncRowPointText(...))` byte-equal to today |
| H2 | "Criar ponto" on the Não ensaiado band of a ficha | stored point `origin: 'not_tested'`, text `notTestedPointText` as today |
| H2 | "Criar" (Adicionar) on the Points screen | as today |
| H3 | every fixture and kind: a Reprovado ficha, an NC row, a restriction, a site NC, a Não ensaiado sheet, no point stored | `derivedParecer`, `effectiveParecer`, `conclusionFloor` and the stored pair equal to `72ed1f51`'s |
| H3 | parecer summary sentence, Critérios item, Etapa 6 reason line | "Foi registrado 1 ponto de atenção / Foram registrados N pontos de atenção na seção 8." and "N pontos de atenção" count stored live points only; absent with none |
| H4 | a point created by "Editar" from an `nc`/`reading`/`restricao`/`reprovado` entry before this change, source still standing / now resolved | kept, drawn, printed; "Origem resolvida" exactly as today (`resolvedOriginPoints` unchanged) |
| H5 | layout-lock v5, v11, v12 | section 8 prints no automatic bullet or row; the goldens change only by that removal, the empty note, the parecer points sentence and the page numbers it shifts (text diff in the PR) |
| H5 | Porto Seguro skeleton golden | would lose its 18 automatic `reading` rows (action-plan rows 8 to 25) and its parecer count: NOT regenerated; reported (D3) |
| H6 | a version-40 pull | 426 `contract_outdated` on every stream; version 41 answered; a version-40 push still accepted |
| H7 | Points section note, Não ensaiado band and toast, the polarity INVERTIDA helper | no sentence says points are created automatically (Design Notes, D4) |

</intent-contract>

## Code Map

- `packages/domain/src/points/derived.ts` -- `allDerivedPoints` :292 (the findings), `derivedPoints` :372 (suppressed list, the readers' entry), `resolvedOriginPoints` :390 (keep), `duplicatePairs`/`possibleDuplicatePoints`/`possibleDuplicatePairs`/`possibleDuplicatesText` :419-455, `ncRowPointText` :463 (keep), `groupDerivedPoints` :494, `derivedPointReasonText` :518, `derivedPointKindLabel` :535, `notTestedPointText` :540 (keep; section 9 reads it too), `withPhotoTokens` :549 (keep), `derivedPointSeed` :559.
- `packages/domain/src/points/summary.ts` -- `sectionEightEntries` :24, `PointsSummary` :79, `pointsSummary` :92, `pointsSummaryText` :125, `pointsHeadingText` :151.
- `packages/domain/src/print/section-8.ts` -- `Section8Bullet` :35, `derivedGroupText`/`DERIVED_HEADS`, `resolveSection8` :202, `resolveActionPlan` :239, `section8Layout` :267 (null with no bullet: the empty note). Renderer `apps/api/src/jobs/generate/sections/section-8.ts` (reads bullets only).
- `packages/domain/src/relatorio/parecer.ts` -- `derivedParecer` :174 (`pointsSummary(...).total > 0` at :177), `parecerReasonText` :206 (:210), `parecerSummary` points at :368, :410, :429, basis :442.
- `packages/domain/src/relatorio/pre-issue.ts` :19, :384-389 (`points_possible_duplicate`), :74, :561. `relatorio/site-checklist.ts` :284-285 (comment only). `relatorio/sumario.ts` :227.
- `packages/domain/src/relatorio/reading-evaluation.ts` :937 (helper "a ficha fica Reprovado e gera um ponto de atenção."), `reading-cells.ts` :198 (doc).
- `packages/domain/src/contract/version.ts` -- `CONTRACT_VERSION` :469, `MIN_CONTRACT_VERSION` :738, the two paragraphs per version (precedent: 40, commit `75b991d0`); tests `contract/contract.test.ts` :104-110, `apps/api/src/sync/sync.integration.test.ts` :1119 ("1.5-API-005 contract skew"); grep every other literal `'40'`/`40` contract pin (`grep -rn "CONTRACT_VERSION\|x-contract-version" e2e apps --include=*.ts`).
- Web: `apps/web/src/surfaces/points/points-surface.tsx` (`DerivedCard`, `Editing.kind 'derived'`, `editingDerivedEntry` :424, the two flags :94-95, :207, :245); `apps/web/src/copy/pt-br.ts` points :1275-1366 (`sectionNote` :1284, `autoOrder`, `autoReason`, `derivedReason`, `editDerivedLabel`, `possibleDuplicate`, `notTestedChip`, `openSheet`, `openLocal`), ficha `notTestedToast`/`notTestedBandAfter` :1421-1429, pre-issue `seePoints` :773; create paths kept as they are: `surfaces/ficha/checklist-section.tsx` :337, `surfaces/local/verificacoes-surface.tsx` :128, `surfaces/ficha/not-tested-band.tsx` :68.
- Goldens: `apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/` (DOCX parts: `docx-layout-lock.test.ts`; `pdf-text.json`: `layout-lock.integration.test.ts`; both `GOLDEN_UPDATE=1`); `golden/porto-seguro-skeleton.json` (`docx.test.ts` 4.8-UNIT-006, frozen here).
- Probe (on `72ed1f51`, `.scratch-e24h/probe.ts`): Porto Seguro 7 stored + 18 `reading` entries; Porto Seguro small 1 `not_tested`; layout-lock v5 9 `nc` + 3 `reading`, v11 10 + 3, v12 11 + 1; no possible duplicate pair in any.

## Tasks & Acceptance

**Execution:**
- `points/derived.ts` -- (H1/H3/H4) keep the findings computation internal (`allDerivedPoints`, `sheetEntries`, `pointSource`, `entrySource`) for `resolvedOriginPoints` (unchanged) and a new `hasPointSource(snapshot): boolean` (any finding at all, unsuppressed) that only the parecer floor reads. Remove the exported list `derivedPoints` and every export whose only reader was the automatic list (`possibleDuplicate*`, `groupDerivedPoints`/`DerivedPointGroup`, `derivedPointKindLabel`, `derivedPointSeed`, and `derivedPointReasonText` if nothing else reads it); keep `ncRowPointText`, `notTestedPointText`, `withPhotoTokens`, `equipmentPointTitle`, `predatesItemSource` (checks.ts reads it) and the `DerivedPointKind` type if a kept reader needs it. Rewrite the file's header comment: the entries are the ficha findings a point can be written from; they are never listed, counted or printed (Matheus, 2026-11-10, e24h).
- `points/summary.ts` -- (H1) `sectionEightEntries` and `SectionEightEntry` hold live points only (or remove the union); `PointsSummary` drops `derived`/`derivedNotTested`; `total` = live points; `naoEnsaiadas` = live `not_tested` points on a sheet still untested (today's live half); `pointsSummaryText` without the "automático" branches; `pointsHeadingText(live)` "Pontos de atenção (N)", "Pontos de atenção" at 0. Update the doc comments.
- `print/section-8.ts` -- (H1/H5) `resolveSection8` and `resolveActionPlan` read live points only; `Section8Bullet` is the point kind; remove `derivedGroupText`/`DERIVED_HEADS` with their tests; `section8Layout` null with no live point (the empty note, as today).
- `relatorio/parecer.ts` -- (H3) `derivedParecer`: `siteNcCount(snapshot) > 0 || livePoints(snapshot.points).length > 0 || hasPointSource(snapshot)` (equal to today by construction: a suppressed entry implies a live point). `parecerReasonText`, `parecerSummary` (sentence, Critérios item, basis key `points`) count live points only. Unit test: for each finding kind alone (no point stored), the verdict equals `72ed1f51`'s AND the reason line still names a part (never "…: ."); if a kind raises the verdict while no other part names it, keep the line well-formed by the smallest kernel change and record it in Design Notes as an open question.
- `relatorio/pre-issue.ts` -- (H1) the `points_possible_duplicate` row and its kind go (no pair can exist); `pt-br.ts` `seePoints` if unused. `relatorio/site-checklist.ts` :284 comment: the 22.5 note is struck with the e24h date (no new row: the NC-without-point pre-issue row is an open question, D5).
- `relatorio/reading-evaluation.ts` :937 and `reading-cells.ts` :198 -- (H7) "…: a ficha fica Reprovado." (drop "e gera um ponto de atenção"); marked authored (e24h).
- `contract/version.ts` -- (H6) 41 and MIN 41, one paragraph in each of the two blocks in the 40 paragraphs' style: no new op, path or schema; a version-40 bundle's kernel would list, count and print automatic points the server's no longer does (the Points screen, the Sumário and the preview would differ from the printed document). Tests: `contract.test.ts`, `sync.integration.test.ts` 1.5-API-005 (40 joins the refused list, 41 answered, a 40 push accepted), and every other pin.
- Web -- (H1) `points-surface.tsx` draws live points only: remove `DerivedCard`, the `'derived'` editing branch, `derivedSeed`, `editingDerivedEntry`, the `duplicates` flag (keep `resolved` → "Origem resolvida"), update the header comment; remove the copy keys nothing reads any more. (H7) `points.sectionNote` both forms: replace "Itens não conformes, ensaios fora do critério, fichas reprovadas e equipamentos marcados como Não ensaiado entram sozinhos ao final, conforme as fichas; Editar grava um ponto que substitui o automático, e um ponto criado de um item não conforme já traz o texto, a foto e o equipamento." by "Um ponto criado de um item não conforme já traz o texto, a foto e o equipamento."; `notTestedBandAfter` drops ", e entra na {ref} automaticamente" and the absent form's "A entrada nos pontos de atenção {absent}."; `notTestedToast` drops "— entra na {ref}" and the absent "— o motivo {absent}" (both read "Marcada como não ensaiada"). Each changed string marked `// authored (e24h, listed for Bruno)` with the old text in the comment.
- Goldens -- (H5) after the code: extract the DOCX text (`document.xml` paragraphs and table cells) and `pdf-text.json` of v5, v11, v12 before and after into `.scratch-e24h/golden-diff/`, normalized (page numbers and TOC leaders stripped), and diff; regenerate the three layout-lock goldens with `GOLDEN_UPDATE=1` only when the normalized diff shows nothing but the removed automatic bullets and rows, the section 8 empty note, the parecer's points sentence/count, and page numbers. Keep the diffs for the PR. For Porto Seguro write the would-be skeleton to `.scratch-e24h/golden-diff/porto-seguro-skeleton.proposed.json` (not the golden path) and its diff; the golden test stays red (D3).
- E2e -- (H8) a new `e2e/points-on-click.spec.ts` `@p0` (seeded relatório, as a person): mark a checklist item NC on a ficha and a site item NC on a local, type a reading out of its criterion, conclude a ficha Reprovado, mark an equipment Não ensaiado; after each, Pontos lists nothing ("Pontos de atenção", empty note), the Sumário row 8 reads "Nenhum ponto de atenção", the IndexedDB `points` store holds no row; the export preview's section 8 (the preview text the existing preview specs read) carries none of them; then "Criar ponto de atenção" on the ficha NC row stores one `origin: 'nc'` point (outbox op asserted), Pontos shows "Pontos de atenção (1)" and the preview's section 8 prints it. Rewrite the existing specs that pinned automatic entries (at least `points-derived.spec.ts`, `points.spec.ts`, `three-levels.spec.ts`, `test-recommendation.spec.ts`, `contact-rise.spec.ts`, `previous-visit-judges.spec.ts`, `ground-grid.spec.ts`, `tc-polarity.spec.ts`, `action-plan.spec.ts`, `parecer-export.spec.ts`, `verificacoes-local.spec.ts`; grep `e2e/` for "automático", "is-auto", "Possível duplicado", "Fora do critério", "Item não conforme", "Ensaio fora do critério", "gera um ponto", "entra na", "Foram registrad") to the new rule; a spec that times taps against a render follows `SERIAL_SPECS`.
- Docs -- `deferred-work.md` § "Deferred from: Epic 24 fix batch e24h (2026-11-10)"; `docs/kbs/log.md` line; the KB concept that describes the derived entries (`docs/kbs/code/domain-package.md` or `architecture/kernel-and-seed.md`, grep "derived") gets a dated paragraph.

**Acceptance Criteria:**
- Given each matrix row, when its test runs on `72ed1f51`, then it fails, and after the fix it passes.
- Given any relatório, when the Points screen, the Sumário, the pre-issue list, the preview or the generated document is read, then no entry, count or flag stems from a finding with no stored point.
- Given every fixture of the domain tests, when the parecer verdict and every ficha's effective pair are computed, then they equal `72ed1f51`'s.
- Given the layout-lock goldens, when regenerated, then their normalized text diff holds only the removed automatic points, the empty note, the parecer points count and page numbers.
- Given the gate, when it runs, then lint, static, test:unit, test:api and the touched specs on `desktop-chrome` and `durability-desktop-chrome` are green, except `docx.test.ts` 4.8-UNIT-006 (Porto Seguro skeleton, D3), which is red with exactly the diff reported.

## Changed tests

- `packages/domain/src/points/points-on-click.test.ts` (new): H1 to H4 red on `72ed1f51` (each finding alone lists, counts and prints nothing; two stored points beside the four findings; the pre-31 manual point; the create texts; "Origem resolvida"; each kind's verdict and reason line; every fixture's verdict and effective pairs pinned to `72ed1f51`'s).
- `packages/domain/src/points/derived-kinds.test.ts`: Story 22.5's scenarios rewritten to the new rule (the manual point alone in section 8, no "Possível duplicado", no Reprovado bullet, no NC bullet citing the photo); `derivedPoints`, `derivedPointSeed`, `derivedPointKindLabel` and `possibleDuplicatePoints` went.
- `packages/domain/src/points/derived-recommendation.test.ts`: Story 23.11's entry-text cases went with `derivedPoints`; kept as "a recommended out test and a Reprovado by hand print no bullet".
- `packages/domain/src/points/derived-recommendation-restricao.test.ts` (deleted): its only subject was the text of a `restricao` entry (`derivedPoints`, removed); the restricted case is in `points-on-click.test.ts`.
- `packages/domain/src/points/points.test.ts`: 6.6-UNIT derivedPoints and groupDerivedPoints (removed functions) replaced by "an untested sheet lists nothing"; the summary, row 8 and heading counts without "automático" (F34, fx15q struck); Porto Seguro lists its 7 stored points.
- `packages/domain/src/print/section-8.test.ts`: 7.3-UNIT-003 (`derivedGroupText`, removed) and the derived action-plan rows replaced by "untested sheets print nothing"; Porto Seguro prints 7 bullets and 7 rows.
- `packages/domain/src/print/e23f-print-fixes.test.ts`: (a) the Reprovado bullet is gone; the line breaks are kept in a point written with them.
- `packages/domain/src/print/layout.test.ts`: Porto Seguro's section 8 holds 7 bullets (was 7 + 18); the moved section 8 of the small fixture prints its empty note.
- `packages/domain/src/relatorio/e23e-tc-thermo-ground.test.ts`: the polarity helper drops "e gera um ponto de atenção" (H7); the thermography and ground-grid entry texts became "a finding, no bullet".
- `packages/domain/src/relatorio/three-levels.test.ts`: the restricao, rise and prerequisite entry texts became "no bullet"; the restricted cable's stored point lists and resolves; the context test compares the findings (`hasPointSource`, `resolvedOriginPoints`) instead of `derivedPoints`.
- `packages/domain/src/relatorio/e23t-transformer-tests.test.ts`: the winding restricao and IP entry texts became "a finding, no bullet".
- `packages/domain/src/relatorio/e23w-wave2-fixes.test.ts`: the prerequisite entry became `hasPointSource`; the restricao/reading entry checks went (W2-3's "Origem resolvida" kept).
- `packages/domain/src/relatorio/e22f-wave-a-fixes.test.ts`: S2/N4 possible duplicates (removed functions and pre-issue row) became "no pair, one entry"; S4 keeps the NC row's text.
- `packages/domain/src/relatorio/site-checklist.test.ts`: "a site NC is a point by itself" became "a site NC is no point; the Q-4 row stays retired".
- `packages/domain/src/relatorio/parecer.test.ts`: the reason lines and the summary drop the automatic point ("1 não ensaiada", "1 NC nas verificações do local", no points sentence); the verdicts are unchanged.
- `packages/domain/src/relatorio/e23z-final-fixes.test.ts`: the W3-7 IP and item 2 Reprovado entry-text cases went with `derivedPoints` (their helpers with them); `recommendedPointText` keeps its own case; W3-1 keeps "Origem resolvida".
- `packages/domain/src/contract/contract.test.ts`: 41 and MIN 41.
- `apps/web/src/surfaces/compact-template-sections.test.tsx`: the Não ensaiado band no longer names "entra na seção 5" (H7).
- `apps/web/src/surfaces/relatorio/setup-surface.test.tsx`: the reason line drops "e 1 ponto de atenção".
- `apps/web/src/surfaces/relatorio/sumario-surface.test.tsx`: row 9 (points) reads "Nenhum ponto de atenção" (was "1 automático").
- `apps/api/src/sync/sync.integration.test.ts`: 1.5-API-005, 40 joins the refused list, 41 answered, a 40 push accepted.
- `apps/api/src/jobs/generate/docx-company-type.test.ts` (found by the story gate): the mixed-case "Tensão de flutuação do banco" came from the automatic out-of-criterion row of section 8's action plan; the test now reads section 9's "TENSÃO DE FLUTUAÇÃO DO BANCO" and asserts the automatic row is gone.
- `apps/api/src/sync/three-levels.integration.test.ts`: the restricao point through the route is the one section 8 entry (was "replaces the derived entry").
- `apps/api/src/jobs/generate/golden/layout-lock-{v5,v11,v12}/document.xml` and `pdf-text.json`: regenerated with `GOLDEN_UPDATE=1` after the normalized text diff showed only the removed automatic bullets and rows, the empty note, the parecer's points sentence and Critérios item, and page numbers.
- `e2e/points-on-click.spec.ts` (new, `@p0`, `queue` lane in `e2e/support/groups.ts`): H8.
- `e2e/points-derived.spec.ts`: 22.5-E2E-001/002 rewritten (no automatic card or flag, "Criar ponto de atenção" on the NC row, DOCX with the stored points only, "Origem resolvida"); 23f-E2E-001 (a) asserts no Reprovado bullet.
- `e2e/points.spec.ts`: 6.6-E2E-003 (the untested sheet lists nothing; "Criar ponto" on its band), 6.6-E2E-005 and 6.6-E2E-016 (row 8 and heading without "automáticos").
- `e2e/three-levels.spec.ts`, `e2e/previous-visit-judges.spec.ts`, `e2e/ground-grid.spec.ts`, `e2e/contact-rise.spec.ts`, `e2e/tc-polarity.spec.ts`, `e2e/test-recommendation.spec.ts`, `e2e/test-base-import.spec.ts`: the automatic card, its "Editar" and its DOCX bullet became "Pontos lists nothing, section 8 prints no automatic bullet"; tc-polarity pins the new helper text.
- `e2e/action-plan.spec.ts`: no action-plan row for the untested sheet.
- `e2e/parecer-export.spec.ts`: the reason line drops "e 1 ponto de atenção".
- `e2e/verificacoes-local.spec.ts`: comments struck; the site NC lists no card beside the stored point.
- `e2e/company-type-sheet.spec.ts`, `e2e/ficha.spec.ts`, `e2e/ficha.durability.spec.ts`, `e2e/sheet-knows-12-3-12-4.spec.ts`, `e2e/tree.spec.ts`: the Não ensaiado toast reads "Marcada como não ensaiada" (no "— entra na seção 9").

## Design Notes

- **D1. What stays in the kernel.** The findings (`allDerivedPoints`) are the same computation, kept for two readers that must not move: the parecer floor (H3) and "Origem resolvida" (H4). A finding is not a point; nothing renders it as one.
- **D2. Create-on-click paths today.** `nc`: yes (ficha checklist row and local site row, "Criar ponto de atenção"). `not_tested`: yes (the ficha's Não ensaiado band, "Criar ponto"). `reading`, `reprovado`, `restricao`: none (their only path was "Editar" on the automatic card, which goes); a person writes them with "Criar" on the Points screen. Epic 24 plans the rest; nothing is added here.
- **D3. Porto Seguro golden (STOP, per the launch).** Its skeleton's action-plan table carries 18 automatic `reading` rows (rows 8 to 25, "Ensaio fora do critério: …"), not in the delivered relatório (whose section 8 is bullets 1 to 3, the three Não ensaiado points and bullet 5, all stored). The batch does not regenerate it; 4.8-UNIT-006 stays red with the diff in the PR until Matheus decides.
- **D4. Copy.** Smallest changes listed above; the company-type editor's `recommendationHelper` ("Texto inicial do ponto de atenção quando um valor deste ensaio fica fora do critério") and the Etapa 6 note ("… itens não conformes e pontos de atenção dão Apto com restrições") stay true and are kept; the recommendation now starts no point (no create path for `reading`), listed as an open question.
- **D5. Open questions for Matheus.** (a) Should an NC row with no point be named in the pre-issue list again (the retired Q-4 row)? Not built. (b) A confirmed parecer text whose relatório had automatic points reads stale after the update (the basis counts stored points); expected, listed. (c) The Porto Seguro golden (D3).

## Verification

- Narrow runs while iterating: `podman compose --profile tools run --rm --user root tools pnpm exec vitest run --project <kernel project> <file>`; one Playwright spec: `pnpm exec tsx scripts/e2e.ts e2e/<spec>.ts --project desktop-chrome --project durability-desktop-chrome`; api file: `pnpm --filter @app/api exec vitest run <file>`; each under `lockf -t 20000 /tmp/fasor-verify.lock`.
- The orchestrator runs the story gate.

## Spec Change Log

## Review Triage Log

### 2026-11-10 — Review pass
- layers: Edge Case Hunter and Verification Gap ran; Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 4 findings — high 0, medium 0, low 2, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` EC: `parecerReasonText` could read "O relatório exige no mínimo Apto com restrições: ." if the verdict were raised by `hasPointSource` alone (before, an automatic entry counted as a point and named it) — unreachable today: every finding kind `sheetEntries` builds also sets a `computeFloor` reason (NC, out, index, choice, ratio, measurement, prerequisite, restricted) or a site NC, and `points-on-click.test.ts` pins each kind's reason line; the fix adds a guard branch. Listed as a residual risk (the two rules must keep matching).
  - `[false]` `[reject]` VG other: `docx.test.ts` 4.8-UNIT-006 is red — by design (D3, the launch's STOP on the Porto Seguro golden); the diff is exactly the 18 automatic rows and the parecer count (`.scratch-e24h/golden-diff/porto-seguro-skeleton.diff`), reported for Matheus's decision.
  - `[false]` `[reject]` VG other: the `|| hasPointSource(snapshot)` clause of `derivedParecer` decides no tested case — it keeps the verdict equal to `72ed1f51`'s by construction (H3) whatever the floor rules do later; no bad outcome.
  - `[low]` `[reject]` VG other: `.point-of-attention-card.is-auto` rules stay in `points.css` and `app.css`, and `allDerivedPoints` still composes texts nothing reads — no behaviour; the CSS mirrors `72-pontos.html`'s automatic card and the texts are the kernel's prefill candidates, both left for Epic 24's design of automatic points (D4).

## Auto Run Result
