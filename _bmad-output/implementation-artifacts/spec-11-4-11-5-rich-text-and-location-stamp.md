---
title: 'Stories 11.4 + 11.5: Rich text boilerplate and the photo location stamp switch'
type: 'feature'
created: '2026-09-30'
status: 'in-progress'
baseline_revision: '9614e0a2b25154cdc0fe661baa24ec76269fa5b8'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: opus
dev_effort: medium
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['batched', 'multiple-goals', 'oversized']
batched_reason: 'Epic 11 batch E (coordinator decision 1): two small office/account surfaces with no shared code, batched for token economy.'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Template composer's section editor is plain text (Story 3.6), so boilerplate cannot carry the bold, italics and lists the company form uses (FR-12, UX-DR69). Account has no "Localização nas fotos" switch, so the engineer cannot turn the coordinates under photos off, and an OS denial is recorded (`geolocation_denied`, ledger `deferred-work.md:737-740`) but never shown (FR-8, UX-DR65).

**Approach:** 11.4 keeps `section_text` a string and gives it a small kernel-owned markup (bold, italic, bullet and numbered lists, variables) that the kernel parses into printable runs; the composer dialog becomes a rich editor over it; the renderer prints the runs. 11.5 adds the Toggle row to Account writing `user/{id}/photo_location_enabled`, reading the device pref for the denial line.

## Boundaries & Constraints

