# MVP hands-on review 2026-10-06

Requested by Matheus on 2026-10-06: exercise every MVP feature on the local stack as a user would, through the Playwright MCP browser, and judge five things: simplicity, ease of use, clarity of actions, screen formatting and alignment, and whether every piece of information the user needs is on screen.

Environment: `main` at `1dcf552`, stack up through podman (`fasor-web-1`, `fasor-api-1`, Postgres, MinIO), `OCR_PROVIDER=fake`, `LLM_PROVIDER=fake`, real Chrome driven by the Playwright MCP at 1280 x 800, then 768 x 1024, 390 x 844 and dark mode. User `mvp@review.test`, company "Revisão MVP", seeded with `--standard-template --sample-relatorio`. Two relatórios were worked: a new one created from Home ("Cliente de Testes Ltda · Obra Nova MVP", 94 blocks) and the seeded sample (3 blocks) for the nameplate and display readings. Screenshots: `shots/` beside this file (85 files, named in the findings). The Mac has a camera, so the real camera path blocks on the browser permission prompt; the nameplate and display flows were exercised through the "no camera" branch by making `getUserMedia` reject with `NotFoundError`, which opens the system file picker.

## 1. Verdict per criterion

| Criterion | Verdict | Evidence |
|---|---|---|
| Simplicity | Good | One flow per task; the sheet is one page with four sticky section tabs and one primary button that changes with the state ("Próxima ficha", then "Concluir ficha"). The composer and the setup page are dense but readable. |
| Ease of use | Good, with two blocking defects | Checklist bulk action, "Repetir da ficha anterior", "Igual à SEC-ENEL?", instrument memory and the written conclusion cut the typing to the per-unit fields. A typed setup value is lost unless its own "Confirmar" is tapped (F-02), and the photos added from a sheet are not shown on it (F-01). |
| Clarity of actions | Good | Disabled buttons say why ("Continuar: falta o cliente", "Concluir dados do relatório: falta o número da ART", "Escolha um motivo"). Every suggestion is labelled "Sugerido" and needs a tap. The export dialog says what blocks and what only warns. Exceptions in F-03, F-12, F-14. |
| Formatting and alignment | Good | No horizontal overflow on any of 11 surfaces at 768 or 390 px; dark mode keeps contrast. Remaining: mid-word breaks in the rail (F-07), clipped options menu (F-19), the 390 px export dialog header (F-17), the unlabeled photo button at 390 px (F-10). |
| Information present | Mostly | Sumário rows name what is missing and where it is edited; the export dialog shows the document control block before generating. Gaps: the setup page does not say where "Empresa executora" comes from (F-08), the issued PDF prints placeholders for empty fields (F-04), the certificates row counts instruments as certificates (F-15). |

Console: zero page errors across the session apart from the two `401` on `/api/account` before login. Generation of the 104-page revision took about 35 s; the fake plate read and display read about 30 s each; sync caught up by itself within seconds after every change and after the offline interval.

## 2. Findings, ordered by severity

### High

**F-01 · Story 11.11 is marked done but shipped no code: photos added from a sheet still show nowhere on the sheet.** "Adicionar fotos" on SEC-ENEL-2 accepted two files, the toast said "2 fotos adicionadas — legenda aplicada", and the sheet stayed unchanged before and after a reload (`shots/23-ficha-fotos-legenda-1280.png`, `24-ficha2-full-1280.png`); the photos exist only in the gallery with the context caption (`25-galeria-1280.png`). The story's first acceptance criterion asks for a "Fotos da ficha" strip of `thumb-inline` tiles. `git show --stat 6e3d891` (PR #92) touches only `sprint-status.yaml`, `epics.md` and two KB files; `grep -rn "Fotos da ficha" apps/web/src` returns nothing, and `apps/web/src/surfaces/ficha` has no commit since PR #83. The second criterion (picker opens directly when the camera is available) could not be tested here; the denied-camera path still opens the capture sheet with "Escolher arquivos" drawn as a button, as the third criterion asks. Fix: build the story; until then move `11-11` back to `ready-for-dev` in `sprint-status.yaml` so the field feedback of 2026-10-05 does not read as resolved.

