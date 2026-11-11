import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { composeConclusion } from '../relatorio/conclusion.ts';
import { evaluateSheetMeasurements } from '../relatorio/measurement-evaluation.ts';
import { evaluateSheetReadings } from '../relatorio/readings.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { lastResultsSchema, type BlockRow, type Cell, type EquipmentRow, type LastResults, type LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { historyNoteText, measurementHistoryItems, testHistoryItems } from './history-note.ts';
import { lastResults, previousHelpers, previousHelperText, previousResultsFor, readingSlotsOf } from './last-results.ts';
import { withoutPrior } from './reading-slots.ts';
import { readingFitWidthEm, section9Layout, wordsWiderThanColumns, type PrintSheet, type PrintTable, type SheetPart } from './section-9.ts';
import { compareVisits, previousHeaderText, previousVisitDateText, visitDateOf, visitDateText } from './visit-date.ts';

/*
 * Batch e24p (Stories 24.15 and 24.16): the visit's date kept at issue and the order it gives
 * (every seed), the "Anterior" helper's date (every seed), the dated MANUT. ANTERIOR header and the
 * dated history texts (seed v14, `previous_visit_date`), and the note line under a table naming the
 * rows a previous-visit rule flagged (seed v14, `history_note`). Every value is invented; the
 * relatórios are the layout lock's synthetic ones (v13 and v14 carry a previous visit with a contact
 * rise out and an insulation drop restricted) and a synthetic transformer in its four insulation shapes.
 */

const TITLE = 'RELATÓRIOS DOS ENSAIOS';
const PREVIOUS = 'MANUT. ANTERIOR';
const NOTE = 'Em relação à manutenção anterior: ';

const sheetsOf = (snapshot: RelatorioSnapshot): PrintSheet[] => (section9Layout(snapshot, 9, TITLE)?.subsections ?? []).flatMap((s) => s.sheets);
const tablesOf = (sheet: PrintSheet): PrintTable[] => sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const notesOf = (sheet: PrintSheet): string[] => sheet.parts.flatMap((part) => (part.kind === 'paragraph' && part.text.startsWith(NOTE) ? [part.text] : []));
const isPreviousHeader = (text: string) => text === PREVIOUS || text.startsWith(`${PREVIOUS}\n`);
const previousHeaders = (sheet: PrintSheet): string[] => tablesOf(sheet).flatMap((table) => table.rows.flatMap((row) => row.cells.flatMap((cell) => (isPreviousHeader(cell.text) ? [cell.text] : []))));
const hasPrevious = (table: PrintTable) => table.rows.some((row) => row.cells.some((cell) => isPreviousHeader(cell.text)));

/** The layout lock's first block of `type` and its equipment row (the three with a previous visit: transformer, seccionadora, disjuntor). */
function blockOf(snapshot: RelatorioSnapshot, type: string): { block: BlockRow; equipment: EquipmentRow } {
  const block = snapshot.blocks.find((one) => one.block_type === type && one.removed_at === null && one.equipment_id !== null)!;
  return { block, equipment: snapshot.equipment.find((row) => row.id === block.equipment_id)! };
}

const sheetOf = (snapshot: RelatorioSnapshot, type: string): PrintSheet => {
  const { block } = blockOf(snapshot, type);
  return sheetsOf(snapshot).find((sheet) => sheet.blockId === block.id)!;
};

/** The snapshot with the previous visit of `type`'s equipment changed (a new row object, as a fold gives). */
function withPrevious(snapshot: RelatorioSnapshot, type: string, change: (entry: LastResults) => LastResults | null): RelatorioSnapshot {
  const { equipment } = blockOf(snapshot, type);
  return { ...snapshot, equipment: snapshot.equipment.map((row) => (row.id === equipment.id ? { ...row, last_results: change(row.last_results!) } : row)) };
}

/** The snapshot with `type`'s block changed (a new row object). */
function withBlock(snapshot: RelatorioSnapshot, type: string, change: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  const { block } = blockOf(snapshot, type);
  return { ...snapshot, blocks: snapshot.blocks.map((row) => (row.id === block.id ? change(structuredClone(row)) : row)) };
}

const dated = (serviceDate: string) => (entry: LastResults): LastResults => ({ ...entry, service_date: serviceDate });

const v13 = layoutLockSnapshot('v13');
const v14 = layoutLockSnapshot('v14');

