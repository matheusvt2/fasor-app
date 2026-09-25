import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { cellAddressesOf, type TestKey } from './readings.ts';
import {
  checklistResultOf,
  concludedByText,
  filledByText,
  sheetMissingTotal,
  sheetProgress,
  sheetProgressState,
  sheetProgressText,
  sheetSummaryText,
  stepMayCollapse,
  stepMissingLabel,
} from './sheet-progress.ts';

const ID = '019966b0-0051-7000-8000-000000000001';
const OP = '019966b0-0051-7000-8000-000000000002';
const REL = '019966b0-0051-7000-8000-000000000003';
const LOC = '019966b0-0051-7000-8000-000000000004';
const EQ = '019966b0-0051-7000-8000-000000000005';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

// Chave seccionadora, subtype manual: 10 nameplate fields, 14 checklist items of which
// `motor` and `fusiveis` are NA by default, isolação 6 cells + resistência de contato 3.
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');

function block(sheet: Partial<Sheet> = {}, over: Partial<BlockRow> = {}): BlockRow {
  return {
    id: ID,
    relatorio_id: REL,
    location_id: LOC,
    equipment_id: EQ,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
    ...over,
  };
}

const progressOf = (b: BlockRow) => sheetProgress({ blocks: [b] }, b.id);

function fullNameplate(): Sheet['nameplate'] {
  return Object.fromEntries(SEC.nameplate.map((field) => [field.key, cell(field.kind === 'number' ? { raw: '630', unit: field.unit ?? null, state: 'measured' } : 'X')]));
}

function allChecklist(value: 'C' | 'NC' | 'NA'): Sheet['checklist'] {
  return Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell(value) }]));
}

/** The first `n` addresses of each test, in the fixture's addressing (`cellAddressesOf`), measured. */
function testCells(cellsPerTest: Record<string, number>): Sheet['test'] {
  const out: Sheet['test'] = {};
  for (const [key, n] of Object.entries(cellsPerTest)) {
    const cells: Record<string, Record<string, Cell>> = {};
    for (const a of cellAddressesOf(SEC, key as TestKey).slice(0, n)) {
      cells[String(a.row)] = { ...cells[String(a.row)], [String(a.col)]: cell({ raw: '100', unit: 'GΩ', state: 'measured' }) };
    }
    out[key] = { cells };
  }
  return out;
}

const PAIR = { result: cell('aprovado'), restriction: cell('sem_restricoes') };

