# Spec reconciliation drafts of 2026-11-03 (E15-A11, E16-A7, E17-A7, E18-A4)

Drafts for Matheus's approval; nothing here is applied. `_bmad-output/planning-artifacts/epics.md` is unchanged by this file. Line numbers are those of `epics.md` at `0fede8ac` (4823 lines). Each amendment follows the rule of AGENTS.md: no sentence is deleted; the superseded words are struck through with `~~…~~` and the new words follow beside them, dated 2026-11-03 with the action item. Long lines are quoted as the exact excerpt that changes; the rest of the line stays as it is.

On approval the coordinator applies the amendments in one commit, adds a `docs/kbs/log.md` line, and moves the four action items in `sprint-status.yaml`. An item that waits for a decision says so and offers the text for each answer.

## E15-A11: superseded numbers in Stories 15.3 and 15.6

Source: `epic-15-retro-2026-10-26.md` R15-4 (its line numbers were 4039, 4043 and 4147 before later inserts; today they are 4043, 4047 and 4151). The as-built lines (4063, 4163) already record each deviation; the criteria themselves still read the old numbers.

### 1. Story 15.3, the seed-v9 criterion: the TC's field count (line 4043)

Current excerpt:

> the TC nameplate without `potencia_nominal` (11 fields; TP keeps VA and the transformer kVA)

Proposed:

> the TC nameplate without `potencia_nominal` (~~11 fields~~ *(2026-11-03, E15-A11: 13 fields; v1 gave the TC 14, its 12 plus RELAÇÃO and EXATIDÃO, so dropping one leaves 13)*; TP keeps VA and the transformer kVA)

Evidence: PR #161, merged as `e8a144a6`, as-built line 4063 ("the TC keeps **13** fields (v1 gave it 12 plus RELAÇÃO and EXATIDÃO), not 11"); `packages/domain/src/seed/v9.ts:35` (`TC_DROPPED_FIELD = 'potencia_nominal'`, the only field removed); `packages/domain/src/seed/seed.test.ts:1679-1681` (the v8-to-v9 difference test re-inserts exactly that one field for `tc`).

### 2. Story 15.3, the checklist and nameplate criterion: the dry chip and the field count (line 4047)

Current excerpts:

> the dry chip reads "Marcar 7 itens de óleo como NA", the oil rule marks seven items NA on a dry unit

> the TC's DADOS DO EQUIPAMENTO shows and prints 11 fields with the last printed row padded

Proposed:

> ~~the dry chip reads "Marcar 7 itens de óleo como NA",~~ *(2026-11-03, E15-A11: there is no dry chip on v9; the Story 14.11 oil rule marks the seven items NA itself:)* the oil rule marks seven items NA on a dry unit

> the TC's DADOS DO EQUIPAMENTO shows and prints ~~11 fields~~ *(2026-11-03, E15-A11: 13 fields)* with the last printed row padded

Evidence: as-built line 4063 ("there is **no "Marcar 7 itens de óleo como NA" chip** on v9, since the Story 14.11 oil rule marks the seven items NA itself (the tests assert the seven NA)"); `packages/domain/src/seed/seed.test.ts:1698` ("the three transformers: 14 checklist items, item 13 with four phrases, seven oil items in the dry defaults and the oil rule"); `packages/domain/src/seed/v9.ts:8-12` (header comment: the dry defaults and the oil rule hold seven items).

### 3. Story 15.6, the ratio criterion: 62,89 to 62,90 (line 4151)

Current excerpt:

> **Then** VAL CALCULADO is 62,89 (U1·√3/U2, formatted as today)

Proposed:

> **Then** VAL CALCULADO is ~~62,89~~ *(2026-11-03, E15-A11: 62,90; 13800 x √3 / 380 = 62,9008, so 62,89 was an arithmetic slip)* (U1·√3/U2, formatted as today)

Evidence: PR #161 (`e8a144a6`), as-built line 4163 ("**62,90** for 13,8 kV / 380 V (this text's 62,89 was an arithmetic slip)"); `packages/domain/src/relatorio/readings.test.ts:259,269-271` (`calculated` is `{ raw: '62.900792', text: '62,90' }`). The tolerance sentence after it (62,8 within ±0,5 %, 36,3 out) holds against 62,90 and stays.

## E16-A7: Story 16.1 as built, the 16.4 undo criterion, the altitude

