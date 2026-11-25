# What is really still missing (2026-11-24)

Product "Conforme", production v0.14.0 (`de79700b`, seed v18, contract 59), Epics 1 to 29 delivered. This file merges six read-only audits and the three retrospectives of 2026-11-24 into one list. It changes nothing by itself: every close, decision and fix below waits for Matheus.

Source ids: `L<n>` is the `state:` line of a row in `deferred-work.md` as audited on main `e687b442`; `E<n>-A<m>` is an action item in `sprint-status.yaml` or in a retrospective; other ids (`Q-8`, `R-12 (E20)`, `14.5-R1`) are the row's own id. Client material is cited by path only.

## 1. In one page

| Count | Number |
|---|---|
| Records audited | 518: 444 ledger rows and 74 retrospective action items (plus 16 `development_status` keys) |
| No longer open (resolved, superseded, moot or duplicate) | 138: 111 ledger rows, 27 action items |
| Still open | 380 (333 ledger rows, 47 action items), plus 19 new action items (E26-A1..A9, E28-A1..A7, E29-A1..A3) = 399 |
| Distinct things after merging duplicates | 250: 18 to fix now, 46 smaller fixes, 56 decisions, 26 Bruno questions or lists, 1 device session (11 checks), 12 test and tooling items, 78 drop rows (151 records), 13 housekeeping items |

The things that matter most, in order:

1. **Rotate the exposed production password (E11-A4).** It has been open since 2026-09-30. "Alterar senha" (Story 29.1) makes it a one-minute job.
2. **Send Bruno one message (E28-A2, E29-A1, E23-A7, E17-A3).** About 45 rows wait on it. Five of its questions can change a printed verdict (section 4a).
3. **Run the first fix batch (section 2).** A relatório can stay "Em campo" after a generate, typed text can be lost in the setup fields, and a refused issue gives no reason. All three are small and confirmed in the code.
4. **Hold one real-device session (section 5).** About twenty records ask for it. Nobody has ever checked the product on an iPad or Android tablet.
5. **Decide Q-8.** Today, site answers written offline disappear without a word when another device removes the local. This is the only open data-loss path the audits found.
6. **Find the causes of the flaky tests (E28-A6).** About fourteen tests failed once under load and passed alone. Each one costs a rerun in every gate.
7. **Give the go for seed v19.** Bruno's answered "≥" and "± 5 %", the Malha conclusion sentence and the Malha helper are all printed text, and the layout locks on v13 to v18 block any change there.
8. **Approve section 7 in one sitting.** That closes 78 rows (151 records) the audits say to keep as built.

## 2. Fix now

Real defects or risks a user or the business can meet. An agent can build each one without anyone's answer. "Check" is this file's own spot check, read in the code at `e687b442`. Nothing was run.

| # | What | Where | Why it matters | Size | Source | Check |
|---|---|---|---|---|---|---|
| 1 | A generate answered `running` (a retry after a lost answer) writes no status op | `apps/web/src/surfaces/export/use-generate.ts:285` (only `queued` emits) | The relatório stays "Em campo" with a revision on record, and "Marcar como enviado" is not offered | S | L1696 | confirmed |
| 2 | A key typed while the earlier commit echoes back is overwritten | `apps/web/src/surfaces/relatorio/setup/setup-fields.ts:27-30` (`useTextField` resyncs on any stored change) | Lost keystrokes on a slow tablet. The date field next to it already has the guard | S | L3626 | confirmed |
| 3 | A 409 `pre_issue_blocked` shows as a generic failure | `use-generate.ts:313-314` reads only `not_caught_up`. No web code reads `pre_issue_blocked` (grep) | When the server sees a blocking row the device missed, the user gets no reason | S | L4150 | confirmed |
| 4 | The Malha conclusion ends with ", sem itens verificados registrados" | `packages/domain/src/relatorio/conclusion.ts:975`. The type has `checklist: null` (`seed/v13.ts:710`) | A wrong sentence in the signed document. Needs a seed v19 flag, because v13 to v18 are layout-locked | M | L4011-G8 | confirmed |
| 5 | Unknown op `meta` keys have no byte or count limit, only a depth limit | `packages/domain/src/ops/op.ts:76` (`z.looseObject`), `ops/value-limits.ts:366` | The server stores whatever the client sends, up to the size of the push body | S | R-12 (E20) | confirmed |
| 6 | Bedrock model ids in tfvars are not validated | `infra/production/variables.tf:57-60` only checks "non-empty". The panel, prose and escalation ids (`:63-79`) have no check | A typo makes the api crash-loop in production | S | L1296 | confirmed |
| 7 | Bedrock usage of failed or escalated calls is not recorded | `apps/api/src/jobs/reading/job.ts:185` reads usage only from a finished run. A failed escalation keeps only the first call's usage (`kinds/plate.ts:131-135`). An escalated run names one model but sums two calls (`:137-141`) | Cost tracking under the USD 100 ceiling misses billed calls | S | L1284, L1290, L1310 | confirmed |
| 8 | The deploy's usage-events check is still only a warning | `infra/bin/deploy:420,483` | What it waited for (events landing in production) happened on 2026-11-03. A broken telemetry release passes the smoke | S | L2743 | confirmed |
| 9 | A Home card of a relatório the device does not hold shows no date | `packages/domain/src/home/cards.ts:164-173` (`fromSummary` sets service dates to null) | Two cards of the same obra look the same. Needs a contract number (summary schema) | M | L4282 | confirmed |
| 10 | A long TAG pushes the phone Sumário sideways | `apps/web/src/surfaces/relatorio/relatorio.css:412-422` (`nowrap`, `min-width: min-content`, no ellipsis) | Horizontal scroll breaks the phone layout rule. It needs a TAG of roughly 25 characters or more | S | L1635 | confirmed by reading the CSS, not run |
| 11 | The site card's spoken name drops its "N de 19" counter, and the label is composed in `apps/web` | `relatorio-tree-rail.tsx:72`, `relatorio-tree-sumario.tsx:123` | Accessibility, and a breach of the rule that texts are built in the kernel | S | E15-R1 | confirmed |
| 12 | The palette drawer's target is not announced when it opens | `apps/web/src/surfaces/templates/block-palette.tsx:311-317` (`DialogShell` has no `aria-describedby`, `:104` is `aria-live` only) | A screen reader does not say where the block will go | S | E15-R2 | confirmed |
| 13 | "Abrindo câmera…" is missing on "Ler visor" and "Fotografar equipamento" | `surfaces/ficha/read-display.tsx:639-645,775-780`, `surfaces/relatorio/panel-capture.tsx:182` (no `CameraOpeningStatus`) | No feedback while the permission prompt opens. A second tap is already ignored (`camera-stream.ts:134`), so this is feedback only | S | L1335 | confirmed |
| 14 | "Ler visor" with every cell already read still opens the system picker | `surfaces/ficha/camera-session.tsx:162` (the guard runs only when `cameraApp` is on) | Reached only on the picker path (no camera API, or permission denied): a photo with no target | S | e17-R1 | confirmed, narrower than recorded |
| 15 | A re-issue after editing the service dates is not re-ordered among previous visits | `packages/domain/src/print/last-results.ts:200` (`order = 0` when the top is this relatório) | The "last results" can name the wrong visit as the latest | S | L3755, L3881 (its test) | confirmed |
| 16 | The playbook runs the `tools` container as root | `epic-batch-orchestrator.md:152` (`--user root`); `.vite-temp` came back under `apps/api` and `packages/domain` | Root-owned files in `node_modules` have stopped gates three times | S | tools-root, E26-A8 | confirmed |
| 17 | An escalated plate reading can keep a composed "Dd0 (diagram)" | `apps/api/src/jobs/reading/kinds/plate.ts:136-138` (keeps the better reading with no check on the diagram) | A wrong vector group is offered to the technician as a suggestion. It came back in the Epic 28 evaluation | S | R-5 (E21), R-7 (E21), L2971 | not checked beyond the lines named |
| 18 | TAG suggestions are still offered after their locals were removed | Cause not found by reading: `suggestTag` skips removed rows (`relatorio/tag.ts:179`), and a local's removal tombstones the equipment it frees (`relatorio/removal.ts:12-17`) | It offers TAGs that are no longer used | S-M | L4333, E28-A7 | not confirmed: reproduce first (pass report N3) |

