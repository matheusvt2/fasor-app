/*
 * E20-A1 (R-12): the two clock windows of contract 29, in a leaf module so `ops/attribution.ts`
 * and `sync/clock-offset.ts` read them without importing each other. Both are re-exported,
 * unchanged, from the modules that defined them before.
 */

/** How far ahead of the server's clock, and how far before a relatório's creation, an instant may lie (10 minutes). */
export const CLOCK_SKEW_MS = 10 * 60_000;

/**
 * How close two offset estimates must be to count as the same (60 s). The `Date` header has a
 * one-second resolution and a round trip adds its own error; an estimate inside this band of
 * the applied offset changes nothing, so the stamps of one device do not churn their order, and
 * an estimate inside this band of zero is a correct clock (offset 0).
 */
export const CLOCK_OFFSET_TOLERANCE_MS = 60_000;
