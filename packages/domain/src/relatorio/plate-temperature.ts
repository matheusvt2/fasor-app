import type { BlockDefinition } from '../seed/schema.ts';

/*
 * Fix batch e25r (R-1 and E24-A1 items 1 and 2 of the Epic 24 retrospective): one parse of a plate
 * temperature and one list of the plate fields a definition reads a temperature from. The sheet's own
 * correction (`temperature-correction.ts`), the issue's projection (`print/last-results.ts`, the
 * entry's `plate_measured`) and the next visit's "like with like" rule (`visit-context.ts`) all read a
 * temperature through `plateCelsiusOf`, so the current visit and the previous one are read by the same
 * rule: a temperature counts only as a finite number. This module imports no evaluation, so each of
 * them may import it without a cycle.
 */

/** A plate number cell's value in °C: measured, its raw a plain decimal ("40", "-5", "27.5") and finite; else null. */
export function plateCelsiusOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const cell = value as { raw?: unknown; state?: unknown };
  if (cell.state !== 'measured' || typeof cell.raw !== 'string' || !/^-?\d+(\.\d+)?$/.test(cell.raw)) return null;
  const celsius = Number(cell.raw);
  return Number.isFinite(celsius) ? celsius : null;
}

/**
 * The plate fields a definition reads a temperature from: every `oil_field` and `dry_field` of its
 * tests' `temperature_correction` and of its measurement tests' `winding_correction`, sorted, no
 * duplicate. Empty when it names none (every definition of v1 to v12, and every test corrected by the
 * solid factor at the cabine's ambient).
 */
export function plateTemperatureFields(definition: Pick<BlockDefinition, 'tests' | 'measurement_tests'>): string[] {
  const keys = new Set<string>();
  const add = (key: string | undefined) => {
    if (key !== undefined) keys.add(key);
  };
  for (const test of definition.tests) {
    add(test.temperature_correction?.oil_field);
    add(test.temperature_correction?.dry_field);
  }
  for (const test of definition.measurement_tests ?? []) {
    add(test.winding_correction?.oil_field);
    add(test.winding_correction?.dry_field);
  }
  return [...keys].sort();
}