Smaller fixes an agent can also build. Each is real but rarer or cheaper to live with. One line each, grouped:

- **Sync and network:** a hung push holds the cycle for about 18 min, and a JSON answer body is read with no timer (L4075, L4142, L3851). The badge says "Sincronizado" before the first cycle ends, and "sem conexão" after a 401 (L297, L1247: wording needs Matheus's yes). `files_pending` is shown nowhere (L357). An offline boot with another user's cookie still pulls into the pointer database (fxpw-ECH3). Every file GET runs a second removal query (R-5 (E20)).
- **Photos and camera:** saved photo names collide within one second (e17-R10). `useCameraApp` has a default window before its query lands (e17-R6). Two devices can confirm one panel photo twice (L1390). A reread that reads nothing shows "done" instead of "empty" (L1485). A reread of a removed relatório's photo is refused by the job before any paid call (`job.ts:209`), so the audit's "spends a paid reading" is wrong; what is left is a 202 and a failed run row (L2949).
- **Sheet and setup:** a half-typed observation can be learned (14.12-partial). The stepper keeps `select()` on blur (pr148). An unreadable voltage class stays as unsaved text (L1620). Conclude reads removed equipment for the TAG (L1510). The instrument panel can clear the manufacturer after "Criar" (L4052). A failed off-plate clear is swallowed with no toast (L3527). Undo of a removal at the table maximum fails with a generic toast (L4235). The client panel drops waiting fields when closed (L4295). "Criar" is offered next to an exact existing client name (L4011-G14).
- **Screens:** the "Não ensaiado" band gives no link to its point (L4011-G4). The QGBT header says "Leituras prontas" with no reading (L4011-G9). A comparison held back for a missing temperature says nothing (L4011-G10, wording to Bruno). The rename toast wraps to four lines at 390 px (L4011-G11). The obra page counts only the relatórios on the device (L4011-G13). The form dialog is not full-screen on phone (L1610). The CTA sub-blocks have no "what it holds" line (14.5-W4). "Subir" below equal order keys announces a move it did not make (L2993). "Anexar arquivo" is missing from the palette's result dialog, and the file input's `cancel` has no focus fallback (L3127, L3130). "Manter os digitados" and "Concluída · N sugestões" were never built (L1475). Page size has no optimistic state (R-10 (E19)). Telemetry: held events take the next user's session (L2819), and a 401 deletes the batch (e18fa-401, one line).
- **Kernel and fold (architect level):** a painel refusal can be bypassed by op order (L1776). Raw-row readers still count sheets under a removed location (L1812). The restore cut compares the device clock with the server clock (L1824). The fold accepts a foreign unit or option (14.5-R3). Three readers of the not-tested reason (L1253). Leftovers from rfp (L1266). Dead move-tag rename code (L3675). `filter: null` means opposite things in two functions (R-6 (E19)). Two group entries fail a whole reading (R-8 (E21)). The OCR date shape lacks a bare `YYYY` (L1373, at the next contract change). The fixture maps every non-cabine node to coluna (L1794). A stale mock frame still reads "tipo + coluna" (L3680).
- **Test-base update, before Bruno's next revision file arrives (E25-A5):** an older revision applied after a newer one restores old texts (L4158), and the update draft of a v12 copy fails the strict schema (L4168).

## 3. Decisions for Matheus

Grouped so one sitting can settle a theme. "Rec." is the audits' recommendation, with its reason.

### A. Security and accounts

| Ids | Question | Today | Rec. |
|---|---|---|---|
| E11-A4 | Rotate the production admin password exposed on 2026-09-30? Yes/no | Still the exposed one, and old ECS task revisions may still show it | Yes, now with "Alterar senha" |
| E26-A6 (S-2), BL1-R, fxrm-ui | The keys `suggestion.review` and `relatorio.delete` open nothing a user can see. Tie `relatorio.delete` to a "Remover relatório/obra" control, or keep both as seeded keys? | Removal is a server CLI only | Keep both as seeded keys for now; build "Remover" only if Bruno asks |
| L4262, E26-A6 (R-8) | "Último acesso": keep it from session rows (blank after sign-out), or add a `user` column? | Admin sees a blank for anyone who signed out | Add the column (M). It is the one Admin field that misleads |
| L4267, L4257, E26-A6 (R-8) | Add frame 92's invited, paused and removed dates? Name the invitee and the expiry on the set-password page? | Neither is built | Not now; recheck after the first month of real users |
| E26-A6 (S-5) | Confirm the coordinator readings of Stories 26.2, 26.4, 26.5, 26.6, 26.8, 26.9 and 26.10 as built? | Undated | Yes, one dated line each |
| L315 | Keep the service-worker shell pinned per device, or pin it per user? | Per device | Keep per device until a shared tablet is real |
| E18-A5 (items 1, 4) | Add an LGPD terms notice? Decide ECH-4? | Neither | Terms notice: yes, before more companies join. ECH-4: close as built |
| L4300 | Can a client be created with no name, from a field that is not the name? | Yes (an old test pins it) | No: refuse a nameless client |

### B. Offline and two-device safety

| Ids | Question | Today | Rec. |
|---|---|---|---|
| Q-8 | Site answers written offline on a local that another device removed: show them (a mark plus a restore offer), or accept that they are lost? | They vanish without a word | Show them (M). It is field data loss |
| E10-A6 | Should an open cell contradiction between two devices reach the pre-issue list? | The print picks one of the two values silently | Yes, as an info row (S, then M) |
| 14.3-O2 | Should a site C/NC against NA conflict show in the Conflict view? | Only an invisible mark | Yes, together with Q-8 |
| E25-A4, L4194, L4199 | Should an added row get a previous visit on the next relatório? Should removing an added row that another device filled raise a conflict? | No and no (the row is tombstoned and can be restored) | Previous visit: yes. Conflict: no, the restore covers it |
| E20-A2, L2837 | Undo of "Voltar para Em campo" is refused when the content changed. Keep that? Also the "relatório full" refusal, quotas and readings in the bundle | Refused, and the device says why | Keep as built |
| 14.5-R1, E14-A8 | Split `block/{id}/config` into one op per key, and give location liveness one accessor in the kernel? | A whole-config put can undo another device's edit | Yes, as one architect story (L) when the next CTA work starts |
| L1169 | Measure a 500-op push against the savepoint cache? | Never measured | Yes, one measurement |
| L153 | Prune `remote_ops` on the device? | It grows without limit | Not yet; revisit when a device reports storage trouble |

### C. Equipment identity and previous visit (one story)

| Ids | Question | Today | Rec. |
|---|---|---|---|
| L3660 | The reuse key names a place, so a sheet moved to another place misses its previous visit. Key by equipment identity (serial and type) instead? | History is lost when equipment moves | Yes: one story for the whole family below (L) |
| L3836 | Remove, add again, then restore: two equipment end up with one `reuse_key` | Possible | Fold into that story |
| L3841, E24-A5 | Should a company copy bind its base type's equipment (the family's previous visit)? | It never does | Yes, in the same story |
| L3856 | An entry dated by its issue day (before Story 24.15) beats a later re-test | It does | Order by service date, in the same story |
| L3929 | Like-with-like on v13 too? | v14 and later only | No, keep v13 as built |
| L3611 | Give the company copy of "cabos de saída" a role so it pairs with the transformer? | It never pairs | Yes, with L875 |
| L875 | Nothing writes `feeds_block_id`, so every cable prints unpaired, last in its group. Add a "feeds" picker? | Every printed relatório with cables | Yes (M). It affects every document with cables |

