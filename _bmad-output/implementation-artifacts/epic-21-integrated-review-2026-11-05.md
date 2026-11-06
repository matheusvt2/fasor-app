# Epic 21 integrated review and QA, 2026-11-05

Two passes, per playbook § 9 (E20-A4 P-1): a behavior pass in a real browser, then a code read of the patched-not-re-reviewed union with the edge-case and verification-gap lenses.

## What was tested

- **Head.** main `fdc19924` (merge of PR #255 over PR #254). The worktree was detached at it, with `git log -1` = `fdc19924`.
- **Stack.** Compose project `fasor-e21q`, port base 57: web `:57073`, api `:57030`, postgres `:57032`, minio `:57090`. Images `app-api-e21q` and `app-tools-e21q` are retagged from the shared images. Services are postgres, minio, install, api and web, with no caddy. `LLM_PROVIDER` and `OCR_PROVIDER` are `fake`.
- **Seed and login.** Seeded with `seed-users.ts --test`, then logged in as `a@teste.local` (Empresa A).
- **Data.** The relatório was made through the UI: Novo relatório, then cliente "Cliente QA E21", obra "Obra QA", from the standard template. It got 94 blocks. Relatório and blocks are on seed `v11`.
- **Browser.** Playwright MCP, at 390 x 844, 768 x 1024 and 1280 x 900.
- **Not run.** No host lock was taken. No Playwright suite and no `pnpm verify`/`test:e2e*` ran; the coordinator's gate covers those. No Vitest run was needed: every claim below was checked by reading the code or in the browser.
- **Documents.** Revision 1 was generated, and its PDF and DOCX downloaded through the Export dialog. A draft preview PDF was also fetched with the session cookie. Text came out with `pdftotext` and from `word/document.xml`.
- **Screenshots** (4, under the main checkout's `.playwright-mcp/`):
  - `e21q-01-yyn0-390.png`: the ratio card at 390 on Yyn0.
  - `e21q-02-menu-first-1280.png`: the first Geral tile's Overflow, with Subir disabled.
  - `e21q-03-menu-390.png`: the Overflow at 390.
  - `e21q-04-select-390.png`: the LIGAÇÃO SECUNDÁRIA select at 390.

## Behavior pass

### Story 21.1: the ratio follows the vector group

| AC | 1280 | 768 | 390 | Evidence |
|---|---|---|---|---|
| v11 LIGAÇÃO SECUNDÁRIA is a select of the 47 codes, in manual order, label unchanged | pass | pass | pass | 48 options ("Selecione" + 47, Dd0 ... YNzn11, matches `VECTOR_GROUP_CODES`). The field fits at 390 and 768, with no horizontal scroll. |
| Yyn0, 13,8 kV / 380 V: VAL CALCULADO 36,32, 36,3 SATISFATÓRIO, pairs H1-H3 / X1-X3, H2-H1 / X2-X1, H3-H2 / X3-X2 on screen | pass | pass | pass | Table headers at 1280 and 768. The 390 card labels read "H1-H3 / X1-X3 (medido)" and so on. The input accessible names are the pairs. The helper reads "Calculado: U1 / U2". |
| Same transformer, Dyn1: 62,90 and today's pairs | pass | - | - | 62,90, H1-H3 / X1-X0 ..., helper "Calculado: U1 · √3 / U2" |
| Per-factor checks (kernel test covers all 47) | pass | - | - | Yd1 gives 31,45 with the shorted leads "H1-(H3+H2) / X1-X2" ... and the short helper "Curto-circuitar H3-H2 na fase A, H1-H3 na B e H2-H1 na C". YNd11 gives 20,97 with "U1 / (U2 · √3)". Dy3 gives 41,93 with "2 · U1 / (√3 · U2)". All are arithmetically right. |
| v11 empty group: no VAL CALCULADO and no CONDIÇÕES, captures typeable, one helper, row counted incomplete | pass | - | - | VAL CALCULADO "—", condição "—", helper "Informe a LIGAÇÃO SECUNDÁRIA na placa para calcular". Captures were typed and committed. The Ensaios stepper read 4 missing with no group and 3 with Yyn0, so the group counts 1. Clearing the select back to "Selecione" returns to this state. See N-1 on the headers. |
| Print: section 9 headers follow the group | pass | n/a | n/a | Rev. 1 PDF and DOCX: TR-1 (Yyn0) prints "H1-H3 / X1-X3", "H2-H1 / X2-X1", "H3-H2 / X3-X2" and 36,32 SATISFATÓRIO. TR-2 (Dyn1, from the plate) prints the X0 pairs and 68,37. |
| v9/v10 retroactive parse, staleness line | not walked | | | No v9/v10 relatório can be made through the UI on this seed. Covered by 21.1-E2E-002 (`seed-v11.spec.ts`) and `readings.test.ts`, which tests v9 and v10 with "YYN0", "yy0" and "Y/yn0", and with null, "", "Y", "DYN" and "estrela-estrela". Read in code: `ratioGroupOf`. |

### Story 21.2: the plate reading identifies the vector group

| AC | 1280 | 768 | 390 | Evidence |
|---|---|---|---|---|
| Printed Dyn1 is suggested and accepted with the other fields; the ratio uses √3 | pass | n/a | n/a | "Fotografar placa" on TR-2 with an imported plate. The fake replays the transformer's default fixture, because the device re-encodes the photo; this is the known narrowing. The LIGAÇÃO SECUNDÁRIA suggestion "Dyn1" has `trust: suggested` and one cited token. "Confirmar todos (9)" set the select to Dyn1, and VAL CALCULADO = 15 000 / 380 · √3 = 68,37, with the √3 helper. |
| Drawn Yyn0 is `verify` with "Lido do diagrama — confira", never auto-accepted, k = 1 after confirm | not walkable | | | The fake replays the drawn fixture only for its own bytes, and an import is re-encoded (PR #255 narrowing). Covered by 21.2-E2E-001, which seeds the suggestion, and by `job.integration.test.ts`. In code, `buildReadingSuggestions` forces `verify` and `ocr_token_ids: []` when no cited run prints a group, and `plateSuggestionNoteText` keys on the empty token list. |
| Unmapped value ("Y"): on v11 empty, on v9/v10 offered as text | code only | | | Dropped `invalid_shape` on v11 (narrowing O-3; see N-5). |
| Paid eval run | n/a | | | A "before the deploy" item for Matheus. Not run (paid). |

### Story 21.3: move a photo up or down in section 7

**Setup.** One plate photo on TR-2, plus five Geral imports with file dates 09:10, 09:20, 09:30, 09:40 and 09:50.

| AC | 1280 | 768 | 390 | Evidence |
|---|---|---|---|---|
| Overflow "Mais opções de Foto N" with Subir and Descer on Geral tiles; none on a sheet photo | pass | pass | pass | The plate photo tile shows only "Legendar". |
| Subir disabled on the first, Descer on the last | pass | pass | pass | `aria-disabled="true"`, drawn at opacity .4 (screenshot 02). |
| Move photo 4 up twice gives 1, 4, 2, 3, 5, numbered 1 to 5, section 9 number unchanged | pass | pass | pass | At 1280, two Subir gave 09:10, 09:40, 09:20, 09:30, 09:50. The plate photo stayed 6. The status read "Foto movida: 3 de 5 na seção 7" then "2 de 5". Focus came back to the tile's own trigger ("Mais opções de Foto 2"). One `file/{id}/order_key` put per move was in the outbox ("t0mw3ip", then "t0mw3ic"). At 768 a Subir and at 390 a Descer each moved the 09:50 photo, with the right status and focus and no horizontal scroll. |
| Persistence through a reload, a second device and a later photo landing last | pass | pass | - | After a reload the order held. A second browser context at 768, logged in as the same user, showed the same order after its pull. The import "foto6" (10:00) landed 6th and last after the Descer-to-last move. The plate photo became 7. |
| Section 8 "conforme Imagem 3" follows the photo to place 5 | pass | - | - | A point was made with the photo picker on "Imagem 3"; the picker is in gallery order, Imagem 1 to 7. The 09:20 photo then took two Descer to place 5. The point list then read "Imagem 5", and the Rev. 1 PDF prints "... (faz parte do PIE), conforme Imagem 5." with the action-plan column "5". |
| DOCX/PDF section 7 order matches the gallery | pass | n/a | n/a | Captions were set per photo. Rev. 1 PDF and DOCX both read: Imagem 1 09h10, 2 09h40, 3 09h30, 4 09h50, 5 09h20, 6 10h00, then Imagem 7 (the plate photo) in section 9. |
| Two devices moving the same photo offline converge with no conflict dialog | pass | pass | - | Both contexts went offline. Device 1 (1280) did Subir twice on the 09:30 photo; device 2 (768) did Descer once. Back online, with "Sincronizar agora" on both, both galleries show the same order (09:30 first) and no dialog opened. |

**Behavior pass verdict.** Every walkable AC passes at every width it applies to. The drawn-diagram path of 21.2 and the v9/v10 path of 21.1 cannot be walked through the UI on this seed and fake provider; the specs named above cover them. No console error appeared beyond the pre-login `401 /api/account`.

## Code-read pass (second pass)

Reviewed `git diff f149fedd..fdc19924`. It concentrated on the union of the "patched, not re-reviewed" items:
- e21r `bcc23270`: the parser's IGNORED set, `printedVectorGroups`, and the plate-off missing count.
- e21p `7a8b5725`: the picker order, the `order_key` regex, and the WebKit skip.
- The merge `aa580eb2` and `798d0767`.

It also covered the five areas the brief named:

- **Kernel table vs the research note.** The 47 rows in `vector-group.test.ts` `RESEARCH_ROWS` are byte-identical to `research.md` § The table (checked by diff). The test asserts `toEqual` against `VECTOR_GROUPS` row by row, so pairs, shorts, k and row number all match. The four flagged groups (Dyn3, Dy3, Dyn9, Dy9) ship as transcribed.
- **Parser.** It is greedy on the HV letters, with an LV fallback, and the clock must be 0 to 11. "DYN1", "YYN0", "YNy0", "Y/yn0" and "(Dyn1)" parse. "LIG:Dyn1", "Y", "DYN" and "Dyn1/Yyn0" read null. No two codes collide case-insensitively, so the `selectOptionFor` case-insensitive branch cannot pick the wrong option.
- **v9/v10 retroactive.** `ratioGroupOf` gives the parsed group, else Dyn1 with `assumed` (helper), on `sqrt3` tables only. v1 to v8, TP and TC have no `ratio_factor`, so they keep U1/U2. Empty or unparsed text keeps √3 and the Dyn1 pairs, as O-1 says.
- **`order_key` op validation and fold.**
  - `FILE_FIELDS` gains the key, and the value-limits cap is the medium `orderKey`.
  - The `photoFileRowSchema` regex `^[0-9a-z]*[1-9a-z]$` refuses a forged "0" or "a0". Minted keys never end in "0" (`between` always appends a non-zero digit, and the JSON guard appends "m").
  - `applyOp` ignores the field on a non-photo file.
  - The keys `geralPhotoMoveKey` mints stay strictly inside their bounds: the end-of-list sentinel `captureCeilingAbove(top)` is always above the top key. Moving the last photo up keeps `others` sorted although the moved row's own key may exceed the sentinel.
  - Capture keys are `t` + 9 + 8 base36 digits; moved keys are compared in the same space.
  - These were traced by hand on the real keys from the session: "t0mw3ic", "t0mw3iy", "t0mw3iwnk0i".
- **Contract 30 / MIN 30.** There is one bump, with both batches' paragraphs under 30. The contract test and the sync integration test assert 30/30 and 426 for 29. The reasoning holds: a 29 bundle cannot resolve v11 and cannot parse the put.
- **Two-device merge.** The put is last-writer-wins per field, so the same photo moved on two devices converges, which the browser confirmed. Two photos minted to one key tie by id. The known deferred row (Subir right below a run of equal keys) stays as recorded.

Other consumers of capture order: `livePhotos` readers in the api (`loadPhotoImages`, `job.ts`, pre-issue counts, Sumário) are order-independent. The snapshot's `byOrderKeyThenId` file sort is order-independent for every consumer found (`relatorio-tree.tsx` awaiting rows, `oil-rule.ts`, `points/checks.ts`, `print/revisions.ts`).

**Second pass: no blocker or should-fix found. 5 notes** (N-1 to N-5 below), each checked against the code.

## Findings

| id | severity | story | file:line | failure scenario | suggested fix |
|---|---|---|---|---|---|
| N-1 | note | 21.1 | `packages/domain/src/relatorio/reading-evaluation.ts:174-178` (`labelOf` returns `column.label` when `group === null`); `packages/domain/src/seed/v11.ts:12-13` | A v11 transformer with no LIGAÇÃO SECUNDÁRIA chosen shows and prints the seed's Dyn1 pairs ("H1-H3 / X1-X0" ...) as the capture headers. This was seen on screen and in the Rev. 1 PDF for TR-3 to TR-5. An intern who measures before choosing the group is shown the Dyn1 terminals on a star-star unit. The helper asks for the group, the row counts one missing, and the pre-issue check warns but does not block, so the risk is limited. | While `groupMissing`, render neutral headers ("Fase A / B / C", authored), or keep the seed labels and say so in the helper. Decision for Matheus or Bruno. |
| N-2 | note | 21.1 | `packages/domain/src/relatorio/vector-group.ts:200`; `reading-evaluation.ts:304` | On v9/v10 an *empty* LIGAÇÃO SECUNDÁRIA shows "Ligação não reconhecida: calculado como Dyn1". The field is empty, not unrecognized, and empty is the common case on old sheets. | A second authored line for the empty case ("Ligação secundária em branco: calculado como Dyn1"), or "Ligação não informada ou não reconhecida". Copy decision. |
| N-3 | note | 21.3 | `apps/web/src/copy/pt-br.ts:969-970` ("Ordem cronológica de captura") | The gallery note still says capture order while Geral photos can now be moved. This is already listed as an open question in PR #254. | Bruno or Matheus to reword; recorded here so it is not lost. |
| N-4 | note | 21.3 | `packages/domain/src/photos/order.ts:171-182` (`geralPhotoMoveKey` end bound) | A photo moved down to last place takes a key just above its new upper neighbour's capture instant, not its own. An *import* whose EXIF time falls between that neighbour and the photo's original time now sorts after it, though it sorted before it before the move. This is consistent with the coordinator's reading ("a new photo lands last"; an import keeps its capture-order place among unmoved photos) and is not a bug. It is listed so Bruno is not surprised. | None; mention in the release note for Bruno if imports from WhatsApp arrive after reordering. |
| N-5 | note | 21.2 | `packages/domain/src/reading/build.ts:96-99` (unmapped select value dropped `invalid_shape`) | On v11 a plate whose LIGAÇÃO SECUNDÁRIA the model reads as something unmapped ("Y") leaves the field empty with no tray and no note. The technician learns only from the ratio helper. The AC asked for "empty with the verify state", narrowed as O-3 in PR #255. | Accept the narrowing, or later add a verify-state suggestion with an empty value and a note. A product decision; no change needed for the deploy. |

**Deploy blockers: none.** No finding should block the deploy. The open "before the deploy" item from PR #255 is unchanged: Matheus runs `bedrock-eval.ts` with `bedrock-structuring-3` and records its "Vector group read" table. The known deferred rows of both PRs stand as recorded in `deferred-work.md`.

## Stack

Stopped with `podman compose -p fasor-e21q stop` (no `-v`).

Coordinator's paid eval, 2026-11-05: the drawn Yyn0 plate read as Dy1 3 of 3 with bedrock-structuring-3; fixed in e21f (this PR).
