import type { ProjectRow } from '../schemas/entities.ts';

/*
 * Story 2.4 AC1's "integrity" rule, mirroring `isInstrumentReferenced`: a client a live
 * Project still points at can only be archived, never deleted. Unlike the instrument
 * reference (a copied header inside a sheet cell), the client reference is `Project.client_id`
 * itself — a real id reference, never copied (AD-19 only exempts manufacturer/voltage_class).
 */

/** True when at least one live project still points at this client. */
export function isClientReferenced(clientId: string, projects: readonly ProjectRow[]): boolean {
  return projects.some((project) => project.client_id === clientId && project.removed_at === null);
}