### D. Revisions and issuing

| Ids | Question | Today | Rec. |
|---|---|---|---|
| L549 | A registry or user edit after a revision (a corrected CNPJ) answers "unchanged". Let such an edit force a new revision? | A fix cannot reach a new revision | Yes (M, with the architect) |
| L4328, E28-A7 | Give the Gerar dialog a "Cancelar"? | Only the close control | Yes (S) |
| L4132 | "Fechar" on the launch-draft offer: discard the draft, or keep offering it? | It comes back at every launch | Discard on "Fechar" |
| L1500, L1515, L1530 | A stale edited conclusion still prints, and `conclusion_stale` is not named in the Export dialog | Story 25.7 blocks a stale confirmed text; an edited one prints | Name it in the dialog (one word). Keep the rest |
| L1067 | Count environment suggestions in the pre-issue list? | They are not counted | Yes (S) |
| L3550 | List an NC row that has no point before issuing? | Named nowhere | Yes, as an info row |
| L1490 | Add a `parecer_stale` pre-issue row? | None | Only if Bruno meets it |
| L1495 | Should "Concluir ficha" write the D-7 observation? | It does not | No, keep as built |

### E. Home and navigation

| Ids | Question | Today | Rec. |
|---|---|---|---|
| E19-A1, R-4 (E19) | What does "most recent" mean on Home? Today field work never moves a card, and a relatório removed on the server sorts as newest until its tombstone arrives | Sorted by the summary's `updated_seq` | Sort by the last local or server change. Then the R-4 fix is S |
| R-13 (E19) | Show the page-size chips above long lists too? | Only below | Yes (S) |
| E28-A1 (reading 7), E29-A3, L4338 | The in-app "Voltar" from a ficha now steps back in history. Keep it? Give a first-page Sumário its own key so a back restores its view? | Built in #377; the gap is open | Keep "Voltar". Fix the key (S) |
| 15.4-arvore, L627 | Delete the dead route `/relatorio/:id/arvore`? | Nothing links to it | Yes |
| R15-13 | Show an NC mark on a collapsed band? | Hidden | Yes (S) |
| L1590, L1800 | Hide the drag handle and the Position box on phone Sumário rows? | Shown on equipment rows, hidden on location rows | Hide them, as on location rows |

