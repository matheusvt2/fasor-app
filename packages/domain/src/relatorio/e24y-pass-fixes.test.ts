import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { openDecisions, type CellDecision } from '../merge/conflicts.ts';
import { measurementHistoryItems, measurementHistoryNote, testHistoryItems } from '../print/history-note.ts';
import { section10Layout } from '../print/section-10.ts';
import type { BlockRow, Cell, EquipmentRow, LastResults, LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, getDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import { composeConclusion, conclusionAdjustWrites, conclusionAdjusted, conclusionTextState, printedConclusionText } from './conclusion.ts';
import { evaluateSheetMeasurements } from './measurement-evaluation.ts';
import { lastNameplateCopy } from './nameplate-copy.ts';
import { composeParecer, parecerTextForPrint } from './parecer.ts';
import { evaluateSheetReadings } from './readings.ts';
import { sheetProgress, sheetStepTitle, sheetSummaryText, shownSheetSteps } from './sheet-progress.ts';
import { tagRenameFollows, type TagRenameSource } from './tag-rename.ts';
import { visitContextOf } from './visit-context.ts';

/*
 * Fix batch e24y (the hands-on pass of 2026-11-11): P2 (a rename carries an unedited, current
 * conclusion to the new TAG), P3's kernel half (a rename rewrites a stored plate TAG cell), P4 (a
 * winding phase restricted between phases that also moved since the previous visit is named in the
 * v14 note), P5 (no drop or variation flagged while the readings were corrected from the cabine's
 * ambient instead of the plate's temperature, v14) and F10 (the v14 Malha's step names and its empty
 * checklist step). Every relatório is the layout lock's synthetic one; every value is invented.
 */

const v13 = layoutLockSnapshot('v13');
const v14 = layoutLockSnapshot('v14');

let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019a6400-24f9-7000-8000-${(++opCounter).toString(16).padStart(12, '0')}` });

function blockOf(snapshot: RelatorioSnapshot, type: string): { block: BlockRow; equipment: EquipmentRow } {
  const block = snapshot.blocks.find((one) => one.block_type === type && one.removed_at === null && one.equipment_id !== null)!;
  return { block, equipment: snapshot.equipment.find((row) => row.id === block.equipment_id)! };
}

function withBlock(snapshot: RelatorioSnapshot, type: string, change: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  const { block } = blockOf(snapshot, type);
  return { ...snapshot, blocks: snapshot.blocks.map((row) => (row.id === block.id ? change(structuredClone(row)) : row)) };
}

function withPrevious(snapshot: RelatorioSnapshot, type: string, change: (entry: LastResults) => LastResults): RelatorioSnapshot {
  const { equipment } = blockOf(snapshot, type);
  return { ...snapshot, equipment: snapshot.equipment.map((row) => (row.id === equipment.id ? { ...row, last_results: change(row.last_results!) } : row)) };
}

/** The snapshot with `equipmentId` renamed to `tag` and the follow-up writes applied as the batch would. */
function renamed(snapshot: RelatorioSnapshot, equipmentId: string, tag: string): RelatorioSnapshot {
  const follows = tagRenameFollows(sourceOf(snapshot), snapshot.relatorio.id, equipmentId, tag);
  const blocks = snapshot.blocks.map((block) => {
    const follow = follows.find((one) => one.blockId === block.id);
    if (follow === undefined) return block;
    const next = structuredClone(block);
    if (follow.conclusion !== null) {
      next.sheet.conclusion.text = cell(follow.conclusion.text);
      next.sheet.conclusion.text_basis = cell(follow.conclusion.basis);
    }
    if (follow.plateTag) next.sheet.nameplate.tag = cell(tag);
    return next;
  });
  return { ...snapshot, blocks, equipment: snapshot.equipment.map((row) => (row.id === equipmentId ? { ...row, tag } : row)) };
}

const sourceOf = (snapshot: RelatorioSnapshot): TagRenameSource => ({ blocks: snapshot.blocks, locations: snapshot.locations, equipment: snapshot.equipment, definitions: snapshotDefinitionContext(snapshot), relatorio: snapshot.relatorio });

function printedOf(snapshot: RelatorioSnapshot, type: string): string | null {
  const { block, equipment } = blockOf(snapshot, type);
  const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
  return printedConclusionText(block, definition, equipment.tag, visitContextOf(snapshot, block));
}

/**
 * The Disjuntor MT concluded as the sheet now stands: on v14 the layout lock stores a restriction under its Reprovado
 * ("Conclusão ajustada", which prints the composed text whatever its TAG), so its pair and text are confirmed again,
 * as "Confirmar" writes them (`conclusionAdjustWrites`), and the text is the confirmed, current suggestion.
 */
function concludedAsNow(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  return withBlock(snapshot, 'disjuntor_mt', (block) => {
    const { equipment } = blockOf(snapshot, 'disjuntor_mt');
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
    const visit = visitContextOf(snapshot, block);
    const writes = conclusionAdjustWrites(block, definition, equipment.tag, visit);
    if (writes !== null) {
      if (writes.result !== null) block.sheet.conclusion.result = cell(writes.result);
      if (writes.restriction !== null) block.sheet.conclusion.restriction = cell(writes.restriction);
      if (writes.clearRestriction) block.sheet.conclusion.restriction = cell(null);
    }
    const composed = composeConclusion(block, definition, equipment.tag, visit);
    block.sheet.conclusion.text = cell(composed.text);
    block.sheet.conclusion.text_basis = cell(composed.basis);
    block.sheet.conclusion.text_status = cell('confirmed');
    return block;
  });
}

describe('e24y-P2-UNIT a rename carries a confirmed, current conclusion to the new TAG in the same batch', () => {
  for (const [version, snapshot] of [['v13', concludedAsNow(v13)], ['v14', concludedAsNow(v14)]] as const) {
    it(`${version}: the Disjuntor MT's confirmed text follows DJ to QM8 (status confirmed, not stale), and prints naming QM8; a rename alone prints none`, () => {
      const { block, equipment } = blockOf(snapshot, 'disjuntor_mt');
      expect(conclusionAdjusted(block, blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!, visitContextOf(snapshot, block))).toBe(false);
      expect(printedOf(snapshot, 'disjuntor_mt')).toContain(equipment.tag);
      // The defect: the TAG put alone leaves the confirmed text stale, and section 9 prints no paragraph.
      const alone = { ...snapshot, equipment: snapshot.equipment.map((row) => (row.id === equipment.id ? { ...row, tag: 'QM8' } : row)) };
      expect(printedOf(alone, 'disjuntor_mt')).toBeNull();
      const follows = tagRenameFollows(sourceOf(snapshot), snapshot.relatorio.id, equipment.id, 'QM8');
      expect(follows.map((one) => one.blockId)).toEqual([block.id]);
      const after = renamed(snapshot, equipment.id, 'QM8');
      const fresh = blockOf(after, 'disjuntor_mt').block;
      const definition = blockDefinitionIn(snapshotDefinitionContext(after), fresh)!;
      const composed = composeConclusion(fresh, definition, 'QM8', visitContextOf(after, fresh));
      expect(fresh.sheet.conclusion.text_status?.value).toBe('confirmed');
      expect(conclusionTextState(fresh, composed)).toBe('confirmed');
      const printed = printedOf(after, 'disjuntor_mt');
      expect(printed).toContain('QM8');
      expect(printed).not.toContain(equipment.tag);
    });
  }

  it('an edited text is never written (it prints as written, and reads stale: "Substituir" stays offered)', () => {
    const edited = withBlock(v14, 'disjuntor_mt', (block) => {
      block.sheet.conclusion.text_status = cell('edited');
      return block;
    });
    const { equipment } = blockOf(edited, 'disjuntor_mt');
    const written = String(blockOf(edited, 'disjuntor_mt').block.sheet.conclusion.text!.value);
    expect(tagRenameFollows(sourceOf(edited), edited.relatorio.id, equipment.id, 'QM8').filter((one) => one.conclusion !== null)).toEqual([]);
    const after = renamed(edited, equipment.id, 'QM8');
    expect(printedOf(after, 'disjuntor_mt')).toBe(written);
    const fresh = blockOf(after, 'disjuntor_mt').block;
    const definition = blockDefinitionIn(snapshotDefinitionContext(after), fresh)!;
    expect(conclusionTextState(fresh, composeConclusion(fresh, definition, 'QM8', visitContextOf(after, fresh)))).toBe('stale');
  });

  it('a confirmed text already stale before the rename is not written (the v14 para-raio PR-SINTETICA-2)', () => {
    const { equipment } = blockOf(
      { ...v14, blocks: v14.blocks.filter((one) => one.block_type !== 'para_raio' || v14.equipment.find((row) => row.id === one.equipment_id)?.tag === 'PR-SINTETICA-2') },
      'para_raio',
    );
    expect(tagRenameFollows(sourceOf(v14), v14.relatorio.id, equipment.id, 'PR-9')).toEqual([]);
  });

  it('a sheet not concluded writes nothing; a block of another relatório bound to the same equipment is untouched', () => {
    const { block, equipment } = blockOf(v14, 'transformador_forca');
    expect(block.sheet.conclusion.text_status ?? null).toBeNull();
    expect(tagRenameFollows(sourceOf(v14), v14.relatorio.id, equipment.id, 'TR-9')).toEqual([]);
    const dj = blockOf(v14, 'disjuntor_mt');
    const elsewhere = { ...structuredClone(dj.block), id: '019a6400-24f9-7000-8000-0000000fffff', relatorio_id: '019a6400-24f9-7000-8000-0000000eeeee' };
    const source = { ...sourceOf(v14), blocks: [...v14.blocks, elsewhere] };
    expect(tagRenameFollows(source, v14.relatorio.id, dj.equipment.id, 'QM8').map((one) => one.blockId)).toEqual([dj.block.id]);
  });

  it('the parecer and section 10 still print after a rename (they print the composed text)', () => {
    for (const snapshot of [v13, v14]) {
      const { equipment } = blockOf(snapshot, 'disjuntor_mt');
      const after = renamed(snapshot, equipment.id, 'QM8');
      const text = parecerTextForPrint(after);
      expect(text.trim()).not.toBe('');
      expect(text).toBe(composeParecer(after).text);
      expect(text).not.toContain(equipment.tag);
      expect(JSON.stringify(section10Layout(after, { number: 10, title: 'PARECER' }))).toContain(JSON.stringify(text).slice(1, 40));
    }
  });
});

