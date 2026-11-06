# Epic 21 Context: The ratio follows the vector group, and the REGISTRO FOTOGRÁFICO in the order of the work

<!-- Compiled inline by the coordinator on 2026-11-05 from the investigation of main a8628a30 (Bruno's WhatsApp of 2026-11-05, the TTR research note). Edit freely. -->

## Goal

Two fixes from Bruno's WhatsApp of 2026-11-05. A transformador de força whose group is not Dyn1 (a star-star unit, filled by an intern) is judged against the wrong VAL CALCULADO, because seed v9 fixed U1 · √3 / U2 and the Dyn1 terminal pairs. And the REGISTRO FOTOGRÁFICO (section 7) cannot be put in the order of the work, because its photos follow capture order and nothing can move one.

## Stories

- Story 21.1: The transformer ratio follows its vector group (seed v11, contract 30)
- Story 21.2: The plate reading identifies the vector group, also from the drawn diagram
- Story 21.3: Move a photo up or down in the REGISTRO FOTOGRÁFICO (contract 30)

The text of each, with its DoR, ACs and DoD, is in `epics.md` § Epic 21. The 47 groups (pairs, shorts, factor k) are in `_bmad-output/planning-artifacts/research/ttr-vector-groups-2026-11-05/research.md`, which is the source of the kernel table.

## Decisions (Matheus, 2026-11-05)

- Every group of the research note: "Considere todos".
- The plate reading reads the drawn diagram too: "a leitura deve identificar o diagrama tambem quando por foto".
- Open relatórios on seed v9 and v10 get the fix: "Sim".
- Build in batches, as before: "agrupe pra ir mais rápido e diminuir token sem perder qualidade".

## Open readings (coordinator's, to be corrected by Matheus)

- **The kernel table.** Dyn3, Dyn9, Dy3 and Dy9 ship as transcribed (their k is flagged in the research note) and are listed in the PR for Bruno.
- **Unparsed group.** On v9 and v10, an empty or unparsed LIGAÇÃO SECUNDÁRIA keeps √3 and the Dyn1 pairs.
- **Empty group.** On v11, an empty group computes no VAL CALCULADO and asks for the group.
- **Diagram reads.** A group read from the drawing alone is always `verify`.
- **Photo order.** It applies to section 7 only, with Subir and Descer in the gallery's Overflow and no drag. A new photo lands last.

## Batch plan

There are two batches, so two PRs for three stories, in one wave of two lanes, so at most two batch stacks are up at a time. Each batch runs `bmad-build-auto` in its own worktree, following `epic-batch-orchestrator.md`.

| Wave | Tag | Port base | Branch | Stories | Dev model | Base |
|---|---|---|---|---|---|---|
| 1 | e21r | 55 | `e21r-ratio-vector-group` | 21.1, 21.2 | opus · high | main after the planning PR |
| 1 | e21p | 56 | `e21p-section-7-photo-order` | 21.3 | opus · high | main after the planning PR |

Why 21.1 and 21.2 share a batch: 21.2 reads 21.1's group table and parser, and both touch the transformer's LIGAÇÃO SECUNDÁRIA, seed v11 and the plate fixtures.

**Coordinator decisions.**
- **Contract and seed.**
  - e21r bumps `CONTRACT_VERSION` to 30 and owns seed v11 (derived from v10, `V10_HASH` pinned).
  - e21p adds its contract note under 30 in `contract/version.ts` and does not bump again. Whichever PR merges second merges main and keeps one bump.
  - `MIN_CONTRACT_VERSION` moves to 30 only if a batch shows that a 29 client must stop. Say why in the PR either way.
- **Shared files between the two batches.**
  - `contract/version.ts`: both append a paragraph under 30. Expect a trivial conflict.
  - `deferred-work.md`: each batch writes under its own heading.
  - e21r owns `seed/*`, `relatorio/reading-evaluation.ts`, `relatorio/reading-cells.ts`, `print/section-9.ts` (ratio headers), `apps/api/src/jobs/reading/**` and `scripts/make-plate-fixtures.ts`.
  - e21p owns `photos/order.ts`, `photos/numbering.ts`, `print/photo-order.ts`, `print/section-7.ts`, `ops/path.ts` (`FILE_FIELDS`) and `surfaces/photos/*`.
  - `copy/pt-br.ts`: e21r adds the ratio helpers under the ficha keys, and e21p adds the gallery Overflow keys. Different blocks, so any conflict is trivial.
- **Facts the batches share.**
  - LIGAÇÃO SECUNDÁRIA holds the whole group code in practice. The Porto Seguro fixture types "DYN1" on every transformer (`packages/domain/fixtures/porto-seguro/data.ts`).
  - The synthetic transformer plate carries `ligacao_secundaria: 'Y'` (`apps/api/src/scripts/make-plate-fixtures.ts` line 117).
  - Bedrock structuring already receives the image (`apps/api/src/jobs/reading/providers/bedrock.ts` line 230). The Story 8.5 digit guard lives in `packages/domain/src/reading/build.ts` and `reading/digits.ts`.
  - Section 8's "conforme Imagem N" is a `[[foto]]` token resolved at print (`print/section-8.ts`), so it follows a photo that moves.
  - A "Geral" photo is `isGeralPhoto` (`photos/order.ts`): no sheet, item or local, and `reading_kind` null or `'caption'`.
  - Reorder keys are `ops/order-key.ts` (`sortByOrderKey`, one put per move), as for blocks and points.
  - The test company is Empresa A, `a@teste.local`. `LLM_PROVIDER` and `OCR_PROVIDER` stay `fake`, and no paid key appears in a test.
- **Gates.**
  - Each batch runs the story gate: lint, static, test:unit, test:api and its touched specs.
  - e21r adds every spec that asserts seed counts or the ratio table (`grep -rln` over `e2e/`, rules E14-A3 and E15-A3).
  - e21p's change to the op fold runs its touched durability specs on the matrix projects.
  - Before the second PR merges, the cross-batch merge rule applies (§ 6).
  - After both merge comes one integrated gate on main: `test:e2e:full` and the matrix, with the load line. Then the two-pass integrated review (§ 9), then one fix batch if needed.
  - The deploy happens only on Matheus's word. The 21.2 paid eval run (`bedrock-eval.ts`) is a "before the deploy" item for Matheus.

## Merges, integrated gate, review and deploy record (coordinator, 2026-11-05)

Matheus, 2026-11-05: "pode fazer o pr, merge, e deploy, se passar tudo pode fazer, ja estou logado na conta" and "pode fazer na madrugada".

**Merges.**
- PR #254 (e21p, 21.3) merged first as 94d03830.
- PR #255 (e21r, 21.1 and 21.2) merged second as fdc19924, after the cross-batch rule. Main was merged into the branch as aa580eb2, with one contract-30 bump and MIN 30. On that head, lint, static, test:unit (5194), test:api (839) and both batches' touched specs (238 of 238 on desktop-chrome and durability-desktop-chrome) all passed.
- PR #256 (fix batch e21f) merged as 8252cee4.

**Integrated gate on fdc19924.**
- Run under the host lock, wait 1 s. Load was 4.54 at the start and 5.15 at the end. The main stack was up. The integrated review's own stack (fasor-e21q) and a Playwright MCP browser ran beside it for about 25 minutes.
- lint 0 (21 s), static 0 (30 s), test:api 839 passed and 4 skipped (406 s).
- test:unit: 5192 of 5194 passed. Two web files failed on `waitFor` timeouts: `src/state/reading-arrivals.test.tsx` (the caption toast) and `src/surfaces/home/home-surface.test.tsx` (12.2 "Continuar"). Run alone twice at load 3.17, both passed (44 of 44, twice).
- `test:e2e:full`: 579 of 584 passed, 4 skipped. 1 red: @p0 R8LAY-E2E-008, where the "Novo relatório" dialog was not visible within 5 s at one viewport. Run alone under the lock (wait 790 s, load 4.15 at the start and 3.71 at the end, beside the fasor-e21f stack), it passed 1 of 1. The same spec passed in e21r's merged-head gate. Explanation: load from the review pass running in parallel. Neither red touches Epic 21 code.
- `test:e2e:matrix`: 140 passed, 16 skipped (the WebKit Blob skips), 0 failed (582 s).

**Integrated review** (`epic-21-integrated-review-2026-11-05.md`, two passes per § 9):
- Behavior pass: every AC walkable in the browser passed at 390, 768 and 1280 px.
- Second pass: 5 notes, no blocker or should-fix (N-1 to N-5, for Matheus or Bruno).

**Paid eval** (coordinator; the "before the deploy" rows; `deferred-work.md`):
- Production model Claude Haiku 4.5, Textract OCR, on the synthetic set only (the real plate set is not on this machine).
- On `bedrock-structuring-3` the drawn Yyn0 plate read Dy1 in 3 of 3 runs. That was a defect against 21.2's AC, so it became fix batch e21f, PR #256.
  - The model now describes the drawing (`vector_diagram`), and the kernel composes the code (`composeVectorGroup`).
  - e21f's story gate: lint, static, unit 5204, api 865, plate specs 22 of 22. Lock wait 1120 s, load 5.15 at the start and 3.99 at the end.
- On `bedrock-structuring-4` (head 3d8a76ed), over 3 runs: the printed plates read Dyn1 and the drawn plate read "Yyn0 (diagram)" 3 of 3. Field accuracy 96.2 %, citations 100 %, about USD 0.006 per reading. The real-set run stays with Matheus.

**Deploy checklist** (§ 8, § 9):
- `grep -n "before the deploy" deferred-work.md` lists the e21r eval row (partly done, synthetic set), the e21r uncited-diagram row (open, needs the real set), the e21f eval row (closed) and older rows already closed.
- `test:e2e:full` on 8252cee4: 580 of 584 passed, 0 failed, 4 skipped (2279 s), under the host lock (wait 1 s, load 5.01 at the start, 4.11 at the end, only the main stack up). The deploy goes from the records merge on top of 8252cee4, which changes only documents.

**Deploy.**
- Deployed 45546f69 (the code of 8252cee4, plus records) on 2026-11-06 at about 00:30 (America/Sao_Paulo), with `infra/bin/deploy`, nohup, no lock wrapper. Contract 30, MIN 30, seed v11, prompt `bedrock-structuring-4`.
- Health was up and the tag was recorded.
- Production smoke: 8 of 8 passed (the plate read 12 fields; PDF preview, Revisão 1, DOCX and PDF downloaded).
- Telemetry: 7 `session_start` with the new app_version and 0 `ux_event_sink_failed`.
- The test company was cleaned up (task 502c6519).
- Not done: no release tag was pushed and no release page was written (they wait for Matheus's word). The Epic 21 retrospective has not run.

## After the deploy (coordinator and batch e21a, 2026-11-06)

**Release.** v0.6.0 was tagged on 45546f69 and published on 2026-11-06, on Matheus's word ("pode publicar").

**Real-set eval** (coordinator, 2026-11-06; counts only, no plate content):
- Six real transformer plates were downloaded from the production bucket into the git-ignored `docs/media/real-plates-2026-11-06/`. They are never committed.
- Prompt `bedrock-structuring-4`, Claude Haiku 4.5, Textract OCR, two identical runs.
- 5 of 6 read Dyn1, one of them as a diagram read (`verify`, "Lido do diagrama — confira"). 1, a blurred and rotated photo, got no suggestion. 0 were wrong.
- None of the six is star-star; every real plate is Dyn1.
- The plate read from the diagram prints "Dyn I", with a letter I in place of the 1. That answers the retrospective's open question (R-7): a printed code the parser did not match, not a drawing-only plate. Batch e21a makes `parseVectorGroup` read a single trailing I or l as clock 1.

**Fix batch e21g** (review notes N-1 to N-3 and two e21r rows, D1 to D7) merged as PR #260 (5673ded5).

**Fix batch e21a** (E21-A1, R-1 to R-4 and R-9 of the retrospective; the P-4 re-read of e21g's three patches; the "Dyn I" parse; these records, E21-A3; the playbook § 10, E21-A4): branch `e21a-reading-fixes`, spec `spec-e21a-reading-fixes.md`, PR opened against main and not merged by the batch.

**Second deploy checklist** (coordinator, 2026-11-06; e21g #260 and e21a #261, main 42b05896):
- `test:e2e:full` on 42b05896: 581 of 585 passed, 0 failed, 4 skipped, 0 flaky (2250 s), under the host lock (wait 0 s, load 5.30 at the start, 3.13 at the end, only the main stack up).
- `grep -n "before the deploy" deferred-work.md` rows: the e21r eval and uncited-diagram rows were closed by the real-set eval and e21a; the others were closed earlier.
- The deploy goes, on Matheus's word ("pode subir"), from the records merge on top of 42b05896, which changes only documents.

**Second deploy.** Deployed dac14b81 (the code of 42b05896, plus records) on 2026-11-06 at about 14:30 (America/Sao_Paulo), with `infra/bin/deploy`, nohup, no lock wrapper. Health was up and the tag was recorded. Production smoke: 8 of 8 passed (the plate read 12 fields; PDF preview, Revisão 1, DOCX and PDF downloaded). Telemetry: 7 `session_start` with the new app_version, 0 `ux_event_sink_failed`. Test company cleaned up (task e10b27e0). No release tag yet; it waits for Matheus's word.
