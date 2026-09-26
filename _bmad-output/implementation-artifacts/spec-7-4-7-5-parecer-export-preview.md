---
title: 'Stories 7.4 and 7.5: set the parecer, see what is outstanding, preview as RASCUNHO and issue'
type: 'feature'
created: '2026-09-26'
status: 'in-progress'
baseline_revision: '1582cddadfc18cac787efb0f86995fd2fb163151'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: high
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 7 batch G3 (coordinator decision 2026-09-26): 7.4 and 7.5 share the parecer key, preIssue, section 10 and the Export dialog, plus the Epic 4/6 carry-over on the same files.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The relatório cannot carry a parecer (the setup band is a stub, section 10 prints only its three bullets), `preIssue` has no blocking row and lacks half its rules, the Export dialog shows neither the pre-issue summary, the document control nor a preview, and an issued revision never feeds "Copiar da última visita". Carry-over debts: the ready toast and `issue` op only arrive on the Sumário (R4), jobs expire from `created_at` (R7), two setup-gap checks disagree (E4 item 14), Restaurar lists tombstones older than the last revision (E4 item 29), and no e2e covers "Copiar da última visita" (E5-Q18b).

**Approach:** Add the `parecer` setup key and the kernel's `suggestParecer`/`composeParecer`; build the band from `50-relatorio-setup.html` `#setup-parecer`; print section 10 from its own kernel and api modules; complete `preIssue` with one `blocking` row and enforce it on the generate route; add the preview job/route with a RASCUNHO watermark; emit `last_nameplate` in the issue commit; close the carry-over.

## Boundaries & Constraints

**Always:**
- Every status, count, plural, verdict label, suggestion and composed text lives in `packages/domain`; `apps/web` renders from IndexedDB and writes ops only; pt-BR strings follow the three homes of AGENTS.md; mock class names; `.frame-*` translations in `app.css`.
- Section 10 in `packages/domain/src/print/section-10.ts` and `apps/api/src/jobs/generate/sections/section-10.ts`; `layout.ts` and `docx.ts` change only by a minimal dispatch insertion (one `if`/branch each) plus the watermark hook.
- `CONTRACT_VERSION` and `MIN_CONTRACT_VERSION` go to 5 (a v4 bundle cannot parse `relatorio/setup/parecer` nor `generation_job/{id}/started_at`); documented in `contract/version.ts`. If main moved past 4 at merge time, take the higher number plus one.
- `preIssue(snapshot, computed = progress(snapshot), context = {})` keeps its signature and `photoErrors`; exactly one rule may be `blocking` ("Parecer não preenchido").
- Keep today's behavior of a Rascunho relatório that generates (Epic 4 item 25, open question).
- New authored strings carry `// authored:` and are listed in the PR body for Bruno.

**Never:**
- Touch sections 7, 8, 9, 11 rendering, the sheet (`surfaces/ficha`), or Epic 8's suggestion code. No PDF download row (Epic 11). No signature image. No watermark on issued documents.
- The app never sets a verdict nor suggests Não apto; nothing unconfirmed prints.
- No new dependency; nothing installed or run on the host.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Suggest Apto | every live equipment sheet concluded Aprovado · Sem restrições | hint "Apto?" in the mock's sentence; nothing preselected | none |
| Suggest restrições | any sheet Com restrições, any NC row, or any Não ensaiada | "Apto com restrições?" | none |
| No suggestion | zero sheets, sheets not all concluded with no restriction, or a Reprovado with no restriction | no hint line | none |
| Verdict tap | nothing set, tap "Não apto" | one op `relatorio/setup/parecer` = `{verdict:'nao_apto', text:null, text_status:null, text_basis:null}`; Generated text field appears; box toned `nao-apto` | refused write toasts (existing `useFieldCommit`) |
| Summary stale | confirmed text, then a sheet changes | stored text shown with "Sugerido: texto atualizado — Substituir" (GeneratedTextField `stale`); the stored text still prints | none |
| Section 10 print | parecer set + confirmed text | box: verdict word as title + text; 3 bullets; validity line; signature | none |
| Section 10 no parecer (preview) | parecer null | box title `[Parecer]`, no text (authored); rest prints | none |
| Validity line | CREA, ART 123 / CRT, TRT 9 / council unknown / number blank | "…acompanhada da ART 123" / "…da TRT 9" / "…da ART/TRT …" / number prints `[ART]` (`[TRT]`, `[ART/TRT]`) | none |
| Issue blocked | parecer null, POST generate | `409 {code:'pre_issue_blocked', details:{rows:['parecer_missing']}}`, no job row | client never sends it (button aria-disabled) |
| Preview | POST preview, no parecer | 202 `{outcome:'queued', job_id}`; job kind `preview`; PDF with RASCUNHO on every page, revision row `—`; `file` kind `preview`; `relatorio/preview_file_id` put; no status change, no revision, no `last_nameplate` | job failure: status `failed`, nothing else |
| Preview while issue running | issue job active | preview still queues (active-job check filters by `kind`); an issue press ignores preview jobs likewise | none |
| Issue commit | revision stored | same batch: `equipment/{id}/last_nameplate` put (scope `project`) per live equipment block whose definition has a nameplate and whose plate holds a filled cell | batch refused as a whole |
| Job expiry (R7) | job `running` with `started_at` | active until `started_at + GENERATE_JOB_EXPIRE_S`; `queued` active until `created_at + GENERATE_JOB_QUEUE_RETENTION_S` (3600, also pg-boss `retentionSeconds`) | unparsable dates → inactive |
| Off-Sumário ready (R4) | press Gerar, go Home | toast "Revisão N pronta" and one `relatorio/status` issue op, once, with the Export dialog closed or open | job failed → the watcher clears the wait silently; the dialog shows failed when reopened |

