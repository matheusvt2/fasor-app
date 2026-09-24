import { calibrationStatusOf, calibrationValidUntil } from '../checks/calibration.ts';
import { formatCalendarDate } from '../format/datetime.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { instrumentRegistryRowText, type InstrumentRow } from '../registry/instrument-row.ts';
import type { BlockRow } from '../schemas/entities.ts';
import type { TestKey } from './readings.ts';

/*
 * Story 5.7 (FR-3, AR-18, UX-DR42): the Instrument picker of a test sub-block. Picking a
 * code copies the instrument's header onto the sheet by value
 * (`sheet/{b}/test/{t}/instrument`), so the relatório keeps what was used even if the
 * registry row changes later. An expired calibration warns and never blocks (NFR-10).
 */

/** The header copied onto the sheet at selection (AR-18), the Porto Seguro fixture's shape. */
export interface InstrumentHeader {
  instrument_id: string;
  code: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  cert_number: string | null;
  calibrated_at: string | null;
  valid_until: string | null;
  /** The instrument's default test voltage or current for this test type ("5 kV"), or null. */
  test_parameter: string | null;
}

/** The header of `row` for the test `testKey`: its registry values and its per-test default. */
export function instrumentHeaderOf(row: InstrumentRow, testKey: TestKey): InstrumentHeader {
  const parameter = row[`test_${testKey}`];
  const raw = parameter?.raw ?? null;
  return {
    instrument_id: row.id,
    code: row.code,
    manufacturer: row.manufacturer,
    model: row.model,
    serial: row.serial,
    cert_number: row.cert_number,
    calibrated_at: row.calibrated_at,
    valid_until: calibrationValidUntil(row.calibrated_at, row.calibration_interval_months),
    test_parameter: raw === null || raw.trim() === '' ? null : [formatDecimalGroupedPtBr(raw), parameter?.unit ?? null].filter((part) => part !== null && part !== '').join(' '),
  };
}

/** A stored instrument cell's header, or null when the cell holds none. */
export function storedInstrumentHeader(value: unknown): InstrumentHeader | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.instrument_id !== 'string' || typeof v.code !== 'string') return null;
  const text = (key: string) => (typeof v[key] === 'string' ? (v[key] as string) : null);
  return {
    instrument_id: v.instrument_id,
    code: v.code,
    manufacturer: text('manufacturer'),
    model: text('model'),
    serial: text('serial'),
    cert_number: text('cert_number'),
    calibrated_at: text('calibrated_at'),
    valid_until: text('valid_until'),
    test_parameter: text('test_parameter'),
  };
}

/** The picker's closed field: "2E — Megôhmetro" (the registry name, else the model, else the code alone). */
export function instrumentFieldText(header: Pick<InstrumentHeader, 'code' | 'model'>, name: string | null): string {
  const short = name !== null && name.trim() !== '' ? name.trim() : header.model;
  return short === null || short.trim() === '' ? header.code : `${header.code} — ${short}`;
}

/** "Calibração vencida em dd/mm/aaaa" for a header whose validity ended before the service period's end; null otherwise. */
export function instrumentExpiredText(header: Pick<InstrumentHeader, 'valid_until'>, serviceEnd: string | null, now: Date): string | null {
  if (calibrationStatusOf(header.valid_until, serviceEnd, now) !== 'expired') return null;
  return `Calibração vencida em ${formatCalendarDate(header.valid_until)}`;
}

/** The detail behind the chevron: "DMG10Ki · Instrum · série IN919021 · RBC 37428/26 · válida até 28/08/2027 · 5 kV". */
export function instrumentDetailText(header: InstrumentHeader, expired: boolean): string {
  return [
    header.model,
    header.manufacturer,
    header.serial === null ? null : `série ${header.serial}`,
    header.cert_number === null ? null : `RBC ${header.cert_number}`,
    header.valid_until === null || expired ? null : `válida até ${formatCalendarDate(header.valid_until)}`,
    header.test_parameter,
  ]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(' · ');
}

/** One option of the picker's list: the code, the name line, the detail line and the always-visible expired line. */
export interface InstrumentOption {
  id: string;
  code: string;
  name: string;
  detail: string;
  expired: string | null;
}

export function instrumentOptionOf(row: InstrumentRow, serviceEnd: string | null, now: Date): InstrumentOption {
  const validUntil = calibrationValidUntil(row.calibrated_at, row.calibration_interval_months);
  const status = calibrationStatusOf(validUntil, serviceEnd, now);
  const text = instrumentRegistryRowText(row, status);
  return {
    id: row.id,
    code: row.code,
    name: [row.name, row.model].filter((part): part is string => part !== null && part.trim() !== '').join(' '),
    detail: [text.secondaryLead, text.validity !== null && !text.validity.expired ? text.validity.text.toLocaleLowerCase('pt-BR') : null]
      .filter((part): part is string => part !== null && part !== '')
      .join(' · '),
    expired: status === 'expired' ? instrumentExpiredText({ valid_until: validUntil }, serviceEnd, now) : null,
  };
}

/** The instrument most recently picked for `testKey` on any sheet of the relatório (the cell with the greatest op id), or null. */
export function lastInstrumentIdFor(blocks: readonly Pick<BlockRow, 'sheet' | 'removed_at'>[], testKey: TestKey): string | null {
  let best: { opId: string; id: string } | null = null;
  for (const block of blocks) {
    if (block.removed_at !== null) continue;
    const cell = block.sheet.test[testKey]?.instrument;
    const header = storedInstrumentHeader(cell?.value);
    if (cell === undefined || header === null) continue;
    if (best === null || cell.op_id > best.opId) best = { opId: cell.op_id, id: header.instrument_id };
  }
  return best?.id ?? null;
}

/** The picker's list: live instruments, the last one used for this test type first, then by code. */
export function instrumentPickerOrder<T extends Pick<InstrumentRow, 'id' | 'code' | 'removed_at'>>(instruments: readonly T[], lastId: string | null): T[] {
  const live = instruments.filter((row) => row.removed_at === null);
  live.sort((a, b) => {
    if (a.id === lastId) return -1;
    if (b.id === lastId) return 1;
    return a.code.localeCompare(b.code, 'pt-BR', { numeric: true });
  });
  return live;
}
