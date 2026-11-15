import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { notPerformedPrintLine, section9Layout, type PrintSheet, type PrintTable } from '../print/section-9.ts';
import type { BlockRow, Cell, JsonValue } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { STORY_25_15_TEST } from '../seed/v16.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { choiceValue, evaluateSheetMeasurements, measurementCounts, notPerformedClause, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { sheetProgress } from './sheet-progress.ts';

/*
 * 25.15-UNIT (batch e25s, Story 25.15; M23, Bruno's answer 4, decision 3): the v16 thermography asks "Realizada" or
 * "Não realizada" (`performed`). Over both answers, on the layout lock's v16 relatório: the Ensaios step's count, the
 * floor, the conclusion's paragraph and its basis, and the print (one line in the test's place, or its table of the
 * type's points with an added point). The v15 relatório of the same fixture keeps "Equipamento em carga" as before.
 */

const OP = '019a5c00-2515-7000-8000-0000000000aa';
const ROW_ID = '019a5c00-2515-7000-8000-0000000000ab';
const cell = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: OP });
const degrees = (raw: string): JsonValue => ({ raw, unit: '°C', state: 'measured' });

interface Answer {
  realizacao?: string;
  motivo?: string;
  texto?: string;
  /** `[row, col, raw]` readings of the definition's rows. */
  cells?: [number, number, string][];
  /** One added point, its name and its two ΔT. */
  added?: { name: string; similares: string; ambiente: string };
}

const v16 = layoutLockSnapshot('v16');
const v15 = layoutLockSnapshot('v15');

const blockOf = (snapshot: RelatorioSnapshot, type: string): BlockRow => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null && block.equipment_id !== null)!;
const tagOf = (snapshot: RelatorioSnapshot, block: BlockRow): string => snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? '';

/** The snapshot with the thermography of `type`'s first sheet holding `answer` (a new block row, as a fold gives). */
function answered(snapshot: RelatorioSnapshot, type: string, answer: Answer): RelatorioSnapshot {
  const target = blockOf(snapshot, type);
  const block = structuredClone(target);
  const entry = { cells: {} as Record<string, Record<string, Cell>>, values: {} as Record<string, Cell> };
  if (answer.realizacao !== undefined) entry.values.realizacao = cell(choiceValue(answer.realizacao));
  if (answer.motivo !== undefined) entry.values.motivo = cell(choiceValue(answer.motivo));
  if (answer.texto !== undefined) entry.values.motivo_texto = cell(answer.texto);
  for (const [row, col, raw] of answer.cells ?? []) (entry.cells[String(row)] ??= {})[String(col)] = cell(degrees(raw));
  const test: Record<string, unknown> = { ...entry };
  if (answer.added !== undefined) {
    test.added_rows = {
      [ROW_ID]: { name: cell(answer.added.name), cells: { '0': cell(degrees(answer.added.similares)), '1': cell(degrees(answer.added.ambiente)) }, removed_at: null },
    };
  }
  (block.sheet.test as Record<string, unknown>)[STORY_25_15_TEST] = test;
  return { ...snapshot, blocks: snapshot.blocks.map((row) => (row.id === target.id ? block : row)) };
}

const thermographyOf = (snapshot: RelatorioSnapshot, type: string): MeasurementTestEvaluation => {
  const block = blockOf(snapshot, type);
  return evaluateSheetMeasurements(block, getDefinition(block.seed_version, 'cabine_primaria', type)).find((test) => test.testKey === STORY_25_15_TEST)!;
};
const ensaiosMissing = (snapshot: RelatorioSnapshot, type: string) => sheetProgress(snapshot, blockOf(snapshot, type).id).steps.ensaios.missing;
const paragraph = (snapshot: RelatorioSnapshot, type: string) => {
  const block = blockOf(snapshot, type);
  return composeConclusion(block, getDefinition(block.seed_version, 'cabine_primaria', type), tagOf(snapshot, block));
};
const floorOf = (snapshot: RelatorioSnapshot, type: string) => {
  const block = blockOf(snapshot, type);
  return conclusionFloor(block, getDefinition(block.seed_version, 'cabine_primaria', type))?.pair ?? null;
};
const printed = (snapshot: RelatorioSnapshot, type: string): PrintSheet =>
  section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((sub) => sub.sheets).find((sheet) => sheet.blockId === blockOf(snapshot, type).id)!;
