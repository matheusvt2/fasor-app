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