**F-02 · A value typed in setup Etapa 5 is lost unless its own "Confirmar" is tapped.** Typed 760 in "Altitude do site", then tapped "Concluir dados do relatório": the Sumário opened, the sheet showed "Altitude — · Do setup do relatório" and the setup page, reopened, had the field empty (`shots/08-setup-etapa6-preenchido-1280.png` shows the field with its "Confirmar" button still up; `43-setup-etapa5-altitude-1280.png` after the return). Repeated with a tap into "Justificativa" instead of the button: the value was still 760 on screen and empty after a reload (`before: 760, after: ""`, `confirmVisible: true`). Tab from the field lands on the "Confirmar" button, so a keyboard "next" does not commit either. On the sheet the same kind of field commits on blur (Tensão primária 13,8 kV survived). Violates EXPERIENCE.md § Interaction Primitives ("leaving a field never loses it") and is the setup-page twin of the 2026-09-30 F-01. Fix: route the setup numeric field through the same blur-or-idle commit as the sheet fields, and have "Concluir dados do relatório" flush any pending field before navigating.

**F-03 · A relatório with 93 of 94 empty sheets issues as "Emitido" with one tap, and the issued PDF prints placeholders.** The export dialog said "14 avisos — estão nas linhas do sumário; nenhum impede gerar" and the footer "Nada impede gerar." (`shots/35-export-dialog-1280.png`); "Gerar relatório" produced revision 1, the status became "Emitido" and the banner "Alterações geram a revisão 2" appeared (`37-export-revisao-1-1280.png`). The 104-page PDF (`relatorio-rev-1.pdf`, 6.6 MB) carries 93 sheets of dashes, "[Informações adicionais]" on the cover, "[Empresa executora]" in section 1, "Documento —" and "Contratada —" in the document control, and "Certificado não anexado" three times in section 11. The pre-issue list treats all of that as warnings. An engineer who taps the primary button to "see the document" has issued it and from then on every edit bumps the revision. Fix: either block issue while any sheet is empty and any printed field is a placeholder (the pre-issue list already knows both), or make "Pré-visualizar" the primary button until the list is clean and keep "Gerar relatório" secondary with a confirm that names the count ("Emitir com 93 fichas vazias?").

### Medium

**F-04 · Placeholders print literally in the document.** Cover: "Informações adicionais: [Informações adicionais]"; section 1: "realizadas pela [Empresa executora]" (PDF pages 1 and 4). An empty optional field should print nothing, and a required one should block (see F-03).

**F-05 · Section 8 runs the photo token and the recommended action into the sentence.** Printed bullet: "… função dos transformadores etc. Imagem 1 Instalar placas de sinalização NR-10 nas portas das cabines" (PDF page 7). The token is no longer glued (2026-09-30 F-09 is half fixed) but there is no "conforme" before "Imagem 1" and no separator before the action; the table row below repeats the text. On screen the token renders as a link after the text (`shots/32-pontos-salvo-1280.png`). Fix in the renderer: "… etc. (conforme Imagem 1)" and the action on its own line or only in the table.

**F-06 · The App bar is not sticky, so the back button and the Sync badge leave the screen on every long page.** `header` is `position: static`; on the setup page (2718 px tall) the bar is gone after the first scroll and the page even opens scrolled to "Etapa 1" with the bar hidden (`shots/07-setup-etapa1-1280.png` vs `07b-setup-full-1280.png`). The same on the Sumário, the composer and the sheet when the rail is collapsed. The sticky section tabs and action bar on the sheet show the pattern works. Fix: `position: sticky; top: 0` on the App bar in `app.css`.

**F-07 · Rail labels break mid-word: "Chave secciona / dora" and "SEC- / ENEL-2".** At 1280 (`shots/54-ficha-offline-1280.png`, `80-ficha-1280-dark.png`) and 390 the selected row wraps the type name inside the word and splits the TAG at the hyphen. The 2026-09-30 overlap (F-10) is gone; the fix chose `overflow-wrap: anywhere`. Fix: let the state glyph drop under the TAG instead, or allow the label column to shrink the state column first.

**F-08 · Setup Etapa 2 shows "Empresa executora" as an empty read-only box with no pointer.** The Sumário row says "Dado do relatório em branco: Empresa executora" and the export dialog says "Cadastre a empresa em Cadastros › Empresa", but the setup page, where the engineer is looking at the box, says nothing (`shots/07b-setup-full-1280.png`). Fix: the same one-line hint with a link under the box.

**F-09 · A new company starts with no voltage classes and no manufacturers, so the plate comboboxes only offer "Criar".** "Tensão de placa" with "15" typed showed only "Criar “15”" (`shots/18-ficha-placa-preenchida-1280.png` after creating "15 kV"); Cadastros › Classes de tensão and Fabricantes were empty until the sheet created entries. The seeded "Cabine primária — padrão" template exists, the registry seed does not. Fix: seed the common classes (13,8 kV, 15 kV, 24 kV, 36 kV) with the standard template, or at least show "Nenhuma classe cadastrada ainda" in the empty list.