const paragraphsOf = (sheet: PrintSheet) => sheet.parts.flatMap((part) => (part.kind === 'paragraph' ? [part.text] : []));
const tablesOf = (sheet: PrintSheet): PrintTable[] => sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const thermographyTable = (sheet: PrintSheet) => tablesOf(sheet).find((table) => table.rows[0]!.cells[0]!.text === 'TERMOGRAFIA');

const FORA_DE_CARGA: Answer = { realizacao: 'nao_realizada', motivo: 'fora_de_carga' };

describe('25.15-UNIT the v16 thermography over both answers: the progress', () => {
  it('unanswered, the Ensaios step counts one answer missing; "Realizada" with no point typed counts none (the points are optional)', () => {
    const unanswered = ensaiosMissing(v16, 'transformador_forca');
    expect(thermographyOf(v16, 'transformador_forca').performance).toEqual({ state: 'unanswered', valueKey: 'realizacao' });
    expect(ensaiosMissing(answered(v16, 'transformador_forca', { realizacao: 'realizada' }), 'transformador_forca')).toBe(unanswered - 1);
  });

  it('"Não realizada" asks its reason; "Outro" asks its text; with each given, nothing of the test is missing', () => {
    const base = ensaiosMissing(answered(v16, 'disjuntor_mt', { realizacao: 'realizada' }), 'disjuntor_mt');
    expect(ensaiosMissing(answered(v16, 'disjuntor_mt', { realizacao: 'nao_realizada' }), 'disjuntor_mt')).toBe(base + 1);
    expect(ensaiosMissing(answered(v16, 'disjuntor_mt', FORA_DE_CARGA), 'disjuntor_mt')).toBe(base);
    expect(ensaiosMissing(answered(v16, 'disjuntor_mt', { realizacao: 'nao_realizada', motivo: 'outro' }), 'disjuntor_mt')).toBe(base + 1);
    expect(ensaiosMissing(answered(v16, 'disjuntor_mt', { realizacao: 'nao_realizada', motivo: 'outro', texto: 'Termovisor em calibração' }), 'disjuntor_mt')).toBe(base);
  });

  it('"Não realizada" asks no point: its readings are neither missing, judged nor counted out', () => {
    const notDone = thermographyOf(answered(v16, 'disjuntor_mt', { ...FORA_DE_CARGA, cells: [[0, 0, '40']] }), 'disjuntor_mt');
    expect(notDone.skipped).toBe(true);
    expect(measurementCounts([notDone])).toEqual({ missing: 0, outOfLimit: 0 });
    expect(notDone.rows.flatMap((row) => row.cells).every((one) => one.verdict === null && !one.missing)).toBe(true);
  });

  it('a template that switched the test off asks nothing, whatever it holds', () => {
    const snapshot = answered(v16, 'tp', {});
    const block = blockOf(snapshot, 'tp');
    const config = block.config as unknown as { sub_blocks: Record<string, unknown> };
    const off = { ...block, config: { ...config, sub_blocks: { ...config.sub_blocks, [STORY_25_15_TEST]: { enabled: false } } } } as unknown as BlockRow;
    const test = evaluateSheetMeasurements(off, getDefinition('v16', 'cabine_primaria', 'tp')).find((one) => one.testKey === STORY_25_15_TEST)!;
    expect(test.enabled).toBe(false);
    expect(measurementCounts([test]).missing).toBe(0);
  });
});

