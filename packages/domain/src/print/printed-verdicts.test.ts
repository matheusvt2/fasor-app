import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { effectiveConclusionPair, type EffectiveConclusionPair } from '../relatorio/conclusion.ts';
import { effectiveParecer, parecerVerdictLabel } from '../relatorio/parecer.ts';
import { isEquipmentBlock } from '../relatorio/sheet-state.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { revisionRowSchema, type BlockRow, type Cell, type RevisionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import { layoutSpec } from './layout.ts';
import { printedVerdicts, relatorioVerdicts } from './printed-verdicts.ts';
import type { LayoutSection10 } from './section-10.ts';
import type { LayoutSectionSheets, PrintTable, SheetPart } from './section-9.ts';

/*
 * 25.4-UNIT (Story 25.4, Bruno M17 and the stored half of M01): the verdicts an issued revision keeps
 * are the ones its document printed, computed by the kernel from the snapshot it renders, and a raw
 * reader falls back to the effective values (never Apto nor Aprovado) when none were recorded. Every
 * value is the layout-lock fixture's (synthetic) or written here.
 */

const ISSUED_AT = '2026-11-11T12:00:00.000Z';
const id = (n: number) => `019a6100-0e25-7000-8000-${n.toString(16).padStart(12, '0')}`;

const BASE: Readonly<Record<'v13' | 'v14', RelatorioSnapshot>> = { v13: layoutLockSnapshot('v13'), v14: layoutLockSnapshot('v14') };
const fresh = (version: 'v13' | 'v14'): RelatorioSnapshot => structuredClone(BASE[version]);

const liveSheet = (snapshot: RelatorioSnapshot, type: string): BlockRow => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null)!;

/** The snapshot with one block replaced by `fn`'s copy. */
function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(structuredClone(block)) : block)) };
}

/** A stored conclusion half as the fold leaves it: the cell of the half's last put. */
function storedCell(value: string | null, n: number): Cell {
  return { value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + n) };
}

/** The block with its stored pair replaced (a half `undefined` is left unwritten). */
function stored(block: BlockRow, result: string | null | undefined, restriction: string | null | undefined): BlockRow {
  const next = structuredClone(block);
  const conclusion = { ...next.sheet.conclusion };
  delete conclusion.result;
  delete conclusion.restriction;
  if (result !== undefined) conclusion.result = storedCell(result, 1);
  if (restriction !== undefined) conclusion.restriction = storedCell(restriction, 2);
  next.sheet.conclusion = conclusion;
  return next;
}

/** The relatório with its stored parecer set to `verdict` (a verdict tap's put). */
function withStoredParecer(snapshot: RelatorioSnapshot, verdict: 'apto' | 'apto_com_restricoes' | 'nao_apto'): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer: { verdict, text: null, text_status: null, text_basis: null } } } };
}

function withoutSection(snapshot: RelatorioSnapshot, type: 'section_9' | 'section_10'): RelatorioSnapshot {
  const section = liveSheet(snapshot, type);
  return edit(snapshot, section.id, (block) => ({ ...block, removed_at: ISSUED_AT }));
}

// --- the printed document ------------------------------------------------------------------------

const layoutOf = (snapshot: RelatorioSnapshot) => layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });

/** The sheets of section 9 that print a CONCLUSÃO table, in print order, with that table's boxes row. */
function conclusionTables(snapshot: RelatorioSnapshot): { blockId: string; boxes: string[] }[] {
  const sheets = layoutOf(snapshot).sections.find((section): section is LayoutSectionSheets => section.kind === 'sheets');
  if (sheets === undefined) return [];
  return sheets.subsections
    .flatMap((subsection) => subsection.sheets)
    .flatMap((sheet) => {
      const table = sheet.parts.find((part): part is Extract<SheetPart, { kind: 'table' }> => part.kind === 'table' && part.table.rows[0]?.cells[0]?.text === 'CONCLUSÃO')?.table;
      return table === undefined ? [] : [{ blockId: sheet.blockId, boxes: boxesOf(table) }];
    });
}

