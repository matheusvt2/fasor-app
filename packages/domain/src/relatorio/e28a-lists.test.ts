import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { section9Layout } from '../print/section-9.ts';
import { ncRowPointText, notTestedJustification, notTestedPointText, UTILITY_NAME_SLOT, utilityNameMissing } from '../points/derived.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { notTestedSchema, type BlockRow, type Cell } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { choiceValue, evaluateSheetMeasurements, notPerformedClause } from './measurement-evaluation.ts';
import { checklistItemLabel, oilDerivedNaKeys } from './oil-rule.ts';
import { blockingRows, preIssue, utilityNameMissingText } from './pre-issue.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Batch e28a, Story 28.4 (B-5, B-17, B-8, B-15, with Bruno's Q-3, Q-4 and Q-5): on seed v18 the transformer asks items 18
 * and 19 in the words of its kind, every thermography offers two more reasons, a sheet may be not tested as
 * "Equipamento da concessionária" with Bruno's editable justification, and the relatório does not issue with the
 * utility's name left empty. Every value is invented.
 */

const id = (n: number) => `019966b0-0284-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const ctx = EMPTY_DEFINITION_CONTEXT;

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
  return newEquipmentBlock({
    definitions: ctx,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
const NEW_KEYS = ['temperatura_alarme_e_desligamento', 'aterramento_carcaca_tanque_e_neutro'];

describe('28.4-UNIT-003 items 18 and 19 in the words of the unit\'s kind (`checklistItemLabel`)', () => {
  const labelsOf = (block: BlockRow) => {
    const definition = definitionOf(block);
    return definition.checklist!.filter((item) => NEW_KEYS.includes(item.key)).map((item) => checklistItemLabel(item, definition, block));
  };

  it('a dry unit reads the dry words; an oil or not yet known one the oil words; the answers are never derived N.A.', () => {
    const dry = plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: 'A SECO' });
    const oil = plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: 'A ÓLEO' });
    const empty = sheet('transformador_forca', 'v18');
    expect(labelsOf(dry)).toEqual(['SENSORES DE TEMPERATURA (PT100) E RELÉ TÉRMICO: ALARME E DESLIGAMENTO', 'ATERRAMENTO DA CARCAÇA E DO NEUTRO']);
    expect(labelsOf(oil)).toEqual(['RELÉ/TERMÔMETRO DE TEMPERATURA: ALARME E DESLIGAMENTO', 'ATERRAMENTO DO TANQUE E DO NEUTRO']);
    expect(labelsOf(empty)).toEqual(labelsOf(oil));
    for (const block of [dry, oil, empty]) for (const key of NEW_KEYS) expect(oilDerivedNaKeys(block, ctx).has(key), key).toBe(false);
  });

  it('every v17 item reads its own label on any unit', () => {
    const block = plate(sheet('transformador_forca', 'v17'), { tipo_de_isolacao: 'A SECO' });
    const definition = definitionOf(block);
    expect(definition.checklist!.map((item) => checklistItemLabel(item, definition, block))).toEqual(definition.checklist!.map((item) => item.label));
  });

  it('the NC row\'s point text names item 18 in the kind\'s words', () => {
    const dry = plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: 'A SECO' });
    dry.sheet.checklist.temperatura_alarme_e_desligamento = { result: cell('NC'), observation: cell('alarme não atua') } as never;
    const snapshot = { files: [], relatorio: { seed_version: 'v18' }, equipment_types: [] } as unknown as Pick<RelatorioSnapshot, 'files' | 'relatorio' | 'equipment_types'>;
    const text = ncRowPointText(snapshot, { block: dry }, 'temperatura_alarme_e_desligamento');
    expect(text.toLocaleLowerCase('pt-BR')).toContain('sensores de temperatura (pt100) e relé térmico');
    expect(text).toContain('Item 18');
  });
});

describe('28.4-UNIT-004 the printed checklist: nineteen rows on a v18 transformer, the last two in the kind\'s words', () => {
  const printedRows = (snapshot: RelatorioSnapshot, blockId: string) => {
    const printed = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === blockId)!;
    const table = printed.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : [])).find((one) => one.rows[0]!.cells[0]!.text === 'VERIFICAÇÕES GERAIS')!;
    return table.rows.slice(2).map((row) => row.cells[0]!.text);
  };
  const withPlate = (version: string, values: Record<string, unknown>) => {
    const snapshot = structuredClone(layoutLockSnapshot(version));
    const block = snapshot.blocks.find((one) => one.block_type === 'transformador_forca' && one.removed_at === null)!;
    snapshot.blocks = snapshot.blocks.map((one) => (one.id === block.id ? plate(one, values) : one));
    return { snapshot, blockId: block.id };
  };

  it('dry and oil v18 units print rows 18 and 19 in their words after v17\'s seventeen; v17 prints seventeen', () => {
    const dry = withPlate('v18', { tipo_de_isolacao: 'A SECO' });
    const oil = withPlate('v18', { tipo_de_isolacao: 'A ÓLEO' });
    const v17 = withPlate('v17', { tipo_de_isolacao: 'A SECO' });
    const before = printedRows(v17.snapshot, v17.blockId);
    expect(before).toHaveLength(17);
    expect(printedRows(dry.snapshot, dry.blockId)).toEqual([...before, '18. SENSORES DE TEMPERATURA (PT100) E RELÉ TÉRMICO: ALARME E DESLIGAMENTO', '19. ATERRAMENTO DA CARCAÇA E DO NEUTRO']);
    expect(printedRows(oil.snapshot, oil.blockId)).toEqual([...before, '18. RELÉ/TERMÔMETRO DE TEMPERATURA: ALARME E DESLIGAMENTO', '19. ATERRAMENTO DO TANQUE E DO NEUTRO']);
  });
});

describe('28.4-UNIT-005 a thermography not done for a new reason prints it in the conclusion\'s clause', () => {
  it.each([
    ['carga_insuficiente', 'Termografia não realizada (carga insuficiente para avaliação).'],
    ['fora_do_escopo', 'Termografia não realizada (fora do escopo contratado).'],
  ])('%s', (reason, clause) => {
    const block = structuredClone(sheet('tp', 'v18'));
    block.sheet.test.termografia = { cells: {}, values: { realizacao: cell(choiceValue('nao_realizada')), motivo: cell(choiceValue(reason)) } };
    const test = evaluateSheetMeasurements(block, definitionOf(block)).find((one) => one.testKey === 'termografia')!;
    const performance = test.performance!;
    if (performance.state !== 'not_done') throw new Error('the thermography is not "Não realizada"');
    expect(notPerformedClause(performance)).toBe(clause);
  });
});

describe('28.4-UNIT-006 "Equipamento da concessionária": Bruno\'s justification, the TAG filled, the name typed, the text editable', () => {
  const marked = (version: string, mark: { text?: string | null; utility_name?: string | null; reason?: string }) => {
    const block = structuredClone(sheet('tp', version));
    block.not_tested = notTestedSchema.parse({ reason: mark.reason ?? 'equipamento_concessionaria', text: mark.text ?? null, at: '2026-11-23T12:00:00.000Z', by: id(9), ...(mark.utility_name === undefined ? {} : { utility_name: mark.utility_name }) });
    return block;
  };
  const DEFAULT = (name: string) =>
    `Ensaios não realizados no(s) equipamento(s) TP-04, de propriedade da concessionária ${name} e destinado(s) à medição de faturamento, por não haver autorização da concessionária para intervenção.`;

  it('the default fills the sheet\'s TAG and leaves the slot while the name is empty; the typed name fills it', () => {
    expect(notTestedJustification(marked('v18', {}), 'TP-04')).toBe(DEFAULT(UTILITY_NAME_SLOT));
    expect(UTILITY_NAME_SLOT).toBe('[nome da concessionária]');
    expect(utilityNameMissing(marked('v18', {}), 'TP-04')).toBe(true);
    expect(notTestedJustification(marked('v18', { utility_name: 'Concessionária Exemplo' }), 'TP-04')).toBe(DEFAULT('Concessionária Exemplo'));
    expect(utilityNameMissing(marked('v18', { utility_name: 'Concessionária Exemplo' }), 'TP-04')).toBe(false);
    expect(notTestedPointText(marked('v18', { utility_name: 'Concessionária Exemplo' }), 'TP-04')).toBe(DEFAULT('Concessionária Exemplo'));
  });

  it('a rewritten text is the justification; a slot left in it still takes the name and still blocks while empty', () => {
    const rewritten = 'Medição de faturamento desligada pela concessionária no dia da visita.';
    expect(notTestedJustification(marked('v18', { text: rewritten }), 'TP-04')).toBe(rewritten);
    expect(utilityNameMissing(marked('v18', { text: rewritten }), 'TP-04')).toBe(false);
    const withSlot = `Equipamento da concessionária ${UTILITY_NAME_SLOT}, retirado da cabine.`;
    expect(utilityNameMissing(marked('v18', { text: withSlot }), 'TP-04')).toBe(true);
    expect(notTestedJustification(marked('v18', { text: withSlot, utility_name: 'Exemplo' }), 'TP-04')).toBe('Equipamento da concessionária Exemplo, retirado da cabine.');
  });

  it('every other reason reads as before: the seed\'s justification, the typed text of "Outro"; no slot, no row', () => {
    expect(notTestedJustification(marked('v18', { reason: 'solicitacao_cliente' }), 'TP-04')).toBe('Os ensaios não foram realizados conforme solicitação do cliente.');
    expect(notTestedJustification(marked('v17', { reason: 'outro', text: 'Chuva forte.' }), 'TP-04')).toBe('Chuva forte.');
    expect(utilityNameMissing(marked('v18', { reason: 'solicitacao_cliente' }), 'TP-04')).toBe(false);
  });

  it('a mark from before the key parses without it (no stored row changes bytes)', () => {
    const before = { reason: 'solicitacao_cliente', text: null, at: '2026-11-23T12:00:00.000Z', by: id(9) };
    expect(notTestedSchema.parse(before)).toEqual(before);
  });
});

describe('28.4-UNIT-007 the relatório does not issue with the utility\'s name empty (coordinator\'s reading)', () => {
  const withMark = (name: string | null) => {
    const snapshot = structuredClone(layoutLockSnapshot('v18'));
    const block = snapshot.blocks.find((one) => one.block_type === 'tc' && one.removed_at === null)!;
    const tag = snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;
    snapshot.blocks = snapshot.blocks.map((one) =>
      one.id === block.id ? { ...one, not_tested: { reason: 'equipamento_concessionaria', text: null, at: '2026-11-23T12:00:00.000Z', by: id(9), utility_name: name } as BlockRow['not_tested'] } : one,
    );
    return { snapshot, block, tag };
  };

  it('an empty name raises one blocking row naming the sheet; a typed name clears it', () => {
    const { snapshot, block, tag } = withMark(null);
    const rows = preIssue(snapshot).filter((row) => row.kind === 'utility_name_missing');
    expect(rows).toEqual([{ id: 'utility_name_missing', row: 'section_9', severity: 'blocking', text: `Nome da concessionária em branco: ${tag}`, kind: 'utility_name_missing', sheets: [{ blockId: block.id, name: tag }] }]);
    expect(blockingRows(preIssue(snapshot)).map((row) => row.kind)).toContain('utility_name_missing');
    expect(preIssue(withMark('Concessionária Exemplo').snapshot).some((row) => row.kind === 'utility_name_missing')).toBe(false);
    expect(utilityNameMissingText(['TP-04', 'TC-03'])).toBe('Nome da concessionária em branco: TP-04 e TC-03');
  });

  it('section 9 prints the justification with the sheet\'s TAG and the name under the sheet', () => {
    const { snapshot, block, tag } = withMark('Concessionária Exemplo');
    const printed = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === block.id)!;
    const texts = printed.parts.flatMap((part) => (part.kind === 'table' ? part.table.rows.flatMap((row) => row.cells.map((one) => one.text)) : []));
    expect(texts).toContain(
      `NÃO ENSAIADO — Equipamento da concessionária: Ensaios não realizados no(s) equipamento(s) ${tag}, de propriedade da concessionária Concessionária Exemplo e destinado(s) à medição de faturamento, por não haver autorização da concessionária para intervenção.`,
    );
  });
});
