import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { sheetPointFindings } from '../points/derived.ts';
import { measurementHistoryItems, measurementHistoryNote, testHistoryItems, testHistoryNote } from '../print/history-note.ts';
import { lastNameplates } from '../print/last-nameplate.ts';
import { lastResults } from '../print/last-results.ts';
import { printedVerdicts } from '../print/printed-verdicts.ts';
import { withoutPrior } from '../print/reading-slots.ts';
import { section9Layout, type PrintSheet } from '../print/section-9.ts';
import { equipmentRowSchema, type BlockRow, type Cell, type EquipmentRow, type JsonValue, type LastResults, type LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, getDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import { composeConclusion, effectiveConclusionPair } from './conclusion.ts';
import { evaluateSheetMeasurements } from './measurement-evaluation.ts';
import { composeParecer, effectiveParecer } from './parecer.ts';
import { evaluateSheetReadings } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { previousPlateMeasured, visitContextOf } from './visit-context.ts';

/*
 * Fix batch e25r (R-1 and E24-A1 items 1 and 2 of the Epic 24 retrospective, contract 49): seed v14's
 * "like with like" rule (`history_needs_like_with_like`, fix batch e24y Y1) still holds once the
 * relatório itself is issued, and when a later relatório is issued on top. A = the previous visit (the
 * layout lock's own, issued; it typed TEMPERATURA DO ÓLEO), B = this visit (the v14 layout lock's
 * transformer: the oil temperature not typed, the cabine's 25 °C standing in, every reading equal to
 * A's), C = a later relatório. An issue is folded as the generate job writes it (`job.ts`
 * `commitRevision`): the `last_nameplate` puts of `lastNameplates`, then the `last_results` puts of
 * `lastResults`, both computed from the snapshot as it stood, each row read back through the row schema
 * as the fold does after a put. Matrix rows 2, 3 and 5 of `spec-e25r-like-with-like.md` are red on
 * 132ad4a1 (and rows 4, 9, 12 and 13, which read what the fix adds). Every value is invented.
 */

const v13 = layoutLockSnapshot('v13');
const v14 = layoutLockSnapshot('v14');

const TF = 'transformador_forca';
const OIL = 'temperatura_oleo_c';
const WINDING = 'temperatura_enrolamento_c';
const OIL_UNIT = 'ÓLEO ISOLANTE';
const DRY_UNIT = 'Á SECO';
const TITLE = 'RELATÓRIOS DOS ENSAIOS';
const NOTE = 'Em relação à manutenção anterior';

/** Relatório C, a later visit of the obra, and another visit whose plate is on the row (the production leftovers, D5). */
const RELATORIO_C = '019a6400-0e25-7000-8000-00000000000c';
const RELATORIO_X = '019a6400-0e25-7000-8000-0000000000aa';
const ISSUE_1 = '2026-11-12T12:00:00.000Z';
const ISSUE_2 = '2026-11-13T12:00:00.000Z';

let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019a6400-0e25-7001-8000-${(++opCounter).toString(16).padStart(12, '0')}` });
const celsius = (raw: string): JsonValue => ({ raw, unit: '°C', state: 'measured' });

function blockOf(snapshot: RelatorioSnapshot, type: string): { block: BlockRow; equipment: EquipmentRow } {
  const block = snapshot.blocks.find((one) => one.block_type === type && one.removed_at === null && one.equipment_id !== null)!;
  return { block, equipment: snapshot.equipment.find((row) => row.id === block.equipment_id)! };
}

function withBlock(snapshot: RelatorioSnapshot, type: string, change: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  const { block } = blockOf(snapshot, type);
  return { ...snapshot, blocks: snapshot.blocks.map((row) => (row.id === block.id ? change(structuredClone(row)) : row)) };
}

/** The snapshot with the transformer's equipment row changed (a new row object, as a fold gives). */
function withTransformerRow(snapshot: RelatorioSnapshot, change: (row: EquipmentRow) => EquipmentRow): RelatorioSnapshot {
  const { equipment } = blockOf(snapshot, TF);
  return { ...snapshot, equipment: snapshot.equipment.map((row) => (row.id === equipment.id ? change(row) : row)) };
}

/** The transformer's stored previous visit changed. */
const withTop = (snapshot: RelatorioSnapshot, change: (entry: LastResults) => LastResults): RelatorioSnapshot => withTransformerRow(snapshot, (row) => ({ ...row, last_results: change(row.last_results!) }));

/**
 * The transformer's `last_nameplate` as a previous visit issued it: `fields`, of the visit on top (A) unless `of` names
 * another one.
 */
function withPlate(snapshot: RelatorioSnapshot, fields: Record<string, JsonValue>, of?: Pick<LastResults, 'relatorio_id' | 'revision_number'>): RelatorioSnapshot {
  return withTransformerRow(snapshot, (row) => {
    const entry = row.last_results!;
    const visit = of ?? entry;
    return { ...row, last_nameplate: { relatorio_id: visit.relatorio_id, revision_number: visit.revision_number, issued_at: entry.issued_at, seed_version: entry.seed_version, block_type: entry.block_type, fields } };
  });
}

/** A's plate on an oil unit: TEMPERATURA DO ÓLEO typed (`oilRaw`, 40 °C) or not. */
function oilPlate(oilRaw: string | null = '40'): Record<string, JsonValue> {
  const fields: Record<string, JsonValue> = { tipo_de_isolacao: OIL_UNIT };
  if (oilRaw !== null) fields[OIL] = celsius(oilRaw);
  return fields;
}

/**
 * B as e24y's P5 built it: the previous visit's raw readings typed again, the oil temperature not typed ("Copiar da última
 * visita" never copies it), the cabine at 25 °C.
 */
function copiedWithoutOil(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  const { equipment } = blockOf(snapshot, TF);
  const entry = equipment.last_results!;
  const withAmbient: LocationRow[] = snapshot.locations.map((row) => (row.kind === 'cabine' ? { ...row, env: { ...row.env, temperature_c: { raw: '25', unit: '°C', state: 'measured' } } } : row));
  const base: RelatorioSnapshot = { ...snapshot, locations: withAmbient };
  return withBlock(base, TF, (next) => {
    delete next.sheet.nameplate[OIL];
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

/** Matrix row 12: B on a dry unit (TIPO DE ISOLAÇÃO "Á SECO"), its TEMPERATURA DO ENROLAMENTO not typed either. */
const copiedOnDryUnit = (snapshot: RelatorioSnapshot): RelatorioSnapshot =>
  withBlock(copiedWithoutOil(snapshot), TF, (next) => {
    next.sheet.nameplate.tipo_de_isolacao = cell(DRY_UNIT);
    delete next.sheet.nameplate[WINDING];
    return next;
  });

// --- the issue, as the job folds it -------------------------------------------------------------

interface Issue {
  revisionNumber: number;
  issuedAt: string;
  firstIssuedAt?: string;
}

/** The obra's equipment rows once `snapshot`'s relatório is issued (`job.ts` `commitRevision`: plates, then results). */
function issuedEquipment(snapshot: RelatorioSnapshot, issue: Issue): EquipmentRow[] {
  const plates = lastNameplates(snapshot, { revisionNumber: issue.revisionNumber, issuedAt: issue.issuedAt });
  const results = lastResults(snapshot, { revisionNumber: issue.revisionNumber, issuedAt: issue.issuedAt, firstIssuedAt: issue.firstIssuedAt ?? issue.issuedAt });
  return snapshot.equipment.map((row) => {
    let next: EquipmentRow = row;
    for (const entry of plates) if (entry.equipmentId === row.id) next = equipmentRowSchema.parse({ ...next, last_nameplate: entry.value });
    for (const entry of results) if (entry.equipmentId === row.id) next = equipmentRowSchema.parse({ ...next, last_results: entry.value });
    return next;
  });
}

/** `snapshot`'s own relatório issued: the same sheets, the obra's equipment rows as the issue left them. */
const issued = (snapshot: RelatorioSnapshot, issue: Issue): RelatorioSnapshot => ({ ...snapshot, equipment: issuedEquipment(snapshot, issue) });

/** The same sheets as relatório `id` of the obra, its visit on `date` (C, a later relatório). */
function asRelatorio(snapshot: RelatorioSnapshot, id: string, date: string): RelatorioSnapshot {
  return {
    ...snapshot,
    relatorio: { ...snapshot.relatorio, id, setup: { ...snapshot.relatorio.setup, service_start: date, service_end: date } },
    blocks: snapshot.blocks.map((block) => ({ ...block, relatorio_id: id })),
    locations: snapshot.locations.map((location) => ({ ...location, relatorio_id: id })),
  };
}

// --- what every reader of the transformer's sheet computes ---------------------------------------

function historyFlags(snapshot: RelatorioSnapshot): string[] {
  const { block } = blockOf(snapshot, TF);
  const definition = getDefinition(block.seed_version, 'cabine_primaria', TF);
  const visit = visitContextOf(snapshot, block);
  const readings = evaluateSheetReadings(block, definition, visit).flatMap((test) => testHistoryItems(test).map((item) => `${test.testKey}: ${item.reason}`));
  const measurements = evaluateSheetMeasurements(block, definition, visit).flatMap((test) => measurementHistoryItems(test).map((item) => `${test.testKey}: ${item.reason}`));
  return [...readings, ...measurements];
}

function verdictsOf(snapshot: RelatorioSnapshot): string[] {
  const { block } = blockOf(snapshot, TF);
  const definition = getDefinition(block.seed_version, 'cabine_primaria', TF);
  const visit = visitContextOf(snapshot, block);
  const readings = evaluateSheetReadings(block, definition, visit).flatMap((test) =>
    test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.filter((one) => one.role === 'capture').map((one) => `${test.testKey} ${JSON.stringify(one.address)} ${one.verdict} ${one.restriction?.history === undefined ? '' : 'history'}`))),
  );
  const measurements = evaluateSheetMeasurements(block, definition, visit).flatMap((test) => test.rows.flatMap((row) => row.cells.filter((one) => one.fixed === null).map((one) => `${test.testKey} ${JSON.stringify(one.address)} ${one.verdict} ${one.restriction?.history === undefined ? '' : 'history'}`)));
  return [...readings, ...measurements];
}

/** The transformer's sheet as section 9 prints it. */
function printedSheet(snapshot: RelatorioSnapshot): PrintSheet | undefined {
  const { block } = blockOf(snapshot, TF);
  return (section9Layout(snapshot, 9, TITLE)?.subsections ?? []).flatMap((subsection) => subsection.sheets).find((sheet) => sheet.blockId === block.id);
}

const printedNotes = (sheet: PrintSheet | undefined): string[] => (sheet?.parts ?? []).flatMap((part) => (part.kind === 'paragraph' && part.text.startsWith(NOTE) ? [part.text] : []));

/**
 * Every reader of the sheet under its visit context (AC2): the history flags and the verdicts, the note lines, the printed
 * verdicts (the conclusion pairs and the parecer), the effective pair and the composed conclusion, the parecer, the progress,
 * the findings a point is created from, and the printed sheet itself.
 */
function readersOf(snapshot: RelatorioSnapshot) {
  const { block, equipment } = blockOf(snapshot, TF);
  const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
  const visit = visitContextOf(snapshot, block);
  const readings = evaluateSheetReadings(block, definition, visit);
  const measurements = evaluateSheetMeasurements(block, definition, visit);
  return {
    flags: historyFlags(snapshot),
    verdicts: verdictsOf(snapshot),
    notes: [...readings.map((test) => testHistoryNote(block.seed_version, test)), ...measurements.map((test) => measurementHistoryNote(block.seed_version, test))].filter((note) => note !== null),
    printed: printedVerdicts(snapshot),
    pair: effectiveConclusionPair(block, definition, visit),
    conclusion: composeConclusion(block, definition, equipment.tag, visit).text,
    parecer: [effectiveParecer(snapshot), composeParecer(snapshot).text],
    progress: [sheetProgress(snapshot, block.id), sheetProgress(snapshot, block.id, { floorFills: true })],
    points: sheetPointFindings(snapshot, block.id).map((finding) => `${finding.origin} ${finding.testKey} ${finding.text}`),
    sheet: printedSheet(snapshot),
  };
}

/** Whether the sheet's previous visit counts as having typed the medium's plate temperature (the rule's own question). */
function previousTyped(snapshot: RelatorioSnapshot, key: string): boolean | null {
  const { block } = blockOf(snapshot, TF);
  return previousPlateMeasured(visitContextOf(snapshot, block), key);
}

const transformerEntry = (snapshot: RelatorioSnapshot): LastResults => blockOf(snapshot, TF).equipment.last_results!;

// --- the states of the matrix -----------------------------------------------------------------------

/** Matrix row 1: A typed oil, B did not; B not issued; on top A without the field, `last_nameplate` A's. */
const row1 = (snapshot: RelatorioSnapshot) => withPlate(copiedWithoutOil(snapshot), oilPlate());

describe('e25r-R1-UNIT-001 matrix rows 1 to 3: a v14 second visit, issued and issued again, flags nothing', () => {
  const before = row1(v14);
  const revision1 = issued(before, { revisionNumber: 1, issuedAt: ISSUE_1 });
  const revision2 = issued(revision1, { revisionNumber: 2, issuedAt: ISSUE_2, firstIssuedAt: ISSUE_1 });

  it('row 1: before the issue no drop and no variation (the plate is A\'s); the scenario is real: v13 flags it', () => {
    const { block } = blockOf(before, TF);
    expect(block.sheet.nameplate[OIL]).toBeUndefined();
    expect(visitContextOf(before, block).ambientC).toBe(25);
    expect(previousTyped(before, OIL)).toBe(true);
    expect(historyFlags(before)).toEqual([]);
    expect(printedNotes(printedSheet(before))).toEqual([]);
    expect(historyFlags(row1(v13)).length).toBeGreaterThan(0);
  });

  it('row 2 (R-1): B issued as revision 1, nothing edited: every reader reads what it read before; the prior A carries plate_measured', () => {
    const entry = transformerEntry(revision1);
    expect(entry).toMatchObject({ relatorio_id: before.relatorio.id, revision_number: 1, prior: { relatorio_id: transformerEntry(before).relatorio_id } });
    // The plate on the row is now B's own: only the field the entry carries says what A typed.
    expect(blockOf(revision1, TF).equipment.last_nameplate?.relatorio_id).toBe(before.relatorio.id);
    expect(entry.prior?.plate_measured).toEqual([OIL]);
    // B's own entry: what its sheet holds as numbers (the winding's 45 °C; the oil not typed).
    expect(entry.plate_measured).toEqual([WINDING]);
    expect(previousTyped(revision1, OIL)).toBe(true);
    expect(historyFlags(revision1)).toEqual([]);
    expect(readersOf(revision1)).toEqual(readersOf(before));
  });

  it('row 3: B issued again as revision 2, nothing edited: no flag, and revision 2 prints the transformer as revision 1 did (no note line, no mark)', () => {
    // What revision 2 renders is the snapshot before its own issue (revision1 here); what revision 1 rendered is `before`.
    expect(printedSheet(revision1)).toEqual(printedSheet(before));
    expect(printedNotes(printedSheet(revision1))).toEqual([]);
    expect(transformerEntry(revision2)).toMatchObject({ revision_number: 2, plate_measured: [WINDING], prior: { plate_measured: [OIL] } });
    expect(historyFlags(revision2)).toEqual([]);
    expect(readersOf(revision2)).toEqual(readersOf(before));
    expect(printedSheet(revision2)).toEqual(printedSheet(before));
  });

  it('row 10: the same three states on seed v13 are compared (the flag is v14\'s)', () => {
    const old = row1(v13);
    const once = issued(old, { revisionNumber: 1, issuedAt: ISSUE_1 });
    const twice = issued(once, { revisionNumber: 2, issuedAt: ISSUE_2, firstIssuedAt: ISSUE_1 });
    for (const snapshot of [old, once, twice]) expect(historyFlags(snapshot).length).toBeGreaterThan(0);
    expect(verdictsOf(once)).toEqual(verdictsOf(old));
  });
});

describe('e25r-R1-UNIT-002 matrix row 4: A issued by the new code carries the field', () => {
  it('the layout lock\'s own sheet (both plate temperatures typed) issues plate_measured, sorted; B reads it as a draft and after its issue', () => {
    const [own] = lastResults(v14, { revisionNumber: 1, issuedAt: ISSUE_1 }).filter((entry) => entry.equipmentId === blockOf(v14, TF).equipment.id);
    expect(own?.value.plate_measured).toEqual([WINDING, OIL]);
    // A written by the new code, and no plate kept on the row (the field alone answers).
    const draft = withTop(copiedWithoutOil(v14), (entry) => ({ ...entry, plate_measured: own!.value.plate_measured! }));
    expect(blockOf(draft, TF).equipment.last_nameplate).toBeNull();
    expect(previousTyped(draft, OIL)).toBe(true);
    expect(historyFlags(draft)).toEqual([]);
    const after = issued(draft, { revisionNumber: 1, issuedAt: ISSUE_1 });
    expect(transformerEntry(after).prior?.plate_measured).toEqual([WINDING, OIL]);
    expect(historyFlags(after)).toEqual([]);
    expect(readersOf(after)).toEqual(readersOf(draft));
  });
});

describe('e25r-R1-UNIT-003 matrix row 5: a later relatório C issued on top', () => {
  it('B still a draft, C (dated after B\'s visit) issued on the same equipment: top C, prior A with the field, the plate C\'s; B flags nothing', () => {
    const before = row1(v14);
    const later = asRelatorio(before, RELATORIO_C, '2026-12-02');
    const after: RelatorioSnapshot = { ...before, equipment: issuedEquipment(later, { revisionNumber: 1, issuedAt: '2026-12-03T12:00:00.000Z' }) };
    const entry = transformerEntry(after);
    expect(entry).toMatchObject({ relatorio_id: RELATORIO_C, service_date: '2026-12-02', prior: { relatorio_id: transformerEntry(before).relatorio_id, plate_measured: [OIL] } });
    expect(blockOf(after, TF).equipment.last_nameplate?.relatorio_id).toBe(RELATORIO_C);
    // B's visit (2026-11-04) is before C's: it reads the prior, A.
    const { block } = blockOf(after, TF);
    expect(visitContextOf(after, block).previous?.relatorio_id).toBe(transformerEntry(before).relatorio_id);
    expect(previousTyped(after, OIL)).toBe(true);
    expect(historyFlags(after)).toEqual([]);
    expect(readersOf(after)).toEqual(readersOf(before));
  });

  it('row 10: the same on v13 is compared', () => {
    const before = row1(v13);
    const after: RelatorioSnapshot = { ...before, equipment: issuedEquipment(asRelatorio(before, RELATORIO_C, '2026-12-02'), { revisionNumber: 1, issuedAt: '2026-12-03T12:00:00.000Z' }) };
    expect(historyFlags(after).length).toBeGreaterThan(0);
  });
});

describe('e25r-R1-UNIT-004 matrix rows 6 to 8: compared as v13 where the previous plate does not say "typed"', () => {
  const compared = (make: (snapshot: RelatorioSnapshot) => RelatorioSnapshot) => {
    for (const snapshot of [make(v14), issued(make(v14), { revisionNumber: 1, issuedAt: ISSUE_1 })]) expect(historyFlags(snapshot).length).toBeGreaterThan(0);
    expect(verdictsOf(make(v14))).toEqual(verdictsOf(make(v13)));
    expect(verdictsOf(issued(make(v14), { revisionNumber: 1, issuedAt: ISSUE_1 }))).toEqual(verdictsOf(issued(make(v13), { revisionNumber: 1, issuedAt: ISSUE_1 })));
  };

  it('row 6: neither visit typed it, by the field (plate_measured []) or by the fallback plate without the key', () => {
    compared((snapshot) => withTop(copiedWithoutOil(snapshot), (entry) => ({ ...entry, plate_measured: [] })));
    compared((snapshot) => withPlate(copiedWithoutOil(snapshot), oilPlate(null)));
    // The fill keeps the answer: A's plate had no oil, so the prior carries [] once B is issued.
    const after = issued(withPlate(copiedWithoutOil(v14), oilPlate(null)), { revisionNumber: 1, issuedAt: ISSUE_1 });
    expect(transformerEntry(after).prior?.plate_measured).toEqual([]);
    expect(previousTyped(after, OIL)).toBe(false);
  });

  it('row 7: both visits typed it (B\'s plate at 40 °C too): compared, as v13', () => {
    const both = (snapshot: RelatorioSnapshot) =>
      withTop(
        withBlock(copiedWithoutOil(snapshot), TF, (next) => {
          next.sheet.nameplate[OIL] = cell(celsius('40'));
          return next;
        }),
        (entry) => ({ ...entry, plate_measured: [OIL] }),
      );
    expect(verdictsOf(both(v14))).toEqual(verdictsOf(both(v13)));
    const after = (snapshot: RelatorioSnapshot) => issued(both(snapshot), { revisionNumber: 1, issuedAt: ISSUE_1 });
    expect(verdictsOf(after(v14))).toEqual(verdictsOf(after(v13)));
    expect(transformerEntry(after(v14)).plate_measured).toEqual([WINDING, OIL]);
  });

  it('row 8 (the production leftovers, D5): an entry without the field and a plate of another visit: compared, as v13, before and after an issue (nothing to fill from)', () => {
    compared((snapshot) => withPlate(copiedWithoutOil(snapshot), oilPlate(), { relatorio_id: RELATORIO_X, revision_number: 1 }));
    const after = issued(withPlate(copiedWithoutOil(v14), oilPlate(), { relatorio_id: RELATORIO_X, revision_number: 1 }), { revisionNumber: 1, issuedAt: ISSUE_1 });
    const prior = transformerEntry(after).prior;
    expect(prior).not.toBeNull();
    expect(Object.hasOwn(prior!, 'plate_measured')).toBe(false);
    expect(previousTyped(after, OIL)).toBeNull();
  });
});

describe('e25r-R1-UNIT-005 matrix row 9 (E24-A1 item 2): a previous plate temperature counts only as a finite number', () => {
  for (const raw of ['abc', '', '1e5', 'NaN']) {
    it(`by the fallback: A's oil cell measured "${raw}" is not typed, so B is compared, as v13`, () => {
      const make = (snapshot: RelatorioSnapshot) => withPlate(copiedWithoutOil(snapshot), oilPlate(raw));
      expect(previousTyped(make(v14), OIL)).toBe(false);
      expect(historyFlags(make(v14)).length).toBeGreaterThan(0);
      expect(verdictsOf(make(v14))).toEqual(verdictsOf(make(v13)));
    });

    it(`by the field: the fill from that plate leaves the oil out ("${raw}"), and a sheet holding it issues without it`, () => {
      const after = issued(withPlate(copiedWithoutOil(v14), oilPlate(raw)), { revisionNumber: 1, issuedAt: ISSUE_1 });
      expect(transformerEntry(after).prior?.plate_measured).toEqual([]);
      expect(historyFlags(after).length).toBeGreaterThan(0);
      const typedNoNumber = withBlock(v14, TF, (next) => {
        next.sheet.nameplate[OIL] = cell(celsius(raw));
        return next;
      });
      const [own] = lastResults(typedNoNumber, { revisionNumber: 1, issuedAt: ISSUE_1 }).filter((entry) => entry.equipmentId === blockOf(v14, TF).equipment.id);
      expect(own?.value.plate_measured).toEqual([WINDING]);
    });
  }
});

