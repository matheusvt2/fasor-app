# Epic 4 integrated QA (main after PRs #24-#27)

- Date: 2026-09-24
- Head tested: `6e66090` (origin/main), branch `qa/epic-4`
- Stack: compose project `fasor-qa4` (web `:18073`, api `:18030`, Postgres `:18032`, MinIO `:18090/:18091`), left running
- Evidence: screenshots in `qa-epic-4/` (numbered below). The generated DOCX, its LibreOffice PDF and the mock renders stayed in the session scratchpad and are not committed.
- Accounts: `--test` seeds (Empresa A/B) for the automated suites. The human pass used its own company: `seed-users.ts --company "QA Engenharia Ltda" --standard-template`, with an office user `qa@qa.local` (CREA) and a field user `campo@qa.local` (CRT) in the same company. The test resets never touch this company.

The journey went like this. As the office user I filled Cadastros (Empresa with CNPJ, one registry client, instruments MG-01 valid and MR-02 expired). Then Home > Novo relatório: I created a client and an obra inline ("Hospital Beta" / "Bloco Cirurgico"), then Continuar > Project > Novo relatório > Criar relatório. From there I worked the Sumário, section 9 and the palettes, the setup and its Concluir, section text, and Gerar relatório to revision 1. After that I edited the issued relatório and moved it backward. I went offline and back online, and I pulled everything as the field user in a second browser context. Last, I created a second relatório in the same obra using the keyboard only.

## 1. Automated results

`docker compose --profile tools run --rm tools pnpm verify` passed on the first run (exit 0, about 12 minutes). It ran while the browser pass was starting.

| Stage | Result |
|---|---|
| lint (`eslint .`) | pass |
| static (`typecheck` in 3 workspaces + root `tsc`) | pass |
| test:unit, domain | 60 files, 692 tests passed |
| test:unit, web | 79 files, 698 tests passed |
| test:unit, tooling | 2 files, 20 tests passed |
| test:api (incl. integration, `libreoffice_timeout` fault injection seen in the log) | 25 files, 138 tests passed |
| test:e2e (`@p0`, desktop-chrome + durability-desktop-chrome) | 48 passed (4.6 min) |

`pnpm test:e2e:full` failed (exit 1): 89 passed, 3 failed (8.0 min). Every failure is on `durability-desktop-chrome`, and every one is the same error, `locator.tap: The page does not support tap`:

- `@p1 4.3-E2E-003` (durability.spec.ts:395)
- `@p1 4.7-E2E-003` (durability.spec.ts:440)
- `@p1 4.5-E2E-004` (durability.spec.ts:494)

I reran them on `durability-desktop-chrome`, `durability-android-chrome` and `durability-webkit` to separate a flake from a defect. The failure is deterministic, so this is a defect, not a flake (Q6):

- `4.3-E2E-003`: fails again on desktop, passes on Android.
- `4.7-E2E-003`: fails again on desktop. It also fails on Android, with a second, unrelated assertion error: it expects the title "2 Definições", but the page shows "Seção 2 — Definições".
- `4.5-E2E-004`: passes on Android and is skipped on WebKit.

Every other Epic 4 e2e passed in `test:e2e:full`, including all `@p1`/`@p2`: 4.1-E2E-001/002, 4.2-E2E-001/002, 4.3-E2E-001/002, 4.4-E2E-001/002, 4.5-E2E-001/002/003, 4.6-E2E-001/002, 4.7-E2E-001/002, 4.8-E2E-001..005.

## 2. Per-story, per-AC results

Legend: pass · fail (Qn) · narrowed (the dated narrowing in `epics.md` is the expected behavior and it holds) · not-testable-here.

### Story 4.1 (6 ACs: 6 pass, 1 with a design gap)