### F. Readings, AI and spend

| Ids | Question | Today | Rec. |
|---|---|---|---|
| E28-A1 | The seven Epic 28 readings (empty utility name blocks issue; the slot shows while empty; Bruno's over-range line replaces Story 23.4's on v18; the deadline term over an empty date; a preview counts from the first issue; a past real date raises the overdue row; "Voltar" steps back) and the AI audit job's draft layout still counting from its own instant (`apps/api/src/jobs/audit/job.ts:88`) | Built as read | Confirm the seven as built. Make the audit job count from the first issue (S) |
| L4348, E28-A4 | Should a permanent error from the default model try the escalation model? | It does not (`kinds/plate.ts:121`) | Yes: one extra paid call only on a failure |
| L4353, E28-A4, E21-A2 | Pay for a Nova Pro rerun after #375 and #376? | Last run before the fixes | Yes, with the v18 sample (section 6) |
| L1278 | Run the bedrock evaluation on real plates and narrow the IAM to the models in use? | IAM allows every candidate model (`infra/bootstrap/iam.tf:33-46`) | Narrow the IAM now (free); evaluate on the next paid run |
| E25-A2 | Pay for the measured evaluation of the `audit-2` prompt? | Never measured | Yes, small |
| 17.2-prefetch | Should the viewer prefetch originals on mobile data? | It does | Only on Wi-Fi |
| L1139 | "Confirmar todas": only the filtered suggestions, or all of them? | All | Only the filtered ones |
| BL-13.9 | Turn dictation on behind one line of consent? | Off; the engine is wired | Not until you write the consent line |

### G. Sheets, points and small screen readings

| Ids | Question | Today | Rec. |
|---|---|---|---|
| L3583, L3904 | One NC item can create a second identical point, and the band does not show that a point exists. Show "Ver ponto" instead of "Criar ponto"? | Design E6-Q11 | Yes (S) |
| L3588 | Should points from a not-tested sheet count in the Sumário's "sem ação"? | Left out | Count them |
| L3969 | A stepper focus jump can commit a half-typed TAG | Possible | Commit on blur only (S) |
| L3934, L3959, L3984 | TAG plate suggestion writes the cell, not a rename; a rename leaves the other open relatório stale; the TAG helper stays after typing | As built | Keep; the helper hides once typed |
| L4222, L4047 | The 25.15 "Outro" clause form and the bold "TERMOGRAFIA:"; X3 changed "Origem resolvida" on older seeds | As built | Keep as built |
| L1560, L1600, 14.5-R2, fxpw-held | "Ver" opens the first pending sheet; a unit change rewrites the value with no undo; a CTA config change on Emitido reopens the relatório; Sumário header against the parecer on a held sheet | As built | Keep, except: add undo to the unit change (S) |
| L1585, L4287, E27 tables | Two readings tables still overflow their box, and the TTR table scrolls at tablet width | Waiting for a design | Sally draws one frame, then a fix batch |
| E17-A2 | Eleven readings of 15.7 and 17.1 to 17.7 | Live since v0.4.0. "VASAMENTO" is only on frozen seeds v10 to v12 (`seed/v12.ts`); v16 spells it right | Close all as built |

### H. Process

| Ids | Question | Today | Rec. |
|---|---|---|---|
| E15-A11, E16-A7, E17-A7, E18-A4, E26-A2 | Apply the drafted spec reconciliations (`spec-reconciliation-drafts-2026-11-03.md`) and the `SPEC.md` "no roles" lines? One approval | Drafted, not applied | Yes, one approval |
| seed v19 | Open seed v19 for printed-text fixes (section 4c, L4011-G7, L4011-G8)? | v13 to v18 locked | Yes, in one batch |
| E3-A10 | PR bodies end with the tool's attribution line, which carries an emoji. AGENTS.md says no emoji anywhere | Each PR breaks the policy | Pick one: drop the line through the harness's attribution setting, or write a dated exception in AGENTS.md |

### I. Recommend: close as kept as built

Every row marked `decision` in section 7. One "yes" closes them all.

## 4. Questions for Bruno

One message. Wording lists are named by path and PR, not repeated here.

### (a) Questions that change a result or a printed judgment