describe('e24y-Y3-UNIT the follow composes under the relatório\'s visit date, as the sheet does (e24x D3)', () => {
  it('an equipment whose stored top is a later visit of another relatório: the text follows when the relatório is passed, as the web passes it', () => {
    const concluded = concludedAsNow(v13);
    const { equipment } = blockOf(concluded, 'disjuntor_mt');
    const visitEnd = concluded.relatorio.setup.service_end ?? concluded.relatorio.setup.service_start!;
    // A later visit of another relatório on top, its contact readings much lower (a rise against it), the original entry its prior.
    const later = withPrevious(concluded, 'disjuntor_mt', (entry) => ({
      ...entry,
      relatorio_id: '019a6400-24f9-7000-8000-00000000dead',
      service_date: '2027-03-01',
      readings: Object.fromEntries(Object.entries(entry.readings).map(([key, reading]) => [key, key.startsWith('resistencia_contato|') ? { ...reading, raw: '10' } : reading])),
      prior: { ...entry, prior: undefined } as never,
    }));
    expect(visitEnd < '2027-03-01').toBe(true);
    const follows = tagRenameFollows(sourceOf(later), later.relatorio.id, equipment.id, 'QM8');
    expect(follows.find((one) => one.conclusion !== null)?.conclusion?.text).toContain('QM8');
    // The call before the fix (no relatório): the later visit is read, the composed text differs, nothing follows.
    const withoutRelatorio = { ...sourceOf(later), relatorio: null };
    expect(tagRenameFollows(withoutRelatorio, later.relatorio.id, equipment.id, 'QM8').every((one) => one.conclusion === null)).toBe(true);
  });
});