describe('25.15-UNIT the v16 thermography over both answers: the floor and the paragraph', () => {
  it('"Não realizada" with a reason: no restriction from it, and the paragraph names it with its reason, in a sentence after the body', () => {
    const answeredDone = answered(v16, 'transformador_forca', { realizacao: 'realizada' });
    const notDone = answered(v16, 'transformador_forca', FORA_DE_CARGA);
    expect(floorOf(notDone, 'transformador_forca')).toEqual(floorOf(answeredDone, 'transformador_forca'));
    const text = paragraph(notDone, 'transformador_forca').text;
    expect(text).toContain('. Termografia não realizada (equipamento fora de carga).');
    expect(paragraph(answeredDone, 'transformador_forca').text).not.toContain('Termografia');
    // Not a "Não medido" (Story 25.7) either.
    expect(text).not.toMatch(/Não medido: [^.]*termografia/);
  });

  it('each reason reads in the clause; "Outro" reads the text typed in its place, as typed and without its final period', () => {
    const clause = (answer: Answer) => {
      const performance = thermographyOf(answered(v16, 'tc', answer), 'tc').performance!;
      return performance.state === 'not_done' ? notPerformedClause(performance) : null;
    };
    expect(clause({ realizacao: 'nao_realizada', motivo: 'sem_acesso_seguro' })).toBe('Termografia não realizada (sem acesso seguro ao equipamento).');
    expect(clause({ realizacao: 'nao_realizada', motivo: 'sem_termovisor' })).toBe('Termografia não realizada (sem termovisor disponível).');
    expect(clause({ realizacao: 'nao_realizada', motivo: 'outro', texto: 'Termovisor em calibração.' })).toBe('Termografia não realizada (Termovisor em calibração).');
    expect(clause({ realizacao: 'nao_realizada', motivo: 'outro' })).toBe('Termografia não realizada (outro).');
    expect(clause({ realizacao: 'nao_realizada' })).toBe('Termografia não realizada.');
    expect(clause({ realizacao: 'realizada' })).toBeNull();
  });

  it('a change of the reason moves the basis, so a confirmed text goes stale', () => {
    const a = paragraph(answered(v16, 'tc', FORA_DE_CARGA), 'tc').basis;
    const b = paragraph(answered(v16, 'tc', { realizacao: 'nao_realizada', motivo: 'sem_termovisor' }), 'tc').basis;
    const done = paragraph(answered(v16, 'tc', { realizacao: 'realizada' }), 'tc').basis;
    expect(a).not.toBe(b);
    expect(a).not.toBe(done);
  });

  it('"Realizada" on a breaker: a ΔT typed on a terminal row is judged by the v13 bands (4 °C between similares is restricted)', () => {
    const snapshot = answered(v16, 'disjuntor_mt', { realizacao: 'realizada', cells: [[1, 0, '4'], [1, 1, '8']] });
    const test = thermographyOf(snapshot, 'disjuntor_mt');
    expect(test.rows.slice(0, 6).map((row) => row.label)).toEqual(['Terminal de entrada, fase A', 'Terminal de entrada, fase B', 'Terminal de entrada, fase C', 'Terminal de saída, fase A', 'Terminal de saída, fase B', 'Terminal de saída, fase C']);
    expect(test.rows[1]!.cells.map((one) => one.verdict)).toEqual(['restricted', 'within']);
    expect(floorOf(snapshot, 'disjuntor_mt')?.restriction).toBe('com_restricoes');
    expect(paragraph(snapshot, 'disjuntor_mt').text).toContain('termografia');
  });

  it('"Realizada" with an added point out of its band: the floor, the paragraph and the table name the point as any other row', () => {
    const snapshot = answered(v16, 'transformador_forca', { realizacao: 'realizada', added: { name: 'Conexão do barramento', similares: '20', ambiente: '9' } });
    const test = thermographyOf(snapshot, 'transformador_forca');
    expect(test.rows.map((row) => row.label)).toEqual(['Buchas MT', 'Buchas e conexões BT', 'Tanque ou bobinas', 'Conexão do barramento']);
    expect(test.rows[3]!.cells[0]!.verdict).toBe('out');
    expect(floorOf(snapshot, 'transformador_forca')?.result).toBe('reprovado');
    expect(paragraph(snapshot, 'transformador_forca').text).toContain('Conexão do barramento');
    const table = thermographyTable(printed(snapshot, 'transformador_forca'))!;
    expect(table.rows.map((row) => row.cells[0]!.text)).toContain('CONEXÃO DO BARRAMENTO');
  });
});

