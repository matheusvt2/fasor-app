# Epic 10 Context: Two devices on one relatório: merge, conflicts and full sync status (post-slice)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Two engineers split one relatório across two tablets and never arbitrate the whole job. A sheet both of them touched merges by sub-block under fixed rules, and each merge is listed as information. The user is asked only about a true contradiction: two different filled values in one cell, a block removed on one device and edited on the other, or one TAG created on both. Each question is one row with both sides. The full Sync status surface then shows what was sent, what waits, what failed, what merged and when each colleague last sent. That is the honest signal for judging, on Monday, whether work is still on someone's tablet.

## Stories

- Story 10.1: Merge the same sheet from two devices by rule (opus, high)
- Story 10.2: Decide a true cell contradiction, and nothing else (opus, high)
- Story 10.3: Resolve a removed-versus-edited block and a duplicate TAG (opus, high)
- Story 10.4: See everything the sync did or is waiting to do (opus, medium)

Story text: `_bmad-output/planning-artifacts/epics.md:2263-2327`. Every story carries only acceptance criteria. The generic DoR and DoD apply (`epics.md:403-425`). The sprint keys in `sprint-status.yaml:125-130` are all `backlog`.

## Requirements & Constraints

- **Merge by sub-block, no question asked (FR-58).**
  - A checklist result NC on one device and C on the other resolves to NC, keeping the NC device's photo link and observation.
  - A filled cell beats an empty one.
  - Photos and captions never conflict: both devices' photos are kept, numbered by capture order.
  - Free text (observations, reasons): the latest edit wins, and the other version stays readable in Sync status for the session.
  - Structure (block additions, moves, reorders, locations and cabine data, captions, points of attention, setup edits) merges automatically: additions from both devices are kept, and the latest edit of a field wins.
  - Every merge becomes one information row ("SEC-C12: item 10 NC de Eduardo (com foto) mesclado"). Two devices editing different sheets never conflict; this is the intended way to split the work.
- **True contradictions only (FR-59).** The cases are:
  - two different filled values in one cell (two readings, two conclusions, C vs NA);
  - one block removed on one device and edited on the other;
  - one TAG created on two devices.

  Each is one row with both options and their provenance: author, time, and the 48 px crop when the value came from a reading. The rest of the sheet is already merged and is not shown. A block added elsewhere appears in the tree and is information only. Esc/back returns without deciding.
- **Sync status (FR-60, UX-DR13).**
  - The badge has five states (ok · pending · offline · error · conflict), always with a word, and announces transitions only.
  - The surface opens from the badge. The headline gives the state word plus counts.
  - Rows: uploads pending (sheets, photos, and photos queued for reading with "Leitura na fila"), downloads with a progress line, last sync, per-user last send ("Último envio de Eduardo: 06/09 18:10"), errors ("Tentar novamente"), rejected ops ("Reenviar"), merged changes for the session, and contradictions that open the Conflict view.
  - Explanations sit behind one "Como funciona" disclosure. The surface is **not** `aria-live`.
- **TAG (FR-7).**
  - A duplicate typed on the device stays refused inline.
  - A duplicate that arrives by sync is never a server rejection: the kernel `integrity` check reports it.
  - "Manter as duas" suffixes the later TAG.
- **Ownership (AD-1 to AD-3, AD-13).**
  - Merge rules, conflict detection, merge and conflict texts and every count live in `packages/domain`.
  - `apps/web` renders from IndexedDB and writes only ops.
  - Resolution ("Aplicar", "Manter", "Remover", "Manter as duas") is plain client ops, with `prev_op_id` pointing at the current op on each path.
- **Testing.**
  - Every AC is automated.
  - Two-device behavior is proven at two levels: in the api (the pattern of `template-convergence.integration.test.ts` and `replay.integration.test.ts`) and in Playwright with two browser contexts.
  - The replay test must stay byte-equal between the device and server layers once the merge exists.
  - Every new route gets a cross-tenant test.
- **Policy.**
  - Scope: `source-deltas.md:14` (one device at a time for the MVP) and `EXPERIENCE.md:30` describe the slice. Epic 10 is the post-slice work they defer, and no row overrides FR-58, FR-59 or FR-60.
  - Nothing depends on a cloud account.
  - No emoji. Copy is pt-BR verbatim from the mocks, or marked `// authored:`.