describe('e24y-Y4-UNIT "Copiar da última visita" never copies the last visit\'s TAG', () => {
  it('skips the plate TAG field (it follows the equipment)', () => {
    const definition = getDefinition('v14', 'cabine_primaria', 'disjuntor_mt');
    const copied = lastNameplateCopy({ last_nameplate: { relatorio_id: v14.relatorio.id, revision_number: 1, issued_at: '2026-11-05T12:00:00.000Z', seed_version: 'v14', block_type: 'disjuntor_mt', fields: { tag: 'DJ-ANTIGO', fabricante: 'Fabricante Sintético' } } }, definition);
    expect(copied.map((one) => one.fieldKey)).not.toContain('tag');
  });
});

describe('e24y-P3-UNIT a rename rewrites a stored plate TAG cell; a sheet with none keeps following the equipment', () => {
  it('the Disjuntor MT stores "SINT-4" on its plate: the rename writes the new TAG there; the plate field\'s own sheet is written with no cell', () => {
    const { block, equipment } = blockOf(v14, 'disjuntor_mt');
    expect(block.sheet.nameplate.tag?.value).toBe('SINT-4');
    const follows = tagRenameFollows(sourceOf(v14), v14.relatorio.id, equipment.id, 'QM8');
    expect(follows).toEqual([{ blockId: block.id, conclusion: expect.anything(), plateTag: true }]);
    expect(blockOf(renamed(v14, equipment.id, 'QM8'), 'disjuntor_mt').block.sheet.nameplate.tag?.value).toBe('QM8');
    // Review Y2: with no stored plate TAG cell (it shows the equipment's TAG prefilled), nothing is written there, so an undo leaves no null cell.
    const bare = withBlock(v14, 'disjuntor_mt', (row) => {
      delete row.sheet.nameplate.tag;
      return row;
    });
    expect(tagRenameFollows(sourceOf(bare), bare.relatorio.id, equipment.id, 'QM8').every((one) => !one.plateTag)).toBe(true);
    // A definition with no TAG field on its plate (the TP) is never written.
    const tp = blockOf(v14, 'tp');
    expect(tagRenameFollows(sourceOf(v14), v14.relatorio.id, tp.equipment.id, 'TP-9').every((one) => !one.plateTag)).toBe(true);
  });
});

