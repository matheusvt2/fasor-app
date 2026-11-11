# Fix batch e24h hands-on behaviour pass (2026-11-10)

Run by a QA agent through the browser on the local stack of the main checkout, commit `1528183f` (contract 41), as `dev@local.dev`, at 1280 px, with the `fake` providers. Nothing was fixed during the pass and no test suite ran in it. It is the check that runs before the production deploy of fix batch e24h (PR #307). Evidence (66 screenshots, 8 PDFs with their text, the console and network logs) is in the gitignored `.playwright-mcp/e24h-pass/` of the main checkout and is not tracked.

The batch changed two rules, for every relatório on every seed:

1. A point of attention exists only when a person creates it.
2. An observation never forces a restriction.

## Relatórios used

| Name here | Seed | Status | What it is |
| --- | --- | --- | --- |
| WIP | v13 | Em campo | The second visit left by the Epic 23 pass, seven fichas, none concluded at the start |
| NEW | v13 | Em campo, then Em revisão (revision 1 issued in this pass) | Created in this pass from a template, on a new obra: a seccionadora, a ground grid and a breaker |
| OLD-v7 | v7 | Em revisão, one revision | A sample relatório with one point created by a person |
| OLD-v9 | v9 | Em revisão, two revisions | One point created by a person, no ficha concluded |
| OLD-v10 | v10 | Em campo | One point created by a person |
| OLD-v13 | v13 | Em revisão, two revisions issued on 2026-11-09 | One transformer ficha stored as Aprovado · Com restrições |

In these relatórios the points section prints as section 4 or 5 and the conclusion as section 5 or 6. "Section 8, 9 and 10" of the stories are read here as "Pontos de atenção", "Relatórios dos ensaios" and "Conclusão".

## Results

| Check | What was done | WIP | NEW |
| --- | --- | --- | --- |
| A1 | An NC item with its observation on a ficha; Pontos and the Sumário read again | Pass | Pass |
| A2 | An NC item with its observation on a local's Verificações | Pass | Pass |
| A3 | A reading out of its criterion (contact 300 µΩ against < 250 µΩ; ground grid 8 Ω against ≤ 5 Ω) | Pass | Pass |
| A4 | A ficha concluded Reprovado | Pass | Pass |
| A5 | An equipment marked "Não ensaiado" | Pass | Pass |
| A6 | The PDF preview read after the five findings | Pass | Pass |
| A7 | "Criar ponto de atenção" on the NC item (also on the local's NC item on NEW) | Pass | Pass |
| A8 | "Criar ponto de atenção" under the "Não ensaiado" band | Pass | Pass |
| A9 | The Pontos screen read; a point created by hand | Pass | Pass |
| A10 | Points created by a person on older relatórios | Pass on OLD-v7, OLD-v9 and OLD-v10, with a caveat | n/a |
| A11 | The relatório's verdict | Pass ("Não apto") | Pass ("Não apto"); "Apto com restrições" with only a stored point confirmed on OLD-v9 |
| B1 | Text in "Observações" on a clean ficha, then conclude | n/a | Pass |
| B2 | An observation on a Conforme item and on an N.A. item, on a ficha and on a local | n/a | Pass |
| B3 | The preview prints X on APROVADO and on SEM RESTRIÇÕES, with the observation | n/a | Pass |
| B4 | "Com restrições" chosen by hand on a clean ficha | n/a | Pass |
| B5 | One NC item gives at least Aprovado · Com restrições; a reading out gives Reprovado | Pass | Pass |
| B6 | Every ficha Aprovado · Sem restrições with observations, no NC, no point | n/a | Pass ("Apto") |
| B7 | A ficha concluded Aprovado · Com restrições before the change | First half not checked; second half Pass on a ficha concluded in this pass | |
| C1 | Revision 1 issued and its PDF read | n/a | Pass |
| C2 | Console and network over the whole pass | Pass for the product; five 503 answers caused by the local environment (H2) | |

What stands behind the table:

- **A1 to A5.** After each of the five findings the Pontos screen and the Sumário's line still read "Nenhum ponto de atenção". The counters that should move did move ("1 NC aberto", "1 não ensaiada"). The band no longer says the ficha enters a section by itself.
- **A6.** Both previews printed "(sem conteúdo nesta revisão)" under the points heading, with no action plan table. The conclusion listed the reproved fichas, the restrictions, the NC items and the equipment not tested, and had no sentence counting points.
- **A7 and A8.** The NC item's point opened with "Item N (name): observation" and the right equipment. The band's point opened with the standard sentence of the chosen reason. The heading read "Pontos de atenção (1)", then "(2)", with no "automático". The Sumário moved by one each time.
- **A9.** No "Possível duplicado" and no "Editar o ponto automático" anywhere. The button on the Pontos screen reads "Criar"; it opens an editor in place and saves a point under "Geral".
- **In print after A7 to A9.** The WIP preview printed three bullets and three rows of the action plan, and the conclusion ended "Foram registrados 3 pontos de atenção na seção 4."
- **A10, the caveat.** Each older relatório still shows its one point, and that matches the device's store. No count was taken before the change.
- **B1 and B2.** The suggestion read "Aprovado · Sem restrições?", both restriction options stayed enabled, and nothing said "observação registrada".
- **B4.** With "Com restrições" chosen by hand, "Observações" showed "Obrigatória com restrições", and "Concluir ficha" refused until it was filled.
- **B7, second half.** The ficha concluded Aprovado · Com restrições in B4 went back to "Sem restrições" with one tap, kept its observation and printed X on SEM RESTRIÇÕES.
- **C1.** The issued PDF of nine pages agrees with the screens: the points section prints exactly the four points a person created, with a four-row action plan, and the conclusion prints "Não apto".
- **C2.** No update prompt appeared in about sixty page loads. The network log holds 1187 answers 2xx, five 503 and no 4xx.

## Findings

### Medium

- **H1. A decision, not a defect.** A relatório issued before the change prints without its automatic points when it is issued again. On OLD-v13, revision 2 of 2026-11-09 printed three points, all "Ensaio fora do critério", and "Foram registrados 3 pontos de atenção". Today's preview of the same relatório, with nothing edited, prints "(sem conteúdo nesta revisão)". The three readings are still out of their criterion. Nothing tells the person that the next revision will differ. This is rule 1 working as written.
- **H2. The local environment, not the product.** The Postgres of the main stack restarted three times during the pass, each time during a document generation, while two batch stacks ran beside it on the same podman VM. One PDF download answered 503 and passed on the second tap, four sync requests answered 503, and one preview took 97 s. The app handled it and lost no data.

### Low

- **H3.** The two "Criar ponto de atenção" buttons differ once the point exists. On an NC item the item shows "Ponto de atenção 1" and the button stays, so a second identical point can be saved with no warning. On the "Não ensaiado" band the button disappears and nothing on the ficha says a point exists.
- **H4. A question.** A reading out of its criterion and a reproved ficha have no one-tap way to create a point. The person goes to Pontos, taps "Criar", picks the equipment and types the text. Story 24.17 plans that action.
- **H5.** The Sumário's points line undercounts "sem ação": the point created from the band is counted as "1 não ensaiada" and left out of "sem ação".
- **H6. Outside the checks.** The Export dialog's "Antes de emitir" lists sends of other devices with no label, and leaves out the line of this device, so the last send reads as two days old.
- **H7. Outside the checks, may be local data.** "Controle do documento" in the Export dialog says "FO.SERV-03 · Revisão 01" while the issued PDF prints "Revisão 00", and the two name different companies as Contratada.
- **H8. Outside the checks, older than e24h.** Two fichas stored as Aprovado · Com restrições show Reprovado · Com restrições with "Conclusão ajustada pela ficha" and a "Confirmar" button, because a stored reading is judged out of its criterion. On the transformer it is an over-range reading. The stored values were not rewritten. Revision 2 of 2026-11-09 already listed that reading.

Small things seen on the way: with one equipment "Não ensaiado" the Sumário header says "2 de 3 fichas concluídas" and the local line "3 de 3"; a preview names as reproved a ficha that is still "Em preenchimento"; "Novo relatório" offers "Criar" for a client name that already exists; the ficha's primary button reads "Concluir e avançar" while the stepper still shows the conclusion pending.

## Not checked

- B7's first half: the local data holds no ficha concluded Aprovado · Com restrições before the change whose only reason was an observation.
- A10 against a count taken before the change.
- The DOCX of revision 1 (generated, not opened).
- Tablet and phone widths, the real camera, a photo on a point, "Marcar como enviado ao cliente", a second device.
- A restricted reading ("Marcar Com restrições" on a row).
- The write checks on seeds other than v13. The older seeds were read, not edited.

## What follows (coordinator, 2026-11-10)

- Every check of the two rules passed. No finding blocks the deploy of fix batch e24h.
- H1 is the rule Bruno asked for and Matheus decided for every relatório. It is told to Matheus with the deploy.
- H2 is the load rule broken by the coordinator: three stacks ran at once. The main stack stops while batches run.
- H3 and H5 go to Story 24.7's batch (e24b) as notes. H4 is Story 24.17. H6, H7 and H8 are rows in `deferred-work.md`.
