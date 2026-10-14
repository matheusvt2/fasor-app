---
title: 'v0.2.0 production check fixes (batch p020)'
type: 'bugfix'
created: '2026-10-14'
status: 'ready'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '25e89404'
dev_model: opus
dev_effort: medium
warnings: ['batched']
batched_reason: 'The coordinator batched the five defects of the v0.2.0 production check (`.scratch-p020/prod-report.md`) into one small fix PR.'
---

## Intent

The v0.2.0 production check (2026-10-14) found five defects. Fix each, every fix with a test that fails without it. Do
not change what prints, do not add sections to a template or relatório automatically, no template content changes.
Out of scope: the Home card counter difference (ledger).

## I/O and decisions

| ID | Today | After |
|---|---|---|
| P-2 | `ficha.css:109` and `verificacoes.css:50` set `pointer-events: none` on `.field.combobox > .combobox-chevron`, which also hits the React Aria `Button.combobox-chevron` (`components/combobox.tsx:139`, used by `registry-picker-field.tsx`): a tap on it does nothing. | Keep the positioning for both, scope `pointer-events: none` to the decorative chevron only: `.field.combobox > span.combobox-chevron` (the `<span aria-hidden>` beside a native `select.input`, `ficha-fields.tsx:593`, and beside a suggestion field). The Button gets taps. No other copy of the rule exists (grep `combobox-chevron` + `pointer-events` over `apps/web/src`, re-check). |
| P-1a | A template with no section block shows "Blocos · 0 seções" and nothing else. | The composer's sections list shows one warning while the template has no FO.SERV-03 text section or lacks section 8 or section 10, with a button that opens the existing palette's "Seções" group (the `onAddBelow` path of `template-composer.tsx:368` without a target: focus the first section item from 1024 px, else open the drawer); tapping a section there appends it as today. |
| P-1b | `pointSavedText`/`pointMovedText` (`points/checks.ts`) always say "na seção 8"; Etapa 6 says the parecer prints in section 10 (`pt-br.ts` `parecerConfirmed`, `parecerConfirmedToast`, `parecerKicker`, `parecerNote`); the Sumário says nothing. | Kernel `printsSection(snapshot, n): boolean` from `print/layout.ts` `printedSections` (the one rule; `pre-issue.ts` `section10Prints` uses it too, behavior unchanged). The toast and the move announcement name section 8 only when it prints. Etapa 6, when section 10 does not print: a note says so instead of `parecerNote`, the confirmed helper and toast drop "impresso na seção 10", the box kicker says it will not print. The Sumário's sticky reason line (`generateReason`, `sumario.ts:387`) ends with one sentence naming what will not print. |
| P-3 | After "Concluir e avançar" on a CTA sheet the Sumário row 9 reads "Texto de conclusão desatualizado" and the sheet offers "Substituir" with an identical text. | A stored text whose basis was composed from the same values is never `stale`; root cause found and fixed in the kernel. |
| P-4 | Aprovado + Com restrições + empty Observações: header "… faltam … e a conclusão". | The conclusao part names what is missing: the pair ("a conclusão"), the observation ("as observações"), or both ("a conclusão e as observações"); the verb agrees as today ("falta"/"faltam"). Stepper count unchanged. |
| P-5 | The generate confirmation says "Emitir com …?", the foot "Emitir pede confirmação: …", the button "Emitir mesmo assim", though it only generates a revision (status flow 2026-10-10). | The mock `73-exportar.html` names the action "Gerar relatório" / "Gerar de novo": "Gerar com …?", "Gerar pede confirmação: …", "Gerar mesmo assim". "Emitir" stays for issuing. EXPERIENCE.md line 337 gets a struck-through old wording and a dated new one (AGENTS.md convention). |

Authored copy (pt-BR, each marked `// authored: p020 …` where it lives; list them all in the report):