describe('5.1-UNIT sheetProgress', () => {
  it('an empty block misses every step: nameplate, unset rows (NA defaults excluded), every test cell, the conclusion', () => {
    const p = progressOf(block());
    expect(p.steps.placa.missing).toBe(SEC.nameplate.length);
    expect(p.steps.verificacoes.missing).toBe(SEC.checklist!.length - 2);
    expect(p.steps.ensaios.missing).toBe(9);
    expect(p.steps.conclusao.missing).toBe(2);
    expect(p.complete).toBe(false);
    expect(p.firstIncompleteStep).toBe('placa');
    expect(sheetMissingTotal(p)).toBe(SEC.nameplate.length + SEC.checklist!.length - 2 + 9 + 2);
  });

  it('na_defaults items with no cell are answered NA (a display default, not a cell); a stored cell overrides them', () => {
    const b = block();
    expect(checklistResultOf(b, 'motor')).toBe('NA');
    expect(checklistResultOf(b, 'isoladores')).toBeNull();
    const overridden = block({ checklist: { motor: { result: cell('C') } } });
    expect(checklistResultOf(overridden, 'motor')).toBe('C');
    // A cleared cell (null) on a default item reads unset, not NA: the engineer cleared it.
    const cleared = block({ checklist: { motor: { result: cell(null) } } });
    expect(checklistResultOf(cleared, 'motor')).toBeNull();
    expect(progressOf(cleared).steps.verificacoes.missing).toBe(SEC.checklist!.length - 1);
  });

  it('an NC row counts missing until its observation holds text', () => {
    const base = allChecklist('C');
    const nc = block({ checklist: { ...base, contatos: { result: cell('NC') } } });
    expect(progressOf(nc).steps.verificacoes.missing).toBe(1);
    const blank = block({ checklist: { ...base, contatos: { result: cell('NC'), observation: cell('   ') } } });
    expect(progressOf(blank).steps.verificacoes.missing).toBe(1);
    const observed = block({ checklist: { ...base, contatos: { result: cell('NC'), observation: cell('oxidação') } } });
    expect(progressOf(observed).steps.verificacoes.missing).toBe(0);
  });

  it('5.5-UNIT ensaios counts the addresses of the enabled tests: a "Não medido" is filled, a stray address or an empty-state number is not', () => {
    const before = progressOf(block()).steps.ensaios.missing;
    expect(progressOf(block({ test: testCells({ isolacao: 2 }) })).steps.ensaios.missing).toBe(before - 2);
    const notMeasured: Sheet['test'] = { isolacao: { cells: { '0': { '0': cell({ raw: '', unit: 'GΩ', state: 'not_measured' }) } } } };
    expect(progressOf(block({ test: notMeasured })).steps.ensaios.missing).toBe(before - 1);
    const stray: Sheet['test'] = {
      isolacao: { cells: { '99': { '42': cell({ raw: '1', unit: 'GΩ', state: 'measured' }) }, '0': { '0': cell({ raw: '', unit: 'GΩ', state: 'empty' }) } } },
    };
    expect(progressOf(block({ test: stray })).steps.ensaios.missing).toBe(before);
    expect(progressOf(block({ test: testCells({ isolacao: 6, resistencia_contato: 3 }) })).steps.ensaios.missing).toBe(0);
  });

  it('5.5-UNIT a TP counts its insulation capture and its ratio captures and inputs; inputs read from the nameplate are not missing', () => {
    const tp = (sheet: Partial<Sheet>) => block(sheet, { block_type: 'tp', config: defaultBlockConfig('v1', 'tp') });
    // 3 insulation captures (1 MINUTO; the print columns never count) + 3 ratio rows x (2 inputs + 1 capture).
    expect(progressOf(tp({})).steps.ensaios.missing).toBe(3 + 9);
    const plate = { tensao_nominal_at: cell({ raw: '13.8', unit: 'kV', state: 'measured' }), tensao_nominal_bt: cell({ raw: '115', unit: 'V', state: 'measured' }) };
    expect(progressOf(tp({ nameplate: plate })).steps.ensaios.missing).toBe(3 + 3);
  });

  it('5.8-UNIT conclusao counts the result, the restriction and the observation Com restrições requires', () => {
    expect(progressOf(block({ conclusion: { result: cell('aprovado') } })).steps.conclusao.missing).toBe(1);
    expect(progressOf(block({ conclusion: PAIR })).steps.conclusao.missing).toBe(0);
    const com = { result: cell('aprovado'), restriction: cell('com_restricoes') };
    expect(progressOf(block({ conclusion: com })).steps.conclusao.missing).toBe(1);
    expect(progressOf(block({ conclusion: com, observations: cell('contatos com desgaste') })).steps.conclusao.missing).toBe(0);
    // The conclusion text never counts: an unconfirmed text does not block "Concluir ficha".
    expect(progressOf(block({ conclusion: { ...PAIR, text: cell('x') } })).steps.conclusao.missing).toBe(0);
  });

  it('a disabled test sub-block counts nothing', () => {
    const config = defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' });
    const off = block({}, { config: { ...config, sub_blocks: { ...config.sub_blocks, isolacao: { enabled: false } } } as BlockRow['config'] });
    expect(progressOf(off).steps.ensaios.missing).toBe(3);
  });

  it('a sheet with everything filled is complete and has no first incomplete step', () => {
    const b = block({
      nameplate: fullNameplate(),
      checklist: allChecklist('C'),
      test: testCells({ isolacao: 6, resistencia_contato: 3 }),
      conclusion: PAIR,
    });
    const p = progressOf(b);
    expect(p.complete).toBe(true);
    expect(p.firstIncompleteStep).toBeNull();
    expect(sheetProgressText(p)).toBe('Completa');
    expect(sheetProgressState(p)).toBe('complete');
  });

  it('a not-tested block is complete with every step at zero, even fully empty', () => {
    const b = block({}, { not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-24T10:00:00.000Z', by: 'u1' } });
    const p = progressOf(b);
    expect(p.steps).toEqual({
      placa: { missing: 0, outOfLimit: 0 },
      verificacoes: { missing: 0, outOfLimit: 0 },
      ensaios: { missing: 0, outOfLimit: 0 },
      conclusao: { missing: 0, outOfLimit: 0 },
    });
    expect(p.complete).toBe(true);
    expect(p.firstIncompleteStep).toBeNull();
    expect(sheetProgressText(p)).toBe('Completa');
  });

  it('the first incomplete step follows the stepper order', () => {
    const b = block({ nameplate: fullNameplate(), checklist: allChecklist('C'), conclusion: PAIR });
    expect(progressOf(b).firstIncompleteStep).toBe('ensaios');
    const onlyConclusion = block({ nameplate: fullNameplate(), checklist: allChecklist('NA'), test: testCells({ isolacao: 6, resistencia_contato: 3 }) });
    expect(progressOf(onlyConclusion).firstIncompleteStep).toBe('conclusao');
  });

  it('an unknown block or a section block counts nothing', () => {
    expect(sheetProgress({ blocks: [] }, ID).complete).toBe(true);
    expect(progressOf(block({}, { block_type: 'objetivo' })).complete).toBe(true);
  });

  it('texts', () => {
    const one = { steps: { placa: { missing: 1 }, verificacoes: { missing: 0 }, ensaios: { missing: 0 }, conclusao: { missing: 0 } } };
    expect(sheetProgressText(one)).toBe('1 obrigatório faltando');
    expect(sheetProgressText({ steps: { ...one.steps, conclusao: { missing: 7 } } })).toBe('8 obrigatórios faltando');
    expect(stepMissingLabel('Placa', 2)).toBe('Placa, 2 faltando');
    expect(filledByText('Bruno', '2026-09-06T12:41:00.000Z')).toBe('Preenchido por Bruno · 06/09 09:41');
    expect(concludedByText('Bruno', '2026-09-06T13:02:00.000Z')).toBe('Concluída por Bruno · 06/09 10:02');
    expect(filledByText('Bruno', 'nope')).toBe('Preenchido por Bruno');
  });
});

describe('12.1-UNIT D-2 outOfLimit and stepMayCollapse', () => {
  /** Every reading of both tests measured, isolação T1 at `t1` (the criterion is >400 MΩ). */
  function readings(t1: Cell['value']): Sheet['test'] {
    const out: Sheet['test'] = {};
    for (const key of ['isolacao', 'resistencia_contato'] as const) {
      const cells: Record<string, Record<string, Cell>> = {};
      cellAddressesOf(SEC, key).forEach((a, i) => {
        const value = key === 'isolacao' ? (i === 0 ? t1 : { raw: '150', unit: 'GΩ', state: 'measured' }) : { raw: '100', unit: 'µΩ', state: 'measured' };
        cells[String(a.row)] = { ...cells[String(a.row)], [String(a.col)]: cell(value) };
      });
      out[key] = { cells };
    }
    return out;
  }

  it('counts the Ensaios readings out of their criterion, and nothing on the other steps', () => {
    const within = progressOf(block({ nameplate: fullNameplate(), checklist: allChecklist('C'), test: readings({ raw: '150', unit: 'GΩ', state: 'measured' }), conclusion: PAIR }));
    expect(within.steps.ensaios).toEqual({ missing: 0, outOfLimit: 0 });
    const out = progressOf(block({ nameplate: fullNameplate(), checklist: allChecklist('C'), test: readings({ raw: '330', unit: 'MΩ', state: 'measured' }), conclusion: PAIR }));
    expect(out.steps.ensaios).toEqual({ missing: 0, outOfLimit: 1 });
    expect(out.steps.placa.outOfLimit + out.steps.verificacoes.outOfLimit + out.steps.conclusao.outOfLimit).toBe(0);
    // An amber reading blocks nothing: the sheet is still complete.
    expect(out.complete).toBe(true);
  });

  it('a step may collapse only with nothing missing and no reading out of its criterion', () => {
    const out = progressOf(block({ nameplate: fullNameplate(), checklist: allChecklist('C'), test: readings({ raw: '330', unit: 'MΩ', state: 'measured' }) }));
    expect(stepMayCollapse(out, 'placa')).toBe(true);
    expect(stepMayCollapse(out, 'verificacoes')).toBe(true);
    expect(stepMayCollapse(out, 'ensaios')).toBe(false);
    expect(stepMayCollapse(out, 'conclusao')).toBe(false);
    const within = progressOf(block({ nameplate: fullNameplate(), checklist: allChecklist('C'), test: readings({ raw: '150', unit: 'GΩ', state: 'measured' }) }));
    expect(stepMayCollapse(within, 'ensaios')).toBe(true);
    expect(stepMayCollapse(progressOf(block()), 'placa')).toBe(false);
  });
});

describe('12.5-UNIT sheetSummaryText (the Sheet header sentence, J-14)', () => {
  const counts = (placa: number, verificacoes: number, ensaios: number, conclusao: number) => ({
    steps: {
      placa: { missing: placa, outOfLimit: 0 },
      verificacoes: { missing: verificacoes, outOfLimit: 0 },
      ensaios: { missing: ensaios, outOfLimit: 0 },
      conclusao: { missing: conclusao, outOfLimit: 0 },
    },
  });

  it('names the steps done, then what is missing', () => {
    expect(sheetSummaryText(counts(0, 0, 9, 2))).toBe('Placa e verificações prontas · faltam 9 leituras e a conclusão');
  });

  it('one singular step done reads "pronta"', () => {
    expect(sheetSummaryText(counts(0, 14, 9, 1))).toBe('Placa pronta · faltam 14 verificações, 9 leituras e a conclusão');
    expect(sheetSummaryText(counts(3, 14, 9, 0))).toBe('Conclusão pronta · faltam 3 campos da placa, 14 verificações e 9 leituras');
  });

  it('one plural step done reads "prontas"', () => {
    expect(sheetSummaryText(counts(3, 0, 9, 2))).toBe('Verificações prontas · faltam 3 campos da placa, 9 leituras e a conclusão');
  });

  it('the verb and the counts agree with one missing thing', () => {
    expect(sheetSummaryText(counts(0, 0, 1, 0))).toBe('Placa, verificações e conclusão prontas · falta 1 leitura');
    expect(sheetSummaryText(counts(0, 0, 0, 2))).toBe('Placa, verificações e leituras prontas · falta a conclusão');
    expect(sheetSummaryText(counts(1, 1, 0, 0))).toBe('Leituras e conclusão prontas · falta 1 campo da placa e 1 verificação');
  });

  it('nothing done starts at the missing part', () => {
    expect(sheetSummaryText(counts(3, 14, 9, 2))).toBe('Faltam 3 campos da placa, 14 verificações, 9 leituras e a conclusão');
  });

  it('a complete sheet reads "Ficha completa"', () => {
    expect(sheetSummaryText(counts(0, 0, 0, 0))).toBe('Ficha completa');
  });

  it('a step the stepper does not show is never named', () => {
    const noPlaca = ['verificacoes', 'ensaios', 'conclusao'] as const;
    expect(sheetSummaryText(counts(0, 0, 9, 2), noPlaca)).toBe('Verificações prontas · faltam 9 leituras e a conclusão');
    expect(sheetSummaryText(counts(0, 14, 9, 2), noPlaca)).toBe('Faltam 14 verificações, 9 leituras e a conclusão');
    expect(sheetSummaryText(counts(5, 0, 0, 0), noPlaca)).toBe('Ficha completa');
  });
});