// --- P4: a phase restricted between phases that also moved since the previous visit ---------------

/** The previous winding readings 10 % lower (their 75 °C values too): every phase moved more than 2 %. */
function windingMoved(entry: LastResults): LastResults {
  const scale = (raw: string) => String(Math.round(Number(raw) * 0.9 * 10_000) / 10_000);
  const readings = Object.fromEntries(
    Object.entries(entry.readings).map(([key, reading]) => [
      key,
      key.startsWith('resistencia_enrolamento|') ? { ...reading, raw: scale(reading.raw), ...(reading.corrected === undefined ? {} : { corrected: { ...reading.corrected, raw: scale(reading.corrected.raw) } }) } : reading,
    ]),
  );
  return { ...entry, readings };
}

/** Phase C of the first winding row 3,5 % above the stored reading: restricted between phases (over 2 %, within 5 %). */
const phaseRestricted = (snapshot: RelatorioSnapshot) =>
  withBlock(withPrevious(snapshot, 'transformador_forca', windingMoved), 'transformador_forca', (block) => {
    const row = block.sheet.test.resistencia_enrolamento!.cells['0']!;
    const stored = row['2']!.value as { raw: string; unit: string; state: string };
    row['2'] = cell({ ...stored, raw: String(Math.round(Number(stored.raw) * 1.035 * 10_000) / 10_000) });
    return block;
  });

function windingOf(snapshot: RelatorioSnapshot) {
  const { block } = blockOf(snapshot, 'transformador_forca');
  return evaluateSheetMeasurements(block, getDefinition(block.seed_version, 'cabine_primaria', 'transformador_forca'), visitContextOf(snapshot, block)).find((test) => test.testKey === 'resistencia_enrolamento')!;
}

describe('e24y-P4-UNIT a winding phase restricted between phases that also varied since the previous visit is named in the note', () => {
  it('v14: the note names the phase with its variation; its deviation restriction and verdict stay', () => {
    const winding = windingOf(phaseRestricted(v14));
    const phase = winding.rows[0]!.cells.find((one) => one.fixed === null && one.address.col === 2)!;
    expect(phase.verdict).toBe('restricted');
    expect(phase.restriction?.history).toBeUndefined();
    expect(phase.restriction?.reason).not.toMatch(/manutenção anterior/u);
    const items = measurementHistoryItems(winding);
    const named = items.filter((item) => item.reason === phase.historyOut);
    expect(phase.historyOut).toMatch(/^variação de mais de 2 % desde a manutenção anterior \(de .+ para .+, a 75 °C\)$/u);
    expect(named).toHaveLength(1);
    expect(measurementHistoryNote('v14', winding)).toContain(phase.historyOut!);
  });

  it('v13: the phase keeps the same restriction, and no note prints', () => {
    const winding13 = windingOf(phaseRestricted(v13));
    const winding14 = windingOf(phaseRestricted(v14));
    const phase13 = winding13.rows[0]!.cells.find((one) => one.fixed === null && one.address.col === 2)!;
    const phase14 = winding14.rows[0]!.cells.find((one) => one.fixed === null && one.address.col === 2)!;
    expect([phase13.verdict, phase13.restriction?.reason]).toEqual([phase14.verdict, phase14.restriction?.reason]);
    expect(measurementHistoryNote('v13', winding13)).toBeNull();
  });
});