| AC | Verdict | Evidence |
|---|---|---|
| 1 Project from Home "Novo relatório" > client; project list newest first, six columns, stacks on phone; empty state "Nenhum relatório nesta obra." | pass | 01, 32, 33; the empty state was seen on the new obra before creation |
| 2 Dialog: single radio preselected, template = last used, end follows start, "Criar relatório" `aria-disabled` with reason | pass | 02, 37; DOM: `aria-disabled="true"`, `aria-describedby` = "Criar relatório: falta a data de início"; the second relatório's dialog preselected the last used template |
| 3 Client Combobox "Criar “⟨texto⟩”" creates inline | pass | 01 (Cliente and Local (obra) both created inline); 4.1-E2E-001/002 |
| 4 One batch: relatório + 23 locations + section blocks + 94 equipment + 94 blocks | pass | Sync badge showed 223 pending right after Criar (1 + 23 + 11 + 94 + 94); 04: 94 TAGs, per-cabine 9/49/5/6/6/19 |
| 5 `suggestTag`: SEC-C05, SEC-C05-2, DJ-/TP-/TC-C05, TR-n, CE-/CS-, cabine short name | pass (design gap Q4) | 04, 05 (palette suggests SEC-C05-2 in Coluna 5); CE-ENEL, CS-SUBSOLO, TR-1..8, SEC-GERADORES-n |
| 6 Another device pulls the relatório and project-scope equipment | pass | 31: the field user in a second context sees the relatório, "0 de 96", the cabines added on device 1 |

### Story 4.2 (5 ACs: 2 pass, 2 fail, 1 not-testable-here)

| AC | Verdict | Evidence |
|---|---|---|
| 1 Setup bands Etapa 1-5 + Conclusão placeholder, opened after creation and from Sumário row 1 | fail (Q1, Q2, Q3) | 10, 39. The bands, the read-only council line (narrowed) and the amber expired line are correct. Q1: creation opens the Sumário, not setup. Q2: Responsável is not prefilled from the account. Q3: Etapa 1 "Informações adicionais" never reaches the document |
| 1b Every field autosaves; sticky bar "Concluir dados do relatório" | pass | Every field (dates typed fast, ART, local, escopo, exclusions add/edit, instruments, info) survived a reload; the fast-typed date bug from batch C is fixed |
| 2 Geolocation prefills altitude once, "< 1000 m" + Confirmar | pass (Q8 nit) | 11b: a device reporting altitude 763.6 shows 764, Confirmar stores "Altitude do site: < 1000 m — confirmada", which survives a reload. 11a/34: a granted reading without altitude (every desktop) and a denied one leave the field empty and typeable |
| 3 Concluir: Rascunho > Em campo, otherwise the reason | pass | 12 "Concluir dados do relatório: falta o número do ART/TRT" (Q12 nit); after Concluir the Sumário pill reads Em campo (13) |
| 4 Unchecking an instrument a sheet uses shows the inline note | not-testable-here (no sheet UI until Epic 5) | 4.2-E2E-002 (`@p1`) green in e2e:full |

### Story 4.3 (6 ACs: 6 pass, 2 of them narrowed)

| AC | Verdict | Evidence |
|---|---|---|
| 1 13 rows in FO.SERV-03 order, 64 px, Pré-visualizar/Gerar at the foot | pass | 03, 20 |
| 2 Meta from `preIssue`/`progress`; the header counts each open section 9 | pass (narrowed) | 03 ("sempre no início", "montado sozinho", "0 de 94"); "0 NC abertos" expands section 9 and focuses its chevron; "Cabine … sem equipamento" row (Q9 nit) |
| 3 Em campo opens section 9 at the last sheet; the other statuses open collapsed | pass | 13 ("você parou aqui" on CE-OXIGENIO after "Abrir primeira ficha"); Rascunho reload: section 9 collapsed |
| 4 Section reorder by Overflow, Position box and Alt+arrows, announced, undoable; cover and control fixed | pass (narrowed: rows 7 and 9 Subir/Descer only) | Position box "4" + Desfazer; Alt+Down/Up; Remover row 5 puts focus on the next row's Overflow |
| 4b "Restaurar ficha removida" in the header Overflow | pass | 08: lists the section and the equipment; restoring puts focus on the restored row's Overflow |
| 5 Rows 1 and 3 open setup at Etapa 2 (focus on the band heading); rows 2, 4, 5 and 6 open section text; rows 7, 8, 10 and 11 show status only | pass | Probed each row; the cover row opens `?etapa=1` |

### Story 4.4 (5 ACs: 5 pass, 2 of them narrowed)

