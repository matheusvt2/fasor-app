---
title: 'e23h: "Como ensaiar" on each test and the recommendation as the derived point initial text (Stories 23.10 and 23.11, contract 37)'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_revision: 'dd947f419b4ef84531a2c4e60d08e4c8deaab64a'
review_loop_iteration: 0
followup_review_recommended: true
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-23-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Stories 23.10 and 23.11 add the two optional text keys of one test definition (help, recommendation) through the same schema change, the same type editor block and the same contract 37 (epic-23-context Batch plan, e23h).'
deferred:
  - summary: >-
      No test checks that an over-cap "Como ensaiar" heading or recommendation shows its issue inline under its own field in the type editor.
    evidence: |-
      TestTextsFields reads issuesAt(issues, [part, index, 'help', key]) and [part, index, 'recommendation'] (type-editor-parts.tsx:585, 595); only the kernel paths are tested (company-types.test.ts). The message still lists on the test row and the kernel blocks "Publicar", so a regression would lose only the placement.
    location: >-
      apps/web/src/surfaces/templates/type-editor-parts.tsx:585
    severity: low
---

<intent-contract>

## Intent

**Problem:** A test definition carries no text on how to run it, and the point derived from a failed test always starts with the kernel's generic sentence. Bruno wants a technician on site, without signal, to open how a test is done from the test itself. He also wants the point of a failed test to start with the test's own recommendation.

**Approach:**
- Every test definition (both grammars: `tests` and `measurement_tests`, seed and company type) gains two optional keys:
  - `help`, with up to eight optional texts;
  - `recommendation`, one optional text.
