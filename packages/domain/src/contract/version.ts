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
 */
export const CONTRACT_VERSION = 2;

/**
 * The oldest version the server still answers pulls for (a constant, not an env variable).
 * 2: a version-1 bundle cannot parse the `user/{id}` creates every company stream now
 * carries, so it must stop pulling and show "Atualizar" (AD-13).
 */
export const MIN_CONTRACT_VERSION = 2;

export const CONTRACT_VERSION_HEADER = 'x-contract-version';