| AC | Verdict | Evidence |
|---|---|---|
| 1 Tree rows, the s9 note, chevrons, Left/Right | pass | 04; ArrowRight on the "1° Subsolo" chevron expands it |
| 2 State glyph + word, glyph `aria-hidden` | pass | "○ Vazia"; "⊘ Não ensaiada · Solicitação do cliente" after an office `not_tested` op (35). Unconfirmed suggestions are not testable before Epic 8 |
| 3 Cabine meta "—" or data; Overflow "Abrir primeira ficha" and Agrupar por tipo | pass (narrowed) | 09; the toggle writes and toasts "Agrupar por tipo ativado em Oxigênio"; "Abrir primeira ficha" is the Story 5.1 stub toast |
| 4 Add, rename and reorder a location | pass | "Cabine 7" added (focus on its chevron), renamed to "Cabine QA", Subir toasts "movida para a posição 6 de 7" |
| 5 Phone: its own surface; rail 320 px, 48 px portrait strip | pass (narrowed: `/arvore` by address) | 17 (rail 319 px, no overflow), 18 (48 px strip, vertical label), 19 |

### Story 4.5 (7 ACs: 7 pass, 1 of them narrowed)

| AC | Verdict | Evidence |
|---|---|---|
| 1 Field palette: 8 types with suggested TAG, no sections | pass | 22 (768 dark, right drawer) |
| 1b One tap creates equipment + block in one batch, in tree order | pass | DJ-OXIGENIO created below CS-OXIGENIO; offline path by 4.5-E2E-001 |
| 2 Office palette asks TAG and Local, prefilled | pass (narrowed: sub-block toggles in Epic 5) | 05 |
| 3 Duplicate TAG refused inline; duplicates via sync; rename keeps id | pass | 05 "TAG já existe nesta obra — SEC-C05 em 1° Subsolo › Coluna 5"; the rename dialog refuses "DJ-C05"; 4.5-E2E-003 |
| 4 Remover with data: Confirm names the TAG, persistent toast, Restaurar | pass | 35 "Remover ficha SEC-OXIGENIO?"; the initial focus is on Cancelar; the toast still stands after 12 s; Desfazer puts focus on the restored row's Overflow; a block without data is removed without a Confirm |
| 5 Four reorder paths, clamped, announced + Desfazer | pass (Q7 latency) | 06 (drag with a 400 ms hold), Alt+Up/Down, Overflow Descer, Position box 0 > 1 and 99 > 3 clamped, Desfazer |
| 5b Duplicar copies config and asks for a TAG; no "Mover para…" | pass | 07 (suggests SEC-C05-3, focus in the field) |

### Story 4.6 (3 ACs: 3 pass, 1 of them narrowed)

| AC | Verdict | Evidence |
|---|---|---|
| 1 An edit on Emitido appends Em revisão; a later edit does not re-advance | pass (narrowed: equipment-only ops) | 27: moving Definições flips the pill to Em revisão; the second move keeps it |
| 2 Banner "Relatório emitido em dd/mm (revisão n). Alterações geram a revisão n+1." | pass | 27 "Relatório emitido em 24/09 (revisão 1). Alterações geram a revisão 2." |
| 3 A backward move asks to confirm | pass | 28: Em revisão > "Voltar para Em campo" (one step back), then "Voltar para Rascunho"; initial focus on Cancelar; focus returns to the header Overflow |

### Story 4.7 (2 ACs: 2 pass)

| AC | Verdict | Evidence |
|---|---|---|
| 1 Plain text, chips, autosave, Restaurar texto do template + Desfazer | pass | 14, 15, 40; the chip `{cliente}` resolves to "Aplicado a Hospital Beta em QA." in the DOCX |
| 2 A template change does not reach the relatório, and the relatório's edit does not reach the template | pass | 16: the template editor for Definições has no "Aplicado a" text |

### Story 4.8 (11 ACs: 9 pass, 1 fail, 1 not-testable-here)