describe('e25r-R1-UNIT-006 matrix row 11: a v1 to v12 sheet issued keeps its bytes (no key)', () => {
  for (const version of ['v5', 'v11', 'v12']) {
    it(`${version}: no entry the issue writes carries plate_measured`, () => {
      const entries = lastResults(layoutLockSnapshot(version), { revisionNumber: 1, issuedAt: ISSUE_1 });
      expect(entries.length).toBeGreaterThan(0);
      expect(JSON.stringify(entries)).not.toContain('plate_measured');
    });
  }

  it('v12: an issue over an entry without the field whose plate is still on the row fills nothing (the definition names no plate temperature)', () => {
    const v12 = layoutLockSnapshot('v12');
    const { equipment } = blockOf(v12, TF);
    const entry: LastResults = { relatorio_id: RELATORIO_X, revision_number: 1, issued_at: '2025-11-05T12:00:00.000Z', seed_version: 'v12', block_type: TF, readings: {}, prior: null };
    const plate = { relatorio_id: RELATORIO_X, revision_number: 1, issued_at: entry.issued_at, seed_version: 'v12', block_type: TF, fields: oilPlate() };
    const snapshot: RelatorioSnapshot = { ...v12, equipment: v12.equipment.map((row) => (row.id === equipment.id ? { ...row, last_results: entry, last_nameplate: plate } : row)) };
    const written = lastResults(snapshot, { revisionNumber: 1, issuedAt: ISSUE_1 });
    const mine = written.find((one) => one.equipmentId === equipment.id);
    expect(mine?.value.prior).toEqual({ relatorio_id: RELATORIO_X, revision_number: 1, issued_at: entry.issued_at, seed_version: 'v12', block_type: TF, readings: {} });
    expect(JSON.stringify(written)).not.toContain('plate_measured');
  });
});