## Technical Decisions

- **Op envelope (AD-3).** An op is `{op_id, kind, scope, path, value, prev_op_id?, batch_id?, meta?, actor_id, device_id, client_ts, seq?}`.
  - `prev_op_id` is the last op the device had applied on that path. The MVP records it and never interprets it; the deferred merge dispatches on it and on `parsePath(path).family` (`ARCHITECTURE-SPINE.md:74`).
  - Outbox coalescing keeps the first `prev_op_id` of a run of puts (`ops/outbox.ts:16-25`), which is what the merge needs.
  - Undo inverse ops set `prev_op_id = op.op_id` (`outbox.ts:53`).
  - Last-writer-wins is by server `seq`; `client_ts` is display and audit only.
- **Sync semantics (AD-24).**
  - The push answers `{applied, rejected, superseded}`. `superseded` lists applied ops whose `prev_op_id` was not the server's current op on that path. It is information, never a rejection.
  - The server never rejects for a domain rule: a duplicate TAG or an edit on a tombstone is applied and reported by `integrity`.
  - Rebase: the device re-applies its pending ops on top of pulled values.
  - `last_push_at` per `(user_id, device_id)` travels in the company pull summary and lives in `sync_state`, never in an entity (`ARCHITECTURE-SPINE.md:205`).
- **Kernel owners (AD-2).** `mergePolicy`, `integrity` and `syncCounts` exist once, in `packages/domain`; the spine plans a `merge/` directory (`ARCHITECTURE-SPINE.md:65,286`).
- **Banner priority.** The order is conflict › re-auth › draft found › suggestions ready › relatório exported › offline › unsynced > 5 days. The conflict banner is `role="alert"`, with one slot per surface (`ARCHITECTURE-SPINE.md:231`).
- **Sheet cells carry their op.** `cellSchema = {value, source_suggestion_id, op_id}` (`schemas/entities.ts:40-44`). Every nameplate, checklist, test-cell, conclusion and observations value is a cell on the block row's `sheet` (`entities.ts:328-350`). A fold can therefore compare `op.prev_op_id` with `cell.op_id` without a new lookup.
  - Exception: `block/{id}/not_tested` and `concluded_by` are block fields with no `op_id`.
- **Contract.** `CONTRACT_VERSION = 9` and `MIN_CONTRACT_VERSION = 9` (`contract/version.ts:48,80`).
  - Epic 9 rule: each batch that changes an op family, the reducer or a row shape bumps to main + 1 with a dated note.
  - `MIN_CONTRACT_VERSION` follows whenever an older `applyOp` would materialize differently.

## UX & Interaction Patterns

- **Current mocks** (`MOCK-GUIDE.md:110-111` marks both as whole-screen, out of the slice, FR-58/59/60).
  - **Sync status, `prototype/screens/85-sync.html`.** Page-local CSS at lines 1-28 (the `.frame-phone` rules at 23-27 become `@media (max-width: 767.98px)` in `surfaces/sync/sync.css`).
    - Headline: `.sync-headline[data-tone]` (`.sh-state`, `.sh-counts`) at line 33.
    - Disclosure: `details.sync-how > summary.sh-how` "Como funciona a mesclagem" + `.how-body` at lines 36-38.
    - Counts: the `.sync-summary` compact badges at lines 51-55.
    - Sections, each `section-head` + `section-note` + `ul.sync-list > li.sync-row` (`.sr-body` / `.sr-primary` / `.sr-secondary` / `.sr-state`):
      - Leituras (59-68, with `.photo-tile.is-inline` and "Leitura na fila");
      - Enviando (73-87, `.progress-counter` "12 de 31 fotos enviadas", Fichas (n) / Fotos (n) groups);
      - Baixando (92-96, "Baixando… 12 de 30 fichas · 8 de 20 fotos · 40 %");
      - Último envio (101-106, avatar + name + device + time);
      - Decisões (111-135: a `.conflict-list` of `.banner[data-variant=conflict]` for the cell, remove-vs-edit and duplicate-TAG cases, then "Mesclado automaticamente" rows with `.sr-secondary .was` strike-through for the overridden text).
    - Foot: `.sync-foot` (139).
  - **Conflict view, `prototype/screens/86-sync-conflito.html`.**
    - Structure: `.conflict-page` > `.conflict-head` (`.dialog-title` + `.cv-desc`, close "Voltar sem decidir") > `.conflict-scroll` > `.conflict-view` > `.cv-cell`.
    - Each cell: `.cc-label`, `.cc-name`, then `.cv-pick[role=radiogroup]` holding two `.cv-option[role=radio]`, each with `.radio`, an optional `.crop-thumb`, and `.cvo-text` (`.cvo-who` with avatar, `.cvo-value`, `.cvo-meta`). A `.cc-hint` follows.
    - Then `.sticky-action-bar` with a `.btn-reason` (lines 39-98).
    - Page-local CSS at lines 7-38. `.cv-pick` is two columns, one column on phone. `.cv-option` has `min-height: 56px`.
