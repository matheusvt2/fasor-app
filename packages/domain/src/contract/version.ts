/*
 * AD-13 contract skew. Families and routes are append-only, so the push route
 * never reads the version header: every client's ops are accepted. Only a
 * pull compares the header with `MIN_CONTRACT_VERSION` and answers
 * `426 contract_outdated` to an outdated client, which keeps pushing, stops
 * pulling and shows the "Atualizar" state.
 */

/** The version this bundle speaks; sent on every sync request. */
export const CONTRACT_VERSION = 1;

/** The oldest version the server still answers pulls for (a constant, not an env variable). */
export const MIN_CONTRACT_VERSION = 1;

export const CONTRACT_VERSION_HEADER = 'x-contract-version';