| Ids | Question | Today |
|---|---|---|
| L3603 | The instrument reads "above its limit", and that limit is below the criterion's minimum (say "> 1 GΩ" against "≥ 5 GΩ"). Is that a failure, or "cannot judge"? | Judged a failure (`relatorio/over-range.ts:82`). A signed Reprovado can rest on an instrument limit |
| e23e TC (L3417) | TC classes 5P10, 5P30 and 10P10: add them, or keep storing and printing them as 5P20 or 10P20? | Stored as 5P20 or 10P20 (`relatorio/accuracy-class.ts`). The printed class can differ from the plate |
| F28 | The default unit is GΩ on one type and MΩ on another, so a 1000x slip is possible. Should a unit change show a warning? | No warning |
| L4305 | Should section 10 count an open (not concluded) ficha with an NC item among "com restrições"? | It does (`relatorio/parecer.ts:307` checks no conclusion) |
| E16-R2 (L2731) | The cabine environment "Ler visor" photo gets a number but is printed nowhere. Print it under the environment, or leave it out of the numbering? | Numbered last, unprinted (`print/photo-order.ts:103-121`) |
| EC8 (e22c), his M17 | A stricter parecer he tapped stays after the fichas clear. Should it follow the derived verdict? | It stays |
| L4011-G12 | "(critério: …, aceitável na ficha)" reads as if a rejected value were acceptable. New words? | Printed as is (`seed/criteria.ts:54`) |
| 14.5-8.5 | The CTA E2 on medium voltage uses the firm's 400 MΩ, not the NETA tables. Is that right? | 400 MΩ |
| L3914 | The conclusion and section 10 name only the first pole that is out. Name all of them? | First pole only |
| e23v narrowings | A number for CB-02 "queda acentuada", and for the DJ-02 and SC-02 phase difference | Vague terms, question 8 of `docs/context/epic-23/textos-para-bruno.md` (never sent) |
| e23t readings | Deviation measured against the lowest phase; silicone sampling; an empty TIPO DE SECCIONADORA | Question 10 of the same file |
| e23e readings | Are polarity and FUNÇÃO DO TC required? An arrester with no MCOV? TC and TP secondaries at 1 kV? | Question 11 of the same file |
| E21-A5 | The k of the vector groups Dyn3, Dyn9, Dy3 and Dy9 | Shipped "as transcribed" |
| 14.5-N6 | Should E4, E5 and E6 name an instrument (the timer, the thermal camera)? | No instrument |

### (b) Wording to confirm

- The drafted list `docs/context/epic-23/textos-para-bruno.md` (gitignored, never sent): rows e23a, e23v, e23w, e23x, e23z, e23p texts (L3216, L3315, L3366, L3435, L3481, L3509), E23-A7.
- The authored sentences listed in the bodies of #368, #370, #371, #372 (eight Epic 29 strings), #373, #374 and #377 (E28-A2).
- Epic 26's marks `// authored (Story 26.x)`: 30 in `apps/web/src/copy/pt-br.ts`, 37 in the kernel.
- Older lists still waiting: L857 (print placeholders in `print/section-11.ts`), L1049 ("aguardando envio" on an office device), L1505, L1555, L1690, L1728, 14.3-O5, L3621, L3732, L3780, L3813, L3919 (F13 clause), L3954, L4204, L4011-G7 (Malha "na placa"), L4011-G10. Umbrella E17-A3 (holds E13-A8 copy, E14-A10, E15-A8, E16-A3).
- In all, `grep "// authored"` finds 934 marks in `apps/web/src` and `packages/domain/src`. A list generated from the marks would replace every list above.
- Also ask him to confirm on his own tablet that closing a dialog, tapping outside and going back now return to the screen before, and that "Alterar senha" works (E29-A1). And ask whether "Envio atrasado" during photo uploads worries the technician (L4127).

### (c) Already answered by Bruno, only needs building

| Ids | His answer | What is missing |
|---|---|---|
| L3106, L3160 (N10), L3944 | "≥" instead of ">=", and "± 5 %" with a space (`docs/context/epic-24/respostas-bruno-2026-11-11.md` item 9) | Only `nominal_pct` follows it. Seeded bands still print `${operator}${value}` (`seed/criteria.ts:151`, confirmed). Needs seed v19 |
| L465 | "2T" is the instrument limit "> 2 TΩ" (`docs/context/epic-23/respostas-bruno-rev08-2026-11-08.md`) | The fixture still stores raw "2T" (`packages/domain/fixtures/porto-seguro/data.ts:362`). Changing it touches the goldens, so it needs your go |
| OQ-1, e23b readings, e23z item 2, B-6 | Answered or built on his "ok" (2026-11-09) | Only the ledger rows need closing (section 7) |

### (d) Material to ask him for

- A real star-star (non-Dyn1) plate photo (E21-A2).
- His next test-base revision file (E25-A5, gated by L4158 and L4168).
- Real tablet photos of the four displays (E8-A8, E9-A6), only if "Ler visor" is used in the field.

## 5. Needs a real device

One session, one iPad and one Android tablet, on v0.14.0. Fill `_bmad-output/test-artifacts/manual/ipad-YYYY-MM-DD.template.md`. Sources: E1-A1 and its duplicates E6-A5, E8-A7, E9-A10, E10-A7, E12-A3, E11-A7 (share), plus E26-A5, E28-A3, E29-A2, L231, L1385, L1480, L1640, L4358, e17-R3, 17.2-twotap, L3641, L3646, L2892, E15-A6.

- [ ] Offline proof (`offline-proof-script.md`, steps 1 to 13): cold open offline (L231), fill, close, reopen, sync. Calibrate the storage threshold (E1-A1).
- [ ] Installed-app mode (home-screen icon), if the device offers it. The app has no web manifest, so note what happens (Epic 29 open question).
- [ ] Sign in, have another device pause the user from Usuários, reactivate, sign in again, and check the unsent work arrives (E26-A5).
- [ ] "Alterar senha" online, and offline (disabled, with its reason); sign out and check the wipe (L4358, L2892).
- [ ] Device back with each overlay kind: dialog, menu, tabs, camera, Papéis grid, the `Select` popover of `point-link-picker.tsx`. The Sumário in "Em revisão" and "Em campo". The return from a download and from a new tab (E29-A2).
- [ ] Camera: burst, import, photo durability after a reload (E6-A5). Photo zoom on iPad (L1385). Camera-app HEIC when the conversion fails (e17-R3). Time from the shutter to the camera closing while GPS waits, up to 5 s (L1480).
- [ ] "Ler visor": two quick taps (17.2-twotap) and the plate photo flow offline (E8-A7, E9-A10).
- [ ] Soft keyboard: Enter moves through the fields, the tables and cues fit, no tap is lost (E12-A3, L1640). "Criar" in the registry picker (L3641). "Novo relatório" pressed while Home redraws (L3646).
- [ ] Two tablets on one relatório: merge and a contradiction (E10-A7). The B-10 case: two sheets under a local removed on one device (E28-A3).
- [ ] Hands-on gaps from 2026-11-23: a sheet with no TAG, a read-only role on "Itens adicionais", a v17 relatório, revisions issued on different days, the hashed sprite after an update (L4358, E28-A3).
- [ ] Download and share a DOCX and a PDF (E11-A7). Show Bruno the phone frame (E15-A6).