| AC | Verdict | Evidence |
|---|---|---|
| 1 Flush ("Enviando…") then `POST generate`, 409 until caught up | pass | 23 (Enviando… then "Gerando revisão 1…"); 409 covered by the api suite |
| 1b "Gerando revisão n… pode fechar", toast, offline says so | pass | 23, 24, toast "Revisão 1 pronta — DOCX"; 29 "Gerar relatório precisa de conexão. Conecte e tente de novo." |
| 2 DOCX layout: header, footer "Página X de Y", cover `DADOS DO CLIENTE`, document control, TOC, sections 1-6 and 10 resolved, section 3 exclusions, 7/8/9/11 placeholder | fail (Q3) | 25. Everything else checks out: header two lines + code + form revision; footer company lines + PAGE/NUMPAGES; control rows with "Rev. 1", Contratante "CNPJ —", Contratada CNPJ, "Quinta Almeida · CREA SP …", ART, período; sections resolved (obra = setup local, empresa); the 4 exclusions including the edited and added ones; 7/8/9/11 "(sem conteúdo nesta revisão)" |
| 2b PDF by LibreOffice, both files + revision in one transaction | pass | api suite (4.8-INT); revision 1 created |
| 3 Two-pass TOC matches the heading pages | pass | LibreOffice render of the downloaded DOCX: headings on pages 4,4,4,4,5,6,7,7,7,7,8, which equal the TOC numbers (25) |
| 4 Result row "DOCX — abrir no Word", Revisões list, a second generate without edits returns the last revision | pass (Q11 nit) | 24, 26; download `relatorio-rev-1.docx`; the second press returned "Revisão 1 pronta" with no new row |
| 4b Em campo > generate > Em revisão, issue > Emitido | pass | Pill Emitido + banner after closing (27 shows the later edit) |
| 5 Renderer snapshot test | pass | test:api |
| 6 `GENERATE_FAULT=libreoffice_timeout` | pass | test:api log `generate failed … libreoffice_timeout` |
| 6b TOC pass count in the job result | pass | test:api |
| 6c Bruno's remarks recorded | not-testable-here | pending, Matheus to collect (dated note in epics.md) |

### Cross-cutting

