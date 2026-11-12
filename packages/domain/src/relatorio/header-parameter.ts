import { canonicalDecimal, formatDecimalGroupedPtBr, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { instrumentHeaderOf, storedInstrumentHeader, testParameterText, type InstrumentHeader } from './instrument-pick.ts';
import type { TestKey } from './readings.ts';

/*
 * Story 25.11 (M06; Story 25.1 Part B's frame, `60-ficha.html` #/ficha/SEC-02 `.e25-header-param`):
 * the test parameter of a seeded test's instrument header (TENSÃO ENSAIO on the insulation test,
 * CORRENTE on the contact test) is a field of the sheet, on every seed. Committing it stores the
 * header again (`sheet/{b}/test/{t}/instrument`, the same put a pick writes) with the typed value
 * in the text form the pick writes ("5 kV", "1.000 V", "2,5 kV"); every other field of the header
 * stays as stored. The registry is never written from the sheet, and the suggestion of the next
 * sheet still copies the registry's default (`suggestedInstrument` reads the registry row).
 *
 * A value that differs from the registry's current default for the test kind shows as changed on
 * this sheet, with one action that stores the registry's default back. Readers of the stored
 * header (the per-row fallback of `rowTestVoltage`, the Quadro's `testVoltageCheck`, section 9 of
 * the print) read the stored value as before, so they follow the field with no change of theirs.
 */

/** The screen label of the parameter field of a test kind; null for a kind whose header has no parameter column. */
const PARAMETER_LABEL: Readonly<Record<TestKey, string | null>> = {
  // authored (Story 25.11): the frame's "Tensão de ensaio"; the contact test's twin follows its criterion line ("Corrente de ensaio 10 A").
  isolacao: 'Tensão de ensaio',
  resistencia_contato: 'Corrente de ensaio',
  relacao_transformacao: null,
};

/** A stored parameter text read back: its dot-decimal number and its unit ("1.000 V" -> 1000, V). */
export interface HeaderParameterValue {
  raw: string;
  unit: string | null;
}

/** "5 kV" -> {raw: '5', unit: 'kV'}; "1.000 V" -> {raw: '1000', unit: 'V'}; null for a text that names no positive number. */
export function readHeaderParameter(text: string | null | undefined): HeaderParameterValue | null {
  if (typeof text !== 'string') return null;
  const match = /^\s*([\d.,]+)\s*(.*?)\s*$/.exec(text);
  if (match === null) return null;
  const raw = parseDecimalPtBr(match[1]!);
  if (raw === null || !(Number(raw) > 0)) return null;
  return { raw: canonicalDecimal(raw), unit: match[2] === '' ? null : match[2]! };
}

/** What the parameter field of one seeded test shows. */
export interface HeaderParameterView {
  /** "Tensão de ensaio", "Corrente de ensaio". */
  label: string;
  /** The stored value, or null when the header holds none. */
  value: HeaderParameterValue | null;
  /** The stored number as the field shows it ("5", "2,5", "1.000"), '' when none. */
  text: string;
  /** The unit the field types in: the stored value's, else the registry's default's. */
  unit: string | null;
  /** True when the stored value differs from the registry's current default for the test kind. */
  changed: boolean;
  /** "Alterada nesta ficha · cadastro: 10 kV" while changed, else null. */
  changedText: string | null;
  /** The registry's default as the header stores it ("10 kV"), or null when the registry holds none or the row is gone. */
  registryText: string | null;
}

/** The registry row of the instrument the header names (a removed row still holds its default), or null. */
function registryRowOf(header: InstrumentHeader, instruments: readonly InstrumentRow[]): InstrumentRow | null {
  return instruments.find((row) => row.id === header.instrument_id) ?? null;
}

function sameParameter(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  const left = readHeaderParameter(a);
  const right = readHeaderParameter(b);
  return left !== null && right !== null && left.raw === right.raw && (left.unit ?? '') === (right.unit ?? '');
}

/**
 * The parameter field of the seeded test `testKey` of `block`: null when the test kind's header has
 * no parameter column (relação de transformação), when no instrument is stored (a suggestion is not
 * a header yet), or when no unit is known (neither the stored header nor the registry row holds a
 * value). Never throws.
 */
export function headerParameterView(block: Pick<BlockRow, 'sheet'>, testKey: TestKey, instruments: readonly InstrumentRow[]): HeaderParameterView | null {
  const label = PARAMETER_LABEL[testKey] ?? null;
  if (label === null) return null;
  const header = storedInstrumentHeader(block.sheet.test[testKey]?.instrument?.value);
  if (header === null) return null;
  const row = registryRowOf(header, instruments);
  const registryText = row === null ? null : instrumentHeaderOf(row, testKey).test_parameter;
  const value = readHeaderParameter(header.test_parameter);
  const unit = value?.unit ?? readHeaderParameter(registryText)?.unit ?? null;
  if (unit === null) return null;
  const changed = row !== null && !sameParameter(header.test_parameter, registryText);
  return {
    label,
    value,
    text: value === null ? '' : formatDecimalGroupedPtBr(value.raw),
    unit,
    changed,
    // authored (Story 25.11, the frame's sign): the registry's value named beside the sign, a dash when it holds none.
    changedText: changed ? `Alterada nesta ficha · cadastro: ${registryText ?? '—'}` : null,
    registryText,
  };
}

/**
 * The typed text of the field read the pt-BR way: a positive number ("5", "2,5", "1.000"); null for
 * an emptied field; 'invalid' for anything else (no number, zero, a sign).
 */
export function parseHeaderParameter(typed: string): { raw: string } | null | 'invalid' {
  const text = typed.trim();
  if (text === '') return null;
  if (text.startsWith('-') || text.startsWith('+')) return 'invalid';
  const raw = parseDecimalPtBr(text);
  if (raw === null || !(Number(raw) > 0)) return 'invalid';
  return { raw: canonicalDecimal(raw) };
}

/**
 * The header to store when the field commits `raw` (null: emptied) in `unit`: the stored header with
 * its `test_parameter` in the pick's text form, every other field as stored. Null when no header is
 * stored on the test.
 */
export function headerWithParameter(block: Pick<BlockRow, 'sheet'>, testKey: TestKey, raw: string | null, unit: string | null): InstrumentHeader | null {
  const header = storedInstrumentHeader(block.sheet.test[testKey]?.instrument?.value);
  if (header === null) return null;
  return { ...header, test_parameter: raw === null ? null : testParameterText(raw, unit) };
}

/**
 * The header "Usar a do instrumento" stores: the stored header with the registry's current default
 * for the test kind; null when no header is stored or the registry no longer holds the row.
 */
export function headerWithRegistryParameter(block: Pick<BlockRow, 'sheet'>, testKey: TestKey, instruments: readonly InstrumentRow[]): InstrumentHeader | null {
  const header = storedInstrumentHeader(block.sheet.test[testKey]?.instrument?.value);
  if (header === null) return null;
  const row = registryRowOf(header, instruments);
  if (row === null) return null;
  return { ...header, test_parameter: instrumentHeaderOf(row, testKey).test_parameter };
}

/**
 * The toast after "Usar a do instrumento": the frame's "Tensão de ensaio voltou a 10 kV, a do
 * instrumento"; with no registry default, the authored "Tensão de ensaio voltou à do instrumento".
 */
export function headerParameterRestoredText(view: Pick<HeaderParameterView, 'label' | 'registryText'>): string {
  // authored (Story 25.11): the registry holds no default for the kind, so no value is named.
  return view.registryText === null ? `${view.label} voltou à do instrumento` : `${view.label} voltou a ${view.registryText}, a do instrumento`;
}