**F-10 · At 390 px "Adicionar fotos" is a wide button with only an icon.** The sticky bar shows "Foto" with its word, a 240 px button with a picture glyph and nothing else, and "Próxima ficha" (`shots/70-ficha-390.png`). Fix: keep a short word ("Arquivos") or shrink the button to an icon-size square.

**F-11 · Fields scrolled into view land under the sticky action bar.** The bar is about 80 px tall and the page has no `scroll-padding-bottom`, so a programmatic or keyboard scroll ("next" on the tablet keyboard, Tab) can place the focused field's chevron or button under the bar (seen on the "Tensão de placa" chevron at y = 743 in an 800 px viewport, hit-tested as the "Adicionar fotos" button). Fix: `scroll-padding-bottom` equal to the bar height on the scroller.

**F-12 · "Concluir ficha" leaves the sheet at once and shows "Ficha concluída" on the next one.** Unchanged from 2026-09-30 F-16 (`shots/20-ficha-concluida-1280.png`: header already SEC-ENEL-2, toast on it). The menu also offers "Concluir ficha", so the primary could stay on the concluded sheet with "Próxima ficha" as the forward tap.

**F-13 · The display photo says "Fotos salvas neste aparelho — entram na fila de envio" while online.** The sync badge read "Sincronizado" at the same moment (`shots/40-ler-visor-1280.png`). Unchanged from 2026-09-30 F-17 in wording; the "Lendo…" state does appear in the cell now.

**F-14 · The Sync status page contradicts itself.** "Sincronizado · Nada pendente neste aparelho" with "Sincronizar agora" disabled and "Sincronizando…" under it (`shots/53-sync-1280.png`); "Último envio de Marina Reis" was labelled "Outro aparelho" in one load and "Este aparelho" in the next for the same device. Low cost, but this is the page the engineer opens when in doubt.

### Low

**F-15 · Certificates row counts instruments as certificates:** "3 certificados · 1T sem certificado · 2E sem certificado · 3M sem certificado" (Sumário row 11). Say "3 instrumentos · nenhum certificado anexado".

**F-16 · The Sumário repeats its title:** the App bar h1 and the page h2 both read "Cliente de Testes Ltda · Obra Nova MVP" (`shots/09-sumario-novo-1280.png`).

**F-17 · Export dialog at 390 px squeezes "12 avisos — estão nas linhas do sumário; nenhum impede gerar." into a 110 px column beside "Ver no sumário"** (`shots/70-export-390.png`). Let the link drop under the text.

**F-18 · The header counts wrap unevenly at 390 px and the "…" button lands alone on its own line** on the Sumário and on the sheet header (`shots/70-sumario-390.png`, `70-ficha-390.png`).

