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
 */
export const CONTRACT_VERSION = 4;

/**
 * The oldest version the server still answers pulls for (a constant, not an env variable).
 * 2: a version-1 bundle cannot parse the `user/{id}` creates every company stream now
 * carries, so it must stop pulling and show "Atualizar" (AD-13).
 * 3: a version-2 bundle cannot parse the `template/{id}/seed_version` put a company stream
 * carries once its standard template was upgraded, so it updates the same way.
 * 4: a version-3 bundle cannot parse a `point/{id}/action` (or `priority`, `deadline`,
 * `owner`) put a relatório stream carries once a point holds an action, so it updates too.
 */
export const MIN_CONTRACT_VERSION = 4;

export const CONTRACT_VERSION_HEADER = 'x-contract-version';