**Always:**
- The markup is defined, parsed, serialized and normalized ONLY in `packages/domain` (AD-1). The web turns DOM into kernel `RichBlock[]` and calls the kernel serializer; it never writes a `*` or a list marker itself.
- Markup (one line = one block; blank lines separate chunks): `- ` starts a bullet item; `N. ` (any digits) starts a numbered item, printed numbered by position (1, 2, 3…), restarting after any non-numbered block; `**x**` bold, `*x*` italic (independent toggles, `**` matched greedily before `*`, never across lines); `\` escapes `\ * - .` (the serializer escapes every literal `*` and `\`, and a leading `-`/`N.` of a paragraph). An unbalanced `*`/`**` in a line is literal. `{name}` variables are atomic tokens inside runs and keep the run's marks.
- Legacy text without markers keeps today's meaning exactly: in a chunk, the first unmarked line is a paragraph and later unmarked lines are bullet items (`print/layout.ts` `ownParagraphs`). The Porto Seguro golden and every existing layout/docx test stay unchanged.
- Variables are resolved per run AFTER parsing, so a value holding `*` never formats.
- Formatting = bold, italic, bullet list, numbered list only (what the DOCX and PDF renderers share). No underline, headings, links, colours.
- Paste into the rich editor is stripped to plain text plus lists: HTML `<ul>/<ol><li>` become bullet/numbered blocks, every other element becomes paragraph text with no marks; `{name}` tokens become chips; literal `*`/`\` are escaped.
- The per-relatório Section text surface (`section-text-surface.tsx`, `use-section-text-area.ts`) and the point text editor stay plain text, unchanged: markup there shows as the characters it is stored as and is preserved by an edit.
- Mock class names: `.rich-text`, `.rt-toolbar` (`role="toolbar"`, `aria-label="Formatação"`), `.rt-tool` with `aria-pressed`, `.rt-tool.rt-var`, `.rt-area` (`42-template-composer.html:386-396`). Words verbatim: Negrito · Itálico · Lista · Numeração · Variável. Buttons ≥ 48 px tall (DESIGN.md Rich text editor wins over the mock's 40 px): `app.css` rule with a comment.
- The Account row is `90-account.html:67-77` verbatim: heading "Localização nas fotos", label "Gravar coordenadas em cada foto", sub "Impressas na seção 7 com a data e a hora: \"Imagem 5 · 06/09/2026 14:32 · −23,5505, −46,6333\"", `helper-on` / `helper-off` texts; the denied line is `key-account.html:260` verbatim ("Permissão negada no aparelho — as fotos saem sem coordenadas. Libere em Ajustes › Localização e o pino volta na próxima foto.", `data-tone="amber"`). Copy goes in `copy/pt-br.ts` (static), Toggle words from `ui.ts`.
- No `CONTRACT_VERSION` bump: no op family, path or row shape changes (`section_text` stays `string | null`; `user/{id}/photo_location_enabled` is already a valid `user/field` path, `ops/path.ts:75,258`, and `apply.ts:150` already limits it to the actor's own row).

**Never:**
- No rich editor outside the Template composer. No new op family, no new entity field, no schema change.
- No undo toast for formatting or for the location switch (formatting is a field edit; a switch is its own inverse, EXPERIENCE.md Toggle "changes autosave").
- Never block or delay capture; never write "Erro de GPS"; never flip the switch off on a denial.
- No PDF download UI (Story 11.1, batch A). No change to `docx` output for text without formatting.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Legacy flat text | `"Intro\nitem a\nitem b\n\nPara"` | paragraph, item, item, paragraph (as today) | none |
| Explicit lists | `"Intro\n- a\n1. b\n2. c\n\nFim"` | paragraph; bullet a; numbered b (1), c (2); paragraph | none |
| Inline marks | `"A **negrito** e *itálico* e ***ambos***"` | runs: A ·(b)negrito· e ·(i)itálico· e ·(b+i)ambos | none |
| Unbalanced | `"5 * 3 e a ** b"` | one plain run, characters kept | literal |
| Escapes | `"\\*nota\\* e \\\\"` / paragraph starting `\- x` | literal `*nota* e \` / paragraph "- x" | none |
| Variable in bold | `"**{cliente}**"`, cliente = `A*B` | one bold run "A*B" | unresolved prints `[Cliente]` bold |
| Round trip | any `RichBlock[]` | `parse(serialize(b))` deep-equals normalized `b` | adjacent same-mark runs merged, empty runs/blocks dropped |
| Seed-equal text | editor serializes a text equal in meaning to the seed's | composer stores `null` (keeps following the seed) | compare normalized forms |
| Switch off | `photo_location_enabled=false`, capture | photo row `coords: null`, no geolocation request, tile/stamp time only, section 7 date and time only | none |
| OS denied | pref `geolocation_denied=true`, switch on | denied line shown instead of `helper-on`; switch stays on; capture works | a later successful fix or a `granted` Permissions API state clears the pref |

</intent-contract>

## Code Map

- `packages/domain/src/templates/section-text.ts` -- flat text, `sectionTextTokens`, `resolveSectionText`; the new markup lives beside it.
- `packages/domain/src/print/layout.ts:143-157,207-214` -- `ownParagraphs` (legacy line rule) and where section paragraphs and section 10 bullets are built; `LayoutParagraph` at `:46`.
- `packages/domain/src/print/section-10.ts:28,66-77` -- `bullets: string[]` built from paragraphs.
- `apps/api/src/jobs/generate/docx.ts:132-185,300-375` -- `text()`, `sectionParagraph`, the `Document` (numbering config goes here); `sections/section-10.ts` bullets.
- `apps/api/src/jobs/generate/job.integration.test.ts`, `pdf-outline.ts` (pdfjs-dist 6.3.289 already a dep) -- pattern for a job run reading the stored DOCX/PDF.
- `apps/web/src/surfaces/templates/section-text-dialog.tsx` -- the dialog to extend (toolbar); `section-text-editor.ts` -- chip/caret DOM helpers to reuse; `apps/web/src/input/use-section-text-area.ts` -- the plain hook (stays for the relatório and point surfaces; blocks browser undo at `:155`).
- `apps/web/src/surfaces/templates/template-composer.tsx:356-390` -- `writeSectionText` (seed-equal → null) and the text dialog wiring; `templates.css:108-113`.
- `apps/web/src/surfaces/account/account-surface.tsx` (header comment `:25-35` says FR-8 not built), `account.css`, `components/toggle.tsx`.
- `apps/web/src/db/photo-store.ts:181-191` -- `photoLocationEnabled`, `writeGeolocationDenied`; `db/schema.ts:144` pref key; `files/geolocation.ts` tracker (`onDenied`); `surfaces/ficha/use-photo-capture.ts:66-115` reads the switch at camera open.
- `apps/web/src/state/session.tsx:265-291` -- `saveRegistration` pattern (`commitBatch` of `user/field` puts); `packages/domain/src/registration.ts:103-128` -- `registrationPuts` pattern for the new put builder.
- `packages/domain/src/photos/gallery.ts:25-40` -- stamp texts; `print/section-7.ts` stamp with `coords: null`.
- `e2e/templates.spec.ts:693-880` -- 3.6 section-text specs (assert no toolbar at `:726`; Enter/paste line shape at `:769-779`; Ctrl+Z blocked at `:855-861`); `e2e/photos.spec.ts:19-20,52-100` capture with geolocation; `e2e/account.spec.ts`.
- Mocks: `prototype/screens/42-template-composer.html:386` and `90-account.html:68` carry `data-slice="out"`.

## Tasks & Acceptance

**Execution:**
- `packages/domain/src/templates/rich-text.ts` (+ export from the package index) -- `RichRun`, `RichBlock` (`paragraph | bullet | numbered`), `parseRichText(text)`, `serializeRichText(blocks)`, `normalizeRichText(text)` (= serialize(parse)), `sameRichText(a, b)`, `plainTextToRichBlocks(text)` (paste of plain text), and `richRunsResolved(runs, variables)` -> printable runs -- per the markup rules above.
- `packages/domain/src/templates/rich-text.test.ts` -- every I/O matrix row, legacy compatibility on every seed section's `flattenSectionText`, round-trip property over a few hand-built block lists.
- `packages/domain/src/print/layout.ts` + `section-10.ts` -- `LayoutParagraph` gains `kind: 'numbered'`, `number?: number` and `runs: LayoutRun[]` (`{ text; bold?: true; italic?: true }`), `text` stays the plain concatenation; own text goes through `parseRichText`, seed blocks get one plain run; section 10 bullets carry runs the same way (keep a plain `text`). Tests in `layout.test.ts` / `section-10` tests.
- `apps/api/src/jobs/generate/docx.ts` + `sections/section-10.ts` -- runs become `TextRun`s with `bold`/`italics`; `numbered` paragraphs use a decimal numbering reference, a new `instance` per list (kernel `number === 1`); the numbering config is added only when the layout has a numbered paragraph, so the golden stays byte-stable. Unit tests in `docx.test.ts`.
- `apps/api/src/jobs/generate/rich-text.integration.test.ts` (or extend `job.integration.test.ts`) -- **11.4-PRINT-BOTH (renderer half)**: a generate job over a snapshot whose section 1 own text holds bold, italic, a bullet and a numbered list; the stored DOCX has `<w:b/>`, `<w:i/>`, bullets and a decimal list on those runs; the stored PDF (pdfjs) holds the words and draws the bold/italic words in bold/italic fonts. Asserted from section 1's heading, not a position (E7-A6).
- `apps/web/src/surfaces/templates/rich-text-editor.ts` (+ unit test) -- DOM <-> `RichBlock[]`: render `<p>`, `<ul><li>`, `<ol><li>`, `<strong>`/`<em>` (read `<b>/<i>` too), chips via `section-text-editor.ts`; serialize any DOM a browser produces (div/p/br/nested) into blocks; paste HTML -> lists + plain paragraphs.
- `apps/web/src/input/use-rich-text-area.ts` -- composer-only hook: the contenteditable area, Negrito/Itálico/Lista/Numeração commands (Ctrl+B / Ctrl+I too) applied to the saved selection so pressing a toolbar button keeps the caret, `aria-pressed` from the selection, Enter = new paragraph (or new item inside a list; Enter on an empty item leaves the list), chip insert/atomic Backspace as in 3.6, an editor-owned history of serialized texts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y restore a previous text, re-render, and autosave it; the browser's own undo stays blocked), autosave through `useFieldCommit` with the kernel-serialized string.
- `apps/web/src/surfaces/templates/section-text-dialog.tsx` -- the `.rt-toolbar` inside `.rich-text` above `.rt-area`; "Variável" (`rt-var`, `aria-expanded`, `aria-controls`) opens the "Inserir dado do relatório" chip row, hidden until pressed (mock `#tc-rich-vars hidden`, EXPERIENCE.md:348 "opens a small list"); the chips behave as in 3.6.
- `apps/web/src/surfaces/templates/template-composer.tsx` -- seed-equal check through `sameRichText`; the opened text is the stored one (parsed by the kernel).
- `apps/web/src/styles/app.css` -- `.rich-text .rt-tool { min-height: var(--touch-min); }` with the DESIGN.md citation; any `.frame-phone` translation the dialog needs.
- `packages/domain/src/registration.ts` (or `account.ts`) -- `photoLocationPut({ userId, companyId, enabled })` -> one `user/field` put draft; unit test.
- `apps/web/src/db/photo-store.ts`, `files/geolocation.ts`, `use-photo-capture.ts` -- `clearGeolocationDenied(db)`, `useGeolocationDenied(db)` live query; the tracker gains `onGranted` (a fix arrived) that clears the pref.
- `apps/web/src/surfaces/account/account-surface.tsx` (+ `copy/pt-br.ts`, `account.css`) -- the "Localização nas fotos" section after "Registro profissional": `Toggle` `aria-labelledby` the label, value from the local user row (default on), writes `photoLocationPut` through `commitBatch` (a session method like `saveRegistration`); `helper-on` / `helper-off` / denied line (denied replaces `helper-on` while on; `aria-describedby` the visible helper); on mount a Permissions API `geolocation` state of `denied` writes the pref and `granted` clears it (absent API: nothing). Update the header comment.
- `apps/web/src/surfaces/account/account-surface.test.tsx`, `templates/*.test.tsx` -- component tests for the new rows and toolbar.
- `e2e/templates.spec.ts` -- update the 3.6 specs to the rich editor (toolbar present, Variável opens the chips, Enter = paragraph, editor-owned undo); new `@p0 11.4-E2E-001`: select a word -> Negrito (aria-pressed true), Ctrl+I on another, a Lista and a Numeração line, a chip inside bold; stored `section_text` asserted in IndexedDB is the kernel markup; reload keeps it; **11.4-UNDO**: Ctrl+Z after Negrito and after Lista restores the prior stored text; paste of HTML with `<b>` and `<ul>` lands as plain text plus a list; at 390 px the toolbar wraps inside the dialog with no horizontal scroll and every `.rt-tool` is ≥ 48 px tall. `@p1 11.4-E2E-002`: a relatório made from the formatted template shows section 2's text in the plain surface with no toolbar and the markup preserved; its DOCX (existing generate/download helpers) carries the bold run (serial group if it generates).
- `e2e/account.spec.ts` / `e2e/photos.spec.ts` -- `@p0 11.5-E2E-001` **11.5-OFF-STAMP**: Account shows the switch on with `helper-on`; switch off (keyboard or tap) -> `helper-off`, outbox holds `user/{id}/photo_location_enabled = false`, reload keeps it off, no "Desfazer" toast (**11.5-UNDO**: no undo by design); a capture then stores `coords: null` and the tile/viewer stamp has no location. `@p0 11.5-E2E-002` **11.5-DENIED**: a context without geolocation permission captures a photo (not blocked, `coords: null`), Account then shows the denied line with the switch still on; granting the permission and capturing again clears the line.
- `packages/domain/src/print/section-7*.test.ts` -- assert a photo with `coords: null` prints date and time only (add if not covered).
- `_bmad-output/.../mockups/prototype/screens/42-template-composer.html:386`, `90-account.html:68` -- remove `data-slice` / `data-slice-note` (keep the drawing).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- close the `:737-740` entry (Story 11.5: the Account switch reads the pref; it stays device-local by design, the OS permission is per device); add entries for the two deferred assertions below.

