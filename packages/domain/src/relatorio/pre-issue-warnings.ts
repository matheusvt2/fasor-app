import { entityKey, splitEntityKey, type EntityState } from '../ops/apply.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import { livePoints } from '../points/checks.ts';
import type { BlockRow, EquipmentRow, LocationRow, PointRow, RegistryRow } from '../schemas/entities.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import { listPtBr } from '../text/plural.ts';
import { relatorioSectionNumber } from './instantiate.ts';
import { hiddenLocationIds } from './location-live.ts';
import type { PreIssueRow } from './pre-issue.ts';
import { isEquipmentBlock } from './sheet-state.ts';

type InstrumentRow = Extract<RegistryRow, { kind: 'instrument' }>;

/*
 * Story 25.12 (M26, M18, M32; every seed, no fold change, no contract): three warnings before
 * generating, each `pending` and never blocking (coordinator's reading): a point whose deadline
 * has passed (section 8), an instrument section 11 prints with no calibration date or no interval
 * to compute its validity from (section 11), and a live sheet under a removed local (section 9),
 * which the snapshot already leaves out of the tree, the counts and the print. `preIssue` pushes
 * the rows; the Instrumentos tab of Cadastros draws the same words on the registry row.
 */

/**
 * Whether a stored deadline is already past on `today` (`YYYY-MM-DD`, America/Sao_Paulo): a day
 * before today; a month (`YYYY-MM`) only once the whole month has passed, so the current month is
 * not overdue. A malformed value is never overdue.
 */
export function deadlineOverdue(deadline: string, today: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline < today;
  if (/^\d{4}-\d{2}$/.test(deadline)) return deadline < today.slice(0, 7);
  return false;
}

/** The 1-based places, in section 8's order, of the live points whose deadline is past on `today`. */
export function overduePointPositions(points: readonly PointRow[], today: string): number[] {
  return livePoints(points)
    .map((point, i) => ({ point, position: i + 1 }))
    .filter(({ point }) => point.deadline !== null && deadlineOverdue(point.deadline, today))
    .map(({ position }) => position);
}

/** "Prazo já vencido: ponto 3", "Prazo já vencido: pontos 3 e 5". */
export function deadlineOverdueText(positions: readonly number[]): string {
  // authored: Story 25.12, for Bruno ("Prazo já vencido: ⟨pontos⟩"; 73-exportar.html "ponto 3").
  return `Prazo já vencido: ${positions.length === 1 ? 'ponto' : 'pontos'} ${listPtBr(positions.map(String))}`;
}

/**
 * What an instrument's calibration lacks: no date (`date`), or a date and no interval to compute
 * the validity from (`validity`); null when both are there. With no date the validity cannot be
 * computed either; the date is the one named (the frame's "7E: sem data de calibração").
 */
export type CalibrationLack = 'date' | 'validity';

export function calibrationLack(instrument: Pick<InstrumentRow, 'calibrated_at' | 'calibration_interval_months'>): CalibrationLack | null {
  if (instrument.calibrated_at === null) return 'date';
  if (instrument.calibration_interval_months === null) return 'validity';
  return null;
}

const CALIBRATION_LACK_WORDS: Readonly<Record<CalibrationLack, string>> = {
  // authored: Story 25.12, for Bruno.
  date: 'sem data de calibração',
  validity: 'sem validade de calibração',
};

/** "7E: sem data de calibração", "7E: sem validade de calibração". */
export function calibrationLackText(code: string, lack: CalibrationLack): string {
  return `${code}: ${CALIBRATION_LACK_WORDS[lack]}`;
}

/**
 * The Instrumentos row's line of what the instrument lacks (`80-cadastros.html` `.e25-rr-warn`,
 * "Sem data de calibração · sem certificado"), in the words of the rows before generating; null
 * when it lacks nothing. The fields stay optional: this only says so.
 */
export function instrumentLacksText(instrument: Pick<InstrumentRow, 'calibrated_at' | 'calibration_interval_months' | 'certificate_file_id'>): string | null {
  const lack = calibrationLack(instrument);
  const parts = [lack === null ? null : CALIBRATION_LACK_WORDS[lack], instrument.certificate_file_id === null ? 'sem certificado' : null].filter(
    (part): part is string => part !== null,
  );
  if (parts.length === 0) return null;
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * The live equipment sheets of a relatório whose local, or a location above it, is removed: what
 * another device can create while this one removes the local (`locationRemovalPlan` takes the sheets
 * it sees). The snapshot hides them; this names them, by their TAG, else their type's label, in
 * `order_key` order. Read from the device's whole state, since the snapshot does not hold them.
 */
export function sheetsUnderRemovedLocals(state: EntityState, relatorioId: string): string[] {
  const locations: LocationRow[] = [];
  const blocks: BlockRow[] = [];
  for (const [key, row] of state) {
    const { entity } = splitEntityKey(key);
    if (entity === 'location' && (row as LocationRow).relatorio_id === relatorioId) locations.push(row as LocationRow);
    else if (entity === 'block' && (row as BlockRow).relatorio_id === relatorioId) blocks.push(row as BlockRow);
  }
  const hidden = hiddenLocationIds(locations);
  if (hidden.size === 0) return [];
  const orphans = sortByOrderKey(blocks.filter((block) => block.removed_at === null && block.location_id !== null && hidden.has(block.location_id) && isEquipmentBlock(block)));
  const definitions = snapshotDefinitionContext({});
  return orphans.map((block) => {
    const equipment = block.equipment_id === null ? undefined : (state.get(entityKey('equipment', block.equipment_id)) as EquipmentRow | undefined);
    const tag = equipment?.tag?.trim() ?? '';
    return tag !== '' ? tag : (blockDefinitionIn(definitions, block)?.label ?? block.block_type);
  });
}

/** "Fichas em local removido, fora do relatório: TP-C21". */
export function sheetsUnderRemovedLocalsText(names: readonly string[]): string {
  // authored: Story 25.12, for Bruno (one sentence whatever the count, as the story writes it).
  return `Fichas em local removido, fora do relatório: ${listPtBr(names)}`;
}

/**
 * The section a named warning of Story 25.12 stands on, for the Export dialog's "— seção 8"
 * (`73-exportar.html`); null for every other row, which keeps its line as before.
 */
export function namedWarningSection(row: Pick<PreIssueRow, 'kind' | 'row'>): number | null {
  if (row.kind !== 'deadline_overdue' && row.kind !== 'calibration_missing' && row.kind !== 'sheets_removed_local') return null;
  return relatorioSectionNumber(row.row);
}