## 6. Tests and tooling

| What | Detail | Source |
|---|---|---|
| Flaky tests (one item) | Each failed once under load and passed alone. In brackets, how many records name it: 12.1-E2E-012 (4: L4323, E28 retro finding 5, E28-A6, a comment in `e2e/ficha.spec.ts`); home 1.6-E2E-001 (5: L4323, finding 5, E28-A6, and the same lost "Novo relatório" press as L3646 and R8LAY-E2E-008 L3014); 11.11-E2E-001 (3: L4313, wave gate, E28-A6); 6.2-E2E-001 (3: L4318, final gate on an idle machine, E28-A6); R8CAP-E2E-010 (3: L3994, L4070, E24-A4; not seen since e24z); 25.2-E2E-002 (2); api `e24y-paired-tables` (2); 24.10-E2E-005 (2: L4095, `spec-e25x-wave1-web-fixes.md:186`); e20f-DUR-001 (2: L4095, L4091); 14.5-E2E-001 (2: L4009, E24-A4; not seen since); 21.1-E2E-002 (1); the relatório-tree and template-composer unit timeouts (5: E16-A10, E17-A8, E23-A4, E24-A4, `epic-25-context.md:227`); two `durability.spec.ts` tests that tap "Sincronizar agora" by hand (`:441`, `:692`; L2918); the api process exiting when Postgres restarts (L4008, E24-A4). Find each cause, red first, no retries | E28-A6 (merges E23-A4, E24-A4) |
| Specs that never run on WebKit or Android | `security-device.spec.ts` and `auth.spec.ts`: the matrix projects match only `durability.spec.ts` (`playwright.config.ts:82,88,94`). Photo zoom is `test.skip` on WebKit. Offline cold open, form sign-in and the service worker are tool limits (L231, L237, L243, section 7) | L2892, L1385 |
| Tap budget not measured after seed v15 | `e2e/tap-budget.spec.ts:189-201` runs v12, v14 and v15 only. v16 added a tap (thermography) on every sheet, and the default seed is v18 | L4181 |
| No v18 evaluation sample | `apps/api/src/scripts/eval-samples.ts` holds v12 and v13 samples. The v18 probes are untracked under `test-results/eval-e28-v18/`, so the next paid run cannot repeat the check | L4343, E28-A4 |
| The escalation model's known wrong group | Nova Pro still composes "Dd0 (diagram)" on one real plate (5 of 6, `epic-28-context.md:107`). The code half is Fix-now 17. A drawn-only diagram with uncited labels: one log query (L2971) | R-5 (E21), L3001, E21-A2 |
| `.vite-temp` owned by root | Came back under `apps/api` and `packages/domain`. `scripts/preflight.ts` watches only the web loop | E26-A8 (with Fix-now 16) |
| Stale worktrees | 53 besides main on 2026-11-24, most from merged batches | E3-A10 |
| The emoji attribution line in PR bodies | The tool requires a closing line with an emoji. AGENTS.md says no emoji anywhere. This file's own PR carries it, because the request asked for it. A decision for Matheus (section 3H) | E3-A10 |
| The api does not reload kernel edits | `tsx watch src/main.ts` (`apps/api/package.json:6`) misses `packages/domain`, so a wave gate tests stale domain code unless the api is restarted | L1655 |
| Gate tooling | The e2e summary undercounts under `--repeat-each` (`scripts/e2e.ts:266`, L1430). A fresh podman image build fails on the LibreOffice arch (L1425). 35 `waitForTimeout` lint warnings (L1470). No ASCII check on Terraform descriptions (E11-A10). No automated check of the edge headers through a live upstream (L2903) | as named |
| Bulk actions not re-timed | Four bulk taps on 94 blocks took 2 to 8 s and were never measured again | L1235 |
| Missing test cases | The "Fotos da ficha" retry pill (L1347), the strip row and "Enviada" (L1353), `?panel=` on a slow snapshot (L1395), the panel wait text (L1400), "Legendar" on a site photo (e14b-legendar), the viewer's remove confirm on a site photo (e17-site-rm), display fixtures recorded on the old detector (fxg6-VG4), the oil read-only marker checks (L4004), a pair with its own ACEITÁVEL column and the rename race (L3964), the monotonic-clock expiry (L2943) | as named |
| Relatório budget cost on push | Never timed | L2946 |
| No real HEIC fixture | Only a converted one | L3056 |

## 7. Recommend to drop

The audits marked each row `drop`. Nothing here is closed by this file. Approving the table closes them as "kept as built" or "not worth it". Rows marked (decision) also settle group I of section 3.

