/*
 * AD-13 contract skew. Families and routes are append-only, so the push route
 * never reads the version header: every client's ops are accepted. Only a
 * pull compares the header with `MIN_CONTRACT_VERSION` and answers
 * `426 contract_outdated` to an outdated client, which keeps pushing, stops
 * pulling and shows the "Atualizar" state.
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
 */
export const CONTRACT_VERSION = 7;

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
 */
export const MIN_CONTRACT_VERSION = 7;

export const CONTRACT_VERSION_HEADER = 'x-contract-version';
