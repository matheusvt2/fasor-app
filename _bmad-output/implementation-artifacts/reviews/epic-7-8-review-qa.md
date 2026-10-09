# Epics 7 and 8: integrated review and human-style QA

- Date: 2026-09-28
- Scope: Epic 7 (Stories 7.1 to 7.5) and Epic 8 (Stories 8.1 to 8.6) on clean main `20b927a`. The PRs are #47 and #49 to #54.
- Stack: worktree tag `qa78`, port base 45, compose project `fasor-qa78`. `OCR_PROVIDER` and `LLM_PROVIDER` were both `fake`.
- Data: a QA company "QA 78" received the full Porto Seguro op log (3841 ops, 0 rejected), with its user as the fixture's responsible. A second company "QA 79" was created for the cross-tenant probes.
- Browser: the Playwright MCP browser at 1280, 768 and 390 px, in light and dark.
- Screenshots: 7 files under `reviews/qa-epic-7-8/`.
- No product code was changed. One untracked alias fixture was added and removed afterwards (see E78-Q2).

## Gate timings (host lock, one gate at a time)

| Stage | Result | Wall time | Notes |
| --- | --- | --- | --- |
| Stack build + `up -d` | ok | 12 s | cached layers |
| `docker compose --profile ocr build ocr` | ok | 2 s | fully cached; the image was not rebuilt from scratch |
| `pnpm verify` | **PASSED** | 1318 s (21.9 min) | lint 31.8 s, static 48.9 s, test:api 213.5 s (39 files, 233 tests), test:unit 179.7 s (208 files, 2279 tests), test:e2e 920.2 s (128/128: parallel 109 in 679 s, serial 19 in 237 s). Total 1313 s against a budget of 900 s. |
| `pnpm test:e2e:full` | **1 failed** | 1560 s (26 min) | 228 tests: 223 passed, 1 failed, 4 skipped. Parallel group 190 tests in 992 s, serial group 38 tests in 561 s. The one failure is `@p1` 7.3-E2E-001 (E78-Q1). |
| `pnpm test:e2e:matrix` | **PASSED** (retry) | 485 s (8.1 min) | 66 tests: 58 passed, 0 failed, 8 skipped (parallel 33 in 106 s, serial 33 in 351 s). The first attempt died after 32 s, before any test, on a network timeout downloading the pnpm 12.5.1 binary inside `tools` (worth a retro note: the gate depends on registry.npmjs.org at start). |
| `docker compose --profile ocr run --rm ocr pytest` | **16 passed** | 153 s | Same accuracy as PR #47: 43/43 words, 16/16 values, exact text 27/43, IoU 0.910 |