- Offline, then online. With the context offline, a Position-box move committed, "Gerar relatório" refused with its reason (29), and the badge read "sem conexão". Back online, the outbox drained without help, and Sync status shows "Nada pendente neste aparelho" (30). An offline reload is not testable on the compose `web` service: it is the Vite dev server with no service worker, so the reload hit `ERR_INTERNET_DISCONNECTED`. That path belongs to the built bundle, and `durability.spec.ts` covers it in `verify` (see friction F4).
- Second browser context: the field user of the same company signed in, and Home listed the relatório with its status. Opening it pulled the Sumário with the added cabine and "0 de 96" (31).
- 390, 768 and 1280 px, light and dark: no horizontal overflow on the Sumário, project, setup, section text or tree pages, nor in the dialogs (20, 21, 33, 36, 37, 39, 40). The band notes wrap at 390 (the batch C finding 8 is fixed).
- Keyboard only: I created the second relatório from the project page with the keyboard alone. Tab order was Voltar > Sync > Conta > Início > "Novo relatório a partir de template"; Enter put focus on the radio; Tab reached Template (preselected) and the date segments, and the start digits were typed; Tab reached "Criar relatório"; Enter landed on the Sumário. Reorder by Alt+arrows and the Position box, the Overflow menus and the dialogs (Escape returns focus to the trigger) all worked by keyboard.
- Console and network: no errors on `:18073` apart from the expected 401 before login and one `sprite.svg` fetch while offline. (Errors from an older session on `:16073`, another batch's Vite HMR, are not from this stack.)
- Copy: no emoji or "laudo" in the Epic 4 diff or in the DOCX; the DOCX `dc:creator` is "PRODUTO". The only non-ASCII symbols are DESIGN.md's text glyphs ✓ ● ○ ⊘, and they are `aria-hidden`.
- Mock parity: the Sumário, the dialog and the palette structure match `40-relatorio-overview.html` and `30-project.html`; the batch reviews already checked parity class by class. The differences I found: the app bar reads "Sumário" where the mock reads the relatório name; the Pré-visualizar reason sits beside a half-width button instead of the mock's single note above two equal buttons (Q10); and `73-exportar.html` is a full surface where the app has a dialog (accepted in batch D).

## 3. Defects

### Q1 should-fix: "Criar relatório" opens the Sumário, not Relatório setup

- Steps: Project > "Novo relatório a partir de template" > type the start date > "Criar relatório".
- Expected: Relatório setup opens. Story 4.2 AC1 says "opened after creation"; EXPERIENCE.md Component Patterns › Form dialog says "on create it opens Relatório setup"; spec 4.1 says "batch C later redirects to setup".
- Actual: `/relatorio/:id` (the Sumário) opens. Nothing points the office user to the setup except the cover row's meta.
- Suspected: `apps/web/src/surfaces/project/new-relatorio-dialog.tsx:88` `navigate(`/relatorio/${relatorioId}`)`. It should be `/relatorio/:id/setup?etapa=1`; `4.1-E2E-001` asserts the Sumário URL and needs its expectation changed with it.

### Q2 should-fix: Responsável técnico is not prefilled from the signed-in account

- Steps: create any relatório, then open setup Etapa 3.
- Expected: the account's "Registro profissional" is "the default responsável of every new relatório" (EXPERIENCE.md Account row and Settings row; Flow step 5: "he types only the ART number"). Spec 4.2 says "`Combobox` … default `session.user.id`".
- Actual: the Combobox is empty on every new relatório (10 before selection, 34). The Sumário's cover row reads "Responsável técnico em branco", and Concluir says "falta o responsável técnico".
- Suspected: `apps/web/src/surfaces/relatorio/setup-surface.tsx:437-444, 475` deliberately never defaults (the comment cites a review finding). The clean fix is for `instantiateTemplate`'s inputs (`packages/domain/src/relatorio/instantiate.ts`, setup built around l.150-165) to carry `responsible_user_id: session user`, written in the creation batch. Then nothing looks filled without being committed.

### Q3 must-fix: Etapa 1 "Informações adicionais" never reaches the document; the cover row prints the Etapa 2 "Escopo" instead

- Steps:
  1. Setup Etapa 1: type "Parada programada de 36 horas" in "Informações adicionais".
  2. Etapa 2: type "inspecao visual e ensaios eletricos na cabine primaria" in "Escopo".
  3. Gerar relatório, then open the DOCX.
- Expected: the cover's `DADOS DO CLIENTE` row "Informações adicionais" prints what was typed in the field with that label, in Etapa 1 — Capa (mock `50-relatorio-setup.html:134` places it in the cover band).
- Actual: the row prints the Escopo text (25). `setup.additional_info` appears nowhere in the DOCX (grep of `word/document.xml`: 0 hits). What the user types in a cover field is silently lost.
- Suspected: `packages/domain/src/seed/sections-v1.ts:243` maps the row to `{escopo}`, and `packages/domain/src/relatorio/section-variables.ts:23-33` has no variable for `additional_info`. Decide which field the row prints. If it is `additional_info`, add a variable and point the cover row at it, and say where `escopo` prints. If it is `escopo`, remove the dead Etapa 1 field. Add a layout test either way.

### Q4 should-fix (needs a product decision): a second relatório in the same obra mints 94 new equipment rows with suffixed TAGs

- Steps: in an obra that already has one relatório, "Novo relatório a partir de template" > Criar.
- Expected: glossary. "Project … owns … the site's Equipment rows"; "TAG — the equipment's stable identity … unique within the Project". Story 4.1 AC6: "a relatório created later still sees the project's whole equipment history". The same physical switch should keep "SEC-C05" (and later its `last_nameplate`) across relatórios of the obra.
- Actual: the second relatório creates 94 new `equipment` rows with TAGs SEC-C01-2, SEC-C02-3, DJ-C03-3, TR-9..TR-13, CS-SUBSOLO-6… (38; 86 of 94 non-TR TAGs carry a suffix). The next document of the same substation prints different TAGs, and the obra's equipment table doubles each time.
- Suspected: `packages/domain/src/relatorio/instantiate.ts:223` uses `existingEquipment` only to suffix new TAGs, never to bind a template block to the equipment already at that location. This follows spec 4.1's literal "one equipment create per block", so the spec needs a decision before code: reuse by (location path, type, ordinal), or one project per visit.

### Q5 should-fix: the Home card title uses the setup's "Local" override and drops the obra

- Steps: create two relatórios in one obra; fill Etapa 2 "Local" in only one of them; look at Home.
- Expected: the card names the client and the obra, as the Sumário header ("Hospital Beta · Bloco Cirurgico") and the section variable `obra` (`local ?? project.site`) do.
- Actual: one card reads "Hospital Beta · Bloco Cirurgico - Subestacao principal" and the other only "Hospital Beta" (36). The Sumário header and the Home card disagree.
- Suspected: `packages/domain/src/home/cards.ts:196` `join([clientName, source.local])`. It should fall back to the project's site the way `section-variables.ts:25` does (the project row is already in scope at l.195).

### Q6 should-fix: `pnpm test:e2e:full` is red

- Steps: `docker compose --profile tools run --rm tools pnpm test:e2e:full`.
- Expected: green. The epic retrospective runs it for the DoD P1 coverage check.
- Actual: 3 failures on `durability-desktop-chrome`, every one with `locator.tap: The page does not support tap`. In addition, `4.7-E2E-003` fails on `durability-android-chrome` because it expects `.section-text-title` "2 Definições" while the page renders "Seção 2 — Definições" (the batch C fix changed the title and this touch test was not updated).
- Suspected: `e2e/durability.spec.ts:396, 441, 495` skip only `browserName === 'webkit'`. The condition should skip any project without touch (for example `test.skip(!testInfo.project.use.hasTouch, …)`). Also `e2e/durability.spec.ts:473` has the stale title. `verify` stays green because these are `@p1`.

### Q7 should-fix: a reorder or add with section 9 expanded takes about 650 ms to redraw

- Steps: Sumário, expand section 9 and every cabine (96 blocks), focus an equipment row, press Alt+ArrowUp. Timed with `performance.now()` from the keydown to the DOM order change.
- Expected: NFR-7 "immediate". The announcement and the visual move should arrive together.
- Actual: 670, 677, 652 and 635 ms per move with the machine idle (850 ms while the e2e suite ran). The toast and announcement come about 400 ms after the key, and the rows move about 250 ms after the announcement. A creation from the palette behaves the same: the toast "criada" appears before the row. Measured on the Vite dev build; confirm on the production bundle before optimising.
- Suspected: the whole Sumário and tree re-derive from the Dexie live query and `buildSnapshot` for every committed op (`apps/web/src/surfaces/relatorio/sumario-surface.tsx`, `relatorio-tree.tsx`). A per-node memo, or narrowing the live query, is the likely fix.

### Q8 nit: the altitude field says "Sugerido" with nothing suggested, and a confirmed altitude cannot be changed

- Steps: open setup with geolocation denied, or granted on a device that reports no altitude (every desktop).
- Actual: an empty amber field with the "Sugerido" pill (10, 34). After "Confirmar", the band shows only "Altitude do site: < 1000 m — confirmada", with no edit and no undo, so a wrong confirm is permanent from the UI.
- Suspected: `apps/web/src/surfaces/relatorio/setup-surface.tsx:679-711`. Show the pill and `data-state="suggested"` only when a reading exists, and give the confirmed line an "Alterar".

### Q9 nit: "Cabine Cabine QA sem equipamento"

- Steps: add a cabine from the tree. Its default name is "Cabine 7", and I also renamed it to "Cabine QA".
- Actual: the section 9 row meta reads "0 de 95 · Cabine Cabine QA sem equipamento" (13, 20). Every newly added cabine hits this, because of its default name.
- Suspected: `packages/domain/src/relatorio/pre-issue.ts:46` prefixes "Cabine" unconditionally.

### Q10 nit: two copy slips on Epic 4 surfaces

- The Sumário foot reason "Pré-visualizar: disponível na pré-visualização do documento" is circular (`apps/web/src/copy/pt-br.ts:484`). Something like "Pré-visualizar: disponível em uma próxima etapa" says what it means.
- The setup's "Conclusão e parecer" band reads "Disponível na próxima etapa deste épico" (`pt-br.ts:637`), but the band is Epic 7's.

### Q11 nit: the Export dialog shows stale state

- After "Gerar de novo" with no edits, the idle line promises "como a revisão 2" (26, `packages/domain/src/print/revisions.ts:124` fed the next number unconditionally); the press then correctly returns revision 1.
- In the ready state right after the job, the status pill reads "Em revisão" and "Qualquer alteração a partir de agora gera a revisão 2." (24), while the relatório is already Emitido (the Sumário shows Emitido on close; reopening shows Emitido).

### Q12 nit: the setup reason says "o número do ART/TRT" when the council is known

- Actual: 12, with a CREA responsible.
- Suspected: `packages/domain/src/relatorio/setup-complete.ts:20`; `artOrTrtLabel` exists. This is batch C finding 14, still open.

### Q13 nit: DOCX details

- The footer's PAGE/NUMPAGES field runs render larger than the surrounding "Página … de" text (25, visible on every page).
- `docProps/core.xml` carries `cp:lastModifiedBy` "Un-named" (the `docx` library default).
- Where: the layout spec footer runs in `apps/api/src/jobs/generate/`.

### Q14 nit: section text does not move focus on open

- Steps: from the Sumário, open row 2, 4, 5 or 6.
- Actual: focus stays on `<body>`, while setup focuses the target band heading.
- Suspected: `apps/web/src/surfaces/relatorio/section-text-surface.tsx`. Focus the `h2` (tabIndex -1) on mount, as `setup-surface.tsx` does.

Verified fixed from the batch reviews (no action): the batch C must-fix date corruption (a fast-typed date stores 2026-09-17), the exclusions reaching the DOCX, the band-note wrap at 390, the focus after the toast's Desfazer on a restore (lands on the row's Overflow), the batch B rail overflow (rail 319/319 px), and the "Adicionar bloco em ⟨cabine⟩" target.