- **Superseded frames.** `key-sync-status.html` frame 2 (lines 180-282) is the old "Ver as duas" two-column dialog, with "Manter a minha / Manter a dele". `EXPERIENCE.md:456,583` says it is "to be reworked for the per-cell pick", and 86 is that rework. Build the cell pick from 86.
  - `components.css:165-170` still carries `.conflict-view`, `.conflict-columns`, `.conflict-column(-title)` and `.conflict-cell.is-changed`. These fit 10.3's "one block card per side".
  - Frame 3 (284-330) is the badge legend and the source of the five badge words.
- **Copy.** Taken from `EXPERIENCE.md:232,264,265,384-386,449,451,564,585-586` and the story ACs:
  - "SEC-C12: 1 célula em contradição — Ver";
  - "SEC-C12: removido por Eduardo, alterado por você — Manter / Remover";
  - "SEC-C09 foi criada em dois aparelhos — Renomear uma / Manter as duas";
  - "Eduardo adicionou SEC-C09 em Coluna 9";
  - never "Conflito de versão (409)".
- **Accessibility.** The Conflict view is `role="dialog"` with `aria-modal`, labeled and described by its title (`EXPERIENCE.md:422`). The conflict Banner is `role="alert"`. Sync status rows are not live; the badge (`components/sync-announcer.tsx`) announces transitions.
- **Real-browser pass.** Check 390, 768 and 1280 px plus the dialog, in light and dark. At 390 px, assert the scroll containers themselves (`.sync-list`, `.conflict-scroll`, `.cv-pick`, `.conflict-columns`), not only the page width (E9-A4, R9-8).

## Code facts

- **Kernel counts** (`packages/domain/src/sync/counts.ts`).
  - `syncCounts(outbox, reading)` (`:54`) returns `{pending, sent, dead, sheets_pending, photos_pending, suggestions_pending, readings_queued}`. The signature is outbox-first, not the spine's `(snapshot, outbox)`; that was decided in Epic 8 (ledger entry 171, stale).
  - `SyncBadgeState` includes `'conflict'` (`:75`), but `syncBadgeState()` returns `Exclude<…,'conflict'>` (`:94`), with error before offline before pending.
  - `syncBadgeLabel` / `syncBadgeShortLabel` already have "Conflito" / "Confl." (`:147-185`).
  - `supersededText` "N alteração(ões) mesclada(s) pelo servidor" (`:137`) and `rejectedText` (`:132`) exist.
  - There are no `merge_info`, conflict or last-send texts yet.
  - **To add:** a merge-info input and a conflict count to the counts, `conflict` in `syncBadgeState`, and the merge, conflict and headline texts.
- **Ops** (`packages/domain/src/ops`).
  - `op.ts:37` declares `prev_op_id: uuidV7Schema.nullish()` (its comment at `:14` says "recorded, never interpreted").
  - `applyOp(state, op)` (`apply.ts:352`), `targetsOf` (`:67`), `readPath` (`:209`).
  - `materializeEntity(ref, remote, local)` (`materialize.ts:37`) folds remote ops in `seq` order, then local ops in `op_id` order. This is the one place rebase and convergence happen on the device.
  - `parsePath` and the family list are in `path.ts:79-123` (`sheet/nameplate`, `sheet/checklist`, `sheet/test`, `sheet/test/cell`, `sheet/conclusion`, `sheet/observations`, `block/field`, `equipment/field`, `file/field`, …).
  - There is no `merge/` directory. **To add:** `packages/domain/src/merge/` with `mergePolicy`, dispatched on family and on `prev_op_id !== cell.op_id`, called from the fold so the device and the server run it identically.
