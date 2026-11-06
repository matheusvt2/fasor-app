import { findSeed } from './definitions.ts';

/**
 * Story 22.4: whether a sheet's Não ensaiado reason is a defect reason of its seed version
 * (`notTestedReasonSchema.defect`), the one seed fact the conclusion floor reads. False for
 * an unknown version or key, and for every reason a shipped seed holds today: seed v12
 * (Story 22.7) adds the first one. Kept beside the seed lookup rather than in it, so a kernel
 * test can stand a test seed behind `findSeed`.
 */
export function isDefectReason(seedVersion: string, key: string): boolean {
  return findSeed(seedVersion)?.not_tested_reasons.find((reason) => reason.key === key)?.defect === true;
}
