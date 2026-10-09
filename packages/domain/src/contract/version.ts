/*
 * AD-13 contract skew. Families and routes are append-only, so the push route
 * accepts every client's ops. A pull compares the header with `MIN_CONTRACT_VERSION`
 * and answers `426 contract_outdated` to an outdated client, which keeps pushing,
 * stops pulling and shows the "Atualizar" state.
 *
 * One exception on the push (2026-09-29, E10-Q6): a client older than
 * `MARK_AWARE_CONTRACT_VERSION` (or one sending no header) does not stamp what it saw, so
 * its plain edit would settle a contradiction it never saw. A push of such a client that
 * writes a `sheet/*` put on a cell holding `conflict`, or a `block/{id}/removed_at` write on
 * a block holding `removal_conflict`, is answered `426 contract_outdated` whole, with
 * nothing applied; its other pushes are accepted as before.
 */

/**
 * The version this bundle speaks; sent on every sync request.
 *
 * 2 (2026-09-22, Epic 1 retro A2): the `user` row carries `council`, `registration_number`
 * and `title` instead of `professional_registration`, the server-only `user/{id}` create
 * family is new, and the per-op reject code `op_forbidden` is new.
 *
 * 3 (2026-09-25, E12-Q4): the server-only `template/{id}/seed_version` put family is new
 * (the seed moves an unedited standard template to the current seed version).
 *
 * 4 (2026-09-25, Story 6.6): the `point` row carries `action`, `priority`, `deadline` and
 * `owner`, so the `point/{id}/{action|priority|deadline|owner}` put families are new.
 *
 * 5 (2026-09-26, Story 8.1): the `suggestion` row carries an optional `hint`
 * (`{create_registry_entry: {kind: 'manufacturer', name}}` or null); a device's photo
 * `file/{id}` create may carry `reading_kind`, `reading_target` and `reading_status:
 * 'queued'`; and the push route refuses a client photo create whose `reading_status` is
 * neither `none` nor `queued`, or `queued` without a `reading_kind` (`op_invalid`).
 *
 * 6 (2026-09-27, Stories 7.4/7.5): the relatório setup carries `parecer`, so the
 * `relatorio/setup/parecer` put family is new, and the `generation_job` row carries
 * `started_at`, so the server-only `generation_job/{id}/started_at` put is new.
 *
 * 7 (2026-09-28, Story 9.2): `reading_kind` and `reading_target` are client file fields, so
 * the `file/{id}/reading_kind` and `file/{id}/reading_target` put families are new; a
 * `reading_kind` put on a photo also sets its `reading_status` to `queued` (`applyOp`), and
 * the push route sends the reading when the photo's bytes are already stored.
 *
 * 8 (2026-09-28, Story 9.3): the photo row carries `people_in_photo` ("Pessoas na foto", a
 * photo never sent to the prose provider), so the `file/{id}/people_in_photo` put family is new.
 *
 * 9 (2026-09-29, E9-Q2/Q3): a client `file/{id}/reading_kind` put is narrowed to `plate` (on a
 * photo whose stored kind is `panel`, the Story 9.2 re-target) or null (its undo), and a
 * `file/{id}/reading_target` put to an object or null; the push route answers anything else
 * `op_invalid`. A `reading_kind` put queues only a kind that differs from the stored one, and a
 * null one sets `reading_status: none` (`applyOp`, `readingKindPutStatus`). The undo of a
 * re-target puts both null and a settled panel suggestion `discarded` (`invertBatch`). No new
 * family, but the reducer changed: `MIN_CONTRACT_VERSION` goes to 9 too.
 *
 * 10 (2026-09-29, Story 10.1): the fold merges a concurrent `sheet/*` put by rule
 * (`merge/policy.ts`): a put whose `prev_op_id` is not the cell's head op no longer simply
 * replaces the cell (NC stands over C, a filled cell over an empty one, the NC device's
 * observation over the other), and a sheet cell may carry an optional `merge` record
 * (`cellMergeSchema`). No new family, but the reducer and the cell shape changed:
 * `MIN_CONTRACT_VERSION` goes to 10 too.
 *
 * 11 (2026-09-29, Story 10.4): the company pull summary's relatório entries carry an optional
 * `progress: {sheets, photos}` (the server's live blocks and photo files of each), for the
 * "Baixando… 12 de 30 fichas" line. Additive on a non-strict object: a version-10 bundle
 * ignores it and reads "Baixando…" alone, so `MIN_CONTRACT_VERSION` stays 10.
 *
 * 12 (2026-09-29, Stories 10.2 and 10.3): the fold marks a true contradiction on the cell
 * (`cell.conflict`, the displaced side) and a block removed on one device and edited on the
 * other (`block.removal_conflict`, plus `block.removed_by`, the actor of the latest
 * `removed_at` write). A device stamps what it saw on its ops, `meta.standing_op_id` on a
 * `sheet/*` put (with `meta.seen_conflict_op_id`, the `conflict` it saw: a sequential put
 * keeps a `conflict` it did not see) and `meta.seen_modified_at` on a `block/{id}/removed_at`
 * write, and the fold reads them. The session information gains the `block_added` rule (a
 * `MergeInfo` whose `over_op_id` is null). No new family, but the reducer and two row shapes
 * changed: `MIN_CONTRACT_VERSION` goes to 12 too.
 *
 * 13 (2026-09-29, E10-Q2): the undo of a resolution brings the decision back. An op may
 * carry `meta.restore` (the marks its original cleared: `{conflict, shown_op_id}` on a
 * `sheet/*` put, `{removed_by, removal_conflict}` on a `block/{id}/removed_at` write), which
 * a sequential fold writes back, and a sheet cell may carry an optional `shown_op_id` (the
 * op whose value it shows when that is not its head). No new family, but the reducer and
 * the cell shape changed: `MIN_CONTRACT_VERSION` goes to 13 too.
 *
 * 14 (2026-09-30, ledger 1131, batch C): a gallery import batch creates its photos with no
 * reading and, once the batch is answered or closed, asks for the caption reading of each
 * photo left with no sheet, caption or "Pessoas na foto" mark with a client
 * `file/{id}/reading_kind = 'caption'` put. The push route accepts that put only on a photo
 * with no reading and no context (`clientReadingKindPutAllowed`); a version-13 server refuses
 * it (`op_invalid`), so a version-14 client must not talk to one. No new family and no row
 * shape change; `MIN_CONTRACT_VERSION` stays 13.
 *
 * 15 (2026-10-07, Story 13.8): the emission audit. The server-only `audit_run/{id}` create and
 * `audit_run/{id}/{field}` put families are new (the `audit_run` row: status, findings,
 * prompt version, timestamps), and so are the route `POST /api/relatorios/{id}/audit` and the
 * error code `audit_running`.
 *
 * 16 (2026-10-09, PR #121 review): the conclusion text merge. A `sheet/{id}/conclusion/text`
 * put may carry `meta.composed = true` (the text the app composed and confirms with
 * `text_status = confirmed`: "Concluir ficha", "Confirmar", "Substituir"); the fold makes a
 * concurrent flagged put over a standing `text_status = edited` a contradiction
 * (`cell.conflict`) instead of `latest_text`, and the Conflict view resolves the text, its
 * status and its basis as one unit (three puts). No new family, but the reducer changed:
 * `MIN_CONTRACT_VERSION` goes to 16 too; 2026-10-09, Matheus.
 */