**Acceptance Criteria:**
- Given the composer's text dialog, when the user formats with the toolbar or Ctrl+B/Ctrl+I, then only bold, italic, bullet and numbered lists exist, the stored `section_text` is kernel markup, and it prints in the DOCX and PDF (FR-12).
- Given a paste of rich HTML, when it lands, then only plain text plus list structure is kept.
- Given a template text without markup (every seeded or 3.6-written text), when a relatório prints, then the document is unchanged (golden green).
- Given the relatório's Section text surface, when opened on formatted text, then it is the plain editor with no toolbar and saving keeps the markup.
- Given Account, when "Localização nas fotos" is off, then new photos carry date and time only; when the OS denied location, the denied line shows and the switch stays on; capture is never blocked (FR-8).

## Design Notes

Why markup in the string rather than a new field: `section_text` flows unchanged through `setSectionText`, `instantiateTemplate` (`instantiate.ts:105`), undo/restore batches, the relatório's block config and Story 11.3's template-from-relatório copy (batch B), with no row-shape change, no contract bump and no migration; the kernel is the only reader. Example: `"Serviços:\n- **Termografia** dos painéis\n1. Limpeza\n2. Reaperto *quando aplicável*"`.

Deferred (owner named, `deferred-work.md` entries): **11.4-TEMPLATE-FORMAT** needs 11.3 (batch B): the coordinator's integrated QA asserts it once B and E are both on main. **11.4-PRINT-BOTH PDF download** through the UI needs 11.1 (batch A): same owner; the renderer half is covered here by the api integration test.

Open questions (conservative choice taken): (1) the per-relatório plain surface shows markup characters raw rather than hiding or dropping them; (2) "Variável" hides the chip row until pressed (mock) rather than keeping 3.6's always-visible row; (3) undo of formatting is the editor's own Ctrl+Z history, not a toast.

## Verification

**Commands:**
- `docker compose --profile tools run --rm tools pnpm test:unit` -- green
- `docker compose --profile tools run --rm tools pnpm test:api` -- green, including the new rich-text generate test
- `docker compose --profile tools run --rm tools pnpm exec tsx scripts/e2e.ts --project desktop-chrome e2e/templates.spec.ts e2e/account.spec.ts e2e/photos.spec.ts` (targeted, all tags, one worker; add `--grep` while iterating) -- green
- `pnpm verify` under `flock /tmp/fasor-verify.lock` -- green (the orchestrator runs it; the implementer does not)
- Every command runs in Docker from the worktree (its `.env` names the compose project `fasor-e11e`); never pnpm/node on the host. Redirect output to `.scratch-e11e/*.log` and read tails.