## 4. Setup friction a new developer would hit

- F1: `seed-users.ts --test` gives Empresa A/B without the standard template, and the test suites reset them. A manual pass needs its own company with `--standard-template` (the README mentions the flag only in the script usage text), and then Cadastros › Empresa must be filled by hand (razão social, CNPJ), or the document control prints "—".
- F2: every `tools` run downloads the pnpm 12.5.1 binary again ("Downloading the pnpm 12.5.1 binary"), which adds time to each command.
- F3: `pnpm test:e2e:full` is red out of the box (Q6), so the retro's P1 coverage check cannot be read as it stands.
- F4: the compose `web` service is the Vite dev server with no service worker, so "go offline and reload" cannot be tried by hand on the default stack. You need the `prod` profile (build the web bundle in `tools` first), or you rely on `durability.spec.ts`. The README's prod section says `curl http://localhost:3001/api/health`, but a worktree override moves it to `API_PROD_PORT`.
- F5: Playwright's `setGeolocation` cannot set an altitude, so the altitude prefill is testable only by overriding `navigator.geolocation` in an init script, as I did for 11b. A desktop browser never prefills (see Q8).
- F6: a worktree needs `.env` + `compose.local.yml` + `_bmad/custom/config.user.toml` before any docker command. Without them the compose project name and the ports collide with the main checkout's stack.