**F-19 · The relatório options popover is clipped by the right edge of the viewport at 1280 px** (`shots/55-sumario-menu-relatorio-1280.png`, the menu's right border is cut). Flip the popover to the left when it overflows.

**F-20 · Cadastros opens on "Instrumentos", the third tab,** while "Empresa" is first and is the one the Sumário and the export dialog send the user to (`shots/47-cadastros-1280.png`).

**F-21 · Account says "Em uso 5,0 MB · 2 relatórios · 0 fotos" after four photos were added.** The count is of photos still waiting to upload, but the line reads as a total (`shots/52-conta-1280.png`). Say "0 fotos aguardando envio" or count all.

**F-22 · The display-read comparison wraps across two lines inside the cell:** "Visor: 1,45 GΩ · digitado" / "1.000 GΩ — Conferir" (`shots/41-ler-visor-resultado-1280.png`). Two lines on purpose (visor, digitado) would read better than one line that wraps.

**F-23 · The live region for the Sync badge lags behind the badge:** `status` said "223 pendentes" while the badge said 227, and "1 pendente" while the badge said 6. Screen readers hear a stale number.

**F-24 · The composer's block list shows two numbering schemes side by side:** "8 Pontos de atenção" at position 7 and "10 Conclusão" at position 8 (`shots/45-template-composer-1280.png`). Either hide the section number or explain that 7 and 9 are fixed.

**F-25 · "Prioridade gravada" toast covers the Prazo field it just filled** (`shots/30-pontos-foto-escolhida-1280.png`); the user cannot see the suggested date until the toast goes.

**F-26 · "Fotografar placa" gives no feedback while the browser's camera permission prompt is open:** the tile only gains a focus ring (`shots/38-placa-foto-lendo-1280.png` before the picker). An "Abrindo câmera…" state in the tile would tell the engineer to look at the prompt.

**F-27 · The sheet's instrument picker lists every instrument, not the ones ticked in setup Etapa 4 and not the ones that fit the test** (a TTR offered for the insulation test, `shots/14-ficha-instrumento-picker-1280.png`). Order the ticked and fitting ones first.

**F-28 · "Novo relatório" from Home is two dialogs with the same title in a row:** client and site, then a jump to the Obra page and a second "Novo relatório" (type, template, dates), five taps to reach the setup (`shots/04-novo-relatorio-dialog-1280.png`, `06-project-1280.png`). One dialog with both halves would do.

**F-29 · The Sync badge at 390 px reads "OK"** (`shots/70-home-390.png`); "Sinc." or the dot alone would say the same without a word that means nothing on its own.

## 3. Regression check against the 2026-09-30 UX review

| 2026-09-30 | Now |
|---|---|
| F-02 undo toast out of view | Fixed: toast is `position: fixed`, seen at y = 592 in an 800 px viewport after the bulk action (`shots/12-ficha-bulk-conforme-toast-1280.png`) |
| F-05 registered site not offered | Fixed: "Local (obra)" lists "Local de Testes" (`04`) |
| F-07 "Igual à" skips Fabricação and Tensão de placa | Fixed: both copied to SEC-ENEL-2 (`21-ficha2-copiada-1280.png`) |
| F-08 instrument editor clipped | Fixed at 1280: no element past the viewport (`50-cadastros-instrumento-editor-1280.png`) |
| F-09 photo token glued | Half: spaced now, still no "conforme" and the action runs on (F-05 above) |
| F-10 rail overlap | Changed into a mid-word break (F-07 above) |
| F-13 no feedback for photos from a sheet | Half: a toast now, no strip (F-01 above) |
| F-15 "Documento —" without a pointer | Fixed: "Cadastre a empresa em Cadastros › Empresa" in the dialog (`35`) |
| F-16 "Concluir ficha" jumps | Unchanged (F-12 above) |
| F-17 queued wording while online | Unchanged (F-13 above) |
| F-03 restore brings the seed text | Restore works and offers "Desfazer" (`34-secao-restaurada-1280.png`); the customised-template case was not re-tested |
| F-01 typed value over a suggestion lost | Not re-tested on the sheet; the same loss now reproduced in setup (F-02 above) |
| F-04 two counts of concluded sheets | Sumário header and parecer band agreed ("1 de 94") on the new relatório; the not-tested case was not re-checked |
| F-11 geolocation on every mount | Not re-tested |
| F-14 rich text toolbar at 390 | Not re-tested (the section editor was exercised at 1280 only) |

## 4. What works well

- The sheet: one page, sticky section tabs with the count of what is missing, a header sentence that updates as fields land ("Verificações prontas · faltam 9 campos da placa, 7 leituras e a conclusão", then "Ficha completa"), the primary button turning into "Concluir ficha" only when complete.
- Readings judged in place with the criterion in the sentence ("Abaixo do aceitável (>400 MΩ)") and a one-tap "Marcar Com restrições"; the conclusion suggested, written in prose with the criteria used, confirmed in one tap; observations made required by the restriction.
- Everything the next sheet can inherit, it offers: "Igual à SEC-ENEL?", "Repetir da ficha anterior do mesmo tipo", the instrument remembered with "Sugerido", the cabine characteristics shown once as a compact line with "Editar".
- The nameplate read keeps the typed values and offers "Sugerido: … · Substituir" per field with the crop in view; the display read shows "Visor" against "digitado" and lets the user pick.
- The Sumário as a table of contents: every row says what is missing and where it is edited; the document control block is shown before generating; the revision list with DOCX and PDF.
- Offline: the badge switches to "sem conexão", typed readings stay, and sync resumes by itself on reconnect.
- Layout: no horizontal overflow at 768 or 390 on any surface, the rail collapses into a labelled strip at 768, dark mode keeps the hierarchy.
- The generated sheet (PDF page 11) reads as the FO.SERV-03 form: nameplate grid, checklist with X marks, instrument line, readings in the right columns, observations and conclusion.

## 5. Screenshot index

`01` login · `02-05` Home and "Novo relatório" · `06` Obra page with the second dialog · `07-08` setup · `09-10` Sumário · `11-21` sheet SEC-ENEL and SEC-ENEL-2 · `22-24` photos from the sheet · `25-27` gallery and caption · `28-32` points of attention · `33-34` section text · `35-37` export · `38-39` nameplate read · `40-41` display read · `42` not-tested dialog · `43` setup altitude after return · `44-46` templates and composer · `47-51` Cadastros · `52` account · `53` sync · `54` offline · `55-56` Sumário menus · `60-*` 768 px · `70-*` 390 px · `80-*` dark.
