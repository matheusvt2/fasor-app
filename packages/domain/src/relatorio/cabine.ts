import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import type { LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getSeed } from '../seed/definitions.ts';
import type { CabineDefinition } from '../seed/schema.ts';

/*
 * Story 12.3 (J-03, J-08, D-5; `source-deltas.md` row 51): what the cabine block asks and
 * how it reads when collapsed. The cabine's "Características da SE" and "Ambiente de
 * ensaio" fields are required (`cabineProgress`), counted on the cabine's first sheet, on
 * the Sumário cabine row ("falta a umidade") and in `preIssue` (never blocking). The
 * altitude is the relatório setup's own (Etapa 5), so it is never asked here. On every
 * sheet of a complete cabine the block draws one line (`cabineLineText`) with "Editar".
 */

export type CabineLocation = Extract<LocationRow, { kind: 'cabine' }>;

/** The root location (the cabine) above a location, or null when it is not on this device. */
export function cabineOf(locations: readonly LocationRow[], locationId: string | null): CabineLocation | null {
  const byId = new Map(locations.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let at = locationId === null ? undefined : byId.get(locationId);
  while (at !== undefined && !seen.has(at.id)) {
    seen.add(at.id);
    if (at.kind === 'cabine' && (at.parent_id === null || !byId.has(at.parent_id))) return at;
    at = at.parent_id === null ? undefined : byId.get(at.parent_id);
  }
  return null;
}

/** The cabine field the setup owns, never asked on a sheet. */
const SETUP_OWNED = 'altitude_m';

/** One cabine field still empty: its group, its location-row key and its seed label. */
export interface CabineMissingField {
  group: 'se' | 'env';
  key: string;
  label: string;
}

export interface CabineProgress {
  /** The empty fields, in the seed's order (SE first, then the environment). */
  missing: CabineMissingField[];
  complete: boolean;
}

function cabineDefinition(seedVersion: string): CabineDefinition | null {
  try {
    return getSeed(seedVersion, 'cabine_primaria').cabine;
  } catch {
    return null;
  }
}

/** A cabine column holds a value: a non-blank text, or a number that is not empty. */
function cabineValueFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'object' && !Array.isArray(value) && 'raw' in value) {
    const number = value as { raw: string; state?: string };
    return number.state !== 'empty' && number.raw.trim() !== '';
  }
  return true;
}

/**
 * The cabine's required fields still empty (the altitude excluded: the setup's). A cabine
 * that is not on this device, or a seed that does not resolve, is complete: nothing can be
 * asked of it.
 */
export function cabineProgress(snapshot: Pick<RelatorioSnapshot, 'relatorio' | 'locations'>, cabineId: string): CabineProgress {
  const cabine = snapshot.locations.find((row): row is CabineLocation => row.id === cabineId && row.kind === 'cabine' && row.removed_at === null);
  const definition = cabineDefinition(snapshot.relatorio.seed_version);
  if (cabine === undefined || definition === null) return { missing: [], complete: true };
  const missing: CabineMissingField[] = [];
  for (const group of ['se', 'env'] as const) {
    const values = cabine[group] as Record<string, unknown>;
    for (const field of definition[group]) {
      if (field.key === SETUP_OWNED) continue;
      if (!cabineValueFilled(values[field.key])) missing.push({ group, key: field.key, label: field.label });
    }
  }
  return { missing, complete: missing.length === 0 };
}

// authored: each cabine field's short name with its article, for "falta ⟨campo⟩" (the
// v0.9 mock's Sumário row reads "falta a umidade"); open question for Bruno and Matheus.
const SHORT_NAMES: Readonly<Record<string, string>> = {
  type: 'o tipo de SE',
  primary_kv: 'a tensão primária',
  secondary_kv: 'a tensão secundária',
  installed_kva: 'a potência instalada',
  temperature_c: 'a temperatura',
  humidity_pct: 'a umidade',
};

/** "falta a umidade" with one field missing, "faltam 3 campos" with more, null when complete. */
export function cabineMissingText(p: Pick<CabineProgress, 'missing'>): string | null {
  const [first] = p.missing;
  if (first === undefined) return null;
  // authored: the count when more than one field is missing.
  if (p.missing.length > 1) return `faltam ${p.missing.length} campos`;
  return `falta ${SHORT_NAMES[first.key] ?? first.label.toLocaleLowerCase('pt-BR')}`;
}

/** A cabine number as the line prints it: "13,8 kV", "1.500 kVA", "65 %"; null when not typed. */
function lineMeasure(value: { raw: string; unit: string | null; state?: string } | null, unit: string): string | null {
  if (value === null || value.state === 'empty' || value.raw.trim() === '') return null;
  return `${formatDecimalGroupedPtBr(value.raw.trim())} ${value.unit ?? unit}`;
}

/**
 * `.cabine-line .cl-values` (`key-equipment-sheet-v09.html`): the cabine's stored values in
 * the seed's order, "ALVENARIA - CONVENCIONAL · 13,8 kV · 380 V · 1.500 kVA · 25 °C · 65 %";
 * the fields not typed are left out.
 */
export function cabineLineText(location: CabineLocation): string {
  const type = location.se.type?.trim() ?? '';
  return [
    type === '' ? null : type,
    lineMeasure(location.se.primary_kv, 'kV'),
    lineMeasure(location.se.secondary_kv, 'V'),
    lineMeasure(location.se.installed_kva, 'kVA'),
    lineMeasure(location.env.temperature_c, '°C'),
    lineMeasure(location.env.humidity_pct, '%'),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