describe('25.15-UNIT the v16 thermography over both answers: the print', () => {
  it('"Não realizada" prints one line in the test\'s place and no table', () => {
    const sheet = printed(answered(v16, 'transformador_forca', FORA_DE_CARGA), 'transformador_forca');
    expect(thermographyTable(sheet)).toBeUndefined();
    expect(paragraphsOf(sheet)).toContain('TERMOGRAFIA: NÃO REALIZADA. MOTIVO: EQUIPAMENTO FORA DE CARGA.');
  });

  it('"Outro" prints its text after the word, as typed; with no reason, the line stops after the answer', () => {
    const line = (answer: Answer) => {
      const performance = thermographyOf(answered(v16, 'disjuntor_mt', answer), 'disjuntor_mt').performance!;
      return performance.state === 'not_done' ? notPerformedPrintLine(performance) : null;
    };
    expect(line({ realizacao: 'nao_realizada', motivo: 'outro', texto: 'Termovisor em calibração' })).toBe('TERMOGRAFIA: NÃO REALIZADA. MOTIVO: OUTRO, Termovisor em calibração.');
    expect(line({ realizacao: 'nao_realizada', motivo: 'sem_acesso_seguro' })).toBe('TERMOGRAFIA: NÃO REALIZADA. MOTIVO: SEM ACESSO SEGURO AO EQUIPAMENTO.');
    expect(line({ realizacao: 'nao_realizada' })).toBe('TERMOGRAFIA: NÃO REALIZADA.');
  });

  it('unanswered, nothing prints of the test; "Realizada" prints its table of the type\'s points, with no line for the answer', () => {
    const unanswered = printed(v16, 'tp');
    expect(thermographyTable(unanswered)).toBeUndefined();
    expect(paragraphsOf(unanswered).some((text) => text.startsWith('TERMOGRAFIA'))).toBe(false);
    const done = printed(answered(v16, 'tp', { realizacao: 'realizada', cells: [[0, 0, '1'], [0, 1, '5']] }), 'tp');
    const table = thermographyTable(done)!;
    const texts = table.rows.flatMap((row) => row.cells.map((one) => one.text));
    expect(texts).toContain('TERMINAIS DO PRIMÁRIO');
    expect(texts).toContain('TERMINAIS DO SECUNDÁRIO');
    expect(texts.some((text) => text.startsWith('TERMOGRAFIA:'))).toBe(false);
    expect(paragraphsOf(done).some((text) => text.startsWith('TERMOGRAFIA'))).toBe(false);
  });
});

describe('25.15-UNIT a v15 sheet keeps "Equipamento em carga"', () => {
  it('asks it, is not applicable until Sim and missing nothing while unanswered; its four points are v13\'s', () => {
    const test = thermographyOf(v15, 'transformador_forca');
    expect(test.performance).toBeUndefined();
    expect(test.values.map((value) => value.label)).toEqual(['Equipamento em carga']);
    expect(test.applicability.state).toBe('na');
    expect(measurementCounts([test]).missing).toBe(0);
    expect(test.rows.map((row) => row.label)).toEqual(['Conexões', 'Terminações', 'Contatos', 'Buchas']);
    expect(test.addedRows).toBeUndefined();
  });
});