describe('e25r-R1-UNIT-007 matrix row 12: a dry unit, TEMPERATURA DO ENROLAMENTO typed by A and not by B', () => {
  const dryPlate: Record<string, JsonValue> = { tipo_de_isolacao: DRY_UNIT, [WINDING]: celsius('45') };
  const make = (snapshot: RelatorioSnapshot) => withPlate(copiedOnDryUnit(snapshot), dryPlate);

  it('as rows 1 to 3 with the dry_field key: no flag before, after revision 1 and after revision 2; v13 flags it', () => {
    const before = make(v14);
    expect(previousTyped(before, WINDING)).toBe(true);
    expect(historyFlags(before)).toEqual([]);
    expect(historyFlags(make(v13)).length).toBeGreaterThan(0);
    const revision1 = issued(before, { revisionNumber: 1, issuedAt: ISSUE_1 });
    expect(transformerEntry(revision1).prior?.plate_measured).toEqual([WINDING]);
    expect(historyFlags(revision1)).toEqual([]);
    expect(readersOf(revision1)).toEqual(readersOf(before));
    const revision2 = issued(revision1, { revisionNumber: 2, issuedAt: ISSUE_2, firstIssuedAt: ISSUE_1 });
    expect(historyFlags(revision2)).toEqual([]);
    expect(readersOf(revision2)).toEqual(readersOf(before));
  });
});