export const CONTRACT_VERSION = 16;

/**
 * The oldest version the server still answers pulls for (a constant, not an env variable).
 * 2: a version-1 bundle cannot parse the `user/{id}` creates every company stream now
 * carries, so it must stop pulling and show "Atualizar" (AD-13).
 * 3: a version-2 bundle cannot parse the `template/{id}/seed_version` put a company stream
 * carries once its standard template was upgraded, so it updates the same way.
 * 4: a version-3 bundle cannot parse a `point/{id}/action` (or `priority`, `deadline`,
 * `owner`) put a relatório stream carries once a point holds an action, so it updates too.
 * Stays 4 at contract 5 (2026-09-26, Story 8.1): a version-4 bundle parses every op a
 * version-5 stream carries -- its suggestion schema strips the unknown `hint` key, and the
 * photo row's reading fields were already in its schema -- so no pull is refused.
 */
/*
 * 6 (2026-09-27): a version-5 (or older) bundle cannot parse a `relatorio/setup/parecer` put
 * nor a `generation_job/{id}/started_at` put a relatório stream carries once a parecer is set
 * or a job runs, so it updates too.
 */
/*
 * 7 (2026-09-28, Story 9.2): a version-6 (or older) bundle cannot parse a
 * `file/{id}/reading_kind` or `file/{id}/reading_target` put, which a relatório stream carries
 * once a block is created by photographing the equipment, so it updates too.
 *
 * 8 (2026-09-28, Story 9.3): a version-7 (or older) bundle cannot parse a
 * `file/{id}/people_in_photo` put a relatório stream carries once a photo is marked
 * "Pessoas na foto", so it updates too.
 *
 * 9 (2026-09-29, E9-Q2/Q3): a version-8 bundle's `applyOp` derives a different
 * `reading_status` from a null or same-kind `reading_kind` put, and its undo of a 9.2 create
 * pushes a `panel` put the route now refuses, so it updates too.
 *
 * 10 (2026-09-29, Story 10.1): a version-9 bundle's `applyOp` lets a concurrent C land over
 * an NC (or a clear over a filled cell) that a version-10 fold keeps, and its cell schema
 * strips the `merge` record, so its rows would diverge from the server's: it updates too.
 *
 * Stays 10 at contract 11 (2026-09-29, Story 10.4): the summary's `progress` is additive.
 *
 * 12 (2026-09-29, Stories 10.2 and 10.3): a version-11 (or older) bundle's cell and block
 * schemas strip `conflict`, `removal_conflict` and `removed_by`, and its fold ignores the meta
 * stamps, so its rows would diverge from the server's: it updates too.
 *
 * 13 (2026-09-29, E10-Q2): a version-12 bundle's fold ignores `meta.restore` and its cell
 * schema strips `shown_op_id`, so it would fold the undo of a resolution without the marks
 * the server writes back: it updates too.
 *
 * Stays 13 at contract 14 (2026-09-30, ledger 1131, batch C): a version-13 bundle parses the
 * `file/{id}/reading_kind = 'caption'` put a relatório stream now carries and its `applyOp`
 * derives the same `queued` status from it (`readingKindPutStatus`), ~~so no pull is refused~~.
 * Superseded on 2026-10-05 by the 14 paragraph below: MIN goes to 14 all the same.
 *
 * 14 (2026-10-05, Story 11.6): `LLM_PROVIDER=bedrock` sends a caption reading's photo to a
 * cloud model. A version-13 bundle queues that reading at pick time, before the import batch
 * is answered, so a photo later marked "Pessoas na foto" or given a caption could already be
 * on its way; a version-14 bundle asks only once the batch is answered or closed (ledger 1131).
 * No contract change at 14, but a version-13 bundle must update before a cloud LLM is wired.
 *
 * 15 (2026-10-07, Story 13.8): a version-14 bundle cannot parse an `audit_run/{id}` create nor
 * an `audit_run/{id}/{field}` put: its `opSchema` refuses an unknown family, so the whole
 * pulled page fails (`invalid_response`) instead of the unknown family being skipped. A
 * relatório stream carries those ops once anyone taps "Conferir antes de emitir", so the
 * version-14 bundle updates too.
 *
 * 16 (2026-10-09, PR #121 review; Matheus): a version-15 bundle folds a composed conclusion
 * text (`meta.composed`) over an edited one as `latest_text`, where a version-16 fold marks a
 * contradiction, so its rows would diverge from the server's: it updates too.
 */
export const MIN_CONTRACT_VERSION = 16;

/**
 * E10-Q6 (2026-09-29): the first version whose client stamps what it saw on its writes
 * (`meta.standing_op_id`, `seen_conflict_op_id`, `seen_modified_at`, contract 12). The push
 * route refuses a push from an older client (or one with no header) that touches a cell or
 * block holding a conflict mark, since its plain write would clear a mark it never saw.
 */
export const MARK_AWARE_CONTRACT_VERSION = 12;

export const CONTRACT_VERSION_HEADER = 'x-contract-version';