</intent-contract>

## Code Map

- `packages/domain/src/schemas/entities.ts:227` -- `relatorioSetupSchema`: add `parecer` (nullable object, `.default(null)`); `generationJobRowSchema:479` gains `started_at: nullableIso.default(null)`.
- `packages/domain/src/ops/path.ts:50` -- `GENERATION_JOB_FIELDS` add `started_at`; `RELATORIO_SETUP_KEYS` picks `parecer` up automatically.
- `packages/domain/src/contract/version.ts`, `contract/errors.ts:24` (`pre_issue_blocked`), `contract/generate.ts` (`previewResponseSchema`, `GENERATE_ROUTES` gains the two preview routes).
- `packages/domain/src/relatorio/conclusion.ts:192-213` -- `canonicalJson`/`fnv1a`: move to `text/hash.ts` (re-export) and reuse for the parecer basis.
- `packages/domain/src/relatorio/pre-issue.ts` -- the aggregator; `checks/pre-issue.ts`, `checks/pre-issue-client.ts` feed it; `relatorio/setup-complete.ts:26` `firstSetupGap` (item 14).
- `packages/domain/src/relatorio/sumario.ts:48-61` (`KIND_OF` section_10 `pending-epic` -> `setup`), `:258` `generateReason`, `:283` `restorableBlocks` (item 29).
- `packages/domain/src/checks/calibration.ts:77` `calibrationCheck`; `relatorio/tag.ts:34` `normalizeTag`; `templates/section-text.ts:131` `resolveSectionText` (returns `unresolved`); `relatorio/section-variables.ts:33`; `sync/counts.ts:117` `rejectedText`.
- `packages/domain/src/registration.ts:20-45` -- council titles, `councilLabel`, `artOrTrtLabel`; `print/document-control.ts` `artLabel`, `documentControlRows`, `MISSING`.
- `packages/domain/src/print/layout.ts:164` `layoutSpec` (dispatch for section 10; `LayoutInputs.draft`); `print/revisions.ts:103-131` `jobExpiresAt`/`isJobActive`.
- `packages/domain/src/relatorio/nameplate-copy.ts:103` -- `lastNameplateCopy` reads `last_nameplate.fields` keyed by definition field keys.
- `packages/domain/fixtures/porto-seguro/` -- the fixture (no parecer in its log; tests add one op).
- `apps/api/src/jobs/generate/job.ts` -- `runGenerateJob`, `commitRevision` (add `last_nameplate` ops, preview branch, `started_at` in the running put); `docx.ts:171` `buildDocx` (dispatch + watermark in the default header, `DocxImages.watermark`); `worker.ts` (payload `kind`, `retentionSeconds`); `golden/porto-seguro-skeleton.json` via `docx.test.ts` (`GOLDEN_UPDATE=1`).
- `apps/api/src/http/generate.ts` -- barrier `missing()`, `activeJob()` (filter by kind), the issue route (refuse on blocking rows via `freezeSnapshot` + `preIssue`), add `POST /api/relatorios/:id/preview`, `GET /api/relatorios/:id/preview.pdf`; `sync/snapshot.ts` `freezeSnapshot`.
- `apps/api/src/sync/porto-seguro.integration.test.ts` -- the Postgres replay pattern for the AD-2 test.
- `apps/web/src/surfaces/relatorio/setup-surface.tsx:212` -- the parecer stub; `components/generated-text-field.tsx`; `surfaces/ficha/conclusao-section.tsx` `ConclusionPair` (segments, radiogroup) to reuse.
- `apps/web/src/surfaces/export/export-dialog.tsx`, `use-generate.ts`, `export.css`; `surfaces/relatorio/generate-action.tsx`, `sumario-surface.tsx:99-101`; `state/sync.tsx` (`resendDead`, `lastPushAt`, `userNames`); `db/prefs.ts` (`generate_awaiting:*`); `app.tsx` (providers).
- `apps/web/src/surfaces/ficha/nameplate-section.tsx:58` -- the "Copiar da última visita" chip.
- `e2e/export.spec.ts`, `e2e/support/export-fixture.ts`, `e2e/support/relatorio-flow.ts` -- generate tests (now need a parecer first).

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/relatorio/parecer.ts` (new) -- `ParecerVerdict = 'apto'|'apto_com_restricoes'|'nao_apto'`, `parecerVerdictLabel`, `parecerBoxTone` (`apto|restricoes|nao-apto`), `suggestParecer(snapshot)`, `parecerHintText(suggestion, snapshot)` (mock sentence "Sugerido pelas contagens: Apto com restrições? — 93 de 94 fichas concluídas, 2 com restrições, 1 não ensaiada. A escolha é sua: um toque.", zero parts omitted), `composeParecer(snapshot): {text, criteriaItems, criteriaLine, basis}` (counts: fichas concluídas of total, com restrições with TAGs, NC by checklist item, não ensaiadas with TAG and reason, pontos de atenção; no priority counts; no sentence stating a verdict; text `// authored:`), `parecerTextState`, `parecerTextForPrint` (stored text when `text_status` is confirmed or edited), `parecerBoxText(snapshot)` (mock "Seguido do resumo confirmado acima e, depois, …") -- 7.4 AC1.
- `packages/domain/src/print/section-10.ts` (new) -- `section10Layout(snapshot, base)` -> `{kind:'section_10', number, title, parecer:{title, text|null}, bullets, validityLine, signature:{name, title, registration}}`; bullets from the section's own text or seed as today; signature title = `responsible.title ?? defaultTitleForCouncil`; registration "CREA ⟨n⟩"/"CRT ⟨n⟩"; export `validityLine(council, number)` -- 7.4 AC2.
- `packages/domain/src/print/layout.ts` -- `LayoutSection` union + the one dispatch line for section 10; `LayoutInputs.draft?: boolean` -> `layout.watermark: 'RASCUNHO' | null` and the "Revisão do documento" row value `MISSING` when draft.
- `packages/domain/src/relatorio/setup-complete.ts` -- `setupGaps(snapshot): SetupGap[]` in the fixed order reading `snapshot.responsible`; `firstSetupGap`/`setupIncompleteReason` derive from it (keep the `responsible` parameter only if a caller needs the live user row, else drop it and update callers) -- item 14.
- `packages/domain/src/relatorio/pre-issue.ts` -- new kinds and rows: `setup_missing` per `setupGaps` (texts incl. "Número da ART em branco" by council); `parecer_missing` (`section_10`, `blocking`, "Parecer não preenchido"); `conclusion_unconfirmed` (`section_9`, pending, plural count of concluded sheets with no printable text); `calibration` (`section_11`; expired pending, expiring info; per instrument; reference `service_end` else `context.now ?? new Date()`); `certificate_missing` (`section_11`, info) through a local stub `checks/certificate-missing-stub.ts` unless G2's kernel function is on main; `duplicate_tag` (`section_9`, pending); `section_variables` (on the section's row, pending, names the unresolved labels); `photos_upload_error` (`section_7`, info: photos in `photoErrors`, which the server does not hold); new row key `'sync'` with `rejected` (`context.rejected`, `rejectedText` + "Reenviar") and `last_send` per `context.lastPushes` (`{name, at}` -> "Último envio de Eduardo: 06/09 18:10"). Export `exportPrecheck(rows)` -> `{blocking, explicit (photos pending/error + sync rows), summarizedCount, countText}` and `parecerMissingReason(number, line)` -- 7.5 AC1, carry-over photo row.
- `packages/domain/src/relatorio/sumario.ts` -- section_10 row kind `setup` (opens `?etapa=6`), meta = its pre-issue text or the verdict label; `restorableBlocks(..., since: string | null)` lists only `removed_at > since` -- item 29.
- `packages/domain/src/print/revisions.ts` -- `GENERATE_JOB_QUEUE_RETENTION_S`, R7 expiry rule; `packages/domain/src/print/sm-c1.ts` (new) `confirmedCellsLaterEdited(ops)` counting cells written from a confirmed suggestion then overwritten by a later plain put.
- `packages/domain/src/print/last-nameplate.ts` (new) -- `lastNameplateOps`-ready projection `lastNameplates(snapshot, {revisionNumber, issuedAt})` -> `[{equipmentId, value}]` with `fields` = filled nameplate cells by key (TAG prefill never stored).
- `apps/api/src/jobs/generate/sections/section-10.ts` (new) + `docx.ts` -- render the box (bordered one-cell table, verdict bold as title), bullets, validity line, signature block; watermark: when `layout.watermark !== null`, a behind-text floating image (sharp from an SVG "RASCUNHO", light grey, diagonal) anchored in the default header so every page carries it.
- `apps/api/src/jobs/generate/job.ts`, `worker.ts` -- payload `kind: 'issue'|'preview'` (default issue); running put also writes `started_at`; preview: no number, `draft: true`, stores only the PDF as `file` kind `preview`, one batch: file create, `relatorio/preview_file_id`, job `result_file_id`, `status done`, `result`; issue commit adds the `last_nameplate` puts (scope `project`, `project_id` of the relatório) and logs `sm_c1`.
- `apps/api/src/http/generate.ts` -- issue route: after the barrier, `preIssue(freezeSnapshot(...))` blocking rows -> 409 `pre_issue_blocked`; preview routes; `activeJob(kind)`.
- `apps/web/src/surfaces/relatorio/setup/etapa6-parecer.tsx` (new) + `setup-surface.tsx` -- the band per the mock (`section-band`, `band-head`, `band-num` 6, `section-note`, `conclusion-pair is-verdict parecer-choice`, `conclusion-hint`, `GeneratedTextField` for the summary, `parecer-box` with `data-verdict` only once set); `?etapa=6` focuses it; arriving with `?volta=exportar` shows a text button back to `/relatorio/:id?exportar=1` (authored "Voltar para Gerar relatório"). Copy in `copy/pt-br.ts`.
- `apps/web/src/surfaces/export/*` + `generate-action.tsx` + `sumario-surface.tsx` -- dialog open state is the Sumário's `?exportar=1`; precheck `ul.precheck` (blocking `li.is-blocking` with `pc-block` and "Editar em Dados do relatório" -> setup `?etapa=6&volta=exportar`; explicit rows; count line with "Ver no sumário" closing the dialog and highlighting the warned rows, `is-highlighted` authored in `app.css`); `doc-control-head` + `dl.doc-control` (rows `documentControlRows(snapshot, {revisionNumber: idleNumber, issuedAt: now})`; `dt`/`dd` mirror the `th`/`td` declarations in `export.css` with a comment; phone stacks); `export-sec9-note` (mock sentence verbatim); "Pré-visualizar" secondary in every `generate-row` except while issuing; "Gerar relatório" `aria-disabled` with `parecerMissingReason`; result row share `icon-btn` only where `navigator.share` exists; `use-preview.ts` (opens a blank tab synchronously, drains like issue, POST preview, polls the job, sets the tab to `preview.pdf?v=<file id>`, "Gerando rascunho…", failure closes the tab and shows `gen-error`).
- `apps/web/src/state/generate-watcher.tsx` (new, mounted in `app.tsx` beside `SyncProvider`) -- iterates `generate_awaiting:*`, polls each relatório stream, on arrival writes the `issue` op, toasts `readyToast`, clears the wait; `use-generate.ts` delegates its finish to the same function so one revision yields one op and one toast -- R4.
- `e2e/parecer-export.spec.ts` (new) + existing generate specs -- a helper sets the parecer through the band before generating.
- Tests: kernel unit tests for every new function and row (I/O matrix); `docx.test.ts` draft-equals-issued (buildDocx with `draft` true/false on Porto Seguro + parecer: document XML equal after masking dates, except the watermark drawing and the revision row); golden regenerated deliberately (section 10 only); api integration: parecer put through the sync route + v4 pull answers 426, generate 409 `pre_issue_blocked`, preview queued -> done -> `preview.pdf` 200 with `%PDF`, issue emits `last_nameplate`, R7 expiry; AD-2: `packages/domain/fixtures/porto-seguro/pre-issue.golden.json` written from Postgres (`api` integration, `toSnapshot` + `preIssue`) and asserted equal to the Sumário's rows computed on a fake-indexeddb Dexie store fed the same log (web unit test).