## 5. Re-check after #28

- Date: 2026-09-24
- Head: `488ab5e` (PR #28, merged into `qa/epic-4`)
- Stack: `fasor-qa4`, rebuilt (`docker compose build api tools`, `api` and `web` recreated)
- Method: the Playwright MCP browser, driven as a person would, on the same QA company. I made a fresh obra, "Hospital Beta · Ala Norte", with two relatórios.

### Automated suites

| Suite | Result |
|---|---|
| `pnpm verify` | pass (exit 0). Lint and static pass; unit: domain 709, web 718 and tooling 20 tests passed; api: 139 tests passed; e2e `@p0`: 49 passed (4.2 min). |
| `pnpm test:e2e:full` | pass (exit 0). 90 passed and 3 skipped (7.0 min). The three skipped are the touch tests 4.3-E2E-003, 4.7-E2E-003 and 4.5-E2E-004 on `durability-desktop-chrome`, which has no touch. |
| Touch tests on `durability-android-chrome` | 9 passed, including 4.3-E2E-003, 4.7-E2E-003 and 4.5-E2E-004. |

### Per-Q status

| Q | Status | What I drove | Evidence |
|---|---|---|---|
| Q1 | fixed | Home > Novo relatório > existing client, new obra inline > Continuar > start date typed > Criar relatório. The page lands on `/relatorio/:id/setup?etapa=1` with focus on "Etapa 1 — Capa". The same happens from the project page for the second relatório. | R-01 |
| Q2 | fixed | Etapa 3 of the new relatório already reads "Quinta Almeida · CREA · SP 5063123456". The Sumário meta has no "Responsável técnico em branco". | R-01 |
| Q3 | fixed | Etapa 2 has no "Escopo" field. I typed Etapa 1 "Informações adicionais" = "Manutencao preventiva anual - parada de 12 horas", concluded and generated. The DOCX cover row "Informações adicionais" prints exactly that text (the LibreOffice PDF too). | R-03, R-03b |
| Q4 | fixed | A second relatório in Ala Norte left the project's equipment at 94 live rows before and after (IndexedDB count). The TAGs are identical to relatório 1: SEC-C05, DJ-C05, TR-1..8. The only suffixes are the template's own second units, such as SEC-C02-2, the same as in relatório 1. Nearby checks: a Remover of SEC-C05 in relatório 2 leaves the shared equipment live, and relatório 1 still lists SEC-C05. The field user in a second context sees the same equipment. | R-04, R-16 |
| Q5 | fixed | Home: both Bloco Cirurgico cards read "Hospital Beta · Bloco Cirurgico" (one of them has a setup "Local" override), and Ala Norte reads "Hospital Beta · Ala Norte", as on the Sumário headers. | R-05 |
| Q6 | fixed | `test:e2e:full` is green. The touch tests are skipped without touch and pass on Android. | suite table |
| Q7 | fixed | Section 9 fully expanded (95 rows), Alt+ArrowUp/Down on TC-C03. Keydown to row move: 296, 343, 304, 311 and 318 ms on the Vite dev server with the machine idle, against 635-677 ms before with the same method. The toast and the announcement now appear in the same frame as the row move. The same holds for palette creations (TP-C04-2, TP-C04-3: toast and row at 608 ms together, focus on the new row). PR #28 reports 91 ms median on the production bundle. | R-07 |
| Q8 | fixed | With no geolocation reading, there is no "Sugerido" pill and no amber state (R-08a). With a reading (a stubbed 763.6 m), Confirmar shows "< 1000 m — confirmada" plus "Alterar". Alterar reopens the field with 764 kept and the focus in it. Typing 1250 and Confirmar gives "1250 m — confirmada", which survives a reload. | R-08a, R-08b |
| Q9 | fixed | Adicionar cabine gives the meta "0 de 95 · Cabine 7 sem equipamento"; Desfazer removes it. | R-09 |
| Q10 | fixed | The Sumário foot reads "Pré-visualizar: disponível em uma próxima etapa", and the setup band reads "Disponível em uma próxima etapa". | R-12, R-03 |
| Q11 | fixed | Full Gerar relatório runs, from Em campo and from Em revisão, sampled every 100 ms. The phases go Enviando…, then "Gerando revisão n…", then "Revisão n pronta" with the pill "Emitido" from its first frame. "Gerar de novo" without edits shows the idle line "como a revisão 1" and returns revision 1. After an edit, the idle line reads "como a revisão 2", the run produces revision 2, the toast reads "Revisão 2 pronta — DOCX", the pill is Emitido and the banner reads "(revisão 2). Alterações geram a revisão 3." | R-11a, R-11b, R-11c |
| Q12 | fixed | With a CREA responsável and no ART, the reason reads "Concluir dados do relatório: falta o número da ART". | R-12 |
| Q13 | fixed | In the DOCX footer, all three paragraphs have style `FooterText` and every run is size 18 (9 pt). In the LibreOffice render, "Página 1 de 8" is one uniform size. `cp:lastModifiedBy` and `dc:creator` are "PRODUTO". | R-13, R-03b |
| Q14 | fixed | Opening Sumário row 4 puts focus on the `H2` "Seção 4 — Requisitos básicos". | R-14 |

Regression checks near the fixes:

- The offline refusal of Gerar still works.
- Emitido plus an edit flips the relatório to Em revisão, and a later edit does not advance it again.
- Undo after Adicionar cabine works.
- Focus after a palette creation lands on the new row.
- The 768 px dark theme and the second device show no horizontal overflow.
- No console errors after the reload that followed the merge. There was a burst of "useSession must be used inside SessionProvider" errors, but only while Vite hot-reloaded the open tab during `git merge`, and it went away on reload.

### New defects

#### Q15 should-fix (known and deferred, now routine because of Q4): a TAG rename in one relatório silently changes an issued relatório of the same obra

- Steps:
  1. In Ala Norte, relatório 1 is Emitido (revision 1).
  2. Open relatório 2 (Rascunho) > DJ-C05 > Renomear TAG > "DJ-C05-A" > Salvar.
  3. Open relatório 1.
- Expected: either the rename warns that the TAG is shared with an issued relatório, or relatório 1 advances to Em revisão (Story 4.6) because its next document will differ.
- Actual: relatório 1 lists DJ-C05-A, stays "Emitido" and keeps the banner "Alterações geram a revisão 2". The Renomear TAG dialog ("Renomear TAG DJ-C05 / TAG / Cancelar / Salvar") gives no sign that the equipment is shared.
- Suspected: `apps/web/src/db/commit.ts` `buildBatch` skips the project-scope equipment op, and `apps/web/src/surfaces/relatorio/tag-dialogs.tsx` does not hint that the TAG is shared. This is the entry already in `deferred-work.md` (batch C finding 9, extended by #28). Q4 turns it from a rare case into the normal one, so it should be scheduled rather than parked.
- Evidence: R-15.

Nothing else new was found. The Q4 reuse misses a TAG that was renamed in the earlier relatório (it mints a new row); that is deferred by #28 with a reason, so I did not re-raise it.