- The sheet shows a "Como ensaiar" action and dialog (Story 23.1's frame) on each test that has help.
- The type editor edits both keys on a company type, and "Duplicar" carries them.
- A `reading` derived entry starts with its test's recommendation.
- No print path reads `help`.
- Contract 37, MIN 37.

## Boundaries & Constraints

**Always:**
- **Kernel ownership (AD-1/AD-13).**
  - The kernel holds:
    - the key order;
    - the "filled headings" list;
    - the dialog's meta text and its count;
    - the composed recommendation text.
  - `apps/web` only renders what the kernel gives.
- **String homes (AGENTS.md).**
  - The heading labels and the editor/dialog chrome go in `apps/web/src/copy/pt-br.ts`, verbatim from the mocks, in one new `testHelp` group shared by both surfaces.
  - Derived text goes in `packages/domain`.
- **Mock class names.**
  - Dialog: `.como-dialog`, `.como-head`, `.como-kicker`, `.como-meta`, `.como-list`, `dt`/`dd`.
  - Editor: `.tipo-help`, `.tipo-help-head`, `.observation-field`.
  - Their page CSS is translated into `app.css` or the surface css, following the `.frame-*` rules of AGENTS.md (`.frame-phone` becomes `@media (max-width: 767.98px)`).
- **Schema.** Both keys are optional and never defaulted:
  - seeds v1 to v13 parse to the same bytes;
  - `V13_HASH` stays as pinned (`seed/seed.test.ts:2149`), since no seed content changes.
- **Layout lock.** The goldens stay byte-equal: `golden/layout-lock-v5/v11/v12` and Porto Seguro. If one would move, stop and report.
- **Data.** Fixture and test texts are synthetic or authored, never Bruno's base texts (M-1, path (b): his texts reach a company as data in Story 23.12, never git).
- **No emoji.** English code; pt-BR UI copy.

**Never:**
- Do not print `help` anywhere (DOCX, PDF, section 8, 9 or 10).
- Do not add `help` or `recommendation` to any seed file (`seed/v*.ts`).
- Do not build Story 23.12's import.
- Do not change a restricted (Story 23.6, batch e23v) or NC point's text.
- Do not change the generic text when no recommendation exists.
- Do not add a new op family (both keys live inside the existing `equipment_type` draft and `equipment_type_version` definition values).
- Do not regenerate any golden.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Help on a company test | A published type whose test has 5 of 8 headings | The section head shows "Como ensaiar". The dialog lists the 5 filled headings in the fixed order. Meta line: "Do tipo ⟨label⟩ · abre sem conexão · não sai no relatório · 5 de 8 tópicos preenchidos". | none |
| All eight filled | 8 headings | The meta line has no count part (the `#ficha-dlg-como-iso` frame) | none |
| No help | A seeded v13 test, or a company test without `help` (or with an empty `help`) | No action on the section head | none |
| NA test | A test made NA by applicability (`NotApplicableTest`) | No action (only the band shows) | narrowing |
| Offline | The sheet is open with the network off | The dialog opens from the definition already on the device | none |
| Editor blank | An editor field emptied, or only whitespace | The key is deleted; `help` becomes `{}`, which is then deleted | none |
| Oversized | A heading or the recommendation over `TEST_TEXT_MAX_LENGTH` (= `TEXT_CAPS.medium`, 1000) | Publishing it, `applyOp` refuses the version create (`op_invalid`, via the strict schema). The editor shows the kernel's issue inline, and "Publicar" stays disabled. | Refused |
| Blank in schema | A `help` value that is `""` or whitespace, sent by a raw op | Strict schema refuses it (`op_invalid`) | Refused |
| Recommendation, reading entry | A test with `recommendation` R and a reading out of criterion | Text = R, a period appended when R does not end in `.`, `!` or `?`, a space, then the existing composed text (`Título: valor em onde (critério: …)`) | none |
| No recommendation | — | Text byte-equal to today's | none |
| Reprovado entry | A sheet the engineer marked Reprovado with no failing test (the only case that derives a `reprovado` entry, `points/derived.ts:157`) | Text unchanged (no test is its reason; a test-caused Reprovado derives a `reading` entry, which carries R) | narrowing |
| Duplicar | A seeded definition carrying help/recommendation (a fixture), or a company version | The draft carries both keys whole | none |

</intent-contract>

## Code Map

**Kernel**
- `packages/domain/src/seed/schema.ts:254` `testDefSchema`: add `help` and `recommendation` beside `instrument_limit_note`.
- `packages/domain/src/seed/measurement.ts:267` `measurementTestShape`: the same two keys. The company variant `companyMeasurementTestSchema` (`types/definition.ts:108`) spreads it.
- New `packages/domain/src/seed/test-help.ts`:
  - `TEST_HELP_KEYS = ['objective','instrument','voltage','connections','procedure','criterion','standard','nr10']`, the DESIGN.md order "Objetivo · Instrumento · Tensão de ensaio · Ligações · Procedimento · Critério · Norma · Pré-requisito (NR-10)";
  - `TEST_TEXT_MAX_LENGTH = 1000`, with a test that it equals `TEXT_CAPS.medium` (`ops/value-limits.ts:25`). Do not import value-limits into seed/schema (cycle risk);
  - `testHelpSchema`: each key optional, a string of at most the cap, refined non-blank; never trimmed or transformed (the stored value is the raw op value, `ops/apply.ts:874`);
  - `testRecommendationSchema`;
  - helpers: `testHelpOf(definition, testKey)` (looks in `tests` then `measurement_tests`; null when no filled key), `testHelpEntries(help)` (ordered `{key, text}` of the filled keys), `testHelpMetaText(typeLabel, filled)`, `testRecommendationOf(definition, testKey)`.
  - Export them through the package index as the other seed modules are.
- `packages/domain/src/types/definition.ts`:
  - `companyTypeDefinitionShape` (262) takes `testDefSchema` and the measurement shape, so the strict publish check gains the keys for free;
  - `companyTypeVersionDefinitionSchema` (304) and `companyTypeDraftSchema` (330) stay structural (loose items keep any key).
- `packages/domain/src/types/block-definition.ts:61` `asBlockDefinition` spreads each test, so both keys reach `BlockDefinition`. Check the `TestDef` and `MeasurementTest` types carry them.
- `packages/domain/src/types/draft-edit.ts:395` `updateDraftTest`: add `setDraftTestHelp(draft, part, index, key, value)` and `setDraftTestRecommendation(draft, part, index, value)`. Follow `setDraftText`'s convention on trimming. A blank value deletes the key; an empty `help` is deleted.
- `packages/domain/src/types/duplicate.ts:80` `duplicateSeededType`: it copies `seed.tests` and `seed.measurement_tests` whole.
  - Extract a pure `duplicateSeededDefinition(seedVersion, blockType, seed)` that it calls, so a unit test can pass a fixture definition carrying help.
  - `duplicateCompanyType` (`structuredClone`) already carries both keys; test it.
- `packages/domain/src/types/validate.ts`: `validateTypeDraft` must surface the new strict-schema issues at `['tests'|'measurement_tests', i, 'help', key]` and `[..., 'recommendation']`, so the editor shows them inline. Verify, and add only if missing.
- `packages/domain/src/points/derived.ts:133-155` `sheetEntries`: the two `reading` loops (seeded grammar, then measurement) prefix the recommendation through one kernel function (`recommendedPointText(recommendation, composed)`).
  - The `reprovado` entry (157) and `ncText` are unchanged.
  - Mark the join `// authored (Story 23.11, open for Bruno)`.
- `packages/domain/src/contract/version.ts:399/625`:
  - set `CONTRACT_VERSION = 37` and `MIN_CONTRACT_VERSION = 37`;
  - append a "37" paragraph to both comment blocks (36 is e23v's, merged first);
  - update every test that pins the current number: `contract/contract.test.ts:104-105`, `apps/api/src/sync/nameplate-applicability.integration.test.ts:137`, and the rest found by `grep -rn "toBe(35)"`.
- `packages/domain/src/ops/value-limits.ts`: unchanged. `equipment_type` and `equipment_type_version` stay `structured` (every string ≤ long); the medium cap is the strict schema's.

**Api**
- `apps/api/src/sync/company-types.integration.test.ts`. Add `describe('Story 23.10/23.11: contract 37')`:
  - a version create with help (8 keys) and a recommendation applies through the route and is pulled back byte-equal;
  - one with a heading of 1001 chars is refused `op_invalid`;
  - one with a 1001-char recommendation is refused `op_invalid`;
  - a version-36 pull answers `426 contract_outdated`; follow the existing "contract 33" case at 356.
- `apps/api/src/jobs/generate/docx-company-type.test.ts`: the "never printed" test. Build the company-type relatório's DOCX twice, once plain and once with distinctive synthetic `help` texts on every test. Then:
  - `word/document.xml` is byte-equal between the two;
  - no help string appears in any zip part.
- `docx-layout-lock.test.ts` and the Porto Seguro golden tests must stay green, unchanged.

**Web**
- `apps/web/src/surfaces/ficha/ensaios-section.tsx`:
  - `TestSection` (286, section head at 388) gains the "Como ensaiar" text button: `btn btn-text`, `i-book` icon, `aria-haspopup="dialog"`. It sits after the `h2`, before the read-only reason, and renders only when `testHelpOf(definition, test.testKey)` is non-null.
  - It still shows on a read-only sheet. `NotApplicableTest` gets none.
- `apps/web/src/surfaces/ficha/measurement-test-section.tsx:31` `MeasurementTestSection`: the same action in its head (line ~86). Pass `definition` down from `EnsaiosSection` (`MeasurementTests` at 58 lacks it).
- New `apps/web/src/surfaces/ficha/test-help-dialog.tsx`, the dialog itself:
  - **Shell.** `DialogShell` (`components/dialog-shell.tsx`) with className `form-dialog como-dialog`, overlay `como-scrim`, `aria-labelledby` the title, `aria-describedby` the meta.
  - **Content.** Head with the kicker and an `h2.dialog-title` `tabindex="-1"`. Then the close `icon-btn` "Fechar Como ensaiar", the meta `p`, `dl.como-list`, and `dialog-actions` with the secondary "Voltar ao ensaio".
  - **Focus.** On open, focus the title (EXPERIENCE.md:325). DialogShell's rAF keeps it, since the focus is already inside. Tab cycles inside; Esc, close and "Voltar ao ensaio" return focus to the opener.
  - **Phone.** Full screen below 768 px (mock `60-ficha.html:305-318`).
- `apps/web/src/surfaces/templates/type-editor-parts.tsx:520` `TestsPanel`: add one shared `TestTextsFields` block to both editors (the seeded-grammar editor at 537 and the measurement editor at 565):
  - the `.tipo-help` group with its head and helper, and the eight multiline fields in a `.field-grid` (Procedimento and Pré-requisito `span-2`);
  - then the field "Recomendação se reprovado" with its helper (mock `43-tipo-equipamento.html:200-214`).
  - Each field is a `<textarea className="observation-field">` on `useCommittedText` (111): Enter makes a newline and never blurs. Commits go through `edit((d) => setDraftTestHelp(...))`, and issues show through `issuesAt`.
  - At 390 px nothing overflows (the editor rule of epic-23-context, "The editor of types").
- `apps/web/src/copy/pt-br.ts`: a new `testHelp` group with:
  - the 8 heading labels keyed by `TEST_HELP_KEYS`;
  - kicker "Como ensaiar", button "Como ensaiar", close "Fechar Como ensaiar", "Voltar ao ensaio";
  - editor helper, recommendation label and helper, all verbatim from the mocks.

**E2E**
- `e2e/support/company-type.ts`: the existing ways in (`duplicateLibraryType`, `editorTab`, `typeInto`, `publishButton`, `typeRows`).
- `e2e/company-type.durability.spec.ts`: the precedent for offline, DOCX and `extractStructure`.
- `e2e/support/groups.ts` `SERIAL_SPECS`: a new spec that generates a DOCX goes there, with its reason, or `scripts/e2e.test.ts` fails.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/seed/test-help.ts` (new), `seed/schema.ts`, `seed/measurement.ts`, package index: the keys, schema, cap and helpers above. Unit tests in `seed/test-help.test.ts`:
  - order, filled-only, the meta with and without count, blank and over-cap refused, at the cap accepted;
  - seeds v1 to v13 parse unchanged (`seed.test.ts` hashes green, no re-pin).
- `packages/domain/src/types/draft-edit.ts`, `duplicate.ts`, `validate.ts`: the setters, the pure duplicate core, the inline issues. Tests in `types/draft-edit.test.ts` and `types/company-types.test.ts`:
  - set, blank-deletes, and the empty help deleted;
  - Duplicar from a fixture seed and from a company version carries both keys;
  - an over-cap draft gives an issue and does not publish;
  - `assertVersionCreate` refuses an over-cap heading, a blank heading and a non-string.
- `packages/domain/src/points/derived.ts`: `recommendedPointText` plus the two `reading` loops. Tests, at the boundaries (the E14-A5 rule):
  - one `reading` origin per grammar with a recommendation;
  - without one, byte-equal to the generic text;
  - R ending in "." and R ending with none;
  - the `reprovado` origin unchanged;
  - `derivedPointSeed` keeping the text.
- `packages/domain/src/contract/version.ts` plus the pinned-number tests: 37/37 with the two paragraphs.
- `apps/api/src/sync/company-types.integration.test.ts`, `apps/api/src/jobs/generate/docx-company-type.test.ts`: as in the Code Map.
- `apps/web/src/surfaces/ficha/test-help-dialog.tsx` (new), `ensaios-section.tsx`, `measurement-test-section.tsx`, `copy/pt-br.ts`, styles: the action and the dialog. Component test `test-help-dialog.test.tsx`:
  - filled headings only, in order;
  - focus on the title;
  - Esc and "Voltar ao ensaio" return focus to the opener;
  - no action without help.
- `apps/web/src/surfaces/templates/type-editor-parts.tsx`: `TestTextsFields` in both test editors.
- `e2e/test-help.durability.spec.ts` (new, `@p0` 23.10-E2E-001). It runs on the durability project, then the matrix:
  - duplicate a library or FO.SERV-03 type, type 5 of the 8 headings on one test, publish (asserting the version row's `definition` in the store carries `help`);
  - create a relatório with that type, open the sheet, `context.setOffline(true)`;
  - at 1280 px: keyboard only, Tab to "Como ensaiar", Enter. The dialog shows the 5 headings and the meta from the kernel, focus is on the title, Esc returns focus to the button;
  - at 390 px: the dialog is full screen, with no horizontal page overflow; "Voltar ao ensaio" closes it;
  - a seeded v13 sheet's test shows no "Como ensaiar";
  - the editor at 390 px does not overflow;
  - a company "Duplicar" of the published type carries the help.
- `e2e/test-recommendation.spec.ts` (new, `@p0` 23.11-E2E-001, in `SERIAL_SPECS`):
  - type a recommendation in the editor, publish, create a relatório, type an out-of-criterion reading;
  - the Pontos entry text starts with the recommendation, and "Editar" writes a stored point whose `text` (store) keeps it;
  - generate, then the DOCX section 8 (found by its own heading, E7-A6) carries the text.
- `_bmad-output/planning-artifacts/architecture/architecture-fasor-2026-09-21/ARCHITECTURE-SPINE.md`, under AD-21's company-type note (around line 79): a dated note (M-3) on the two keys, the strict cap, never printed, and contract 37.
- `_bmad-output/specs/spec-fasor/source-deltas.md:167`: strike "(planned, Stories 23.10 to 23.12)" and add the as-built note dated 2026-11-09.
- `docs/kbs/log.md` plus the matching concept (`docs/kbs/architecture/kernel-and-seed.md` or the company-types concept): one line each.

**Acceptance Criteria:**
- **23.10 offline dialog.** Given a company type whose test has help typed in the editor and published, when its sheet opens offline and the technician taps "Como ensaiar", then the overlay shows only the headings with text, in the fixed order, with the focus on its title, and Esc, the close button and "Voltar ao ensaio" return the focus to the test's button (at 390 full screen, at 1280 in the form dialog).
- **23.10 no help.** Given a seeded v13 test (no help), when the sheet renders, then no "Como ensaiar" action shows.
- **23.10 Duplicar.** Given "Duplicar" of a seeded definition carrying help (a unit fixture) or of a published company type with help, when the copy is published, then its tests carry the same help and recommendation.
- **23.10 never printed.** Given a relatório whose tests all carry help, when it generates, then no DOCX part contains a help text, `document.xml` equals the help-free render, and the layout-lock and Porto Seguro goldens hold.
- **Cap.** Given a version create with a heading or recommendation over 1000 chars, when it is pushed, then the route answers `op_invalid`. A version-36 pull answers `426 contract_outdated`.
- **23.11 recommendation.** Given a company type's test with a recommendation and a reading out of its criterion, when section 8 derives the point, then its text starts with the recommendation, and writing it as a stored point keeps that text.
- **23.11 generic fallback.** Given a seeded v13 test with no recommendation, when its point derives, then the text is byte-equal to v12's generic one.
- **23.11 v12 unchanged.** Given a v12 relatório, when it prints, then section 8 is unchanged and the layout-lock goldens hold.

## Spec Change Log

### 2026-11-09: review pass 1
- Trigger: Edge Case Hunter finding "no Como ensaiar on an NA test head".
- Amended: the I/O matrix row "NA test → no action" is withdrawn in favor of EXPERIENCE.md:325, which puts the action on the head of every test that has help. The intent-contract text is left as written (read-only); this entry overrides it. Patched in the code, not re-derived.
- Known-bad state avoided: help an office typed is unreachable on a test the plate makes NA.
- KEEP: the rest of the build.

## Review Triage Log

### 2026-11-09 — Review pass
- verdicts: 10 findings — high 0, medium 3, low 5, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` (ECH-1) An NA test with help shows no "Como ensaiar" — the spec's own narrowing contradicted EXPERIENCE.md:325 ("every test that has help"); patched: TestHelpAction in the NotApplicableTest heads of both grammars, with component tests.
  - `[low]` `[reject]` (ECH-2) The dialog stays open while help turns null, then reopens — unreachable: a block's company type version never changes (config put refused, AD-21) and seeds carry no help, so `testHelpOf` is constant for a mounted sheet.
  - `[low]` `[patch]` (ECH-3) `recommendedPointText` appends "." after ":", "…", or a mark followed by a closing bracket or quote — patched: the terminator set is widened, with boundary tests.
  - `[low]` `[reject]` (ECH-4) An issue at `[part,i,'help']` itself (an unknown heading, a non-object help) has no field to show it — the editor never writes either, and the issue still lists on the test row (`issuesAt(issues, ['tests', index])`), with Publicar blocked; this is a raw-op case only.
  - `[medium]` `[patch]` (ECH-5, claim) "The sheet shows the action on each test that has help" fails on NA heads — same root cause as ECH-1; patched with it.
  - `[false]` `[reject]` (ECH-6, claim) The version.ts "36 is e23v's, merged first" is untrue on the branch — the PR opens only after e23v (contract 36) merges and main is merged in (launch rule), so the comment describes the merged head; checked again at the merge.
  - `[false]` `[reject]` (ECH-7, claim) The never-printed DOCX test patches only company versions — seeds never carry help (test-help.test.ts asserts v1 to v13 carry neither key), and the layout reads a `BlockDefinition` the same way from either origin, so the company case covers the reader.
  - `[medium]` `[patch]` (VG-1) "Como ensaiar" in a measurement-grammar section head is untested — patched: a measurement-test-section.test.tsx case renders the button in that head and opens the dialog.
  - `[low]` `[patch]` (VG-2) The read-only CSS override is never exercised in a browser — patched: test-help.durability.spec.ts asserts the action is visible and opens on a read-only sheet.
  - `[low]` `[defer]` (VG-3) No test checks that the inline issue sits under a help field — deferred as filed (only the placement is lost; the message lists on the row and the kernel blocks the publish).

## Design Notes

- **Contract 37.** No path changes. A version-36 bundle would:
  - show no "Como ensaiar" on a company sheet;
  - derive the generic text where the server's kernel derives the recommendation, so the section 8 it shows would differ from the printed one;
  - not refuse an over-cap help that the server's fold refuses.
  Hence MIN 37 (the precedent is 34's paragraph).
- **The cap.** `TEXT_CAPS.medium` keeps a recommendation plus the composed reference inside a point's `long` text cap (`value-limits.ts:167`). Every heading of the base fits it (all are under 720 chars, measured on the gitignored JSON, nothing copied). This is a narrowing for the PR.
- **Join.** `recommendedPointText('Verificar o carregador', 'Tensões medidas: 250 Vca em Tensão de entrada (critério: entre 198 e 242 Vca)')` gives `'Verificar o carregador. Tensões medidas: 250 Vca em Tensão de entrada (critério: entre 198 e 242 Vca)'`. This is authored wording, listed for Bruno.
- **Merge order.** e23v (contract 36: the restricted level, `points/derived.ts`, `conclusion.ts`, `section-9.ts`) merges first. On the merge, take its derived-point kinds whole and keep the recommendation on the `out` readings only; re-pin `V13_HASH` if its seed moved.

## Verification

**Commands** (inside the worktree, `podman compose --profile tools run --rm --user root tools …`, gates under `lockf -t 20000 /tmp/fasor-verify.lock`):
- `pnpm lint`, `pnpm static`: expected exit 0.
- `pnpm test:unit`: expected all green, `seed.test.ts` hash pins unchanged.
- `pnpm test:api` (after `podman compose restart api`): expected all green, goldens unchanged.
- `pnpm exec tsx scripts/e2e.ts e2e/test-help.durability.spec.ts e2e/test-recommendation.spec.ts e2e/type-editor.spec.ts e2e/company-type-sheet.spec.ts e2e/company-type.durability.spec.ts e2e/points-derived.spec.ts --project desktop-chrome --project durability-desktop-chrome`: expected all pass.
- `git diff origin/main --stat -- apps/api/src/jobs/generate/golden packages/domain/fixtures`: expected no golden modified.

## Auto Run Result

Status: done (gate result: see the PR body).

**Summary.**
- Story 23.10: every test definition (both grammars, seed or company type) takes an optional `help` with eight optional texts, capped at 1000 characters each and never blank (`seed/test-help.ts`).
  - The sheet draws "Como ensaiar" on the head of every test that has help: TestSection, MeasurementTestSection, and the NA heads of both grammars. It is drawn on a read-only sheet too, and the dialog opens offline from the definition already on the device.
  - The type editor edits all eight texts (`TestTextsFields`), and "Duplicar" carries them.
  - No print path reads `help`.
- Story 23.11: an optional `recommendation` (same cap) starts the text of a `reading` derived point (`recommendedPointText`). Without it, the text is byte-equal to the generic one, and the `reprovado` and NC texts are unchanged.
- Contract 37, MIN 37.

**Files.**
- Kernel:
  - `seed/test-help.ts` (new: keys, cap, schemas, helpers);
  - `seed/schema.ts` and `seed/measurement.ts` (the two keys);
  - `types/draft-edit.ts` (the setters), `types/duplicate.ts` (the pure core), `types/validate.ts` (the inline sentences);
  - `points/derived.ts` (the recommendation first);
  - `contract/version.ts` (37/37);
  - `index.ts`.
- Api tests: `company-types.integration.test.ts` (route, cap, 426), `docx-company-type.test.ts` (never printed), and the pinned numbers in `sync` and `nameplate-applicability`.
- Web:
  - `ficha/test-help-dialog.tsx` (new), `ensaios-section.tsx`, `measurement-test-section.tsx` and `ficha.css`;
  - `templates/type-editor-parts.tsx` and `type-editor.css`;
  - `copy/pt-br.ts` (`testHelp`).
- E2E: `test-help.durability.spec.ts` (new) and `test-recommendation.spec.ts` (new, in `SERIAL_SPECS`).
- Docs: the AD-21 spine note, `source-deltas.md`, and the KB concept and log.

**Review.**
- Two layers ran (Edge Case Hunter and Verification Gap) with one loop; Blind Hunter and Intent Alignment were skipped for token economy.
- Ten findings: five patched in three entries (two medium, one low, plus the low VG-2), one deferred (VG-3) and four rejected (ECH-2 unreachable, ECH-4 raw-op only, ECH-6 and ECH-7 false). Each is in the triage log above.
- Patched entries by verdict: medium 2 (NA heads; measurement-head test), low 2 (the terminator set; the read-only browser step).

**Follow-up review: true.** Two medium entries were patched and not re-reviewed:
- the NA-head action (no unit test on the seeded-grammar NA path, since there is no `EnsaiosSection` component test);
- the widened terminator regex of `recommendedPointText`.
The integrated review should read them first.

**Verification.**
- Implementer, before the review: lint 0, static 0, test:unit 5866 of 5866, test:api 930 passed and 6 skipped, the six spec files 15 of 15, `test-help.durability` on the matrix with `--repeat-each 3` green, and the golden and fixture trees unchanged.
- After the patches: the touched vitest files 50 of 50 and `test-help.durability` 1 of 1.
- The batch gate runs next.

**Residual risks.**
- The authored wordings (the join, the meta line, the editor sentences) are open for Bruno.
- The 1000-character cap is a narrowing.
- Contract 36 is e23v's, and its merge must precede this PR.
