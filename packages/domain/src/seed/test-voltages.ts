/*
 * Seed v12 (Story 22.8, the coordinator's reading listed for Bruno): the test voltages a row of an
 * insulation table may take, in kV, as the select offers them. Kept in a module of its own, with no
 * import, so the seed and `relatorio/row-voltage.ts` share one list without an import cycle.
 */

/** The per-row test voltages in kV, pt-BR texts in ascending order. */
export const TEST_VOLTAGE_OPTIONS_KV = ['0,5', '1', '2,5', '5', '10'] as const;