const boxesOf = (table: PrintTable): string[] => table.rows[1]!.cells.map((cell) => cell.text);

/** The pair the X marks of a boxes row say: APROVADO, REPROVADO, SEM RESTRIÇÕES, COM RESTRIÇÕES. */
function pairOfBoxes(boxes: readonly string[]): EffectiveConclusionPair {
  expect(boxes.filter((_, i) => i % 2 === 0)).toEqual(['APROVADO', 'REPROVADO', 'SEM RESTRIÇÕES', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)']);
  const [aprovado, reprovado, sem, com] = [boxes[1], boxes[3], boxes[5], boxes[7]].map((mark) => mark === 'X');
  expect(aprovado && reprovado).toBe(false);
  expect(sem && com).toBe(false);
  return { result: aprovado ? 'aprovado' : reprovado ? 'reprovado' : null, restriction: sem ? 'sem_restricoes' : com ? 'com_restricoes' : null };
}

const section10Of = (snapshot: RelatorioSnapshot): LayoutSection10 | undefined => layoutOf(snapshot).sections.find((section): section is LayoutSection10 => section.kind === 'section_10');

// ===================================================================================================

describe('25.4-UNIT (a) what printedVerdicts records is what the layout prints', () => {
  for (const version of ['v13', 'v14'] as const) {
    it(`${version}: the fichas in print order with a CONCLUSÃO table, each pair its X marks, and the parecer section 10's title`, () => {
      const snapshot = fresh(version);
      const verdicts = printedVerdicts(snapshot);
      const tables = conclusionTables(snapshot);
      expect(tables.length).toBeGreaterThan(0);
      expect(Object.keys(verdicts.printed_conclusions)).toEqual(tables.map((table) => table.blockId));
      for (const table of tables) expect(verdicts.printed_conclusions[table.blockId], table.blockId).toEqual(pairOfBoxes(table.boxes));
      // The fixture's breaker is concluded Reprovado: v14 prints no restriction for it, v13 its Com restrições.
      const disjuntor = liveSheet(snapshot, 'disjuntor_mt');
      expect(verdicts.printed_conclusions[disjuntor.id]).toEqual(version === 'v14' ? { result: 'reprovado', restriction: null } : { result: 'reprovado', restriction: 'com_restricoes' });
      expect(verdicts.printed_parecer).toBe('nao_apto');
      expect(parecerVerdictLabel(verdicts.printed_parecer!)).toBe(section10Of(snapshot)!.parecer.title);
    });
  }
});

describe('25.4-UNIT (b) a stored choice looser than the effective values is recorded as printed and never written', () => {
  it('v14: stored Apto with fichas giving Não apto records nao_apto; the breaker stored Aprovado · Sem restrições with its reading out records Reprovado alone; the snapshot is unchanged', () => {
    const base = fresh('v14');
    const disjuntor = liveSheet(base, 'disjuntor_mt');
    const snapshot = edit(withStoredParecer(base, 'apto'), disjuntor.id, (block) => stored(block, 'aprovado', 'sem_restricoes'));
    const before = structuredClone(snapshot);
    const verdicts = printedVerdicts(snapshot);
    expect(verdicts.printed_parecer).toBe('nao_apto');
    expect(verdicts.printed_conclusions[disjuntor.id]).toEqual({ result: 'reprovado', restriction: null });
    // The section 10 title and the CONCLUSÃO row agree with the record.
    expect(section10Of(snapshot)!.parecer.title).toBe(parecerVerdictLabel('nao_apto'));
    expect(pairOfBoxes(conclusionTables(snapshot).find((table) => table.blockId === disjuntor.id)!.boxes)).toEqual({ result: 'reprovado', restriction: null });
    // The technician's choices stand as they were stored.
    expect(snapshot).toEqual(before);
    expect(snapshot.relatorio.setup.parecer?.verdict).toBe('apto');
    const block = snapshot.blocks.find((row) => row.id === disjuntor.id)!;
    expect([block.sheet.conclusion.result?.value, block.sheet.conclusion.restriction?.value]).toEqual(['aprovado', 'sem_restricoes']);
  });

  it('v13 beside it: the same choices record nao_apto and the breaker Reprovado · Com restrições (its floor)', () => {
    const base = fresh('v13');
    const disjuntor = liveSheet(base, 'disjuntor_mt');
    const verdicts = printedVerdicts(edit(withStoredParecer(base, 'apto'), disjuntor.id, (block) => stored(block, 'aprovado', 'sem_restricoes')));
    expect(verdicts.printed_parecer).toBe('nao_apto');
    expect(verdicts.printed_conclusions[disjuntor.id]).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
  });
});

describe('25.4-UNIT (c) the edges of the matrix', () => {
  it('section 10 switched off: printed_parecer null (the key present); section 9 still recorded', () => {
    const snapshot = withoutSection(fresh('v14'), 'section_10');
    expect(section10Of(snapshot)).toBeUndefined();
    const verdicts = printedVerdicts(snapshot);
    expect(verdicts).toHaveProperty('printed_parecer', null);
    expect(Object.keys(verdicts.printed_conclusions).length).toBeGreaterThan(0);
  });

  it('section 9 switched off: printed_conclusions {} (the parecer still recorded)', () => {
    const snapshot = withoutSection(fresh('v14'), 'section_9');
    expect(conclusionTables(snapshot)).toEqual([]);
    expect(printedVerdicts(snapshot)).toEqual({ printed_parecer: 'nao_apto', printed_conclusions: {} });
  });

  it('a sheet marked not tested, one whose conclusion sub-block is off and one of an unknown definition get no entry, as section 9 prints no CONCLUSÃO row for them', () => {
    const base = fresh('v14');
    const tp = liveSheet(base, 'tp');
    const tc = liveSheet(base, 'tc');
    const company = base.blocks.find((block) => block.removed_at === null && block.block_type.startsWith('type:'))!;
    expect(printedVerdicts(base).printed_conclusions).toHaveProperty(tp.id);
    expect(printedVerdicts(base).printed_conclusions).toHaveProperty(tc.id);
    expect(printedVerdicts(base).printed_conclusions).toHaveProperty(company.id);

    let snapshot = edit(base, tp.id, (block) => ({ ...block, not_tested: { reason: 'impossibilidade_desligamento', text: null, at: ISSUED_AT, by: block.created_by ?? 'system:generate' } }));
    snapshot = edit(snapshot, tc.id, (block) => {
      // A new config object: rows are immutable, and `enabledSubBlocksOf` memoizes by the config object.
      const config = block.config as { sub_blocks: Record<string, { enabled: boolean }> };
      return { ...block, config: { ...config, sub_blocks: { ...config.sub_blocks, conclusion: { enabled: false } } } };
    });
    const verdicts = printedVerdicts(snapshot);
    expect(verdicts.printed_conclusions).not.toHaveProperty(tp.id);
    expect(verdicts.printed_conclusions).not.toHaveProperty(tc.id);
    expect(verdicts.printed_conclusions).toHaveProperty(company.id);
    expect(Object.keys(verdicts.printed_conclusions)).toEqual(conclusionTables(snapshot).map((table) => table.blockId));

    // Without the company type's version, its sheet resolves no definition: no entry for it, the others kept.
    const unknown = printedVerdicts({ ...snapshot, equipment_types: [] });
    expect(unknown.printed_conclusions).not.toHaveProperty(company.id);
    expect(Object.keys(unknown.printed_conclusions)).toEqual(Object.keys(verdicts.printed_conclusions).filter((blockId) => blockId !== company.id));
  });

  it('an open sheet: nothing chosen records both halves null; a result chosen alone records it with the restriction null, as the X marks print', () => {
    const base = fresh('v14');
    const transformer = liveSheet(base, 'transformador_forca');
    expect(transformer.concluded_by).toBeNull();
    expect(printedVerdicts(base).printed_conclusions[transformer.id]).toEqual({ result: null, restriction: null });
    const chosen = edit(base, transformer.id, (block) => stored(block, 'aprovado', undefined));
    const entry = printedVerdicts(chosen).printed_conclusions[transformer.id]!;
    expect(entry.result).not.toBeNull();
    expect(entry.restriction).toBeNull();
    expect(entry).toEqual(pairOfBoxes(conclusionTables(chosen).find((table) => table.blockId === transformer.id)!.boxes));
  });
});

// --- the raw reader ---------------------------------------------------------------------------------

function revisionOf(snapshot: RelatorioSnapshot, number: number, extra: Partial<RevisionRow> = {}): RevisionRow {
  return {
    id: id(number),
    relatorio_id: snapshot.relatorio.id,
    number,
    snapshot_seq: number * 10,
    created_by: 'system:generate',
    docx_file_id: id(100 + number),
    pdf_file_id: id(200 + number),
    created_at: `2026-11-1${number}T12:00:00.000Z`,
    ...extra,
  };
}

/** The effective pair of each ficha section 9 prints a CONCLUSÃO row for. */
function effectiveConclusions(snapshot: RelatorioSnapshot): Record<string, EffectiveConclusionPair> {
  const ctx = snapshotDefinitionContext(snapshot);
  const out: Record<string, EffectiveConclusionPair> = {};
  for (const blockId of Object.keys(printedVerdicts(snapshot).printed_conclusions)) {
    const block = snapshot.blocks.find((row) => row.id === blockId)!;
    out[blockId] = effectiveConclusionPair(block, blockDefinitionIn(ctx, block), visitContextOf(snapshot, block));
  }
  return out;
}

describe('25.4-UNIT (d) relatorioVerdicts', () => {
  // A relatório whose effective parecer is Não apto while the stored one is Apto, and whose breaker is stored Aprovado.
  const base = fresh('v14');
  const disjuntor = liveSheet(base, 'disjuntor_mt');
  const snapshot = edit(withStoredParecer(base, 'apto'), disjuntor.id, (block) => stored(block, 'aprovado', 'sem_restricoes'));

  it('no revision: the effective values (Não apto, the breaker Reprovado), never the stored Apto nor Aprovado', () => {
    const verdicts = relatorioVerdicts(snapshot, []);
    expect(verdicts).toEqual({ source: 'effective', revisionNumber: null, parecer: effectiveParecer(snapshot), conclusions: effectiveConclusions(snapshot) });
    expect(verdicts.parecer).toBe('nao_apto');
    expect(verdicts.conclusions[disjuntor.id]).toEqual({ result: 'reprovado', restriction: null });
    expect(Object.keys(verdicts.conclusions)).toEqual(Object.keys(printedVerdicts(snapshot).printed_conclusions));
  });

  it('a revision written before Story 25.4 (no keys): the effective values, source effective', () => {
    const verdicts = relatorioVerdicts(snapshot, [revisionOf(snapshot, 1)]);
    expect(verdicts.source).toBe('effective');
    expect(verdicts.revisionNumber).toBeNull();
    expect(verdicts.parecer).toBe('nao_apto');
    expect(verdicts.conclusions[disjuntor.id]).toEqual({ result: 'reprovado', restriction: null });
  });

  it('a revision of Story 25.4: its recorded verdicts and its number, whatever the snapshot says now', () => {
    const recorded = { printed_parecer: 'apto_com_restricoes' as const, printed_conclusions: { [disjuntor.id]: { result: 'aprovado' as const, restriction: 'com_restricoes' as const } } };
    const verdicts = relatorioVerdicts(snapshot, [revisionOf(snapshot, 1, recorded)]);
    expect(verdicts).toEqual({ source: 'revision', revisionNumber: 1, parecer: 'apto_com_restricoes', conclusions: recorded.printed_conclusions });
  });

  it('two revisions: the latest, in any order; a revision of another relatório is not read', () => {
    const first = revisionOf(snapshot, 1, { printed_parecer: 'apto', printed_conclusions: {} });
    const second = revisionOf(snapshot, 2, printedVerdicts(snapshot));
    const other = { ...revisionOf(snapshot, 3, { printed_parecer: 'apto', printed_conclusions: {} }), relatorio_id: id(999) };
    for (const rows of [
      [first, second, other],
      [other, second, first],
    ]) {
      const verdicts = relatorioVerdicts(snapshot, rows);
      expect(verdicts.source).toBe('revision');
      expect(verdicts.revisionNumber).toBe(2);
      expect(verdicts.parecer).toBe('nao_apto');
      expect(verdicts.conclusions).toEqual(printedVerdicts(snapshot).printed_conclusions);
    }
    // The latest written before the keys: absent means not recorded, so the effective values (not revision 1's).
    const old = revisionOf(snapshot, 3);
    expect(relatorioVerdicts(snapshot, [first, old])).toMatchObject({ source: 'effective', revisionNumber: null, parecer: 'nao_apto' });
  });

  it('section 10 switched off and no revision: parecer null', () => {
    expect(relatorioVerdicts(withoutSection(snapshot, 'section_10'), []).parecer).toBeNull();
  });
});

describe('25.4-UNIT (e) the revision row', () => {
  it('a row written before Story 25.4 parses to the same JSON (the keys never defaulted)', () => {
    const before = revisionOf(fresh('v14'), 1);
    expect(JSON.stringify(revisionRowSchema.parse(before))).toBe(JSON.stringify(before));
    expect(revisionRowSchema.parse(before).printed_parecer).toBeUndefined();
    expect(revisionRowSchema.parse(before).printed_conclusions).toBeUndefined();
  });

  it('a row of Story 25.4 parses to the same JSON; a pair outside the two enums or a key that is no block id is refused', () => {
    const snapshot = fresh('v14');
    const row = revisionOf(snapshot, 1, printedVerdicts(snapshot));
    expect(JSON.stringify(revisionRowSchema.parse(row))).toBe(JSON.stringify(row));
    expect(revisionRowSchema.parse(revisionOf(snapshot, 1, { printed_parecer: null, printed_conclusions: {} }))).toMatchObject({ printed_parecer: null, printed_conclusions: {} });
    expect(revisionRowSchema.safeParse({ ...row, printed_conclusions: { [id(5)]: { result: 'apto', restriction: null } } }).success).toBe(false);
    expect(revisionRowSchema.safeParse({ ...row, printed_conclusions: { 'not-a-block': { result: null, restriction: null } } }).success).toBe(false);
    expect(revisionRowSchema.safeParse({ ...row, printed_parecer: 'aprovado' }).success).toBe(false);
  });
});

describe('25.4-UNIT (f) the size of the record', () => {
  const snapshot = fresh('v14');
  const verdicts = printedVerdicts(snapshot);
  const fichas = Object.keys(verdicts.printed_conclusions).length;
  const bytes = new TextEncoder().encode(JSON.stringify(verdicts)).length;
  it(`v14 fixture: ${fichas} fichas, ${bytes} bytes for both keys, under 120 bytes per ficha`, () => {
    expect(fichas).toBeGreaterThan(0);
    expect(fichas).toBeLessThanOrEqual(snapshot.blocks.filter((block) => block.removed_at === null && isEquipmentBlock(block)).length);
    expect(bytes / fichas).toBeLessThan(120);
  });
});
