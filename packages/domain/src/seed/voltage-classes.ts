import type { WordRow } from '../registry/word-row.ts';

/*
 * F-09 (review 2026-10-06, D4 by Matheus): the voltage classes a company receives with the
 * standard template, so a plate's "Tensão de placa" offers the common ones without typing.
 * Stored as the kV number (`parseVoltageClassKv`'s form, the by-value name the sheets read,
 * AD-19); no manufacturer is seeded. A company that already holds any voltage class gets
 * none (`apps/api` `seedStandardTemplate`).
 */

/** 13,8 · 15 · 24,2 · 36,2 kV, in reading order. */
export const SEEDED_VOLTAGE_CLASSES: readonly string[] = ['13,8', '15', '24,2', '36,2'];

/** One seeded `registry/voltage_class/{id}` row. Pure: the same id and name give the same row. */
export function seededVoltageClassRow(id: string, name: string): Extract<WordRow, { kind: 'voltage_class' }> {
  return { id, kind: 'voltage_class', name, gender: null, number: null, removed_at: null };
}