- **Contract** (`packages/domain/src/contract/sync.ts`).
  - `syncPushResponseSchema.superseded: [{op_id, over_op_id}]` (`:33-38`).
  - `lastPushAtSchema {user_id, device_id, at}` (`:41`).
  - `relatorioSummarySchema {id, project_id, status, template_id, seed_version, updated_seq}` (`:49-56`) is a non-strict `z.object`: an additive field is tolerated by older clients.
  - `syncPullResponseSchema` is strict (`:71`).
- **API** (`apps/api/src/sync`).
  - `applyOneIn` looks up the latest op on the path, applies with `applyOp` over the entity rows, and returns `supersededOver` (`apply.ts:340-424`). `ApplyResult` is at `:46-48`.
  - Precedent for a server-side merge: the registry merge logs a `system:registry` remove op (`REGISTRY_MERGE_ACTOR`, `apply.ts:185`, `:398-420`).
  - Routes: push answers `superseded` (`routes.ts:154-155`); pull returns `{ops, seq, summary}` (`routes.ts:166-170`).
  - `last_push_at` is upserted per `(user_id, device_id)` in table `sync_device_push` (`db/schema.ts:78-85`, `pull.ts:102-141`), read into the company summary.
  - The per-user last send is already served; **no new server field is needed** for it.
- **Device sync** (`apps/web/src`).
  - `sync/engine.ts` pushes (`pushPhase`, `:250-265`: `markAcked`, `markDead`, `status.supersededCount += response.superseded.length`). The superseded count is in memory only (`:72-73`) and the op ids are dropped.
  - `pullStream` (`:419-457`) calls `applyPulled` (`db/sync-store.ts:72`), which bulk-puts `remote_ops`, acks own rows and runs `rematerialize(db, keys)` (`sync-store.ts` below `:100`).
  - `db/commit.ts`: `lastAppliedOpId(db, op)` (`:123`) stamps `prev_op_id` from `remote_ops` + outbox; `commitBatch` (`:145`), `commitBatchIf` (`:166`), `undoBatch` (`:327`).
  - Dexie stores (`db/schema.ts:166-211`): `entities`, `outbox` (`*targets, seq, batch_id`), `remote_ops` (`op_id, seq, *targets`), `sync_state`, `local_prefs`, `drafts`, `files`, `thumbs`. There is no merge or conflict store.
- **State and surface.**
  - `state/sync.tsx` computes `counts = syncCounts(rows, reading)` (`:219`), `badgeState` (`:284`, conflict excluded), `lastPushAt` (`:294`) and `supersededCount` (`:295`).
  - `surfaces/sync/sync-status-surface.tsx` (169 lines, route `/sync`, `app.tsx:131`) already renders the heading, the `.sync-headline` with **`role="status"` (`:44`, a live region)**, "Sincronizar agora" at the top (decision C-4), the dead-op row with "Reenviar", the superseded row, the Leituras section (queued readings and pending suggestions), the Último envio list per `(user, device)` (`:126-155`) and the `.sync-foot`.
  - **Missing:** the Enviando per-sheet/per-photo rows, the Baixando section, error rows, the Decisões section, "Como funciona", and the `.sync-summary` badges.
  - `sync.css` holds only the headline, foot and actions.
  - The Home card's downloading state is the bare word "Baixando…" until the summary carries progress (`packages/domain/src/home/cards.ts:91-93`).
- **Banner.** `state/banner-slot.tsx` has `BANNER_PRIORITY` with `'conflict'` first (`:21-22`), `BannerVariant` including `'conflict'` (`:34`), `role?: 'alert' | 'region'` (`:43`) and `bannerCandidates(conditions)` (`:84`). There is **no conflict publisher yet**. It is rendered once, in `surfaces/app-shell.tsx:167`; `.banner[data-variant="conflict"]` is at `components.css:150`.
- **Integrity and TAG.**
  - `integrityFindings(input)` (`packages/domain/src/relatorio/integrity.ts:83`) reports `duplicate_tag {tag, equipment_ids}` (`:94`) and `cert_number_mismatch`.
  - `preIssue` turns duplicates into the section-9 row "TAG X duplicada" (`pre-issue.ts:308-316`, `block-texts.ts:34`).
  - `suggestTag` (`relatorio/tag.ts:79-91`) suffixes `-2`, `-3`… on the base TAG. Transformers are numbered (`TR-1`, `TR-2`).
