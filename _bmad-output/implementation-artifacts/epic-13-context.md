# Epic 13 Context: The photo is the instrument

<!-- Compiled by the coordinator on 2026-10-07 from epics.md (Epic 13), review-field-ux-2026-10-06.md and deferred-work.md. -->

## Goal

A field engineer points the camera and the shot is worth reading; typing, when the camera could not do it, is
respected; waiting on a reading is a visible, cancellable choice; and the relatório gets one optional AI conference
before it is issued. Source of every finding: `ux-designs/ux-fasor-2026-09-18/review-field-ux-2026-10-06.md`
(CAP-1 to AI-3, with the audited file and line of each). Scope boundary: F-01 to F-29 of the 2026-10-06 MVP review
are merged (PRs #98 to #100); this epic builds on their results and never reopens them.

## Stories and batches

| Batch | Tag | Port base | Stories | Dev model | Wave |
|---|---|---|---|---|---|
| A capture | e13a | 2 | 13.1, 13.2, 13.6 | opus · high | 1 |
| B keyboard | e13b | 3 | 13.4 | opus · high | 1 |
| C viewer and waiting | e13c | 4 | 13.3, 13.5 | opus · high | 1 |
| D plate tile | e13d | 5 | 13.7 | opus · medium | 2 (after C merges) |
| E emission audit | e13e | 6 | 13.8 | opus · high (fable retired, playbook) | 2 (first free slot) |

13.9 is out of this cycle (Matheus, 2026-10-07: dictation consent wording deferred).

## Coordinator decisions (2026-10-07, Matheus)

- **E8-A3, plate tile:** all eight block types carry "Fotografar placa". 13.7 builds that; the fake providers carry
  one synthetic plate fixture per type (closes E78-Q2). Synthetic fixtures only, never material from `docs/context/`.
- **13.9 deferred:** `VITE_SPEECH_ENGINE` stays `none`; no batch touches the dictation consent.
- **Parallelism:** at most three batches at a time; the gate runs one at a time under the host lock.
- **13.6 rides with 13.1 and 13.2** because all three touch `camera-view.tsx` and `use-photo-capture.ts`; batch A
  owns those files. Batch C does not edit them (the reading flow's crop zoom lives in `photo-viewer.tsx`).
- **13.8 model:** the story names fable; the playbook retired it, so batch E runs on opus with effort high.

## File ownership (one owning batch per shared file, E11-A8)

| File or area | Owner | Others |
|---|---|---|
| `apps/web/src/surfaces/ficha/camera-view.tsx`, `use-photo-capture.ts`, `files/photo-encode.ts`, `files/capture-rescue.ts` | A | read only |
| `apps/web/src/surfaces/photos/photo-viewer.tsx` and the plate-crop view | C | read only |
| `apps/web/src/surfaces/ficha/ficha-fields.tsx`, `components/number-input.tsx`, `components/date-field.tsx`, `ficha-surface.tsx` header | B | read only |
| `apps/web/src/sync/engine.ts` poll cadence, `plate-photo.tsx`, `read-display.tsx`, `relatorio/panel-capture.tsx` | C | D edits `plate-photo.tsx` gating after C merges |
| `apps/api/src/jobs/reading/providers/fake.ts` and `providers/fixtures/` | D | E adds its own audit fixture in a separate file |
| Export dialog, Sumário findings rows, new reading kind | E | none |
| `apps/web/src/copy/pt-br.ts` | each batch appends its own block; merge conflicts resolved by the later PR | |

## Cross-story assertions (E10-A3)

| Shared item | Assertion |
|---|---|
| Capture size (13.1) | a unit test asserts the constraints passed to `getUserMedia` and the bitmap size the shot produced; the fake camera path still captures |
| Torch state (13.2) | resets on every camera session; controls hidden (not rendered) when the capability is absent |
| Quota rescue (13.6) | durability spec: after a refused shot and a tab kill, the shot is in Dexie or the refusal was shown before another shot |
| Pinch zoom (13.3) | the reading flow's programmatic crop zoom still lands on the crop; Escape and back close the viewer |
| "Salvo às HH:MM" (13.4) | appears after a field op lands in the outbox; offline wording "Salvo neste aparelho às HH:MM"; tap budget unchanged |
| Reading cancel (13.5) | "Cancelar" discards the suggestion through the existing discard op and keeps the photo; undo pair unchanged |
| Plate tile on every type (13.7) | one `@p1` e2e per type is not required; one parametrized e2e over the eight types under `fake` reads a plate |
| Audit findings (13.8) | nothing written, counted or printed from a finding; absent with AI features off; one job per tap |

## Constraints carried into every batch

- Ownership AD-1/AD-13: statuses, counts, plurals and derived text in `packages/domain`; the web renders from
  IndexedDB and writes ops only. pt-BR strings in their three homes (AGENTS.md); authored copy marked `// authored:`.
- `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake`; the gate never reaches AWS. 13.8 logs tokens and USD per run.
- A new op family or reading kind bumps `CONTRACT_VERSION` with an api integration test through the sync route.
- Touch rules: 48 px hit areas, no gesture a stylus cannot make without a visible control path (EXPERIENCE.md).
- No emoji. The product name is `PRODUTO`.
