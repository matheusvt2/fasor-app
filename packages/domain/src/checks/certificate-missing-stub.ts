import type { RelatorioSnapshot } from '../schemas/snapshot.ts';

/*
 * Story 7.5 (Design Notes, cross-batch wiring): the pre-issue row for an instrument whose
 * certificate file is missing is this batch's; the rule that decides "missing" is Epic 7
 * batch G2's (section 11, Story 7.3), which is not on main while this batch is built. This
 * local stub stands in for it with the narrowest reading (no `certificate_file_id` on the
 * registry row) and is replaced by G2's kernel function when both are merged
 * (`deferred-work.md`, "certificate-missing stub").
 */

/** The instruments the snapshot carries whose registry row names no certificate file, in snapshot order. */
export function instrumentsMissingCertificate(snapshot: Pick<RelatorioSnapshot, 'instruments'>): RelatorioSnapshot['instruments'] {
  return snapshot.instruments.filter((instrument) => instrument.removed_at === null && instrument.certificate_file_id === null);
}