Source: `epic-16-retro-2026-10-26.md` R16-19, R16-20, R16-16 (G3).

### 1. Story 16.1: the missing as-built line (insert between lines 4238 and 4240)

Lines 4238 (Definition of Done) and 4240 (Bruno's answer 7 on the Word look) stay. Proposed new line 4239, nothing struck:

> *(2026-10-23, PR #179, batch e16a, squash-merged as `8124f2a4`; deployed as v0.3.2, recorded in `7eeae579` (PR #180); this line written 2026-11-03, E16-A7.)* `LOGO_MAX_WIDTH_PX` is half the content width minus `CELL_MARGINS_TWIPS`, in px rounded down (334, was 349); `logoHeader` sizes the logo cell as the drawing plus the margins, clamped at half the content width, and the lines cell takes the rest; the 3 cm height cap and the plain header are unchanged; a width-capped logo prints 0.38 cm narrower (8.85 cm). Narrowings: the wide-logo and tall-logo cases are their own `it` ("Story 16.1") beside "A11" in the same `describe`, not a branch inside A11; the visual check rendered `buildDocx` on the Porto Seguro fixture with a synthetic 800x200 PNG through the api container's LibreOffice, not an uploaded logo through the files pipeline and a preview job (the header reads the image's own dimensions); the page image went to Matheus, not as a screenshot in the PR; the look in Word was left to Bruno's next download (closed by his answer 7, the line below). The review's patches were re-run with `docx.test.ts` alone, and main was left red on `static` (TS2345), fixed in PR #181 (E16-A9).

Evidence: `git show --stat 8124f2a4` (PR #179); `_bmad-output/implementation-artifacts/spec-16-1-the-header-logo-fits-its-cell.md:26-31` (implementation notes, the narrowings, the evidence per AC); `epic-16-retro-2026-10-26.md` R16-5 (static red) and R16-19; `epics.md:4240` (Word look closed on 2026-10-27).

### 2. Story 16.4, the undo criterion (lines 4342-4344)

Current:

> **Given** an undo of the N.A commit
> **When** "Desfazer" runs
> **Then** the field returns to its previous value as for any put (the undo pair is the existing one)

Proposed (lines 4342 and 4344 unchanged):

> **Given** an undo of the N.A commit
> **When** ~~"Desfazer" runs~~ *(2026-11-03, E16-A7: the put's inverse is applied; a typed nameplate or cabine put raises no "Desfazer" toast, like any typed value, and neither does the Story 17.3 "N/A" control: only batch actions do)*
> **Then** the field returns to its previous value as for any put (the undo pair is the existing one)

Evidence: `_bmad-output/test-artifacts/manual/qa-e16-2026-10-26.md:39` ("not reachable by hand: a typed nameplate or cabine put, like any typed value, raises no "Desfazer" toast … The undo pair is covered by the story's unit tests"); PR #183 (`5cece708`); `apps/web/src/surfaces/ficha/ficha-fields.test.tsx:446` (a stored "N/A" replaced by a number at rest); `apps/web/src/components/not-applicable-button.tsx` (no toast).

### 3. "Altitude do site" and N.A (QA G3): already landed, no draft

Matheus's decision was taken through Bruno's answer 4 of 2026-10-27, recorded under Story 16.4 at line 4350 ("Altitude do site also takes N/A or comes from the phone's position … Story 17.6 (the altitude, contract 27 …)") and built as Story 17.6 (line 4563, PR #193, `6c28b886`); the ledger row is closed (`deferred-work.md` § Epic 16 integrated QA browser pass, G3). This third line of E16-A7 needs no new text.

## E17-A7: Stories 17.1, 17.6, 17.2 and the Epic 17 preamble

Source: `epic-17-retro-2026-10-28.md` F2 and the A6-style reconciliation list (lines 94-95 of the retro), action 150.

### 1. Story 17.1, Definition of Ready: what a "Geral" photo is (line 4383)

Current excerpt:

> a "Geral" photo is one with `block_id`, `item_key` and `location_id` all null and `reading_kind` null;

Proposed:

> a "Geral" photo is one with `block_id`, `item_key` and `location_id` all null and ~~`reading_kind` null~~ *(2026-11-03, E17-A7: `reading_kind` null or `'caption'`, since Story 9.3 gives `'caption'` to every photo with no sheet, no caption and no "Pessoas na foto" mark)*;

Evidence: PR #190 (`0bdd925a`), dated line 4401 ("Narrowing: `isGeralPhoto` accepts `reading_kind` null or `'caption'` … so the literal default emptied section 7"); `packages/domain/src/photos/order.ts:70-76` (`isGeralPhoto`).

### 2. Story 17.6, the criterion on what shows "N/A" (line 4555)

Current excerpt:

> the sheet's read-only Altitude and the cabine line show "N/A", and the document prints "N/A" in the altitude's place

Proposed, while Matheus's E17-A2 item for 17.6 (whether the cabine line should carry the altitude) is open:

> the sheet's read-only Altitude ~~and the cabine line show "N/A"~~ *(2026-11-03, E17-A7: shows "N/A"; the cabine line never carried the altitude and still does not, as built)*, and the document prints "N/A" in the altitude's place

If Matheus decides the cabine line carries the altitude, the dated text instead reads *(2026-11-03, E17-A7: the cabine line gains the altitude, Matheus's decision of <date>; built by <story>)* and the struck words come back unstruck in the new text.

Evidence: PR #193 (`6c28b886`), dated line 4563 ("Narrowings: the cabine line never carried the altitude and still does not … Decisions pending for Matheus: whether the cabine line should carry the altitude"); `packages/domain/src/relatorio/cabine.ts:136-147` (`cabineLineText`: type, kV, V, kVA, °C, %; no altitude); `epic-17-retro-2026-10-28.md:94`.

### 3. Story 17.2, the first criterion: "same toast" (line 4419)

Current excerpt:

> the photo it returns runs the pipeline as a viewfinder shot does (same op, same `reading_kind`, same coordinates rule, same toast and badge), a HEIC answer takes the import path's conversion

Proposed:

> the photo it returns runs the pipeline as a viewfinder shot does (same op, same `reading_kind`, same coordinates rule, ~~same toast and badge~~ *(2026-11-03, E17-A7: same badge; the toast is always the one-photo one, one file per pick, and a HEIC answer loses its EXIF in `heicToJpeg`, so its stamp takes the device clock and position)*), a HEIC answer takes the import path's conversion

Evidence: PR #194 (`3beacd40`), dated line 4439 ("Narrowings: the camera-app path always toasts the one-photo words; … a HEIC loses its EXIF in `heicToJpeg`, so the stamp takes the device clock and position"); `apps/web/src/surfaces/ficha/camera-single-shot.tsx:106-107` ("One file per pick, so the done toast is always the one-photo one") and `:125` (`heicToJpeg`); `epic-17-retro-2026-10-28.md:95`.

### 4. Epic 17 preamble: v0.3.4 skipped (lines 4365 and 4371, plus one new line)

Current excerpts:

> line 4365: after wave A's gate, a deploy as v0.3.4 (Bruno sees the numbers, the N/A control and section 7 at once);

> line 4371: Deploy v0.3.4 after it, on Matheus's go.

Proposed: strike both excerpts in place (`~~after wave A's gate, a deploy as v0.3.4 (Bruno sees the numbers, the N/A control and section 7 at once);~~` and `~~Deploy v0.3.4 after it, on Matheus's go.~~`) and add a new line after 4371:

> *(2026-11-03, E17-A7: v0.3.4 was skipped. Both waves merged before Matheus's go, which came on the afternoon of 2026-10-28 for one deploy from the integrated main; Epic 17 and Story 15.7 shipped together as v0.4.0, `8f5fa154`, the same day (smoke 8 of 8). The tag `v0.4.0` has no GitHub release page; its changes are listed in the v0.5.0 notes.)*

Evidence: `epic-17-context.md:96` ("Production deploy v0.4.0, 2026-10-28, `8f5fa154` … v0.3.4 skipped"); `docs/kbs/log.md:134`; `release-notes-v0.5.0.md:5,9` ("v0.4.0 stays a tag without a page"); `epic-17-retro-2026-10-28.md` F2 (line 59).

## E18-A4: the Epic 18 intro and Stories 18.1 to 18.3

Source: `epic-18-retro-2026-10-30.md` A6 (a) to (e) (lines 44-49). Item 5 waits for Matheus's decision E18-A5 item 1.

### 1. The epic's `SCREENS` list gains `points` (line 4607)

Current excerpt:

> `gallery`, `export`,

Proposed (an insertion; nothing struck):

> `gallery`, `points` *(added 2026-10-29 by the coordinator, o18a D5: section 8, Pontos de atenção, is a funnel step of its own; recorded 2026-11-03, E18-A4)*, `export`,

Evidence: PR #213 (`3b45e83c`); `packages/domain/src/contract/telemetry.ts:41-43` (`SCREENS`, with the D5 comment) and `:187` (`screenOf`: `/relatorio/{id}/pontos` maps to `points`); `spec-epic-18-o18a.md:161,191` (D5 amended).

### 2. Story 18.2, Definition of Ready: the stream name (line 4667)

Current excerpt:

> one stream per api process named `api/<start ISO instant>/<pid>`, created at first use;

Proposed:

> one stream per api process named `api/<start ISO instant>/<pid>` *(2026-11-03, E18-A4: as built, the instant's colons are written `-`, since CloudWatch refuses `:` in a stream name)*, created at first use;

No word is struck: the name's shape stands and the note says how the instant is written. If Matheus prefers the strike form: `~~named `api/<start ISO instant>/<pid>`~~ named `api/<start ISO instant, colons written ->/<pid>``.

Evidence: PR #213 (`3b45e83c`); `apps/api/src/telemetry/sink.ts:34-35` (`logStreamName`: `start.toISOString().replaceAll(':', '-')`); `infra/README.md:161`.

### 3. Story 18.3, Definition of Ready: "from the `ops` table alone" (line 4707)

Current excerpt:

> the fields edited more than once and the typed values that followed a failed reading, from the `ops` table alone;

Proposed:

> the fields edited more than once and the typed values that followed a failed reading, ~~from the `ops` table alone~~ *(2026-11-03, E18-A4: every number from the `ops` table, with the live `relatorio` and `block` entities read in the same read-only snapshot for liveness and status)*;

Evidence: PR #212 (`62bdd76c`); `apps/api/src/db/friction-read.ts:242-269` (`readFriction`: one repeatable-read, read-only transaction over `readRelatorios`, `readBlocks` and `readOps`); `epic-18-retro-2026-10-30.md:48` (A6 d: "the AC holds").

### 4. Story 18.1's `wait` for a preview and a generation (line 4611)

The minimum instrumentation lives in the epic intro, which Story 18.1 builds. Current excerpt:

> `wait` with `kind` and `duration_ms` for a reading (shot stored to result), a sync cycle, a preview and a generation;

Proposed (an insertion; nothing struck, since the wait is recorded, only measured on a shorter span):

> `wait` with `kind` and `duration_ms` for a reading (shot stored to result), a sync cycle, a preview and a generation *(2026-11-03, E18-A4: as built, the `preview` and `generate` waits time the request that enqueues the job, not the wait until the document opens (first production read of 2026-10-30: 26.8 s on screen, 176 ms in the `waits` view); Story 18.4 re-times them to the document)*;

Evidence: `spec-epic-18-o18a.md:195` (residual risks: "generate and preview waits time the request, not the job"); `docs/observability.md:31` (the caveat in § waits); `deferred-work.md` § Epic 18 batch o18a, the narrowed-instrumentation row (owner Story 18.4); `epics.md` Story 18.4 Definition of Ready, scope item 5 (line 4735).

### 5. The epic intro's "a notice in Conta and in the terms" (line 4599): waits for E18-A5 item 1

Current excerpt:

> (LGPD: employees' interactions; a notice in Conta and in the terms)

The Conta notice exists ("Uso do aplicativo", `apps/web/src/copy/pt-br.ts:123-126`, `account-surface.tsx:430`); no terms page or text exists in `apps/web` (retro A6 b). Two drafts, one per answer:

- (a) Matheus strikes the terms: `(LGPD: employees' interactions; a notice in Conta ~~and in the terms~~ *(2026-11-03, E18-A4, Matheus: the app has no terms text; the Conta notice is the notice)*)`
- (b) Matheus schedules a terms text: `(LGPD: employees' interactions; a notice in Conta and in the terms *(2026-11-03, E18-A4, Matheus: the terms text does not exist yet; <story or owner> writes it with Bruno's LGPD wording)*)`

Evidence: `epic-18-retro-2026-10-30.md:46` (A6 b); `sprint-status.yaml` action E18-A5 item 1.