// --- P5: readings corrected from the ambient are not compared with the previous visit (v14) -------

const OIL_FIELD = 'temperatura_oleo_c';

/** The previous visit's raw readings typed again, the oil temperature not typed ("Copiar da última visita" never copies it), the cabine at 25 °C. */
function copiedWithoutOil(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  const { equipment } = blockOf(snapshot, 'transformador_forca');
  const entry = equipment.last_results!;
  const withAmbient: LocationRow[] = snapshot.locations.map((row) => (row.kind === 'cabine' ? { ...row, env: { ...row.env, temperature_c: { raw: '25', unit: '°C', state: 'measured' } } } : row));
  const base: RelatorioSnapshot = { ...snapshot, locations: withAmbient };
  return withBlock(base, 'transformador_forca', (next) => {
    delete next.sheet.nameplate[OIL_FIELD];
    // Every reading equal to the previous visit's, in the order the entry keeps them.
    const isolacao = next.sheet.test.isolacao!.cells;
    const previousIsolacao = Object.entries(entry.readings).filter(([key]) => key.startsWith('isolacao|')).map(([, reading]) => reading);
    Object.keys(isolacao).forEach((rowKey, index) => {
      const previous = previousIsolacao[index];
      if (previous === undefined) return;
      for (const [colKey, stored] of Object.entries(isolacao[rowKey]!)) {
        const value = stored.value as { raw?: string; unit?: string; state?: string } | null;
        if (value?.state === 'measured') isolacao[rowKey]![colKey] = cell({ raw: previous.raw, unit: previous.unit, state: 'measured' });
      }
    });
    const winding = next.sheet.test.resistencia_enrolamento!.cells;
    const previousWinding = Object.entries(entry.readings).filter(([key]) => key.startsWith('resistencia_enrolamento|'));
    for (const [rowKey, row] of Object.entries(winding)) {
      for (const [colKey, stored] of Object.entries(row)) {
        const value = stored.value as { raw?: string; unit?: string; state?: string } | null;
        if (value?.state !== 'measured') continue;
        const previous = previousWinding[Number(rowKey) === 0 ? Number(colKey) : 3 + Number(colKey)]?.[1];
        if (previous !== undefined) row[colKey] = cell({ raw: previous.raw, unit: previous.unit, state: 'measured' });
      }
    }
    return next;
  });
}

function historyFlags(snapshot: RelatorioSnapshot): string[] {
  const { block } = blockOf(snapshot, 'transformador_forca');
  const definition = getDefinition(block.seed_version, 'cabine_primaria', 'transformador_forca');
  const visit = visitContextOf(snapshot, block);
  const readings = evaluateSheetReadings(block, definition, visit).flatMap((test) => testHistoryItems(test).map((item) => `${test.testKey}: ${item.reason}`));
  const measurements = evaluateSheetMeasurements(block, definition, visit).flatMap((test) => measurementHistoryItems(test).map((item) => `${test.testKey}: ${item.reason}`));
  return [...readings, ...measurements];
}

function verdictsOf(snapshot: RelatorioSnapshot): string[] {
  const { block } = blockOf(snapshot, 'transformador_forca');
  const definition = getDefinition(block.seed_version, 'cabine_primaria', 'transformador_forca');
  const visit = visitContextOf(snapshot, block);
  const readings = evaluateSheetReadings(block, definition, visit).flatMap((test) =>
    test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.filter((one) => one.role === 'capture').map((one) => `${test.testKey} ${JSON.stringify(one.address)} ${one.verdict} ${one.restriction?.history === undefined ? '' : 'history'}`))),
  );
  const measurements = evaluateSheetMeasurements(block, definition, visit).flatMap((test) => test.rows.flatMap((row) => row.cells.filter((one) => one.fixed === null).map((one) => `${test.testKey} ${JSON.stringify(one.address)} ${one.verdict} ${one.restriction?.history === undefined ? '' : 'history'}`)));
  return [...readings, ...measurements];
}

