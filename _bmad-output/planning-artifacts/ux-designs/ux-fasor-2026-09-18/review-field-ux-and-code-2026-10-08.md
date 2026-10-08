# Field UX, AI and code structure review (2026-10-08)

> Addendum (2026-10-08, after the static analysis): a browser pass then ran on a dedicated stack (compose project `fasor-review`, worktree at `e0efac7`, same app code as `a8b9b0e`, fake providers, camera stub). Section 12 records the manual (human-style) pass; section 13 records the agent journeys. Where they confirm or contradict the static findings, the section says so. Statements below that say no browser ran describe the static phase only.

Matheus requested this review on 2026-10-08. It builds on `review-field-ux-2026-10-06.md` in this folder and does not repeat it. It reflects repository main at `a8b9b0e` ("Epic 13 retrospective and closing statuses (#111)"). Line numbers refer to that revision and will drift as fixes land.

## 1. Purpose, method and baseline

### 1.1 Purpose

The brief (Matheus, 2026-10-08) asked for two things.

1. **Field experience.** The user is an electrical engineer on site, often in poor light. He reads equipment nameplates and assembles relatórios. He wants to touch the screen as little as possible and to use photos as the main source of data. The app has to work by touch on phone and tablet and from photos of the equipment. OCR and LLM should help him read data and build the relatório (captions, conclusions, and anything else that improves the experience). Bruno has used two of the competitors: Field Control and Produttivo.
2. **Code structure.** The brief asked about structure, complexity, and repeated code that could become shared functions or classes.

### 1.2 Baseline (built on, not repeated)

