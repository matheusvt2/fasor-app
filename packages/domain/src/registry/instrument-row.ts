import { calibrationCheck, calibrationValidUntil, type CalibrationStatus } from '../checks/calibration.ts';
import { formatCalendarDate } from '../format/datetime.ts';
import type { RegistryRow } from '../schemas/entities.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import type { WordRow } from './word-row.ts';

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

/**
 * The separator between `secondaryLead` and the validity clause: " · " when both are
 * present, empty otherwise (never a leading/orphan separator). The one join rule for
 * every caller of `instrumentRegistryRowText` (the registry's own row and the relatório
 * setup page's instrument picker), so neither composes it inline on its own.
 */
export function instrumentDetailSeparator(text: InstrumentRowText): string {
  return text.secondaryLead === '' || text.validity === null ? '' : ' · ';
}

/**
 * The `role="status"` note under an expired-but-selectable instrument row
 * (`50-relatorio-setup.html:227`): "Calibração do ⟨code⟩ vencida em ⟨date⟩. Pode
 * continuar — listada na verificação antes de emitir." `null` when the instrument is not
 * expired (nothing to say beyond the row's own amber clause).
 */
export function instrumentExpiredNoteText(text: InstrumentRowText): string | null {
  if (text.validity === null || !text.validity.expired) return null;
  const date = text.validity.text.slice('Vencida em '.length);
  return `Calibração do ${text.code} vencida em ${date}. Pode continuar — listada na verificação antes de emitir.`;
}

/**
 * The manufacturer entry a by-value name stands for (AD-19: an instrument keeps the
 * manufacturer's name, not its id), by the normalized comparison the server merge uses.
 */
export function wordRowByName<T extends WordRow>(name: string | null, rows: readonly T[]): T | null {
  if (name === null) return null;
  const wanted = normalizeRegistryName(name);
  if (wanted === '') return null;
  return rows.find((row) => normalizeRegistryName(row.name) === wanted) ?? null;
}

/**
 * The Fabricante chips of the instrument form (Story 2.5 AC2 on the only surface that
 * has the field before Epic 4): the current value first, then the manufacturers the
 * other instruments use most (ties by name), up to 5. The registry form has no
 * relatório, so "recent in this relatório" reads as "in use in this registry".
 */
export function instrumentManufacturerRecents(
  current: string | null,
  instruments: readonly InstrumentRow[],
  manufacturers: readonly WordRow[],
  limit = 5,
): string[] {
  const uses = new Map<string, number>();
  for (const instrument of instruments) {
    const row = wordRowByName(instrument.manufacturer, manufacturers);
    if (row !== null) uses.set(row.id, (uses.get(row.id) ?? 0) + 1);
  }
  const ranked = [...uses.keys()].sort((a, b) => {
    const byUses = (uses.get(b) ?? 0) - (uses.get(a) ?? 0);
    if (byUses !== 0) return byUses;
    const nameOf = (id: string) => manufacturers.find((row) => row.id === id)?.name ?? '';
    return nameOf(a).localeCompare(nameOf(b), 'pt-BR');
  });
  const first = wordRowByName(current, manufacturers)?.id;
  const ids = first === undefined ? ranked : [first, ...ranked.filter((id) => id !== first)];
  return ids.slice(0, limit);
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