| Id | Summary | Reason |
|---|---|---|
| L231, L237, L243 | WebKit offline, form sign-in, SW | Playwright limits; the device session covers them |
| L345 | Two close controls on panels | Cosmetic |
| L393 | Empresa form low on phone | Office screen |
| L399 (decision) | `:has()` with no browser target | Field browsers are current |
| L435 | Fixture section 8 bullet | Fixture only |
| L525 (decision) | Config lost at zero placements | Keep as built |
| L646 | Legacy equipment has no reuse key | Shrinks every visit; see 3C |
| L754, L760, L772 | Caption modal, recents, photo restore list | Nobody asked |
| L995 | Virtual section rows | Only fixtures hit it |
| L1061 | Environment provenance glyph | A contract bump for a glyph |
| L1079 | Plate pipeline on display crops | Production reads with Textract and Bedrock |
| L1085, L1103, L1211 (decision) | Story 9.1, 9.2, 11.9 and 11.10 questions | Old spike questions, shipped conservatively |
| L1175 | NC observation replaced, rare order | Rare |
| L1193 | Overflow menu on rail equipment rows | Nobody asked |
| L1259 | Export prefetch not abortable | Harmless |
| L1272 | `files.acked` boolean, two tests | Low value |
| L1341 | One more live query on the sheet | Harmless |
| L1445 | Theme during a corrupt-row repair | Needs a corrupt row |
| L1450, L1455, L1460 | Textual test scans and sync pin | Runtime checks back them |
| L1520, L1746 | Stale-text cap, tree texts | Wording; part of Bruno's general list |
| L1525, L1545 | Undo on conclude, Gerar on Home | Nobody asked |
| L1530, L1540, L1550, L1595, L1615, L1675, L1734, L1752, L1758, L1836 (decision) | Ten small UX readings from the 2026-10-08 round | Keep as built |
| L1565, L1575 | Toast merging and the nested scroller | Low value |
| L1570 | Early "Pré-visualizar" opens a blank tab | Only in the first seconds after load |
| L1645 | Unit control wraps on phone | A spec pins today's tables |
| L1716 | More location Overflow actions | Nobody asked |
| L1782, L1830 | `targets` index; re-removal stamp | No live case |
| 14.3-O1, 14.3-rail, 14.3-ncrow, 14.3-caption (decision) | Site checklist readings | Bruno has used it without raising them |
| 14.3-O4 | Photo-read NC draft on site items | Nobody asked |
| 14.3-picker | Denied camera on a site photo | Rare, and it works |
| 14.3-oldseed | Offline relatório on an old seed | Accepted; never hit |
| 14.3-44px | Mock sizes for `.s9-verif` | The app is right |
| e14b-locid, e14b-mergeinfo | Fold `location_id`, merge info | No client writes them |
| 14.5-N1, N2, N3, N5, W2, W5 | CTA grammar features | Nobody asked since October |
| 14.5-W1, W3, W6 (decision) | CTA controls on phone | Keep as built; EXPERIENCE.md rule |
| 14.5-R4 | Conflict view lists hidden cells | Needs two devices and a polos change |
| 14.5-R5 | SM-C1 family has no assertion | No source writes it yet |
| Q-16, E14-A11 | Story 14.4 PDF check against the mock | v5 is locked as printed in production |
| 14.10B-q (decision) | Slow-sync badge, "Hoje" | Keep as built |
| c17-oiltoast | Oil toast wording | Part of Bruno's general list |
| 14.12-site (decision) | Site checklist learns no phrases | Keep as built |
| 14.12-refusal, e17-R13, L3866, L3886 | Four small test gaps | Low value |
| ux-dict5 | Dictation reads a TAP number | Dictation is off (13.9) |
| 17.1-drift | Old revision label | Ends by itself at the next revision |
| 17.2-touch (decision) | Touch laptop opens the camera app | The Conta switch is the remedy |
| o18a-narrow, e18fa-ro, e18fa-watch, e18fa-ops, e18fa-skew, P7, R-A13, R-E4 (decision for some) | Telemetry fine points | The first digest (2026-11-30) decides |
| R-A5, R-A6 | Two tabs post the same rows; beacon wait | Rare; rows are not lost |
| L2758 | Smoke retry proven only with fakes | Proof arrives by itself |
| L2809 | Narrowed `input_refused` points | A note, not a defect |
| L2847 | No `maxLength` on two fields | The server enforces the cap |
| L2857 | Dev fixture relatório | Dev only |
| L2887, L2908 (decision) | Sign-out count reading; `Server: Caddy` on the redirect | Record the acceptance |
| L3038 (decision) | A relinked point keeps its keys | Low impact after e24h |
| L3101 | Section 3 equipment list | Bruno reviewed section 3 and asked none |
| OQ-1, B-6, e23z item 2, e23b readings | Bruno readings already answered | Built on his words |
| N7 (e22h) | `toSnapshot` loads every type version | Wait until a company nears 50 versions |
| R2-1 (e23g), e23g EC | Suggestion order; TTR markup branch | No consumer depends on them |
| L3537, E24-A6 | v5 production preview; records items 3 and 5 | The golden pins v5; many deploys passed |
| L3616, L3636, L3722, L3727, L3770, L3846, L3899, L3989 (decision) | Eight Epic 24 readings | Keep as built; record the acceptance |
| L3670 | "Foto térmica · N" by caption | Screen only; would need a contract |
| L3699 | Specs pin the seed by a server op | Works |
| L3924 | "Último envio" from another device | Likely by design |
| L3949 | Palette notes for Bruno | Built from his own corrections |
| L4009, L4070 | 14.5-E2E-001, R8CAP-E2E-010 | Not seen since; kept in the flaky list for causes |
| L4011-G5 (decision) | Old plate TAG on legacy sheets | Legacy and cosmetic |
| L4019, L4109, L4114, L4119 (decision) | Printed-verdict record fine points | No reader exists |
| L4090 | Fast-clock late alert | Harmless |
| L4163 | `connectionLabel` not seed-gated | No live case |
| L4251 | Admin view of unsent work | Wait until asked |
| L4272 (decision) | "Off" pill at 390 px | Wording since Story 1.6 |
| L4277 | One 401 console line at sign-in | Not a defect |
| E2-A4, E8-A6 (decision) | DoD wording for user-facing ACs and the real job | The AGENTS.md rule and the playbook already say it |
| E3-A1, E3-A2, E3-A5, E3-A6 (decision) | Epic 3 seed and fixture readings | Overtaken by Bruno's seed rounds |
| E5-A3, E6-A4, E7-A5, E8-A3, E9-A8, E11-A6, E12-A1, E13-A8 (decision) | The "E5-A3 session" that never ran | Overtaken. Still live from it: E10-A6 (3B), and the E13-A8 copy (4b) |
| E11-A3 | A lock wrapper that names its holder | One gate per wave now |
| E14-A9 (decision) | Ten Epic 14 product readings | Keep as built, except Q-8 and 14.3-O2 (3B) |
| E15-A6, E15-A9 | Phone frame DoD; workaround list | Bruno's later rounds are the signal |
| E24-A5 (decision) | Epic 24 fix-batch readings | Keep as built, except L3841 (3C) and L3944 (4c) |