describe('24.15-UNIT the visit\'s date (visitDateOf, visitDateText, compareVisits)', () => {
  it('is the service date kept (a day or a month), else the issue instant\'s calendar day in America/Sao_Paulo', () => {
    expect(visitDateOf({ issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03-14' })).toBe('2026-03-14');
    expect(visitDateOf({ issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03' })).toBe('2026-03');
    // 02:00 UTC is still the day before in São Paulo.
    expect(visitDateOf({ issued_at: '2026-04-02T02:00:00.000Z' })).toBe('2026-04-01');
    expect(visitDateText({ issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03-14' })).toBe('14/03/2026');
    expect(visitDateText({ issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03' })).toBe('03/2026');
    expect(visitDateText({ issued_at: '2026-04-02T15:00:00.000Z' })).toBe('02/04/2026');
  });

  it('orders two visits by their dates only when one of them keeps a service date; a month and a day of it are equal', () => {
    const at = (issued: string, service?: string) => (service === undefined ? { issued_at: issued } : { issued_at: issued, service_date: service });
    // Neither keeps one: the dates do not decide (today's order, by first issue), whatever the instants.
    expect(compareVisits(at('2026-01-01T12:00:00.000Z'), at('2026-06-01T12:00:00.000Z'))).toBe(0);
    expect(compareVisits(at('2026-06-01T12:00:00.000Z', '2026-03-14'), at('2026-01-01T12:00:00.000Z', '2026-09-02'))).toBeLessThan(0);
    expect(compareVisits(at('2026-01-01T12:00:00.000Z', '2026-09-02'), at('2026-06-01T12:00:00.000Z', '2026-03-14'))).toBeGreaterThan(0);
    expect(compareVisits(at('2026-01-01T12:00:00.000Z', '2026-03-14'), at('2026-06-01T12:00:00.000Z', '2026-03-14'))).toBe(0);
    expect(compareVisits(at('2026-01-01T12:00:00.000Z', '2026-03'), at('2026-06-01T12:00:00.000Z', '2026-03-31'))).toBe(0);
    expect(compareVisits(at('2026-01-01T12:00:00.000Z', '2026-03'), at('2026-06-01T12:00:00.000Z', '2026-04-01'))).toBeLessThan(0);
    // One without: its issue day stands for its visit.
    expect(compareVisits(at('2026-11-20T12:00:00.000Z', '2026-10-01'), at('2026-10-20T12:00:00.000Z'))).toBeLessThan(0);
    expect(compareVisits(at('2026-11-20T12:00:00.000Z', '2026-11-04'), at('2026-10-20T12:00:00.000Z'))).toBeGreaterThan(0);
  });

  it('names the visit\'s date on a seed with previous_visit_date (v14), the issue date on v1 to v13; the header likewise', () => {
    const entry = { issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03-14' };
    expect(previousVisitDateText(entry, 'v14')).toBe('14/03/2026');
    expect(previousVisitDateText(entry, 'v13')).toBe('02/04/2026');
    expect(previousVisitDateText({ issued_at: entry.issued_at }, 'v14')).toBe('02/04/2026');
    expect(previousHeaderText(entry, 'v14')).toBe('MANUT. ANTERIOR\n14/03/2026');
    expect(previousHeaderText({ ...entry, service_date: '2026-03' }, 'v14')).toBe('MANUT. ANTERIOR\n03/2026');
    expect(previousHeaderText({ issued_at: entry.issued_at }, 'v14')).toBe('MANUT. ANTERIOR\n02/04/2026');
    for (const version of ['v5', 'v11', 'v12', 'v13']) expect(previousHeaderText(entry, version), version).toBe('MANUT. ANTERIOR');
  });

  it('the "Anterior" helper names the visit\'s date on every seed', () => {
    const reading = { raw: '4.9', unit: 'GΩ', state: 'measured' as const };
    expect(previousHelperText({ revision_number: 1, issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03-14' }, reading)).toBe('Anterior: 4,9 GΩ (rev. 1, 14/03/2026)');
    expect(previousHelperText({ revision_number: 2, issued_at: '2026-04-02T15:00:00.000Z', service_date: '2026-03' }, reading)).toBe('Anterior: 4,9 GΩ (rev. 2, 03/2026)');
    expect(previousHelperText({ revision_number: 1, issued_at: '2026-04-02T15:00:00.000Z' }, reading)).toBe('Anterior: 4,9 GΩ (rev. 1, 02/04/2026)');
  });
});

// --- lastResults: the date kept and the order ----------------------------------------------------

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const rid = (letter: string) => `019a6400-2415-7000-8000-00000000000${letter}`;
const eid = (n: number) => `019a6400-2415-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: eid(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function cabine(relatorioId: string): LocationRow {
  return {
    id: eid(1),
    relatorio_id: relatorioId,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine sintética',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: false,
  };
}

/** One relatório of the obra holding a cabos de saída with one reading, its equipment carrying `last` (the state before its issue). */
function relatorioOf(relatorioId: string, service: { start: string | null; end: string | null }, last: LastResults | null, raw = '4.9'): RelatorioSnapshot {
  const built = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: eid(1001), equipmentId: eid(2001), relatorioId, projectId: TEST_PROJECT, locationId: eid(1), type: 'cabos_saida', tag: 'CB-1', seedVersion: 'v13', orderKey: 'a1' });
  const block = structuredClone(built.block);
  block.sheet.test.isolacao = { ...block.sheet.test.isolacao, cells: { '0': { '1': cell(measured(raw, 'GΩ')) } } } as never;
  const setup = { ...small.relatorio.setup, service_start: service.start, service_end: service.end };
  return { ...small, relatorio: { ...small.relatorio, id: relatorioId, setup }, locations: [cabine(relatorioId)], blocks: [block], equipment: [{ ...built.equipment, last_results: last }], files: [], points: [], suggestions: [], actors: [] };
}

/** The obra's equipment row after issuing relatório `id` (revision 1) over `last`: its new `last_results`. */
function issue(last: LastResults | null, id: string, service: { start: string | null; end: string | null }, issuedAt: string): LastResults | null {
  const [entry] = lastResults(relatorioOf(id, service, last), { revisionNumber: 1, issuedAt, firstIssuedAt: issuedAt });
  return entry === undefined ? last : entry.value;
}

const day = (end: string) => ({ start: null, end });

describe('24.15-UNIT the date an issue keeps (lastResults, every seed)', () => {
  it('keeps service_end as the visit\'s date beside issued_at; service_start when no end; no key with neither', () => {
    const [ended] = lastResults(relatorioOf(rid('a'), { start: '2026-03-12', end: '2026-03-14' }, null), { revisionNumber: 1, issuedAt: '2026-04-02T15:00:00.000Z' });
    expect(ended!.value.service_date).toBe('2026-03-14');
    expect(ended!.value.issued_at).toBe('2026-04-02T15:00:00.000Z');
    expect(Object.keys(ended!.value).slice(0, 4)).toEqual(['relatorio_id', 'revision_number', 'issued_at', 'service_date']);
    expect(lastResultsSchema.parse(ended!.value)).toEqual(ended!.value);
    const [started] = lastResults(relatorioOf(rid('a'), { start: '2026-03', end: null }, null), { revisionNumber: 1, issuedAt: '2026-04-02T15:00:00.000Z' });
    expect(started!.value.service_date).toBe('2026-03');
    const [none] = lastResults(relatorioOf(rid('a'), { start: null, end: null }, null), { revisionNumber: 1, issuedAt: '2026-04-02T15:00:00.000Z' });
    expect(Object.hasOwn(none!.value, 'service_date')).toBe(false);
    // The prior keeps the date of the visit it was (withoutPrior copies it), and an older entry parses to the same bytes.
    const [over] = lastResults(relatorioOf(rid('b'), day('2026-09-02'), ended!.value), { revisionNumber: 1, issuedAt: '2026-09-05T15:00:00.000Z' });
    expect(over!.value.prior).toMatchObject({ relatorio_id: rid('a'), service_date: '2026-03-14' });
    expect(lastResultsSchema.parse(none!.value)).toEqual(none!.value);
  });

  it('B (service in September) on top, A (service in March) issued after: B stays on top with A as its prior; B reads A, a later C reads B', () => {
    const b = issue(null, rid('b'), day('2026-09-02'), '2026-09-05T15:00:00.000Z')!;
    const afterA = issue(b, rid('a'), day('2026-03-14'), '2026-10-01T15:00:00.000Z')!;
    expect(afterA).toMatchObject({ relatorio_id: rid('b'), service_date: '2026-09-02', prior: { relatorio_id: rid('a'), service_date: '2026-03-14' } });
    const block = { block_type: 'cabos_saida' };
    expect(previousResultsFor({ last_results: afterA }, block, rid('b'))).toMatchObject({ relatorio_id: rid('a') });
    expect(previousResultsFor({ last_results: afterA }, block, rid('c'))).toMatchObject({ relatorio_id: rid('b') });
    // A reads no previous visit (the later B is not one).
    expect(previousResultsFor({ last_results: afterA }, block, rid('a'))).toBeNull();
    expect(lastResultsSchema.parse(afterA)).toEqual(afterA);
  });

  it('an older visit replaces the top\'s prior only when that prior is older than it (or none); else nothing is written', () => {
    const p = issue(null, rid('e'), day('2026-01-10'), '2026-01-12T15:00:00.000Z')!;
    const b = issue(p, rid('b'), day('2026-09-02'), '2026-09-05T15:00:00.000Z')!;
    expect(b.prior).toMatchObject({ relatorio_id: rid('e') });
    // A (March) is newer than the prior (January): it takes the prior's place.
    expect(issue(b, rid('a'), day('2026-03-14'), '2026-10-01T15:00:00.000Z')).toMatchObject({ relatorio_id: rid('b'), prior: { relatorio_id: rid('a') } });
    // D (in 2025) is older than the prior: nothing is written for that equipment.
    expect(lastResults(relatorioOf(rid('d'), day('2025-12-01'), b), { revisionNumber: 1, issuedAt: '2026-10-01T15:00:00.000Z' })).toEqual([]);
  });

  it('three visits issued in every order end with the newest on top and the middle one as its prior', () => {
    const visits = [
      { id: rid('a'), service: day('2026-03-14') },
      { id: rid('b'), service: day('2026-06-10') },
      { id: rid('c'), service: day('2026-09-02') },
    ];
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (const order of orders) {
      let last: LastResults | null = null;
      order.forEach((index, n) => {
        last = issue(last, visits[index]!.id, visits[index]!.service, `2026-10-0${n + 1}T15:00:00.000Z`);
      });
      expect(last, order.join('')).toMatchObject({ relatorio_id: rid('c'), prior: { relatorio_id: rid('b') } });
    }
  });

  it('with no service date on either, every order is today\'s (the last issued on top, the one before as its prior), byte for byte', () => {
    const none = { start: null, end: null };
    for (const order of [
      ['a', 'b', 'c'],
      ['c', 'b', 'a'],
      ['b', 'c', 'a'],
    ]) {
      let last: LastResults | null = null;
      const issued: LastResults[] = [];
      order.forEach((letter, n) => {
        last = issue(last, rid(letter), none, `2026-10-0${n + 1}T15:00:00.000Z`);
        issued.push(last!);
      });
      const [, second, third] = issued;
      // Today's rule: X on top, prior the entry it was issued over (without its own prior).
      expect(third).toEqual({ ...third!, relatorio_id: rid(order[2]!), prior: withoutPrior(second!) });
      expect(Object.keys(third!.prior!)).toEqual(['relatorio_id', 'revision_number', 'issued_at', 'seed_version', 'block_type', 'readings']);
      expect(JSON.stringify(third)).not.toContain('service_date');
    }
  });

  it('one entry from before the story (no service date) is dated by its issue day', () => {
    const old = issue(null, rid('e'), { start: null, end: null }, '2026-10-20T15:00:00.000Z')!;
    // A visit on 2026-10-01 issued later is older than the visit issued on 2026-10-20: it becomes the prior.
    expect(issue(old, rid('a'), day('2026-10-01'), '2026-11-20T15:00:00.000Z')).toMatchObject({ relatorio_id: rid('e'), prior: { relatorio_id: rid('a') } });
    // A visit on 2026-11-04 is newer: on top, as before.
    expect(issue(old, rid('a'), day('2026-11-04'), '2026-11-20T15:00:00.000Z')).toMatchObject({ relatorio_id: rid('a'), prior: { relatorio_id: rid('e') } });
  });

  it('a re-issue of a visit dated newer than an unrelated top issued after it takes the top (the dates decide, not the e23w skip)', () => {
    const later: LastResults = { ...issue(null, rid('c'), day('2026-02-01'), '2026-10-20T15:00:00.000Z')!, prior: null };
    const [entry] = lastResults(relatorioOf(rid('a'), day('2026-09-02'), later), { revisionNumber: 2, issuedAt: '2026-10-25T15:00:00.000Z', firstIssuedAt: '2026-10-05T15:00:00.000Z' });
    expect(entry!.value).toMatchObject({ relatorio_id: rid('a'), revision_number: 2, prior: { relatorio_id: rid('c') } });
  });
});

// --- the dated header and the dated history texts (seed v14) -------------------------------------

describe('24.15-UNIT the MANUT. ANTERIOR header and the history texts name the visit\'s date on v14 (previous_visit_date)', () => {
  it('v14: every MANUT. ANTERIOR header prints the visit\'s date on a second line (the issue day of an entry from before the story); v13 the header alone', () => {
    for (const type of ['transformador_forca', 'chave_seccionadora', 'disjuntor_mt']) {
      expect(previousHeaders(sheetOf(v14, type)).length, type).toBeGreaterThan(0);
      for (const header of previousHeaders(sheetOf(v14, type))) expect(header, type).toBe('MANUT. ANTERIOR\n05/11/2025');
      for (const header of previousHeaders(sheetOf(v13, type))) expect(header, type).toBe('MANUT. ANTERIOR');
    }
    const kept = withPrevious(v14, 'disjuntor_mt', dated('2025-10-30'));
    for (const header of previousHeaders(sheetOf(kept, 'disjuntor_mt'))) expect(header).toBe('MANUT. ANTERIOR\n30/10/2025');
    const month = withPrevious(v14, 'disjuntor_mt', dated('2025-10'));
    for (const header of previousHeaders(sheetOf(month, 'disjuntor_mt'))) expect(header).toBe('MANUT. ANTERIOR\n10/2025');
    // v13 keeps the header alone, a service date kept or not.
    for (const header of previousHeaders(sheetOf(withPrevious(v13, 'disjuntor_mt', dated('2025-10-30')), 'disjuntor_mt'))) expect(header).toBe('MANUT. ANTERIOR');
  });

  it('v14: each table with the dated header keeps v13\'s column weights, type size and every other cell', () => {
    for (const type of ['transformador_forca', 'chave_seccionadora', 'disjuntor_mt']) {
      const old = tablesOf(sheetOf(v13, type)).filter(hasPrevious);
      const now = tablesOf(sheetOf(withPrevious(v14, type, dated('2025-10-30')), type)).filter(hasPrevious);
      expect(now.length, type).toBe(old.length);
      now.forEach((table, i) => {
        expect(table.columns, type).toEqual(old[i]!.columns);
        expect(table.textHalfPoints, type).toBe(old[i]!.textHalfPoints);
        const strip = (one: PrintTable) => one.rows.map((row) => row.cells.map((c) => (isPreviousHeader(c.text) ? PREVIOUS : c.text)));
        expect(strip(table), type).toEqual(strip(old[i]!));
        expect(wordsWiderThanColumns(table, readingFitWidthEm(table)), type).toEqual([]);
      });
    }
  });

  it('v14: the contact rise, the insulation drop and the winding variation name the visit\'s date; v13 the issue date', () => {
    const riseOf = (snapshot: RelatorioSnapshot) => {
      const { block } = blockOf(snapshot, 'chave_seccionadora');
      const test = evaluateSheetReadings(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type), visitContextOf(snapshot, block)).find((one) => one.testKey === 'resistencia_contato')!;
      return test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.flatMap((c) => (c.rise === undefined ? [] : [c.rise.reason]))));
    };
    const dropOf = (snapshot: RelatorioSnapshot) => {
      const { block } = blockOf(snapshot, 'transformador_forca');
      const test = evaluateSheetReadings(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type), visitContextOf(snapshot, block)).find((one) => one.testKey === 'isolacao')!;
      return test.tables.flatMap((table) => table.rows.flatMap((row) => row.cells.flatMap((c) => (c.restriction?.history === undefined ? [] : [c.restriction.text]))));
    };
    const keptV14 = withPrevious(withPrevious(v14, 'chave_seccionadora', dated('2025-10-30')), 'transformador_forca', dated('2025-10-30'));
    const keptV13 = withPrevious(withPrevious(v13, 'chave_seccionadora', dated('2025-10-30')), 'transformador_forca', dated('2025-10-30'));
    expect(riseOf(keptV14).length).toBeGreaterThan(0);
    for (const reason of riseOf(keptV14)) expect(reason).toContain('rev. 1 de 30/10/2025');
    for (const reason of riseOf(keptV13)) expect(reason).toContain('rev. 1 de 05/11/2025');
    expect(dropOf(keptV14).length).toBeGreaterThan(0);
    for (const text of dropOf(keptV14)) expect(text).toContain('rev. 1, 30/10/2025');
    for (const text of dropOf(keptV13)) expect(text).toContain('rev. 1, 05/11/2025');
    const windingOf = (snapshot: RelatorioSnapshot) => {
      const varied = withPrevious(snapshot, 'transformador_forca', windingMoved);
      const { block } = blockOf(varied, 'transformador_forca');
      const tests = evaluateSheetMeasurements(block, getDefinition(block.seed_version, 'cabine_primaria', block.block_type), visitContextOf(varied, block));
      return tests.flatMap((test) => test.rows.flatMap((row) => row.cells.flatMap((c) => (c.restriction?.history === undefined ? [] : [c.restriction.text]))));
    };
    expect(windingOf(keptV14).length).toBeGreaterThan(0);
    for (const text of windingOf(keptV14)) expect(text).toContain('rev. 1, 30/10/2025');
    for (const text of windingOf(keptV13)) expect(text).toContain('rev. 1, 05/11/2025');
  });
});

/** The previous winding readings 10 % lower (their 75 °C values too): every phase moved more than 2 %. */
function windingMoved(entry: LastResults): LastResults {
  const scale = (raw: string) => String(Math.round(Number(raw) * 0.9 * 10_000) / 10_000);
  const readings = Object.fromEntries(
    Object.entries(entry.readings).map(([key, reading]) => [
      key,
      key.startsWith('resistencia_enrolamento|')
        ? { ...reading, raw: scale(reading.raw), ...(reading.corrected === undefined ? {} : { corrected: { ...reading.corrected, raw: scale(reading.corrected.raw) } }) }
        : reading,
    ]),
  );
  return { ...entry, readings };
}

// --- the four insulation shapes of the v13 transformer, on v14 ------------------------------------

describe('24.15-UNIT the transformer\'s insulation table in its four shapes keeps v13\'s weights and sizes on v14, every word whole', () => {
  /** a: the manufacturer's value; b: TENSÃO NOMINAL AT and BT (ACEITÁVEL per row); c: b with a previous visit; d: a with a previous visit. */
  const SHAPES = ['a', 'b', 'c', 'd'] as const;

  function shapeSnapshot(version: string, shape: (typeof SHAPES)[number]): RelatorioSnapshot {
    const relatorioId = small.relatorio.id;
    const built = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: eid(3001), equipmentId: eid(4001), relatorioId, projectId: TEST_PROJECT, locationId: eid(1), type: 'transformador_forca', tag: 'TR-1', seedVersion: version, orderKey: 'a1' });
    const block = structuredClone(built.block);
    block.sheet.nameplate.tipo_de_isolacao = cell('ÓLEO ISOLANTE');
    block.sheet.nameplate.temperatura_oleo_c = cell(measured('35', '°C'));
    const test = (block.sheet.test.isolacao ??= { cells: {} } as never);
    if (shape === 'b' || shape === 'c') {
      block.sheet.nameplate.tensao_nominal_at = cell(measured('13.8', 'kV'));
      block.sheet.nameplate.tensao_nominal_bt = cell(measured('380', 'V'));
    } else {
      test.criterion_override = cell({ raw: '1000', unit: 'MΩ' });
    }
    for (const [row, raw] of [
      [0, '8'],
      [1, '9'],
      [2, '0.6'],
    ] as const) {
      test.cells[String(row)] = { ...test.cells[String(row)], '1': cell(measured(raw, 'GΩ')) };
    }
    const definition = getDefinition(version, 'cabine_primaria', 'transformador_forca');
    const readings = Object.fromEntries(
      readingSlotsOf(definition)
        .filter((slot) => slot.testKey === 'isolacao')
        .map((slot) => [slot.key, { raw: '12', unit: 'GΩ', state: 'measured' as const, corrected: { raw: '30', unit: 'GΩ' } }]),
    );
    const last: LastResults | null =
      shape === 'c' || shape === 'd' ? { relatorio_id: eid(900), revision_number: 1, issued_at: '2026-01-15T12:00:00.000Z', service_date: '2026-01-14', seed_version: version, block_type: 'transformador_forca', readings, prior: null } : null;
    return { ...small, relatorio: { ...small.relatorio, seed_version: version }, locations: [cabine(relatorioId)], blocks: [block], equipment: [{ ...built.equipment, last_results: last }], files: [], points: [], suggestions: [], actors: [] };
  }

  const insulation = (version: string, shape: (typeof SHAPES)[number]): PrintTable => {
    const [sheet] = sheetsOf(shapeSnapshot(version, shape));
    return tablesOf(sheet!).find((table) => table.rows.some((row) => row.cells.some((c) => c.text === '1 MINUTO')))!;
  };

  for (const shape of SHAPES) {
    it(`shape ${shape}`, () => {
      const old = insulation('v13', shape);
      const now = insulation('v14', shape);
      expect(now.columns).toEqual(old.columns);
      expect(now.textHalfPoints).toBe(old.textHalfPoints);
      expect(wordsWiderThanColumns(now, readingFitWidthEm(now))).toEqual([]);
      const headers = now.rows.flatMap((row) => row.cells.filter((c) => isPreviousHeader(c.text)).map((c) => c.text));
      expect(headers).toEqual(shape === 'c' || shape === 'd' ? ['MANUT. ANTERIOR\n14/01/2026'] : []);
    });
  }
});

// --- the history note (Story 24.16, seed v14) ----------------------------------------------------

describe('24.16-UNIT drops and rises against the previous visit as one note line under the table (history_note)', () => {
  it('composes "Em relação à manutenção anterior: ⟨onde⟩, ⟨motivo⟩; ⟨onde⟩, ⟨motivo⟩." and nothing with no item', () => {
    expect(historyNoteText([])).toBeNull();
    expect(historyNoteText([{ where: 'Polo A', reason: 'alta de 52,5 % sobre 40 µΩ' }])).toBe('Em relação à manutenção anterior: Polo A, alta de 52,5 % sobre 40 µΩ.');
    expect(historyNoteText([
      { where: 'Polo A', reason: 'r1' },
      { where: 'Polo C', reason: 'r2' },
    ])).toBe('Em relação à manutenção anterior: Polo A, r1; Polo C, r2.');
  });

  it('a contact rise (several poles): one line right after the contact table, in row order, each pole where the conclusion names it, the rise and the previous value; the table kept with it', () => {
    const sheet = sheetOf(v14, 'chave_seccionadora');
    expect(notesOf(sheet)).toEqual([
      'Em relação à manutenção anterior: T1-T2–Fase A, alta de 100 % sobre 20 µΩ da manutenção anterior, rev. 1 de 05/11/2025, acima do limite de 50 %; T3-T4–Fase B, alta de 100 % sobre 21,5 µΩ da manutenção anterior, rev. 1 de 05/11/2025, acima do limite de 50 %; T5-T6–Fase C, alta de 100 % sobre 23 µΩ da manutenção anterior, rev. 1 de 05/11/2025, acima do limite de 50 %.',
    ]);
    const at = sheet.parts.findIndex((part) => part.kind === 'paragraph' && part.text.startsWith(NOTE));
    const before = sheet.parts[at - 1]!;
    expect(before.kind === 'table' && before.table.rows[0]!.cells.some((c) => c.text === 'VALORES (µΩ)')).toBe(true);
    expect(before.keepWithNext).toBe(true);
    const { block } = blockOf(v14, 'chave_seccionadora');
    const definition = getDefinition('v14', 'cabine_primaria', 'chave_seccionadora');
    const test = evaluateSheetReadings(block, definition, visitContextOf(v14, block)).find((one) => one.testKey === 'resistencia_contato')!;
    expect(notesOf(sheet)[0]).toBe(historyNoteText(testHistoryItems(test)));
    // The conclusion names the same rise (its worst pole), at the same place and with the same words.
    const paragraph = composeConclusion(block, definition, 'SEC-1', visitContextOf(v14, block)).text;
    expect(paragraph).toContain('em T5-T6–Fase C (alta de 100 % sobre 23 µΩ da manutenção anterior, rev. 1 de 05/11/2025, acima do limite de 50 %)');
  });

  it('an insulation drop: the line names each row and both corrected values', () => {
    expect(notesOf(sheetOf(v14, 'transformador_forca'))).toEqual([
      'Em relação à manutenção anterior: Primário/Massa, queda de mais de 50 % desde a manutenção anterior (de 30.000 GΩ para 10.000 GΩ, a 20 °C); Primário/Secundário, queda de mais de 50 % desde a manutenção anterior (de 31.200 GΩ para 10.400 GΩ, a 20 °C); Secundário, queda de mais de 50 % desde a manutenção anterior (de 32.400 GΩ para 10.800 GΩ, a 20 °C).',
    ]);
  });

  it('a table with no flagged row, no previous visit or a previous visit on v12 (not judged) prints no line; v13 prints none at all', () => {
    expect(notesOf(sheetOf(v14, 'disjuntor_mt'))).toEqual([]);
    const noPrevious = withPrevious(withPrevious(v14, 'chave_seccionadora', () => null), 'transformador_forca', () => null);
    expect(notesOf(sheetOf(noPrevious, 'chave_seccionadora'))).toEqual([]);
    expect(notesOf(sheetOf(noPrevious, 'transformador_forca'))).toEqual([]);
    const onV12 = (entry: LastResults): LastResults => ({
      ...entry,
      seed_version: 'v12',
      readings: Object.fromEntries(Object.entries(entry.readings).map(([key, reading]) => [key, { raw: reading.raw, unit: reading.unit, state: reading.state }])),
    });
    const v12Previous = withPrevious(withPrevious(v14, 'chave_seccionadora', onV12), 'transformador_forca', onV12);
    expect(notesOf(sheetOf(v12Previous, 'chave_seccionadora'))).toEqual([]);
    expect(notesOf(sheetOf(v12Previous, 'transformador_forca'))).toEqual([]);
    for (const sheet of sheetsOf(v13)) expect(notesOf(sheet), sheet.title).toEqual([]);
    for (const sheet of sheetsOf(withPrevious(v13, 'transformador_forca', windingMoved))) expect(notesOf(sheet), sheet.title).toEqual([]);
  });

  it('a table with an instrument-limit note and a flagged row: both lines, the limit note first, both kept with the table', () => {
    const definition = getDefinition('v14', 'cabine_primaria', 'transformador_forca');
    const capture = definition.tests.find((test) => test.key === 'isolacao')!.tables[0]!.value_columns.findIndex((column) => column.role === 'capture');
    // The second row's reading above the instrument's limit (within its criterion): the limit note; the others still dropped.
    const limited = withBlock(v14, 'transformador_forca', (block) => {
      block.sheet.test.isolacao!.cells['1'] = { ...block.sheet.test.isolacao!.cells['1'], [String(capture)]: cell({ raw: '2', unit: 'TΩ', state: 'over_range' }) };
      return block;
    });
    const sheet = sheetOf(limited, 'transformador_forca');
    const at = sheet.parts.findIndex((part) => part.kind === 'paragraph' && part.text.startsWith('Valores de resistência de isolamento superiores'));
    expect(at).toBeGreaterThan(0);
    const table: SheetPart = sheet.parts[at - 1]!;
    const limit: SheetPart = sheet.parts[at]!;
    const history: SheetPart = sheet.parts[at + 1]!;
    expect(table.kind).toBe('table');
    expect(table.keepWithNext).toBe(true);
    expect(limit).toMatchObject({ kind: 'paragraph', text: 'Valores de resistência de isolamento superiores a 2 TΩ, limite de leitura do instrumento.', keepWithNext: true });
    expect(history).toEqual({
      kind: 'paragraph',
      text: 'Em relação à manutenção anterior: Primário/Massa, queda de mais de 50 % desde a manutenção anterior (de 30.000 GΩ para 10.000 GΩ, a 20 °C); Secundário, queda de mais de 50 % desde a manutenção anterior (de 32.400 GΩ para 10.800 GΩ, a 20 °C).',
    });
  });

  it('the measurement test\'s note slot: a winding phase varied by more than 2 % prints its line under the measurement table, kept with it', () => {
    const varied = withPrevious(v14, 'transformador_forca', windingMoved);
    const sheet = sheetOf(varied, 'transformador_forca');
    const at = sheet.parts.findIndex((part) => part.kind === 'table' && part.table.rows[0]!.cells[0]!.text === 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS');
    expect(at).toBeGreaterThan(0);
    const [table, note] = [sheet.parts[at]!, sheet.parts[at + 1]!];
    expect(table.keepWithNext).toBe(true);
    expect(note.kind === 'paragraph' && note.text.startsWith(`${NOTE}`)).toBe(true);
    const { block } = blockOf(varied, 'transformador_forca');
    const winding = evaluateSheetMeasurements(block, getDefinition('v14', 'cabine_primaria', 'transformador_forca'), visitContextOf(varied, block)).find((test) => test.testKey === 'resistencia_enrolamento')!;
    const items = measurementHistoryItems(winding);
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) expect(item.reason).toMatch(/^variação de mais de 2 % desde a manutenção anterior \(de .+ para .+, a 75 °C\)$/u);
    expect(note.kind === 'paragraph' && note.text).toBe(historyNoteText(items));
    // Without a flagged phase the measurement table stands alone, as before.
    const plain = sheetOf(v14, 'transformador_forca');
    const alone = plain.parts.findIndex((part) => part.kind === 'table' && part.table.rows[0]!.cells[0]!.text === 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS');
    expect(plain.parts[alone + 1]?.kind).not.toBe('paragraph');
  });
});

/*
 * Review fix (Story 24.16): "relevant" is what the three rules flag, so a reading already out by its
 * criterion that the insulation-drop or the winding-variation rule also flags is named in the note too.
 * Its verdict and `restriction` stay as they were (`historyOut` holds the rule's reason).
 */
describe('24.16-UNIT a reading out by its criterion that a previous-visit rule also flags is in the note line', () => {
  /** The transformer's insulation row 0 at 1 MΩ: out by its criterion, and far below the previous visit's. */
  const insulationOut = (snapshot: RelatorioSnapshot) => {
    const definition = getDefinition('v14', 'cabine_primaria', 'transformador_forca');
    const capture = definition.tests.find((test) => test.key === 'isolacao')!.tables[0]!.value_columns.findIndex((column) => column.role === 'capture');
    return withBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.test.isolacao!.cells['0'] = { ...block.sheet.test.isolacao!.cells['0'], [String(capture)]: cell({ raw: '1', unit: 'MΩ', state: 'measured' }) };
      return block;
    });
  };

  it('a dropped insulation reading that is out: the note names it with both corrected values on v14; nothing on v13', () => {
    const out = insulationOut(v14);
    const { block } = blockOf(out, 'transformador_forca');
    const test = evaluateSheetReadings(block, getDefinition('v14', 'cabine_primaria', 'transformador_forca'), visitContextOf(out, block)).find((one) => one.testKey === 'isolacao')!;
    const first = test.tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!;
    expect(first.verdict).toBe('out');
    expect(first.restriction ?? null).toBeNull();
    expect(first.historyOut).toMatch(/^queda de mais de 50 % desde a manutenção anterior \(de 30\.000 GΩ para .+, a 20 °C\)$/u);
    const items = testHistoryItems(test);
    expect(items[0]).toEqual({ where: 'Primário/Massa', reason: first.historyOut });
    expect(notesOf(sheetOf(out, 'transformador_forca'))).toEqual([historyNoteText(items)]);
    for (const sheet of sheetsOf(insulationOut(v13))) expect(notesOf(sheet), sheet.title).toEqual([]);
  });

  it('a varied winding phase that is out: the note names it with both corrected values on v14; nothing on v13', () => {
    /** The previous visit 10 % lower, and phase C of the first row 30 % above the stored reading: out between phases. */
    const windingOut = (snapshot: RelatorioSnapshot) =>
      withBlock(withPrevious(snapshot, 'transformador_forca', windingMoved), 'transformador_forca', (block) => {
        const row = block.sheet.test.resistencia_enrolamento!.cells['0']!;
        const stored = row['2']!.value as { raw: string; unit: string; state: string };
        row['2'] = cell({ ...stored, raw: String(Math.round(Number(stored.raw) * 1.3 * 10_000) / 10_000) });
        return block;
      });
    const out = windingOut(v14);
    const { block } = blockOf(out, 'transformador_forca');
    const winding = evaluateSheetMeasurements(block, getDefinition('v14', 'cabine_primaria', 'transformador_forca'), visitContextOf(out, block)).find((test) => test.testKey === 'resistencia_enrolamento')!;
    const outCell = winding.rows.flatMap((row) => row.cells).find((one) => one.fixed === null && one.verdict === 'out')!;
    expect(outCell).toBeDefined();
    expect(outCell.historyOut).toMatch(/^variação de mais de 2 % desde a manutenção anterior \(de .+ para .+, a 75 °C\)$/u);
    const items = measurementHistoryItems(winding);
    expect(items.map((item) => item.reason)).toContain(outCell.historyOut);
    expect(notesOf(sheetOf(out, 'transformador_forca'))).toContain(historyNoteText(items));
    for (const sheet of sheetsOf(windingOut(v13))) expect(notesOf(sheet), sheet.title).toEqual([]);
  });
});

/*
 * Fix batch e24x (D3; the coordinator took e24p's open row as a defect): a sheet never reads a visit
 * later than its own relatório's service date as its previous one. With the top entry later, it
 * reads the top's prior when that is not later, else nothing; with its own date unknown, as before.
 * The screen helper, the judgement (the visit context) and the print agree.
 */
describe('e24x-UNIT D3 a sheet never reads a later visit as its previous one', () => {
  const block = { block_type: 'cabos_saida' };

  it('B (September) issued, A (March) open or issued late: A reads nothing; with an older prior, A reads that prior; C and B as before', () => {
    const b = issue(null, rid('b'), day('2026-09-30'), '2026-10-01T15:00:00.000Z')!;
    expect(previousResultsFor({ last_results: b }, block, rid('a'), '2026-03-14')).toBeNull();
    // A's own date unknown: as before (the top).
    expect(previousResultsFor({ last_results: b }, block, rid('a'), null)).toMatchObject({ relatorio_id: rid('b') });
    expect(previousResultsFor({ last_results: b }, block, rid('a'))).toMatchObject({ relatorio_id: rid('b') });
    // A later visit, and one on the same day, still read B.
    expect(previousResultsFor({ last_results: b }, block, rid('c'), '2026-11-10')).toMatchObject({ relatorio_id: rid('b') });
    expect(previousResultsFor({ last_results: b }, block, rid('c'), '2026-09-30')).toMatchObject({ relatorio_id: rid('b') });
    // An older prior (January) under B: A (March) reads it.
    const p = issue(null, rid('e'), day('2026-01-10'), '2026-01-12T15:00:00.000Z')!;
    const bp = issue(p, rid('b'), day('2026-09-30'), '2026-10-01T15:00:00.000Z')!;
    expect(previousResultsFor({ last_results: bp }, block, rid('a'), '2026-03-14')).toMatchObject({ relatorio_id: rid('e') });
    expect(Object.hasOwn(previousResultsFor({ last_results: bp }, block, rid('a'), '2026-03-14')!, 'prior')).toBe(false);
    // A prior later than A too (A in 2025): nothing.
    expect(previousResultsFor({ last_results: bp }, block, rid('a'), '2025-12-01')).toBeNull();
  });

  it('A issued late over B: A\'s issue keeps A\'s own readings judged with no previous visit, and B stays on top with A as its prior', () => {
    const b = issue(null, rid('b'), day('2026-09-30'), '2026-10-01T15:00:00.000Z')!;
    const snapshotA = relatorioOf(rid('a'), day('2026-03-14'), b);
    expect(visitContextOf(snapshotA, snapshotA.blocks[0]!).previous).toBeNull();
    const afterA = issue(b, rid('a'), day('2026-03-14'), '2026-10-02T15:00:00.000Z')!;
    expect(afterA).toMatchObject({ relatorio_id: rid('b'), prior: { relatorio_id: rid('a') } });
  });

  it('the layout lock\'s v14 relatório: a previous visit dated after its service is not printed, judged or shown; with its own dates unknown it is, as before', () => {
    const later = withPrevious(v14, 'transformador_forca', dated('2027-01-15'));
    const { block, equipment } = blockOf(later, 'transformador_forca');
    const definition = getDefinition('v14', 'cabine_primaria', 'transformador_forca');
    expect(previousHeaders(sheetOf(later, 'transformador_forca'))).toEqual([]);
    expect(visitContextOf(later, block).previous).toBeNull();
    expect(previousHelpers(equipment, block, definition, later.relatorio.id, '2026-11-04').size).toBe(0);
    // Before its service: as the lock prints it.
    const before = withPrevious(v14, 'transformador_forca', dated('2025-11-05'));
    expect(previousHeaders(sheetOf(before, 'transformador_forca')).length).toBeGreaterThan(0);
    expect(visitContextOf(before, blockOf(before, 'transformador_forca').block).previous).not.toBeNull();
    // The relatório's own dates unknown: the later visit reads as before.
    const unknown = { ...later, relatorio: { ...later.relatorio, setup: { ...later.relatorio.setup, service_start: null, service_end: null } } };
    expect(previousHeaders(sheetOf(unknown, 'transformador_forca')).length).toBeGreaterThan(0);
    expect(visitContextOf(unknown, blockOf(unknown, 'transformador_forca').block).previous).not.toBeNull();
  });
});