- **Photos order.** `numberPhotos` sorts by `(captured_at, local_seq, id)` (`photos/numbering.ts:5-21`). Photo additions from both devices are distinct `file` entities and already coexist; no merge code is needed beyond the info row.
- **Tests to extend.**
  - `apps/api/src/sync/template-convergence.integration.test.ts:142` (3.4-API-001, two devices converge);
  - `replay.integration.test.ts` and `porto-seguro.integration.test.ts` (byte-equal replay);
  - `sync.integration.test.ts` (1116 lines);
  - `apps/web/src/sync/engine.test.ts`;
  - `packages/domain/src/sync/counts.test.ts`;
  - `surfaces/sync/sync-status-surface.test.tsx` (asserts `.sync-headline` at `:71,106`);
  - `e2e/sync.spec.ts:48`.
- **E2E two-device pattern.**
  - Two contexts: `browser.newContext()` + `other.setOffline(true/false)` + `syncNowAndReturn` (`e2e/templates.spec.ts:452-500`; also `relatorio.spec.ts:206`, `files.spec.ts:154`).
  - Helpers: `syncNow` / `syncNowAndReturn` / `waitForCompanyPull` (`e2e/support/sync.ts:34-68`), `seedOutbox` / `readStore` / `readDeviceId` (`e2e/support/outbox.ts:138-219`), `pushSuggestion` (`push-server-ops.ts:93`).
  - **Gap:** `workerSeed(index)` seeds **one user per company** (`apps/api/src/db/e2e-worker-seed.ts:59-88`, Ana Alves / Bento Braga, in different companies). A second author in the same company, as in "de Eduardo", needs a second user per worker company, and the leak check (`e2e-leak-check.ts`) must accept it as the same pair.

## Cross-Story Dependencies

Build order: 10.1 → 10.2 → 10.3 → 10.4. Each builds on the previous story's kernel state. 10.4 can start its non-conflict rows in parallel with 10.2/10.3 only if it leaves the Decisões section to them. The later batch owns the e2e for each shared pair.

| Pair | What they share | Interaction e2e owned by |
|---|---|---|
| 10.1 × 10.2 | Same cells (`sheet/*` paths) and the same fold. 10.1's `mergePolicy` decides "rule-merge" vs "contradiction"; 10.2's `conflict` state is entered from that same branch on the pull and push paths. A C/NC pair must merge while a C/NA pair must conflict, and that pair is decided by one function. | 10.2: one sheet with an NC/C merge and a two-readings contradiction; the merge row is listed, only the cell shows in the Conflict view, "Aplicar" leaves the merge intact. |
| 10.1 × 10.3 | The block row: sheet edits (10.1) on a block another device removed (10.3), and the block/equipment create ops (a block added elsewhere is 10.1 information, a duplicate TAG is 10.3). | 10.3: a removed block edited on the other device is not silently rule-merged, and a block added elsewhere is only an information row. |
| 10.2 × 10.3 | The Conflict view dialog and its `.conflict-*` classes, the conflict Banner kind and slot (sheet vs Sumário), the badge `conflict` state and count. The undo of "Aplicar" vs "Manter/Remover" batches. | 10.3: a sheet contradiction and a structure conflict at once; the badge shows Conflito, the Banner priority holds, and each resolves on its own. |
| 10.1 × 10.4 | `merge_info` entries (10.1 emits, 10.4 lists "Mesclado automaticamente" with the overridden text, "for the session"), and the replacement of `supersededCount`/`supersededText`. | 10.4: after a two-device merge the rows show and survive navigation, not a reload (see Conflicts 3). |
| 10.2/10.3 × 10.4 | Contradiction and structure rows in the Decisões section open the Conflict view or carry Manter/Remover, Renomear uma/Manter as duas; the headline counts contradictions. | 10.4: every Decisões row type opens its resolution and disappears after it. |
| 10.4 × Epic 8/9 | Leituras section (queued readings, pending suggestions; ledger 1068 and 1134 count gaps) and "Sincronizar agora". | 10.4 (existing 8.x/9.x sync e2e must stay green). |