**Acceptance Criteria:**
- Given the setup's parecer band, when a verdict is tapped, then the outbox holds one `relatorio/setup/parecer` op, the summary field shows `composeParecer` with its Criteria line, and Confirmar/Editar/Substituir store `text_status` confirmed/edited as in Story 5.8 (`@p0`).
- Given a relatório with no parecer, when the Sumário and the Export dialog render, then row 10 and the dialog show "Parecer não preenchido" in red, "Gerar relatório" is `aria-disabled` with its reason, "Editar em Dados do relatório" opens the band and its back link reopens the dialog (`@p0`).
- Given a parecer set, when the user presses "Gerar relatório", then revision N issues, the DOCX's section 10 carries the box, bullets, validity line and signature, and the relatório is Emitido (`@p0`).
- Given the Export dialog online, when "Pré-visualizar" is pressed, then a new tab opens `preview.pdf`, the button read "Gerando rascunho…" meanwhile, and no status op nor revision was written (`@p0`).
- Given revision 1 issued in project P, when a second relatório of P opens the same equipment's empty sheet, then "Copiar da última visita (TAG)" appears and a tap writes its nameplate ops (`@p0`, E5-Q18b).
- Given a pending generate, when the user leaves for Home, then the ready toast and the `issue` op arrive there, once (`@p1`).
- Given a block removed before the last revision and one after, when "Restaurar" opens, then only the later one is listed (unit + `@p1`).
- Given the Porto Seguro fixture, when pre-issue runs on Postgres and the Sumário rows on Dexie, then both equal `pre-issue.golden.json` (AD-2).
- Given the Export dialog at 390 px, then the precheck, `dl.doc-control` and generate row fit without horizontal scroll (`@p1`).