- Composer warning (kernel, `templates/text.ts`, from the template's section types): no section at all: "Este template não tem seções de texto: os relatórios saem só com as seções 7 e 9, sem pontos de atenção, parecer e assinatura."; only 8 missing: "Sem a seção 8, os pontos de atenção não saem nos relatórios deste template."; only 10 missing: "Sem a seção 10, o parecer e a assinatura não saem nos relatórios deste template."; both 8 and 10 missing (with other sections): "Sem as seções 8 e 10, os pontos de atenção, o parecer e a assinatura não saem nos relatórios deste template." Button (`pt-br.ts`): "Adicionar seção".
- Point toast, section 8 absent: "Ponto de atenção salvo · {p} de {t} · não sai no documento: o relatório não tem a seção 8"; move announcement: "Ponto de atenção movido: {p} de {t} · não sai no documento: o relatório não tem a seção 8".
- Etapa 6, section 10 absent (kernel texts, one function returning the variant set or null): note "Este relatório não tem a seção 10: o parecer e a assinatura não saem no documento."; confirmed helper "Confirmado · não sai no documento: o relatório não tem a seção 10"; toast "Resumo do parecer confirmado"; kicker "Não sai no documento (sem seção 10)".
- Sumário reason sentence (kernel, appended after the existing reason with one space): both absent "Sem as seções 8 e 10, os pontos de atenção, o parecer e a assinatura não saem no documento."; 8 absent "Sem a seção 8, os pontos de atenção não saem no documento."; 10 absent "Sem a seção 10, o parecer e a assinatura não saem no documento." A relatório that prints the seed's eleven (`printsSeedSections`) never gets it.

Open questions (keep the conservative reading, list in the PR): the Sumário warning is a sentence, not a pre-issue row (no new pending/blocking row, so the Export gating is unchanged); the not-tested copy "entra na seção 8" (`pt-br.ts:1104,1108`) and the Etapa 3 "assinatura da seção 10" helper are left as they are.

## Code map

- `apps/web/src/surfaces/ficha/ficha.css:107-109`, `apps/web/src/surfaces/local/verificacoes.css:48-50` (P-2).
- `packages/domain/src/print/layout.ts:178` `printedSections`; `relatorio/sumario.ts:207` `printsSeedSections`, `:387` `generateReason`; `relatorio/pre-issue.ts:466-475`; `points/checks.ts:107-117`; `templates/text.ts:121` (P-1). Web: `surfaces/points/create-point-action.tsx:54`, `surfaces/points/points-surface.tsx:110,123`, `surfaces/relatorio/setup/etapa6-parecer.tsx:150-178`, `surfaces/relatorio/sumario-surface.tsx:506`, `surfaces/templates/section-list.tsx`, `template-composer.tsx:368-375,554`.
- `packages/domain/src/relatorio/conclusion.ts:213-322` (`composeConclusion` basis, `conclusionTextState`), `pre-issue.ts:210` `staleConclusionNames`, `apps/web/src/surfaces/ficha/use-ficha-actions.ts:131-165` (the conclude batch also writes `testInstrumentOp`s) (P-3).
- `packages/domain/src/relatorio/sheet-progress.ts:174-181,268-285` (P-4).
- `packages/domain/src/relatorio/pre-issue.ts:675-687`, `apps/web/src/copy/pt-br.ts:564`, `apps/web/src/surfaces/export/export-dialog.tsx:399` (P-5).

## Tasks

1. P-3 first: a kernel test with a CTA sheet shaped like the report (4 polos so Polo N exists, E1 with one cell out of criterion, E2 filled, E5 "Não realizado", result Aprovado, Com restrições with an observation, a nameplate with Fabricante and Tensão nominal). Apply the conclude batch exactly as `use-ficha-actions.ts` builds it (instrument ops included, through `applyOp`), then a JSON round trip of the block (what the server pull stores), and assert `staleConclusionNames` is empty and `conclusionTextState` is `confirmed`. Find what differs between the two basis inputs (`canonicalJson` of `undefined` vs `null`, a field the batch writes, the measurement-table cells of a skipped test, the E5 values, a config default) and fix it in the kernel so equal inputs give an equal basis. The basis of every non-measurement sheet must keep its bytes (`conclusion.ts:281` comment): add a test that pins one known basis of the eight. If an equal text with a differing basis can still occur, `conclusionTextState` also compares the stored text with the composed one and reads `stale` only when they differ.
2. P-2 CSS, then a Playwright test in the most relevant existing sheet spec: tap (click) the chevron Button of a registry combobox on a sheet (Fabricante or Fabricação) and assert its listbox is visible; it must fail with the old rule.
3. P-1 kernel (`printsSection`, the texts, the composer warning function) with unit tests for every variant and for the seed-sections case; then web wiring, component tests where they exist (`template-composer.test.tsx`, `sumario-surface.test.tsx`), and one Playwright `@p0` test: a template with no section block (built through the composer or a seed helper the specs already use) shows the warning; a relatório from it shows the toast without "na seção 8" and the Sumário sentence. Assert the committed state where the test writes (outbox).
4. P-4 kernel text and unit tests; update `ficha.spec.ts` assertions only if they cover this case.
5. P-5 copy; update every spec and unit test that names the old strings (`grep -rn "Emitir mesmo assim\|Emitir com\|Emitir pede" e2e apps packages`), and EXPERIENCE.md.
6. Lint, static, the unit tests you touched (in the `tools` container with `--no-deps`); do not run the api suite or Playwright (the orchestrator runs them under the host lock). Commit nothing; report the files changed, the P-3 root cause, every authored string and the e2e specs you touched.

## Acceptance criteria

- Given a sheet with a registry combobox, when the engineer taps its chevron, then its listbox opens; the native select's chevron stays decorative (a tap reaches the select).
- Given a template with no section block, when the composer opens, then the warning and "Adicionar seção" show; given sections 8 and 10 present, then no warning.
- Given a relatório that prints neither section 8 nor 10, when a point is saved, then the toast does not name section 8; Etapa 6 says the parecer does not print; the Sumário reason line carries the sentence once; nothing printed changes (layout and golden tests untouched and green).
- Given a relatório that prints the seed's eleven or has sections 8 and 10, then every text is as before.
- Given a CTA sheet as in Task 1 concluded with "Concluir e avançar", then no stale row and no "Substituir"; given a value changed after the conclude, then stale as before.
- Given Aprovado, Com restrições and empty Observações, then the header names "as observações", not "a conclusão".
- Given empty sheets, when "Gerar relatório" asks first, then it asks "Gerar com …?" and the button reads "Gerar mesmo assim".