Other epics: Epic 11 owns outbox and `remote_ops` retention (ledger 123/153/207). Retention must keep what the merge derivations read (see Conflicts 3). The E12-R1 template upgrade (683) stays with the first story that triggers a template upgrade.

## Conflicts to resolve

1. **Where the merge runs.** The story names `packages/domain/merge` and the server's `superseded` signal. The server applies last-writer-wins by `seq` today, so without a change the later push (C) overwrites NC on both sides. *Conservative:* `mergePolicy` runs **inside the fold** (`applyOp` via `materializeEntity` on the device, `applyOneIn` on the server), keyed on `op.prev_op_id !== cell.op_id` and the path family.
   - Both layers compute the same result, the device merges on pull before it pushes, and replay stays byte-equal.
   - No server-emitted merge ops; `superseded` stays information.
   - Contract bump with `MIN_CONTRACT_VERSION`, because an older `applyOp` would diverge.
   - Non-cell fields (block, location, file caption, point, setup) keep last-writer-wins by `seq` plus an info row.
2. **"Latest edit wins" for text.** EXPERIENCE says "latest edit"; the spine says last-writer-wins by `seq` and `client_ts` is display only. *Conservative:* the winner is the op later in `seq`, and the row shows each version's `client_ts`. Exception: when the NC/C rule applies to the item's result, the NC device's observation wins, as the story says.
3. **"Kept readable for the session" and `merge_info`.** *Conservative:* a kernel `mergeInfo(...)` derives entries from op pairs: pushed ops in the `superseded` response, and pulled ops whose `prev_op_id` differs from the cell op they landed on.
   - The engine keeps them in memory for the tab session, like `supersededCount`, and a reload clears them. They are never an entity and never synced.
   - `syncCounts` takes them as an explicit input.