## Design Notes

- The parecer is one LWW value (`{verdict, text, text_status, text_basis}`): every tap or text action writes the whole object read from the store at write time, never the render's.
- Story 5.8's "Substituir" wins over the mock's `parecer-own` discard-and-type field: the shared GeneratedTextField's "Editar" is where own text is typed. Dictation stays `slice-inline` (hidden).
- `dl` semantics (UX-DR67, DESIGN) win over the mock's `table.doc-control`; `components.css` stays byte-identical.
- `sync` rows (rejected, last send) are what the Sumário cannot say in a row; only the Export dialog draws them.
- Cross-batch wiring: the missing-certificate row is this batch's, over G2's kernel function when merged (else the stub plus a `deferred-work.md` entry naming G2); "N fichas com sugestões por confirmar" (the story's "sheets with unconfirmed readings") is Epic 8 batch P's, on top of `exportPrecheck`; the golden is regenerated by whichever batch merges last.
- Open questions (keep current or most conservative behavior, list in the PR): Epic 4 item 25 (a Rascunho relatório may generate); a Reprovado sheet gives no parecer suggestion; a confirmed parecer text that went stale still prints; the preview's revision row prints `—`; the highlight look of "Ver no sumário" is authored; SM-C1 is logged per issue, not stored.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm test:api` -- expected: green.
- `docker compose --profile tools run --rm tools pnpm exec playwright test e2e/parecer-export.spec.ts e2e/export.spec.ts` -- expected: green.
- Gate (host lock): `pnpm verify` then `pnpm test:e2e:full` -- expected: green.
