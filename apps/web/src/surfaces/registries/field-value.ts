/**
 * Whether a registry field already holds the value a commit would write (Epic 2 retro
 * D-8): a blur or an Enter that changes nothing must not put the same value again.
 * Registry field values are JSON (strings, numbers, booleans, null, the instrument's
 * `{raw, unit}` test default and the client's site list), so their JSON text compares.
 */
export function sameFieldValue(current: unknown, next: unknown): boolean {
  return JSON.stringify(current ?? null) === JSON.stringify(next ?? null);
}