4. **Where conflict state lives.** *Conservative:* an optional `conflict` on `cellSchema` (the other side's `{op_id, value, actor_id, device_id, client_ts}`), materialized by the fold. Both devices and the server therefore see it.
   - The displayed value while in conflict is the `seq`-later one.
   - "Aplicar" writes a put with `prev_op_id = cell.op_id`, which clears it.
   - The crop comes from `source_suggestion_id` → suggestion `source.photo_id` + bbox.
   - This is a row-shape and reducer change (contract bump + MIN).
   - Whether a contradiction also becomes a pre-issue row is not in the story: leave it out and ask.
5. **Removed vs edited.** *Conservative:* the fold marks the block row with a removal conflict when a sheet or block op from another device lands on a tombstone whose removal it did not see, judged by `prev_op_id`.
   - "Manter" writes a `removed_at = null` put; "Remover" re-puts `removed_at` with the current `prev_op_id`.
   - Same bump rule as Conflict 4.
6. **Duplicate TAG texts and suffix.** `pre-issue` already says "TAG X duplicada" and 4.x says "— Renomear"; 10.3 says "… foi criada em dois aparelhos". *Conservative:*
   - Sync status and the Sumário Banner use the 10.3 text when the two equipment creates carry different `device_id`s. The pre-issue row keeps its text.
   - "Later" means the higher create `seq`.
   - The suffix is the next free one from `suggestTag`'s rule (`-2` unless taken, then `-3`), consistent with Epic 9's "SEC-C09-2". Written as an `equipment/{id}/tag` put.
7. **Conflict view: mock vs story.**
   - The 86 mock is a full page region with a "Mesclado automaticamente" list and a "Resolver" button. The story and EXPERIENCE say the merged rest is not shown, the button is "Aplicar", and the view is a modal dialog.
   - *Conservative:* a React Aria modal dialog with 86's `.cv-*` content, no merged list (it lives in Sync status), and the button "Aplicar". Esc/back closes without writing.
   - Radiogroup semantics as in 86. One radiogroup per cell, with "Aplicar" enabled once every cell has a pick.
8. **Headline live region.** The 85 mock and the current code (`sync-status-surface.tsx:44`) put `role="status"` on `.sync-headline`, but the surface must not be `aria-live`. *Conservative:* drop the role; the badge announcer is the only live region.
9. **Headline copy and sections.**
   - 85 shows "1 contradição para resolver · 31 fotos enviando · 3 leituras prontas" and a section named "Decisões"; `key-sync-status` calls it "Conflitos"; the story example is "3 fichas e 12 fotos aguardando · 2 leituras na fila". *Conservative:* the kernel composes the counts in the story's order, with the contradiction count first when there is one. The headings follow 85 (Leituras, Enviando, Baixando, Último envio, Decisões).
   - The disclosure: the mock says "Como funciona a mesclagem", the story says "Como funciona". *Conservative:* the mock's verbatim label.
10. **Download progress line.** The summary has no totals (ledger 106 and 166). *Conservative:* 10.4 adds optional counts to `relatorioSummarySchema` (sheets and photos, total vs on-server), computed by a kernel function. This is an additive, non-strict field: `CONTRACT_VERSION` bump, no MIN bump. The Home card counted form (166) closes with it.
11. **Per-user last send.** It is already served and rendered per `(user, device)`, as in 85. *Conservative:* no new server field. 10.4 only formats "Último envio de ⟨nome⟩: dd/mm hh:mm" in the kernel. Keep one row per device, as the mock does.
12. **Badge precedence.** Not specified. *Conservative:* conflict before error before offline before pending, which matches the banner priority.
13. **Who the other author is in tests.** One user per worker company. *Conservative:* 10.1's batch adds a second user per worker company (same pair, so the leak check is unchanged) and uses the same user on two contexts only where authorship is not asserted.

Contract bumps: 10.1 (reducer: 10, MIN 10), 10.2 (cell conflict: +1, MIN), 10.3 (block removal conflict: +1, MIN), 10.4 (summary progress: +1, MIN unchanged). Each bump is main + 1 at merge time.

## Carry-over (one agent batch, first)

- **E9-A5, ledger ownership** (retro R9-15, item 77; `_bmad-output/implementation-artifacts/epic-9-retro-2026-09-29.md:53,98`). Proof: 0 open entries owned by a finished review, retro or batch.
  - Close entry 1113 (summary at `deferred-work.md:1110`, state `:1113`) as fixed by E9-Q2 in PR #62.
  - Close 1125 (`:1122`) as refuted by the QA (known-open (g)).
  - Re-own 1065, 1071, 1077, 1095, 1101 and 1137, which still say "owner: Epic 9 integrated review":
    - 1071 and 1137 (Sync status Leituras counts vs pre-issue and Sumário; caption suggestions not counted) go to **10.4**;
    - 1065 (env provenance glyph), 1077 (display retry UI) and 1095 (abandoned panel photo) go to the carry-over batch, or to Epic 11 with a reason;
    - 1101 (the panel pipeline e2e only in `test:e2e:full`) goes to E9-A1.
  - Route 1149 (accept the narrowing, close), 1155 (add an e2e that fills a cell under dictation in the `verify` set; owner this batch) and 1161 (per-batch atomic apply for client pushes; owner **10.1**, since the merge fold and "Aplicar" batches depend on batch semantics).
  - Also re-own 1026 (E78-R2, "owner: Epic 9 carry-over batch", still open).
- **E9-A7, split `packages/domain/src/relatorio/suggestions.ts`** (905 lines, 68 exports) by concern, with no behavior change and the tests unchanged:
  - rows and targets: `suggestionRowsOf` … `suggestionView`, `:37-240`;
  - nameplate and registry: `:242-300`;
  - ops and texts: `:306-487`;
  - plate crop geometry: `:490-622`;
  - readings texts: `:629-644`;
  - measurement and display: `:654-896`;
  - env: `:761-780`.

  Keep `relatorio/index`/package re-exports stable. The target "no `relatorio/` file over 500 lines" also catches **`relatorio/readings.ts` (653 lines)**. `tree.ts` (497) and `pre-issue.ts` (457) are near the limit.
- **E9-A9, speech default `none`.** Set `docker-compose.yml:113` (`${VITE_SPEECH_ENGINE:-webspeech}`) and `.env.example:20` to `none`. The code fallback (`apps/web/src/speech/engine.ts:8,30`, "unset: `webspeech`") should follow, so that a default build sends no audio. Tests keep `fake` via the `build:e2e` bundle (`e2e/support/speech.ts`, `speech/fake-engine.ts`).
- **Ledger entries for Epic 10** (no entry is literally owned by "Epic 10"; these are the ones the Epic 9 triage routed here, by summary line):
  - 106 (per-relatório progress in the pull summary) and 166 (Home "Baixando… n de m") → 10.4;
  - 160 (does "Reenviar" of a dead create re-send later acked puts?) → 10.4;
  - 334 (a server-merged registry id left as a permanent local duplicate) → 10.1, since the same materialize path is touched;
  - 370 (two devices create two `empresa` rows; no convergence rule) → 10.1, merge policy for a company-scope singleton;
  - 310 (a stale instrument panel while another device edits) → 10.4 or carry-over (a live re-read of the panel);
  - 112 (coalescing option (a), architect) stays with Matheus; 683 (E12-R1) stays with its template-upgrade owner.

## Coordinator decisions (2026-09-29, before the batches)

Matheus asked (2026-09-29) for Epic 10 end to end with the token economy of Epics 5-9, the Dev model and effort of each story, parallel batches where possible, then one integrated code review and human-style Playwright QA, fixes, and the retrospective. Every agent runs on opus. Product questions stay open for Matheus; each batch takes the conservative reading and lists it as an open question in its PR (E4-A8).

- **Conflicts 1-13.** Every conservative resolution above is adopted as written, with one change to Conflict 8: the code drops `role="status"` from the headline; the mock file is not edited (the story wins; the deviation is noted in the PR). "Does a contradiction also become a pre-issue row" stays an open question.
- **E9-A1 (gate budget) is still undecided by Matheus.** Batches proceed under the current rule: a green, complete `pnpm verify` pasted in every PR. The 900 s budget miss is recorded per PR with the gate time and the lock wait; nothing else waits on E9-A1.
- **E9-A2 and E9-A3 are now playbook rules** (`epic-batch-orchestrator.md`, 2026-09-29): no merge on a red or partial gate, gates run in the background with short polls, per-batch scratch files, lock wait recorded in every PR.
- **Batches and waves.** Wave 1, in parallel: **C** (carry-over: E9-A5, E9-A7 including `readings.ts`, E9-A9, ledger 1155; ledger 1065, 1077 and 1095 are either fixed if small or re-owned to Epic 11 with a reason; Dev model opus, effort medium; port base 42) and **M** (Story 10.1, opus high, port base 41; also owns the second user per worker company, ledger 1161, and ledger 334/370 only when its fold change covers them, else re-owned with a reason). Wave 2, after M merges, in parallel: **X** (Stories 10.2 + 10.3, opus high, port base 43; they share the Conflict view and the fold's conflict marks) and **S** (Story 10.4, opus medium, port base 44; also ledger 1071, 1137, 106, 166, 160, 310).
- **X/S seam (Sync status contradiction rows).** S builds the whole surface, including a "Decisões" section that renders from a kernel list of open contradictions, with an empty-list default when the kernel exposes no conflict data yet. X owns `cell.conflict`, the block removal conflict, the kernel function that lists open contradictions per relatório, the Conflict view dialog, and the wiring from a Sync status contradiction row to that dialog, with the e2e for that pair. Whichever of X and S merges second resolves the seam and runs `test:e2e:full`.
- **Contract versions.** Each batch that changes the reducer or a row shape bumps `CONTRACT_VERSION` to main + 1 at merge time with a dated note, and re-bumps after merging a main that moved; M, and X for its two shape changes (one bump for the batch), also raise `MIN_CONTRACT_VERSION`; S raises only `CONTRACT_VERSION`.
- **Cross-story tests (E9-A4).** Each pair in "Cross-Story Dependencies" is owned by the later batch named there; with the seam above, X owns every conflict pair and S owns the merge_info row pair with 10.1. A 390 px check asserts the Conflict view's option rows and the Sync status lists inside their own scroll containers.
- **Two devices in e2e.** Two browser contexts, two users of the same worker company from M's seed, "Sincronizar agora" instead of the timer; every @p0 of a merge or conflict asserts the committed cell or block state in IndexedDB on both devices and the server row, not only the screen.
- **Test time.** Feature batches do not raise `PARALLEL_WORKERS`. M, X and S touch the sheet, the Sumário or shared sync state and run `test:e2e:full` before their PR.
