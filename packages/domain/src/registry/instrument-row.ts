import { calibrationCheck, calibrationValidUntil, type CalibrationStatus } from '../checks/calibration.ts';
import { formatCalendarDate } from '../format/datetime.ts';
import type { RegistryRow } from '../schemas/entities.ts';

/*
 * AD-2, AGENTS.md "composed row": the Instrumentos row text and its sort order are
 * derived once here, never in `apps/web`. `80-cadastros.html`'s row is
 * `⟨code⟩ — ⟨name⟩ ⟨model⟩` / `⟨manufacturer⟩ · série ⟨serial⟩ · RBC ⟨cert_number⟩ ·
 * ⟨validity⟩`, with the expired validity text carrying the `rr-expired` amber look.
 */

export type InstrumentRow = Extract<RegistryRow, { kind: 'instrument' }>;

export interface InstrumentRowText {
  /** The `<strong>` code prefix of `.rr-primary`. */
  code: string;
  /** `.rr-primary` after the code, e.g. "— Megôhmetro digital DMG10Ki". */
  primaryRest: string;
  /** `.rr-secondary` up to the validity: manufacturer · série · RBC, skipping missing parts. */
  secondaryLead: string;
  /** The validity clause, or null with no calibration data yet (I/O matrix: never flagged). */
  validity: { text: string; expired: boolean } | null;
}

function joinParts(parts: ReadonlyArray<string | null>): string {
  return parts.filter((p): p is string => p !== null && p !== '').join(' · ');
}

/**
 * Composes one Instrumentos row's text from the row and its precomputed calibration
 * status (`calibrationCheck`, called by the surface with the relatório's period or
 * `null` for the registry list itself).
 */
export function instrumentRegistryRowText(instrument: InstrumentRow, status: CalibrationStatus): InstrumentRowText {
  const validUntil = formatCalendarDateOrNull(
    calibrationValidUntil(instrument.calibrated_at, instrument.calibration_interval_months),
  );
  const validity =
    validUntil === null
      ? null
      : status === 'expired'
        ? { text: `Vencida em ${validUntil}`, expired: true }
        : { text: `Válida até ${validUntil}`, expired: false };
  return {
    code: instrument.code,
    primaryRest: `— ${[instrument.name, instrument.model].filter((p): p is string => p !== null && p !== '').join(' ')}`,
    secondaryLead: joinParts([
      instrument.manufacturer,
      instrument.serial === null ? null : `série ${instrument.serial}`,
      instrument.cert_number === null ? null : `RBC ${instrument.cert_number}`,
    ]),
    validity,
  };
}

function formatCalendarDateOrNull(value: string | null): string | null {
  return value === null ? null : formatCalendarDate(value);
}

export interface InstrumentRowStatus {
  instrument: InstrumentRow;
  status: CalibrationStatus;
}

/** Expired rows first (AC1, AC3); otherwise alphabetical by code, for a stable order. */
export function compareInstrumentRows(a: InstrumentRowStatus, b: InstrumentRowStatus): number {
  const rank = (s: CalibrationStatus) => (s === 'expired' ? 0 : 1);
  const byStatus = rank(a.status) - rank(b.status);
  if (byStatus !== 0) return byStatus;
  return a.instrument.code < b.instrument.code ? -1 : a.instrument.code > b.instrument.code ? 1 : 0;
}

/**
 * The registry list's own sort: expired first. `servicePeriodEnd` is null (no relatório
 * context), so `calibrationCheck` compares against `now`.
 */
export function sortInstrumentRegistryRows(instruments: readonly InstrumentRow[], now: Date): InstrumentRowStatus[] {
  return instruments
    .map((instrument) => ({ instrument, status: calibrationCheck(instrument, null, now) }))
    .sort(compareInstrumentRows);
}