- **Field UX review, 2026-10-06** (findings CAP-1..4, INP-1..4, WAIT-1..3, AI-1..3). It became Epic 13. Stories 13.1 to 13.8 are merged (PRs #103 to #107, fix batches #109 and #110). Story 13.9 (dictation) is deferred, and `VITE_SPEECH_ENGINE` defaults to `none`.
- **MVP hands-on review, 2026-10-06** (`_bmad-output/implementation-artifacts/reviews/mvp-review-2026-10-06/README.md`, F-01..F-29). Most of it was fixed in PRs #98, #99 and #109.
- **Epic 13 retro** (`epic-13-retro-2026-10-08.md`):
  - `camera-view.tsx` is 899 lines.
  - There are two pointer-gesture implementations; action E13-A6 covers this.
  - Nothing has been checked on a real device (E13-A3).
  - `test:unit` was merged red on 5 of 7 code PRs (R13-6, E13-A2).
- **Binding decisions:**
  - NFR-12: the conclusion, parecer and context captions are composed deterministically on the device, never by a model (`epics.md:145`).
  - A Suggestion is an entity, and nothing is written without a tap.
  - The 2026-09-19 field recalibration (`source-deltas.md:47`): helmet, insulating gloves, lit work area, stylus. The binding lighting risk is the dark cubicle interior.
  - AWS spend stays under USD 100 per month, everything included.
  - `LLM_PROVIDER` and `OCR_PROVIDER` default to `fake`.
  - The app is offline-first.
  - AGENTS.md ownership: the kernel computes; `apps/web` renders from IndexedDB and writes ops; `apps/api` applies ops and renders documents.

### 1.3 Method

- **Thirteen lenses.**
  - UX: journeys (JRN), capture (CAPT), AI for reading (AIR), AI for building the relatório (AIB), field conditions (FLD), market (MKT), plans (PLN).
  - Code: web surfaces (WEB), web data (WDT), domain kernel (DOM), api and OCR sidecar (API), tests (TST), cross-cutting (XC).
- **Adversarial verification.** A separate verifier re-checked every finding against main. Verdicts were confirmed, partly (a correction was applied), already planned, or verifier-added (`-V` ids). 251 lens findings remain: 132 UX and 119 code. None was dropped. When a verifier corrected a finding, this report uses the corrected version and marks it "(corrected)".
- **Two syntheses.**
  - A UX/AI judge scored three candidate directions (photo-first, tap diet, AI copilot) and merged them into one direction and roadmap.
  - A code synthesis grouped the 119 code findings into abstractions, structural issues and refactor waves.
- **Gap round.** Eight investigations covered what the syntheses left open:
  - G1 storage eviction
  - G2 contract skew
  - G3 production capacity and cost
  - G4 typed-reading components and areas the metrics scan missed
  - G5 the generated document at real size
  - G6 the merged sequence and calendar
  - G7 two tablets on one relatório
  - G8 the competitors' core workflow

  They produced 52 findings, integrated below. Where a gap answer contradicts a synthesis, this report follows the gap answer (section 1.4).
- **Editor checks.**
  - Confirmed HEAD `a8b9b0e`.
  - Re-read the 2026-10-06 review.
  - Fetched `https://fieldcontrol.com.br/field-elo.html` to settle G8-5. The page lists "Validador de OS", "Resumo Automático", "Score de Formulários" and "Reescrita de Formulários", with credit pricing. G8-5 is therefore refuted (section 11).
- **Static analysis only.**
  - No device, browser, test, container or dev server was run. A wave gate was running on the host, and the E11-A1 load rules forbid extra Playwright or stack load beside it.
  - No target tablet was available, and the E1-A1 device script has never been run.
  - Every claim about cameras, lighting, real touch, iOS keyboards, iPad storage, document size or generation time is therefore an estimate from code, marked as such.
- **Metrics.** The size, complexity and clone numbers come from a read-only scan with an approximate tokenizer. It is a session scratch file, not tracked in the repo. G4 found that its function ranges are offset for three components and that its clone scan misses copies whose token shapes differ. Treat its numbers as hints.
- **Severity.**
  - High: loses work, puts a wrong value in a signed document, blocks the field, or costs a large recurring number of touches.
  - Medium: a real but bounded cost.
  - Low: maintenance or polish.
- **Estimates.** Tap counts come from code paths, not from a device. Line savings are the lenses' estimates. Costs use list prices (`bedrock.ts:69-78`, Textract USD 1.50 per 1,000 pages).

### 1.4 What the gap round changed in the syntheses

| # | Synthesis said | Corrected to | Source |
|---|---|---|---|
| 1 | AI cost is checked against "USD 30 Bedrock plus USD 7.50 Textract" allowances | The binding number is AI headroom. Infra without AI is USD 45.02/month on t3a.medium (66.75 on t3a.large), and the budget action denies AI at 90% of USD 100, which leaves about USD 45 (about 23 on large) | G3-6; `infra/README.md:126-143`; `budget.tf` |
| 2 | About 1,100 display shots per job; the sidecar runs 2 to 2.5 h a day | The delivered job holds **659** capture cells (`snapshot.golden.json` against `seed/v1.ts:357-497`). A realistic load is 660 to 810 shots, with 1,100 as the FR-42 ceiling. At 7.5 to 15 s a shot (unmeasured on the production CPU), that is about 0.5 to 1.5 h a day over a 3-day job | G3-5 |
| 3 | Open question: "Is production `ai_features` on?" | The untracked `infra/production/terraform.tfvars` sets AI on, Bedrock, and Textract for plates and panels, with plan files dated 2026-10-05. The apply could not be confirmed. Tracked docs (`infra/README.md:55`, `variables.tf:84`) still say off, and the sidecar OOM on plates is recorded only in that untracked file. The question becomes "confirm and document it" | G3-1 |
| 4 | 14.23 (reading concurrency 2) may need more memory | Concurrency 2 adds no sidecar CPU or memory, because inference is serialized (`services/ocr/app/main.py:51`). The real prerequisite: display reads still run the detector that ran out of memory on plates, and the ocr container has no hard memory limit | G3-2 |
| 5 | "Storage-pressure handling is solid" | Refusal at capture is solid (13.6). Warning before eviction is blind: `quota - usage` is not free space. The 5-day banner counts only ops, not photos | G1-1, G1-2 |
| 6 | Contract bumps are routine story ACs | Every bump that raises `MIN_CONTRACT_VERSION` replaces the whole shell on every online tablet within about 60 s and blocks capture. This happened at 12 of 14 past steps. A new enabling story (14.28) must come first, and MIN-raising stories ship as one release train | G2-1, G2-2, G2-5 |
| 7 | Photo-first means more capture assists | Every reading photo prints twice (sections 7 and 9) at about 600 dpi. More capture makes the deliverable heavier: an estimated 25 to 140 MB, and possibly 600+ pages at FR-42 scale. Capture-assist stories depend on a print rule (14.31) | G5-1, G5-2 |
| 8 | SM-4 is a checkbox in 14.2 | It is an ordered gate: 14.31, then the 14.32 scale probe, then a Bruno session on a document with real photos | G5-6 |
| 9 | 14.16 suggests the cabine SE | `location/se` and `location/env` merge last-writer-wins with no filled-beats-empty rule. 14.16 must state its merge rule first (14.33) | G7-2 |
| 10 | Code plan §6.3: `MeasurementField`, `ChecklistRow`, `InstrumentPicker`, `QuantityStepper` not examined | G4 examined them. `QuantityStepper` is used only by the template composer and is not on the field path. The real hub is five numeric-cell variants plus `useNumberInput`. `TemplatesSurface` and `SessionProvider` remain unexamined | G4-2 |
| 11 | Seam table: 14.8 creates `providers/aws-call.ts`; 14.11 adds `registerEntityJobWorker`; 14.4 and D6 both own the clock hook | The AWS layer goes in `apps/api/src/ai/` (the audit is not a reading). The worker helper covers generate and audit only, never reading. The clock hook has one owner, landed in wave 1 or inside 14.4 | G6-2, G6-3, G6-4 |
| 12 | Refactor wave 0 is drift fixes | E13-A1, E13-A2 (the red unit stage) and E13-A4 are wave-0 blockers for both plans. The copy split (1.1) lands only on a quiet main, or is dropped | G6-5 |
| 13 | 14.1 runs `bedrock-eval` on the corpus | `bedrock-eval` measures recall only, skips displays and the escalation cascade, and does not test whether Verificar predicts a wrong value. Extending it is part of 14.1 | G4-8 |
| 14 | 14.27 ships dictation if the consent wording is decided | As built, dictation costs about 2 taps per table cell against about 1 Enter per cell when typing. 14.27 depends on multi-cell utterances and a `processLocally` probe | G4-7 |
| 15 | Market compared AI only | Both reference apps are field-service suites (dispatch, service-order PDF, client signature). Every "Bruno used/liked" statement is a relay by Matheus, not first-hand | G8-1 |

## 2. Executive summary

1. **The foundations hold.**
   - Layer rules, kernel purity, tenant scoping and the trust model (Suggestion as entity, digit coverage, no write without a tap) all check out on main.
   - Epic 13 closed every 2026-10-06 finding except dictation.
   - **No field claim has been verified on a real device.** The E1-A1 script, "blocking before Epics 5 and 6", has never run, and the platform line (does iPadOS Safari stay supported?) is still undecided (PLN-1, E13-A3).
2. **Five touch costs remain, and the tap budgets miss them.**
   - About 94 hidden taps per job: "Concluir ficha" does not confirm the conclusion text, so concluded sheets print without it (JRN-V1, AIB-1).
   - About 33 taps and 8 camera start-ups to photograph 8 plates sheet by sheet, against about 11 with a cabine plate walk (CAPT-2).
   - About 2 picker taps per test kind on the first sheet (JRN-2).
   - A confirm round of about 2 taps per sheet for plates read offline (JRN-5).
   - 80 to 120 keystrokes per NC point of attention (JRN-6, AIB-7, AIB-8).
3. **Photos fail silently in three ways.**
   - A dark plate shot ends as a silent "done" with zero fields (CAPT-V1).
   - A failed burst shot's toast renders under the opaque camera scrim and is never seen (FLD-V1).
   - Nothing checks shot quality at the shutter, and nothing keeps the screen awake (CAPT-1, FLD-1).
4. **AI reading has three concrete defects.**
   - "13.800 V" on a kV field becomes 13800 kV (AIR-1).
   - Year-only plate dates, 20 of 32 in the delivered job, can never be suggested (AIR-V1).
   - Plate trust ignores OCR word confidence (AIR-2).

   No AI reading has been measured on a real photo (AIR-12). Display reading scored 40% on tiny crops, a pessimistic lower bound (AIR-5).
5. **The AI that builds the relatório has gaps.**
   - A stale conclusion disappears from section 9 without a warning (AIB-1).
   - The 13.8 audit pays a model for two checks the kernel already computes (AIB-2). On a 94-sheet job it very likely truncates, and then still says "Nenhum ponto encontrado" (AIB-3).

   The right AI targets are a semantic audit, NC and point drafts, and action suggestions. Conclusions and the parecer stay deterministic.
6. **The deliverable has never been seen at real size.**
   - Photos embed at about 600 dpi and every reading photo prints twice, giving an estimated 25 to 65 MB at parity (too big for email) and up to 1 GB at FR-42 scale (G5-1, G5-2).
   - Generation has never run with photo bytes on the production host (G5-3).
   - SM-4 (Bruno recognizing his FO.SERV-03) has never been judged (G5-6).
7. **Infrastructure can stop the field.**
   - A contract bump blocks capture on every online tablet within about 60 s (G2-1).
   - Android can evict unsynced work with no prior warning (G1-1).
   - A cold start on weak signal can hang (G4-6).
   - The production instance stops 00:00 to 05:00, while maintenance shutdowns often run at night (G3-4).
8. **Market.**
   - Plate OCR is now table stakes: ServiceTrade, FastField and CxPlanner ship it, and Mesh Labs Ensaia announces it (pre-launch, Android).
   - Fasor's ground is digit-grounded confirmation across every block type, displays, panel-to-block, the audit, and FO.SERV-03 DOCX/PDF on iPad.
   - What Bruno liked or rejected in Field Control and Produttivo was never recorded (G8-1).
9. **Direction.**
   - First make the photo reliable: an empty-reading state, visible failures, wake lock, retake.
   - Remove the touches the device can already remove.
   - Only then scale capture and reading behind one device session and one real-photo corpus.
   - Scores: tap-diet backbone 31/35, photo-first 24, AI copilot 25.
10. **Code.**
    - The debt is copy-forward growth: about 18 verified behavior drifts, all caused by copies.
    - 26 of the 32 functions above cx 40 are in `apps/web`, which has the lowest test ratio (0.67).
    - The kernel has one 10-file runtime import cycle.
    - Nothing forbids `test.only`, so one stray focus can turn the merge gate green on a single test.
    - About 25 shared abstractions remove roughly 2,500 to 3,000 source lines and whole classes of drift.
11. **Plan.**
    - Wave 0: the evidence gate (device session, photo corpus, Bruno session), the gate-integrity fixes, and the enabling stories (contract skew, unsynced work, a sendable relatório).
    - P0 field wave, then P1, with the refactor units folded in by file ownership.
    - About 63 merged units, roughly 9 to 13 days of agent wall time, realistically 3 to 4 weeks including decisions and device passes (G6).
12. **About 45 decisions are needed** (section 10). The ones that unblock the most: Concluir confirming the text, the 13.2 torch scope, ART/TRT out of the field gate, the contract-outdated state becoming non-blocking, the print default for reading photos, `persist()`, night work, and Bruno's tablet model.

## 3. Where the product stands after Epic 13

### 3.1 Strengths, with evidence

| Area | Strength | Evidence |
|---|---|---|
| Write discipline | Outside `apps/web/src/db` nothing writes Dexie. `useRelatorioEditor` is the one write path for the tree, the Sumário and the ficha | `db/commit.ts:80`, `db/sync-store.ts:144-145`; `relatorio-editor.ts:83-150` |
| Kernel purity | No `Date.now`, `new Date()`, `Math.random`, `fetch` or `process.env` in the kernel. Clock and ids are injected. 104 `z.infer` sites | `packages/domain/src/clock.ts:3-7`, `ids.ts:7` |
| Derived text | No singular/plural logic in surfaces (one exception, XC-4). Status words and counts come from the kernel | `pre-issue.ts:486`; `home-surface.tsx:194` (empty state only) |
| Tenant safety | `CompanyId` is minted only by `asCompanyId`. Every handler calls `requireSession` first. File keys are derived, never read from rows | `db/repositories/company-id.ts:10-22`; `files.ts:24-31` |
| Trust model | The LLM cites OCR token ids only and never coordinates. Trust comes from digit coverage on the server. "Confirmar todos" skips Verificar and create hints | `bedrock.ts:29-37`; `reading/digits.ts:31-36`; `suggestion-group.ts:81-85` |
| Lost taps | The sheet renders rows held while a finger is down, and every journey spec asserts each tap's effect | `ficha-surface.tsx:70-72`; `e2e/support/taps.ts:21-60` |
| Tap budget | Enforced as a test: J1 9 taps / 36 keys, J3 7 taps / 47 keys, with a page listener cross-checked against the spec tally | `e2e/tap-budget.spec.ts:34-37, 127-130` |
| Forward flow | Home "Continuar: TAG · n de N" is 1 tap. "Concluir e avançar" concludes and opens the next sheet | `journey-forward.spec.ts:145-148`; `use-ficha-actions.ts:121-155` |
| One viewfinder | All seven in-app openers share `useCamera`/`CameraView`. Torch, zoom and focus are capability-gated. Single shots use `takePhoto` with a frame-at-tap fallback | `camera-view.tsx:90-401, 444-469, 512-556` |
| Durable capture | Every shot is committed locally in order with time and position. A quota refusal is held, never lost | `use-photo-capture.ts:126-185`; `files/capture-rescue.ts` |
| Inference already used | Ratio inputs read from the plate. The instrument is suggested from the last one used. The sheet observation is suggested from NC items. Context captions are composed at capture | `reading-cells.ts:236-249`; `use-ficha-actions.ts:136-139`; `photos/caption.ts:274-280` |
| Glove targets | 48/56 px with zero exclusions on Home, Sumário, tree and sheet; ink contrast 7.4:1 or better | `ergonomics.spec.ts:31,134`; `styles/contrast.test.ts:57-74` |
| Privacy | A photo marked "Pessoas na foto" is never sent to vision | `reading/prose.ts:83-88`; `source-deltas.md:31` |
| Cost control | Every call is priced, and an unpriced model is refused at boot. The budget action denies Bedrock and Textract at 90% | `bedrock.ts:69-92`; `infra/production/budget.tf` |
| Engine design | `createSyncEngine` takes every side effect as a dependency (51 deterministic tests). The retry table is pure. The Dexie schema is an append-only version table | `sync/engine.ts:88-111`; `sync/policy.ts`; `db/schema.ts:166-231` |
| Test infrastructure | Per-worker company pairs with a leak check, a timing reporter, fail-fast timeouts, no retries, and a reason recorded for every serial spec | `e2e/support/merged-fixtures.ts:23-44`; `groups.ts:11-110` |
| Hygiene | No TODO/FIXME/HACK markers, kebab-case everywhere, 3 dead copy keys out of 948, one file-level cycle in 230 web files | XC strengths |

### 3.2 What Epic 13 fixed

| 2026-10-06 finding | Story | State on main |
|---|---|---|
| CAP-1 resolution | 13.1: stream asks for 3840x2160 (ideal); single shots use `takePhoto` | Merged. The encode cap of 2560 px / 0.85 is kept unmeasured (`epics.md:2777`, R13-14). Bursts are still frame grabs by scope (CAPT-9) |
| CAP-2 torch, zoom, focus | 13.2 | Merged, capability-gated. The torch resets per session (JRN-8). The copy is pending Bruno (`epics.md:2799`). The iPad torch is unverified (PLN-10) |
| CAP-3 viewer zoom | 13.3 pinch and double-tap | Merged. The WebKit zoom spec is skipped because Playwright WebKit cannot store a photo Blob (`deferred-work.md:1378`) |
| INP-1..4 keyboard, Salvo | 13.4 | Merged. The iOS decimal pad commits by tapping the next cell (accepted, `epics.md:2835-2837`). `enterkeyhint` is set through a `MutationObserver` (G4-2) |
| WAIT-1..3 reading wait | 13.5: age, cancel, retry, panel resume | Merged. Three @p0 tests wait out the real 10 s threshold (TST-12) |
| CAP-4 quota shot | 13.6 | Merged |
| AI-1 plate tile | 13.7: every block type except cables | Merged |
| AI-3 audit | 13.8: one LLM pass that points and never writes | Merged (#107). Coverage and kind gaps remain (AIB-2..5) |
| AI-2 dictation | 13.9 | Deferred. The consent wording is open (E13-A9) |

### 3.3 What is still open

| Item | State | Ref |
|---|---|---|
| Device evidence (E1-A1, E13-A3 and seven "add a step" items) | Never run; the script is unchanged since Story 1.8 | `sprint-status.yaml:168`; `offline-proof-script.md:3`; PLN-1 |
| Real-photo corpus | None; model choice, encode cap and display strategy stay on defaults | `deferred-work.md:1278`; E8-A8, E9-A6; PLN-2 |
| Product decisions (the "E5-A3 session") | Absorbed questions from nine retros and never ran | `sprint-status.yaml:460`; PLN-3 |
| Red unit stage | `test:unit` was merged with exit 1 on 5 of 7 Epic 13 code PRs | R13-6, E13-A2; G6-5 |
| Camera split and gesture core | Planned, no owner yet | E13-A6 |
| Epic 13 closure | `in-progress` until 13.9 is decided or moved | `sprint-status.yaml:155, 921`; PLN-V1 |
| Next epic | None in `epics.md` | PLN-V1 |

Open deferred rows that hurt the field engineer most today (plans lens, ranked):

| Rank | Row | Why it hurts in the field |
|---|---|---|
| 1 | `deferred-work.md:1235` F-06: bulk actions take 2 to 8 s and were never re-measured | The lowest-touch actions give no feedback for seconds on a real-size relatório |
| 2 | `deferred-work.md:1139`: caption "Confirmar todas" goes beyond the filter, with no undo | One tap prints unseen AI text in section 7 |
| 3 | `deferred-work.md:1025`: two "concluídas" counts | Contradictory progress on the screens used to decide "done" |
| 4 | `deferred-work.md:1335`: no opening feedback on three camera openers | Photo-first assists feel dead; the engineer double-presses |
| 5 | `conclusion.ts:141`: placeholder recommendation (E5-A3, no row) | Each restricted sheet's signed conclusion needs a manual edit |
| 6 | `deferred-work.md:1366`: a typed year over a suggested date is refused | Correcting a misread plate date fails |
| 7 | `deferred-work.md:875`: cables print unpaired | Section 9 needs restructuring in Word on every real job |
| 8 | `deferred-work.md:1067` / `:1061`: cabine environment AI readings are outside pre-issue and carry no provenance | Values silently missing or untraceable |
| 9 | `deferred-work.md:670`: a single TAP row | TTR across taps cannot be captured |
| 10 | `deferred-work.md:1384`: panel double confirm on two devices | Duplicate block from one photo |
| 11 | `deferred-work.md:887`: Não ensaiado photos never print | Evidence of the reason is lost from the document |
| 12 | `deferred-work.md:315`: service-worker pin across users | A shared tablet can drop one user's offline shell |

## 4. Field UX findings by theme

Each finding gives its id, severity, evidence and recommendation. "Lands in" names the candidate story (section 7), a quick win ("QW n", section 7.6) or a later item ("L n").

### 4.1 Touch economy and journeys

#### Journey tap tables (before: main `a8b9b0e`)

**J-a: open the app and reach the first ficha of a new relatório** (768 px, new client and obra, no instrument registered; `e2e/journey-forward.spec.ts:225-322`)

| # | Step | Taps | Keys | Removable how |
|---|---|---|---|---|
| 1 | Home "Novo relatório" | 1 | 0 | - |
| 2 | Cliente typed, "Criar" (for an existing client: 2-3 letters plus a pick) | 1 | ~18 | - |
| 3 | Local (obra) typed, "Criar" | 1 | ~15 | - |
| 4 | "Continuar" | 1 | 0 | decided D3: two steps stay |
| 5 | "Criar relatório" | 1 | 0 | - |
| 6 | Etapa 3 ART/TRT field | 1 | 13 | per job; office-able (JRN-V2) |
| 7 | Etapa 4 "Cadastrar instrumento", Código, "Fechar" | 2 | 5 (+~60 for a real instrument) | once per company |
| 8 | "Concluir dados do relatório" | 1 | 0 | - |
| 9 | Sumário: cabine chevron | 1 | 0 | JRN-12 |
| 10 | Equipment row | 1 | 0 | JRN-12 |
| | **Total (spec)** | **11** | **~51** | J5 recorded, never asserted; the Cliente `.fill` is not counted (JRN-9) |
| | Second visit to the same obra | ~9 | ~13 | JRN-1 (corrected) |

**J-b: power transformer ficha** (first transformer, online, plate by photo, dry subtype; `seed/v1.ts:88-103, 256-338, 382-386, 481-496`)

| # | Step | Taps | Keys | Removable how |
|---|---|---|---|---|
| 0 | Cabine's first sheet only: TIPO DE SE (2), 3 numeric fields (3, ~12 keys), environment "Ler visor" (2) plus confirm (1), or "Copiar da cabine anterior" (1) | 7-8 | ~12 | JRN-3, JRN-1 |
| 1 | "Fotografar placa" | 1 | 0 | - |
| 2 | Torch on (resets every session) | 1 | 0 | JRN-8 |
| 3 | Shutter (single shot) | 1 | 0 | - |
| 4 | "Marcar os restantes como Conforme" | 1 | 0 | - |
| 5 | Instruments: isolação suggested if used earlier; relação picker open plus pick | 2 (4 if neither was used yet) | 0 | JRN-2 |
| 6a | Readings typed: first cell, 3 isolação, 3 ratio phases, Enter run | 1 | ~33 | - |
| 6b | Or "Ler visor" online: opener, 4 shutters, "Concluir", "Confirmar todos" x2; ratio phases 2-3 still typed | ~8 | ~12 | JRN-4 |
| 7 | Back to the plate when "Sugestões prontas" shows | 1 | 0 | JRN-13 |
| 8 | "Confirmar todos (N)" | 1 | 0 | - |
| 9 | Each Verificar field's Confirmar; "Criar ⟨fabricante⟩?" | 0-3 | 0-4 | AIR-1, AIR-V1 |
| 10 | Conclusion pair "Confirmar" | 1 | 0 | - |
| 11 | "Concluir e avançar" | 1 | 0 | - |
| | **Total (typed readings)** | **~12-15** (+1 hidden, JRN-V1) | **~33-37** | Typing the 12-field plate would cost about 20 taps and 60 keys |
| | Offline variant | steps 7-9 move to the office | | ~2 taps per plated sheet, +1 per sheet in between (JRN-5 corrected) |

**J-c: next unit of the same type** (`journeys-12-3-12-4.spec.ts:178-198`)

| # | Step | Taps | Keys | Removable how |
|---|---|---|---|---|
| 1 | "Igual à TR-01?" | 1 | 0 | - |
| 2 | Identificação | 1 | ~5 | JRN-15 |
| 3 | Nº série | 1 | ~8 | JRN-15 |
| 4 | "Repetir da ficha anterior do mesmo tipo" | 1 | 0 | - |
| 5 | Instruments | 0 | 0 | D-4 |
| 6 | Readings | 1 | ~33 | JRN-4 |
| 7 | Conclusion pair | 1 | 0 | - |
| 8 | "Concluir e avançar" | 1 | 0 | - |
| | **Total** | **~7** (+1 hidden) | **~46** | J3 budget: 7 taps, 47 keys |

**J-d: a non-conformity with photo and point of attention** (`checklist-section.tsx:359-437`; `point-editor.tsx`)

| # | Step | Taps | Keys | Removable how |
|---|---|---|---|---|
| 1 | NC segment | 1 | 0 | - |
| 2 | NC chip (or the FR-75 draft, 1 confirm) | 1 | 0 | - |
| 3 | "Adicionar foto", shutter, "Concluir fotos" | 3 | 0 | AIB-12 |
| 4 | "Criar ponto de atenção" | 1 | 0 | - |
| 5 | Point text (seeded with photo chips only) | 0-1 | ~40-80 | JRN-6, AIB-8 |
| 6 | Ação recomendada | 1 | ~40 | AIB-7, AIB-9 |
| 7 | Priority (deadline suggested) | 1-2 | 0 | - |
| 8 | "Concluir" (editor) | 1 | 0 | - |
| 9 | Sheet observation (suggested from NC items) | 1 | 0 | D-7 |
| | **Total** | **~10-12** | **~80-120** | about 100 keys removable |

**J-e: caption the photos**

| Photo kind | Taps | Keys | Notes |
|---|---|---|---|
| Sheet photo and NC row photo | 0 | 0 | context caption written at capture (`use-photo-capture.ts:153`) |
| Plate photo | 0 | 0 | always "placa de identificação" (CAPT-8) |
| Gallery "Geral", online with AI on | 1 per batch | 0 | "Confirmar todas" (`gallery-surface.tsx:269`); spans every filter, no undo (AIB-15) |
| Gallery "Geral", offline or AI off | ~4-5 each | 0 | Legendar, atividade, equipamento, local, Salvar (JRN-14) |
| Import batch | 1-2 per batch | 0 | "De qual equipamento?" plus "Adicionar N fotos" |

**J-f: parecer, preview and issue** (`export-dialog.tsx`, `etapa6-parecer.tsx`)

| # | Step | Taps | Keys | Removable how |
|---|---|---|---|---|
| 1 | Sumário "Gerar relatório" | 1 | 0 | - |
| 2 | Blocking row "Editar em Dados do relatório" | 1 | 0 | JRN-7 |
| 3 | Etapa 6 verdict segment | 1 | 0 | stays the engineer's choice |
| 4 | Generated text "Confirmar" | 1 | 0 | - |
| 5 | "Voltar à exportação" | 1 | 0 | JRN-7 |
| 6 | "Conferir antes de emitir" plus wait | 1 | 0 | JRN-7 (not now) |
| 7 | "Ver" per audit finding | 0-n | 0 | - |
| 8 | "Pré-visualizar" | 1 | 0 | optional |
| 9 | "Gerar relatório" | 1 | 0 | - |
| 10 | "Emitir mesmo assim" | 0-1 | 0 | - |
| 11 | "PDF — enviar ao cliente" or share | 1-2 | 0 | the file may be too big to send (G5) |
| | **Total** | **~9-11** | **0** | -2 with an inline parecer |

Layout and reach notes:

| Topic | Finding | Evidence |
|---|---|---|
| Phone 390 vs tablet | Phone: no rail. "Voltar" opens the tree surface on the last sheet, 2 taps to any sheet. Tablet: rail, 1 tap | `tree-surface.tsx:93`; `photos.css:167-168` |
| Glove targets | Pass on Home, Sumário, tree and sheet. The camera and dialogs are not measured | `ergonomics.spec.ts:31,134` (JRN-10) |
| One-hand reach | The primary action, stepper and bulk mirror sit in the bottom bar. Plate "Confirmar todos" and the copy chips sit at the top | `nameplate-suggestions.tsx:270-285` (JRN-13) |
| Keyboard on phone | The bar can sit behind the keyboard; the iOS decimal pad has no Return | `index.html:5`; `ficha.css:85-88` (JRN-11) |
| Forward-only | No forced "Voltar" in J5. The Sumário has no resume | `journey-forward.spec.ts:145-148, 313-318` (JRN-12) |

#### Journeys after (estimates from code paths, not measured)

| Journey | Before | After Epic 14 | After later work | Main changes |
|---|---|---|---|---|
| **J-0 (new)**: plate pass, 8 existing blocks, dark cubicle | ~33 taps, 8 camera start-ups (CAPT-2, Table 4) | ~11 taps, 1 start-up, "Pular" for an inaccessible block | same | CAPT-2, JRN-8 (14.14) |
| **J-a**: first ficha | 11 taps, ~51 keys | 10 taps, ~51 keys; 9 taps and ~38 keys if ART/TRT moves to `preIssue` | Second visit: ~9 taps and ~13 keys; cabine SE 1 tap per cabine | JRN-12, JRN-V2, JRN-1 |
| Resume a Rascunho relatório from Home | 4 taps | 1 tap | same | JRN-V2 (smaller variant) |
| **J-b**: first transformer, online, typed readings | ~12-15 taps, ~33-37 keys, +1 hidden | ~9-11 taps, ~33 keys, 0 hidden; with the walk ~7-9 in the sheet +1 shutter in J-0 | Photo readings only after E9-A6 | JRN-2, JRN-8, JRN-V1, AIR-1, AIR-V1, JRN-13 |
| J-b step 0: the cabine's first sheet | 7-8 taps, ~12 keys | ~5 taps, 0 keys for SE once a TR plate is confirmed | same | JRN-3, AIR-13 (null on conflict, no transformer, 380/220) |
| J-b offline, confirmed later | ~2 taps per plated sheet +1 per sheet in between | ~2 per plated sheet, 0 in between | same | JRN-5, JRN-13 |
| **J-c**: next unit | ~7 taps (+1 hidden), ~46 keys | ~7 taps typed, or ~8 taps and ~33 keys with the relabelled tile; walk ~6-7 | same | JRN-V1, JRN-15 |
| **J-d**: NC with photo and point | ~10-12 taps, ~80-120 keys | ~9-11 taps, ~0-20 keys | same | AIB-8, AIB-7, AIB-12, JRN-V1 |
| **J-e**: plate caption | 0 taps, same text for every plate | 0 taps, names equipment and column | same | CAPT-8 |
| J-e: gallery "Geral", offline or AI off | ~4-5 taps per photo | 1-2 per batch | same | JRN-14, CAPT-7 |
| J-e: gallery, AI on | 1 tap per batch, across filters, no undo | 1 per visible batch, with undo | Enum-composed captions | AIB-15, AIB-6 |
| **J-f**: parecer to issue | ~9-11 taps + office round trip ~3 taps per sheet for unconfirmed texts | ~7-9 taps, no round trip; audit says "Conferidas N de M fichas" | same | JRN-7, JRN-V1, AIB-1..3 |
| Each auto-lock during a ficha or reading wait | 3-6 touches, sometimes a glove off | 0 | same | FLD-1 |
| Plate retake after a bad shot | ~5 taps via Remover | 2 taps | same | CAPT-6 |
| Dark frame read as nothing | Silent "done" | "Nada foi lido nesta foto", 1-tap retake | same | CAPT-V1 |
| Black finder after a lock mid-burst | 2 taps | 0 | same | FLD-9 |
| **Update after a contract bump (new)** | Shell replaced; ≥2 taps, 2 reloads, ~7.6 MB uncompressed per tablet | 0 taps; banner, capture continues, reload once the outbox drains | same | G2-1..4 (14.28, 14.34) |
| **Second device on the same job (new)** | 0 for rule merges; N+2 taps per contradiction from its sheet; ~5 for a same-photo duplicate | Contradictions listed before issue; "Remover a repetida" 1 tap | Claims per cabine | G7 (14.33, L17) |
| Unit-scale slip on a filled reading | 1 brush = ×1000, no undo | Toast "Unidade alterada… Desfazer" | same | G4-1 (QW21) |

#### Findings

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| JRN-V1 | high | "Concluir ficha" does not confirm the composed conclusion text, so a budgeted sheet prints with no conclusion paragraph. Either ~94 hidden taps per job, or an office round trip | `use-ficha-actions.ts:134-137` (batch is instruments + `concludedByOp`); `conclusion.ts:297-300`; `pre-issue.ts:336-346` (no action); Story 5.8 AC "not printable"; `tap-budget.spec.ts:200-235` (no text tap) | Conclude writes `conclusion/text`, `text_status = confirmed`, `text_basis` after `conclusionBasisMatches`, in the same batch as D-4. Add a source-deltas row amending 5.8. Assert in J1/J3 | 14.3 |
| JRN-1 (corrected) | medium | A second visit re-types the cabine SE (4 fields per cabine), local, additional info and instruments. Setup is office work; atividade, escopo and exclusions do not need it | `instantiate.ts:175-192, :215, :203-205`; `new-relatorio-dialog.tsx:105-117`; FR-34 `epics.md:74` "the one cross-visit read"; `cabine.ts:79-85` | Project the cabine SE keyed by cabine name, plus local and instruments still in calibration. Needs an FR-34/AD-25 row | L1 |
| JRN-2 | medium | First sheet per test kind pays 2 picker taps though setup ticked the instrument: 4 of J1's 9 | `instrument-pick.ts:143-152, 173-200`; `tap-budget.spec.ts:84-96`; `setup-complete.ts:40`; D-4 `source-deltas.md:51` | Fall back to the single setup-ticked instrument that fits the test, shown amber "Sugerido". J1 budget becomes 5 | 14.6 |
| JRN-3 (corrected) | medium | Cabine voltages and power are typed although the transformer plates carry them. D-5 makes the line editable from any sheet; installed power is not always the sum | `sheet-progress.ts:21-24`; `seed/v1.ts:89-108, 587-593`; `reading-cells.ts:236-249` | `cabineSeSuggestion`: one confirm-by-tap line. Silent on conflict, no transformer, 380/220. State the merge rule first (G7-2) | 14.16 |
| JRN-4 (corrected) | medium | "Ler visor" is a sheet-wide burst, but readings come one at a time; ratio phases 2-3 have no stop. The photo path costs 20 taps vs 9 typed | `measurement-suggestions.ts:174-204`; `read-display.tsx:524-532`; `display.ts:252-275`; `tap-budget-signal.spec.ts:27` vs `tap-budget.spec.ts:35` | A per-reading single-shot mode plus per-cell stops. Gated on E9-A6 accuracy (typing is primary, `source-deltas.md:16`) | L2 |
| JRN-5 (corrected) | medium | Plate confirmations deferred to the office have no queue: ~2 taps per plated sheet + 1 per sheet in between | `sheet-progress.ts:35-36`; `sumario-surface.tsx:303-307`; `use-ficha-actions.ts:108-111`; "Revisar em sequência" `source-deltas.md:46` | A review walk by kernel `nextSheetWithPendingSuggestions`, counting other devices' suggestions too (G7) | 14.15 |
| JRN-6 | medium | A point from an NC row starts with photo tokens only; text and action are always typed | `checklist-section.tsx:424-433`; `point-editor.tsx:51-72`; `seed/v1.ts:118-130` | Kernel seed "Item n (label): observação" (no TAG, AIB-8) plus per-phrase action chips | 14.18 |
| JRN-7 | low | The parecer fix leaves the Export dialog for setup and comes back | `export-dialog.tsx:427-431`; `etapa6-parecer.tsx:22-30, 106-108` | Inline verdict and GeneratedTextField in the blocking row. No audit pre-start until AIB-3 is fixed | 14.21 |
| JRN-8 | low | Torch resets every camera session, one tap per shot in a dark cubicle | `camera-view.tsx:28-30, 780-783`; 13.2 AC `epics.md:2791` | In-memory flag per cabine, never persisted (needs a 13.2 amendment) | QW19, 14.14 |
| JRN-9 | medium | Budgets guard only the typed seccionadora. J5 is recorded, not asserted. Helpers are copied 4 times | `tap-budget.spec.ts:34-37`; `journey-forward.spec.ts:241, 321`; four `pickInstruments` | `e2e/support/journey.ts`; @p1 budgets for J-b, J-d, J-f; assert J5 = 11 | 14.9 |
| JRN-10 | low | The glove-target test skips the camera and every dialog | `ergonomics.spec.ts:134` | Extend ERGO-E2E-001 to the camera, Export, point editor and composer at 390/768 | 14.9 |
| JRN-11 | low | On a phone the keyboard may hide the sticky bar; the iOS decimal pad has no Return (browser behavior not verified on device) | `index.html:5`; `ficha.css:85-88`; `toast.tsx:88-97`; BH8 `deferred-work.md:1362` | `interactive-widget=resizes-content`, `visualViewport` offset; device check | L11 |
| JRN-12 (corrected) | low | Sumário has no "Continuar". The real gain is 1 tap on the post-setup landing; after "Voltar" the row is already focused | `sumario-surface.tsx:401-403`; `journey-forward.spec.ts:313-318` | Show the Home card's "Continuar" in the Sumário header while Em campo | 14.21 |
| JRN-13 | low | "Sugestões prontas" banner offers no action; "Confirmar todos" is out of reach | `ficha-surface.tsx:140-143`; precedent `conflict-banner.tsx:75` | "Ver" on the banner, focusing "Confirmar todos" | QW12 |
| JRN-14 (corrected) | low | Gallery camera shots are "Geral"; offline each is captioned one at a time. Recorded deferral | `gallery-surface.tsx:91, 182`; `deferred-work.md:765-769` | The import's "De qual equipamento?" step after a burst; gallery multi-select | 14.17 |
| JRN-15 (corrected) | low | After "Igual à", per-unit fields are typed. Shot plus confirm already costs 3 taps. Dropping "Substituir" lines would be unsafe | `seed/v2.ts:17`; `nameplate-section.tsx:208`; `suggestion-group.ts:81-85` | Relabel the tile "(identificação e nº de série)" only | later |
| JRN-V2 | low | A relatório started without ART/TRT stays Rascunho, and Home never offers "Continuar" | `setup-complete.ts:31-41`; `status/table.ts:78`; `home/cards.ts:272-276` | Default: mark the Rascunho relatório with a last-opened sheet as current. Moving the gate is a Matheus choice (AD-22) | 14.21 |
| G4-1 | medium | One tap on a filled cell's unit control rewrites the reading ×1000 at once, bypassing undo. A glove or stylus brush turns 147 GΩ into 147 TΩ, which passes a minimum criterion silently | `measurement-field.tsx:128-135, 172-185`; `number-input.tsx:140-148, 164`; asserted at `e2e/ficha.spec.ts:552-557`; 48 px button next to the 48 px overflow (`components.css:330, 500`) | Not focused → `api.edit` + `api.undoable` ("Unidade alterada para TΩ. Desfazer"), or cycle only while focused. Durability spec | QW21, 14.30 |
| G4-4 | low | "Não medido" and the NC draft "Usar" are taps written through `api.commit` with no reporter. A refused write is silent | `measurement-field.tsx:193`; `checklist-section.tsx:296`; `ficha-api.ts:6-11`; `relatorio-editor.ts:42-45` | Route through `api.edit` (toast on refusal); make "Não medido" undoable | QW22 |
| G4-10 | low-med (unverified) | Choosing NC expands the row (chips, draft, textarea, photos) and shifts rows below by hundreds of px at the moment of a follow-up tap | `checklist-section.tsx:362-441`; `press-hold.ts:3-26` guards re-render, not layout shift | Device pass; if confirmed, delay expansion to release or scroll the row into view | 14.1 |
| G8-3 | low | The service period is typed while the first and last photo timestamps bracket it | `setup-fields.ts:75`; `pre-issue.ts:91-92`; `entities.ts:472` | Kernel chip "Fim da parada: 14/10 (última foto)", one tap | QW30 |
| PLN-8 | medium | Bulk actions took 2-8 s on a 94-block relatório and were never re-measured; no perf spec covers them | `deferred-work.md:1235`; `commit-to-render.perf.spec.ts:9-21` | 94-block serial-group perf case with a 1 s budget | 14.25 |
| PLN-6 (corrected) | medium | Two "fichas concluídas" counts. The split is deliberate (`EXPERIENCE.md:337` counts Não ensaiada as concluded) | `progress.ts:46-55`; `parecer.ts:166`; `deferred-work.md:1025` | One rule by a Matheus decision, with a strike-through amendment | decision |
| PLN-13 | low | A typed year over a suggested "Data de fabricação" is refused while an empty field accepts it | `nameplate-suggestions.tsx:239`; `suggestion-group.ts:155-158`; `deferred-work.md:1366` | Route through `parsePlateDateText` | QW11 |

### 4.2 The capture funnel

#### Capture-point inventory

**Table 1. In-app camera** (every opener uses `useCamera`/`CameraView`, `camera-view.tsx`)

| # | Capture point (code) | Entry point | Mode / source | What the photo feeds | Binding, caption, metadata | Offline | Taps, intent to stored |
|---|---|---|---|---|---|---|---|
| 1 | `useSheetCamera` `photo-openers.tsx:20` | Ficha sticky bar, 56 px "Tirar foto" | Burst; frame grab | Evidence only (no reading for a photo with a block, `file-commit.ts:114-123`; `prose.ts:86`) | block_id; context caption of the section on screen; time and position at tap | Saved, uploaded later | 1 + 1 per shot + 1 "Concluir fotos" |
| 2 | `RowPhotoAction` `photo-openers.tsx:226` | NC row "Adicionar foto" | Burst | `nc_obs` while the row is NC | block_id + item_key; context caption | Draft arrives online | 1 + N + 1 |
| 3 | `PlateCaptureTile` `photo-openers.tsx:67` | "Fotografar placa" tile (no plate photo yet, AI on) | Single; `takePhoto` with fallback; closes itself | `plate` reading | caption "placa de identificação" | "Foto guardada — leitura quando houver sinal" | 2 (+1 torch per session) |
| 4 | `ReadDisplayButton` `read-display.tsx:493` | Measurement table "Ler visor" | Burst with a target and hint per shot | `display` per row cell | test caption; cell target | Queued banner; cell typeable | 1 + 1 per row + 1 "Concluir" (no skip) |
| 5 | `EnvReadDisplayButton` `read-display.tsx:632` | Cabine thermo-hygrometer "Ler visor" | Single | `display` env target | cabine target | Queued line | 2 |
| 6 | `PanelCapture` `panel-capture.tsx:151` | Sumário tree, palette "Fotografar equipamento" | Single, then result dialog | `panel`, re-targeted to `plate` of the new block on Confirmar (`panel.ts:265-280`) | new block; caption "placa de identificação" | Type chips usable offline | 4 online; 5 offline |
| 7 | `useSheetCamera(GERAL_TARGET)` `gallery-surface.tsx:91, 182` | Gallery camera | Burst | `caption` vision reading | "Geral"; never re-assignable (CAPT-7) | Caption online | 1 + N + 1 |
| 8 | Fallback `<input capture="environment">` `camera-view.tsx:367-380` | Any opener, only with no getUserMedia (not when denied) | OS camera | Same target, reading included | EXIF time and GPS | Same | 3 |

**Table 2. Import paths** (`importPhotoFiles`, `files/photo-import.ts:91-136`)

| # | Capture point | Entry point | What the photo feeds | Binding and metadata | Offline | Taps |
|---|---|---|---|---|---|---|
| 9 | `AddPhotosButton` `photo-openers.tsx:209` | Ficha "Adicionar fotos" | Evidence; never `plate` (`retarget.ts:43`) | Sheet target, then "De qual equipamento?"; EXIF, HEIC conversion | Works offline | ~3 + k |
| 10 | Gallery picker and drop `capture-sheet.tsx:343` | Gallery "Adicionar fotos" | Geral, then `assignPhotoBatch`; caption reading | EquipmentStep (`capture-sheet.tsx:464-598`) | Works offline | 1 + picker + 2 |
| 11 | Denied-camera chooser `capture-sheet.tsx:401-416` | From a denied camera | Same as 9/10 | "Tirar foto" disabled (CAPT-4) | Works offline | 1 + picker |
| 12 | Drop zone `use-ficha-photos.ts:111` | Desktop drag and drop | Evidence on the sheet | Sheet target | Works offline | 0 + drop |

**Table 3. The funnel against the persona**

| Question | As built | Evidence |
|---|---|---|
| One consistent camera? | One viewfinder, but the openers drifted: opening state on 2 of 6, no denied note on panel capture | `camera-view.tsx:576`; `photo-openers.tsx:25, 70`; `panel-capture.tsx:178` |
| One shot feeds several things? | Plate: fields, registry matches, next-visit copy. Panel: type, column, TAG, block, plate reading (wrong framing) | `kinds/plate.ts`; `panel.ts:265-280` |
| Shoot first, sort later? | No: gallery shots stay Geral; only imports are assigned; only the tile or a panel photo becomes a plate | `gallery-surface.tsx:91`; `retarget.ts:43` |
| Quality gate before the photo leaves the device? | None | `photo-encode.ts:63-78` |
| Framing guide? | Decorative corners; preview is cropped (`cover`) relative to the saved frame | `app.css:610-614, 648` |
| Resolution (13.1)? | Stream ideal 3840x2160; single shots `takePhoto`; burst frame grabs; encode cap 2560 px; the reading reads the 2000 px print (CAPT-V3) | `camera-view.tsx:43-46, 657`; `job.ts:228-231` |
| Torch, zoom, focus (13.2)? | Built, hidden when absent; torch resets each session | `camera-view.tsx:676-716, 779-783` |
| Continuous capture? | Burst for sheet, NC, gallery, Ler visor; single plus dialog for panel | `camera-view.tsx:152-164, 308` |
| Review, retake? | No last-shot thumbnail; single shots close at once; plate retake ~5 taps | `camera-view.tsx:721`; `nameplate-section.tsx:208` |
| Wake lock, haptic, orientation? | None | grep `wakeLock`, `vibrate`, `orientation` |

**Table 4. Plate pass for a cabine with 8 existing blocks (dark cubicle)**

| Step | Today (per-sheet tile) | Proposed plate walk (CAPT-2) |
|---|---|---|
| Open | Open sheet 1 (1) | "Fotografar placas da cabine" on the Sumário cabine row (1) |
| Per block | Fotografar placa (1) + torch (1) + shutter (1) + Próxima ficha (1) = 4, one camera start-up each | Shutter (1), hint names the next block; torch once per session; Pular (1) |
| Close | none | Concluir (1) |
| Total, intent to 8 stored plates | ~33 taps, 8 start-ups | ~11 taps, 1 start-up |
| Confirm later (online) | Confirmar todos (1) + Próxima ficha (1) per sheet | Same (~16 taps); unchanged by this proposal |

#### Findings

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| CAPT-V1 | high | A plate reading that finds nothing ends silently as "done": no message, no retry, no retake. This is the likely result of a dark frame | `apps/api/src/jobs/reading/job.ts:241-249`; `escalate.ts:30-31` (0 OCR words, no escalation); `plate-suggestions.ts:38-47`; `plate-photo.tsx:84-121`; `EXPERIENCE.md:380, 538` | Kernel "empty" view (done and no suggestion of any status for the photo): "Nada foi lido nesta foto", "Fotografar de novo", "Preencher manualmente". Same for display cells | 14.4 |
| FLD-V1 | high | Toasts raised while the camera is open render under the opaque scrim (z 30 under 40), including a failed burst shot. The spec checks text, not visibility | `components.css:129-138` vs `:664`; `app.css:598`; `camera-view.tsx:302`; `read-display.spec.ts:150-153` | Report in `.cam-hint` until the next success; assert `toBeVisible()` | QW1, 14.5 |
| CAPT-1 (corrected) | high | No quality check at the shutter. Only the plate tile, thermo "Ler visor" and panel are single-shot and close themselves | `photo-encode.ts:63-78`; `camera-view.tsx:307-308`; `pt-br.ts:1077, 1081`; no blur or luma code anywhere | Kernel `shotQuality(luma,w,h)`: ok, escura, tremida, reflexo. Hint mode first. A bad single shot keeps the camera open about 1.5 s with "Tirar de novo"; the save is never refused. Calibrate on the corpus | 14.12 |
| MKT-2 | high | Same gap seen from the market: offline, a bad shot is known only after leaving the plate. Record360 warns in real time; Field Control scores image quality | `record360.com/blog/understanding-record360s-ai-blur-detection-technology/`; `fieldcontrol.com.br/field-elo.html` | As CAPT-1, outside `camera-view.tsx` | 14.12 |
| CAPT-2 | high | No "shoot everything first" plate walk (Table 4) | `nameplate-section.tsx:208`; `use-ficha-actions.ts:158`; `epics.md:2790`; `read-display.tsx:511-534` (burst contract exists); `camera-view.tsx:720-728` (no skip) | Kernel `plateWalkStops`, `plateWalkHintText`; `onSkip` ("Pular"); "Equipamento não listado" takes the 9.2 panel target; torch kept per cabine | 14.14 |
| CAPT-3 (corrected) | high | Only a tile photo (or a confirmed panel photo) can become a plate reading. Gallery and NC photos already carry `reading_kind`, so the proposed guard must allow an explicit paid re-read of `plate` over a done `caption` | `retarget.ts:39-45`; `file-commit.ts:114-123`; `photo-import.ts:54-60`; `use-ficha-photos.ts:85-95` | "Ler como placa" in the viewer; "Escolher foto da placa"; the sticky-bar first shot takes the plate target while the Placa step is on screen. Contract bump; reread cap | 14.17 |
| MKT-5 (corrected) | medium | Sheet photos get no reading (`has_block`); unassigned photos get a caption. A "looks like a plate" flag can come from the caption call already running | `prose.ts:83-87`; `retarget.ts` | Flag from the caption vision result; info suggestion only | 14.17 |
| CAPT-4 (corrected) | high | A denied permission disables the reading openers (plate, both "Ler visor", panel); panel capture is silent. Sticky bar and NC still offer the picker | `camera-view.tsx:219-223, 367-380`; `photo-openers.tsx:127-131`; `read-display.tsx:547-551, 656-660`; `capture-sheet.tsx:408-416`; no `denied` in `panel-capture.tsx` | "Usar a câmera do aparelho" through the existing fallback input; denied state on panel capture. Device check (E13-A3) | 14.10 |
| CAPT-5 (corrected) | medium | Story 9.2 turns the panel-front photo into the plate photo and hides the tile. This is a delivered AC (FR-38); the weak plate read is unmeasured | `pt-br.ts:705, 718`; `panel.ts:265-280`; `epics.md:2208, 2212` | Keep FR-38; after a 9.2 confirm, continue with a "now the plate" shot, or keep the tile while that reading is empty | L10 |
| CAPT-6 | medium | No plate retake: about 5 taps through the viewer's Remover | `nameplate-section.tsx:208`; `plate-photo.tsx:41-121`; `photo-viewer.tsx:22, 216` | "Fotografar de novo" in the plate row; discard the older photo's pending rows | 14.4 |
| CAPT-7 | medium | Gallery camera shots can never be sorted onto a sheet | `gallery-surface.tsx:91`; `photo-ops.ts:101-125` (one caller, `capture-sheet.tsx:343`) | Multi-select plus "De qual equipamento?" reusing `assignPhotoBatch`; keep section 7 numbering stable | 14.17 |
| CAPT-8 | medium | Every plate photo prints "placa de identificação." in section 7, with no equipment | `plate-suggestions.ts:12`; `print/section-7.ts:40-61`; `photos/caption.ts:179-215`; `EXPERIENCE.md:123` | Kernel `plateCaption`: "Placa de identificação do ⟨equipamento⟩ ⟨TAG⟩ da ⟨coluna⟩"; strike-through `EXPERIENCE.md:123` | 14.16 |
| CAPT-9 (corrected) | medium | Burst shots are frame grabs by the 13.1 AC's scope; the gap is still processing, and it is unmeasured | `camera-view.tsx:657`; `epics.md:2768-2770` | Measure capture size per path in 14.1 first; at most one `takePhoto` in flight | L13 |
| CAPT-V3 / AIR-4 | medium | The reading job reads the 2000 px print variant, so neither the 13.1 sensor still nor the 2560 px original reaches OCR. AD-14 binds this | `job.ts:228-231`; `storage/variants.ts:13-15`; `ARCHITECTURE-SPINE.md:145` | Measure print vs original in 14.1; amend AD-14 only if the OCR leg gains; the LLM gains from a crop, not a bigger frame | 14.1, 14.22 |
| CAPT-10 | medium | What the finder shows is not what is saved (`cover`); no plate framing guide | `app.css:648`; `camera-view.tsx:488-500, 512-574` | `object-fit: contain` on single-shot targets; kernel `captureGuide(kind)` | 14.13 |
| CAPT-11 / FLD-12 | medium | The shutter gives almost no confirmation: empty `.cam-link`, no haptic, no flash | `camera-view.tsx:721`; mock `70-fotos.html:387`; `app.css:624` | Last-shot thumbnail (DESIGN.md sign-off), 120 ms flash (reduced motion respected), `navigator.vibrate` | 14.12 |
| CAPT-12 / PLN-9 | medium | Six openers repeat wiring and have drifted (opening state on 2/6; 5 hand-written denied blocks) | `photo-openers.tsx:20-139, 226-272`; `read-display.tsx:493-552, 632-664`; `panel-capture.tsx:178`; `deferred-work.md:1335` | `CameraOpener` / `useCameraOpener` | 14.10 |
| FLD-9 | medium | The camera stream is not recovered after a screen lock or app switch; black finder, stale frame | `camera-view.tsx` (no `ended`/`mute`/visibility listener), `:533`, `:627-637` | Re-acquire the track on visible; disable the shutter while muted | 14.10 |
| PLN-10 (corrected) | medium | The iPad torch is unverified. The system camera is reachable for general photos through the picker, but not for reading shots | `camera-view.tsx:441, 468, 676`; `photo-openers.tsx:170-219` | Record `getCapabilities()` on the target iPad; "Câmera do sistema" for reading shots when torch is absent | 14.1, 14.10 |
| FLD-8 / CAPT-18 (corrected) | medium | A phone in landscape takes the tablet camera rules (finder min 360 px); about 650 px of stacked controls against a 360-390 px viewport. Read from CSS, not run | `app.css:609, 618-628, 663-664, 522`; only a 390x844 case in `camera-capture.spec.ts:231` | `@media (max-height: 599.98px)` landscape layout with controls on the right; 844x390 assertion | 14.13 |
| CAPT-13 (corrected) | low | EXIF and provenance input built twice; about 10-15 net lines | `use-photo-capture.ts:51, 136-161`; `photo-import.ts:16, 99-125` | `capture-input.ts`, only when a provenance field lands | L13 |
| CAPT-14 (corrected) | low | API kinds repeat location, definition and prose guards; about 25-30 lines | `display.ts:52-57`; `panel.ts:23-27`; `plate.ts:73-77`; `caption.ts:25-35`; `nc-obs.ts:38-54` | `targetLocation(kind?)`, `targetDefinition`, `proseRun` in `kinds/shared.ts` | 14.11 |
| CAPT-15 | low | Already planned (E13-A6). Add a `ShotSession` reducer as the seam for quality, skip and review | `camera-view.tsx:279-309`; `epic-13-retro-2026-10-08.md:137` | Part of the camera split | 14.10 |
| CAPT-16 | low | Two ticking-clock hooks; the pending plate row hand-copies `PlatePhotoRow` and has drifted | `panel-capture.tsx:140-149`; `reading-line.tsx:45-52`; `photo-openers.tsx:85-108` | One `useNowIso(everyMs, active)`; pending variant of `PlatePhotoRow` | QW20, 14.4 |
| CAPT-V2 | low | The pending plate row uses `navigator.onLine` while the committed row uses server reachability, so it shows "Lendo…" then "Foto guardada" on captive networks | `photo-openers.tsx:71, 87-103`; `plate-photo.tsx:57-61` (F-13) | `useServerReachable` | QW4 |
| CAPT-17 (corrected) | low | A serial differing from the last visit surfaces as "Substituir" when the copy was used first; the gap is an empty sheet only. In tension with the `SPEC.md:166` non-goal | `nameplate-copy.ts:98-118`; `entities.ts:263` | Out until Matheus revisits `SPEC.md:166` | L14 |

### 4.3 AI for reading

#### Field sources: block type × field

| Block type | Field(s) | Source today | Possible source | Recommendation |
|---|---|---|---|---|
| para_raio, chave_seccionadora, disjuntor_mt, tp, tc, transformador_forca | FABRICAÇÃO | Plate photo → Textract → Haiku 4.5 (Nova Pro escalation); exact registry match or "Criar X?" | Same, with registry spellings in the prompt and a reading-only fuzzy match | AIR-8, AIR-3 |
| same six | Nº SÉRIE, TIPO | Plate, digit coverage | Plate | Keep; token-confidence trust (AIR-2) |
| para_raio | TENSÃO NOMINAL (voltage class), CORRENTE NOMINAL kA | Plate; class checked against the registry | Plate with SI conversion and range | AIR-1, AIR-2 |
| chave_seccionadora, disjuntor_mt | TENSÃO DE PLACA, CORRENTE NOMINAL A, CAPACIDADE INTERRUPTOR kA, VOL. ÓLEO L, DATA DE FABRICAÇÃO | Plate | Plate with SI conversion, ranges, label anchor (A vs kA swap); bare years | AIR-1, AIR-2, AIR-3, AIR-V1 |
| chave_seccionadora, disjuntor_mt | MEIO DE EXTINÇÃO (AR, SF6), ACIONAMENTO | Plate, select | Plate | Keep; "VÁCUO" has no option and is dropped (`value.ts:90-95`); ask Bruno |
| five plate types | IDENTIFICAÇÃO, TAG | Plate; TAG prefilled from the block | Block TAG or asset label | Leave TAG and IDENTIFICAÇÃO out of the plate request (AIR-3) |
| disjuntor_mt | AJ. BOBINA, AJ. RELÉ 50/51 | Asked on the breaker plate | Relay screen photo (future kind) or typed | Never from the breaker plate (AIR-3) |
| tp, tc, transformador_forca | POTÊNCIA NOMINAL VA/kVA, TENSÃO NOMINAL AT kV, BT V | Plate; a unit mismatch is stored under the field unit as Verificar | Plate with SI prefix conversion | AIR-1 (high); "380/220" BT open (AIR-V1) |
| tp, tc, transformador_forca | TIPO DE ISOLAÇÃO, LIGAÇÃO SECUNDÁRIA, DATA FABRICAÇÃO | Plate; mm/aaaa normalized | Plate | Keep; bare years (AIR-V1); subtype NA from insulation (MKT-7) |
| tp, tc, transformador_forca | TAP ATUAL | Plate (real plates print the table) | Tap-changer dial photo or typed | Leave out of the plate request (AIR-3) |
| tc | RELAÇÃO, EXATIDÃO | Plate; RELAÇÃO feeds the ratio inputs | Plate | Keep |
| para_raio, cabos, tp, tc, transformador_forca | ISOLAÇÃO 1 MINUTO | "Ler visor" (sidecar plus kernel rule, no LLM); typed offline, checked by the queued photo | "Ler visor" plus an LLM second reader on Verificar; on-device draft | AIR-5, AIR-6 (gated) |
| chave_seccionadora, disjuntor_mt | ISOLAÇÃO aberto/fechado, RESISTÊNCIA DE CONTATO µΩ | "Ler visor" (micro-ohmmeter 0 of 4 in the spike) | Second reader; dot-matrix line split | AIR-5 |
| tp, tc, transformador_forca | RELAÇÃO capture columns | "Ler visor" (3 of 5) | Second reader; per-cell stops | AIR-5, JRN-4 |
| tp, tc, transformador_forca | V/A PRIMÁRIO, SECUNDÁRIO | Derived from the nameplate | — | Keep (strength) |
| transformador_forca | TAP Nº | Typed | Ratio meter screen | Keep typed |
| any, when `ia_ip_display` is on | ABSORÇÃO, POLARIZAÇÃO | Typed | PI/DAR screen | Low; toggle off for Fasor (`source-deltas.md:9`) |
| cabos_entrada, cabos_saida | Nameplate | None (no fields) | Jacket marking | Never |
| all eight | Checklist C/NC/NA | Chips | — | Never from a photo |
| all eight | NC row observation | Prose LLM from the row photo; chips offline | — | Keep; retro offer (AIB-12) |
| all eight | CONCLUSÃO and text | Kernel (NFR-12) | — | Never an LLM |
| cabine | TIPO DE SE | Chip | — | One tap already |
| cabine | TENSÃO PRIMÁRIA, SECUNDÁRIA, POTÊNCIA INSTALADA | Typed (no assist; "Copiar da cabine anterior" copies only env) | Kernel from TR plates | AIR-13, JRN-3, G7-2 |
| cabine | TEMPERATURA, UMIDADE | "Ler visor" | On-device draft | AIR-6; provenance (PLN-12) |
| relatório | ALTITUDE | Geolocation, confirmed once | — | Keep |
| relatório | ART/TRT | Typed once | — | Keep typed |
| registry | Instrument fields, calibration | Typed in Cadastros | Certificate reading | AIR-15 (office) |
| sheet | Instrument per test | Picker with "Sugerido" | Setup fallback | JRN-2 |
| photos | Caption of a photo with no sheet | Vision caption | Vocabulary-limited parts | AIB-6, AIR-16 |
| relatório tree | New block type and column | "Fotografar equipamento" (Qwen3 VL) | Reuse OCR when re-targeted | AIR-14 |
| relatório | PARECER verdict | Kernel hint, never Não apto | — | Never an LLM |

#### Cost per relatório (corrected with AIR-11 and G3)

| Item | Large job (6 cabines, 94 blocks; FR-42 sizing) | Small (20 blocks) |
|---|---|---|
| Plate readings (Haiku 4.5; Nova Pro on ~30% escalated) | 94 × USD 0.007-0.0115 = 0.66-1.08 | ~20 × = 0.14-0.23 |
| Textract pages (plates and panels) | ~0.14-0.28 | ~0.04 |
| Panel shots (Qwen3 VL, ~USD 0.002 each) | 0.06-0.2 (30-94 panels) | ~0.01 |
| Captions (Haiku vision) | 82 × ~0.003 = ~0.25 | ~0.03 |
| NC drafts | ~0.05 | ~0.01 |
| Emission audit (text) | 0.05-0.12 per run | ~0.02 |
| "Ler visor" (sidecar, compute only) | 659 measured cells (660-810 realistic, 1,100 ceiling) × 7.5-15 s ≈ 1.4-4.6 h of 2-vCPU work per job; unmeasured on the production CPU | ~150 shots |
| **Total today** | **~USD 1.2-1.6** (AIR-11 corrected); **up to ~2.4** with G3's conservative per-call caps | ~USD 0.25-0.35 |
| With a display second reader (half of shots escalated, L3) | +USD 1.1-2.2 | +~0.2 |

**What binds is headroom, not the allowance** (G3-6):
- Infra without AI costs USD 45.02/month on t3a.medium, or 66.75 on t3a.large.
- The budget action denies AI at USD 90.
- That leaves about USD 45 of AI spend on medium, or about 23 on large.
- At USD 1.3-2.4 per job, medium carries about 19-35 large jobs a month; large carries about half that.
- t3a.large together with dropping the night stop leaves about USD 11. Pick one of the two.

#### Findings

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| AIR-1 | high | A plate value printed in another unit is stored under the field's unit: "13.800 V" becomes 13800 kV, Verificar, with no reason shown | `reading/value.ts:81-86`; `value.test.ts:38-43`; `bedrock.ts:211`; `shiftDecimal` at `reading-cells.ts:170-191` | `convertReadingUnit` by SI prefix (V/kV, A/kA, VA/kVA/MVA); digit coverage on the printed raw | 14.7 |
| AIR-V1 | high | A bare-year plate date (20 of 32 in the delivered job) is never suggested; the prompt asks the model to invent a month; "380/220" is dropped | `value.ts:29-39, 88-89`; `entities.ts:34`; `datetime.ts:144-153` (the typed path accepts years); `bedrock.ts:210`; `porto-seguro/data.ts` tally | Normalize dates through `parsePlateDateText`; prompt "exactly as precise as printed"; contract bump; 380/220 after Bruno answers | 14.7 |
| AIR-2 | high | Plate trust ignores OCR word confidence, plausibility and label anchor, so "Confirmar todos" writes a field swap or a 40%-confidence word | `assess.ts:53-75`; `textract.ts:84-86`; displays use confidence (`display.ts:42`) | One `assessTrust` (digits, min token confidence, range, label anchor) with `plate-hints.ts` outside the seed; calibrate on the corpus | 14.22 |
| AIR-3 (corrected) | high | The prompt has no equipment context, no pt-BR numerals, no line structure, no known manufacturers, and asks for fields no plate prints | `bedrock.ts:201-227`; `contract/ocr.ts:185-189`; `kinds/plate.ts:74-86`; `data.ts:786` | v2 prompt; server-side line grouping (no contract bump); context and known manufacturers (contract bump); drop TAP ATUAL, AJ. BOBINA, AJ. RELÉ, TAG, IDENTIFICAÇÃO | 14.22 |
| AIR-5 (corrected) | high | Display reading scores 40% on 15 crops (a pessimistic lower bound; micro-ohmmeter 0/4) with no model in the loop; unmeasured on tablet photos | `docs/display-reading-spike.md:47-52, 88-90`; `reading/display.ts:13-18` | Run E9-A6 first; then a gated second reader (agreement gives suggested); AI-off path stays OCR-only | 14.1, L3 |
| MKT-3 (corrected) | high | This is where competitors win with Bluetooth (Mesh, Minipa). The dual read is already planned (E9-A6); only the LLM second opinion is new | `sprint-status.yaml:741-745`; `epic-9-retro-2026-09-29.md:99`; `ai.ts:5-11` | as AIR-5 | L3 |
| AIR-12 | high | No AI reading has been measured on a real photo. Already planned; new: generate `*.expected.json` from `porto-seguro/data.ts` and add a "suggested but wrong" metric | `deferred-work.md:1278-1283`; `epic-13-retro-2026-10-08.md:66, 70, 122, 124` | Corpus session; whole-pipeline eval | 14.1 |
| G4-8 | medium | `bedrock-eval` cannot answer what 14.1 needs: recall only, no per-field results, no display kind, no cascade, no check that Verificar predicts error; model ids copied from config; untested | `apps/api/src/scripts/bedrock-eval.ts:24, 68-74, 80, 149, 172-183`; `config.ts:14-24`; `suggestions-and-reading.md:19` | Add precision, per-field accuracy, verify calibration, `--cascade`, `display` kind, `conditions` tags; import `DEFAULT_*`; unit-test `score()` | 14.1 |
| G3-1 | high | Production's real AI configuration (on, Bedrock, Textract) and the plate OOM that motivated Textract are recorded only in an untracked file; tracked docs say AI is off | untracked `infra/production/terraform.tfvars`; `infra/README.md:55, 81`; `variables.tf:84, 98`; E11-A2 still owed (`epic-11-retro-2026-09-30.md:144`) | Dated source-deltas row (2026-10-05); strike-through and amend README and variables; close E11-A2 with `dmesg` and exit-code evidence | 14.8 |
| G3-2 | high | Display reads keep `PP-OCRv5_server_det` at 2000 px, the detector that ran out of memory on plates; the ocr container has no hard memory limit, so an OOM can kill the api on the host network | `services/ocr/app/detector.py:12, 18`; `display.py:55`; `infra/production/ecs.tf` (no `memory`); `infra/README.md:81` (~3.7 GiB peak) | Measure the display peak on the instance; smaller detection limit or mobile detector for displays; hard `memory` on ocr; only then decide on t3a.large | 14.8 |
| AIR-V2 / G3-3 | medium | "Ler visor" depends on the sidecar even with `OCR_PROVIDER=textract`, and the documented OOM remedy (sidecar off) passes validation and breaks every display read | `providers/index.ts:128-130`; `variables.tf:97-105`; `infra/README.md:81`; `ocr-svc.ts:41-42` | Refuse `enable_ocr_service = false` while displays use it; fix the README; report the sidecar in `/api/health`; hide "Ler visor" when unconfigured | QW3, 14.8 |
| G3-5 | medium | Display volume has no derivation: about 500 undercounts and 1,100 is unexplained; the delivered job has 659 capture cells | fixture table (below); `epics.md:82, 141`; `addendum.md:77` | Size at 660-810 + re-takes, 1,100 as ceiling; measure s/read and peak in 14.1; free CloudWatch alarm on `CPUCreditBalance` | 14.1 |
| AIR-7 | medium | Escalation keeps one whole reading instead of merging per field; Nova Pro is cheaper than Haiku, so "larger model" is unproven | `escalate.ts:39-45`; `kinds/plate.ts:102-123`; `bedrock.ts:69-72`; `config.ts:24` | `mergeReadings` per field (agree gives suggested, differ gives Verificar with both); settle the model on the corpus | 14.22 |
| AIR-V3 | medium | Two shots of one plate never corroborate: the newest suggestion per field wins whatever its trust | `suggestion-rows.ts:56-66`; `job.ts:238-244` | `bestPendingForField`: prefer suggested; agreement across photos earns trust | 14.22 |
| AIR-8 (corrected) | medium | Manufacturer match is exact after accent folding; logo-only brands are dropped. `normalizeRegistryName` is also the server merge comparator, so it must not be loosened | `instrument-row.ts:92-97`; `normalize-name.ts`; `bedrock.ts:340-350`; AD-14 requires cited ids | Fuzzy match in a reading-only function, yields Verificar without "Criar"; logo-only needs an AD-14 amendment | 14.22 |
| AIR-9 | medium | A Verificar field never says why, or what was printed | `entities.ts:540-542`; `assess.ts:27-31`; `suggestion-field.tsx:135` | Hint `{reason, read_as}`; kernel `verifyReasonText` | 14.22 |
| AIR-10 (corrected) | medium | One reading at a time with no priority; caption batches delay a plate. pg-boss option names not verified (no `node_modules` on host) | `worker.ts:101-107, 118`; `main.py:51` | Priorities (plate/display before captions); separate I/O worker at concurrency 2; display stays serialized (G3: safe) | 14.23 |
| G4-3 | medium | Suggested and dictated readings cannot change scale by tap; the user must type a suffix | `read-display.tsx:466-470`; `measurement-field.tsx:355-359`; unit control only at `:172-185` | Same unit control on `SuggestedCell` and `DictatedMeasurementField`, free after G4-2 | 14.30 |
| G4-7 | medium | Dictation as built costs about 2 taps per table cell against about 1 Enter typed; it is online and sends audio to the vendor. Experimental `processLocally` exists (pt-BR availability unverified) | `webspeech-engine.ts:66-69`; `parse/utterance.ts:347-383`; `sheet-observation-dictation.tsx:49-82`; MDN processLocally | One utterance fills a row, or continuous listening fills successive cells as suggestions; probe on-device; lazy-load engines | 14.27 |
| AIB-14 | low | The parser reads one value per utterance; a multi-reading grammar is deterministic work | `utterance.ts:347-381`; `engine.ts:8-11` | `parseTableUtterances` | 14.27 |
| AIR-6 | medium | An on-device display draft is feasible (PP-OCRv5 mobile on onnxruntime-web, FR-36 path), not for plates; needs an AD-14 amendment; models cached outside the shell precache | `ARCHITECTURE-SPINE.md:145`; `read-display.tsx:76-85`; `vite.config.ts:25-55` | Spike on E8-A8 crops; ship only if it beats typing | L8 |
| MKT-6 (corrected) | medium | Candidate chips on Verificar must be grounded (OCR tokens, escalation value, nearest registry row), not invented glyph swaps | `assess.ts:59-65`; CxAI help page | Grounded candidates only | L3 |
| MKT-14 | low | On-device plate OCR fallback (FastField pattern); speculative | quickbase.com FastField post | Time-boxed spike | L8 |
| AIR-11 (corrected) | low | Cost is not the constraint (table above); rereads uncapped; billed failures unrecorded | `infra/README.md:137-141`; `deferred-work.md:1285-1296` | Reread cap per photo per day; record usage of failed calls; monthly AI spend in health or admin | L6 |
| MKT-11 (corrected) | low | A budget deny already exists. Gaps: Budgets lag up to a day, no per-company share, and the degrade is invisible | `infra/production/budget.tf:1-5, 52-63`; `bedrock.ts:254-255` | In-app month-to-date check, kernel-worded "Limite mensal de IA atingido" | L6 |
| MKT-V2 | low | When the cap trips, readings fail as generic "Não foi possível ler" and never resume | `budget.tf`; `bedrock.ts:254-255`; `pt-br.ts:1081-1083` | Hold as queued with a reason; re-enqueue at month turn | L6 |
| AIR-17 / API-1 | medium | Textract classifies `CredentialsProviderError` and `ExpiredTokenException` as permanent, while Bedrock was fixed to transient on 2026-10-06; production uses Textract for plates | `textract.ts:50-62`; `bedrock.ts:254-264`; `textract.test.ts:193-203`; `spec-11-6...md:179`; `spec-11-7...md:55` | Shared `classifyAwsError` in `apps/api/src/ai/`; flip two test rows; strike and amend the 11-7 matrix row | QW2, 14.8 |
| AIR-13 (corrected) | medium | The cabine SE can come from the TR plates. The delivered job has a cabine with power and no transformer, and a "380/220" BT | `seed/v1.ts:587-592`; `cabine-block.tsx:128-136` (env only); `data.ts:208, 212` | as JRN-3 | 14.16 |
| MKT-7 | medium | A confirmed plate could drive the sheet: dry insulation means the subtype's 8 oil items are NA. `na_defaults` is a display default, so set the config, not marks | `seed/v1.ts:42, 327-343`; `instantiate.ts:104`; `conclusion.ts:66` | Kernel `subtypeFromNameplate`; offer as a config op with undo | 14.16 |
| AIR-14 | low | Re-targeting a panel photo to plate pays Textract again on the same bytes | `retarget.ts:24-27, 43`; `job.ts:182`; `kinds/shared.ts:51-57` | Reuse the run's `ocr_result` | L10 |
| AIR-15 | low | Instrument calibration could be read from the stored certificate (office) | `entities.ts:156-175` | Certificate kind on the registry panel | L15 |
| AIR-16 | low | Vision captions get no vocabulary and drift from FO.SERV-03 names | `kinds/caption.ts:26`; `bedrock.ts:237-240`; `audit/prompt.ts:24` | Allowed equipment words in the prompt (types only, never TAGs) | L5 |
| AIR-18 (corrected) | low | Kinds repeat checks; escalation is welded into the plate kind; ~30-40 lines | `plate.ts:74-79, 100-123` | Helpers in `kinds/shared.ts`; extract escalation only when a second kind escalates | 14.11 |
| AIR-19 / WEB-9 | medium | Three hooks re-implement the suggestion actions with two double-tap guards; the "say when drawn" rule (from the 2026-09-30 review's F-25) exists in the plate hook only | `nameplate-suggestions.tsx:157-245`; `read-display.tsx:111-120, 147-232, 587-627` | `useSuggestionActions` | 14.11 |
| PLN-12 | low | Thermo-hygrometer readings are invisible to pre-issue and lose provenance when confirmed | `pre-issue.ts:332`; `entities.ts:337`; `deferred-work.md:1061, 1067` | Cabine pre-issue row; `source_suggestion_id` on env cells (contract) | L12 |

Fixture capture cells by type (G3; one cell is one display shot; the 30 s and 10 min columns are print-only):

| Block type | Count | Capture cells | Total |
|---|---|---|---|
| Cabos (entrada and saída) | 13 | 4 | 52 |
| Para-raio | 5 | 4 | 20 |
| TP | 11 | 6 | 66 |
| TC | 11 | 6 | 66 |
| Transformador | 8 | 6 | 48 |
| Seccionadora | 23 | 9 | 207 |
| Disjuntor | 20 | 9 | 180 |
| **Total** | | | **659** |

### 4.4 AI for building the relatório

#### Printed texts: who writes them and what assist fits

| Text (where printed) | Section | Author today | Cost today | Proposed assist |
|---|---|---|---|---|
| Cliente, obra, datas, empresa, responsável | Capa | Registries and date pickers | 4-8 taps | None |
| Informações adicionais | Capa | Typed, optional | 0-100 keys | None |
| ART/TRT number, validity line | Controle, 10 | Number typed; line composed (`section-10.ts:48-52`) | 13 keys | None |
| Revision table | Controle | Rule | 0 | None |
| Objetivo, Definições, Limite de escopo, Requisitos, NR-10 | 1-5 | Template with variables | 0 | Audit `scope_text_vs_inventory` (AIB-4) |
| Verificações e ensaios aplicáveis | 6 | Template; lists every family incl. "Relé de Proteção" (`sections-v1.ts:192`) | 0 | Deterministic prune or pre-issue row by block types present |
| Caption of a sheet photo | 7 | Context caption | 0; 3 taps to change | NC photos: offer the confirmed observation (AIB-8) |
| Caption of a photo off a sheet | 7 | Vision suggestion, free text | 1 tap; fix 3 taps or 30-60 keys | Vocabulary-limited parts (AIB-6); bulk confirm scoped to the filter (AIB-15) |
| Photo stamp, item line | 7 | Rule | 0 | None |
| Point text, manual | 8 | Typed or one quick chip | 80-200 keys or 1 chip | Split chips into text and action (AIB-7) |
| Point text, from an NC row | 8 | Photo tokens only | 40-120 keys | Kernel seed (AIB-8) |
| Ação recomendada | 8 | Typed, no assist | 60-150 keys | Per-item seed action, then a tap-triggered LLM suggestion (AIB-9) |
| Prioridade / Prazo | 8 | Engineer; deadline by rule | 1-2 taps | Never AI; audit may question (AIB-4) |
| Responsável (point) | 8 | Typed | 10-20 keys | None |
| Derived not-tested entries | 8 | Rule | 0 | None |
| Nameplate values | 9 | Plate Suggestions, copies | 1-3 taps per plate | §4.3 |
| Readings | 9 | Display OCR, typing, dictation (off) | 3-8 keys per cell | Multi-reading dictation (AIB-14) |
| Checklist C/NC/NA | 9 | Taps (bulk exists) | 1 per row | None |
| NC row observation | 9 | AI draft from row photo, else typed | 1 tap or 40-100 keys | Offer a recent sheet photo (AIB-12) |
| Sheet observations | 9 | Rule ("Item n: obs") | 1 tap | None |
| Conclusion pair | 9 | Rule suggestion | 1 tap | Pre-issue `restriction_vs_nc` (AIB-2) |
| Conclusion text + criteria line | 9 | Rule (NFR-12) | 1 tap (hidden, JRN-V1) | Stale handling (AIB-1); cross-reference printed outside the basis (AIB-10) |
| Reading trend vs last visit | 9 | Not built | n/a | Excluded by `prd.md:487` (AIB-13) |
| Parecer verdict | 10 | Engineer; rule hint | 1 tap | Pre-issue `parecer_vs_suggestion` (AIB-2) |
| Parecer summary | 10 | Rule (NFR-12) | 1 tap | No LLM (AIB-11); stale row (AIB-1) |
| Section 10 bullets, signature | 10 | Template, registry | 0 | None |
| Certificates | 11 | Registry images | 0 | None |
| Emission audit findings | not printed | AI audit (13.8) | 1 tap per run | Short refs and coverage, new kinds, staleness, feedback (AIB-3..5, MKT-10) |

#### Proposed assists: trust model and failure mode

| Proposal | Rule or LLM | Who confirms, what the UI shows | Prompt needs | Failure mode | Offline |
|---|---|---|---|---|---|
| Stale text rows (AIB-1) | Rule | Pre-issue row "Ver" | none | none | yes |
| Structural contradictions (AIB-2) | Rule | Info pre-issue row | none | none | yes |
| Audit coverage and short refs (AIB-3) | LLM (existing) | "Conferidas N de M fichas" | filtered text | truncation, now visible | no |
| Semantic audit kinds (AIB-4) | LLM | Info row with "Ver", AI note | observations with marks, edited texts, points, section texts | false positives (info only) | no |
| Caption from vocabulary (AIB-6) | LLM + kernel composition | Chips preselected, "Usar" | image + enums | wrong enum pick, visible | queued |
| Split quick text, NC seed (AIB-7, AIB-8) | Seed / rule | Prefilled, editable | none | wording owned by Bruno | yes |
| Ação recomendada (AIB-9) | Seed table, then LLM | "Sugerido · Usar", never confirm-all | point, type, item, seed actions as style | plausible wrong technique | no |
| Retro NC draft (AIB-12) | LLM (existing kind) | Existing "Usar" | image + item label | describes what is not shown | queued |
| Trends (AIB-13) | Rule | Info line | `last_readings` projection | threshold choice | yes |
| Multi-reading dictation (AIB-14) | Rule | One Suggestion per cell, "Usar todas" for one table | transcript | wrong phase, visible | online speech |
| Parecer or conclusion draft (AIB-11) | Not recommended | n/a | n/a | invented count or TAG under a CREA signature | n/a |

#### Findings

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| AIB-1 | high | A stale confirmed conclusion silently drops from section 9 while pre-issue counts it printable; stale edited texts and a stale parecer print unchanged | `print/section-9.ts:547`; `conclusion.ts:297-301`; `pre-issue.ts:337-344`; `parecer.ts:262-270` ("open question") | One `generatedTextPrintable` rule for sections 9, 10 and pre-issue; rows `conclusion_stale`, `parecer_stale` naming TAGs; Matheus decides print vs block for stale edits | 14.3 |
| AIB-8 (corrected) | high | A point created from an NC row drops the row's observation; a TAG prefix would print twice (Local/TAG column exists) | `checklist-section.tsx:427-433`; `conclusion.ts:50-58`; `section-8.ts:193-197, 209` | `ncRowPointSeed`: "Item n (label): observação" + photo tokens, no TAG; action from the per-item seed | 14.18 |
| AIB-2 | high | The audit pays an LLM to find two contradictions the kernel computes (`restrictionWarning`, `suggestParecer`), and they reach no pre-issue row | `audit/prompt.ts:20-25`; `conclusion.ts:98-103` (used only at `conclusao-section.tsx:176`); `parecer.ts:109-118`; `pre-issue.ts:384-393` | Info rows `restriction_vs_nc`, `restriction_vs_reading`, `parecer_vs_suggestion`; narrow the audit kinds to text-only contradictions | 14.19 |
| AIB-3 | high | On a full-size job the audit input very likely truncates (48k chars, ~48-char UUID refs per line, section 7 sent before section 9), and the screen still says "Nenhum ponto encontrado" | `audit/input.ts:34, 43, 113-115, 139-146`; `audit/job.ts:107`; `entities.ts:611-621`; `audit/text.ts:86-92` | Short positional refs mapped back on the server; clean sheets as one summary line; section 7 after 9 with only non-kernel captions; per-cabine calls if needed; store coverage | 14.20 |
| AIB-V1 | medium | The kernel already flags out-of-family readings (100× outlier) but only inline; the audit redoes unit-scaled arithmetic from text | `reading-evaluation.ts:228-256`; `measurement-field.tsx:231-233`; `prompt.ts:22` | `reading_outlier` info row plus a cross-sheet median at Bruno's factor | 14.19 |
| AIB-4 | medium | The audit's kinds miss what only a model can see: observation vs mark, edited text vs values, point vs finding, scope text vs inventory | `audit/schema.ts:17`; `prompt.ts:31`; `input.ts:172-178`; `sections-v1.ts:192`; Produttivo Manu IA review quote (blog URL) | audit-2 kinds; fixture finding per kind; measure once on the fixture | 14.20 |
| AIB-5 | medium | Audit findings never go stale and cannot be dismissed | `use-audit.ts:69`; `audit/payload.ts:12-18`; `audit-findings.tsx` | "Conferido antes das últimas alterações" (UUIDv7 comparison needs no server field); per-finding "Conferido" device-local | 14.20 |
| MKT-10 | low | No per-finding feedback (Checklist Fácil's Revisor IA rates each) | `audit-findings.tsx:19-45`; checklistfacil support article | "Procede / Não procede" on the run row, outside the op fold | 14.20 |
| AIB-7 (corrected) | medium | Quick texts insert action sentences into the point text and leave "Ação recomendada" empty (raising `points_sem_acao`); the "Chuva e umidade" chip has no action possible | `seed/v3.ts:13-30`; `point-editor.tsx:545-547, 585-592`; `pre-issue.ts:305-307`; FR-53 `epics.md:100` | Seed v4 `{label, text, action}`; per-NC-phrase action chips; retire the rain chip from section 8 (Bruno's wording) | 14.18 |
| AIB-12 (corrected) | medium | An item photo cannot exist before the NC mark (the row camera renders only on NC), so photos shot first are sheet-level and never get a draft | `use-ficha-photos.ts:91-93`; `checklist-section.tsx:412`; `capture-sheet.tsx:221, 498` | When a row turns NC blank, offer recent sheet photos: "Usar esta foto no item?" (one batch, queues `nc_obs`) | 14.18 |
| AIB-6 (corrected) | medium | The vision caption is free text with no context. Seed atividades do not cover general views; a photo location field is a contract change | `kinds/caption.ts:29`; `bedrock.ts:238-239`; `seed/v1.ts:622-633`; `entities.ts:483-486` | Enum parts plus a "vista" class, composed by the kernel; location field costed separately | L5 |
| AIB-V2 | low | `caption_equipment` is mostly a string match against a word table the kernel owns | `photos/caption.ts:24-33`; `prompt.ts:24` | `captionsNamingAbsentEquipment` (whole phrases and acronyms) as an info row | 14.19 |
| AIB-9 (corrected) | medium | An LLM suggestion for "Ação recomendada" is worth adding after a per-item table, but it needs a text-source Suggestion (effort L) | `entities.ts:529, 545-562`; `kinds/types.ts:24-29` | Explicit "Sugerir ação" tap; never confirm-all | L4 |
| AIB-V3 | medium | Any text-only AI assist is blocked by the Suggestion schema, which requires a photo source | `entities.ts:552-557` | Discriminated `suggestionSourceSchema` (photo, text) as an AD amendment with a contract bump | L4 |
| AIB-10 (corrected) | medium | The recommendation is one fixed sentence; point numbers in the basis would stale every conclusion when section 8 renumbers | `conclusion.ts:140-141, 245-255`; `section-9.ts:557` | Print "Ver pontos de atenção 3 e 5 (seção 8)." beside the criteria line, outside the basis; per-item action inside | L9 |
| PLN-4 (corrected) | medium | The conclusion names readings and NC items already; only the trailing recommendation is generic; the engineer edits it on the device | `conclusion.ts:217-224`; `conclusao-section.tsx:241, 374` | Per-item phrases drafted offline at seed time with an LLM, reviewed by Bruno (NFR-12 holds) | L9 |
| AIB-11 | medium | Do not let an LLM write the parecer or a summary; check edits instead | NFR-12 `epics.md:145`; `parecer.ts:211-236`; `section-10.ts:43-52` | Keep NFR-12; `text_vs_values` in the audit | decided |
| AIB-13 (corrected) | medium | Trends and recurring NCs across visits are deterministic work, but excluded by scope (`prd.md:487`, AD-25) | `ARCHITECTURE-SPINE.md:211`; `last-nameplate.ts:8-16` | Post-MVP scope change for Matheus; thresholds by Bruno | L14 |
| AIB-15 / PLN-7 | medium | "Confirmar todas" confirms every AI caption of the relatório, including those outside the active filter, with no undo | `gallery-surface.tsx:136, 141-148, 159-167`; `captions.ts:58-61`; `deferred-work.md:1137-1143` | Scope to the visible filter; "Desfazer" | QW10 |
| AIB-16 (corrected) | low | Generated-text state machine duplicated; print policies drifted; ~15-25 lines | `conclusion.ts:50-58, 277-281`; `parecer.ts:92-96, 257-260` | One `ComposedText`, one `generatedTextPrintable`, shared `ncItems` | 14.3 |
| AIB-17 | low | Prose kinds and the audit/generate workers are copy pairs; the audit invalid-payload path is untested | `kinds/caption.ts:24-35`; `kinds/nc-obs.ts:39-55`; `audit/worker.ts:37-82`; `deferred-work.md:1398-1402` | `proseRun`; generate+audit job harness (C3) | 14.11 |
| MKT-12 | low | The share sends the file with no text; competitors send a summary | `revision-file.ts:84-92` | Deterministic `deliveryMessage(snapshot)` as `text` | QW13 |

### 4.5 Field conditions

#### Contrast of the main token pairs (WCAG 2 formula, `tokens.css:22-148`; glare columns use a reflection model, Lr as a fraction of screen white; model estimates)

| Pair | Light | Dark | Light, glare 0.1 | Dark, 0.1 | Light, 0.3 | Dark, 0.3 |
|---|---|---|---|---|---|---|
| ink-primary on surface-raised | 17.79 | 14.85 | 10.09 | 8.79 | 4.21 | 3.83 |
| ink-primary on surface-base | 16.74 | 16.92 | | | | |
| ink-primary on surface-sunken (field) | 15.70 | 12.93 | | | | |
| ink-primary on focus-fill | 14.32 | 11.86 | | | | |
| ink-primary on fora-do-limite-fill (Sugerido) | 15.23 | 12.57 | | | | |
| ink-secondary on surface-raised | 8.80 | 8.56 | 6.49 | 5.25 | 3.52 | 2.55 |
| ink-secondary on surface-sunken | 7.76 | 7.45 | | | | |
| ink-secondary on focus-fill | 7.08 | 6.84 | | | | |
| primary on surface-raised | 8.66 | 7.68 | 6.43 | 4.76 | 3.50 | 2.37 |
| primary on surface-sunken | 7.65 | 6.69 | | | | |
| primary-foreground on primary | 8.66 | 8.18 | 6.43 | 4.93 | 3.50 | 2.40 |
| conforme on surface-raised | 6.56 | 8.63 | 5.23 | 5.29 | 3.17 | 2.56 |
| conforme on conforme-fill | 5.62 | 7.23 | | | | |
| nao-conforme on surface-raised | 6.57 | 7.27 | 5.25 | 4.53 | 3.17 | 2.28 |
| nao-conforme on its fill | 5.37 | 6.68 | | | | |
| nao-aplica on its fill | 4.91 | 6.22 | | | | |
| fora-do-limite on its fill | 5.82 | 7.76 | 4.64 | 5.08 | 2.84 | 2.58 |
| fora-do-limite on surface-raised | 6.80 | 9.17 | | | | |
| nao-ensaiado on its fill | 7.29 | 7.41 | | | | |
| tri-state letter on conforme solid | 6.56 | 9.20 | 5.23 | 5.48 | 3.17 | 2.59 |
| tri-state letter on nao-conforme solid | 6.57 | 7.75 | | | | |
| tri-state letter on nao-aplica solid | 5.98 | 8.05 | | | | |
| Toast text | 17.79 | 14.85 | | | | |
| Toast action | 8.36 | 7.87 | | | | |
| Camera hint #B6BCC6 on #15181D | 9.32 | 9.32 | | | | |
| border-strong on surface-raised | 5.98 | 5.26 | 4.88 | 3.40 | 3.05 | 1.87 |
| border-hairline on surface-raised | 1.58 | 1.43 | | | | |

| What must be told apart | Light | Dark | Note |
|---|---|---|---|
| focus-fill vs surface-sunken | 1.10 | 1.09 | FLD-2 |
| focus rule vs idle rule (+2 px to 3 px) | 1.45 | 1.46 | FLD-2 |
| conforme vs nao-conforme | 1.00 | 1.19 | FLD-3 |
| conforme vs fora-do-limite | 1.04 | 1.06 | FLD-3 |
| nao-conforme vs fora-do-limite | 1.03 | n/a | FLD-3 |
| conforme-fill vs fora-do-limite-fill | 1.00 | n/a | FLD-3 |
| semantic fills vs surface-raised | 1.17 / 1.22 / 1.22 / 1.17 / 1.23 / 1.24 | 1.19 / 1.09 / 1.21 / 1.18 / 1.14 / 1.25 | Fills carry almost no luminance cue |
| sync-offline vs sync-ok | 1.34 | n/a | FLD-10 |

| Element | Size / weight | Color | Comment |
|---|---|---|---|
| Measurement value | 22 px / 600 | ink-primary | good |
| Field input | 18 px / 400 | ink-primary | good |
| Tri-state letter | 18 px / 600 | on solid | good |
| Block TAG | 22 px / 600 | ink-primary | good |
| Labels, helpers, pills, sync badge | 14 px / 500 | secondary/semantic | at the floor |
| "Lendo…", meta | 14 px / 400 | ink-secondary | at the floor |
| `.cam-word` | 12 px / 600 | white on primary | below the floor (FLD-13) |
| Camera context on a phone | 12 px | white on 12% white | below the floor (FLD-13) |
| Suggestion evidence crop | 48 px, 24 px framed window | image | too small (FLD-6) |

| Action | Path | Taps |
|---|---|---|
| Switch to dark entering a cubicle, from a ficha | avatar, scroll, "Escuro", back | 3-4 + scroll (FLD-5 corrected); 1 with the overflow toggle |
| Recover after an auto-lock mid-ficha | wake, unlock (stylus PIN or glove off) | 3-6 per lock; 0 with Wake Lock |
| Verify a Verificar digit | open crop, read, close | 2 per field; 0 with an inline strip |
| Recover a black finder after a lock mid-burst | close, reopen | 2; 0 with track recovery |

#### Findings

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| FLD-1 | high | Nothing keeps the screen awake during a ficha, capture or a ~30 s reading wait; each lock costs 3-6 touches, sometimes a glove off | no `wakeLock` in `apps/web/src`; `engine.ts:156-166`; WAIT-1; `source-deltas.md:47` | `useScreenWakeLock` on ficha, camera, reading wait; re-acquire on visible; 10 min idle cap; "Manter a tela ligada" in `packages/domain/src/prefs` | 14.5 |
| FLD-7 | medium | Plain toasts last a fixed 6 s, even when they report a lost photo or a refused write; "Salvo às HH:MM" keeps the last success | `state/toast.tsx:24, 110-117`; `camera-view.tsx:294-302`; `use-field-commit.ts:37-42`; `use-ficha-actions.ts:43-51` | Persistent "Não salvo" in the saved line; pause expiry while hidden; scale with length, cap 15 s | 14.5, 14.24 |
| FLD-2 (corrected) | medium | Focus relies on 1.10-1.45:1 changes on plain and measurement fields. Suggestion fields and the textarea already have a 3 px ring | `components.css:76, 488`; `app.css:89-91, 692`; `ficha.css:100, 106`; `DESIGN.md:701` | 3 px inset ring on `.input:focus-within` and the measurement field, authored in `app.css` | QW7 |
| FLD-3 (corrected) | medium | A complete stepper step hides its count, so only a 3 px green/amber rule separates done from missing. Amber's dual use stays DESIGN.md:904's open assumption; an outlier does not look like a Sugerido value | `components.css:260-261, 496`; `tokens.css:268-272, 294-297`; `DESIGN.md:888, 904` | Show the check (override in `app.css`) | QW6 |
| FLD-6 | medium | The evidence crop beside a suggestion is 48 px with a 24 px window framed across the digits | `tokens.css:274`; `components.css:430-437`; `crop-thumb.tsx` `regionStyle` | 72-96 px crop strip under Verificar fields, frame outside digits (DESIGN.md amendment) | 14.24 |
| FLD-5 (corrected) | medium | The theme switch is 3-4 taps away; the in-app "Voltar" from Account lands on Home; no `theme-color` meta | `account-surface.tsx:286-298`; `app-shell.tsx:94, 157-163`; `index.html` | One-tap light/dark in the app-bar overflow; `theme-color` metas | 14.24, QW17 |
| FLD-4 (corrected) | low | No high-contrast mode; the sunlight framing was withdrawn | `theme.ts:9`; `source-deltas.md:47` | `@media (prefers-contrast: more)` overrides in `app.css`; a fourth preference only after device evidence | 14.24 |
| FLD-10 | medium | Offline, the badge hides how much work is only on this device; "Off" is English | `sync/counts.ts:151-157, 260-272`; `tokens.css:59` | "Sem conexão · 12 pendentes"; pt-BR short word | QW8 |
| PLN-V2 | medium | iPad keyboard inset is left out of the sticky-bar padding; the ledger row has no state or owner | `deferred-work.md:1361-1364`; `toast.tsx:88-94` | Use `visualViewport.height`; add the row state; device step | QW15, L11 |
| FLD-11 | low | Android pull-to-refresh can reload the app mid-ficha (and drop a held refused shot) | no `overscroll-behavior`; `app.css:777-786`; `storage-reading.ts:54-58` | `overscroll-behavior-y: contain` | QW5 |
| FLD-13 | low | Camera text below the 14 px floor | `components.css:214, 217`; `app.css:637` | 14 px, wrap context | 14.13 |
| FLD-14 | low | The sync engine ignores page visibility; up to 60 s stale after unlock | `engine.ts:143-148, 168-171, 682-690` | `engine.nudge()` on visible | QW9 |
| FLD-15 (corrected) | low | The destructive confirm sits 12 px from Cancelar; the cited irreversible example is wrong (sign-out keeps the work) | `confirm-dialog.tsx:67-79`; `components.css:669` | Stack on phone; low priority | later |
| FLD-16 (corrected) | low | The low-storage banner asks to sync offline; fires at 500 MB free (early warning); the quota figure is unreliable (see G1-1) | `photos/text.ts:71-83`; `checks/storage.ts:13` | Superseded by G1-1 | 14.29 |

### 4.6 The deliverable: the printed relatório as a UX surface (gap G5)

| Scenario | Photos printed | Estimated file size (PDF ≈ DOCX) | Estimated pages | Original |
|---|---|---|---|---|
| Porto Seguro parity | 82 | 25-65 MB | 125-145 | 5.3 MB, 124 pages (`extract-fo-serv-03.md:3`) |
| Photo-first (82 + 94 plates) | 176, each sheet photo printed twice | 50-140 MB | 200+ | — |
| FR-42 scale (82 + 94 + ~1,100 display shots) | ~1,276 | 0.4-1 GB | 600-700 | — |

Estimates assume 0.3-0.8 MB per 2000 px q85 JPEG. Nothing has been measured with photo bytes. The `docx` library stores identical media once, so double printing adds pages, not bytes.

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| G5-1 | high | Photos enter the relatório at about 600 dpi (2000 px into 8.5 cm); LibreOffice export reduces nothing (`ReduceImageResolution` defaults to false, no filter options) | `storage/variants.ts:15-17`; `jobs/generate/sections/section-7.ts:22-23, 33-75`; `section-9.ts:60-61`; `docx.ts:136-147`; `libreoffice.ts:100`; LibreOffice pdf_params help | Resample once per job in `loadPhotoImages` to the placed box at ~250 dpi (long edge 850-1000 px, q80); add `ReduceImageResolution`/`MaxImageResolution=300` as a backstop; keep the 2000 px variant for readings; source-deltas row (AD-7 role) | 14.31 |
| G5-2 | high | Reading photos (display bursts, plate shots) print by default in section 7 and again in section 9, so the more photo-first the job, the bigger and slower the document; the only way out is deleting evidence | `photos/order.ts:35-37`; `print/section-7.ts:9-13, 46-62`; `print/section-9.ts:582-592`; `read-display.tsx:516-519`; `prd.md:586` (captioned photos only) | Kernel `printsInRelatorio(photo)`: display shots out by default (value is in the table; photo stays as traceability); plate shots in section 9 only or out (Bruno); one-tap "Incluir no relatório"; numbering counts printed photos only; regenerate goldens | 14.31 |
| G5-3 | med-high | Generation was never measured with photo bytes; NFR-7 has no number; the 641 MiB peak and "edge of 4 GiB" were measured without photos | `snapshot.golden.json` (82 photos, `uploaded_at: null`); `deferred-work.md:545`; `job.integration.test.ts:123`; `epics.md:140`; `mvp-review README:17`; `infra/README.md:77-81` | Per-wave scale probe (parity, photo-first, FR-42) recording pages, bytes, seconds per pass, `toc_passes`, peak memory; NFR-7 numbers in source-deltas | 14.32 |
| G5-4 | medium | Each of the 2-3 conversion passes has a hard 120 s limit that production cannot change; a timeout fails the same way on every retry behind one generic message | `libreoffice.ts:41`; `main.ts:47-54`; `config.ts:89`; `job.ts:182-206`; `revisions.ts:91`; `pt-br.ts:466-467` | `GENERATE_CONVERT_TIMEOUT_MS` within the 900 s expiry; kernel wording for `libreoffice_timeout` with the fix (print fewer photos); log seconds per pass | 14.31 |
| G5-5 | medium | The Export dialog downloads both files when it opens on a share-capable device and never shows their size | `export-dialog.tsx:142-161`; `revision-file.ts:31-35`; `job.ts:372` (size stored); `files/tile.ts:25` (`fileSizeText`) | "PDF · 38 MB"; prefetch the PDF only, under a threshold; kernel note above 25 MB ("grande demais para e-mail") | 14.31 |
| G5-6 | medium | SM-4 has never been judged, and never on a document with photos; the full fixture prints placeholders for all 82 photos | `SPEC.md:175`; `delivery-slice.md:7, 39`; `test-design-qa.md:195`; `section-7.ts:76-79` | Ordered gate: 14.31, then 14.32, then a recorded Bruno session comparing pages, size, sharpness, and whether reading shots belong | 14.2 |
| G8-2 | low-med | An issued relatório cannot be opened on the device without network (useful on a return visit, inside a cabine) | `public/sw.js:6`; `revision-file.ts:30-34`; `pt-br.ts:522` | Keep the newest revision's PDF of each pulled relatório in the file store under the storage budget, evicted first; still a file, never a URL (E11-Q1) | L16 |

### 4.7 Offline durability, contract skew and server availability (gaps G1, G2, G3-4, G4-6)

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| G2-1 | high | A pull answering 426 replaces the whole shell with "Atualização necessária" within about 60 s on every online tablet. Ficha, camera, Sumário and "Sincronizar agora" disappear; server-written Suggestions stop arriving; the flag never clears without a reload. Pushes continue | `apps/web/src/app.tsx:57-58`; `engine.ts:156, 553, 604-608, 650-653`; `contract-outdated-surface.tsx:6-9, 23`; AD-13 `ARCHITECTURE-SPINE.md:139`; AR-12 `epics.md:168`; only test is @p2 (`e2e/sync.spec.ts:126-167`) | Dated AD-13/AR-12 amendment: persistent banner after re-auth, capture continues; keep a blocking screen only for a fold change that a decision requires; raise the 426 test to @p1 and put it in the touched set of any MIN raise | 14.28 |
| G2-2 | high | Strict pull parsing turns every new op family into a forced update: 7 of the 12 historical MIN raises were "cannot parse a new family" | `ops/op.ts:98-110`; `sync/policy.ts:130-137`; `contract/version.ts` notes 2-8 and 15 (`CONTRACT_VERSION = MIN = 15`) | Park unknown-family ops raw (e.g. `unknown_ops` table), advance the cursor, replay through `applyOp` after the upgrade; raise MIN only when a known reducer or shape changes; document the rule in `version.ts` | 14.28 |
| G2-3 | medium | "Atualizar" with a non-empty outbox reloads into the pinned old shell, which hits 426 again; no `controllerchange` or `registration.update()` | `sw/register.ts:100-127`; `sw/use-shell-update.ts:26-49`; `public/sw.js:109, 384-408` | Show the backlog count (kernel); enable at backlog 0; `registration.update()` on 426; auto-reload at backlog 0 from a safe surface, never with the camera or a dialog open | 14.28 |
| G2-4 | medium | Each forced update costs about 7.6 MB uncompressed per tablet: ~2.3 MB on reload, then the whole 5.3 MB precache again, including the unchanged 3 MB `heic-to` | `public/sw.js:284`; `vite.config.ts:81-89`; local `dist` sizes; no compression in `apps/api/src/http/app.ts:253-269` or `infra/caddy/Caddyfile:30` | Caddy `encode zstd gzip`; copy unchanged hashed assets from the old cache on install; consider leaving `heic-to` out of the precache (offline HEIC import trade-off) | QW26, 14.34 |
| G2-5 | medium | No release policy for MIN-raising deploys; the cadence is per story; the Epic 13 retro question is unanswered | `infra/README.md:107`; `infra/PUBLISHING.md:83`; `epic-13-retro-2026-10-08.md:165` | Until 14.28: one release train per wave for MIN raises, evening window 18:00-23:00 (instance off 00:00-05:00), ask the field to sync first; PUBLISHING.md skew checklist; for the MIN 15 deploy already on main, send a field note | QW28 |
| G2-6 | low | The spine's push rule drifts from the code (the code accepts pushes below MIN, which keeps outdated tablets' work flowing) | `ARCHITECTURE-SPINE.md:139` vs `sync/routes.ts:31-35, 135-155` | Strike and amend with the G2-1 decision | 14.28 |
| G1-1 | high | The low-storage warning cannot see device free space: `quota - usage` uses ~60% of total disk (anti-fingerprinting), so Android Chrome can evict the whole origin under pressure with no warning; the app's own eviction never starts; device script step 6 cannot calibrate it | `checks/storage.ts:31`; `db/file-store.ts:221`; `offline-proof-script.md:144`; MDN storage quotas page; stale comment `device/storage-estimate.ts:35-37` | Warn on what the app can measure (unsynced bytes and age: "n fotos só neste aparelho (x MB)"); rename the concept (origin headroom); request persistence (G1-3); record OS free space next to `estimate()` in the device script | 14.29 |
| G1-2 | medium | The 5-day unsynced banner ignores the photo queue that FR-57 includes; "ops acked, photos queued" is the common weak-signal state | `epics.md:106`; `db/commit.ts:357-359`; `app-shell.tsx:80-84, 124`; `banner-slot.tsx:120-126` | Feed it the oldest un-acked original's `created_at` too; kernel wording "Fotos e alterações só neste aparelho há 5 dias"; 3 days on iPad | QW35, 14.29 |
| G1-3 | medium | FR-54's blanket "no `persist()`" gives up a free, no-prompt protection on Android Chrome (a tab on Safari is effectively denied anyway) | `epics.md:104, 758`; `ARCHITECTURE-SPINE.md:108-109`; `spec-1-8...md:131`; web.dev persistent storage; `review-versions.md:31` | Source-deltas row: call `persist()` once per session on coarse-pointer devices, never rely on it; show `persisted()` in Conta; skip Firefox. iPad: Add to Home Screen is a Matheus decision (reverses web-only), to test first in 14.1 | 14.29 (decision) |
| G1-5 | medium | After an eviction, photos that never reached the server read as "Aguardando envio" forever and silently drop from the document | `photos/text.ts:55-58`; `pre-issue.ts:293-296`; `print/revisions.ts:208-216`; `eviction-recovery-surface.tsx:62-69` | Kernel `lost` upload state "Perdida neste aparelho — refazer foto" as a pending Sumário row; list lost photos on the recovery screen | 14.29 |
| G1-4 | medium | Device script step 5 cannot observe the loss it tests (work is synced before the 7-day wait), and step 5 has no pass definition | `offline-proof-script.md:115-129, 166-176, 185-192` | Steps 5a (unsent marker + photo, 7+ days), 5b (Home Screen web app: `persisted()`, sign-in, camera, torch, downloads), 5c (cold open offline after eviction), step 6 OS free space, Android `persisted()` after a week; pass/fail up front | 14.1 |
| G4-6 | medium | A cold start on weak or stalled signal can hang: with an empty outbox, navigation is network-first with no timeout | `public/sw.js:105-109, 404-412` (no timeout anywhere) | Race the page fetch against ~3 s and answer from the shell cache; add a never-resolving fetch case to `sw-lifecycle.test.ts` | 14.34 |
| G3-4 | medium | The production stop 00:00-05:00 assumes no night work; maintenance shutdowns often run at night or over a holiday weekend; AI readings then wait until 05:00 and drain at once | `infra/production/schedule.tf:1-2, 9-20`; `reconcile-brief-and-raw.md:211` | Ask Bruno; if yes, `enable_night_schedule = false` (+USD 5.72/month, fits on medium) or a per-job override; check the Sync status copy for a scheduled server outage | decision |
| G4-9 | low | Two Terraform texts misstate the code (database no longer stopped; budget acts at 90%); stale `.plan` files with possibly sensitive values remain on disk | `variables.tf:109` vs `schedule.tf:5-7`; `budget.tf:1-3` vs `:63` | Fix texts; runbook line for a known shutdown; delete plan files after apply | QW27 |

### 4.8 Two people, two tablets (gap G7)

Today's tap cost of the conflict surfaces:

| Case | Path | Taps |
|---|---|---|
| Cell contradiction, N cells, from the open sheet | Banner "Ver" (`conflict-banner.tsx:56`), one pick per cell (no preselection, `conflict-dialog.tsx:131-142`), "Aplicar" waits for every pick | N+2 |
| Same, from another surface | Sync badge, row, then as above | N+3 |
| Same, from a sheet other than the conflicting one | No banner (`conflict-banner.tsx:32` matches `block_id` only) | N+3 |
| Removed vs edited | "Manter" or "Remover", undo toast (`decision-actions.ts:33-34, 111-140`) | 1 |
| Duplicate TAG | "Manter as duas" | 1 |
| Duplicate TAG | "Renomear uma": dialog, typing, save | ~3 + typing |
| Last-writer-wins merges (SE, env, captions, block fields) | Nothing asked; the losing value lives in engine memory until a reload (`merge/info.ts:14-17`) | 0 |

| Id | Sev | Finding | Evidence | Recommendation | Lands in |
|---|---|---|---|---|---|
| G7-1 | medium | Splitting the work is "the intended way" to avoid conflicts, but nothing supports it: no claim, presence or author in the tree | `EXPERIENCE.md:451` [ASSUMPTION]; `ficha-header.tsx:66-71`; `sheet-progress.ts:323-326` | Per-cabine "Executor" claim, kernel "por ⟨nome⟩", walk filter "minhas / sem executor"; ask Bruno first how often two people work one job | L17 |
| G7-2 | medium | Cabine SE and environment merge last-writer-wins with no filled-beats-empty rule, unlike sheet cells; the losing value disappears on reload | `merge/info.ts:14-17, 35-45, 94-104`; `merge/policy.ts:31`; `state/sync.tsx:101` | Run `location/se` and `location/env` through `same_value` / `filled_over_empty` / `contradiction`; persist merge entries per relatório until seen; prerequisite of 14.16 | 14.33 |
| G7-3 / PLN-V3 | medium | The same panel photo confirmed on two devices creates the block twice; the duplicate-TAG decision has no "remove the copy" option (~5 taps today) | `relatorio/panel.ts:114-119`; `deferred-work.md:1384`; `conflict-banner.tsx:67-72` | List only own photos, or mark claimed on confirm; detect a duplicate TAG sharing one panel `source.photo_id` and offer "Remover a repetida" with undo | 14.33 |
| G7-4 | medium | An open contradiction never reaches the pre-issue list or Emitir; the relatório prints an arbitrary one of two readings | `pre-issue.ts:138, 437`; open since `epics.md:2289, 2323`, E10-A6 | Pre-issue row "N células em contradição", blocking or warning per Matheus's E10-A6 answer; structure decisions as rows | 14.33 |
| G7-5 | low-med | The Conflict view shows evidence only for values that came from a reading | `conflict-dialog.tsx:219-221` | 48 px thumbnail of the block's latest photo or plate | 14.33 |
| G7-6 | low (inferred) | Both devices get a `role=alert` banner; two "Aplicar" picks offline would raise a fresh contradiction (not tested) | `conflict-banner.tsx:75`; `policy.ts:33, 103` | Alert only the displaced device; kernel test that concurrent picks re-raise once | 14.33 |
| G7-7 | low | `EXPERIENCE.md:30` still says one device fills a relatório | `EXPERIENCE.md:30` vs Epic 10 | Strike through and date | QW32 |

Walks must count shared data: a block is covered when any device has a plate photo or pending suggestions for it (14.14, 14.15), and suggestions from another person's photo should show their author.

## 5. Market

### 5.1 Competitor synthesis

- **The 2026-10-06 premise does not hold** (MKT-1, corrected). Review §1 (`review-field-ux-2026-10-06.md:9`) called "photo → structured fields → normative DOCX/PDF" unoccupied.
  - Generic field-service platforms already ship nameplate OCR: ServiceTrade Smart Scan (Premium/Enterprise), FastField AI Label Scanner (confidence indicators, basic OCR offline or past quota) and CxPlanner CxAI (candidate dropdowns at low confidence).
  - The one Brazilian MV competitor, Mesh Labs Ensaia, announces "A placa vira cadastro por foto" but is pre-launch ("Em breve") and Android only. Its page shows reports built in the browser, and DOCX output is unconfirmed on the page.
  - Plate OCR is table stakes. Fasor's open ground is digit-grounded confirmation across every block type plus displays, panel-to-block, NC drafts, the emission audit, and FO.SERV-03 DOCX/PDF on iPad.
- **The reference apps are field-service suites, not relatório tools** (G8). Field Control and Produttivo are built on dispatch, scheduling, maps, a service-order PDF, client signature on site and WhatsApp/email delivery. Their AI is back-office or audio/text:
  - **Field Control field.elo** (verified on 2026-10-08 at `https://fieldcontrol.com.br/field-elo.html`): "Validador de OS", "Resumo Automático", "Score de Formulários" (which mentions image quality), "Reescrita de Formulários". Credits cost R$ 120 for 500, R$ 480 for 2,500 and R$ 960 for 5,000 per month. The page mentions no photo reading.
  - **Produttivo Manu IA**: audio fills the checklist; it "sugere melhorias no preenchimento, corrige erros ortográficos e garante que o documento esteja dentro do padrão" (`produttivo.com.br/blog/gerar-relatorios-automaticos-com-ia/`). It sends a summary to the client by WhatsApp or email.
- **Patterns the market converged on.**
  - One voice note fills many fields: Manu IA, Fulcrum Audio FastFill, Mitti.
  - AI review after completion that only informs: field.elo Validador, Checklist Fácil Revisor IA (with per-finding feedback). Fasor's 13.8 matches this minus the feedback.
  - Photo-first capture that tags assets: Fulcrum Photo FastFill (in progress), Mitti AI Issue Capture.
  - AI metered in credits with a degraded fallback.
- **Where users punish competitors.** iOS sync stalls, the camera closing per shot, crashes after updates:
  - Produttivo iOS reviews: "Sincronização no IOS não funciona" (2026-05-11), "Tirar várias fotos precisa fechar a câmera" (2025-11-06).
  - Field Control 16.36.0 fixes "the app no longer closes on its own when recovering from a crash".

  These are device-level failures. Fasor's real-device script has never run (MKT-9).
- **Bruno's own view is not on record** (G8-1). Every "Bruno used/liked" statement relays Matheus. `docs/concorrentes/README.md:50` does not even track either app. The brief shows today's process as paper, then Excel, then Word ("eu preencho duas vezes", `brief.md:22`). Whatever he used, the relatório still ended in Word. That suggests, without proving it, that neither app produces a ~120-page FO.SERV-03 with native test tables.

### 5.2 Core workflow compared (G8)

| Capability | Field Control (public) | Produttivo (public) | fasor today | Verdict |
|---|---|---|---|---|
| Work orders, scheduling, routing | OS, dashboard, map, route optimization | Calendar, "Roteirização inteligente", requests by QR or WhatsApp, PMOC plans | Project to relatório; no dispatch | Missing on purpose (1-2 engineers); a later SaaS question |
| Form builder with conditional logic | Admin-editable forms; reviewers call records "rigid" | "totalmente personalizados" | Eight FO.SERV-03 block types fixed in the seed | Conditional logic unverified for either; kernel rules are a strength for a normative document |
| Signature on site | e-signatures in the mobile app | "coleta de assinaturas... na tela" | Engineer's signature out of scope (`brief.md:108`); section 10 prints no image (FR-69) | The client's acknowledgment was never asked (G8-4) |
| Report to the client on completion | Rating link; technician location shared | "relatório gerado na hora... por email ou whatsapp"; logo from the 2nd plan | Share sheet sends the file, never a URL (E11-Q1, PR #79) | Decided; FO.SERV-03 goes through review and ART first |
| PDF on site without connectivity | Not stated; offline "not fully reliable" (softwarefinder) | Not stated | Generation is server-only (FR-62); an issued PDF is not kept offline | Viewing offline is the gap (G8-2) |
| GPS and time check-in | Live technician map | Team map; photos stamped with time and place | Photos carry `captured_at`, `tz_offset`, `coords`; switch on by default (Story 11.5) | Equal provenance; tracking people not wanted; service period could come from photos (G8-3) |
| Satisfaction survey | Rating link | "Pesquisa de Satisfação" | None | Not relevant |

### 5.3 Feature matrix (public material read on 2026-10-08; "not found" means not shown publicly)

| Capability | Field Control | Produttivo | Mesh Labs Ensaia | Minipa Link | OMICRON PTM / PTMate | Megger PowerDB | Mitti (ex-SafetyCulture) | Fulcrum | FastField / ServiceTrade / CxAI | Checklist Fácil | Auvo | fasor today |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nameplate OCR | not found | not found | announced, pre-launch (plate to registry) | not found | nameplate drives guided plans; OCR not found | not found | not found | Photo FastFill in progress | yes (make/model/serial; confidence; candidates) | image recognition, not plate-specific | not found | yes, every block type but cables; digit coverage |
| Meter/display reading | not found | not found | Bluetooth with Megabras | Bluetooth with Minipa | direct from test sets | import | not found | not found | Anyline SDK (separate) | not found | not found | "Ler visor" burst; 40% on 15 crops |
| AI caption | not found ("Reescrita" is text) | not found | not found | not found | not found | not found | not found | not found | not found | not found | not found | context caption + vision Suggestion; people never sent |
| AI summary / conclusion | Resumo Automático | Manu IA summary to client | not found | "montar o relatório" | not found | deficiency summary (non-AI) | AI summaries | Insights | not found | not found | not found | deterministic by decision (NFR-12) |
| AI audit before closing | Validador de OS (after completion) | Manu IA review, spelling | pendências list (non-AI) | AI checks records | not found | not found | risk detection | QA in progress | not found | Revisor IA (informative, feedback) | not found | 13.8, one tap, 4 kinds, never writes |
| Voice to form | not found | Manu IA audio | not found | voice annotations | not found | not found | voice notes to issues | Audio FastFill (many fields) | not found | not found | not found | per-control dictation built, off, online-only |
| QR / barcode asset | QR | QR to history | not found | not found | not found | not found | not verified | not verified | not found | not found | QR to past maintenance | none (rejected); TAG rebinding |
| Offline | yes; "doesn't work 100%" | "funciona offline"; iOS sync complaints | airplane mode | claimed | PTMate offline | field DB | not verified | not verified | AI online, basic OCR offline | sync complaints | complaints | offline-first by construction |
| Photo markup | not found | annotations | not found | annotations | not found | not found | yes | not verified | not found | not found | not found | none (rejected) |
| Word/PDF normative output | OS report | PDF with logo; Excel on top plan | browser-built laudo (DOCX unconfirmed) | PDF only | custom reports | package with ToC (Windows) | PDF | not verified | not found | not found | reports | FO.SERV-03 DOCX + PDF, identical, frozen revisions |
| Multi-device merge | not found | not found | not found | not found | DataSync | field-to-master DB | not found | not found | not found | not found | not found | sub-block merge rules (Epic 10) |
| History across visits | not found | QR history; recurring plans | not found | not found | asset DB | master DB | basic history | not found | asset records | not found | QR history | "Copiar da última visita" per sheet; no comparison by decision |

### 5.4 Pricing signals and changes

| Product | Signal | Source |
|---|---|---|
| Field Control | R$ 525/month for 4 licences (09-18); field.elo R$ 120/500, R$ 480/2,500, R$ 960/5,000 credits per month | `fieldcontrol.com.br/field-elo.html`; `research.md:345` |
| Produttivo | 4 plans, no public price; 15-day trial | `produttivo.com.br/planos/` |
| Mesh Labs | R$ 1,397/year pre-launch; Android only | `labs.meshengenharia.com/sobre` |
| Minipa Link | R$ 0 / 60 / 120 / 180 per month | `minipalink.com.br/pt` |
| Mitti | Free to 10 users with 300 AI credits/seat; Premium US$ 24-29/seat | `mitti.com/pricing` |
| FastField | AI Label Scanner on Pro, 1,500 scans/month, then basic OCR | quickbase.com blog |
| ServiceTrade | Smart Scan on Premium and Enterprise | servicetrade.com blog |
| OMICRON | PTMate free; PTM quote only | App Store PTMate |

| Item | Change since 2026-10-06 |
|---|---|
| Market premise | "Unoccupied pipeline" refuted (MKT-1, corrected) |
| SafetyCulture | Rebranded Mitti on 2026-08-11; AI in every plan, metered; photo and voice issue capture |
| Field Control | field.elo credit pricing public; ChatGPT integration announced 2026-06-30 (manager-facing); app 16.36.0 fixes crash recovery |
| Produttivo | Home page markets QR equipment history and recurring plans; no new iOS reviews after 2026-06-01 |
| Fulcrum | Audio FastFill live; Photo FastFill and QA anomaly detection in progress |
| Mesh Labs | Still Android-only; Ensaia pre-launch; Aterra, Equipa, SELetiva "em breve" |

### 5.5 Market findings (where each landed)

| Id | Sev | Finding | Lands in |
|---|---|---|---|
| MKT-1 (corrected) | medium | Premise false: OCR ships in generic platforms; the MV competitor is pre-launch | QW16 |
| MKT-2 | high | Shot quality at the shutter (§4.2) | 14.12 |
| MKT-3 (corrected) | high | Display is the weakest assist; LLM second opinion gated (§4.3) | L3 |
| MKT-4 | high | Offline "Nota de voz": one recording, many Suggestions (MediaRecorder offline, Transcribe pt-BR + structuring, observation Suggestions only; new file kind; spike on 20 notes) | L7 |
| MKT-5 (corrected) | medium | Plate recognition among unassigned photos (§4.2) | 14.17 |
| MKT-6 (corrected) | medium | Grounded candidates on Verificar (§4.3) | L3 |
| MKT-7 | medium | Plate drives subtype NA (§4.3) | 14.16 |
| MKT-8 (corrected) | medium | "Copiar N placas da última visita" in one batch with undo; the "differs from last visit" hint is out (`SPEC.md:166`) | L1 |
| MKT-9 | medium | Device script before the next field use, with competitor-derived checks: 30-shot burst, full sheet in airplane mode, update with unsent ops, DOCX share on iPadOS | 14.1 |
| MKT-10 | low | Audit feedback per finding (§4.4) | 14.20 |
| MKT-11 (corrected) | low | In-app AI spend guard (§4.3) | L6 |
| MKT-12 | low | Deterministic share message (§4.4) | QW13 |
| MKT-13 | low | Avoid list: markup and forced camera stay rejected; QR only as printed TAG labels, post-MVP | decided |
| MKT-14 | low | On-device OCR spike (§4.3) | L8 |
| MKT-V1 | medium | Serial rebind: a confirmed N SÉRIE matching last visit's `last_nameplate` within the project offers "Vincular" when the TAG did not rebind (`instantiate.ts:258-266`) | L1 |
| MKT-V2 | low | Hold readings when the cap trips (§4.3) | L6 |
| G8-1 | medium | Record Bruno's view: which app, what stayed in Word, client signature, sending before leaving, offline failures, why he stopped, what he misses | 14.2 |
| G8-2 | low-med | Issued PDF offline (§4.6) | L16 |
| G8-3 | low | Service period from capture times (§4.1) | QW30 |
| G8-4 | low | Client acknowledgment on site is an open question, not a decided exclusion; if yes, a separate short document, never FO.SERV-03 | 14.2 question |
| G8-5 | refuted | "Competitor AI-QA premise unsourced": field-elo.html lists "Validador de OS" and the Produttivo blog quotes the review; only the 10-06 review lacked URLs | QW16 |

## 6. Recommended direction and the AI map

### 6.1 Score of the three candidate directions (1 poor to 5 strong)

| Criterion | Photo-first | Tap diet | AI copilot |
|---|---|---|---|
| Fit to the persona (minimal touch, photo as primary source, varied light) | **5**. The camera drives the ficha: plate walk, shot quality at the shutter, torch per cabine, visible failures | **3**. The minimal-touch half is excellent. The photo half is deferred: walk at P2, displays gated, no shot-quality or camera-failure work | **3**. Best answer to "IA nas legendas e conclusões". Readings stay typed; nothing for capture robustness |
| Measured taps removed | **3**. J-0 from ~33 to ~11, but its photo-reading path rises to ~20-22 taps (SIGNAL_BUDGET 20 vs 9, JRN-4) | **5**. Largest cut per unit of effort: the hidden JRN-V1 tap (~94 per job), 4 of J1's 9 taps, wake lock, review walk; extends budgets first (JRN-9) | **3**. Same deterministic folds; leaves the offline confirm pass unchanged |
| Trust and normative safety | **4**. Suggest-and-confirm holds; a paid reread, wrong-block risk in the walk and an AD-14 change add surface | **4**. No new AI; folding the text confirm into Concluir weakens deliberate confirmation slightly, mitigated by amber text, the D-4 precedent and stale rows | **5**. Never writes conclusion or parecer, no confirm-all for AI prose, text-source union before text AI, accuracy gate before threshold changes |
| Offline robustness | **4**. Walk and shots fully offline; display readings still need the server | **5**. Every change works offline | **3**. Audit-2, action suggestions and voice structuring are online only |
| Cost against USD 100/month | **4**. Paid rereads, gated display second reader (+USD 1.1-2.2 per job) | **5**. No paid call added | **4**. USD 1.3-1.8 per large job through P1, 2.8-4.3 with every P2 item |
| Effort and risk | **2**. 25 stories, three L, at least 4 contract bumps, every capture claim unverified (PLN-1) | **5**. Mostly S, few contract bumps | **3**. 28 stories, contract bumps in 5, false-positive risk in new audit kinds |
| Fit with binding decisions and plans | **2**. About 9 amendments; per-reading "Ler visor" at P1 against `source-deltas.md:16` | **4**. Smaller amendments (D-4, 5.8, 13.2, "Revisar em sequência", AD-22, FR-34, `EXPERIENCE.md:123`) | **4**. Holds NFR-12 and AD-14; needs D-4, 5.8, the FR-53 chip shape |
| **Total (of 35)** | **24** | **31** | **25** |

### 6.2 Thesis

Make the photo the primary source by first making it reliable, and only then ambitious.

1. **Remove the touches the device can already remove.** These are deterministic, offline and free:
   - the text confirm folded into Concluir;
   - the instrument from setup;
   - the cabine SE from the transformer plates;
   - NC points that open half written;
   - a review walk for readings that arrive later.
2. **Make every shot end in a visible state.** A shot is either useful or says loudly why it is not: an "empty" reading, failures shown inside the camera, a one-tap retake, a quality hint at the shutter, a screen that stays awake.
3. **Then scale capture and reading behind evidence.** The plate walk, "any photo can be a plate", and plate trust and prompt v2 are each gated on one device session and one real-photo corpus.
4. **New from the gap round.**
   - Never stop the field for a server reason (contract skew, cold start, night stop).
   - Treat the printed relatório as a UX surface. More photo-first capture must not make the deliverable unsendable.

### 6.3 Principles

1. **Evidence before claims.** No capture or reading story is done without its device line. No trust threshold, prompt or model changes without the corpus "suggested but wrong" metric (PLN-1, AIR-12).
2. **Fold confirmations into taps already made; never add one.** D-4 is the precedent; JRN-V1 and JRN-2 follow it. A fold confirms only kernel-composed text or a kernel suggestion.
3. **Kernel first, LLM second.** A rule that can compute it lives in `packages/domain`. The LLM reads pixels (plates, panels, later displays) and meaning (audit-2).
4. **No photo goes silent.** Every reading ends as read, empty, failed, queued, held or lost, each with kernel text and a next action (CAPT-V1, FLD-V1, MKT-V2, G1-5).
5. **Typing stays primary for display readings** until real-photo accuracy beats it (`source-deltas.md:16`, E9-A6).
6. **Measure touches before changing them.** Every journey a story touches has an asserted budget (JRN-9).
7. **Bulk-confirm only grounded plate fields.** AI prose is never confirmed off screen.
8. **One seam per concern, built when the first story needs it**: `CameraOpener`/`ShotSession`, `useSuggestionActions`, `apps/api/src/ai/`, `generated-text.ts`, `kinds/shared.ts`, the numeric cell (G4-2).
9. **Every decision change is written first** as a dated source-deltas row, with strike-through in the planning documents.
10. **(new) The server never stops capture.** An outdated client keeps capturing like an offline one. Contract bumps ship as release trains until unknown families are skippable (G2).
11. **(new) What prints is decided by a kernel rule, not by what was captured.** Reading evidence stays in the app; the document carries what the client needs, at print resolution (G5).

### 6.4 Conflicts resolved

| Conflict | Positions | Resolution | Why |
|---|---|---|---|
| Plate walk priority (CAPT-2) | Photo-first P0, tap diet P2 | **P1, wave 2**, after the camera seam (14.10), the empty state (14.4), the device session, and the print rule (14.31) | Flagship (~33 to ~11 taps); L size in the 899-line camera file; more plate shots must not bloat the document |
| Per-reading "Ler visor" (JRN-4) | Photo-first P1, tap diet gated | **Later, gated** on E9-A6 ≥ 8/15 on tablet photos | Photo path costs ~2× taps today; typing primary by decision |
| Reading the original vs the print (AIR-4, CAPT-V3) | Photo-first P1, copilot holds | **Measure both in 14.1**, amend AD-14 in 14.22 only if OCR gains | AD-14 binding |
| ART/TRT gate (JRN-V2) | Move it vs leave | **Default: smaller variant** (Rascunho with a last-opened sheet is current on Home) | No AD-22 change |
| Cabine SE gating (JRN-3) | D-5 amendment | **No gating change**; suggestion on the "Da cabine" line; **merge rule first** (G7-2) | Same saving, one amendment fewer; avoids silent LWW overwrites |
| Audit pre-start on dialog open (JRN-7) | Optional later | **Not now**; coverage first (AIB-3) | A truncated "Nenhum ponto encontrado" is worse than no audit |
| Display LLM second reader | P2 gated | **Later, gated** on E9-A6 and an FR-36 row; AI-off path OCR-only | Only line that moves cost materially |
| Dictation (13.9) | Voice note vs spike | **Decide the consent wording now** (option b: a vendor-named line; the photo POC rule is not like-for-like). **Ship only with multi-cell utterances** (G4-7) and after 14.30 | As built it adds taps per cell |
| Torch reset (JRN-8) | Narrow 13.2 | **In-memory flag per cabine**, never persisted | Keeps the 13.2 intent |
| Panel photo as plate (CAPT-5) | Change FR-38 | **Later**; keep FR-38, offer a "now the plate" shot | Delivered AC; weak read unmeasured |
| "Differs from last visit" hints | Drop vs defer | **Out until `SPEC.md:166` is revisited** | Non-goal |
| **Contract bumps (new, G2)** | Routine per-story AC vs field continuity | **14.28 first** (non-blocking outdated state, skip unknown families); until then MIN raises ship as one release train per wave in an evening window | 12 of 14 past steps blocked every online tablet |
| **What prints (new, G5)** | Every live photo prints twice vs a print rule | **Kernel `printsInRelatorio`** before any capture-assist story; defaults decided with Bruno | Photo-first otherwise yields 25 MB-1 GB documents |
| **`persist()` and iPad (new, G1)** | FR-54 "no persist(), no install" vs eviction risk | **Call `persist()` on coarse-pointer devices** (source-deltas row); Add to Home Screen on iPad is a decision tested in 14.1 step 5b; until then lean on Android plus desktop as the guaranteed line | Pressure eviction on Android is otherwise unwarned |
| **t3a.large vs AI headroom (new, G3)** | Upsize for memory vs stay | **Stay on medium**: shrink the display detector input, set a hard ocr memory limit, measure; large still fits if AI headroom ~USD 23 is acceptable; not together with dropping the night stop | Memory, not cost, binds; the edge exists at concurrency 1 |

### 6.5 The AI map

Sizing follows the delivered job (659 display cells) with FR-42 as the ceiling. Prices come from `bedrock.ts:69-78` and Textract list price.

| AI use | Status | Engine | Trust model | Offline | USD per large job | Story |
|---|---|---|---|---|---|---|
| Plate reading | Exists (production on per untracked tfvars) | Textract, then Haiku 4.5; escalation Nova Pro, model to settle on the corpus | Cited token ids; digit coverage → suggested or Verificar; v2 adds token confidence, range, label anchor, per-field merge, reason line | Shot queued, fields typeable, new "empty" state | 0.66-1.08 + ~0.14 Textract | 14.4, 14.7, 14.22 |
| Plate from any photo | Proposed | Same | Explicit tap; one paid reread per tap over a done caption; cap per photo | Queued | +0.01-0.05 | 14.17 |
| "Looks like a plate" flag | Proposed | Returned by the caption vision call already running | Info suggestion only | Queued | ~0 | 14.17 |
| Display "Ler visor" | Exists | ocr-svc PP-OCR + kernel rule (FR-36), no LLM | Token confidence ≥ 0.5; typed value wins; mismatch line | Typed now, checked later | Compute only: 659-1,100 shots × 7.5-15 s (unmeasured) | 14.8 (sidecar memory and guard), 14.23 |
| Display second reader | Later, gated | Qwen3 VL on Verificar or unplaced shots | Suggested only when OCR and LLM digits agree; grounded candidates | Queued | +1.1-2.2 | L3 |
| On-device display draft | Spike | PP-OCRv5 mobile on onnxruntime-web | Local, never synced; server reading checks via FR-36 | Full | 0 (needs AD-14 amendment) | L8 |
| Panel to block | Exists | Textract + Qwen3 VL 235B | Chips + "Confirmar"; block created only on tap | Chips usable | 0.06-0.34 (30-94 panels) | L10 |
| Vision caption | Exists | Haiku 4.5 vision; later enum parts + "vista" | "Usar"; bulk confirm scoped to the visible filter with undo; never "Pessoas na foto" | Queued | ~0.25 | QW10, L5 |
| NC observation draft | Exists | Haiku 4.5 prose | "Usar"; skipped once typed | Queued | ~0.05 | 14.18 |
| Emission audit → audit-2 | Exists, then proposed | Bedrock Converse (Haiku) | Points, never writes, never blocks; coverage and staleness; feedback on the run row | Online only; deterministic rows cover structure offline | 0.05-0.12 per run | 14.20 |
| Dictation (13.9) | Built, off | Browser Web Speech (vendor); `processLocally` probe | One Suggestion per cell; multi-cell grammar | Online (on-device if available) | 0 AWS | 14.27 |
| "Sugerir ação recomendada" | Later | Haiku text job on a text-source Suggestion | Explicit tap; never confirm-all | Hidden offline; seed chips offline | <0.05 | L4 |
| Offline voice note | Later, spike | Transcribe pt-BR + Haiku | Observation Suggestions only | Recorded offline | ~0.3 (assumed) | L7 |
| Certificate reading | Later | Textract + structuring | Suggestions on the instrument form | Online | ~0.01 per certificate | L15 |
| Shot quality, walk hints, cabine SE, subtype NA, instrument fallback, text confirm on Concluir, NC seed, plate caption, coherence rows, outliers, share message, service period, print rule, lost-photo state | Proposed, deterministic | Kernel rules | Hint or one-tap confirm | Full | 0 | 14.3-14.19, 14.29, 14.31, QWs |

**Totals.**
- About USD 1.2-1.6 per large job today (up to ~2.4 at conservative per-call caps).
- About 1.3-2.0 after Epic 14, adding rereads and the per-cabine audit split.
- About 2.8-4.3 with every later option.
- AI headroom is ~USD 45 on t3a.medium: roughly 20-35 large jobs a month through Epic 14 and 10-16 with every option. The display second reader is the only line that materially moves the total.

### 6.6 Where AI must not be used

1. **Conclusion text, parecer summary, context captions.** These stay kernel-composed (NFR-12). An LLM may only point at contradictions in edited text (`text_vs_values`). No LLM parecer draft (AIB-11).
2. **Verdicts.** The conclusion pair, the parecer verdict (never Não apto as a suggestion), and checklist C/NC/NA from a photo. Vision never proposes NC rows (`SPEC.md:167`).
3. **Point priority and deadline.** These are the engineer's NR-10 judgment plus `points/priority.ts`. Audit-2 may only ask a question.
4. **Arithmetic.** Outliers, medians, cabine SE sums and trends are kernel rules (AIB-V1, JRN-3, AIB-13).
5. **Writing without a tap.** No auto-confirm and no confirm-all for AI prose. The caption confirm-all is scoped to the screen and gets an undo.
6. **Uncited values.** No logo-only manufacturer without a cited token (AD-14), and the model never emits coordinates.
7. **Photos marked "Pessoas na foto"** never go to vision (`source-deltas.md:31`).
8. **No on-device LLM** (AIR-6), and no AI-written client message: the share text is deterministic (MKT-12).
9. **Dictation parsing** starts with a deterministic multi-reading grammar (AIB-14). No LLM intent parser.
10. **No automatic audit run** on dialog open until coverage is honest and the run is costed (JRN-7).
11. **Rejected, not AI, kept rejected:** QR lookup, photo markup, gallery lock (MKT-13, `epics.md:506`).
12. **(new) What prints and what is lost.** Inclusion in the document and the "lost photo" state are kernel rules over data (G5-2, G1-5), never a model judgment.

## 7. Roadmap

Every story needs acceptance criteria, a Definition of Ready, a Definition of Done and a `**Dev model:** … · **Effort:** …` line in `epics.md` (AGENTS.md).

Process first: close Epic 13 with a dated 13.9 decision (E13-A9), then open Epic 14 through `bmad-correct-course` (PLN-V1).

Source-deltas rows to write before the stories that need them:

| Row | Before |
|---|---|
| Story 5.8 "not printable" | 14.3 |
| D-4 | 14.6 |
| Story 13.2 torch reset | 14.14 |
| "Revisar em sequência" first slice | 14.15 |
| `EXPERIENCE.md:123` plate caption | 14.16 |
| AD-22 (only if the gate moves) | 14.21 |
| AD-14 (only after 14.1) | 14.22 |
| AD-13/AR-12 outdated state (new) | 14.28 |
| FR-54 `persist()` (new) | 14.29 |
| Print variant role (AD-7) and printing of reading photos (new) | 14.31 |
| NFR-7 numbers (new) | 14.32 |
| `location/se` and `location/env` merge rule (new) | 14.33 |
| 2026-10-05 Textract switch and OOM (new) | 14.8 |

### 7.1 Wave 0: evidence gate, gate integrity and enablers (runs alongside wave 1; no device-dependent story closes before 14.1)

| Story | Findings | P / size | Key acceptance criteria | Depends on | Device line |
|---|---|---|---|---|---|
| **E13 closure** | E13-A1, E13-A2, E13-A4, E13-A9, PLN-V1 | P0 / S-M | Wave gate on main; the three recurring unit failures fixed so "no behavior change" means green; ledger hygiene; dated 13.9 decision | — | — |
| **14.1 Field validation session: devices, photo corpus, production AI flag** | PLN-1, MKT-9, PLN-2, AIR-12, AIR-4/CAPT-V3 (measure), PLN-14, PLN-10, G1-4, G3-5, G4-8, G4-10, G7 scenarios, G2 426 path | P0 / M | One PR writes every owed step into `offline-proof-script.md`, ordered by risk: capture size per path; torch/zoom/focus in a real cubicle with `getCapabilities()` on the iPad; plate offline then online (dark frame); "Ler visor" on the four displays; pinch; decimal pad; 30-shot burst; lock mid-burst; pull-to-refresh; DOCX share on iPadOS; two-tablet scenarios (two cubicles filling SE/env, same panel photo on both, reload after a merge, a contradiction resolved on both); 426 with backlog > 0 and = 0 and with the camera open; steps 5a/5b/5c and OS free space; NC expansion shift; seconds per display read and peak ocr memory on the instance. Run on one Android tablet and one iPad and file `ipad-YYYY-MM-DD.md`. Record the platform line and storage threshold as source-deltas rows. Corpus: ~20 plates + ~20 shots per display instrument in `docs/media` (gitignored), `*.expected.json` generated from `porto-seguro/data.ts`. `bedrock-eval` extended (precision, per-field, verify calibration, cascade, display kind, conditions tags) reports "suggested but wrong", Verificar share, escalation share, latency per stage, print vs original. Dated line on the production AI state | Matheus's and Bruno's time | This story is the device verification |
| **14.2 Decision sheet and Bruno session** | PLN-3, PLN-16, PLN-6, PLN-5, PLN-4 (wording), AIB-7 (wording), G8-1, G8-4, G3-4, G7-1, G5-6 | P0 / S-M | One table lists each question with the conservative choice built, where it shows and the default if unanswered; unanswered rows are accepted as built with a dated line. Bruno reviews printed and field strings, answers G8-1's seven questions (filed per tool in `docs/concorrentes/`), night-work frequency, two-person frequency and split, client sign-off on site. **SM-4 is recorded on a document with real photos, after 14.31 and 14.32** (closes E4-A6). 13.9 consent wording decided | none (SM-4 part after 14.31, 14.32) | part (2) with 14.1 |
| **14.28 Contract skew without stopping the field (new)** | G2-1, G2-2, G2-3, G2-6 | P0 / M | Outdated state is a persistent banner after re-auth; capture, push and upload continue. Unknown op families are parked raw and replayed after the upgrade (Dexie version, "outbox survives upgrade" test). MIN raises only for reducer or shape changes, documented in `version.ts`. "Atualizar" shows the backlog, is enabled at 0, calls `registration.update()` on 426, auto-reloads at 0 from a safe surface. Spine sentence amended. 1.5-E2E-003 raised to @p1 | AD-13/AR-12 row | 426 on a weak-signal tablet (14.1) |
| **Release train (process)** | G2-5 | P0 / XS | Until 14.28 ships: MIN-raising stories name the train, one deploy per wave in an 18:00-23:00 window, field asked to sync first; PUBLISHING.md skew checklist; field note for the MIN 15 deploy | — | — |
| **14.31 A relatório that can be sent (new)** | G5-1, G5-2, G5-4, G5-5 | P0 / M | Photos resampled once per job to ~250 dpi (long edge 850-1000 px, q80) with a PDF backstop; kernel `printsInRelatorio` (display shots out by default; plate shots per Bruno); "Incluir no relatório" toggle as an op; numbering counts printed photos; goldens regenerated; configurable convert timeout with a kernel `libreoffice_timeout` sentence; Export rows show size; PDF-only prefetch under a threshold; note above 25 MB. Size assertion in `job.integration.test.ts` | Bruno on the defaults; AD-7 row | none |
| **14.32 Scale probe and NFR-7 numbers (new)** | G5-3 | P0 / S-M | Per-wave script outside `verify`, under the host lock, seeds the full fixture with photo bytes at parity, photo-first and FR-42 sizes; records pages, bytes, seconds per pass, `toc_passes`, peak memory into a dated note; NFR-7 numbers in source-deltas | 14.31 | production-host run |

### 7.2 Wave 1: P0 (offline-capable, mostly S; can start before 14.1 finishes)

| Story | Findings | P / size | Key acceptance criteria | Depends on | Device line |
|---|---|---|---|---|---|
| **14.3 "Concluir ficha" confirms the composed text; stale rows; one print rule** | JRN-V1, AIB-1, AIB-16 | P0 / S (M with AIB-16) | With `text_status` null and the pair set, the conclude batch writes `conclusion/text`, `text_status = confirmed`, `text_basis` (+ D-7 observation) after `conclusionBasisMatches`; edited text untouched. J1/J3 assert `confirmed` with no added tap. `conclusion_stale` and `parecer_stale` rows name TAGs. One `generatedTextPrintable` for sections 9, 10 and pre-issue; goldens unchanged for fresh texts | 5.8 row | durability matrix (commit path) |
| **14.4 Empty reading, plate retake, honest pending row** | CAPT-V1, CAPT-6, CAPT-V2, CAPT-16 | P0 / S | "Nada foi lido nesta foto" with "Fotografar de novo" and "Preencher manualmente" (plate and display cells); retake discards older pending rows; pending row through `PlatePhotoRow` with `useServerReachable`; one `useNowIso` (owned here or in wave 1, not both, G6-4) | — | dark frame offline then online |
| **14.5 Visible camera failures, wake lock, "Não salvo"** | FLD-V1, FLD-1, FLD-7 (persistent part) | P0 / S-M | Failed burst shot in `.cam-hint` until the next success, asserted with `toBeVisible()`; `useScreenWakeLock` on ficha, camera and reading wait with a 10 min idle cap and the "Manter a tela ligada" switch (default on, vocabulary in `packages/domain/src/prefs`); persistent "Não salvo" until the next commit | — | auto-lock during a ficha and a wait |
| **14.6 Setup instrument as fallback suggestion** | JRN-2 | P0 / S | Single fitting setup-ticked instrument (else the single ticked) shown "Sugerido", confirmed by Concluir; none when two are ticked and none fits; `TAP_BUDGET.J1 = 5` | D-4 row | none |
| **14.7 Plate values as printed: SI units, bare years** | AIR-1, AIR-V1 | P0 / S | "13.800 V" on kV → 13,8 kV, digit coverage on the printed raw; "1,5 MVA" → 1500 kVA; "2012" suggested as is; prompt never invents a month; structuring date schema and contract version bumped (**rides the release train or follows 14.28**); "380/220" after Bruno | 14.28 or train | corpus (14.1) |
| **14.8 AI provider base, production AI documented, sidecar memory and guard** | AIR-17/API-1, AIR-V2/G3-3, G3-1, G3-2, G4-9, PLN-14 | P0 / S-M | `apps/api/src/ai/` (`classifyAwsError`, `callWithTimeout`) used by Bedrock, Textract and the audit (= code unit C4/3.6, G6-2); credential errors transient on both; 11-7 matrix row amended. Terraform refuses the sidecar off while displays use it; hard `memory` on the ocr container; smaller detection limit for displays if accuracy holds; README, variables and budget texts corrected; dated row on the 2026-10-05 switch; three model ids validated | — | display peak on the instance (14.1) |
| **14.9 Journey budgets and ergonomics coverage** | JRN-9, JRN-10 | P0 / M | `e2e/support/journey.ts` replaces 4 `pickInstruments` copies and the private counters, keeping the cross-check; @p1 budgets for J-b, J-d, J-f; J5 asserted at 11 counting the combobox fill; ERGO-E2E-001 adds camera, Export, point editor and composer at 390/768 | — | none |
| **14.10 One camera opener, shot pipeline, track recovery, denied fallback (= E13-A6, refactor 1.P)** | CAPT-12, CAPT-15, PLN-9, FLD-9, CAPT-4, PLN-10, WEB-20, WDT-13 | P0 / M-L | `CameraOpener`/`useCameraOpener` for six openers with opening state, denied note and "Usar a câmera do aparelho"; `ShotSession` reducer unit-tested; track re-acquired on visible, shutter disabled while muted; "Câmera do sistema" when torch is absent (if 14.1 shows it); shared `pointer-gesture.ts` with one `GESTURE_SLOP_PX` set from the device pass; `clampCameraZoom`; rAF pinch; capture code moved to `apps/web/src/capture/`; no camera file over 400 lines | characterization tests | lock/unlock mid-burst on iPadOS; denied permission |
| **14.29 Unsynced work visible and protected (new)** | G1-1, G1-2, G1-5, G1-3 (if decided), FLD-16 | P0-P1 / M | Warn on unsynced bytes and age ("n fotos só neste aparelho (x MB)"), not `quota - usage`; 5-day banner includes un-acked originals (3 days on iPad); kernel `lost` photo state as a pending Sumário row and on the recovery screen; `persist()` on coarse-pointer devices with `persisted()` shown in Conta (after the FR-54 row); stale comment fixed | FR-54 row for `persist()` | 14.1 steps 5a-5c, Android `persisted()` |

### 7.3 Wave 2: P1

| Story | Findings | P / size | Key acceptance criteria | Depends on | Device line |
|---|---|---|---|---|---|
| **14.11 `useSuggestionActions`, `kinds/shared.ts`, generate+audit job harness** | AIR-19/WEB-9, CAPT-14, AIR-18, AIB-17, API-2 (corrected), API-V1 | P1 / M | One hook with one double-tap guard and the say-when-drawn rule; `targetDefinition`, `targetLocation(kind?)`, `proseRun`; job helper for **generate and audit only** (reading stays outside, G6-3); `auditRunFailOps` always writes `finished_at`; audit invalid-payload test (closes `deferred-work.md:1399`) | — | none |
| **14.30 One numeric reading cell (new)** | G4-2, G4-3, G4-1, G4-4 | P1 / M | `useSuggestedNumber` for the three suggested/dictated variants; one `CellUnit`, one `CellHelpers` (red tone and spoken unit labels everywhere; Confirmar check scoped to its own button); `enterKeyHint` as a prop (removes the `MutationObserver`); unit control on suggested cells; unit change undoable | QW21, QW22 first | none |
| **14.12 Shot quality and capture feedback** | CAPT-1, MKT-2, CAPT-11, FLD-12 | P1 / M | Kernel `shotQuality(luma,w,h)` from the 256 px gray copy; reading shots only; bad single shot keeps the camera ~1.5 s with "Tirar de novo", never refuses; `.cam-link` thumbnail; 120 ms flash (reduced motion); `vibrate` where present; hint mode, calibrated on the corpus | 14.10, 14.1, DESIGN.md sign-off | calibration in a real cubicle |
| **14.13 Camera layout: landscape, honest finder, readable text** | FLD-8/CAPT-18, CAPT-10, FLD-13 | P1 / S-M | Shutter and "Concluir" in viewport at 844x390 (asserted); `contain` for single-shot finders with kernel `captureGuide(kind)`; `.cam-word`/`.cam-context` ≥ 14 px | 14.10 | phone landscape on a real plate |
| **14.14 Cabine plate walk, torch per cabine** | CAPT-2, JRN-8 | P1 / L | "Fotografar placas da cabine" walks `plateWalkStops` (blocks without a plate **from any device**, G7) with "TAG · tipo · coluna (n de N)"; "Pular"; "Equipamento não listado" takes the 9.2 target; torch in memory per cabine; index survives refusal and skip; J-0 budget ≤ 11 taps for 8 plates | 14.10, 14.4, 14.31, 13.2 row, 14.1 burst stability | full walk in a real cubicle on both tablets |
| **14.15 Review walk for later readings** | JRN-5, JRN-13 | P1 / M | Router state from "N sugestões por confirmar"; "Concluir e próxima com sugestões" by `nextSheetWithPendingSuggestions`, counting other devices' suggestions; banner "Ver"; three offline plates cleared at ~2 taps per sheet (asserted) | "Revisar em sequência" row | offline then signal |
| **14.33 Two tablets: merge rule, contradictions, duplicate panel (new)** | G7-2, G7-3/PLN-V3, G7-4, G7-5, G7-6, G7-7 | P1 / M | `location/se` and `location/env` through filled-over-empty and contradiction; merge entries persisted per relatório until seen; panel photo claimed on confirm (or own-only); "Remover a repetida"; pre-issue "N células em contradição" (blocking per E10-A6); thumbnail evidence in the Conflict view; alert only on the displaced device | Matheus on E10-A6 and PLN-V3 | 14.1 two-tablet scenarios |
| **14.16 What a confirmed plate feeds** | JRN-3, AIR-13, MKT-7, CAPT-8 | P1 / M | "Usar placas dos transformadores (…)" writes the three SE fields in one batch, silent on conflict, no transformer or 380/220; dry insulation or VOL. ÓLEO offers the subtype's `na_defaults` as a config op with undo; plate caption "Placa de identificação do ⟨equipamento⟩ ⟨TAG⟩ da ⟨coluna⟩" | 14.11, **14.33**, `EXPERIENCE.md:123` row, Bruno on installed power | none |
| **14.17 Any photo can be read as a plate; sort gallery shots** | CAPT-3, MKT-5, CAPT-7, JRN-14 | P1 / L | `retarget.ts` allows `plate` over a photo with no reading, and over a done `caption` on explicit tap (paid, capped); contract bump (**train or after 14.28**); viewer "Ler como placa"; tile "Escolher foto da placa"; sticky-bar first shot takes the plate target on the Placa step; gallery multi-select and post-burst assignment via `assignPhotoBatch`; section 7 numbering stable | 14.10, 14.28, 14.31, Matheus on the paid reread | HEIC import from the native camera on iPad |
| **14.18 NC point seed, action chips, photo after the NC mark** | JRN-6, AIB-7, AIB-8, AIB-12 | P1 / M | `ncRowPointSeed` (no TAG); seed v4 splits chips into text and action, per-NC-phrase action chips (48 px, wrapping), retires the rain chip from section 8; a sheet photo from the last minutes becomes the row's photo in one tap, queuing `nc_obs` | Bruno's wording | none |
| **14.19 Deterministic coherence rows** | AIB-2, AIB-V1, AIB-V2 | P1 / S | Info rows `restriction_vs_nc`, `restriction_vs_reading`, `parecer_vs_suggestion`, `reading_outlier` (+ cross-sheet median at Bruno's factor), captions naming absent equipment; TAGs named, link to sheet; offline; F-03 empties count unchanged | — | none |
| **14.20 Audit-2** | AIB-3, AIB-4, AIB-5, MKT-10, AIB-11 | P1 / M | Short positional refs mapped back; clean sheets as one line; section 7 after 9 with non-kernel captions only; per-cabine calls if needed; `coverage` stored and shown ("Conferidas N de M fichas"); semantic kinds replace structural ones; `AUDIT_PROMPT_VERSION` bumped; "Conferido antes das últimas alterações"; "Procede / Não procede" on the run row; measured once with Bedrock | 14.19; train if the run row changes the contract | none |
| **14.21 Inline parecer, Sumário "Continuar", resume without the ART gate** | JRN-7, JRN-12, JRN-V2 | P1 / S | Inline verdict and text in the Export blocking row; "Continuar: TAG · n de N" in the Sumário while Em campo; Rascunho with a last-opened sheet current on Home; J-f budget −2 | Matheus choice | none |
| **14.22 Plate trust v2, prompt v2, corroborating readers (gated)** | AIR-2, AIR-3, AIR-7, AIR-V3, AIR-8, AIR-9, AIR-4 | P1 / L (split if needed) | `assessTrust`; `mergeReadings`; `bestPendingForField`; Verificar hint `{reason, read_as}` via `verifyReasonText`; prompt context, known manufacturers, server-side line grouping, pt-BR numerals, unprintable fields dropped; reading-only fuzzy manufacturer; original variant if 14.1 shows a gain (AD-14 row); "suggested but wrong" does not rise | 14.1, 14.7, 14.11, 14.28 or train | corpus-gated |
| **14.23 Reading queue priority** | AIR-10 | P1 / S | Plate and display before captions; I/O kinds at concurrency 2 on a separate worker; display serialized; pg-boss v12 option names verified first | **14.8 (display detector and memory limit, G3-2)** | none |
| **14.24 Field-readable states** | FLD-5, FLD-6, FLD-7 (expiry), FLD-4 | P1 / M | One-tap light/dark in the overflow; `theme-color` metas; Verificar crop strip 72-96 px; toast expiry paused while hidden, scaled, cap 15 s; `prefers-contrast: more` overrides in `app.css` | DESIGN.md amendment (crop strip) | yard to cubicle in the 14.1 re-run |
| **14.25 Bulk-action performance budget at 94 blocks** | PLN-8 | P1 / M | Serial-group case timing "Marcar os restantes", "Repetir", "Igual à", instrument tick against 1 s; reopen row 1235 on a miss | — | mid-range Android timing |
| **14.26 Feeder-cable pairing at instantiation** | PLN-11 | P1 / M | `instantiate.ts` writes `feeds_block_id` from template position; `unpaired_cable` as an info row for blocks added later; goldens checked | Matheus decision | none |
| **14.34 Shell: fast start on weak signal, lighter updates (new)** | G4-6, G2-4 | P1 / S | Navigation fetch raced against ~3 s with shell-cache fallback (never-resolving fetch test); install copies unchanged hashed assets from the old cache; `heic-to` precache decision | — | relaunch on weak signal (14.1) |
| **14.27 Dictation behind consent (13.9 carried over)** | PLN-5, G4-7, AIB-14 | P1 / M, conditional | Decided consent line naming the engine; Account "Ditado" toggle; multi-cell utterances or continuous fill as suggestions closed by "Confirmar todos"; `processLocally` probe preferred; dynamic `import()` of engines; `VITE_SPEECH_ENGINE` default and `scripts/speech-default.test.ts` updated; source-deltas row names the privacy rule for audio | 14.2, 14.30 | dictation on both tablets |

### 7.4 Later (Epic 15 and after, P2)

| # | Story | Findings | Gate or decision | Size |
|---|---|---|---|---|
| L1 | Second-visit carry: cabine SE, local, instruments still in calibration; "Copiar N placas da última visita" as plain values in one batch with undo; serial rebind "Vincular" | JRN-1, MKT-8, MKT-V1 | FR-34/AD-25 row | M |
| L2 | Per-reading "Ler visor" with per-cell ratio stops and a sticky-bar mirror | JRN-4 | E9-A6 ≥ 8/15 on tablet photos | M |
| L3 | Display second reader with grounded candidates | AIR-5, MKT-3, MKT-6 | E9-A6 + FR-36 row; AI-off stays OCR-only | M |
| L4 | Text-source Suggestion union, then "Sugerir ação recomendada" on tap | AIB-V3, AIB-9 | AD amendment, contract bump; after 14.18 shows gaps | M + M |
| L5 | Captions from enum parts + "vista"; caption vocabulary; photo location field | AIB-6, AIR-16 | Contract bump | M |
| L6 | AI spend held, not failed; reread cap; billed failures recorded; in-app month-to-date check | MKT-V2, MKT-11, AIR-11 | none | S |
| L7 | Offline voice note (Transcribe + structuring); deterministic multi-reading parser | MKT-4, AIB-14 | Spike on 20 notes; new file kind | L |
| L8 | On-device display draft spike; on-device plate OCR spike | AIR-6, MKT-14 | AD-14 amendment; must beat typing | L |
| L9 | Data-driven recommendation per NC item; section 8 cross-reference outside the basis | AIB-10, PLN-4 | Bruno's phrases; seed version | M |
| L10 | Panel flow: "now the plate" shot after 9.2; two-device claim rule; OCR reuse | CAPT-5, PLN-V3, AIR-14 | FR-38 row | M |
| L11 | Phone keyboard: `interactive-widget`, `visualViewport` offset | JRN-11, PLN-V2 | 14.1 evidence | S |
| L12 | Cabine environment readings in pre-issue, with provenance | PLN-12 | Contract bump | M |
| L13 | Burst stills through `takePhoto`; shared `capture-input.ts` | CAPT-9, CAPT-13 | 14.1 capture-size measurement | S |
| L14 | Trends and identity across visits | AIB-13, CAPT-17 | Post-MVP scope change (`prd.md:487`, AD-25, `SPEC.md:166`) | L |
| L15 | Certificate reading on the registry panel | AIR-15 | Office value only | M |
| L16 (new) | Newest issued PDF kept offline per pulled relatório | G8-2 | Storage budget; E11-Q1 holds | M |
| L17 (new) | Per-cabine "Executor" claim and "minhas / sem executor" filter | G7-1 | Bruno: how often two people work one job | M |

### 7.5 Where the code-structure findings land

| Seam | Today | Pulled by |
|---|---|---|
| `CameraOpener`/`useCameraOpener`; `ShotSession`; camera-view split; shared gesture core | 6 openers; opening state on 2; 5 denied blocks; two gesture engines | 14.10 (= E13-A6 = refactor 1.P) |
| `useSuggestionActions` | 3 hooks, 2 guards, say-when-drawn in one | 14.11 |
| `kinds/shared.ts`; generate+audit job harness (reading excluded) | guards copied 2-3×; audit/generate worker copy pair | 14.11 (= C3) |
| `apps/api/src/ai/` (error classifier, timeout, converse) | 3 timeout and classify copies; audit imports `reading/providers` | 14.8 (= C4 / 3.6) |
| `text/generated-text.ts`, one `ncItems` | two state machines, drifting print policies | 14.3 |
| `e2e/support/journey.ts` | 4 `pickInstruments`, 3 tap counters | 14.9 |
| `PlatePhotoRow` pending variant; one `useNowIso` | hand-copied row (drifted F-13); two clocks | 14.4 (= D6, single owner) |
| One numeric cell (`useSuggestedNumber`, `CellUnit`) | 5 copies drifted | 14.30 (new) |
| `capture-input.ts` | EXIF literal twice | L13 |
| Web server-job barrier | three drain/ask/poll copies | refactor 3.1 (with QW25 first) |

### 7.6 Quick wins (each under a day; can ship ahead of its story)

| # | Change | Findings | Anchor |
|---|---|---|---|
| 1 | Camera save failure in `.cam-hint`, not a toast under the scrim; assert `toBeVisible()` | FLD-V1 | `camera-view.tsx:302`; `read-display.spec.ts:151` |
| 2 | Textract credential errors transient; strike and amend the 11-7 row | AIR-17, API-1 | `textract.ts:57-59`; `textract.test.ts:193-203` |
| 3 | Terraform refuses the sidecar off while displays use it; hard ocr memory limit; fix the README remedy | AIR-V2, G3-2, G3-3 | `variables.tf:97-105`; `ecs.tf`; `infra/README.md:81` |
| 4 | Pending plate row uses `useServerReachable` | CAPT-V2 | `photo-openers.tsx:71` |
| 5 | `overscroll-behavior-y: contain` (authored) | FLD-11 | `app.css` |
| 6 | Show the stepper check on complete steps | FLD-3 | `components.css:260` overridden in `app.css` |
| 7 | 3 px inset focus ring on `.input:focus-within` and the measurement field | FLD-2 | `components.css:76, 488`; precedent `app.css:692` |
| 8 | Offline badge keeps the pending count; pt-BR short word for "Off" | FLD-10 | `sync/counts.ts:151-157, 260-272` |
| 9 | `engine.nudge()` on visible | FLD-14 | `engine.ts:143-148` |
| 10 | Caption "Confirmar todas" scoped to the visible filter, with "Desfazer" (after a yes on row 1139) | AIB-15, PLN-7 | `gallery-surface.tsx:136-167` |
| 11 | Typed year over a suggested date via `parsePlateDateText` | PLN-13 | `nameplate-suggestions.tsx:239`; `suggestion-group.ts:155-158` |
| 12 | "Ver" on the "Sugestões prontas" banner | JRN-13 | `ficha-surface.tsx:140-143` |
| 13 | Deterministic share text alongside the file | MKT-12 | `revision-file.ts:84-92` |
| 14 | Validate the three model ids in Terraform; dated production-flag line | PLN-14, G3-1 | `variables.tf:57-60` |
| 15 | Ledger hygiene: close rows 953, 1318, 1223; state and owner on rows 1361-1364; re-own Epic 5 rows | PLN-15, PLN-V2 | `deferred-work.md` |
| 16 | Strike review §1's "unoccupied" line, add the corrected sentence and the competitor URLs (field-elo.html, Produttivo blog) | MKT-1, G8-5 | `review-field-ux-2026-10-06.md:9, 45` |
| 17 | `theme-color` metas | FLD-5 | `apps/web/index.html` |
| 18 | Assert J5 at 11 taps, counting the combobox fill | JRN-9 | `journey-forward.spec.ts:241, 321` |
| 19 | Torch per cabine in memory (after the 13.2 yes) | JRN-8 | `camera-view.tsx:780-783` |
| 20 | One `useNowIso(everyMs, active)` | CAPT-16, WEB-19 | `panel-capture.tsx:140-149`; `reading-line.tsx:45-52` |
| 21 | Unit change on an unfocused filled cell goes through `edit` + undo toast | G4-1 | `measurement-field.tsx:128-135` |
| 22 | "Não medido" and NC "Usar" through `api.edit` | G4-4 | `measurement-field.tsx:193`; `checklist-section.tsx:296` |
| 23 | Toast the Sumário rename refusal | WEB-3 | `sumario-surface.tsx:233-251` |
| 24 | Catch registry remove, archive and undo with `writeErrorText` | WEB-V1 | `client-panel.tsx:80-106`; `word-registry-panel.tsx:108-133`; `instrument-panel.tsx:369, 395` |
| 25 | Preview and audit disabled on dead ops; audit drain checks re-auth; drain/ask abort on unmount | XC-V2, WEB-6, WDT-V1 | `use-preview.ts:79-104`; `use-audit.ts:56-84` |
| 26 | Caddy `encode zstd gzip` | G2-4 | `infra/caddy/Caddyfile:30` |
| 27 | Fix stale texts (`storage-estimate.ts:35-37`, `variables.tf:109`, `budget.tf:1-3`); delete stale `.plan` files | G1-1, G4-9 | as cited |
| 28 | PUBLISHING.md skew checklist and release-train rule | G2-5 | `infra/PUBLISHING.md:83` |
| 29 | `forbidOnly: true`, `allowOnly: false`, zero-match spec check | TST-V1 | `playwright.config.ts`; `scripts/e2e.ts:79` |
| 30 | Service period suggestion chip from capture times | G8-3 | `setup-fields.ts:75`; `pre-issue.ts:91-92` |
| 31 | Kernel plural for the Export precheck sentence and `banner.moreLabel` | XC-4 | `pre-issue.ts:486`; `pt-br.ts:154, 491` |
| 32 | Strike `EXPERIENCE.md:30` | G7-7 | `EXPERIENCE.md:30` |
| 33 | 5-day banner also counts un-acked originals | G1-2 | `db/commit.ts:357-359` |

### 7.7 Merged sequence with the refactor plan, and calendar (G6)

The two plans share four units under different names (confirmed in code):

| UX roadmap item | Refactor unit | Code evidence | Merged unit and owner |
|---|---|---|---|
| 14.8 AWS call layer | C4 / 3.6 | `classifyBedrockError` (`bedrock.ts:267-277`) vs `classifyTextractError` (`textract.ts:126-138`); timeout twice; the audit imports `reading/providers` (`audit/provider.ts:6-7`) | One unit in `apps/api/src/ai/`, size S, before 14.8's other parts |
| 14.10 | 1.P (E13-A6) | `camera-view.tsx` 899 lines; `use-pinch-zoom.ts` | One unit before any capture story, size M |
| 14.11 worker helper | C3 (API-2 corrected) | generate/audit identical (`generate/worker.ts:39-108`, `audit/worker.ts:25-81`); reading is a stately queue with a dead letter (`reading/worker.ts:85-119, 182-185`) | Generate and audit only, size S |
| 14.4 clock | D6 | `reading-line.tsx:45-52`, `panel-capture.tsx:139-149` | One owner, size XS |

Hub files (touches in the last 30 merges):
- `pt-br.ts` 9
- `packages/domain/src/index.ts` 6
- `camera-view.tsx` 5
- `plate-photo.tsx` 4
- `state/sync.tsx`, `ficha-surface.tsx` and `export-dialog.tsx` 3 each

`CONTRACT_VERSION` (now 15) serializes stories: at most one bumping batch per wave (G6-7), and every MIN raise rides the release train until 14.28.

The copy split (refactor 1.1) only works on a quiet main, because every open branch that appends to `pt-br.ts` conflicts with the move. Run it as wave 0 or as the first merge of a wave with no story branch open, or drop it. It is not deduplication: its clone-hub rank is a tokenizer artifact (G6).

Measured inputs:

| Input | Measured | Source |
|---|---|---|
| Story gate, uncontended | ~20 min (lint 20 s, static 44 s, api 322 s in parallel; unit 274 s; touched e2e 636 s) | PR #110 body |
| Story gate, another run | 17.5 min wall | PR #107 body |
| Same e2e stage under 3-stack load | 7,613 s (~2 h 7 min) | PR #105 body |
| Full @p0 | 842 s light; 1,655 s loaded | PRs #104, #107 |
| `test:e2e:full` | 1,912-2,078 s | `reviews/epic-13-review-qa.md:30, 165` |
| Matrix | 183-359 s | same, `:31, 166` |
| Wave gate total | ~50-70 min with the lock held and the main stack stopped | sum |
| Epic 13 throughput | 8 stories, 5 batches, 3 stacks; merged 3.7-14 h after start; review and fixes another 13 h | git log #102-#110 |

**Formula.** Per wave: `ceil(batches / 2) × T_batch (5-7 h) + T_wavegate (~1 h) + T_review+fix (6-13 h)`. That is about 1 to 1.5 days for 4 batches.

**Total.**
1. 27 + 7 new stories plus ~40 refactor units, minus 4 duplicates, is about 63-70 units.
2. At about 2 units per batch, that is about 32-35 batches.
3. At 4 batches per wave, that is about 8 waves plus wave 0.
4. Agents running around the clock need about 9-13 days.
5. With Matheus's and Bruno's decisions and the device passes, realistically 3-4 weeks.
6. Each red wave gate adds a fix batch (about half a day).

Record lock wait, gate wall time and reruns on the first wave (E13-A10), then re-plan.

Order:
- **Wave 0** (quiet main): E13 closure blockers, gate integrity (TST-V1, TST-2), code wave 0 drift fixes, 1.1 if kept, 14.1/14.2 started, 14.28, 14.31.
- **Wave 1**:
  - Web stack: 14.10 (= 1.P) with D6.
  - API stack: `ai/` layer (C4) and the generate+audit harness (C3).
  - Field P0: 14.3-14.9, 14.29.
- **Waves 2+**: Epic 14 P1 on the new seams. Refactor units go on files no UX story touches (registries panels, setup etapas, `sync.tsx`, `use-ficha-data.ts`), with one owner per hub file per wave.

## 8. Code structure

### 8.1 Health in numbers

| Area | Source files | Source lines | Test files | Test lines | Test:source | Files > 400 lines |
|---|---|---|---|---|---|---|
| apps/web/src | 231 | 42,783 | 145 | 28,737 | 0.67 | 20 |
| packages/domain/src | 163 | 24,744 | 122 | 20,805 | 0.84 | 12 |
| apps/api/src | 89 | 11,010 | 78 | 17,848 | 1.62 | 3 |
| e2e | 19 support | 2,417 | 68 specs | 23,371 | n/a | 1 (`support/durability.ts`, 428) |
| scripts | 6 | 664 | 8 | 877 | 1.32 | 0 |
| services/ocr (Python) | app/ | 714 | tests/ | 1,138 | 1.59 | 0 |
| **Product (web + domain + api)** | **483** | **78,537** | **345** | **67,390** | **0.86** (1.19 with e2e) | **35** |

Suites: test:unit about 2,936 tests; test:api 517; e2e 400 tagged titles (223 @p0, 165 @p1, 12 @p2). Areas the scan did not cover (G4): `apps/web/public/sw.js` (460 lines, 806-line lifecycle test), `apps/web/src/speech` (~383 source lines), `infra/production` (~1,369 lines), `apps/api/src/scripts/bedrock-eval.ts`.

| cx bucket (non-test functions) | Functions | Share |
|---|---|---|
| 1-5 | 3,390 | 79.1% |
| 6-10 | 558 | 13.0% |
| 11-20 | 237 | 5.5% |
| 21-40 | 69 | 1.6% |
| > 40 | 32 | 0.75% |

| Area | Count above cx 40 | Functions |
|---|---|---|
| apps/web | 26 | 22 surface components or hooks, plus `createSyncEngine`, `useRichTextArea`, `usePinchZoom`, `QuantityStepper` (template composer only) |
| packages/domain | 3 | `preIssue`, `evaluateTable` and its nested callback |
| apps/api | 3 | `runReadingJob`, `createFileRoutes`, `createGenerateRoutes` |

God files (high complexity plus unrelated responsibilities):

| File | Lines | Why | Findings |
|---|---|---|---|
| `apps/web/src/sync/engine.ts` | 807 | `createSyncEngine` cx 147, ~10 mutable flags; transport, maintenance, merge bookkeeping, scheduling, status | WDT-4 (R10-12, no owner) |
| `apps/web/src/surfaces/ficha/camera-view.tsx` | 900 | 69 functions: stream, capabilities, single-shot race, torch, zoom, focus gestures | WEB-20, WDT-13 (E13-A6) |
| `apps/web/src/surfaces/points/point-editor.tsx` | 800 | `PointEditor` cx 97, 18 refs, no unit test | WEB-10 |
| `apps/web/src/surfaces/relatorio/relatorio-tree.tsx` | 787 | tree model, panel resume, two reveal pairs, dialogs | WEB-19, WEB-17 |
| `apps/web/src/surfaces/ficha/read-display.tsx` | 769 | two token-identical suggestion hooks; three numeric cell variants | WEB-9, G4-2 |
| `apps/web/src/surfaces/export/export-dialog.tsx` | 572 | `ExportDialog` cx 119, six concerns | WEB-5 |
| `apps/web/src/surfaces/export/use-generate.ts` | 479 | cx 104; 9 effects, 19 `setPhase` | WEB-7, WDT-1 |
| `apps/web/src/surfaces/relatorio/tree-actions.ts` | 599 | cx 90; out-param, toast, focus, undo skeleton per action | WEB-4 |
| `apps/web/src/surfaces/templates/template-composer.tsx` | 595 | cx 85; own edit queue; six dialog states | WEB-1, WEB-12 |
| `apps/web/src/surfaces/registries/instrument-panel.tsx` | 597 | lifecycle, four local fields, four hand-built envelopes | WEB-2, XC-6 |
| `apps/web/src/db/sync-store.ts` | 484 | six responsibilities | WDT-17 |
| `apps/api/src/sync/apply.ts` | 727 | validation, registry merge, insert, server batch, push; 16 commits | API-6 (R10-12, no owner) |
| `apps/api/src/db/seed.ts` | 595 | production provisioning beside test-company destruction | API-18 |
| `packages/domain/src/relatorio/pre-issue.ts` | 548 | `preIssue` cx 56, 27 push sites | DOM-5, DOM-6 |

Large files that are acceptable as they are:
- `copy/pt-br.ts` (1,611 lines) is data. It still needs a split to reduce merge conflicts (XC-1).
- `seed/v1.ts` is frozen data built with builders.
- `schemas/entities.ts` holds schemas.
- `ops/path.ts` is the family table plus a typed API.

| Scope (window) | Clone regions | What the hubs really are |
|---|---|---|
| Source (70 tokens) | 631 | `pt-br.ts` 26,424 cloned tokens, almost all false positives (`key: 'string'` shape). `state/sync.tsx` and `ficha/use-ficha-data.ts` are the null-database live-query guard. `seed/v1.ts` is data. `ops/path.ts` is a justified typed API. `client-panel.tsx` and `instrument-panel.tsx` are the registry lifecycle |
| Unit and api tests (90) | 1,075 | session doubles, `freshDb`, api sign-in/push/auth harness, op literals |
| e2e (90) | 233 | seed-and-open chain, `openSheet`, `toast`, outbox readers, tap counters |

**Metrics caveats (G4).**
- Function ranges are offset for three components: `MeasurementField` at 46, not 69; `ChecklistRow` at 239; `InstrumentPicker` at 35.
- The clone scan misses copies whose token shapes differ. The five numeric-cell copies are the example.

**Healthy.**
- No cross-layer imports. Dexie is written only in `apps/web/src/db`. Components import only `copy/ui.ts`.
- One runtime file cycle in the web (`state/sync.tsx` ↔ `sync-actions.ts`).
- The kernel is pure and typed from schemas.
- One api op envelope (`serverOp`, `sync/server-op.ts:28-46`).
- Tenant scoping by construction.
- An injectable engine with 51 deterministic tests.
- Reading kinds as a strategy pattern.
- No TODO/FIXME markers.

**Not healthy.**
1. Copy-forward growth without a ledger. The 2026-09-30 review's extractions were never routed (groups 8-12 and 15, W-15..17, W-28).
2. Complexity sits where unit coverage is thinnest.
3. Hub files grow by appending (`pt-br.ts` "Epic 13 batch C", `app.css` "Review fixes" sections).
4. Coupling below the layer rule: the kernel's 10-file SCC, surface 2-cycles, six store-boundary bypasses, the audit importing reading internals.
5. Polling multiplies work (WDT-2, WDT-V2, WDT-8, WDT-9).
6. Guards rely on discipline: no hooks lint, no purity or cycle lint, no `forbidOnly`, no Python checks.
7. `scripts/verify.ts:33` still encodes the old full-@p0 gate (TST-8).

### 8.2 Complexity hotspots (top 15)

| # | Function (file:line) | Lines | cx | Responsibilities | Proposed split | Ids |
|---|---|---|---|---|---|---|
| 1 | `createSyncEngine` (`sync/engine.ts:196-806`) | 611 | 147 | push, upload, pull with retry; thumbs, eviction, sweep, prune; merge bookkeeping; schedule, fast poll, online, nudge; status | `retry.ts` (`withRetry`, abortable sleep), `phases/{push,upload,pull,maintenance}.ts` with a `CycleContext`, `merge-tracker.ts`, `scheduler.ts`, `runPool`, a phase table; rename `onlineWhileRunning` to `rerunRequested` | WDT-4 |
| 2 | `ExportDialog` (`export/export-dialog.tsx:82-571`) | 490 | 119 | file presses and prefetch; pre-issue model; F-03 confirmation; reasons; render blocks | hooks `useRevisionFiles`, `useExportModel`, `useIssueQuestion`; components `PrecheckList`, `AuditBlock`, `DocControl`, `ResultBlock`/`ResultFileRow` (`showReason`), `RevisionList`, `ErrorLine`; kernel returns a reason kind | WEB-5 |
| 3 | `useGenerate` (`export/use-generate.ts:113-478`) | 366 | 104 | live reads; awaiting; flush; 409 retry; poll and expiry; hand-over | pure `generateReducer`; effects only dispatch; barrier steps shared (C1) | WEB-7, WDT-1 |
| 4 | `PointEditor` (`points/point-editor.tsx:120-648`) | 529 | 97 | autosave with create-on-first-write; priority/Prazo; dictation area; FR-61 draft; close/flush | characterization tests first; `usePointAutosave`, `usePointPriority`, `usePointDraft`, `usePointFinish`; three components | WEB-10 |
| 5 | `useTreeActions` (`relatorio/tree-actions.ts:126-523`) | 398 | 90 | openSheet; move block/location (clones); createPair; remove; renameTag; not tested; agrupar | `RelatorioEditor.plan<R>()`; `moveSibling`; planners in `equipment-edits.ts` | WEB-4, WEB-3 |
| 6 | `TemplateComposer` (`templates/template-composer.tsx:111-536`) | 426 | 85 | own edit queue; name field; skeleton edits; palette; six dialogs | `useFreshEditor<TemplateRow>`; `CommittedTextField`; dialogs reducer; `LiveRouteGate` | WEB-1, WEB-12 |
| 7 | `NameplateSection` (`ficha/nameplate-section.tsx:79-266`) | 188 | 75 | suggestions; plate photo and crop; copy chips; focus box; fill-manually; word create | `useNameplateCopy`; kernel `firstEmptyNameplateField`, `nameplateFocusBox`; `useSuggestionActions` | WEB-9, WEB-17 |
| 8 | `useFichaActions` (`ficha/use-ficha-actions.ts:101-273`) | 173 | 63 | conclude; primary label; menu; clear; not tested; rename; move | kernel `sheetActions`; shared planners | WEB-3, WEB-17 |
| 9 | `ConclusaoSection` (`ficha/conclusao-section.tsx:163-386`) | 224 | 60 | result/restriction pairs; observation suggestion; missing rules | `useRovingRadio`; kernel `conclusionMissing` | WEB-8, WEB-17 |
| 10 | `useRichTextArea` / `useSectionTextArea` (`input/use-rich-text-area.ts:89-321`) | 233 / 147 | 58 / 39 | ~80 shared lines; plain variant blocks undo with no replacement | `useEditableArea` + `useTextHistory`; editor models to `input/editor/` | WDT-12 |
| 11 | `RelatorioTree` (`relatorio/relatorio-tree.tsx:180-511`) | 332 | 56 | tree model; `?panel=` resume (hand-parsed `reading_target`); two reveal pairs; dialogs | `useRevealRow`; kernel `panelResumeTarget`; `usePanelResumeParam` | WEB-19, WEB-17, WDT-3 |
| 12 | `preIssue` (`domain/relatorio/pre-issue.ts:246-440`) | 195 | 56 | ~27 pushes; ~11 count rules; two setup-gap passes; section-10 recompute | `countRow()`; per-row functions in reading order; exhaustive `PRE_ISSUE_KIND_META`; no generic `PreIssueRule<any>` | DOM-5, DOM-6 |
| 13 | `useCamera` / `useCameraControls` (`ficha/camera-view.tsx:95-401, 757-899`) | 307 / 143 | 55 / 41 | stream, capabilities, single-shot, torch, zoom and focus gestures | `capture/{stream-session, capabilities, single-shot, use-camera-controls}.ts` on `input/pointer-gesture.ts`; one `GESTURE_SLOP_PX` | WEB-20, WDT-13, E13-A6 |
| 14 | `evaluateTable` (`domain/relatorio/reading-evaluation.ts:96-214`) | 119 | 53 | visible columns; cell state; ratio; verdicts; unit carry | `visibleColumns`, `evaluateCell`, `ratioCalculated`, `judgeCaptures`, `carryUnits`; `isRatioTest(test)` | DOM-7 |
| 15 | `runReadingJob` (`api/jobs/reading/job.ts:155-322`) | 168 | 45 | run + 50-line failure block with four try/catch; a repository query | pure `classifyAttemptFailure` + `recordAttemptFailure` in `reading/failure.ts`; move `pendingOfPhoto` | API-12, API-7 |

The next tier the lenses mapped:
- `PanelCapture` (cx 53)
- `Sumario` (53)
- `Gallery` (51)
- `InstrumentPanel` (50)
- `AccountSurface` (46)
- `createFileRoutes` (43, API-11)
- `createGenerateRoutes` (41, API-4/5)

G4 examined `MeasurementField` (cx ~58; real decision logic ~40 lines at 75-153), `ChecklistRow` (cx ~51) and `InstrumentPicker` (cx ~51). They feed G4-2 (numeric cell) and G4-5 (radiogroups). Still unexamined: `TemplatesSurface` (cx 52) and `SessionProvider` (272 lines).

Areas outside the scan (G4):
- **Service worker.** Carefully reasoned and VM-tested. It has no navigation timeout (G4-6), keeps two legacy pin formats (`sw.js:70-77, 357-361`), and is linted but not typechecked (the test pulls `shellPlan` out with a regex).
- **Speech.** Small and clean. The `fake` and `webspeech` engines are statically imported into the production bundle (`engine.ts:1-2`).
- **Terraform.** Well factored, with two stale texts (G4-9).
- **bedrock-eval.** See G4-8.

### 8.3 Drift ledger: defects that exist because a pattern was copied

| Drift | Where | Effect | Ids | Fixed in |
|---|---|---|---|---|
| Textract classifies credential errors as permanent; Bedrock fixed to transient 2026-10-06 | `textract.ts:50-62` vs `bedrock.ts:254-264` | A credential hiccup fails a plate reading for good | API-1 | QW2 / 0.1 |
| Ledger-310 live re-seed landed only in the instrument panel | `client-panel.tsx:191`; `word-registry-panel.tsx:244, 281`; `cnpj-field.tsx:21` | A second device's edit stays stale and is then overwritten | WEB-1, XC-V1 | 2.1 |
| Setup and Empresa fields overwrite the box in render with no own-echo tracking | `setup-fields.ts:23-39`; `empresa-tab.tsx:292-301` | A keystroke can be lost when the field's own echo arrives (narrow, not reproduced) | WEB-1 (medium) | 2.1 |
| Setup and registry fields have no FR-61 draft source | `setup-fields.ts`, `etapa*.tsx` | Inconsistent draft recovery | WEB-1 | 2.1 |
| Sumário TAG rename drops its refusal | `sumario-surface.tsx:233-251` | Salvar does nothing, says nothing | WEB-3 | QW23 / 0.3 |
| Preview and audit ignore dead ops, which Gerar refuses | `use-preview.ts:84-91`; `use-audit.ts:59-66` vs `use-generate.ts:366-369` | The audit judges server state lacking the engineer's rejected edit | XC-V2, XC-7 | QW25 / 0.2 |
| Audit drain has no session-expired check | `use-audit.ts:56-66` vs `use-preview.ts:86` | ~20 s drain, then a generic failure without the sign-in path | WEB-6, WDT-1 | QW25 / 0.2 |
| Preview and audit keep running after the dialog closes | `use-audit.ts:56-84`; `use-preview.ts:69-104` | Unwanted Bedrock pass or LibreOffice render | WDT-V1 | QW25 / 0.2 |
| Display and environment readings say "Confirmado" before the pill clears; the plate waits | `read-display.tsx:168-211, 594-627` vs `nameplate-suggestions.tsx:186-197` | Timing differs in the main photo loop | WEB-9 | 14.11 / 2.4 |
| Kernel singular count + fixed plural web suffix | `pre-issue.ts:486` + `pt-br.ts:491`; `pt-br.ts:154` | "1 aviso — estão nas linhas do sumário" on the Emitir gate | XC-4 | QW31 / 0.3 |
| Setup and Section text bypass RelatorioGate's pull-on-open | `setup-surface.tsx:48-71`; `section-text-surface.tsx:50-66` | A fresh tablet says "não encontrado" | WEB-12, XC-8 | 0.5 |
| Registry remove, archive and undo have no catch | `client-panel.tsx:80-106`; `word-registry-panel.tsx:108-133`; `instrument-panel.tsx:369, 395` | Unhandled rejection, no toast (FR-54) | WEB-V1 | QW24 / 0.4 |
| Audit invalid-payload path never writes `finished_at` | `audit/worker.ts:56` vs `audit/job.ts:131`, `http/audit.ts:142` | Row breaks its invariant; untested | API-V1 | 14.11 / 0.4 |
| Audit records denied or misconfigured calls as `invalid_output` | `audit/job.ts:53-58` | Support looks at the prompt instead of IAM | API-V2 | 3.6 |
| Generate enqueue compensation is not wrapped; the audit's is | `generate.ts:232-247` vs `audit.ts:132-153` | A DB blip leaves a row queued and the wrong error | API-4 | 3.4 |
| A 401 on "Ler de novo" shows only "retry failed" | `reading-line.tsx:150-160, 220-229` | No re-auth banner for up to 60 s | WDT-11 | 3.7 |
| Gallery uses its own 3-frame focus helper | `gallery-surface.tsx:93-108` vs `input/focus-restore.ts` | After "Desfazer" focus falls to the heading | WEB-V2 | 4.5 |
| Three serial tap-timing specs bypass `syncNow` | `journey-taps.spec.ts:155-162`; `lost-taps.durability.spec.ts:134-140`; `journey-forward.spec.ts:55-64` | Arrange races that look like lost taps (12.1-E2E-007 not affected) | TST-2 (medium) | 0.7 |
| **(G4)** Numeric suggested/dictated inputs drifted | `read-display.tsx:451, 477, 754, 764` vs `measurement-field.tsx:321, 342, 356` | `EnvSuggestionFill` blur skips any `.confirm-btn`; red tone and spoken unit labels missing in some copies | G4-2 | 14.30 |
| **(G4)** Taps through `api.commit` instead of `edit` | `measurement-field.tsx:193`; `checklist-section.tsx:296` | Refused write silent | G4-4 | QW22 |
| **(G4)** Five roving radiogroups; `InstrumentPicker` moves focus only | `segmented-control.tsx:55-77`; `tri-state-control.tsx:56-82`; `conclusao-section.tsx:77-103`; `priority-picker.tsx:30-56`; `instrument-picker.tsx:83-149` | Keyboard behavior differs per group | G4-5, WEB-8 | 2.3 |

### 8.4 Duplication, grouped by proposed abstraction

"Story gate" means lint, static, test:unit, test:api and the touched specs (E11-A1).

**A. Write path and ops**

| Abstraction (ids) | Signature | Target | Sites | Saves | Covering tests | Risk |
|---|---|---|---|---|---|---|
| A1. Company/project envelopes, registry op builders (WEB-2, XC-5) | `companyOpEnvelope(author)`, `projectOpEnvelope(author, projectId)`; `registryCreateOp<K>`, `registryPutOp`, `registryRemoveOp` | `packages/domain/src/ops/envelope.ts`; `registries/ops.ts` | ~16, incl. kernel `registration.ts:118, 139`, `ficha-ops.ts:66-75` and `relatorio-ops.ts:34` overrides, `template-ops.ts:12-28` | ~90 lines; 17 `as never` casts moved into one builder | kernel envelope-equality test; panel tests; `db/commit.test.ts`; `cadastros.spec.ts`, `home.spec.ts` | Low; op shape must stay byte-identical |
| A2. One committed text field (WEB-1, XC-6, XC-V1) | `useCommittedText(value, commit, { draft?, flushOnUnmount?, parse?, format? })`, `<CommittedTextField …/>` built on the `useTypedText` echo list | `input/use-committed-text.ts`; `components/committed-text-field.tsx` | client, word-registry (×2), cnpj, instrument (3 fields + `useLiveReseed`), empresa, setup, composer name; ficha last | 200-250 | `instrument-panel.test.tsx` "ledger 310", panel and field tests; `cadastros`, `relatorio`, `keyboard-salvo(.durability)` | Medium; intended re-seed and draft additions, red tests first |
| A3. Registry row lifecycle and shell (WEB-2, XC-6, WEB-V1, WEB-13) | `useRegistryRow<K>(kind, id, row) → { commitField, remove }` (catches, undoable); `<RegistryPanelShell>` | `surfaces/registries/` | three panels; two tabs | 180-220 | registry tests; `cadastros.spec.ts`; new quota toast test | Create-on-first-field ordering; certificate `before` ops |
| A4. Equipment edit planners (WEB-3) | `renameTagPlan`, `notTestedPlan`, `moveRefusalText`; kernel `tagVerdictText` | `surfaces/relatorio/equipment-edits.ts`; domain | tree, ficha, Sumário, tag dialogs | ~70 + bug fixed | tree, ficha-header, sumario tests; `tree`, `move-block(.durability)`, `conflicts` | Focus targets stay in callers |
| A5. Typed planning on the editor (WEB-4) | `plan<R>(build) → written \| refused \| noop`; `moveSibling(adapter, …)` | `relatorio-editor.ts`, `tree-actions.ts` | 19 `const out` side channels; move clones | 90-120 | tree-actions, editor tests; `move-block.durability` on matrix | Q7 settle timing |
| A6. Typed path builder per family (DOM-V1) | ~10 one-liners (`generationJobFieldPath`, `auditRunFieldPath`, …) | `ops/path.ts` | `instantiate.ts`, web `photo-store.ts`, `commit.ts`, api `generate`, `files`, `reading/status.ts`, `apply.ts:229` (SQL key), `seed.ts` | 0 lines; one typed writer | `path.test.ts`, instantiate, test:api, op-log golden | Segment order |
| A7. One author (WEB-11, XC-5) | `useAuthor(): Author \| null` | `state/session.tsx` | 23-26 hand-built authors; 3 local types | ~25 lines, 3 types | static + surface tests | Mechanical |

**B. Reads and device storage**

| Abstraction (ids) | Signature | Target | Sites | Saves | Covering tests | Risk |
|---|---|---|---|---|---|---|
| B1. Live-query hooks (WEB-11, WDT-5, XC-9) | `useDbQuery<T>(query, deps, fallback)` + undefined-loading variant; `useLocalUsers`, `useRegistries`, `useRelatorioRows` | `db/live.ts`, `db/home-store.ts` | 61-65 null guards in 26-27 files; 56 `NO_*`; 3 registry scans on the ficha | 90-120 lines, ~40 constants | web unit; touched specs; ficha durability on matrix | Dependency drift; loading semantics |
| B2. Typed entity readers (WDT-6, WDT-7, XC-9) | `entityRow`, `entityRowsIn` on `[entity+relatorio_id]`, `entityRowsByIds`, `pendingSuggestionRows`, `discardEach`, `unsentOpCount`, `syncStateRows` | `db/entity-read.ts` etc. | 6 stores; six out-of-layer reads incl. `sync/engine.ts:559` | 80-100 | store tests; `sync-status`, `export`, `emission-audit`, `plate-reading` | Validation may hide rows cast today |
| B3. Keyed preferences (WDT-15) | `keyedPref<T>(prefix, schema)`, `singlePref`, one `readDeviceId` | `db/prefs.ts` | four families; three `device_id` reads | 35-45 + pruning | prefs, photo-store, commit tests | `photo_seq` in the capture transaction |
| B4. Api entity repository (API-7) | `findEntity`, `findLiveRows`, `findActiveJob` | `apps/api/src/db/repositories/entities.ts` | ~20 inline lookups; `failDeadReading` missing `findFileRow` checks | ~70 | integration tests; leak check; `security.test.ts` | Keep snapshot union query |

**C. Server jobs, api routes and providers**

| Abstraction (ids) | Signature | Target | Sites | Saves | Covering tests | Risk |
|---|---|---|---|---|---|---|
| C1. Web server-job barrier (WEB-6, WDT-1, XC-7, XC-V2, WDT-V1, WDT-V3) | `drainForServerJob(db, engine, { maxRounds, retryMs, signal, stopOnDead, isSessionExpired })` throws `JobStopped`; `askBehindBarrier<T>`; `waitForRow<T,O>` (promoted from test-only `untilStored`); kernel `jobWaitOutcome`, `jobOutcome`, `auditRunOutcome` | `sync/barrier.ts`; `db/until-stored.ts`; domain | preview, audit, generate, watcher | 150-200; five verdict copies → one | new `barrier.test.ts`; export/audit/watcher tests; `export`, `emission-audit`, `parecer-export` | `window.open` inside the press; awaiting resume |
| C2. Api route helpers (API-4) | `fail`, `readJson`, `streamStored`, `uuidParam`; `caughtUpRelatorio`; `createRowThenEnqueue` | `http/respond.ts`, `barrier.ts`, `job-rows.ts` | 4 `fail()`; preamble ×2; compensation ×2; streaming ×3; `z.uuid()` vs uuidV7 | ~80; `createGenerateRoutes` cx → ~25 | route integration tests | Error-code order (`audit.ts:28-36`) |
| C3. Job harness, generate and audit only (API-2, API-V1, API-9) | `recordInvalidPayload({entity, actor, errorCode})`, shared enqueue; `auditRunFailOps`; `jobLogger`, `errorFields` | `jobs/harness.ts`; `log.ts` | two workers; three audit failure writers | 40-50 | new audit worker test; job tests | pg-boss options identical; reading excluded |
| C4. AI provider base (API-1, API-3, API-V2) | `classifyAwsError`, `callWithTimeout`, `createAiProviders(config, { bedrockSource })`, `ProviderRefusedError`, `InvalidOutputError`, usage on billed failures | `apps/api/src/ai/` | 3 providers; 2 Bedrock clients | ~50; closes `deferred-work.md:1285/1291` | provider tests; audit; reading integration | `instanceof` through base class |
| C5. Child-process runner (API-10) | `runProcess({…, stderrCapBytes})`, `withTempDir` | `jobs/generate/process.ts` | soffice, pdftoppm | 25-35 | libreoffice, pdf-raster tests | Error classes |
| C6. Guarded batch with refusal value (API-5) | `applyServerBatchIf<R>`, same for `applyOps` | `sync/apply.ts` | 6-8 "refused" sentinels | ~40 | files, generate-lock, audit, push tests | Rollback; reading sentinels stay throws |
| C7. Sync client core (WDT-11) | private `call<T>`; `createSyncClient({ fetch, onUnauthorized })` | `sync/client.ts` | four wrappers; 401 per caller | ~40 | client tests; session-expiry e2e | Low |

**D. Web UI and interaction primitives**

| Abstraction (ids) | Signature | Target | Sites | Saves | Covering tests | Risk |
|---|---|---|---|---|---|---|
| D1. Roving radiogroup (WEB-8, G4-5) | `useRovingRadio<T>({ values, value, onChange, clearable?, readOnly?, selectOnMove? })` on `useLatestChoice` | `components/use-roving-radio.ts` | 4 strict + `InstrumentPicker` (decide listbox vs radiogroup) | ~150 | radiogroup tests; `ergonomics`, `ficha`, `parecer-export` | Keyboard differences |
| D2. Suggestion actions (WEB-9) | `useSuggestionActions(api, pending)`; `usePendingSuggestions` | `surfaces/ficha/` | 3 hooks | ~60-90 | read-display, plate tests; `tap-budget` before/after | Intended timing change |
| D3. Icon and IconButton (WEB-14) | `Icon({ name, size? })`, `IconButton({ icon, label, onPress, … })` | `components/icon.tsx` | 117 inline SVGs; 16 `.icon-btn` | ~230 | button test; `ui-hygiene`, `ergonomics` | Mock class names |
| D4. Layout pieces (WEB-15) | `TreeRail`, `SetupBand`, `SyncRow`; kernel `railSheetCount` | relatorio, setup | rail ×2, band ×6, sync row ×2 | ~120 | tree, setup tests | Focus hand-off |
| D5. Single-field dialog (WEB-16) | props on `NameDialog` | `tag-dialogs.tsx` | 2 dialogs | ~60 | tag-dialogs tests | Low |
| D6. Clock and reveal hooks (WEB-19) | `useNowIso(everyMs, active)`; `useRevealRow` | `clock.ts`; tree | 2 clocks; 2 reveal pairs | ~40 | tree tests; `reading-wait`, `panel-capture` | Low; **one owner (G6-4)** |
| D7. Mounted shell slot (WDT-14, XC-11) | `createMountedSlot<T>()` with a stack, setter split from value | `state/mounted-slot.tsx` | 3 contexts | ~50 | banner-slot tests; `app-layout`, `shell` | Last-mounted-wins |
| D8. Gate and not-found (WEB-12, XC-8) | `RelatorioGate({ id, className })`; `NotFoundNote`; `LiveRouteGate` | relatorio, components | 5 surfaces | ~70 | surface tests; new cold-open e2e | Intended pull-on-open |
| D9. Editable area and text history (WDT-12) | `useEditableArea`; `useTextHistory` | `input/` | 2 hooks | 70-80; point text gets undo | new jsdom tests; device IME check | Keep `isComposing` checks |
| D10. Pointer gesture core (WEB-20, WDT-13) | `createPointerTracker({ slopPx })`, `usePointerGestures`, `GESTURE_SLOP_PX`; rAF transform | `input/pointer-gesture.ts`; `capture/` | pinch, camera, press-and-hold | 50-60; camera file < 400 | camera, pinch tests; `photo-zoom.durability` on matrix | Slop from the device pass (stylus, not glove) |
| D11. Routes and deep links (XC-14) | `ROUTE`; `href.sumario/setup/ficha/…`; query keys | `apps/web/src/routes.ts` | 17 files; 10 `etapa=`; `setup-surface.tsx:164` ignores `RETURN_PARAM` | ~35 sites | `routes.test.ts`; navigation e2e | Low |
| D12. Copy chrome words (XC-2) | `ui.toast.undo`; optional `UndoOptions.label` | `copy/ui.ts` | Desfazer ×12, Cancelar ×13, 7 explicit `cancelLabel` | ~40 copy lines | undo tests | None |
| **D13. Numeric reading cell (G4-2, new)** | `useSuggestedNumber({ initial, parse, onConfirm, onTyped })`; `<CellUnit>`; `<CellHelpers>`; `enterKeyHint` prop | `surfaces/ficha/` | `MeasurementField`, `DictatedMeasurementField`, `ReadOnlyMeasurementField`, `SuggestedCell`, `EnvSuggestionFill` | removes the `MutationObserver` workaround (`ensaios-section.tsx:128-161`) | ficha tests; `keyboard-salvo(.durability)`, `read-display` | Focus and blur-vs-Confirmar rule |

**E. Kernel**

| Abstraction (ids) | Signature | Target | Sites | Saves | Covering tests | Risk |
|---|---|---|---|---|---|---|
| E1. Cell geometry (DOM-1) | `tableSpans(test)`, `locateRow`, `cellSlots(test, roles)` | `seed/cell-geometry.ts` | 6 offset loops | ~25; one owner of AD-3 addressing | apply, path, readings, display tests; golden | Every reading depends on it |
| E2. Snapshot row selection (DOM-3) | `selectSnapshotRows(state, id, refsOf)` | `schemas/snapshot.ts` | 2 selections | 30-45 | snapshot tests; `commit-to-render.perf` | Keep `same()` reuse |
| E3. Sheet cell walker (DOM-4) | `sheetCellsOf(sheet, include)` | `schemas/sheet-cells.ts` | 3 walkers | ~20 | sheet-state, snapshot, conflicts | Conclusion null handling |
| E4. Block config view (DOM-8) | `blockConfigView(block)` memoized | `schemas/block-config.ts` | 7-9 ad hoc readers | ~20 | config readers' tests | "Unparseable means all enabled" |
| E5. Block definition accessor (DOM-10) | `blockDefinitionOf`, `testDefOf`, `REPORT_TYPE` | `seed/definitions.ts` | 8 `definitionOf`, ~16 try/catch, 26 literals | ~70 | colocated, goldens | Planned (K-20) |
| E6. Result words (DOM-11, XC-4) | `CHECKLIST_RESULT_WORDS`, …, `PENDING_WORD`; switch on `safeParsePath` | `relatorio/result-words.ts` | 3 homes | ~15 | conflicts, conclusion tests | Low |
| E7. Collections (DOM-13) | `compareCodeUnits`, `byKeys`, `groupBy`, `createMemo<T>()` factory | `collections.ts` | ~12 comparators, 6 buckets, 5 memos | ~30 | cards, order-key, tree | Tie order; never export `memoized` as is |
| E8. Zoned formatter (DOM-14) | `zonedFormatter(options, post)` | `format/datetime.ts` | 6 formatters | ~35 | datetime tests | Golden strings |
| E9. Section builders (DOM-17) | `SectionBuilder` for 7-11 | `print/layout.ts` | 9 and 10 special-cased | ~10 | layout, docx goldens | Low |
| E10. Pre-issue structure (DOM-5, DOM-6) | `countRow`; per-row functions; `PRE_ISSUE_KIND_META`; fold company/client checks | `relatorio/pre-issue.ts` | 27 pushes; 2 check shapes | 40-60 (+60) | pre-issue tests, golden | Row order and ids exact |

### 8.5 Structural issues that are not duplication

| # | Issue | Evidence | Recommendation | Ids | Effort |
|---|---|---|---|---|---|
| S1 | Kernel runtime import cycle | One 10-file SCC (tree, sumario, pre-issue, parecer, conclusion, sheet-progress, ficha, points/derived, points/summary, print/section-11) closed by `tree.ts:15` and `pre-issue.ts:31` → sumario | Move `cabineMetaText` (with its helpers) into `relatorio/cabine.ts`; `sectionBlocks`, `printsSeedSections`, `seedSectionNumbers` into `relatorio/sections.ts`; cycle test | DOM-2, DOM-16 | S |
| S2 | `schemas/` has upward edges | `entities.ts:4-9` (seed, merge, audit); `snapshot.ts:3` (reducer); `ops/apply.ts:18` (reading) | `schemas/entity-state.ts`; declared `NOT_TESTED_REASON_KEYS` with a seed test | DOM-9 | S |
| S3 | Surfaces act as hidden libraries | 47 surface-to-surface imports; mutual ficha↔relatorio, ficha↔photos, relatorio↔sync; `input/` imports `surfaces/templates` | `input/editor/`, `input/reorder/`, `apps/web/src/capture/`; relatorio editor core out of surfaces; import-direction tooling test | XC-10 | M |
| S4 | Store boundary enforced on imports only | six bypass reads incl. `sync/engine.ts:559`; `eslint.config.js:97-117` | Member-access selector; store functions (B2) | WDT-7 | S |
| S5 | apps/web still decides some rules | `use-ficha-actions.ts:157-161`; `conclusao-section.tsx:202-203, 357-358`; `panel-capture.tsx:134-137`; `nameplate-section.tsx:155-161`; `relatorio-tree.tsx:197-200`; `reading-arrivals.tsx:88-96`; export reason chain; rail counts | Kernel `sheetActions`, `conclusionMissing`, `readingWaitLine`, `firstEmptyNameplateField`, `panelResumeTarget`, `equipmentRowsOf`, `jobWaitOutcome`, `railSheetCount`, generate reason kind; banner priority and `arrivalStep` stay in web | WEB-17, WDT-3, WEB-15, WEB-5 | M |
| S6 | State shape | 12 `SyncState` + 2 `SyncClient` members optional only for doubles (`use-generate.ts:360` could send early if wiring were missing); ficha subscribes to the whole sync context; online state has three sources; `BlockRow.config` untyped | Required members + `fakeSyncState`/`fakeSyncClient`; `useSyncActions` at four ficha sites and `GenerateWatcher`; one connectivity store; `blockConfigView` | WDT-10, WDT-9, WDT-16, DOM-8 | S each |
| S7 | Uneven error handling | sentinel exceptions; opposite AWS classification; audit codes; registry removes without catch; per-caller 401; 33 bare `String(error)` | C6, C4, C3, A3, C7 | API-5, API-1, API-V2, API-9, WEB-V1, WDT-11 | via units |
| S8 | Timers and polling | four 3 s pollers each run a full sync cycle; thumbs and eviction every cycle; uncancellable backoff; drain and ask ignore unmount; per-move `setState` in pinch; two clocks | `SyncEngine.watchStreams(ids, until)` + quick cycle; gated maintenance; abortable `wait(ms, signal)`; rAF transform; `useNowIso` | WDT-2, WDT-V2, WDT-4, WDT-V1, WDT-13, WEB-19 | M |
| S9 | Hot-path scans | `audit-store.ts:16`, `generate-store.ts:37, 53` ignore `[entity+relatorio_id]`; always-mounted `readingCountRows`; per-cycle `hasRunningReading`, `discardStaleProse` | Step 1 now: compound index. Step 2: schema v7 `[entity+state]` kept on every write path. Step 3: narrow the prose sweep | WDT-8 | S, then M |
| S10 | Hub files grown by appending | `pt-br.ts` (one object, `viewer` at :823 and `viewerZoom` at :1552, stale header at :2); `app.css` batch sections; `sync-store.ts`; `apply.ts`; `seed.ts`; 114-line `export *` barrel | Per-surface copy modules recomposed into the same `copy` (call sites unchanged); split stores and seed; named barrel re-exports; "each batch edits only its surface's copy file" | XC-1, XC-12, WDT-17, API-6, API-18, DOM-15 | M each |
| S11 | Naming | "reading" means measurements and OCR; `relatorio/` 38 files; `job_id` three meanings; audit throws `PermanentReadingError`; three hook naming styles | `sheet/` and `suggestions/` folders between waves (KB updated); settle `job_id`; conventions in `docs/kbs/project/rules.md`, rename on touch | DOM-18, API-9, API-3, XC-16 | M |
| S12 | Dead code and stale text | 3 dead keys; orphan comment `ui.ts:138-141`; "placeholder" tabs `pt-br.ts:1341-1343`; stale `storage-estimate.ts:35-37` | Delete; `unusedCopyKeys()` tooling check; keep path builders and use them (A6) | XC-3, DOM-15, G1-1 | S |
| S13 | Lint gaps | no react-hooks plugin (~25 render-time ref writes of 86 assignments; 61 hand-written live-query dep arrays); no purity, cycle or Playwright rules; no Python lint | `eslint-plugin-react-hooks` (`rules-of-hooks` error, `exhaustive-deps` warn, `additionalHooks`), checking ESLint 10 flat-config support; `useEffectEvent` (React 19.3); purity selectors; `eslint-plugin-playwright`; ruff + pyright in the OCR container | WDT-18, DOM-16, TST-V1, API-15 | S-M |
| S14 | CSS convention conflicts with practice | `app-css.test.ts:93-112` enforces `components.css` frame rules in `app.css`; surfaces translate screen-scoped mock rules locally; 53 selectors in both; 9 identical tablet-landscape and desktop rules | Codify the two homes; allow a merged `@media (min-width: 1024px)` when identical; move camera, points, nameplate blocks out of `app.css`; strike and date the AGENTS.md sentence | XC-12, XC-13 | M |
| S15 | Comments narrate history | ~1,050-1,270 story/review/retro references; 7,107 comment lines of 42,546 | Present-tense invariants for new comments; trim on touch; no bulk rewrite | XC-15 | S |
| S16 | Api wiring and large handlers | `createApp` threads deps five times (22 conditional spreads); 127-line upload closure; `apply.ts` split unowned; OCR `display.py` imports private names | One `RouteDeps`; inject `newId` into file routes; named upload steps preserving race order; owner for the apply split; `app/geometry.py` with public names | API-8, API-11, API-6, API-14 | S-M |
| S17 | OCR photometric step (experiment) | plate pipeline has no contrast normalization; display uses CLAHE | ocr-svc-only experiment on dim and glare fixtures; production plates go through Textract | API-17 | S |
| S18 (new, G4) | Service-worker resilience | network-first navigation with no timeout; legacy pin formats; not typechecked | 14.34 timeout; drop legacy pins after a release; typecheck via JSDoc or a TS source compiled to `public/` | G4-6 | S |

### 8.6 Test structure

**Numbers.**
- Test counts: test:unit about 2,936; test:api 517.
- Hand-built doubles and helpers: 34 web test files hand-build `SessionState`. Adding one member cost 30 test-file edits in PR #75 and 31 in PR #77. 37 files define `freshDb`.
- API harness copies: 23 files define `signIn`, 14 `authed`, 14 `pushOk`, and 30 call `createAuth({`. There are 149 hand-built op literals in 52 files.
- e2e: 400 tagged titles. In the last full @p0 timing, setup helpers took 254 s of 1,034 s (`signIn` 104 s over 211 calls, `pushDrafts` 58 s, `syncNow` 54 s, resets 25 s). The full run took about 2,031 s wall time (parallel 289 tests in 959 s, serial 93 tests in 1,069 s). There are 24 `waitForTimeout` calls in specs.

| Top duplicated test sequence | Copies | Proposed helper | Est. lines saved |
|---|---|---|---|
| Reset, viewport, signIn, drafts, push, open Sumário, wait for "Capa e dados do relatório" | 13 local setUp functions; Sumário-ready line 33× in 31 files | `seedRelatorio(page, account, database, opts)` + `relatorio` fixture (keeps the Sumário pull wait) | 300-350 |
| Tree walk to a sheet | 2 support bodies, 94 calls in 22 files | `gotoSheet` + `sheetOf(built, {type, location})` | 40 + 30-60 s per @p0 |
| `openSheet` | 9 identical | `gotoSheet` | 40 |
| Inline "Sincronizar agora" | 10 files (3 racy) | `syncNow`/`syncNowAndReturn` + lint rule | 25 |
| `toast`, outbox, `openGallery`, `openSumario` | 24 / 19 / 5 / 5 | `support/locators.ts`, `support/device.ts` | 120 |
| `resetEmpresaA`, `twoDevices` | 4 + 2 | support | 60 |
| `instrumentDraft` | export + 2 private + variant | existing export | 70 |
| Tap counting | support + 4 variants; `pickInstruments` ×4 | `pageTapCounter`, `support/journey.ts` | 150-200 |
| Offline create cadastros | 3 | table-driven test | 40 |
| Web SessionState literal | 34 / 36 files | `makeSession`, `mockSession` | 300 |
| Web `freshDb` | 37 files | `freshDatabase(opts)` | 200 |
| Web sibling harnesses | tree ×3 (126-line clone), composer ×4 (47-line exact) | `*.harness.tsx` | 350-400 |
| API integration harness | as counted above | `createApiHarness` | 1,000-1,300 |
| Op literals and standard relatório | 149 literals / 38 arrangers | `packages/domain/src/ops.test-support.ts` (by path, `*.test-support.ts` excluded from the prod image) | 1,000+ |

| Where @p0 time goes | Tests | Wall | Test time | Setup | Top setup items |
|---|---|---|---|---|---|
| parallel (1 worker) | 182 | 788 s | 756 s | 204 s (27%) | signIn 173× 82 s, syncNow 147× 49 s, pushDrafts 146× 44 s, resetEmpresaB 143× 19 s |
| serial | 47 | 289 s | 278 s | 50 s (18%) | signIn 38× 22 s, pushDrafts 41× 14 s |

| Gate-time lever | Estimated effect | Confidence | Ids |
|---|---|---|---|
| Cross the 10 s reading-cancel threshold with `page.clock` or a dev-only override (the kernel already tests the boundary, `wait.test.ts:17-24`) | 25-30 s off @p0 | medium | TST-12 |
| Open sheets directly in 58 @p0 calls; keep the tree walk in `tree.spec.ts` and 5.1-E2E-005 | 30-60 s off @p0 | medium | TST-1 |
| Tag serial needs per test (`@serial` + annotation); tooling check for `confirmIssue`, `downloadFrom`, job timeout | 0 s at 1 worker; at 2 workers ~25 tests move to the parallel pool; precondition of the `--workers=2` measurement | high | TST-3 |
| `scripts/story-gate.ts` with `touchedSpecs(diff, SURFACE_SPECS, importGraph)`, adding matrix projects when the op fold, commit path or a ficha live query changes; `verify.ts:33` still ends in full @p0 | Avoids missed specs and over-selection | medium | TST-8 |
| @p0 tiering rule and a ceiling in `scripts/e2e.test.ts`, changed only by a dated decision | not estimated (the 219 vs 43 comparison was invalid) | medium | TST-14 |
| Shrink positive sleeps; size negative windows from app constants (`holdsFor`) | ~2 s in `ficha.spec.ts` | medium | TST-7 |
| One fixture layer for sign-in and seeding | neutral now | low | TST-9 |

Correctness guards for the gate itself:
- **TST-V1 (high).** No `forbidOnly`, and `--pass-with-no-tests`, so one stray `test.only` produces a green gate that ran one test. Fix: `forbidOnly: true`, `allowOnly: false`, `eslint-plugin-playwright` (`no-focused-test`, `missing-playwright-await`, `no-wait-for-timeout` as a warning with an allow-list), and a failure for any passed spec path matching zero tests.
- **TST-V2.** Duplicate test ids (12.1-E2E-007, 12.1-E2E-008, 13.7-E2E-001), and the retros cite the ambiguous ones. Fix: renumber and add `duplicateTestIds()`.
- **TST-2 (medium).** Fix: `syncNowAndReturn` plus a lint rule.

### 8.7 Refactor plan in waves

**Ground rules.**
1. Route every unit as a story with AC, DoR, DoD and a Dev model line. Give R10-12, K-20 and E13-A6 owners.
2. Keep behavior changes out of refactor PRs. Wave 0 holds the intended changes. Later units are "no behavior change" proven by unchanged tests, except units marked **(intended change)**, which need a red test first.
3. Characterize before moving `PointEditor`, the text-area hooks and the camera.
4. Split mechanical sweeps by area. Hub moves land at wave boundaries.
5. E11-A1 load rules apply: at most two stacks, every Playwright run under `flock /tmp/fasor-verify.lock`, matrix projects for op-fold, commit-path or ficha live-query changes, and the full @p0, `test:e2e:full` and matrix once per wave.
6. **(G6)** E13-A1, E13-A2 and E13-A4 are wave-0 blockers: a "no behavior change" unit needs a unit stage that means green.

| Wave | Unit | Scope | Prereq | Effort | Value |
|---|---|---|---|---|---|
| 0 | 0.1 Textract credential errors transient | QW2 | none | S | high |
| 0 | 0.2 Export barrier guards | dead ops disable preview/audit; audit re-auth check; abort on unmount (QW25) | none | S | high |
| 0 | 0.3 Visible text fixes | Sumário rename refusal; kernel precheck sentence and `moreLabel` plural (QW23, QW31) | none | S | medium |
| 0 | 0.4 Failure records | registry catch; `auditRunFailOps`; audit worker integration test | none | S | medium |
| 0 | 0.5 Pull-on-open for Setup and Section text | `RelatorioGate`; ficha not-found back link; cold-open e2e | none | S | medium |
| 0 | 0.6 Gate integrity | TST-V1, TST-V2 | none | S | high |
| 0 | 0.7 Tap-timing arrange | TST-2, run 5× serially under the lock | none | S | medium |
| 0 | 0.8 Cheap performance | `useSyncActions` at four ficha sites and the watcher; compound index in audit and generate stores | none | S | medium |
| 0 | E13 blockers | E13-A1 wave gate, E13-A2 unit failures, E13-A4 ledger | none | S-M | high |
| 0 or drop | 1.1 Copy modules | split `pt-br.ts` into surface modules recomposed into `copy`; dead keys; `unusedCopyKeys()`; chrome words (D12) | **quiet main, no open branch (G6)** | M | high (conflicts) |
| 1 | 1.2 Kernel guards and cycles | purity selectors; S1 moves; cycle test | none | S | high |
| 1 | 1.3 Kernel geometry and walkers | E1, E3, E2 | 1.2 | M | high |
| 1 | 1.4 Kernel helpers | E4, E5 (K-20), E7, E8, E6 | 1.2 | M | medium |
| 1 | 1.5 Kernel rule moves | S5 functions | 1.2 | M | high |
| 1 | 1.6 Ops envelopes and paths | A1 step 1, A6, A7 | none | S | medium |
| 1 | 1.7 Web test doubles | `makeSession`, `freshDatabase`, `fakeSyncState/Client`; required members | none | S | high |
| 1 | 1.8 Hooks lint (warn) | S13 | none | S | medium |
| 1 | 1.9 Reading-wait clock | TST-12 | none | S | medium |
| 1 | **1.P = 14.10** (E13-A6) | gesture core, camera split into `capture/`, `GESTURE_SLOP_PX`, `clampCameraZoom`, rAF pinch | characterization tests | M-L | high |
| 1 | **C4 (= 14.8 core) + C3 (generate+audit)** | `apps/api/src/ai/`; job harness | 0.1, 0.4 | S + S | high |
| 2 | 2.1 Committed text field (intended change) | A2; ficha last in its own PR with the durability matrix | 1.7 | M | high |
| 2 | 2.2 Registry row and shell | A3 + registry op builders | 1.6, 2.1 | M | medium |
| 2 | 2.3 Roving radiogroup | D1 incl. `InstrumentPicker` decision (G4-5) | 1.7 | M | medium |
| 2 | 2.4 Suggestion actions (intended timing change) = 14.11 | D2 | 1.7 | M | high |
| 2 | 2.5 Live-query layer, by area | B1 ×3 PRs; S4 | 1.7, 1.8 | M ×3 | medium |
| 2 | 2.6 Equipment planners and `editor.plan` | A4, A5 | 1.5 | M | medium |
| 2 | **2.N = 14.30 Numeric cell** | D13 | QW21-22 | M | high |
| 2 | 2.T e2e support | TST-1, 11, 10, 7, 3, 8, 14 | 0.6 | M ×3 | high |
| 3 | 3.1 Web barrier | C1 | 0.2, 1.5 | M | high |
| 3 | 3.2 Generate machine | `generateReducer` | 3.1 | M | high |
| 3 | 3.3 Engine watch | `watchStreams`; gated maintenance | 3.1 | M | high |
| 3 | 3.4 Api route helpers and repository | C2, B4 | none | M | medium |
| 3 | 3.6 AI provider base completion | rest of C4 (refused vs invalid output; usage on billed failures; one Bedrock client) | C4 | M | high |
| 3 | 3.7 Sync client core | C7 | 1.7 | S | medium |
| 3 | 3.T Api harness | `createApiHarness`, migrated per story | none | M | medium |
| 4 | 4.1 ExportDialog split | WEB-5 | 3.1, 3.2, 1.5 | M | medium |
| 4 | 4.2 Editor primitives (point undo, intended) | D9; editor models to `input/editor/`; reorder to `input/reorder/`; surface-import test | none | M | medium |
| 4 | 4.3 PointEditor split | characterization first | 2.1, 4.2 | L | medium |
| 4 | 4.4 TemplateComposer | `useFreshEditor`; dialogs reducer; `LiveRouteGate` | 2.1, 2.6 | M | low-medium |
| 4 | 4.5 Sumário, Gallery, RelatorioTree | data hooks, dialog reducers, gallery focus (intended timing), `useRevealRow`, D4, D5, D6 | 1.5, 2.6 | M ×2 | medium |
| 4 | 4.6 Icons | D3 | none | S | low-medium |
| 5 | 5.1 `createSyncEngine` split | WDT-4; connectivity store | 3.3 | L | medium |
| 5 | 5.2 `apply.ts` split | API-6; injected `newId`; barrel | 3.4 | M | medium |
| 5 | 5.3 Web stores | B2, `sync-store` split, B3 | 2.5 | M | medium |
| 5 | 5.4 Schema v7 index (behavior risk) | WDT-8 steps 2-3 | 5.3 | M | medium |
| 6 | 6.1 Kernel folder rename and barrel | DOM-18, DOM-15 | 1.2-1.5 | M | medium |
| 6 | 6.2 CSS convention | S14 with AGENTS.md amendment; `test:e2e:full` | 1.P | M | medium |
| 6 | 6.3 Routes | D11 | none | M | low-medium |
| 6 | 6.4 Api tidy-ups | API-18, API-8, API-11, API-12, C5, C6 | 3.4, 3.6 | M ×3 | medium |
| 6 | 6.5 OCR sidecar | `geometry.py`; ruff and pyright; fake-model unit layer and `model` marker; optional CLAHE experiment | none | S | low |

### 8.8 What not to refactor, and why

- **Seed checklist data** (`seed/v1.ts:153-299`). It is frozen pt-BR data built with builders and pinned by a content hash. Exclude `seed/v*.ts` from clone scans (DOM-V2).
- **Typed path builders** (`ops/path.ts:467-507`). They are the public API. Do not derive `opPathSchema` from `FAMILIES`: both share the field constants, and the existing test catches family drift (DOM-12, corrected).
- **`writeRow` and the `opSchema` superRefine** are justified switches.
- **Per-surface shape of `pt-br.ts`.** Split the file but do not merge surface keys. Merge only true chrome words into `ui.ts`.
- **`tokens.css` and `components.css`** stay byte-identical. RAC `RadioGroup` cannot render the mock's markup, so the answer is one local hook, not a component kit.
- **A generic `PreIssueRule<any>` registry.** The rules interact (DOM-5).
- **Banner priority, its "+N" fold, `arrivalStep`.** These are shell and watcher state (WDT-3).
- **The reading queue in the job harness, and the reading job's two sentinels.** They differ in kind (API-2, API-5).
- **A five-module OCR split.** `geometry.py` is enough (API-14).
- **Deleting the components barrel.** Consumers use it 75 times against 40 direct imports. If one path wins, it is the barrel (XC-16, corrected).
- **A `useReasonedPress` hook.** Button and TextButton already share `assertReason` (WEB-14).
- **Exporting `tree.ts`'s `memoized` as is.** Use a `createMemo()` factory (DOM-13).
- **ExportDialog's render-phase `setState`.** It is React's documented pattern. Replace it for readability only.
- **API `pull.ts` summary "clone", `db/schema.ts:178-221`, `make-plate-fixtures.ts`, the two status writes at `reading/status.ts:98-164`.** Different queries or literal data.
- **Bulk comment rewrite; mass api test migration during a wave.** Do it on touch.
- **Raising the gesture slop on a glove argument.** The binding input is a stylus or bare finger (WDT-13, corrected).
- **CLAHE as a field fix.** Production plates go through Textract (API-17).

### 8.9 Code findings index

| Id | Sev | Finding | Key evidence | Lands in |
|---|---|---|---|---|
| WEB-1 | medium (corrected) | Seven autosave text fields, four re-seed policies; ledger-310 fix in one panel | `client-panel.tsx:190-210`; `instrument-panel.tsx:417-473`; `setup-fields.ts:23-39`; `ficha-fields.tsx:61-110` | 2.1 |
| WEB-2 | medium | Registry panels triplicate scaffolding; ~16 hand-built envelopes | `client-panel.tsx:55-106`; `ops.ts:20-31` | 1.6, 2.2 |
| WEB-3 | medium | TAG rename / not tested / move written 2-3×; Sumário drops the refusal | `sumario-surface.tsx:233-251`; `tree-actions.ts:391-421` | QW23, 2.6 |
| WEB-4 | medium | `useTreeActions` out-param skeleton; move clones | `tree-actions.ts:148-221, 264-585` | 2.6 |
| WEB-5 | medium (corrected) | `ExportDialog` 490 lines, cx 119 | `export-dialog.tsx:82-571` | 4.1 |
| WEB-6 | medium | Drain/ask/poll ×3 with different exit rules | `use-preview.ts:79-125`; `use-audit.ts:57-96` | 0.2, 3.1 |
| WEB-7 | medium | `useGenerate` phase union across 9 effects | `use-generate.ts:55-77, 113-478` | 3.2 |
| WEB-8 | low (corrected) | Four strict roving radiogroups; SegmentedControl lacks the guard (negligible field impact) | `segmented-control.tsx:52-120` | 2.3 |
| WEB-9 | medium | Suggestion actions ×3, toast timing diverged | `read-display.tsx:111-231, 594-627` | 2.4 |
| WEB-10 | medium | `PointEditor` 529 lines, 18 refs, no unit test | `point-editor.tsx:120-648` | 4.3 |
| WEB-11 | low | 41 null guards, 38 `NO_*`, 23 Authors, 3 local Author types | surfaces | 1.6, 2.5 |
| WEB-12 | medium | Setup and Section text skip pull-on-open | `setup-surface.tsx:48-71`; `app.tsx:143-147, 182-186` | 0.5 |
| WEB-13 | low (corrected) | Four undo mechanisms; impact near nil | registry panels; `gallery-surface.tsx:204-225` | 2.2 |
| WEB-14 | low | No Icon/IconButton; 117 inline SVGs | components | 4.6 |
| WEB-15 | low | Rail ×2, setup band ×6; rail count two kernel functions | `ficha-rail.tsx:40-82`; `tree-surface.tsx:41-93` | 4.5 |
| WEB-16 | low | SaveTemplateDialog = NameDialog | `save-template-dialog.tsx:18-70` | 4.5 |
| WEB-17 | low | Surfaces decide rules (W-15..17) | `use-ficha-actions.ts:157-161`; `panel-capture.tsx:134-137` | 1.5 |
| WEB-18 | low | Session double in 31 files; harness clones | `template-composer-palette.test.tsx:42-88` | 1.7 |
| WEB-19 | low | Two clock hooks; two reveal pairs | `panel-capture.tsx:139-148`; `relatorio-tree.tsx:247-291` | QW20, 4.5 |
| WEB-20 | medium | Camera split boundaries (E13-A6) | `camera-view.tsx` | 14.10 |
| WEB-V1 | low | Registry remove/undo uncaught | `client-panel.tsx:80-106` | QW24 |
| WEB-V2 | low | Gallery private 3-frame focus helper | `gallery-surface.tsx:93-108` | 4.5 |
| WDT-1 | high | Export job flow ×4, drifted | `use-audit.ts:56-96`; `generate-watcher.tsx:108-141` | 0.2, 3.1 |
| WDT-2 | medium | Job polling runs a full sync cycle every 3 s | `engine.ts:606-618, 726-730` | 3.3 |
| WDT-3 | medium (corrected) | Job outcomes and helpers in web; banner/arrival stay | `generate-watcher.tsx:110-127` | 1.5 |
| WDT-4 | medium | `createSyncEngine` 611 lines, cx 147 (R10-12) | `engine.ts:196-806` | 5.1 |
| WDT-5 | medium | 61 null-db live queries, 56 `NO_*` | `use-ficha-data.ts:45-48` | 2.5 |
| WDT-6 | medium | Entity readers ×6, three validation policies | `audit-store.ts:15-32`; `sync-store.ts:397-423` | 5.3 |
| WDT-7 | medium (corrected) | Six store-boundary bypasses | `use-audit.ts:62`; `engine.ts:559` | 2.5 |
| WDT-8 | medium | Hot queries scan whole tables | `suggestion-store.ts:230-272`; `audit-store.ts:16` | 0.8, 5.4 |
| WDT-9 | medium | FichaBody re-renders on every outbox write | `use-ficha-photos.ts:75` | 0.8 |
| WDT-10 | low | Test-only optional members as runtime guards | `sync.tsx:108-188`; `use-generate.ts:360` | 1.7 |
| WDT-11 | low | Sync client error paths ×4; 401 per caller | `client.ts:129-228`; `reading-line.tsx:150-229` | 3.7 |
| WDT-12 | medium | Two contenteditable hooks; point text has no undo | `use-section-text-area.ts:124-157` | 4.2 |
| WDT-13 | medium (corrected) | Two gesture engines, three slops, two `clampZoom` | `use-pinch-zoom.ts:68-82, 157-160`; `camera-view.tsx:472, 748` | 14.10 |
| WDT-14 | low | Three slot contexts | `page-title.tsx`; `back-target.tsx`; `extra-banner.tsx` | D7 |
| WDT-15 | low | local_prefs spread over six files; keys never pruned | `prefs.ts:4-7, 160-224` | 5.3 |
| WDT-16 | low | Online state with three ordered sources | `online.ts:12-28`; `session.tsx:228-236` | 5.1 |
| WDT-17 | low (corrected) | `sync-store.ts` six responsibilities | `sync-store.ts` | 5.3 |
| WDT-18 | medium (corrected) | No hooks lint; ~25 render-time ref writes | `eslint.config.js:1-3` | 1.8 |
| WDT-V1 | medium | Closing the dialog does not cancel preview or audit | `use-audit.ts:56-84` | 0.2 |
| WDT-V2 | low | Thumbs and eviction scan every cycle | `engine.ts:614-615`; `file-store.ts:84-95, 193` | 3.3 |
| WDT-V3 | low | Test-only `untilStored` should be production `waitForRow` | `db/until-stored.ts:16-40` | 3.1 |
| DOM-1 | medium | Row geometry ×6 | `apply.ts:234-246` etc. | 1.3 |
| DOM-2 | medium (corrected) | 10-file runtime SCC | `tree.ts:15`; `pre-issue.ts:31` | 1.2 |
| DOM-3 | medium | Two snapshot selections | `snapshot.ts:108-176, 250-296` | 1.3 |
| DOM-4 | medium | Three sheet-cell walkers | `snapshot.ts:74-85` | 1.3 |
| DOM-5 | medium (corrected) | `preIssue` 195 lines | `pre-issue.ts:246-440` | 6.1 / E10 |
| DOM-6 | low | Two pre-issue check shapes; `action` dropped | `checks/pre-issue.ts:14-33` | E10 |
| DOM-7 | medium | `evaluateTable` five concerns | `reading-evaluation.ts:96-214` | 1.4 |
| DOM-8 | medium | `BlockRow.config` untyped; 7-9 readers | `entities.ts:433` | 1.4 |
| DOM-9 | low | `schemas/` upward edges | `entities.ts:4-9` | 1.2 |
| DOM-10 | low | 8 `definitionOf`, 16 try/catch (K-20) | `seed/definitions.ts:113` | 1.4 |
| DOM-11 | low | `conflictValueText` sniffs paths; words ×3 | `merge/conflicts.ts:484-506` | 1.4 |
| DOM-12 | low (corrected) | Families declared twice; drift guarded | `ops/path.ts:81-301` | no action |
| DOM-13 | low (corrected) | Comparators, groupBy, memos | `home/cards.ts:203-269` | 1.4 |
| DOM-14 | low | Six Intl formatters | `format/datetime.ts` | 1.4 |
| DOM-15 | low (corrected) | 114-line barrel; keep path builders | `index.ts` | 6.1 |
| DOM-16 | low | Purity and cycles by convention | `eslint.config.js:46-59` | 1.2 |
| DOM-17 | low | Sections 9 and 10 bypass the registry | `print/layout.ts:83-87, 216, 225` | 1.4 |
| DOM-18 | low | `relatorio/` 38 files; "reading" ambiguous | folder | 6.1 |
| DOM-19 | low | Two subtree definitions (latent) | `pre-issue.ts:359`; `progress.ts:77-100` | decide |
| DOM-20 | low | ~24 local row factories in tests | `test-support.ts` | 1.7 |
| DOM-V1 | medium | ~25 hand-built paths; 10 families without builders | `instantiate.ts:197-283`; api sites | 1.6 |
| DOM-V2 | low | Seed clones are data; no change | `seed/v1.ts` | none |
| API-1 | medium | AWS classification diverged | `textract.ts:50-62` | QW2 |
| API-2 | medium (corrected) | Worker harness copies (generate+audit) | `audit/worker.ts`; `generate/worker.ts:43-109` | C3 |
| API-3 | medium | Audit depends on reading providers; 2 Bedrock clients | `audit/provider.ts:6-7`; `main.ts:66, 86` | C4 |
| API-4 | medium | Route helpers copied; unguarded compensation | `generate.ts:232-274`; `audit.ts:87-153` | 3.4 |
| API-5 | low (corrected) | Sentinel exceptions in guarded batches | 11 `before` hooks | 6.4 |
| API-6 | medium | `apply.ts` five concerns (R10-12) | `apply.ts:77-726` | 5.2 |
| API-7 | medium | ~20 lookups bypass repositories | `kinds/shared.ts:22-29`; `reading/worker.ts:199-205` | 3.4 |
| API-8 | low | `createApp` threads deps 5× | `app.ts:186-241` | 6.4 |
| API-9 | low | `job_id` three meanings | `reading/job.ts:163`; `generate/job.ts:212` | C3 |
| API-10 | low | Two process runners; unbounded stderr | `libreoffice.ts:96-156`; `pdf-raster.ts:62-120` | 6.4 |
| API-11 | low | Upload PUT 127-line closure | `files.ts:173-299` | 6.4 |
| API-12 | low | Reading failure block | `reading/job.ts:268-321` | 6.4 |
| API-13 | medium | Integration harness ×23 | `points.integration.test.ts:37-101` | 3.T |
| API-14 | low (corrected) | `display.py` imports private names | `display.py:24` | 6.5 |
| API-15 | low | No Python lint or types | `pyproject.toml` | 6.5 |
| API-16 | low (corrected) | No fake-model test of coordinate mapping | `conftest.py:31-34` | 6.5 |
| API-17 | low (corrected) | No contrast step on plates (experiment) | `pipeline.py:242-293` | 6.5 |
| API-18 | low | `seed.ts` mixes provisioning and test reset | `seed.ts` | 6.4 |
| API-V1 | low | Audit invalid payload misses `finished_at` | `audit/worker.ts:56` | 0.4 |
| API-V2 | low | Denied model recorded as `invalid_output` | `audit/job.ts:53-58` | 3.6 |
| TST-1 | high (corrected counts) | Seed-and-open re-implemented; 94 tree-walk calls | `photos.ts:26-58`; `reading-ops.ts:232-262` | 2.T |
| TST-2 | medium (corrected) | Racy inline sync in three serial specs | `journey-taps.spec.ts:155-162` | 0.7 |
| TST-3 | medium | Serial group per file | `groups.ts:11-110` | 2.T |
| TST-4 | medium (corrected) | No `makeSession`/`freshDatabase` | 34/37 files | 1.7 |
| TST-5 | medium | No api harness | 47 integration files | 3.T |
| TST-6 | medium (corrected) | Op builders not shared | `test-support.ts:36-58` | 1.7 |
| TST-7 | medium | 24 fixed sleeps; unbounded zoom loop | `ficha.spec.ts:250, 967`; `camera-capture.spec.ts:195` | 2.T |
| TST-8 | medium | Story gate has no command | `package.json:9-21`; `verify.ts:33` | 2.T |
| TST-9 | low (corrected) | Module state via beforeEach | 49 files | 2.T |
| TST-10 | medium (corrected) | Tap counting variants | `tap-budget.spec.ts:55` | 14.9 |
| TST-11 | low | Leaf helper copies | specs | 2.T |
| TST-12 | medium | Real 10 s waits in @p0 | `reading-wait.spec.ts:121-127` | 1.9 |
| TST-13 | medium (corrected) | Harness clones (behavior change if `loadIndependentWaits`) | tree/composer tests | 1.7 |
| TST-14 | medium (corrected) | No @p0 tiering rule | 223 @p0 titles | 2.T |
| TST-V1 | high | No `forbidOnly` | `playwright.config.ts` | 0.6 |
| TST-V2 | medium | Duplicate test ids | `ficha.spec.ts:840, 916` | 0.6 |
| XC-1 | medium | `pt-br.ts` grown by appending | `pt-br.ts:2, 12, 1550` | 1.1 |
| XC-2 | low | Chrome words repeated | `pt-br.ts` | 1.1 |
| XC-3 | low | Dead keys, stale comments | `pt-br.ts:961-962, 1373` | 1.1 |
| XC-4 | low | Plural split across homes | `pre-issue.ts:486`; `pt-br.ts:154, 491` | QW31 |
| XC-5 | medium (corrected counts) | Envelopes hand-built | as A1 | 1.6 |
| XC-6 | medium (corrected) | Registry lifecycle; four re-seed strategies | as A2/A3 | 2.1, 2.2 |
| XC-7 | medium (corrected) | Barrier ×3 web, ×2 api | `use-preview.ts:84-124` | 3.1 |
| XC-8 | low | Not-found ×6 | surfaces | 0.5 |
| XC-9 | low | 65 live-query copies | `db/live.ts` | 2.5 |
| XC-10 | medium | Surfaces as hidden libraries | `input/use-rich-text-area.ts:25` | 4.2, 1.P |
| XC-11 | low | Three slot contexts | state | D7 |
| XC-12 | medium (corrected) | CSS two homes | `app-css.test.ts:93-112` | 6.2 |
| XC-13 | low | Identical tablet-landscape and desktop rules | `app.css:361-431` | 6.2 |
| XC-14 | low | Routes hand-built | `generate-action.tsx:58`; `setup-surface.tsx:164` | 6.3 |
| XC-15 | low | Comments narrate history | web source | on touch |
| XC-16 | low (corrected) | Naming conventions; barrel numbers reversed | components | on touch |
| XC-V1 | medium | Ledger-310 fix missing in three panels | `client-panel.tsx:191` | 2.1 |
| XC-V2 | medium | Preview and audit run with dead ops | `use-generate.ts:366-369` vs preview/audit | QW25 |

## 9. Already decided or out of scope

| Item | Decision | Ref |
|---|---|---|
| QR asset lookup | Not taken: copy chips cover it; no printed labels | `epics.md:506`; review 10-06 §3 |
| Photo markup | Not taken | same |
| Gallery lock / camera-only | Not taken: import after the visit is first-class | same; `source-deltas.md:15` |
| LLM writing conclusion, parecer summary, context captions | Forbidden (NFR-12); amended only for the audit, which points and never writes | `epics.md:145, 2945`; `SPEC.md:90, 130` |
| AI verdicts, Reprovado from a value, vision NC rows | Out; NC-row vision revisited after the first real job | `SPEC.md:167`; `EXPERIENCE.md:628` |
| Paper digitizer | Rejected | `SPEC.md:161` |
| Readings: typing primary; "Ler visor" an assist that never overwrites | Decided 2026-09-21 | `source-deltas.md:16` |
| Dictation offline | Online-only, hidden offline | `source-deltas.md:37`; `SPEC.md:183` |
| Dictation default on | Only behind the 13.9 consent gate | `epics.md:2963-2969` |
| On-device AI | None: every reading in the backend | `SPEC.md:139`; AD-14 |
| Photos with people | Never sent to vision | `source-deltas.md:31` |
| Vision captions | Only for photos with no block, caption or people mark | `prose.ts:77-96`; FR-39 |
| Consent for photos to AI | None in the POC; purge must stay possible | `source-deltas.md:41`; `SPEC.md:155` |
| Emission audit | Optional, one tap, never automatic, never writes; no daily cap (Q-7) | `epics.md:2931-2961` |
| Plate tile on cables | No (no nameplate) | 13.7 narrowing |
| Field conditions | Helmet, insulating gloves, lit area, stylus; dark cubicle is the binding risk | `source-deltas.md:47` |
| Insulation timings | 1 minuto only | `EXPERIENCE.md` |
| Priority, deadline, action plan | Data model only in MVP; NR-10 10.7.11 before 2027-06-01 | `source-deltas.md:29`; `SPEC.md:169` |
| Encode cap | 2560 px / 0.85 until measured | `epics.md:2777` |
| Models | Plates Haiku 4.5 + Nova Pro escalation; panels Qwen3 VL 235B; model as configuration | `source-deltas.md:67-70` |
| Viewer gestures | No swipe navigation; every gesture has a stylus path | 13.2/13.3 AC |
| Cost and providers | Under USD 100/month; providers default `fake` | AGENTS.md; `source-deltas.md:58` |
| Cross-visit reads | `last_nameplate` only; no comparison or history screen | FR-34 `epics.md:74`; `prd.md:487`; AD-25; `SPEC.md:166` |
| Report delivery | A file through the share sheet, never a URL | E11-Q1, PR #79 |
| Generation | Server only (FR-62) | `epics.md:115` |
| Install and `persist()` | No install, no Background Sync, no `persist()` (G1-3 proposes amending `persist()`) | `epics.md:104, 142, 758`; AD-8 |
| Digital signature, ART integration | Out | `brief.md:108`; FR-69 |
| Infra | Terraform only in `infra/`; containers for CLI | AGENTS.md 2026-09-29 |
| Story gate | Touched specs per story; full @p0 per wave | AGENTS.md 2026-10-08 (E11-A1) |

Planned but not built:

| Item | State | Ref |
|---|---|---|
| Dictation behind consent (13.9) | backlog, DoR open | `sprint-status.yaml:164, 921` |
| Camera split and gesture core | open | E13-A6 (`sprint-status.yaml:903`) |
| Plate + display dual read on tablet photos | open | E9-A6 (`sprint-status.yaml:741`) |
| Dot-matrix LCD split (micro-ohmmeter) | named, unowned | `display-reading-spike.md:94-96` |
| `bedrock-eval` on real nameplates | open | `deferred-work.md:1278` |
| Encode cap re-measure | owed | `epics.md:2777`; R13-14 |
| Opening state on three openers | open | `deferred-work.md:1335` |
| Transformer TAP rows | open, owner a finished epic | `deferred-work.md:670` |
| Feeder-cable pairing | open, no owner | `deferred-work.md:875` |
| Não ensaiado photos in print | open, no owner | `deferred-work.md:887` |
| Fotos da ficha strip details | open | `deferred-work.md:1353` |
| "Revisar em sequência" | post-MVP, revisit after Bruno's review | `EXPERIENCE.md:617` |
| Office palette toggles in a sheet | open | `deferred-work.md:633` |
| Outbox and remote_ops retention | re-owned to Matheus | `deferred-work.md:123, 153, 207` |
| Remaining banner kinds | partly closed | `deferred-work.md:189` |
| Shared tile source per sheet | open | `deferred-work.md:1341` |
| Engine and `apply.ts` split | R10-12, no owner | `deferred-work.md:127, 157, 211, 1173` |
| Kernel definition accessor, calendar parse dup, dead exports | K-20, K-13, K-19 (batch rfr) | `deferred-work.md:1254, 1267` |
| Billed-failure usage | open, coordinator | `deferred-work.md:1285-1296` |
| Audit invalid-payload test | open | `deferred-work.md:1399` |
| `--workers=2` measurement | open | `deferred-work.md` (a8022cd) |

## 10. Open questions for Matheus and Bruno

| Who | Question | Unblocks |
|---|---|---|
| Matheus | Does "Concluir ficha" confirm the composed conclusion text (amending 5.8's "not printable"), or does pre-issue get "Confirmar N textos"? | 14.3 |
| Matheus | A confirmed or edited text gone stale: print, block emission, or warn by TAG? | 14.3 |
| Matheus | Instrument fallback from setup ticks (D-4 amendment)? | 14.6 |
| Matheus | Move ART/TRT to `preIssue` (AD-22), or only mark the Rascunho current on Home? | 14.21 |
| Matheus | Torch remembered per cabine in memory (narrows 13.2)? | 14.14, QW19 |
| Matheus | Is the review walk the first slice of "Revisar em sequência"? | 14.15 |
| Matheus | Allow `plate` over a done `caption` on an explicit tap (paid), and what reread cap? | 14.17, L6 |
| Matheus | Confirm the 2026-10-05 apply (AI on, Textract) and accept documenting it in tracked files; close E11-A2 | 14.8 (replaces "is AI on?") |
| Matheus | Platform line after 14.1: does iPadOS Safari stay supported? "Câmera do sistema" if no torch? | 14.10, 14.12 |
| Matheus | Recommend Add to Home Screen on iPad (reverses web-only)? Call `persist()` on coarse-pointer devices (FR-54 amendment)? A managed iPad with tracking prevention off? | 14.29, PLN-1 |
| Matheus | Make the contract-outdated state a non-blocking banner (AD-13/AR-12 amendment) and skip unknown families on pull? | 14.28 |
| Matheus | Adopt the release train for MIN-raising deploys until then? | QW28 |
| Matheus | Stay on t3a.medium with a display detector change and a hard ocr memory limit, or move to t3a.large and accept ~USD 23 AI headroom? | 14.8, 14.23 |
| Matheus | 13.9 consent wording (option b), and which privacy rule applies to audio? | 14.27 |
| Matheus | One definition of "fichas concluídas" (progress rule, `EXPERIENCE.md:337`, or parecer rule)? | PLN-6 |
| Matheus | AD-14 amendment to read the original variant if 14.1 shows an OCR gain? | 14.22 |
| Matheus | FR-34/AD-25 cross-visit projection for cabine SE, local, instruments, plus bulk copy and serial rebind? | L1 |
| Matheus | FR-36 LLM second reader for displays if E9-A6 shows a gain? | L3 |
| Matheus | Pair feeder cables at instantiation? | 14.26 |
| Matheus | Panel photo on two devices: own-only, or claimed on confirm? | 14.33, L10 |
| Matheus | Merge rule for `location/se` and `location/env`; is an open contradiction blocking at Emitir (E10-A6)? | 14.33, 14.16 |
| Matheus | Thumbnail in `.cam-link` instead of the mock's "Adicionar fotos"? | 14.12 |
| Matheus | Does `SPEC.md:166` still exclude any "differs from last visit" line? | L1, L14 |
| Matheus | NFR-7 numbers (e.g. PDF ≤ 20 MB at parity, ≤ 3 min on t3a.medium, ≤ 2 GiB api)? Print photos at ~250 dpi (AD-7 role)? | 14.31, 14.32 |
| Matheus | Keep `heic-to` in the precache (offline HEIC import) or fetch on first use? | 14.34 |
| Matheus | CSS convention amendment (two homes); @p0 tiering rule and ceiling; comment convention | 6.2, 2.T |
| Matheus | Megôhmetro range source for "Ler visor" units; print-only 30 s/10 min; thermo-hygrometer in pre-issue; humidity threshold for the rain chip; service-worker pin per user; LGPD basis for photos to AI; meaning of "N aguardando envio" on an office device | plans lens (c) rows |
| Bruno | Which tablet does he carry (iPad or Android model)? | platform line, torch fallback |
| Bruno | Walk a cabine shooting every plate first, or go sheet by sheet? Are plates reachable without opening the cubicle? | 14.14 |
| Bruno | Insulation readings: one at a time minutes apart, or from a stored-results screen? | L2 |
| Bruno | Which plate fields are really printed on MV equipment (TAP ATUAL, AJ. BOBINA, AJ. RELÉ, IDENTIFICAÇÃO)? Is "VÁCUO" missing from MEIO DE EXTINÇÃO? | 14.22, seed fix |
| Bruno | Installed power: sum of transformer ratings, or excluding reserves? How to record "380/220"? | 14.16, 14.7 |
| Bruno | Wording of per-NC-phrase action chips; split of the four recurring chips; retire "Chuva e umidade" from section 8 | 14.18 |
| Bruno | Is "Placa de identificação do disjuntor DJ-C03 da Coluna 3" the right caption? | 14.16 |
| Bruno | Per-item recommendation phrasing for restricted sheets (OQ-3) | L9 |
| Bruno | Under a visor and glare, do "Sugerido" and "Verificar" read as two levels? One amber for Sugerido and out-of-limit acceptable? | 14.24, FLD-3 |
| Bruno | Cross-sheet outlier factor; trend thresholds if L14 opens | 14.19, L14 |
| Bruno | Should display-reading shots print? Plate shots in section 9 only, or not at all? | 14.31 |
| Bruno | SM-4: does the generated DOCX/PDF with real photos read as his own FO.SERV-03? | 14.2, closes E4-A6 |
| Bruno | How often does a job have two people, and do they split by cubicle or by role (photos vs sheets)? | L17, 14.33 priority |
| Bruno | How often do jobs run at night (00:00-05:00) or through a weekend shutdown? | night stop (G3-4) |
| Bruno | Field Control and Produttivo: which, when, for which reports; what stayed in Word and why; did the client sign on site; did he send anything before leaving; did offline or photo sync fail; why did he stop; what does he miss? | G8-1, G8-4 |

## 11. Verification notes

### 11.1 Findings dropped, refuted or corrected

No lens finding was dropped. These claims were refuted or corrected, and the corrected version is used throughout:

- **MKT-1:** Mesh Ensaia is pre-launch and Android only, and DOCX is unconfirmed on its page. Plate OCR ships in generic platforms. Severity medium.
- **G8-5 refuted by the editor:** `field-elo.html` lists "Validador de OS", "Resumo Automático", "Score de Formulários" and "Reescrita de Formulários"; the Produttivo blog quotes the review pass. Only URLs were missing from the 10-06 review.
- **JRN-1:** setup carry overstated. Escopo has no field, exclusions are pre-filled, altitude is suggested. Medium; seed note at `seed/v1.ts:649`.
- **JRN-3:** D-5 makes the line editable from any sheet; installed power is not always a sum.
- **JRN-4:** a re-open resumes at the first row without a photo; it does not restart.
- **JRN-5:** the confirm cost is ~2 taps per plated sheet + 1 between, not 4.
- **JRN-12:** saving is 1 tap, on the post-setup landing only.
- **JRN-14:** a recorded deferral (`deferred-work.md:765-769`).
- **JRN-15:** dropping "Substituir" lines is unsafe; relabel only.
- **CAPT-1:** only three openers are single-shot; a dark frame yields "done" with zero rows (CAPT-V1).
- **CAPT-3:** the proposed guard misses gallery and NC photos.
- **CAPT-4:** the sticky bar and NC row still offer the picker.
- **CAPT-5:** delivered FR-38 AC; MV plate placement is an unverified assumption.
- **CAPT-9:** burst frame grabs are the 13.1 AC's scope.
- **CAPT-12:** 5 denied blocks, not 7; 50-70 lines.
- **CAPT-13:** 10-15 lines. **CAPT-14:** 25-30 lines.
- **CAPT-17:** evidence miscited; the copy already carries per-unit fields.
- **CAPT-18:** the tablet rules apply in landscape; overflow is more likely.
- **AIR-3:** line grouping needs no contract bump; IDENTIFICAÇÃO is not printed either.
- **AIR-4:** AD-14 binds; Claude downsizes above ~1568 px, so the gain is on the OCR leg.
- **AIR-5:** 40% is a pessimistic lower bound; volume per G3 is 659 measured.
- **AIR-8:** keep `normalizeRegistryName` strict (server merge); logo-only needs an AD-14 amendment.
- **AIR-9:** the hint's `create_registry_entry` must become optional.
- **AIR-10:** pg-boss v12 option names unverified; dropping `confidence` saves ~100 tokens.
- **AIR-11:** FR-42 sizing; ~USD 1.2-1.6.
- **AIR-13:** "Copiar da cabine anterior" copies env only; the delivered job has a cabine without a transformer and a "380/220" BT.
- **AIR-18:** 30-40 lines; escalation extraction speculative. **AIR-19:** 60-80 lines.
- **AIB-3:** section 7 is sent before section 9.
- **AIB-6:** seed atividades do not cover general views; the location field is a contract change.
- **AIB-7:** medium.
- **AIB-8:** no TAG in the seed.
- **AIB-9:** effort L.
- **AIB-10:** cross-reference outside the basis.
- **AIB-12:** an item photo cannot predate the NC mark.
- **AIB-13:** excluded by `prd.md:487`.
- **AIB-16:** 15-25 lines.
- **FLD-2:** suggestion fields and the textarea are already ringed; ring ratio 6.97:1.
- **FLD-3:** an outlier is not a Sugerido look-alike.
- **FLD-4:** the sunlight framing was withdrawn; low.
- **FLD-5:** 3 taps + scroll on Android.
- **FLD-15:** the example is wrong (sign-out keeps the work).
- **FLD-16:** fires at 500 MB, an early warning; superseded by G1-1.
- **MKT-3:** E9-A6 already plans the dual read.
- **MKT-5:** sheet photos get no reading.
- **MKT-6:** grounded candidates only.
- **MKT-8:** the "differs" hint conflicts with `SPEC.md:166`.
- **MKT-11:** the budget deny action exists.
- **PLN-2:** 0/4 is a lower bound.
- **PLN-3:** "authored" does not mean pending Bruno; 29 owner hits.
- **PLN-4:** the conclusion already names readings and NC items; medium.
- **PLN-5:** audio to the vendor is not like-for-like with photos to the project's AWS.
- **PLN-6:** deliberate `EXPERIENCE.md:337` rule.
- **PLN-10:** the picker offers the system camera for general photos.
- **PLN-14:** off would hide the entry points; now superseded by G3-1.
- **Code lens corrections:**
  - WEB-1 medium; the race is narrow.
  - WEB-2: 16 sites.
  - WEB-5 medium; `useIssueConfirmation` is a taken name.
  - WEB-8: negligible field impact.
  - WEB-9: the F-25 origin is the 2026-09-30 review.
  - WEB-13: impact near nil.
  - WEB-14: reason logic already shared.
  - WEB-15: both counts are kernel functions.
  - WDT-3: drop `bannerSlot` and `arrivalStep`.
  - WDT-7: six sites.
  - WDT-13: no glove argument.
  - WDT-17: the name collision is not a hazard.
  - WDT-18: ~25 render-time writes.
  - DOM-2: 10-file SCC, 10 mutual folder pairs.
  - DOM-5: a lighter refactor.
  - DOM-12: drift overstated.
  - DOM-13: `memoized` not general.
  - DOM-14: six formatters.
  - DOM-15: keep the builders.
  - API-2: generation_job has no `finished_at`; reading excluded.
  - API-5: narrower scope.
  - API-14: minimal fix.
  - API-16: geometry already tested.
  - API-17: production unaffected.
  - TST-1: 94 calls in 22 files.
  - TST-2: medium.
  - TST-4: Vitest isolates files, so no collision risk.
  - TST-6: use the `*.test-support.ts` convention.
  - TST-9: no concurrency risk.
  - TST-10: one counter is a plain copy.
  - TST-13: `loadIndependentWaits` changes behavior.
  - TST-14: the ratio comparison is invalid.
  - XC-5: counts and casts.
  - XC-6: four re-seed strategies.
  - XC-7: dead uploads are handled the same; dead ops differ.
  - XC-12: the two homes follow `app-css.test.ts`.
  - XC-16: barrel numbers reversed.
- **Gap-round corrections to syntheses:** table in §1.4.

### 11.2 Claims that could not be verified (confidence lowered)

- **Device behaviors:**
  - torch and zoom capabilities on the target iPad;
  - `capture=environment` with the site permission denied;
  - Android Chrome's visual-viewport keyboard behavior;
  - landscape camera overflow;
  - NC expansion shifting rows (G4-10);
  - lock and unlock stream loss on iPadOS;
  - stylus slop values.
- **Storage:** Chrome's `persist()` grant for this origin; Home Screen web app camera, torch and downloads on iPadOS 26 (G1).
- **Production state:** the AI-on apply of 2026-10-05; no AWS access in this session (G3-1).
- **Server timing and sizing:** sidecar seconds per display read and peak memory on the production CPU (G3-5); the document's size, pages, generation time and memory with photo bytes (G5, all estimates).
- **Libraries and models:** pg-boss v12 option names (AIR-10); Bedrock-side image downscale for Haiku 4.5; pt-BR availability of `processLocally` (G4-7).
- **Competitors:** offline behavior; conditional logic in form builders; Capterra and GetApp reviews (403).
- **Reasoned, not reproduced:** WEB-1's echo race, WEB-V2's gallery focus timing, WDT-14's slot overlap, DOM-19's nested coluna, G7-6's concurrent "Aplicar", PLN-V3's double confirm.
- **Estimates throughout:** tap counts (code paths) and line savings (lens estimates).

### 11.3 Device-verification debt

| Item | Owed evidence | Status | Field claim left unverified |
|---|---|---|---|
| E1-A1 (`sprint-status.yaml:168`) | Offline proof on iPad and Android; platform line; storage threshold | open since 2026-09-22, "blocking before Epics 5 and 6" | Offline survival on iPad; storage threshold; iPad support itself |
| E6-A5 (`:595`) | Burst and import on a tablet; iPad photo durability; soft keyboard | open | No photo lost on iPad (WebKit cannot store a Blob in Playwright) |
| E8-A7 (`:699`) | Plate flow offline then on signal, toast, Confirmar todos | open | The photo-first nameplate end to end |
| E8-A8 / E9-A6 (`:705, :741`) | Real tablet photos of four displays; ≥ 8/15 | open | "Ler visor" usefulness |
| E9-A10 (`:765`) | Ler visor, dictation, Fotografar equipamento in field conditions | open | Panel-to-block and dictation |
| E10-A7 (`:807`) | Two-tablet merge, contradiction, removed vs edited | open | Two-engineer jobs (G7 scenarios added) |
| E11-A7 (`:849`) | iPadOS and Android DOCX/PDF share | open | Sending the document from the tablet (now also size, G5) |
| E12-A3 (`:519`) | Keyboard after Outro/Criar; lost-tap paths on a tablet | open | 12.1 lost-tap fix on real touch |
| E13-A3 (`:885`) | Capture size per path; torch/zoom/focus in a dark cubicle; iPad pinch; iOS decimal pad; 13.3/13.6 WebKit legs | open; 13.1/13.2 DoD unmet (R13-13) | Every Epic 13 capture claim, including the only lighting mitigation |
| `deferred-work.md:231, 237, 243, 1378` | WebKit offline cold open, Secure-cookie sign-in, SW interception, zoom on WebKit | open (tooling limits) | iPad has no automated proxy for photos or the service worker |
| G1-4 (new) | Steps 5a-5c, OS free space, Android `persisted()` | not written | Eviction of unsent work; Home Screen mitigation |
| G2 (new) | 426 with backlog > 0, = 0, camera open, weak signal | not written | Field continuity across a contract bump |
| G3-5 / G3-2 (new) | Seconds per display read, ocr peak memory, CPU credit balance | not written | Capacity on t3a.medium |
| G4-6 / G4-10 (new) | Relaunch on weak signal; NC expansion under a follow-up tap | not written | Cold start; checklist stability |
| G5-3 (new) | Generation on the production host with photo bytes | not written | Emission at real size |

Until one device session runs, every capture and reading recommendation in this report should be read as "likely". The outcome may also change the supported-platform line, which would re-scope several stories.

## 12. Manual browser pass

Driven by the main session in its own browser context (768x1024, touch emulation, isMobile, pt-BR), company "Revisão Humana" on the fasor-review stack (worktree at e0efac7, same app code as a8b9b0e), fake OCR/LLM providers, camera replaced by a 2560x1920 canvas stub. Screenshots in this folder, numbered by step.

### Journey measured

| Step | Taps | Keys | Wait | Notes |
|---|---|---|---|---|
| Login | 3 | 38 | 4 s | session kept |
| Novo relatório, create client and site inline, Continuar | 6 | 29 | - | client and site created from the combobox ("Criar ...") |
| Tipo e datas, Criar relatório | 1 | 0 | 2.6 s | template preselected, dates default to today |
| Setup: ART, altitude 760 without its Confirmar, 3 instruments, Concluir | 6 | 20 | - | requirements revealed one at a time (ART, then instrument) |
| Sumário to TR-7 (expand cabine, open row) | 2 | 0 | - | rows carry drag handles and position numbers |
| Plate: Fotografar placa, (torch), Disparar | 2-3 | 0 | ~2 s to suggestions (fake) | camera closes after one plate shot |
| Confirmar todos (9), Criar Celtta, confirm TAP (Verificar) | 3 | 0 | - | 11 of 12 plate fields |
| Checklist: Marcar os restantes como Conforme | 1 | 0 | - | 15 items, toast with Desfazer |
| Ensaios tab, Ler visor, 3 shots, Concluir, Confirmar todos (3) | 7 | 0 | ~2 s (fake) | camera sequences cells and advances to the next test |
| Instrument for insulation test (open, pick) | 2 | 0 | - | megger listed first (F-27 fixed) but not preselected |
| TTR: tap first cell, three ratios with Enter | 1 | 14 | - | judged SATISFATÓRIO automatically |
| Instrument for TTR (open, pick) | 2 | 0 | - | |
| Conclusão tab, confirm verdict, confirm text | 3 | 0 | - | deterministic text with criteria listed |
| TR-7 total (plate photo to conclusion) | about 24 | 14 | - | 1 field left: Vol. óleo (see H-4); cabine block (4 fields) and environment (2) untouched |

### Findings

- H-1 (medium) Setup completion reveals one missing requirement at a time: "Concluir dados do relatório: falta o número da ART", then after the ART "falta um instrumento". List every missing item at once, and let the engineer go to the field before the office data (ART) is complete. Screens 09, 11.
- H-2 (low) After creating a 94-block relatório the badge read "223 pendentes" for about 90 s before the first push (one POST then drained). Push right after a large local batch so the engineer does not see hundreds of pending items at the start of a visit.
- H-3 (medium) "Fotografar placa" sits at y about 1180 px of a 5350 px ficha (768x1024), below 8 typed cabine and environment fields. For a photo-first flow the plate tile (or the camera) should be the first thing on a new ficha. Screens 15, 16.
- H-4 (high, domain question for Bruno) "Vol. óleo" is always required on the transformer ficha, has no "não se aplica", and "Tipo de isolação" only offers EPÓXI and Á SECO (`packages/domain/src/seed/v1.ts:41-43,96`). A dry transformer can never be concluded without a fabricated value; "Concluir ficha" goes to the field ("Faltam obrigatórios — indo para o primeiro campo faltando") and stops there. The oil checklist items (válvula de alívio, elemento secante, indicador de nível de óleo) also stay on dry units. Needs field applicability (NA per field, or rules by insulation type). Screens 35, 37.
- H-5 (medium) The cabine characteristics (tensão primária, tensão secundária, potência instalada) stay empty although the plate reading carries 15 kV, 380 V and 500 kVA. Offer them as suggestions from the confirmed plate (first transformer of the cabine). Screen 34.
- H-6 (medium) Instruments are not inferred: setup Etapa 4 ticked one instrument per test type, yet each test asks "Selecione o instrumento" (2 taps each). Preselect as a suggestion when exactly one ticked instrument fits; a display photo could also identify the instrument. Screen 29.
- H-7 (medium) Toasts cover content: "1 leitura pronta para confirmar · Ver / Fechar" stayed for more than 2 minutes over the Fabricação field; "15 itens marcados Conforme · Desfazer" sat over the TTR table. Screens 19, 20, 24.
- H-8 (low) The section tab "Placa 1" scrolls to the top of the section, not to the missing field, and the header says "falta 1 campo da placa" without naming it. (The menu item "Concluir ficha" does go to the field.)
- H-9 (low) With a field missing the primary button stays "Próxima coluna"; it moved from TR-7 (Cobertura A) to CE-CB (Cobertura B) and left TR-7 incomplete with no prompt. "Concluir ficha" lives only in the overflow menu.
- H-10 (medium) Touch targets at 390 px: 14 "Ver recorte" buttons are 24x24 px on a transformer ficha; reading cells are 144x29 px. Both are small for insulating gloves. No horizontal overflow at 390 px.
- H-11 (low) At 390 px the ficha header takes about 320 px (38% of the screen) before the first field, and the title breaks as "Transformador de força —" / "TR-7". Screen 39.
- H-12 (medium) Parecer "Apto" was accepted with 94 of 94 fichas not concluded; the app's own summary says so but nothing warns. Issue then asks "Emitir com 93 fichas vazias e 1 campo em branco?" (F-03 fixed in part) but the filled primary button is "Emitir mesmo assim". The AI check is optional and its fake fixture cannot show whether the real model would catch this. Screens 42-45.
- H-13 (low, a11y) The combobox live region announces the option count on every keystroke and says "2 opções disponível".
- H-14 (low, a11y) The three "Ler visor" buttons on a ficha share the same accessible name; reading inputs are labelled ", V primário" (empty row prefix).

### Verified as fixed or working

- F-02 fixed: the altitude typed without its Confirmar reached the ficha ("Do setup do relatório"). F-06 fixed: the App bar is sticky. F-10 fixed: the photo button is an icon square at 390 px. F-27 fixed: the fitting instrument is listed first. F-03 fixed in part (named-count confirmation). F-09 still present: "Nenhum fabricante cadastrado ainda".
- 13.2: torch 48x48 with aria-pressed, zoom 1,0x with steps; shutter 76x76. 13.4: inputmode=decimal and enterkeyhint next/done on reading cells. 13.8: the audit runs in about 5 s on the fake provider and lists points with "Ver".
- Strong flows: new relatório in 2 short dialogs with inline creation; plate reading with crops and "Confirmar todos"; Ler visor shooting the cells in order and advancing to the next test; one-tap checklist with undo; TTR computed and judged; deterministic conclusion with the criteria shown.