/** The equipment's `last_nameplate` as the previous visit issued it: its TEMPERATURA DO ÓLEO typed (40 °C) or not. */
function withPreviousPlate(snapshot: RelatorioSnapshot, oilTyped: boolean): RelatorioSnapshot {
  const { equipment } = blockOf(snapshot, 'transformador_forca');
  const entry = equipment.last_results!;
  const fields: Record<string, unknown> = { tipo_de_isolacao: 'ÓLEO ISOLANTE', ...(oilTyped ? { [OIL_FIELD]: { raw: '40', unit: '°C', state: 'measured' } } : {}) };
  const plate = { relatorio_id: entry.relatorio_id, revision_number: entry.revision_number, issued_at: entry.issued_at, seed_version: entry.seed_version, block_type: entry.block_type, fields };
  return { ...snapshot, equipment: snapshot.equipment.map((row) => (row.id === equipment.id ? { ...row, last_nameplate: plate as never } : row)) };
}

describe('e24y-P5-UNIT like with like: no drop nor variation while only the previous visit typed the plate\'s temperature (v14)', () => {
  it('v14: the previous visit typed TEMPERATURA DO ÓLEO, this one has not (the cabine\'s 25 °C stands in): no drop and no variation', () => {
    const copied = withPreviousPlate(copiedWithoutOil(v14), true);
    const { block } = blockOf(copied, 'transformador_forca');
    expect(block.sheet.nameplate[OIL_FIELD]).toBeUndefined();
    expect(visitContextOf(copied, block).ambientC).toBe(25);
    expect(historyFlags(copied)).toEqual([]);
  });

  it('review Y1: neither visit typed it (both from the ambient), or the previous plate is not known: compared as v13 (a drop is restricted)', () => {
    for (const make of [(s: RelatorioSnapshot) => withPreviousPlate(copiedWithoutOil(s), false), (s: RelatorioSnapshot) => copiedWithoutOil(s)]) {
      const flags14 = historyFlags(make(v14));
      expect(flags14.length).toBeGreaterThan(0);
      expect(verdictsOf(make(v14))).toEqual(verdictsOf(make(v13)));
    }
  });

  it('then the temperature typed on this visit too: v13\'s verdicts', () => {
    const typed = (s: RelatorioSnapshot) => withPreviousPlate(withBlock(copiedWithoutOil(s), 'transformador_forca', (next) => {
      next.sheet.nameplate[OIL_FIELD] = cell({ raw: '40', unit: '°C', state: 'measured' });
      return next;
    }), true);
    expect(verdictsOf(typed(v14))).toEqual(verdictsOf(typed(v13)));
  });

  it('v13 without the temperature is unchanged: the same copy still flags (listed for Matheus)', () => {
    expect(historyFlags(withPreviousPlate(copiedWithoutOil(v13), true)).length).toBeGreaterThan(0);
  });

  it('with TEMPERATURA DO ÓLEO typed, every verdict and flag is the same on v13 and v14 (the layout lock\'s transformer, a drop restricted)', () => {
    expect(historyFlags(v14).length).toBeGreaterThan(0);
    expect(verdictsOf(v14)).toEqual(verdictsOf(v13));
    const moved14 = withPrevious(v14, 'transformador_forca', windingMoved);
    const moved13 = withPrevious(v13, 'transformador_forca', windingMoved);
    expect(verdictsOf(moved14)).toEqual(verdictsOf(moved13));
    expect(verdictsOf(moved14).some((line) => line.startsWith('resistencia_enrolamento') && line.endsWith('history'))).toBe(true);
  });
});

// --- F10: the v14 Malha's step names and its empty checklist step ---------------------------------

