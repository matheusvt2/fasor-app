---
title: 'e30c: a notice when a local this device answered was removed elsewhere (Story 30.4)'
type: 'feature'
created: '2026-11-25'
status: 'done'
dev_model: opus
dev_effort: high
context:
  - '_bmad-output/planning-artifacts/epics.md (Story 30.4)'
  - '_bmad-output/implementation-artifacts/epic-30-context.md'
  - '_bmad-output/specs/spec-fasor/source-deltas.md (row of 2026-11-24, Q-8)'
---

# e30c: a notice when a local this device answered was removed elsewhere

Story 30.4, batch e30c, Epic 30 wave 2, port base 30, branch `e30c-removed-local-notice` from `origin/main` `8fe202ef`.
Built by the batch agent directly (no review loop in the batch, Epic 25 token economy; the coordinator runs one review per wave).

## The decision and its reading

Matheus, 2026-11-24, on Q-8: "tem que ser uma notificacao". The surfaces, the copy and the two actions are the coordinator's
reading written in the story, open to him; the PR lists them.

## I/O matrix (what the fold does)

| Input | Order | Result on the local (cabine) row |
| --- | --- | --- |
| Site answer, site photo create or site point create from a device | the local live | `site_modified_by`, `site_modified_at` = the op's actor and time |
| The same, from a device | the local removed | as above, plus `removal_conflict {removed_by, removed_at, edited_by, edited_at}` |
| The same from the server device | any | attributed, never marked |
| `location/{id}/removed_at` remove from a device, `meta.seen_modified_at` = the row's `site_modified_at` | work seen | removed, `removed_by`, no mark |
| The same, the stamp differs and the row holds `site_modified_at` | work not seen | removed and marked |
| The same with no stamp (a bundle before 61), or a row with no `site_modified_at` | any | removed, no mark |
| A put of null ("Restaurar local", the restore list) | any | live, `removed_by` and the mark dropped |
| A put of the removal's own time on the removed local ("Deixar removido") | any | stays removed at the same time, the mark dropped |

*(2026-11-25, fix batch e30h, item 1: the rule above is amended; contract stays 61, no deploy of 61 had happened.)* The server
keeps the rows the reducer before contract 61 folded and a device re-folds the whole log, so the rows above disagreed for an
old history (a false "Local removido com respostas" on devices only). The derived columns are now written only from ops that
carry a contract-61 stamp:

| Input | Order | Result on the local (cabine) row |
| --- | --- | --- |
| ~~Site answer, site photo create or site point create from a device~~ The same carrying `meta.seen_removed_at` (the local's `removed_at` as the device held it; the commit's `stampSeen` writes it) | the local live | `site_modified_by`, `site_modified_at` = the op's actor and time |
| The same, stamped | the local removed, the stamp differs from its `removed_at` (the removal not seen) | as above, plus `removal_conflict` |
| The same, stamped | the local removed, the stamp equals its `removed_at` (the removal seen) | attributed, no mark |
| Site work without the stamp (a bundle before 61, ~~the server device~~ a server op, a fixture) | any | not attributed, never marked (as before 61) |
| `location/{id}/removed_at` remove without `meta.seen_modified_at` (a bundle before 61) or from the server | any | removed, ~~`removed_by`~~ no `removed_by`, no mark (as before 61) |
| "Deixar removido" (a put of the removal's own time on the removed local) | any | ~~`removed_by` the confirmer~~ (item 5) keeps the original `removed_by`; the mark dropped |

Consequence, open to Matheus: answers written before the deploy carry no stamp, so a local answered before the deploy and
removed after it by a device that had not seen those answers raises no notice (the answers are kept, as always, and stay
recoverable through "Restaurar ficha removida" under the usual rules). Only work written on contract 61 or later is ever told.

## Code map

- Kernel: `schemas/entities.ts` (the cabine's four derived columns; the mark schema moved above the location schema),
  `ops/apply.ts` (`carriedSiteLocationId`, `siteAttributed`, `writeLocationRemovedAt`, `targetsOf`, `createRow`),
  `merge/stamp.ts` (the location stamp), `merge/conflicts.ts` (`LocationRemovalDecision`, `openDecisions`,
  `decisionKey`, `syncDecisionRows` title, `decisionText`, `locationRemovalToastText`, `LOCATION_REMOVAL_TITLE`),
  `relatorio/removal.ts` (`holdsLocationRemovalMark`, `localSiteWork`), `relatorio/sumario.ts` (the restore cut),
  `sync/status.ts` (`SyncDecisionRow`), `ops/attribution.ts`, `contract/version.ts` (61, MIN 61).
- Web: `db/decision-store.ts`, `db/prefs.ts`, `state/banner-slot.tsx` (`title`), `state/removed-local-notice.tsx`,
  `surfaces/app-shell.tsx`, `surfaces/sync/{conflict-banner,resolvable-decisions,decision-actions,sync-sections}.tsx`,
  `surfaces/relatorio/relatorio-ops.ts`, `copy/pt-br.ts`.

## Acceptance criteria and their tests

| AC | Test |
| --- | --- |
| 1 Removal first: Toast once, Banner, Decisões row naming local, user, time, N; answers kept | 30.4-UNIT-001, 30.4-API-001, 30.4-E2E-001a |
| 2 Work first: both devices show Banner and row; nothing deleted | 30.4-UNIT-001, 30.4-API-001, 30.4-E2E-001b |
| 3 "Restaurar local": local, sheets and answers back on both; notice gone | 30.4-UNIT-003, 30.4-API-001, 30.4-E2E-001a |
| 4 "Deixar removido": notice gone everywhere, local stays removed and in the restore list | 30.4-UNIT-004, 30.4-API-001, 30.4-E2E-001b |
| 5 Mark stands and the relatório is issued: the restore list still offers the local | 30.4-UNIT-003, 30.4-E2E-001c |
| 6 A role without `relatorio.fill`: both actions disabled with their reason | 30.4-E2E-001c |
| 7 A device on contract 60: 426 and "Atualizar" | 30.4-API-001, 30.4-E2E-002 |

## Narrowings and open readings

- The counts are the site work the removed local holds when the decision is listed (`localSiteWork`: answered items,
  live site photos, live points), not only the part the remover did not see; the writer named is the latest one. The
  story put the counts in the mark; the mark carries who and when only, as the block's does.
- A site photo or point re-linked to a removed local by a `location_id` put is not attributed (creates only).
- "Deixar removido" offers no "Desfazer": an undo cannot put the mark back. "Restaurar local" keeps the existing undo,
  which removes the local again without a new notice.
- The Toast shows on the device whose signed-in user wrote the work (the mark's `edited_by`), once per removal per device.
- The Decisões section note still says "dois casos de estrutura" (copy verbatim from the mock), left as written.

## Auto Run Result

See the PR body: red and green runs, the gate table and its load line.
