# Epic 4 batch D review: Story 4.8 (document skeleton as a numbered DOCX revision)

PR #24, branch `story/4-8-docx-skeleton-renderer`, compose project `fasor-e4d` (ports 150xx).

## 1. Human-style browser pass (2026-09-24)

A throwaway Playwright script (scratch, never committed) drove the real UI on the `fasor-e4d` stack: sign in as Empresa B, create a relatório from Home, the Sumário, the foot's "Gerar relatório", the Export dialog, keyboard, offline, 390/768/1280 px, light and dark, and the api recreated with `GENERATE_FAULT=libreoffice_timeout` for the failed-job path. Screenshots: `qa-epic-4-D/NN-*.png`. The mock `73-exportar.html` was compared by its class list and copy (a `file://` render of the mock loses its stylesheet, so no mock screenshot is kept).

| AC (epics.md Story 4.8) | Result | Evidence |
|---|---|---|
| Revision 1 with `docx`/`pdf` file rows reaches the device; job `done`, `toc_converged`; log `duration_ms` | pass | `04`, api log `generate done ... duration_ms: 6890, toc_passes: 2, toc_converged: true, pages: 7`; `generate.integration.test.ts` |
| DOCX structure (header, footer, cover, document control, ÍNDICE pages = PDF outline, sections) | pass (automated); Bruno's read pending | `docx.test.ts` golden, 4.8-INT-002; `qa-epic-4-D/porto-seguro-skeleton-rev1.docx` for Bruno |
| `GENERATE_FAULT=libreoffice_timeout`: failed, no revision, no file; next generate is number 1 | pass | `15-failed-job-*` (alert, "Nenhuma revisão gerada ainda."), api log `generate failed ... libreoffice_timeout`; `16-after-fault-rev1-1280-light` |
| Dialog: flush, request, working "Gerando revisão 1…" + "pode fechar", close and reopen into working, toast, `issue` op, result row opens the DOCX | pass | `02`, `03`, `04`; download `relatorio-rev-1.docx`, 200, DOCX mime, `attachment`, `nosniff`; `11`-`13`: dialog closed, Sumário left and reopened, toast "Revisão 1 pronta — DOCX" and pill Emitido on return |
| Second press with no edit: "Revisão 1 pronta" again, no op, no second row | pass | `07-idle-with-revision-*`, `08` |
| 390/768/1280, light/dark: mock classes and copy, `role=dialog aria-modal`, labelled, Esc returns focus, axe clean | pass | `06-*`, `07-*`, `15-*` (no sideways overflow at any size); axe on idle, working, ready, failed: no violations; keyboard: Tab to the foot button, Enter opens, focus inside, Tab stays inside, Esc returns focus to the foot button (`05`) |
| Offline says so | pass | `10-dialog-offline-768-dark` |
| Status: `statusTable(Em campo, generate)` then `issue` | pass | `11` (Em revisão behind the dialog), `13`/`14` (Emitido) |

Observations for the reviewer (not yet triaged):

- O1. After a failed job the relatório stays Em revisão: the `generate` status op is written at the 202, as the spec's matrix says, while the failed sentence reads "Os dados não foram alterados". Spec-conformant; worth a product decision.
- O2. Right after "Criar relatório", Tab pressed at machine speed (about 5 ms apart) occasionally cycled inside the first numbered Sumário row (pos-box, open button, Overflow) or fell to `<body>`; at a human pace (1.5 s to read, 60 ms between presses) the foot button is reached in 40 presses every time. A 6 s and a 40 s probe with the focus parked on a row showed it stable. Batch A's surface; recorded, not reproduced at human speed.
- O3. The small fixture predates the section blocks, so its Sumário shows only the two fixed rows (`09`, `13`); the Home-born relatório shows all 13 (`01`).
