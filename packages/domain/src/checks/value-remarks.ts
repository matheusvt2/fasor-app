import { numberRangeOf, outsideRange, type NumberRange } from '../ops/value-limits.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';

/*
 * Story 27.2 (decision 3 of 2026-11-21): an impossible value is refused where it is typed; an
 * improbable one gets an amber remark beside the field and a row in "Antes de emitir", and never
 * blocks issuing. This file holds the derived words of both (AD-1): the range a refusal names, the
 * temperature remark and the ART/TRT remark, each with its pre-issue row. Screen only: no printed
 * page reads them, and a value stored before the story is shown, never judged again.
 */

/** The temperature of an AMBIENTE DE ENSAIO outside which the value is remarked (°C, both ends usual). */
export const TEMPERATURE_USUAL_RANGE_C = { min: -10, max: 60 } as const;

/** A bound as the range text writes it: "-500", "9000", "0,5" (no grouping, as the story writes "-500 a 9000 m"). */
function boundText(value: number): string {
  return String(value).replace('.', ',');
}

/** "-500 a 9000 m", "0 a 100 %": a range and its unit. */
export function rangeText(range: NumberRange, unit: string | null): string {
  return `${boundText(range.min)} a ${boundText(range.max)}${unit === null ? '' : ` ${unit}`}`;
}

/** The message of a number refused outside its range: "Fora da faixa: -500 a 9000 m". */
export function outOfRangeText(range: NumberRange, unit: string | null): string {
  // authored (Story 27.2, listed for Bruno): a number refused outside the range it can take.
  return `Fora da faixa: ${rangeText(range, unit)}`;
}

/**
 * Fix batch e27a-review (R2): the one range rule of a number, wherever it is written: the refusal of a
 * plain-decimal `raw` (AD-11, dot-decimal) outside `range` ("Fora da faixa: 0 a 100 %"), or null. A raw
 * that is no plain decimal ("<1000") is not judged, as the push route does not judge it.
 */
export function rawRangeRefusal(raw: string, range: NumberRange | null, unit: string | null): string | null {
  if (range === null) return null;
  return outsideRange(raw, range) ? outOfRangeText(range, unit) : null;
}

/**
 * Fix batch e27a-review (R2): why a value cannot be put at `path`, by the path's range (`numberRangeOf`, the
 * push route's own rule): the refusal of a number value whose `raw` lies outside it, or of a plain number (the
 * site altitude) outside it; null for a path with no range and any other value. Every device path that writes a
 * number asks it before it queues the op (the typed field, "Confirmar" of a suggestion, a correction typed over
 * one, "Copiar do local anterior"), so none queues an op the server refuses. `unit` names the message's unit
 * when the value carries none.
 */
export function numberValueRefusal(path: string, value: unknown, unit: string | null = null): string | null {
  const range = numberRangeOf(path);
  if (range === null || value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= range.min && value <= range.max ? null : outOfRangeText(range, unit);
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const { raw, unit: own } = value as { raw?: unknown; unit?: unknown };
  if (typeof raw !== 'string') return null;
  return rawRangeRefusal(raw, range, typeof own === 'string' && own !== '' ? own : unit);
}

/**
 * Fix batch e27a-review (R7): the refusal of a typed site altitude (a browser number input's text, whole metres
 * once rounded) outside the range the push route takes ("Fora da faixa: -500 a 9000 m"); null for a blank text,
 * a text that is no number, and a number inside the range.
 */
export function siteAltitudeRefusal(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return numberValueRefusal(SITE_ALTITUDE_PATH, Math.round(value), 'm');
}

/** The op path of the site altitude, as `relatorioSetupPath('site_altitude_m')` formats it (a kernel test checks they agree). */
const SITE_ALTITUDE_PATH = 'relatorio/setup/site_altitude_m';

/** The raw of a measured number value (AD-11 `{raw, unit, state}`), or null. */
function measuredRaw(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { raw, state } = value as { raw?: unknown; state?: unknown };
  return state === 'measured' && typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** Whether a stored AMBIENTE DE ENSAIO temperature is outside the usual range (a measured plain decimal only). */
export function temperatureUnusual(value: unknown): boolean {
  const raw = measuredRaw(value);
  return raw !== null && outsideRange(raw, TEMPERATURE_USUAL_RANGE_C);
}

/** The amber remark under an unusual temperature, or null: "Temperatura incomum: confira o valor (o usual é de -10 a 60 °C)". */
export function temperatureRemarkText(value: unknown): string | null {
  if (!temperatureUnusual(value)) return null;
  // authored (Story 27.2, listed for Bruno): the remark under a temperature outside -10 to 60 °C; it never blocks.
  return `Temperatura incomum: confira o valor (o usual é de ${rangeText(TEMPERATURE_USUAL_RANGE_C, '°C')})`;
}

/** The amber remark under an AMBIENTE DE ENSAIO field, by its key: the temperature's (`temperatureRemarkText`); null for the other fields. */
export function envFieldRemarkText(fieldKey: string, value: unknown): string | null {
  return fieldKey === 'temperature_c' ? temperatureRemarkText(value) : null;
}

/** The pre-issue row of a local whose temperature is unusual: "Cabine 1: temperatura de 999 °C, fora do usual (-10 a 60 °C)". */
export function temperatureRowText(localName: string, value: unknown): string | null {
  const raw = measuredRaw(value);
  if (raw === null || !temperatureUnusual(value)) return null;
  // authored (Story 27.2, listed for Bruno): the "Antes de emitir" row of an unusual temperature, naming the local.
  return `${localName.trim()}: temperatura de ${formatDecimalGroupedPtBr(raw)} °C, fora do usual (${rangeText(TEMPERATURE_USUAL_RANGE_C, '°C')})`;
}

/**
 * The ART/TRT number as the councils write it: digits, with the separators they use between groups
 * (a dot, a hyphen, a slash or a space), "2620262602583", "28027230201234567", "123.456/2026-0".
 */
const ART_TRT_NUMERIC = /^\d+(?:[./\- ]\d+)*$/;

/** Whether a typed ART/TRT number is not numeric (blank is not judged: the setup gap names it). */
export function artTrtNotNumeric(number: string | null): boolean {
  if (number === null || number.trim() === '') return false;
  return !ART_TRT_NUMERIC.test(number.trim());
}

/** The amber remark under an ART/TRT number that is not numeric, or null: "Confira o número da ART: ele costuma ter só algarismos". */
export function artTrtRemarkText(label: string, number: string | null): string | null {
  if (!artTrtNotNumeric(number)) return null;
  // authored (Story 27.2, listed for Bruno): the remark under an ART/TRT number with letters or symbols; it never blocks.
  return `Confira o número da ${label}: ele costuma ter só algarismos`;
}

/** The pre-issue row of an ART/TRT number that is not numeric, or null: "Número da ART com letras ou símbolos: abc". */
export function artTrtRowText(label: string, number: string | null): string | null {
  if (number === null || !artTrtNotNumeric(number)) return null;
  // authored (Story 27.2, listed for Bruno): the "Antes de emitir" row of an ART/TRT number that is not numeric.
  return `Número da ${label} com letras ou símbolos: ${number.trim()}`;
}