describe('e25r-R1-UNIT-008 matrix row 13: a branch that writes no entry for the equipment still keeps the plate\'s answer', () => {
  /** P, a visit of another relatório on 2026-11-20 (after B's), with A's readings. */
  const p = { ...withoutPrior(transformerEntry(v14)), relatorio_id: RELATORIO_X, service_date: '2026-11-20' };

  it('B (2026-11-04) older than the top A (2026-12-01), whose prior P (2026-11-20) is newer than B too: nothing else is written, A gets the field from its plate', () => {
    const before = withPlate(
      withTop(copiedWithoutOil(v14), (entry) => ({ ...entry, service_date: '2026-12-01', prior: p })),
      oilPlate(),
    );
    const top = transformerEntry(before);
    const written = lastResults(before, { revisionNumber: 1, issuedAt: ISSUE_1 }).filter((entry) => entry.equipmentId === blockOf(before, TF).equipment.id);
    expect(written.map((entry) => entry.value)).toEqual([{ ...top, plate_measured: [OIL] }]);
    // A later visit (C, after A) then reads A with its answer, though B's plate is now the one on the row.
    const after = issued(before, { revisionNumber: 1, issuedAt: ISSUE_1 });
    expect(blockOf(after, TF).equipment.last_nameplate?.relatorio_id).toBe(before.relatorio.id);
    const later = asRelatorio(after, RELATORIO_C, '2026-12-10');
    const { block } = blockOf(later, TF);
    expect(visitContextOf(later, block).previous?.relatorio_id).toBe(top.relatorio_id);
    expect(previousTyped(later, OIL)).toBe(true);
  });

  it('the fill changes nothing (A already carries the field): nothing is written, as before', () => {
    const before = withPlate(
      withTop(copiedWithoutOil(v14), (entry) => ({ ...entry, service_date: '2026-12-01', plate_measured: [OIL], prior: p })),
      oilPlate(),
    );
    expect(lastResults(before, { revisionNumber: 1, issuedAt: ISSUE_1 }).filter((entry) => entry.equipmentId === blockOf(before, TF).equipment.id)).toEqual([]);
  });
});
