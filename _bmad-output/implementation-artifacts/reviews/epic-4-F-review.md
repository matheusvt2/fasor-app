# Epic 4 QA fixes (batch F): scripted browser pass

- Date: 2026-09-24
- Branch: `fix/epic-4-qa`
- Spec: `_bmad-output/implementation-artifacts/spec-epic-4-fix-qa.md`
- Source: the integrated QA review `reviews/epic-4-review-qa.md`, on branch `qa/epic-4`.
- Stack: compose project `fasor-e4f`. The pass ran in the `tools` container against the production web bundle (`pnpm --filter @app/web build`, served by `vite preview` on :5200, with `/api` proxied to the compose api).
- Account: a fresh company per run ("QA F Engenharia Ltda", standard template). Its one user is CREA, so the `--test` resets never touch it.
- Screenshots: `qa-epic-4-F/`. The script is a throwaway file kept outside the repo.
- The coordinator's instructions skip a separate independent reviewer here. The epic QA agent re-checks these fixes on its own stack after the merge. The build workflow's four review layers ran, and their triage is in the spec's Review Triage Log.

## Each QA reproduction, driven again

| Q | Reproduction step driven again | Result | Evidence |
|---|---|---|---|
| Q1 | Project > "Novo relatório a partir de template" > start date > "Criar relatório" | pass. The page lands on `/relatorio/:id/setup?etapa=1`, with focus on "Etapa 1 — Capa". | 01 |
| Q2 | Setup Etapa 3 of the new relatório | pass. "Responsável técnico" already reads the signed-in account, written in the creation batch. | 02 |
| Q3 | Etapa 1 "Informações adicionais" = "Parada programada de 36 horas", then Gerar relatório, then the downloaded DOCX | pass. The cover row "Informações adicionais" prints the typed text, and Etapa 2 has no "Escopo" field. | 03; the DOCX parsed with `extractStructure` |
| Q4 | A second relatório in the same obra | pass. The device held 94 equipment rows before and 94 after. Coluna 5 reads SEC-C05 and DJ-C05, with no suffix. | 04 |
| Q5 | Home with both relatórios, one with a setup "Local" override | pass. Both cards read "Hospital Beta · Bloco Cirurgico", equal to the Sumário header. | 05 |
| Q6 | `pnpm test:e2e:full` | pass. 90 passed and 3 skipped (the touch tests on projects without `hasTouch`). The three touch tests pass on `durability-android-chrome` (3/3). | PR body |
| Q7 | Section 9 fully expanded (94 rows), Alt+ArrowUp/Down on the 4th row of Coluna 3, 5 runs, production bundle | pass. From the keydown, the row moved at 101, 88, 91, 111 and 78 ms (median 91). The announcement lands in the same DOM mutation as the row. The QA measured 635-677 ms on the dev server; the dev agent's before/after on the production bundle is in the spec's Design Notes. | 07 |
| Q8 | Etapa 5 with no geolocation reading, then Confirmar, then "Alterar" | pass. No amber state and no "Sugerido" pill without a reading. The confirmed line offers "Alterar", which reopens the field with the value kept and the focus in it. | 08a, 08b, 08c |
| Q9 | Sumário, section 9, "Adicionar cabine" | pass. The row reads "Cabine 7 sem equipamento", never "Cabine Cabine 7". | 09 |
| Q10 | The Sumário foot, and the setup's "Conclusão e parecer" band | pass. The foot reads "Pré-visualizar: disponível em uma próxima etapa", and the band reads "Disponível em uma próxima etapa". | 10, 08b |
| Q11 | An Em campo relatório: Gerar relatório with the dialog open, then "Gerar de novo" | pass. The ready pill read "Emitido" on every sample (10 × 100 ms). The idle line after "Gerar de novo" promises "revisão 1". | 11a, 11b |
| Q12 | "Concluir dados do relatório" with a CREA responsável and no ART | pass. The reason reads "falta o número da ART". | 12 |
| Q13 | The DOCX package | pass. The footer paragraphs carry the `FooterText` style at 9 pt, and `cp:lastModifiedBy` is "PRODUTO". The dev agent's LibreOffice render read every "Página N de 8" as one 9 pt run. | the DOCX package |
| Q14 | Sumário row 2 opens its section text | pass. Focus lands on "Seção 2 — Definições". | 14 |

## Cross-cutting

- **Viewports:** at 390 px dark, 768 px light and 1280 px dark, neither the Sumário nor the setup overflows horizontally. The Export dialog at 390 px dark does not overflow either. Screenshots 20, 21-*, 22.
- **Offline reload:** on the built bundle, the Sumário reloads offline from the device (23).
- **Console:** no errors besides the expected 401 before sign-in and one `ERR_INTERNET_DISCONNECTED` while offline.
- **Script check that failed:** one of the script's own checks failed. It looked for "Em campo" in the header after the status op was pushed, and it stopped while its own navigation loop was still running. The generation that followed went Em campo, then Em revisão, then Emitido: the ready pill reads Emitido, which a Rascunho relatório cannot reach. So this is a defect of the check, not of the app.

## Found during the pass, not introduced here

- **Pre-existing e2e flake (fixed in the test):** in `4.3-E2E-001`, pressing Voltar right after the Sumário opens the setup can be lost. The setup scrolls its band to the top on open, and the App bar is static (`components.css`), so the button moves out from under the click. It reproduced on the baseline `6e66090` (2 of 12 runs). The test now waits for the band heading's focus before pressing Voltar, as a person waits for the page to settle; the result was 12 of 12 clean.
- **Home first paint:** for one frame, the cards can read "Relatório sem identificação" while the project rows load. The settled page is correct (05). This fallback is unchanged by this batch.