## 8. Housekeeping still owed

| What | Owner | Source |
|---|---|---|
| The Epic 27 retrospective: no file. Check first whether Epic 26's covers it (same deploy, `886af55e`) | coordinator | `sprint-status.yaml` `epic-27-retrospective` |
| The first monthly friction digest, due 2026-11-30. Fold in: the 17 saved Logs Insights views never confirmed `Complete` (L2748, L2799), e18fa-401, R-A2, L2794, and the telemetry rows of section 7 | coordinator, Matheus (AWS login) | E18-A7 |
| Import Bruno's test base in production and check one relatório; record it | Matheus | E23-A6 (and E24-A7) |
| The message to Bruno (section 4), then his replies as dated lines | Matheus sends, coordinator drafts | E28-A2, E29-A1, E23-A7, E17-A3 |
| Production counts owed: users and roles since the migration (E26-A4); the `uncited` count of the vector-diagram log (L2971) | Matheus's word, coordinator runs | E26-A4, L2971 |
| Delete the stray `docs/kbs/log.md-e` (still tracked, checked) | coordinator | E26-A1 |
| The two missing reports: the hands-on pass as the five roles, and the integrated review of `8a214062` | coordinator | E26-A3 |
| Dated lines in `infra/README.md` "E-mail": DKIM records typed by Bruno and SES production access, both 2026-11-22 | coordinator | E26-A9 |
| Playbook § 12 lines: E25-A6 (three), E26-A7 (a to f), E28-A5 (a to d) | coordinator | E25-A6, E26-A7, E28-A5 |
| Re-check the P2 and P3 findings of `ux-pass-2026-10-22.md` against main, then close or cut them | agent | ux-triage (L2317) |
| AGENTS.md still says the `pnpm audit` advisory is open; it is fixed (`pnpm-workspace.yaml:22-25`) | agent | L255 |
| `sprint-status.yaml`: 8 delivered epics still `in-progress`, 4 `closed` statuses, the `backlog-deferred` key, and 13-9 offered as the "next story" (the validator fails). Being cleaned on another branch | coordinator | `sprint-status.md` audit, file health |
| `deferred-work.md`: the 111 rows found no longer open still read open. Being updated on another branch | coordinator | the five ledger audits |
| The paid evaluation's dated line in `deferred-work.md`, which E25-A1's done-when asks for; the AD-13 line in the spine (E21-A5 P-2) | coordinator | E25-A1, E21-A5 |

## 9. How this was made and its limits

- Six read-only audits by agents on 2026-11-24: five slices of `deferred-work.md` (lines 1 to the end, plus two backlog files and the deferred-stories backlog of `epics.md`) and one of `sprint-status.yaml`. They read code, documents, git history and PR bodies. Nobody ran a test, started a container, or touched production or a device.
- This file merges them with the action items of the Epic 26, 28 and 29 retrospectives. Merged families: the device session (21 records), Bruno's copy review (about 40), the flaky tests (14 tests in about 30 records), the spec reconciliations (5), equipment identity (7), the E5-A3 session (9), and Bedrock usage (4).
- Low-confidence verdicts in the audits: L1085, L1575, L1595, L1600, L1605, L1758 (ledger A); 17.1-drift (B); L3641, L3886, L3924 (D); L4011-G10, G11 (E); E3-A6 (sprint status). Medium confidence covers most `superseded` and `moot` verdicts.
- Spot checks made here, in the code at `e687b442`: Fix-now items 1 to 16 and 18; 4c (`criteria.ts:151`); 4a L3603 (`over-range.ts:82`) and L4305 (`parecer.ts:307`); 3C L875 (only null writes of `feeds_block_id`); 3F L4348 (`plate.ts:121`); E26-A1; the worktree count; the 934 authored marks.
- Where the audits were wrong or too broad: (1) L2949: a reread of a removed relatório's photo does not spend a paid reading, because the job refuses before any provider call (`apps/api/src/jobs/reading/job.ts:209`). (2) e17-R1: the missing guard matters only on the system-picker path, not on every "Ler visor". (3) L1335: a second tap during "Abrindo câmera" is already ignored (`camera-stream.ts:134`), so the gap is feedback only, not a double open. (4) E17-A2: "VASAMENTO" lives only on the frozen seeds v10 to v12; v16 spells it right. (5) L4333: the likely cause in `suggestTag` does not hold; the cause is still unknown. (6) L4011-G8 is size M, not S, because v13 to v18 are layout-locked. (7) The worktree count is 53 besides main, not 51.
- The count of 250 distinct things counts each table row or listed item once. A family row that names several ids counts as one. A thing named in two sections (the message to Bruno, `.vite-temp`, the emoji line) is counted once.