describe('e24y-F10-UNIT the v14 Malha de aterramento: no checklist step, the plate step named "Dados da malha"', () => {
  it('v14: the stepper shows no Verificações step; v13 keeps it (unchanged)', () => {
    for (const [version, snapshot] of [['v13', v13], ['v14', v14]] as const) {
      const { block } = blockOf(snapshot, 'malha_aterramento');
      const definition = getDefinition(version, 'cabine_primaria', 'malha_aterramento');
      expect(shownSheetSteps(block, { definition }), version).toEqual(version === 'v14' ? ['placa', 'ensaios', 'conclusao'] : ['placa', 'verificacoes', 'ensaios', 'conclusao']);
      // A type with a checklist keeps its step on both.
      const dj = blockOf(snapshot, 'disjuntor_mt').block;
      expect(shownSheetSteps(dj, { definition: getDefinition(version, 'cabine_primaria', 'disjuntor_mt') })).toContain('verificacoes');
    }
  });

  it('v14: the header names the plate step by its title, "Dados da malha prontos", and its missing fields "campos de dados da malha"; v13 unchanged', () => {
    const counts = (placa: number, ensaios: number) => ({ steps: { placa: { missing: placa }, verificacoes: { missing: 0 }, ensaios: { missing: ensaios }, conclusao: { missing: 1 } } });
    const steps14 = ['placa', 'ensaios', 'conclusao'] as const;
    const title = sheetStepTitle('placa', getDefinition('v14', 'cabine_primaria', 'malha_aterramento'));
    expect(title).toBe('Dados da malha');
    expect(sheetSummaryText(counts(0, 2), [...steps14], title)).toBe('Dados da malha prontos · faltam 2 leituras e a conclusão');
    expect(sheetSummaryText(counts(2, 0), [...steps14], title)).toBe('Leituras prontas · faltam 2 campos de dados da malha e a conclusão');
    expect(sheetSummaryText(counts(1, 0), [...steps14], title)).toBe('Leituras prontas · falta 1 campo de dados da malha e a conclusão');
    expect(sheetSummaryText({ steps: { placa: { missing: 0 }, verificacoes: { missing: 0 }, ensaios: { missing: 0 }, conclusao: { missing: 1 } } }, [...steps14], title)).toBe('Dados da malha e leituras prontos · falta a conclusão');
    // v13: no title, the step names as before, "Verificações" included.
    const v13Title = sheetStepTitle('placa', getDefinition('v13', 'cabine_primaria', 'malha_aterramento'));
    expect(v13Title).toBeNull();
    expect(sheetSummaryText(counts(0, 2), ['placa', 'verificacoes', 'ensaios', 'conclusao'], v13Title)).toBe('Placa e verificações prontas · faltam 2 leituras e a conclusão');
    expect(sheetSummaryText(counts(2, 0), undefined, v13Title)).toBe('Verificações e leituras prontas · faltam 2 campos da placa e a conclusão');
    // The sheet's own progress of the v14 Malha is read with its steps: the stepper's step titles agree.
    const { block } = blockOf(v14, 'malha_aterramento');
    expect(sheetProgress(v14, block.id).steps.verificacoes.missing).toBe(0);
    expect(sheetStepTitle('ensaios', getDefinition('v14', 'cabine_primaria', 'malha_aterramento'))).toBeNull();
  });

  it('the Conflict view names the v14 Malha\'s plate section "Dados da malha"; v13 "Dados de placa"', () => {
    for (const [version, snapshot, section] of [['v13', v13, 'Dados de placa'], ['v14', v14, 'Dados da malha']] as const) {
      const { block } = blockOf(snapshot, 'malha_aterramento');
      const key = getDefinition(version, 'cabine_primaria', 'malha_aterramento').nameplate[0]!.key;
      const conflicted = structuredClone(block);
      const other = cell('B');
      conflicted.sheet.nameplate[key] = { ...cell('A'), conflict: { op_id: other.op_id, value: other.value, source_suggestion_id: null } };
      const decisions = openDecisions({ definitions: snapshotDefinitionContext(snapshot), relatorioId: snapshot.relatorio.id, blocks: [conflicted], locations: [], equipment: [], opOf: () => undefined, createOpOf: () => undefined });
      const cells = decisions.flatMap((decision) => (decision.kind === 'cell' ? (decision as CellDecision).cells : []));
      expect(cells.map((one) => one.section), version).toEqual([section]);
    }
  });
});
