/*
 * Story 2.5 AC4: the normalized form two near-duplicate registry names (manufacturer,
 * voltage_class) collapse to before the server compares them (`apps/api/src/sync/apply.ts`).
 * NFD-normalize so a combining diacritic splits from its base letter, strip the combining
 * marks, trim surrounding whitespace, collapse internal whitespace runs to one space, then
 * lowercase — "Schneider" and "SCHNEIDER" (incidentally "Blütrafos"/"Blutrafos", and also
 * "Schneider Eletric"/"Schneider  Eletric") land on the same string.
 */
export function normalizeRegistryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
