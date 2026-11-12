import { splitEntityKey, type EntityState } from '../ops/apply.ts';
import { sheetHeaders } from '../print/section-11.ts';
import type { RegistryRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { snapshotDefinitionContext } from '../seed/definitions.ts';
import { listPtBr, plural } from '../text/plural.ts';
import { sheetOrder } from './ficha.ts';

type InstrumentRow = Extract<RegistryRow, { kind: 'instrument' }>;

/*
 * Story 25.13 (M25; every seed, screen only, no fold change, no contract): the instruments of a
 * relatório follow its sheets. Etapa 4 marks each instrument a live sheet uses, from the sheets
 * (derived: `setup.instrument_ids` is not written by itself), with the count of sheets, and warns
 * on one ticked and used on none. Cadastros compares the live registry rows: a shared certificate
 * number is a warning naming the twin, a shared model a lighter line. Section 11 does not change:
 * "used" is exactly what section 11 prints because of a sheet (`sheetHeaders`: a live, tested
 * sheet's enabled tests in force, in `sheetOrder`, so a sheet under a removed local is not one).
 */

type UseSnapshot = Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'> & Partial<Pick<RelatorioSnapshot, 'equipment_types'>>;

/** How many live sheets use each instrument (a sheet counts once, whatever its number of tests). */
export function instrumentSheetCounts(snapshot: UseSnapshot): ReadonlyMap<string, number> {
  const blocks = new Map(snapshot.blocks.map((block) => [block.id, block]));
  const ctx = snapshotDefinitionContext(snapshot);
  const counts = new Map<string, number>();
  for (const node of sheetOrder(snapshot)) {
    const block = blocks.get(node.blockId);
    if (block === undefined) continue;
    for (const id of new Set(sheetHeaders(block, ctx).map((header) => header.instrument_id))) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** "Usado em 1 ficha", "Usado em 12 fichas". */
export function usedInSheetsText(count: number): string {
  // authored: Story 25.13, for Bruno ("Usado em ⟨N⟩ fichas"; 50-relatorio-setup.html Etapa 4).
  return `Usado em ${plural(count, 'ficha', 'fichas')}`;
}

/**
 * The instruments ticked in Etapa 4 that no live sheet uses, in tick order: those whose registry
 * row is live (one removed from the registry prints nothing, `section11Instruments`).
 */
export function tickedUnusedInstruments(snapshot: UseSnapshot & Pick<RelatorioSnapshot, 'relatorio' | 'instruments'>): InstrumentRow[] {
  const counts = instrumentSheetCounts(snapshot);
  const live = new Map(snapshot.instruments.filter((row) => row.removed_at === null).map((row) => [row.id, row]));
  return [...new Set(snapshot.relatorio.setup.instrument_ids)]
    .filter((id) => (counts.get(id) ?? 0) === 0)
    .flatMap((id) => {
      const row = live.get(id);
      return row === undefined ? [] : [row];
    });
}

// authored: Story 25.13, for Bruno ("Marcado, sem uso nas fichas"); Etapa 4's line is copy.setup.instrumentUnused.
const TICKED_UNUSED_WORDS = 'marcado, sem uso nas fichas';

/** "1T: marcado, sem uso nas fichas" (the row before generating, 73-exportar.html). */
export function tickedUnusedText(code: string): string {
  return `${code}: ${TICKED_UNUSED_WORDS}`;
}

/** The company's live instrument rows, from the device's whole state (the snapshot holds only the relatório's). */
export function liveRegistryInstruments(state: EntityState): InstrumentRow[] {
  const out: InstrumentRow[] = [];
  for (const [key, row] of state) {
    if (splitEntityKey(key).entity !== 'registry') continue;
    const registry = row as RegistryRow;
    if (registry.kind === 'instrument' && registry.removed_at === null) out.push(registry);
  }
  return out;
}

function normalized(value: string | null): string | null {
  const text = value?.trim().toLowerCase() ?? '';
  return text === '' ? null : text;
}

/** For each live instrument, the other live instruments whose `pick` value equals its own, trimmed and without case. */
function twinsBy(instruments: readonly InstrumentRow[], pick: (row: InstrumentRow) => string | null): Map<string, InstrumentRow[]> {
  const live = instruments.filter((row) => row.removed_at === null);
  const groups = new Map<string, InstrumentRow[]>();
  for (const row of live) {
    const key = normalized(pick(row));
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const twins = new Map<string, InstrumentRow[]>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const row of group) twins.set(row.id, group.filter((other) => other.id !== row.id));
  }
  return twins;
}

/** The live instruments that share another's certificate number, each with its twins. */
export function sharedCertificateTwins(instruments: readonly InstrumentRow[]): Map<string, InstrumentRow[]> {
  return twinsBy(instruments, (row) => row.cert_number);
}

/**
 * The live instruments that share another's model, each with its twins, leaving out a twin that
 * already shares the certificate (the warning names it; `80-cadastros.html` 3M and 6M).
 */
export function sharedModelTwins(instruments: readonly InstrumentRow[]): Map<string, InstrumentRow[]> {
  const certificates = sharedCertificateTwins(instruments);
  const out = new Map<string, InstrumentRow[]>();
  for (const [id, twins] of twinsBy(instruments, (row) => row.model)) {
    const sameCert = new Set((certificates.get(id) ?? []).map((row) => row.id));
    const rest = twins.filter((row) => !sameCert.has(row.id));
    if (rest.length > 0) out.set(id, rest);
  }
  return out;
}

function codesOf(twins: readonly InstrumentRow[]): string {
  return listPtBr(twins.map((row) => row.code));
}

/** "Mesmo certificado de 6M" (the Instrumentos row's warning). */
export function sameCertificateText(twins: readonly InstrumentRow[]): string {
  // authored: Story 25.13, for Bruno ("Mesmo certificado de ⟨código⟩").
  return `Mesmo certificado de ${codesOf(twins)}`;
}

/** "Mesmo modelo de 7E: confira" (the Instrumentos row's lighter line). */
export function sameModelText(twins: readonly InstrumentRow[]): string {
  // authored: Story 25.13, for Bruno ("Mesmo modelo de ⟨código⟩: confira").
  return `Mesmo modelo de ${codesOf(twins)}: confira`;
}

/** "3M: mesmo certificado de 6M" (the row before generating, 73-exportar.html). */
export function sharedCertificateText(code: string, twins: readonly InstrumentRow[]): string {
  return `${code}: mesmo certificado de ${codesOf(twins)}`;
}

/** The Instrumentos row's two lines of Story 25.13; null where the row has none. */
export interface InstrumentTwinLines {
  certificate: string | null;
  model: string | null;
}

export function instrumentTwinLines(instruments: readonly InstrumentRow[]): Map<string, InstrumentTwinLines> {
  const certificates = sharedCertificateTwins(instruments);
  const models = sharedModelTwins(instruments);
  const out = new Map<string, InstrumentTwinLines>();
  for (const id of new Set([...certificates.keys(), ...models.keys()])) {
    const cert = certificates.get(id);
    const model = models.get(id);
    out.set(id, { certificate: cert === undefined ? null : sameCertificateText(cert), model: model === undefined ? null : sameModelText(model) });
  }
  return out;
}