- Machine load stayed between 1 and 3.6 during the gates. The MCP browser pass overlapped `verify`'s e2e phase and `test:e2e:full`, which still went green apart from 7.3-E2E-001.
- 12.1-E2E-007 passed in every run where it appears: `ficha.spec.ts` (8.1 s) *(2026-10-09: that case is 12.1-E2E-011 since PR #116, TST-V2; 12.1-E2E-007 is now only the `lost-taps.durability.spec.ts` race)* and `lost-taps.durability.spec.ts` (14.5 s) in `test:e2e:full`, and durability-desktop-chrome and durability-android-chrome in the matrix (webkit skips it by design). The item "fails even on a quiet machine" was not reproduced.

## Known items: confirmed or refuted

| Item | Verdict | Evidence |
| --- | --- | --- |
| 7.3-E2E-001 fails; the Export dialog says "Parecer não preenchido" while the Sumário says "Nada impede gerar" | **Confirmed, two causes** (E78-Q1) | The test fails in `test:e2e:full`: no toast, and the error context shows the Sumário foot reading "Nada impede gerar." while the dialog shows the blocking row. The same state reproduces by hand on the full Porto Seguro fixture. Cause (a): the test never calls `setParecer`, which the spec file imports. Cause (b): the kernel. Both Porto Seguro fixtures have no section blocks. `preIssue` then emits `parecer_missing` (`pre-issue.ts:335`), but `sumarioRows` only builds rows from live section blocks and `generateReason(rows)` (`sumario.ts:274`) reads rows, so the blocker has no row. AD-2 identity still holds for the lists; what breaks is what the Sumário shows. A relatório made from the standard template has section rows and reads correctly: "Só Conclusão e parecer (linha 10) impede gerar." |
| The plate tile shows on every type, but the job reads only `transformador_forca`, so other types stay "Foto guardada…" forever | **Refuted** | `jobs/reading/job.ts:203-217` reads any block type that has a nameplate definition. On disjuntor DJ-ENEL the fixture plate produced 4 pending suggestions (identificação, fabricação, nº série, tipo). A photo with no fake fixture ends `failed` (PermanentReadingError), never stuck. The real gap is E78-Q2. |
| "Confirmar todos" skips the manufacturer that carries the create hint | **Confirmed, as designed** (E78-Q16, product question) | On TR-1, "Confirmar todos (8)" left Celtta, TAP (`verify`) and AT (replace) open. The toast said "8 campos confirmados — 1 campo pede verificação" and did not count the other two. |
| "Foto guardada…" shows while `queued` even online | **Confirmed by code** (E78-Q17) | `plate-photo.tsx` maps `queued` to that line whatever the connection. By hand the online window is under 2 s, because upload and `running` are fast. |
| A confirmed month-only date (`2024-08`) shows blank | **Confirmed, and wider** (E78-Q3) | After "Confirmar todos", the aria snapshot of Data fabricação reads `dd / mm / aaaa`, while the outbox holds `data_fabricacao = "2024-08"` with `source_suggestion_id`. "Copiar da última visita" hits the same wall: it writes `"07/2025"` and the field shows blank. The document prints "08/2024". |
| A second "Tentar novamente" may start a second run | **Confirmed** (E78-Q5) | Two taps 1.2 s apart gave two `POST /reread` answers, both 202. `reading_runs` holds 3 rows for the photo: the first read and 2 rereads. The button stays enabled after the POST resolves, until the next pull. |
| A reading whose last attempt dies stays `running` forever | **Confirmed by code** (E78-Q6) | `jobs/reading/worker.ts` has no dead-letter or expiry handler. pg-boss counts an expired attempt, but only the catch on the final attempt writes `failed`. This was not reproduced by hand. |
| 12.1-E2E-007 fails even on a quiet machine | **Not reproduced** | It passed in verify and in `test:e2e:full`, with load at 1 to 3. |

## Findings

| ID | Severity | Finding | Evidence | Suggested fix | Owner |
| --- | --- | --- | --- | --- | --- |
| E78-Q1 | medium | On a relatório with no section blocks (both Porto Seguro fixtures, and any legacy relatório), the Sumário hides every pre-issue row of sections 7 to 11, including the one blocker. The foot says "Nada impede gerar.", "N avisos — estão nas linhas do sumário" points at rows that do not exist, and "Ver no sumário" highlights nothing. 7.3-E2E-001 fails on this state, and also because it never sets the parecer. | Known items row 1. Full fixture: Sumário "Nada impede gerar."; dialog "Parecer não preenchido — seção 10 …" plus "13 avisos". `sumario.ts:195-250` and `:274`; `pre-issue.ts:333-337`. | Test: call `setParecer` before `generateRevision` in 7.3-E2E-001. Kernel: derive the foot reason and the foot button state from the blocking pre-issue rows, not from the Sumário rows; or render fallback rows 1 to 11 when a snapshot has no section blocks; or give the fixtures section blocks so AD-2 runs on the production shape. Add a Sumário/dialog agreement test on a section-less snapshot. | Epic 7 fix batch (G3 area) |
| E78-Q2 | medium | With the `fake` providers, a plate photographed or imported through the app can never be read. The device re-encodes every shot (`files/photo-encode.ts` `encodePhoto`), so `photo.sha256` never equals the fixture key. The fixture plate imported through the camera fallback became `6a22b700…`, not `a1eac910…`, and the job ended `failed` with "fake reading: no fixture". No batch ever ran the real job from the UI; the e2e seeds suggestions as server ops. | Outbox `file/{id}` create with `sha256 = 6a22b700…`; `reading_runs.error`. With an untracked alias fixture under that sha, the whole real path worked (running at seq 31170, done at 31184, 11 suggestions, one `reading_run` with `ocr_provider=fake`, `model=fake`, `prompt_version=fake-1`, zero usage, 30 ms). The alias was removed afterwards. | Give the fake provider a stable key the device cannot change, for example a dev-only default fixture or a lookup by image size plus a perceptual hash. Add one `@p1` e2e that imports the fixture plate through the fallback input and waits for suggestions from the real job. | Epic 8 fix batch |
| E78-Q3 | medium | `nameplate/data_fabricacao` is stored in two shapes, `YYYY-MM` from the reading job and `MM/YYYY` from the fixture and `last_nameplate`. The date field shows neither: the engineer sees an empty field that holds a value that will print. | Known items row 5. The TR-2 copy wrote `"07/2025"` and the field reads `dd/mm/aaaa`. The preview prints `08/2024` for TR-1. | One month-year shape normalized in the kernel (the parse module), and a field that accepts a partial date (month and year) or shows the stored text. | Epic 8 fix batch, with Epic 12 for the copy path |
| E78-Q4 | medium | "Copiar da última visita" writes a manufacturer that is missing from the company registry ("SIEMENS"). The Fabricação group then shows only "Outro…", with no value on screen, although the value is stored and prints. | TR-2 outbox `nameplate/fabricacao = "SIEMENS"`; the aria snapshot shows group "Fabricação" with only `button "Outro…"`; the company has 0 manufacturer rows. | Show the stored value as the "Outro…" text, or create the registry row in the same batch, as "Criar ⟨nome⟩?" does. | Epic 12 / Epic 8 fix batch |
| E78-Q5 | low (medium once a paid provider exists) | "Tentar novamente" stays enabled after its POST resolves and until the next pull, so every further tap sends one more reading run. | 2 POSTs answered 202, and 3 `reading_runs` rows for one photo. | Mark the photo running locally after a 202, or have the reread route refuse (409) while a job for `(photo, plate)` is queued or active. | Epic 8 fix batch |
| E78-Q6 | low | A reading whose last attempt dies (worker killed, 300 s expiry) stays `running` forever. This was already known. | `worker.ts`: no expiry or dead-letter handling. | A sweep or dead-letter worker that writes `failed` for expired final attempts. | Epic 8 fix batch |
| E78-Q7 | low | If the pg-boss send fails at file receipt, the photo stays `queued` with no remedy. `files.ts:190-208` only logs the error, the device shows "Foto guardada…" forever, and "Tentar novamente" is offered only on `failed`. | Code. | Write `failed` when the enqueue fails, or offer the reread action on a `queued` photo that is already uploaded. | Epic 8 fix batch |
| E78-Q8 | low | "Lendo…" stays up to the next 60 s sync tick even though the server finished in about 1 s. It was observed for 47 s on DJ-ENEL. | Polling log: `2s: Lendo… … 47s: Lendo…`, then 49 s: "4 sugestões lidas da foto 2". | Pull a few seconds after a reading photo's upload, or poll while any reading is `running`. | Epic 8 fix batch |
| E78-Q9 | medium | The parecer band shows two different "concluídas" counts. The suggestion line says "3 de 94 fichas concluídas" (`progress.sheets_concluded`, which counts não ensaiadas). The Critérios line says "0 concluídas" and the composed summary "91 ainda não concluídas". | Screenshot `01-parecer-band-1280.png`; `relatorio/parecer.ts:148` vs `:204`. | Use one kernel count, the composeParecer definition, in the hint too. | Epic 7 fix batch |
| E78-Q10 | low | Section 10's validity line prints the literal placeholder `[ART]` when the ART number is blank: "Este relatório tem validade apenas acompanhada da ART [ART]". | Rev. 1 PDF p.106. | Product call (question 3). | Epic 7 fix batch after the answer |
| E78-Q11 | low | The Parecer box can split across pages: in Rev. 1 its title and half its summary sit at the foot of p.105 and the rest on p.106. | Rasterized p.105 and p.106. | Mark the box table `cantSplit`, or keep it with the next paragraph. | Epic 7 fix batch |
| E78-Q12 | low | The pre-issue row "82 aguardando envio", the gallery header and the tiles ("Aguardando envio") read as if this device will send the photos. On an office device that never held them, the server simply lacks them. The gallery's static note "Os números são provisórios até a exportação" also sits beside the new "Números da revisão 1". | Export dialog and gallery text on the fixture relatório. | Wording by case, for example "82 fotos não estão no servidor" when the device holds none. Drop the static note once the kernel status line exists. | Epic 7 fix batch |
| E78-Q13 | low (a11y) | The "Criar Celtta?" button's accessible name is "Sugerido, Celtta, confirmar", which does not contain its visible label (WCAG 2.5.3, label in name). | Aria snapshot: `button "Sugerido, Celtta, confirmar": Criar Celtta?`. | Put the visible words in the name, for example "Criar Celtta?, sugerido". | Epic 8 fix batch |
| E78-Q14 | low | At 768 px the plate crop is a narrow strip, about 50 px wide inside the 670 px box, because the union of the value bboxes is tall and narrow, so the text is barely legible. At 390 px with 4 fields it reads well. | `04-flow2b-arrived-768.png` vs `05-suggestions-390-dark.png`. | Pad the crop to a minimum aspect ratio, or zoom to the width. | Epic 8 fix batch |
| E78-Q15 | info | In the Porto Seguro fixture, the transformer TTR "V PRIMÁRIO" is stored as raw `13200` with the seed unit kV, so it prints "13.200 kV". This is fixture data out of step with seed v1 (`TRANSFORMADOR_RATIO` is kV). VAL CALCULADO prints "-" because the secondary "380/220" does not parse, a rule from Epic 5. | Rev. 1 p.61. | Fix the fixture value (`13.2`), and decide on the dual-voltage secondary (question 5). | Epic 7 fix batch (fixture) |
| E78-Q16 | info | "Confirmar todos" skips the create-hint manufacturer and the replace field, and its toast counts only `verify` as skipped. | Known items row 3. | Product call (question 2). | — |
| E78-Q17 | info | "Foto guardada — leitura quando houver sinal" shows while `queued` whatever the connection. | Code. | The wording could read "Foto guardada — leitura na fila" when online. | Epic 8 fix batch |
| E78-Q18 | info | The gate budget is missed: verify took 1313 s against 900 s, and e2e alone took 920 s. | Gate table. | Retro item (see PR #53). | Retro |

Counts by severity: **high 0, medium 5** (Q1, Q2, Q3, Q4, Q9), **low 9** (Q5, Q6, Q7, Q8, Q10 to Q14; Q5 becomes medium once a paid provider exists), **info 4** (Q15 to Q18).

## Cross-batch lenses

- **AD-13 ownership: pass.** In the web diff since `2d87c52`, derived texts ("N leituras prontas para confirmar", "N fichas com sugestões por confirmar", "Confirmar todos (N)", the sync counts, the parecer hint and summary, the revision lines) come from `packages/domain`. `apps/web` filters stored `status === 'pending'` rows (a stored status, not a derived one) and composes only labels such as `plateTileLabel(n)` and `cropLabel`. One kernel inconsistency sits inside the kernel itself (E78-Q9).
- **Contract version 6: consistent.** `CONTRACT_VERSION = 6`, `MIN_CONTRACT_VERSION = 6`, and the history comments name 5 (Story 8.1) and 6 (Stories 7.4 and 7.5: `parecer`, `generation_job/started_at`). #52 and #54 add no op family. The reread route has its own contract (`contract/reading.ts`), and the OCR contract is separate and not versioned by design.
- **Suggestions never printed or counted before confirm: pass.**
  - The preview of the new relatório prints TR-1 with the typed "13,8 kV", not the pending "15". It prints DJ-ENEL's nameplate as "-" while 4 of its suggestions are pending.
  - Header counts: "0 de 94 fichas concluídas" and "1 sugestão por confirmar".
  - Sumário row 9: "1 ficha com sugestões por confirmar", then "2 fichas…" after DJ-ENEL.
  - The Export dialog counts that row in its "N avisos" summary, never blocking.
- **Cross-tenant: pass.** As QA 79, `GET /api/relatorios/{QA78 id}/preview.pdf` answers 404, `POST …/preview` 404, `GET /api/revisions/{id}/docx` 404, `POST /api/photos/{QA78 photo}/reread` 404 (the same body as an unknown id), and `GET /api/files/{id}/original` 404.
- **Committed ops, Flow 2b (outbox, not the screen):**
  - Capture: the `file/{id}` create carries `caption: "placa de identificação"`, `reading_kind: plate`, `reading_target: {block_id, block_type: transformador_forca}` and `reading_status: queued`.
  - "Confirmar todos (8)": one batch of 8 pairs, `suggestion/{id}/status = confirmed` plus the value put with `meta.source_suggestion_id`.
  - "Criar Celtta?" offline: one batch of `registry/manufacturer/{id}` create, status confirmed and `fabricacao = "Celtta"` with `source_suggestion_id`.
  - The `verify` TAP field, two keystrokes (Backspace, "3"): one batch of `tap_atual = "3"` plus status `discarded`.
  - The typed AT: the value stays "13,8" with the line "Sugerido: 15 kV — Substituir".
  - Server: `file/{id}/reading_status` running, then done, both by `system:reading`, and 11 pending `suggestion` rows. Celtta carries `hint.create_registry_entry`, and `tap_atual` is `verify` with "5" against the plate's "3".

## Per-AC results

Widths: 1280 px (light), 768 px (light), 390 px (dark). The visual surfaces were checked at each width. At 390 px, no element of the dialog or the nameplate group overflows the viewport (0 elements beyond `clientWidth`; section gutters 16 px).

| Story · AC | Result | Evidence |
| --- | --- | --- |
| 7.1 AC1 groupForPrint, subsections, titles | pass | Rev. 1 PDF: 9.1 Cubículo Enel (grouping off), 9.2 to 9.5 of the 1° Subsolo in fixed order ending "Transformadores e Cabos de Alimentação do 1° Subsolo", 9.6 to 9.8 by cabine, 9.9 to 9.11 "… dos Geradores". The kernel test exists (`group-for-print.test.ts`). |
| 7.1 AC2 sheet content | pass-with | Title type plus TAG, the attribution line, native tables (612 `w:tbl`), the insulation grid with "-" elsewhere, instrument header plus `CRITÉRIO` line, the Conclusão row. With: fixture data issue E78-Q15; the ÍNDICE lists sections only (known narrowing). |
| 7.1 AC3 renderer snapshot plus row 9 from preIssue | pass | Golden test in `test:api` (green); the row 9 text comes from preIssue. |
| 7.2 AC1 section 7 | pass | p.7 onwards: two per row, "Imagem NN: caption.", stamp "10/09/2026 09:00", placeholders for photos the server lacks. |
| 7.2 AC2 photos in their sheet | pass (by test) | The fixture photos have no bytes; `generate.integration.test.ts` embeds a real `print` variant. |
| 7.2 AC3 provisional again after an edit | pass | Gallery: "Números da revisão 1", then after a caption edit "Números provisórios — serão definidos na revisão 2". Sumário banner: "Relatório emitido em 28/09 (revisão 1). Alterações geram a revisão 2." |
| 7.3 AC1 section 8 | pass-with | Manual bullets, then the not-tested entries (the fixture's stored `not_tested` points; not duplicated by derived ones). With: the bullets say "nesta seccionadora" without the TAG (question 6). Token resolution is covered by 7.3-E2E-001 once fixed and by unit tests. |
| 7.3 AC2 section 11 | pass | p.106: three "Certificado não anexado: …" placeholder lines, plus the pre-issue warning; rasterization is covered by `section-11.test.ts` and job tests. |
| 7.4 AC1 parecer band | pass-with | radiogroup with nothing preselected, the amber hint "Apto com restrições?", one tap to write it, the Generated text with its Critérios line, Confirmar and Editar, the box toned only once set. With: E78-Q9; "Substituir" did not show in this state (Story 5.8 shows it only on stale text). |
| 7.4 AC2 section 10 | pass-with | Box title "Apto com restrições", the confirmed summary, 3 bullets, the validity line, "Quality Assurance / Eng. Eletricista / CREA SP 7878", no image. With: E78-Q10, E78-Q11. |
| 7.5 AC1 preIssue, Sumário, Export dialog, AD-2 | **fail** on section-less relatórios (E78-Q1); pass on template relatórios | On a template relatório: one blocking row in red with "Editar em Dados do relatório" (it opens Etapa 6 and "Voltar para Gerar relatório" returns), "Gerar relatório" `aria-disabled="true"` with the reason "Preencha o parecer (linha 10 do sumário) para emitir a revisão 1…", and "Ver no sumário" highlights 4 rows. The AD-2 golden test is green. |
| 7.5 AC2 dialog content | pass-with | The fact line on grouping, the `dl` document control, "DOCX — abrir no Word", the Revisões list (Rev. 2 and Rev. 1, number, date and who), failure path covered by unit tests. With: DOCX glyph only (coordinator conflict 4, the PDF row is Epic 11's); the share button was not exercised (desktop). |
| 7.5 AC3 preview | pass | "Gerando rascunho…", then a new tab `preview.pdf?v=…` (68 s and 74 s under gate load), RASCUNHO on p.1, "Revisão do documento —", status unchanged; the draft-equals-issued test `7.5-UNIT` exists. |
| 7.5 AC4 last_nameplate and Emitido | pass-with | 81 `equipment/{id}/last_nameplate` ops by `system:generate` in the issue commit; `relatorio/status = emitido` by the user; "Copiar da última visita (TR-2)" on the next relatório copied 11 values. With: E78-Q3 and E78-Q4 (two copied values invisible). SM-C1 is logged per issue, not stored (open question of G3). |
| 8.1 AC1 entity, cell provenance, snapshot, ignored unless confirmed | pass | The outbox value puts carry `meta.source_suggestion_id`; the preview prints no pending value; counts as in the lenses above. |
| 8.1 AC2 field states, crop, Confirmar, typing, Confirmar todos | pass-with | Amber plus "Sugerido", dashed plus "Verificar", the 48 px crop with the region, confirmed 24 px glyph ("Ver recorte da placa — …"), typing discards one field; the label is "Confirmar todos (N)", not "Confirmar 7" (open question E12-A5). The field name reads "Sugerido, 240815-07, confirmar" and the crop alt is "Recorte da placa". With: E78-Q13. |
| 8.1 AC3 compare on arrival | pass | The typed AT "13,8" is kept with "Sugerido: 15 kV — Substituir". The auto-confirm on an equal value is covered by 8.1-E2E. |
| 8.1 AC4 Sumário and sync counts | pass | "1 sugestão por confirmar", "0 de 94 fichas concluídas", Sync "Leituras: 11 sugestões por confirmar". |
| 8.2 AC1 single shot, queued line, fields typeable | pass-with | Offline shot: gallery "Nº provisório 1", "Foto guardada — leitura quando houver sinal", the typed field kept. With: no "Digitar" (source-deltas D-6), E78-Q17. The shot went through the camera fallback input (no camera in the MCP browser). |
| 8.2 AC2 reading photos upload first | pass (by test) | Not observable by hand with one photo; covered by the uploader tests. |
| 8.2 AC3 arrival toast, banner, sync counts | pass | Toast "1 leitura pronta para confirmar" with "Ver", which opened TR-1; banner "Sugestões prontas — 11 campos para confirmar"; Sync "Leituras" section. |
| 8.2 AC4 failed reading | pass-with | "Não foi possível ler", "Tentar novamente" (disabled offline) and "Preencher manualmente" (focuses the first field); photo kept, nothing written. With: E78-Q5, E78-Q7. |
| 8.3 AC1 contract and sidecar | pass | pytest 16/16; schema drift test in test:unit green. |
| 8.3 AC2 image, profile, health, fixture accuracy | pass-with | Image built (cached), 43/43 words; exact text 27/43 with PARSeq (open question of #47). |
| 8.4 AC1 receipt, running, job, suggestions | pass-with | running and then done by `system:reading`, 11 suggestions. With: E78-Q2 (unreachable from the UI under `fake`), E78-Q6, E78-Q7, E78-Q8. |
| 8.4 AC2 reading_run row | pass | The row has `ocr_provider=fake`, `model=fake`, `prompt_version=fake-1`, `llm_usage` zeros, 43 tokens and `duration_ms`; each reread adds a row. |
| 8.4 AC3 provider slots | pass (by code) | `providers/unimplemented.ts`; no subscription credential read. |
| 8.4 AC4 fake outcomes | pass (by test) | error and timeout images in the fixtures, covered in `job.integration.test.ts`. A missing fixture ends `failed` permanently (seen by hand). |
| 8.5 AC1 digit coverage | pass | `tap_atual` "5" against the plate's "3": `verify`. The kernel three-case test exists. |
| 8.5 AC2 registries | pass | Celtta `suggested` with a hint, "Criar Celtta?" offline in one batch; on the next plate (DJ-ENEL) Celtta was a plain "Confirmar". The voltage-class `verify` case is covered by a kernel test. |
| 8.5 AC3 verify skipped and confirmed by its own tap | pass | Skipped by "Confirmar todos (8)"; fixed with 2 keystrokes. |
| 8.6 AC1 crop above, focused region, Confirmar todos count | pass-with | `.plate-crop` with one `.region` for the focused field; "Confirmar todos (8)". With: E78-Q14; only the focused region is drawn (narrowing). |
| 8.6 AC2 Flow 2b | pass-with | Walked with the real job (via the alias of E78-Q2): 8 grounded fields, not 7 (narrowing: 9 grounded, 1 typed first), the replace line kept, Criar Celtta offline, verify in 2 keystrokes, batches as in Story 8.1. |
| 8.6 AC3 pre-issue row | pass | Sumário row 9 "1 ficha com sugestões por confirmar", then "2 fichas…"; counted in the dialog's avisos, never blocking. |

## Open product questions for Matheus

1. May a Rascunho relatório generate a revision (Epic 4 item 25)? The QA's new relatório was Rascunho and offered Gerar, blocked only by the parecer.
2. Should "Confirmar todos" take the create-hint manufacturer (creating the registry row in the same batch)? And should its toast name every field it left open, not only `verify`?
3. With a blank ART number, should section 10 print `[ART]`, "ART —", or leave the line out? Today it prints `[ART]`.
4. The parecer suggestion appears with 91 of 94 sheets open ("Apto com restrições?"). Should the suggestion wait until every sheet is concluded or not tested?
5. Transformer TTR with a dual secondary ("380/220"): which voltage does VAL CALCULADO use? Today it prints "-".
6. Section 8 not-tested bullets from stored points say "nesta seccionadora" without the TAG. Should the renderer prefix the TAG?
7. Keep PARSeq (exact text 27/43) or switch to PP-OCRv5 recognition (43/43 in #47's scratch run)?
8. Carried from the batches, still open: the plate tile on types other than the transformer (E78 refutes "stuck", so this is only a product call: keep it on every type?); who writes `feeds_block_id` (every alimentação cable of a new relatório prints unpaired); SM-C1 logged versus stored.

## Dated narrowings that still need a line in `epics.md`

None of these has a dated line under its story yet: the Epic 7 and 8 story sections carry only the 2026-09-21 CI strike in 8.3.

- **7.1** (#50, 2026-09-26):
  - `unpaired_cable` warnings are not surfaced as a pre-issue or Export row.
  - No UI writes `feeds_block_id`.
  - The printed ÍNDICE lists sections only.
  - Não ensaiada sheets print no photos.
  - TP/TC pairing is ordinal inside a location with no colunas.
  - "Cubículos de MT", not "de Média Tensão".
  - The attribution wording is authored.
- **7.2** (#51, 2026-09-26):
  - The photo sort key is `(captured_at, local_seq, id)` over files (source-deltas row 14), not `(captured_at, device_id, local_seq)`.
  - A photo the server lacks keeps its number and prints a placeholder.
- **7.3** (#51):
  - Stored `not_tested` points are not merged into groups.
  - A point's action prints after its text in the same bullet.
  - A certificate PDF over 20 pages prints the placeholder.
  - An empty registry `cert_number` is not a mismatch.
- **7.4** (#51):
  - "Substituir" is the Story 5.8 behavior, not the mock's `parecer-own` field.
  - A Reprovado sheet gives no parecer suggestion.
  - A stale confirmed parecer text still prints.
- **7.5** (#51):
  - The Revisões list shows the DOCX glyph only (the PDF row is Epic 11's).
  - `parecer_missing` blocks only while section 10 prints.
  - SM-C1 is logged per issue, not stored.
  - The highlight look of "Ver no sumário" is authored.
  - The preview's revision row prints "—".
- **8.1** (#49):
  - The label is "Confirmar todos (N)", not "Confirmar N".
  - The device derives the replace view and never writes `mode`.
  - "Reachable until export" means until Emitido; no auto-confirm on an Emitido relatório.
  - Confirmar on an edited guess writes the typed value and discards the suggestion.
  - Home and Project cards count without pending rows.
- **8.2** (#54):
  - There is no "Digitar" (D-6).
  - "Typing excludes the field" is read as the replace view.
  - The queued line shows whatever the connection.
  - The counts sit in the Sync "Leituras" section.
  - Suggestions are seeded as server ops in e2e.
- **8.3** (#47):
  - PARSeq has no accents and no case for units; tests compare accent- and case-insensitive.
  - The image uses `opencv-contrib-python`.
  - Sidecar build and test stay outside verify.
- **8.4** (#52):
  - Only `plate` readings run; other kinds stay `queued` and reread answers 400.
  - Only the reading orients its copy; thumb and print are not auto-oriented.
- **8.5** (#52, 2026-09-27 coordinator):
  - "Confirmar todos" takes the grounded `suggested` fields without a hint: 9 on the fixture.
  - Celtta and `tap_atual` confirm by their own tap.
- **8.6** (#54):
  - Seven grounded fields become nine; the e2e shows 8 because AT is typed first.
  - Only the focused field's region is drawn.

## Notes for the fix batch

- To walk Flow 2b with the real job until E78-Q2 is fixed: import `services/ocr/tests/fixtures/plate-transformador.jpg` through the camera fallback (Chromium has no camera, and `getUserMedia` must reject so the fallback input opens). Read the new photo's `sha256` from the outbox, then copy `apps/api/src/jobs/reading/fixtures/a1eac….json` to `<that sha>.json`. In this Chromium the sha was `6a22b700bf89811ec592a5accd468be4101723d65707b7f1885c5dc95616b537`.
- The seed script used for the QA company is not committed; it applied `portoSeguro.log` remapped to a new company, as `porto-seguro.integration.test.ts` does, with `seedUser(userId = fixture USER_ID)`.

## Re-check (PR #55)

- Date: 2026-09-28
- Code: origin/main `89c24ee`
- Stack: rebuilt with the same tag `qa78` and port base 45, on fresh volumes
- Data: the QA 78 and QA 79 companies were seeded again with the full Porto Seguro fixture
- Browser: a fresh store and session in the Playwright MCP browser, at 1280, 768 and 390 px (390 in dark)
- No alias fixture was used anywhere

### Targeted specs (host lock, no full gates)

| Run | Result | Wall time |
| --- | --- | --- |
| Unit specs:<br>`parecer`, `sumario`, `engine`, `plate-photo`, `suggestions-plate`, `datetime`, `nameplate-copy`, `photo-store` | 8 files, 135 tests, all passed | 11 s |
| Api specs:<br>`reading.integration`, `job.integration`, `files-reading.integration`, `docx-section-10`, `fake.test` | 6 files, 46 tests, all passed | 70 s |
| E2E grep:<br>`E78-Q`, 7.3-E2E-001, 7.5-E2E-006, 8.4-E2E-001, ~~8.1-E2E-005~~ 8.1-E2E-010 *(2026-10-09: renumbered by PR #116, TST-V2)*, 8.2-E2E-002, 8.6-E2E-001, 8.6-E2E-003 | 8 of 8 passed: parallel 6, serial 2 | 112 s |

### Per finding

| ID | Result | Evidence |
| --- | --- | --- |
| E78-Q1 | **pass** | Full Porto Seguro fixture, no section blocks, no parecer:<br>- The Sumário draws rows 1 to 11. Row 10 reads "Parecer não preenchido", and the foot reads "Só Conclusão e parecer (linha 10) impede gerar."<br>- In the dialog, the blocking row is the same, "Gerar relatório" is `aria-disabled="true"`, and the reason reads "Preencha o parecer (linha 10 do sumário)…".<br>- "Ver no sumário" highlights rows capa, controle, 8, 9 and 11.<br>After the parecer was set and confirmed:<br>- Row 10 reads "Apto com restrições" and the foot reads "Nada impede gerar."<br>- The dialog shows no blocking row, the button is enabled, and Rev. 1 was issued in 23 s.<br>7.3-E2E-001 and 7.5-E2E-006 are green. |
| E78-Q2 | **pass** | Chain, with the camera fallback on a new relatório:<br>1. On TR-1, AT was typed first ("13,8").<br>2. "Fotografar placa" took `plate-transformador.jpg` online.<br>3. The device re-encoded it to sha `6a22b700…`; there is no fixture for that sha.<br>4. The job ran on the fallback: 1 `reading_run` with outcome ok, `reading_status` done, 11 pending suggestions (10 `suggested`, 1 `verify`).<br>5. The toast "1 leitura pronta para confirmar" and the banner "Sugestões prontas — 11 campos para confirmar" came about 1 s after the upload, with no manual sync.<br>On disjuntor DJ-ENEL, the same plate ended `failed` at its first attempt: 1 run per request.<br>8.4-E2E-001 is green. Screenshot: `qa-epic-7-8/R2-q2-q14-crop-768.png`. |
| E78-Q3 | **pass** | - TR-1: the confirmed `2024-08` shows "08/2024" in the Data fabricação textbox.<br>- TR-2: "Copiar da última visita" stored `data_fabricacao = "2025-07"` (canonical) and shows "07/2025". |
| E78-Q4 | **pass** | The TR-2 copy shows "SIEMENS" in the Fabricação group, with "Criar SIEMENS?" beside it. |
| E78-Q5 | **pass** | On DJ-ENEL (failed), I tapped "Tentar novamente" three times:<br>- The button was `aria-disabled` from the first tap.<br>- Exactly 1 `POST /reread` was sent, answered 202.<br>- `reading_runs` holds 2 rows for the photo: the first read and one reread.<br>- The button was enabled again after the next `failed` op.<br>The 409 `reading_running` is covered by `reading.integration` (green). |
| E78-Q6 | pass (by test) | The dead-letter tests in `job.integration` are green. Not reproduced by hand. |
| E78-Q7 | pass (by test) | Both E78-Q7 tests in `files-reading.integration` are green. |
| E78-Q8 | **pass** | No "Lendo…" window was visible: suggestions arrived within about 1 s of upload without a tap on "Sincronizar agora" (it was 47 s before). `engine.test` E78-Q8 is green. |
| E78-Q9 | **pass** | The hint now reads "0 de 94 fichas concluídas", the same as the Critérios line "0 concluídas" and the summary "91 ainda não concluídas". See E78-R2 for the header. |
| E78-Q11 | **pass** | Re-rendered Rev. 1 PDF (106 pages): the "10 CONCLUSÃO…" heading and the whole Parecer box moved together to p.106, and p.105 ends with the TC-GER6 sheet. Screenshot: `qa-epic-7-8/R1-q11-section10-page106.png`. |
| E78-Q13 | **pass** | The accessible name is `button "Criar Celtta?, sugerido"`. |
| E78-Q14 | **pass-with** | - The crop is no longer a sliver: the view is 297 px wide (the whole plate width) in a 657 px box at 768 px, and fills the box at 390 px. 8.6-E2E-003 is green.<br>- With: E78-R1.<br>Screenshots: `R2-q2-q14-crop-768.png` and `R3-q14-crop-390-dark.png`. |

### New findings

| ID | Severity | Finding | Evidence | Suggested fix | Owner |
| --- | --- | --- | --- | --- | --- |
| E78-R1 | low | The widened crop scales the plate text to about 7 px. The focused field's `.region` is then about 38 × 5.4 px with a 2 px border, so it covers the very value it points at. Examples: Nº série at 768 px, and the TAP "3" at 390 px dark. At 768 and 1280 px the crop is also only 297 px wide inside a 657 or 864 px box. | `R2-q2-q14-crop-768.png`, `R3-q14-crop-390-dark.png`. Measured `.region` 38 × 5.4 px, border `2px solid`, and the same size at 390, 768 and 1280 px. | Draw the region as an outline outside the bbox with a minimum height (for example `outline-offset` and at least 12 px), or zoom the crop to the focused field while one is focused. | Epic 8 (next batch) |
| E78-R2 | info | The Sumário header says "3 de 94 fichas concluídas" (`progress.sheets_concluded`, which counts não ensaiadas), while the parecer band now says "0 de 94 fichas concluídas". Both appear on relatório surfaces with different meanings. | Sumário header vs the Etapa 6 hint on the fixture. | Product wording: "3 de 94 fichas fechadas" in the header, or one definition everywhere. | Matheus / Epic 7 |

**Re-check summary:**
- 12 of 12 in-scope findings pass. Q6 and Q7 pass by test; Q14 passes with E78-R1.
- New: E78-R1 (low) and E78-R2 (info).
- Screenshots added: `R1-q11-section10-page106.png`, `R2-q2-q14-crop-768.png`, `R3-q14-crop-390-dark.png`.
