# Full review 2026-09-30, front 4: product demo video

Recorded 2026-09-30 against the running local stack (`http://localhost:5173`, `OCR_PROVIDER=fake`, `LLM_PROVIDER=fake`, no OCR sidecar), on a fresh company "Demo" with two users seeded by `scripts/seed-users.ts --standard-template` (no sample relatório). No source file of the app was changed.

## Files (all under the gitignored `docs/media/`, never tracked)

| File | What |
| --- | --- |
| `docs/media/demo-produto-2026-09-30.mp4` | The video: 1280x800, H.264 yuv420p, 25 fps, 6:11 (371 s), 9.7 MB |
| `docs/media/demo-produto-2026-09-30.srt` | 53 pt-BR subtitles, one per `sub` call, timed from the run (the burned-in subtitles stay in the video) |
| `docs/media/demo-produto-2026-09-30.markers.json` | 26 scene markers plus every subtitle with its time, relative to the video start |
| `docs/media/demo-produto-2026-09-30.record.py` | The Python Playwright script (same model as `demo-produto-2026-09-28.record.py`: init script with cursor, click ring and subtitle bar; `--dry` runs without recording) |

The webm Playwright wrote sits in `docs/media/video/`. The last marker (`end`) is at 370.4 s and the mp4 lasts 371.1 s, so the SRT and markers line up with the video within a second (the recording starts a fraction before the script's `t0`).

Conversion: the Playwright-bundled `ffmpeg-1011/ffmpeg-linux` named in the brief has no mp4 muxer, no `libx264` and no `fps` filter (checked with `-muxers`, `-encoders`, `-filters`), so it could not have produced the 2026-09-28 mp4 either. The conversion used the static imageio-ffmpeg 7.0.2 binary already in the uv cache (`~/.cache/uv/archive-v0/gMX0WV3AmU9JpSbU/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2`), with the requested flags: `-c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart`, 1280x800 kept. Frames were extracted one second after each subtitle marker and checked: subtitles are legible on one line, the cursor and click ring are visible.

## Scenes

| Time | Scene | Stories |
| --- | --- | --- |
| 0:02 | Login, then the session that survives without signal (API blocked and navigator.onLine false, reload, "Sem conexão" badge and toast, back online) | Stories 1.3, 1.5, 1.6 |
| 0:16 | Home: status tiles, empty list, Templates and Cadastros shortcuts | Story 1.6 |
| 0:18 | Novo relatório with the client and the site created inline; the project dialog with the template preselected and today's dates; Criar relatório | Stories 2.4, 4.1, 12.2 |
| 0:35 | Dados do relatório: the six etapas on one page; ART typed in Etapa 3; "Cadastrar instrumento" from Etapa 4 opens Cadastros, the instrument is registered with its RBC certificate, calibration date and interval (validity computed), "Fechar" returns to Etapa 4 with the instrument checked; "Concluir dados do relatório" moves the relatório to Em campo and opens the Sumário | Stories 2.1, 4.2, 12.2 |
| 1:04 | Sumário as the table of contents; section 9 tree; Oxigênio expanded; the Transformador de força sheet opened from its row | Stories 4.3, 4.4, 5.1 |
| 1:12 | Ficha: the cabine block on the first sheet, "Fotografar placa" with the fake OCR (plate-transformador.jpg), 11 suggestions with the crop, "Confirmar todos" | Stories 5.2, 5.3, 8.2, 8.4, 8.6, 12.3, 12.4 |
| 1:36 | Verificações: Conforme, Não conforme with its observation, Conforme, then "Marcar os restantes como Conforme" | Stories 5.4, 12.4 |
| 1:50 | Ensaios: three insulation readings judged live; "Ler visor" with display-ttr.jpg, the reading confirmed (out of tolerance, "Marcar Com restrições" offered) | Stories 5.5, 5.6, 9.1 |
| 2:16 | "Adicionar fotos" with two files from the sheet (caption from context, stamp) | Stories 6.1, 6.4 |
| 2:23 | Conclusão: the suggestion "Aprovado · Com restrições?" confirmed, the sheet observation suggested from the NC item, the generated text confirmed | Stories 5.8, 12.4 |
| 2:33 | "Voltar" to the Sumário with section 9 open on the sheet's row; progress per section | Stories 4.3, 12.2 |
| 2:37 | "Adicionar bloco em 1° Subsolo", "Fotografar equipamento" with panel-seccionadora.png, the proposal "Criar SEC-C09 · Chave seccionadora · Coluna 9?" confirmed, toast | Story 9.2 |
| 2:56 | "Mais opções de SEC-C09" > "Mover para…" > "1° Subsolo › Coluna 15", "Renomear para SEC-C15" checked, "Mover" | Story 11.2 |
| 3:05 | "Mais opções de SEC-C15" > "Marcar não ensaiado" > "Equipamento inacessível"; toast "Marcada como não ensaiada — entra na seção 8" | Stories 5.9, 12.4 |
| 3:11 | Registro fotográfico gallery; "Legendar" opens the composer; free text typed; "Salvar legenda" | Stories 6.3, 6.5 |
| 3:26 | Pontos de atenção: the automatic SEC-C15 row; "Criar", text, "Ação recomendada", priority "P1 · Curto prazo" suggesting the Prazo, "Responsável", "Concluir" | Stories 6.6, 11.9 |
| 3:47 | Etapa 6: parecer "Apto" | Story 7.4 |
| 3:52 | Sync status: "Sincronizar agora" on Ana's tablet | Stories 1.5, 10.4 |
| 3:57 | Second device (Bruno, a second browser context, not recorded) signs in, syncs and opens the same SEC-OXIGENIO sheet; both go offline; Bruno marks item 1 NC and item 2 NA, Ana marks both Conforme; Bruno syncs, Ana syncs: "Mesclado automaticamente" (NC vence C) plus one "célula em contradição"; "Resolver" > "A minha" > "Aplicar"; toast "Contradição resolvida — ficha mesclada" | Stories 10.1, 10.2, 10.4 |
| 4:34 | "Mais opções do relatório" > "Salvar como template" (name prefilled with the obra) > "Salvar" | Story 11.3 |
| 4:44 | Home shows the "Continuar: SEC-OXIGENIO · 1 de 95" card; Templates list with the new template; the composer; "Editar texto" of "1 Objetivo": typed line, Negrito on a selection, Lista; autosave; "Fechar" | Stories 3.3, 3.4, 11.4, 12.2 |
| 5:09 | "Gerar relatório" > "Gerar relatório": pre-issue rows and document control, progress "Gerando revisão 1…", then "Revisão 1 pronta" with "DOCX — abrir no Word" and "PDF — enviar ao cliente"; subtitle on the section 8 action-plan table | Stories 4.8, 7.5, 11.1, 11.10 |
| 5:59 | Conta: the "Gravar coordenadas em cada foto" switch toggled off and on; Tema Escuro then Claro | Stories 1.6, 11.5 |

Report generation ran for 36 s (LibreOffice on the server); the wait is narrated by two subtitles. The video is 3:10 longer than the 2026-09-28 one (3:01), which adds the offline session, the setup with the instrument, the panel capture, "Mover para…", "Marcar não ensaiado", the caption edit, the priority-to-deadline, the two-device merge and conflict, "Salvar como template", the rich text editor, the PDF beside the DOCX and the Account switches.

## Not shown, and why

- Story 11.6 (Claude through a paid key) and the AWS half of 11.8: out of scope by the brief; the AI features flag is on locally, which is what makes the plate, display and panel readings appear.
- Story 11.7 (Textract): needs `OCR_PROVIDER=textract` and a cloud account; the fake provider answers instead.
- Story 9.3 (vision captions confirmed in batch) and 9.5 (NC observation drafted from the row's photo): both need a photo on a checklist row or a context-less photo plus the reading job; left out to keep the sheet scene short. 9.4 (dictation) is off in this stack (`VITE_SPEECH_ENGINE=none`).
- Story 4.7 "Restaurar texto do template": deliberately not shown, per the coordinator's note that `audit-2026-09-30-stories-vs-code.md` reports it restoring the seed text rather than the template's text (`packages/domain/src/relatorio/instantiate.ts:105`, `apps/web/src/surfaces/relatorio/section-text-surface.tsx:97-98,112`). No other audited gap crossed a scene.
- Stories 10.3 (removed-versus-edited block, duplicate TAG), 4.5 (reorder, duplicate, restore), 4.6 (status transitions and the "relatório emitido" warning), 2.3 (company identity with the brand preview), 2.5 and 2.6 (registries of manufacturers, voltage classes and criteria), 1.7 (HTTPS from a tablet), 1.8 (durability), 3.7 (the Porto Seguro fixture) and 6.2 (photo durability): either not visible in a single-device desktop recording or too long for the nine-minute budget.
- "Não testado on one test": the app has no per-test control. The only action is the per-equipment "Marcar não ensaiado" of Story 5.9 (sheet Overflow and tree row Overflow), which the video shows on SEC-C15.
- The second device is driven but not recorded (Playwright records one context per `record_video_dir`); Bruno's actions are narrated by the subtitles and their effect is visible on Ana's Sync screen.

## Defects and quirks hit while scripting

| Severity | What | Where |
| --- | --- | --- |
| low | A cold reload with the network fully off (`context.setOffline(true)`) shows Chromium's error page: the dev server has no service worker (Story 1.8 is blocked in this project, as `e2e/auth.spec.ts:66-69` records), so the document itself needs the server. The video reproduces the e2e recipe instead (abort `/api/*` and force `navigator.onLine` false, `e2e/home.spec.ts:201-214`). Known and documented; listed here because a viewer may read the offline scene as a full-network cutoff. | `e2e/auth.spec.ts:66-69`, `e2e/home.spec.ts:201-214` |
| low | The caption composer opens with "Editar texto" already pressed and the chip rows inactive for a photo whose caption was generated at capture and never edited, because `editing` starts as `stored !== composeCaption(prefill)`: on a device that did not remember the activity chip the recomposed text differs from the stored one. A user opening "Legendar" to pick a chip must first switch "Editar texto" off. | `apps/web/src/surfaces/photos/caption-composer.tsx:123` |
| low | Photos added through "Adicionar fotos" (Story 6.4) are stamped with the file's own time (the gallery shows 27/09 and 28/09 for the fixture JPEGs added on 30/09). By design for an after-the-visit import, but the "Ordem cronológica de captura" then sorts them before the plate photo taken minutes earlier in the same sheet. | `docs/media/demo-produto-2026-09-30.mp4` at 3:11; `apps/web/src/surfaces/photos/` import path |
| info | Under headless Chromium the Account page shows "Permissão negada no aparelho — as fotos saem sem coordenadas" beneath the location switch, which is the Story 11.5 denial sub-line working as specified (the browser denies geolocation). | `apps/web/src/surfaces/account/account-surface.tsx:245-283` |
| info | Selector drift since the 2026-09-28 script, all confirmed against the code: the export entries are buttons named "DOCX — abrir no Word" and "PDF — enviar ao cliente" (no longer links); the setup is one scrolling page with `?etapa=N` (no "Continuar" per etapa); "Concluir dados do relatório" is disabled until the ART number and one instrument exist (`packages/domain/src/relatorio/setup-complete.ts:12-22`); a Playwright route glob `**/api/**` also blocks Vite's `/src/api/...` modules, so the script matches on `pathname.startswith('/api/')` like `e2e/support/durability.ts:20`. | `apps/web/src/surfaces/relatorio/export-dialog.tsx:226-237`, `apps/web/src/surfaces/relatorio/setup-surface.tsx:181-248` |

Video-only limits (not product issues): the subtitle bar sits 100 px above the bottom edge, the same place as the 2026-09-28 video, so it overlaps the count row of the sheet stepper and the action buttons of centred dialogs for the seconds a subtitle is on; the "Mesclado automaticamente" row on the Sync screen is the last block of the page and cannot be scrolled above the bar (visible at 4:21 with the toast, partly covered at 4:16).

## Method notes for the next recording

- Seed a fresh company for the take: Home then starts empty and the template is the only one, so the project dialog preselects it (with two or more templates nothing is preselected; the script falls back to picking "Cabine primária — padrão").
- Dry-run with `--dry` first (every subtitle screenshot lands in `DEMO_SHOTS`, default the session scratchpad) and record with the machine under a load average of about 2; the take above ran at 0.9.
- Playwright actions are on a 60 s default timeout because the shared Vite server took up to 10 s per request while other review agents ran.
