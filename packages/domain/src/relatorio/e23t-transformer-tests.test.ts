import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { blockReadings } from '../print/last-results.ts';
import { readingSlotsOf, type PreviousResults } from '../print/reading-slots.ts';
import { resolveSection8 } from '../print/section-8.ts';
import { section9Layout, READING_FIT_WIDTH_EM, wordsWiderThanColumns, type PrintTable } from '../print/section-9.ts';
import { hasPointSource } from '../points/derived.ts';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { selectOptionFor } from '../seed/select-option.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { removeDraftEntry } from '../types/draft-edit.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { companyTypeDefinitionSchema } from '../types/definition.ts';
import { APPLICABILITY_APPLIED, testApplicability } from './applicability.ts';
import { composeConclusion, conclusionFloor, effectiveConclusionPair } from './conclusion.ts';
import { nameplateMissingKeys } from './dry-insulation.ts';
import { choiceValue, evaluateSheetMeasurements, measurementCounts, measurementTestTitle, restrictedMeasurements, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { isFieldHidden, isOilFieldExcused } from './oil-rule.ts';
import { parecerCounts } from './parecer.ts';
import { evaluateSheetReadings, evaluateTest, firstRunCell, lastRunCell, runTarget, type TestEvaluation } from './readings.ts';
import { sheetProgress } from './sheet-progress.ts';
import { sheetRunEnterKeyHint, sheetRunTarget } from './sheet-run.ts';
import { newEquipmentBlock } from './tree.ts';
import { NO_VISIT_CONTEXT, visitContextOf, type VisitContext } from './visit-context.ts';

/*
 * Batch e23t (Stories 23.15, 23.16, 23.17 and 23.19, seed v13): the winding resistance and its 75 °C
 * correction, the deviation between phases at every band, the history rule, the typed and judged IP, the
 * insulating liquid and the oil sampling, the HH fuses; one test per row of the spec's I/O matrix, the
 * readers agreeing on one v13 snapshot, and v12 and v5 unchanged with a non-empty visit context. Every
 * value is invented.
 */

const id = (n: number) => `019966b0-0231-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const overRange = (raw: string, unit: string) => ({ raw, unit, state: 'over_range' as const });

function sheet(type: EquipmentBlockType, seedVersion = 'v13'): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
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

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

function cells(block: BlockRow, testKey: string, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

function value(block: BlockRow, testKey: string, key: string, stored: unknown): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  next.sheet.test[testKey] = { ...test, values: { ...test.values, [key]: cell(stored) } };
  return next;
}

function measurement(block: BlockRow, testKey: string, visit: VisitContext = NO_VISIT_CONTEXT): MeasurementTestEvaluation {
  return evaluateSheetMeasurements(block, definitionOf(block), visit).find((test) => test.testKey === testKey)!;
}

const cellAt = (test: MeasurementTestEvaluation, row: number, col: number) => test.rows.find((one) => one.row === row)!.cells[col]!;
const verdictsOf = (test: MeasurementTestEvaluation, row: number) => test.rows.find((one) => one.row === row)!.cells.map((one) => one.verdict);

/** A v13 transformer, oil (ÓLEO ISOLANTE) or dry (EPÓXI), copper, at a plate temperature. */
const transformer = (medium: 'oil' | 'dry' | null, extra: Record<string, unknown> = {}) =>
  plate(sheet('transformador_forca'), {
    ...(medium === null ? {} : { tipo_de_isolacao: medium === 'oil' ? 'ÓLEO ISOLANTE' : 'EPÓXI' }),
    material_enrolamento: 'Cu',
    ...extra,
  });

/** The winding table's AT row on the tap in service (row 0), phases A, B and C (cols 0 to 2), in Ω. */
const atRow = (block: BlockRow, a: unknown, b: unknown, c: unknown) => cells(block, 'resistencia_enrolamento', { '0/0': a, '0/1': b, '0/2': c });
const ohm = (raw: string) => measured(raw, 'Ω');

describe('23.15-UNIT winding resistance: the deviation between phases by medium (Base rev08 TR-OL-05, TR-SE-05)', () => {
  it('oil, copper, 30 °C: each cell corrected to 75 °C, B 1 % within, C 3 % restricted; floor Aprovado · Com restrições with one restricao entry naming the test and the cell', () => {
    const block = atRow(transformer('oil', { temperatura_oleo_c: measured('30', '°C') }), ohm('1.000'), ohm('1.010'), ohm('1.030'));
    const test = measurement(block, 'resistencia_enrolamento');
    expect(test.title).toBe('Resistência ôhmica dos enrolamentos');
    expect(test.unnumbered).toBe(true);
    expect(verdictsOf(test, 0)).toEqual(['within', 'within', 'restricted']);
    // R x (235 + 75) / (235 + 30), four significant figures.
    expect([0, 1, 2].map((col) => cellAt(test, 0, col).corrected)).toEqual([
      { raw: '1.17', unit: 'Ω', text: '1,17 Ω' },
      { raw: '1.182', unit: 'Ω', text: '1,182 Ω' },
      { raw: '1.205', unit: 'Ω', text: '1,205 Ω' },
    ]);
    expect(cellAt(test, 0, 2).restriction).toEqual({
      reason: 'desvio de 3 % sobre a menor fase',
      text: 'Desvio de 3 % sobre a menor fase (Fase A: 1,000 Ω), acima de 2 %: a conclusão sobe para Com restrições.',
    });
    expect(test.temperature).toMatchObject({ state: 'corrected', print: '30 °C (ÓLEO)', printHeader: '75 °C', cellLead: 'A 75 °C:' });
    expect(test.criterionText).toBe('desvio entre fases ≤ 2 % (com restrição até 5 %)');
    const definition = definitionOf(block);
    expect(conclusionFloor(block, definition)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['restriction'] });
    expect(restrictedMeasurements(evaluateSheetMeasurements(block, definition))).toEqual([
      { testKey: 'resistencia_enrolamento', title: 'Resistência ôhmica dos enrolamentos', label: 'Resistência ôhmica dos enrolamentos', items: ['AT, tap atual, Fase C: desvio de 3 % sobre a menor fase'], pointItems: ['AT, tap atual, Fase C: desvio de 3 % sobre a menor fase'], hasOut: false },
    ]);
    expect(composeConclusion(block, definition, 'TR-1').text).toContain('com restrição na resistência ôhmica dos enrolamentos (AT, tap atual, Fase C: desvio de 3 % sobre a menor fase)');
  });

  it('oil bounds: exactly 2 % within, 2,01 % restricted, exactly 5 % restricted, 5,01 % out (floor Reprovado)', () => {
    const at = (c: string) => verdictsOf(measurement(atRow(transformer('oil'), ohm('1'), ohm('1'), ohm(c)), 'resistencia_enrolamento'), 0)[2];
    expect(at('1.02')).toBe('within');
    expect(at('1.0201')).toBe('restricted');
    expect(at('1.05')).toBe('restricted');
    expect(at('1.0501')).toBe('out');
    const out = atRow(transformer('oil'), ohm('1'), ohm('1'), ohm('1.0501'));
    const test = measurement(out, 'resistencia_enrolamento');
    // 24.9-UNIT (F17): built as the restricted helper is.
    expect(cellAt(test, 0, 2).helperText).toBe('Desvio de 5,01 % sobre a menor fase (Fase A: 1 Ω), acima de 5 %: a ficha fica Reprovado.');
    expect(conclusionFloor(out, definitionOf(out))!.pair.result).toBe('reprovado');
  });

  it('dry (EPÓXI): 4 % is restricted, no out band; 2 % within', () => {
    expect(verdictsOf(measurement(atRow(transformer('dry'), ohm('1'), ohm('1.04'), ohm('1')), 'resistencia_enrolamento'), 0)).toEqual(['within', 'restricted', 'within']);
    expect(verdictsOf(measurement(atRow(transformer('dry'), ohm('1'), ohm('1.02'), ohm('1')), 'resistencia_enrolamento'), 0)).toEqual(['within', 'within', 'within']);
    const test = measurement(atRow(transformer('dry'), ohm('1'), ohm('1.5'), ohm('1')), 'resistencia_enrolamento');
    expect(verdictsOf(test, 0)).toEqual(['within', 'restricted', 'within']);
    expect(test.criterionText).toBe('desvio entre fases ≤ 2 % (com restrição acima)');
  });

  it('medium unknown: 8 % not judged, the note asks for TIPO DE ISOLAÇÃO; a cell above the limit is still out', () => {
    const test = measurement(atRow(transformer(null), ohm('1'), ohm('1.08'), ohm('1')), 'resistencia_enrolamento');
    expect(verdictsOf(test, 0)).toEqual([null, null, null]);
    expect(test.notes).toEqual(['Informe o campo TIPO DE ISOLAÇÃO na placa para julgar o desvio entre fases.']);
    const open = measurement(atRow(transformer(null), ohm('1'), ohm('1.08'), overRange('2000', 'Ω')), 'resistencia_enrolamento');
    expect(verdictsOf(open, 0)).toEqual([null, null, 'out']);
    expect(cellAt(open, 0, 2).helperText).toBe('Acima do limite do instrumento: circuito aberto');
  });

  it('open circuit on a dry unit: that phase out, floor Reprovado; the others judged over the measured cells only', () => {
    const block = atRow(transformer('dry'), ohm('1'), ohm('1.01'), overRange('2000', 'Ω'));
    const test = measurement(block, 'resistencia_enrolamento');
    expect(verdictsOf(test, 0)).toEqual(['within', 'within', 'out']);
    expect(cellAt(test, 0, 2).overRange.allowed).toBe(true);
    expect(cellAt(test, 0, 2).corrected).toBeNull();
    expect(conclusionFloor(block, definitionOf(block))!.pair.result).toBe('reprovado');
  });

  it('no material: no corrected values, the deviation still judged, the note asks for the material', () => {
    const block = atRow(plate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO ISOLANTE', temperatura_oleo_c: measured('30', '°C') }), ohm('1'), ohm('1.03'), ohm('1'));
    const test = measurement(block, 'resistencia_enrolamento');
    expect(cellAt(test, 0, 0).corrected).toBeNull();
    expect(verdictsOf(test, 0)).toEqual(['within', 'restricted', 'within']);
    expect(test.notes).toEqual(['Informe o campo MATERIAL DO ENROLAMENTO na placa para corrigir os valores a 75 °C.']);
  });

  it('the temperature: oil from TEMPERATURA DO ÓLEO, dry from TEMPERATURA DO ENROLAMENTO, else (or medium unknown) the ambient; none: no correction; outside -10..110 °C: no correction', () => {
    const block = (medium: 'oil' | 'dry' | null, extra: Record<string, unknown>) => atRow(transformer(medium, extra), ohm('1'), ohm('1'), ohm('1'));
    const both = { temperatura_oleo_c: measured('30', '°C'), temperatura_enrolamento_c: measured('40', '°C') };
    expect(measurement(block('oil', both), 'resistencia_enrolamento').temperature!.print).toBe('30 °C (ÓLEO)');
    expect(measurement(block('dry', both), 'resistencia_enrolamento').temperature!.print).toBe('40 °C (ENROLAMENTO)');
    expect(measurement(block('oil', {}), 'resistencia_enrolamento', { ambientC: 25, previous: null }).temperature!.print).toBe('25 °C (AMBIENTE)');
    const unknown = measurement(block(null, both), 'resistencia_enrolamento', { ambientC: 25, previous: null });
    expect(unknown.temperature!.print).toBe('25 °C (AMBIENTE)');
    // At 75 °C the factor is 1.
    expect(measurement(block('oil', { temperatura_oleo_c: measured('75', '°C') }), 'resistencia_enrolamento').rows[0]!.cells[0]!.corrected!.raw).toBe('1');
    const none = measurement(block('oil', {}), 'resistencia_enrolamento');
    expect(none.temperature).toMatchObject({ state: 'missing_temperature', print: '-' });
    expect(none.temperature!.line.note).toBe('Informe a temperatura do óleo na placa ou a do ambiente de ensaio no local: sem ela, os valores não são corrigidos a 75 °C.');
    expect(none.rows[0]!.cells[0]!.corrected).toBeNull();
    const hot = measurement(block('oil', { temperatura_oleo_c: measured('111', '°C') }), 'resistencia_enrolamento');
    expect(hot.temperature!.state).toBe('out_of_range');
    expect(hot.rows[0]!.cells[0]!.corrected).toBeNull();
    // Aluminium: K 225.
    const al = measurement(atRow(transformer('oil', { material_enrolamento: 'Al', temperatura_oleo_c: measured('25', '°C') }), ohm('1'), ohm('1'), ohm('1')), 'resistencia_enrolamento');
    expect(al.rows[0]!.cells[0]!.corrected!.raw).toBe(String(Number((300 / 250).toPrecision(4))));
  });

  it('history: a corrected cell 2,5 % above the previous v13 visit\'s corrected value is restricted, its helper naming the revision; a previous on v12 or uncorrected is shown, not judged', () => {
    const block = atRow(transformer('oil', { temperatura_oleo_c: measured('75', '°C') }), ohm('1.025'), ohm('1.025'), ohm('1.025'));
    const keys = readingSlotsOf(definitionOf(block), block).filter((slot) => slot.testKey === 'resistencia_enrolamento' && slot.row === 0);
    const previous = (corrected: boolean, seed = 'v13'): VisitContext => ({
      ambientC: null,
      previous: {
        relatorio_id: id(900),
        revision_number: 2,
        issued_at: '2026-10-01T12:00:00.000Z',
        seed_version: seed,
        block_type: 'transformador_forca',
        readings: Object.fromEntries(keys.map((slot) => [slot.key, corrected ? { raw: '1', unit: 'Ω', state: 'measured' as const, corrected: { raw: '1', unit: 'Ω' } } : { raw: '1', unit: 'Ω', state: 'measured' as const }])),
      } satisfies PreviousResults,
    });
    const judged = measurement(block, 'resistencia_enrolamento', previous(true));
    expect(verdictsOf(judged, 0)).toEqual(['restricted', 'restricted', 'restricted']);
    expect(cellAt(judged, 0, 0).restriction).toEqual({
      reason: 'variação de mais de 2 % desde a manutenção anterior',
      text: 'Variou mais de 2 % desde a manutenção anterior (1 Ω a 75 °C, rev. 2, 01/10/2026): a conclusão sobe para Com restrições.',
      // Fix batch e23p (P3): both corrected values after the reason, for the derived point.
      pointReason: 'variação de mais de 2 % desde a manutenção anterior (de 1 Ω para 1,025 Ω, a 75 °C)',
      // Batch e24p (Story 24.16): the history rule's part, which the v14 note line names (v13 prints none).
      history: 'variação de mais de 2 % desde a manutenção anterior (de 1 Ω para 1,025 Ω, a 75 °C)',
    });
    expect(verdictsOf(measurement(block, 'resistencia_enrolamento', previous(false)), 0)).toEqual(['within', 'within', 'within']);
    // Exactly 2 % is within.
    const two = atRow(transformer('oil', { temperatura_oleo_c: measured('75', '°C') }), ohm('1.02'), ohm('1.02'), ohm('1.02'));
    expect(verdictsOf(measurement(two, 'resistencia_enrolamento', previous(true)), 0)).toEqual(['within', 'within', 'within']);
    // The issued visit keeps the corrected value for the next one.
    expect(Object.values(blockReadings(block, definitionOf(block))).filter((reading) => reading.corrected !== undefined)).toHaveLength(3);
  });

  it('the two extreme-tap rows are optional (never missing); the tap in service and the BT rows are required', () => {
    const test = measurement(transformer('oil'), 'resistencia_enrolamento');
    expect(test.rows.map((row) => row.cells.map((one) => one.missing))).toEqual([
      [true, true, true],
      [false, false, false],
      [false, false, false],
      [true, true, true],
    ]);
    expect(measurementCounts([test]).missing).toBe(6);
  });
});

describe('23.19-UNIT HH fuses on the seccionadora (Base rev08 SC-04)', () => {
  const fused = (extra: Record<string, unknown> = {}) => plate(sheet('chave_seccionadora'), { tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS', ...extra });
  const fuses = (block: BlockRow, a: string, b: string, c: string) => cells(block, 'resistencia_fusiveis', { '0/0': measured(a, 'mΩ'), '1/0': measured(b, 'mΩ'), '2/0': measured(c, 'mΩ') });

  it('10, 10, 12 mΩ: 12 is 20 % over the lowest, out, floor Reprovado; exactly 15 % within', () => {
    const block = fuses(fused(), '10', '10', '12');
    const test = measurement(block, 'resistencia_fusiveis');
    expect(test.rows.map((row) => row.cells[0]!.verdict)).toEqual(['within', 'within', 'out']);
    expect(test.rows[2]!.cells[0]!.helperText).toBe('Desvio de 20 % sobre a menor fase (Fase A: 10 mΩ), acima de 15 %: a ficha fica Reprovado.');
    expect(conclusionFloor(block, definitionOf(block))).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['measurement'] });
    expect(measurement(fuses(fused(), '10', '11.5', '10'), 'resistencia_fusiveis').rows.map((row) => row.cells[0]!.verdict)).toEqual(['within', 'within', 'within']);
    // A zero or negative lowest is no reference; one fuse alone judges nothing.
    expect(measurement(fuses(fused(), '0', '10', '11'), 'resistencia_fusiveis').rows.map((row) => row.cells[0]!.verdict)).toEqual([null, 'within', 'within']);
    expect(measurement(cells(fused(), 'resistencia_fusiveis', { '0/0': measured('10', 'mΩ') }), 'resistencia_fusiveis').rows[0]!.cells[0]!.verdict).toBeNull();
  });

  it('SEM CARGA: NA with its reason, not missing, absent from section 9; "Aplicar este ensaio" applies it; an empty type applies it', () => {
    const block = plate(sheet('chave_seccionadora'), { tipo_seccionadora: 'SEM CARGA' });
    const test = measurement(block, 'resistencia_fusiveis');
    expect(test.applicability).toMatchObject({ state: 'na', reason: 'Não se aplica: TIPO DE SECCIONADORA sem fusíveis.' });
    expect(measurementCounts([test]).missing).toBe(0);
    const applied = structuredClone(block);
    applied.sheet.test.resistencia_fusiveis = { cells: {}, applicability: cell(APPLICABILITY_APPLIED) };
    expect(testApplicability(applied, definitionOf(applied), 'resistencia_fusiveis').state).toBe('applied');
    expect(measurementCounts([measurement(applied, 'resistencia_fusiveis')]).missing).toBe(3);
    expect(measurement(sheet('chave_seccionadora'), 'resistencia_fusiveis').applicability.state).toBe('met');
  });
});

describe('23.16-UNIT the polarization index judged (Base rev08 TR-OL-03, TR-SE-03, table IP_CLASSIFICACAO)', () => {
  /** The insulation's first row (PRIMÁRIO/MASSA): 1 MINUTO in col 1, ABSORÇÃO col 3, POLARIZAÇÃO col 4. */
  const ipRow = (block: BlockRow, minute: unknown, ip: unknown, dar: unknown = undefined) =>
    cells(block, 'isolacao', { '0/1': minute, ...(ip === undefined ? {} : { '0/4': ip }), ...(dar === undefined ? {} : { '0/3': dar }) });
  const insulation = (block: BlockRow): TestEvaluation => evaluateTest(block, definitionOf(block), definitionOf(block).tests.find((test) => test.key === 'isolacao')!);
  const ipCell = (block: BlockRow) => insulation(block).tables[0]!.rows[0]!.cells.find((one) => one.index?.kind === 'ip')!;
  const darCell = (block: BlockRow) => insulation(block).tables[0]!.rows[0]!.cells.find((one) => one.index?.kind === 'dar')!;

  it('dry: IP 0,8 (and 0,99) out, floor Reprovado; 1,0 and 1,9 restricted; 2,0 within', () => {
    const dry = (ip: string) => ipRow(transformer('dry'), measured('5', 'GΩ'), measured(ip, null));
    expect(ipCell(dry('0.8')).verdict).toBe('out');
    expect(ipCell(dry('0.8')).helperText).toBe('Abaixo do aceitável (IP ≥ 1,0)');
    expect(ipCell(dry('0.99')).verdict).toBe('out');
    expect(ipCell(dry('1')).verdict).toBe('restricted');
    expect(ipCell(dry('1.9')).verdict).toBe('restricted');
    expect(ipCell(dry('1.9')).restriction!.reason).toBe('IP de 1,9, abaixo de 2,0');
    expect(ipCell(dry('2')).verdict).toBe('within');
    const out = dry('0.8');
    expect(conclusionFloor(out, definitionOf(out))!.pair.result).toBe('reprovado');
    expect(insulation(out).indexOut).toEqual([{ where: 'Primário–Massa', valueText: 'IP de 0,8', criterionText: 'IP ≥ 1,0', sourceName: 'NETA MTS-2023 7.2.1/7.2.2' }]);
    const restricted = dry('1.5');
    expect(conclusionFloor(restricted, definitionOf(restricted))!.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
  });

  it('required on a dry unit once the 1-minute reading is measured; optional on oil or an unknown medium', () => {
    expect(ipCell(ipRow(transformer('dry'), measured('5', 'GΩ'), undefined)).missing).toBe(true);
    expect(ipCell(ipRow(transformer('dry'), undefined, undefined)).missing).toBe(false);
    expect(ipCell(ipRow(transformer('oil'), measured('5', 'GΩ'), undefined)).missing).toBe(false);
    expect(ipCell(ipRow(transformer(null), measured('5', 'GΩ'), undefined)).missing).toBe(false);
  });

  it('the row above the instrument\'s limit: the IP is N/A, never typed or missing, a stored one ignored; it prints N/A', () => {
    const block = ipRow(transformer('dry'), overRange('2', 'TΩ'), measured('0.5', null));
    const ip = ipCell(block);
    expect(ip.index).toEqual({ kind: 'ip', notApplicable: true, required: false });
    expect([ip.verdict, ip.missing, ip.displayText]).toEqual([null, false, 'N/A']);
    expect(conclusionFloor(block, definitionOf(block))?.pair.result).not.toBe('reprovado');
  });

  it('the DAR is captured and printed, never judged nor missing', () => {
    const block = ipRow(transformer('dry'), measured('5', 'GΩ'), measured('2.5', null), measured('0.9', null));
    expect(darCell(block)).toMatchObject({ verdict: null, missing: false, displayText: '0,9', index: { kind: 'dar', notApplicable: false, required: false } });
  });

  it('v12 with IA e IP lidos do visor on: no index cell, nothing judged (AD-21)', () => {
    const block = cells(sheet('transformador_forca', 'v12'), 'isolacao', { '0/1': measured('5', 'GΩ'), '0/4': measured('0.5', null) });
    const test = insulation(block);
    expect(test.indexOut).toBeUndefined();
    expect(test.tables[0]!.rows[0]!.cells.map((one) => one.role)).toEqual(['capture']);
  });
});

describe('23.17-UNIT the insulating liquid and the oil sampling (Base rev08 TR-OL-07, DJ-07)', () => {
  const ctx = EMPTY_DEFINITION_CONTEXT;
  const snapshotOf = (block: BlockRow) => ({ blocks: [block], equipment_types: undefined });

  it('silicone: oil items answerable, TIPO (ANP) hidden (never missing, excused), the sampling applies', () => {
    const block = plate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'SILICONE' });
    expect(isFieldHidden(block, 'tipo_anp', ctx)).toBe(true);
    expect(isOilFieldExcused(block, 'tipo_anp', ctx)).toBe(true);
    expect(isOilFieldExcused(block, 'natureza_liquido', ctx)).toBe(false);
    expect(nameplateMissingKeys(snapshotOf(block), block.id).has('tipo_anp')).toBe(false);
    expect(measurement(block, 'coleta_oleo').applicability.state).toBe('met');
  });

  it('mineral: TIPO (ANP) shown and required; an empty NATUREZA DO LÍQUIDO shows it too', () => {
    const block = plate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'MINERAL' });
    expect(isFieldHidden(block, 'tipo_anp', ctx)).toBe(false);
    expect(nameplateMissingKeys(snapshotOf(block), block.id).has('tipo_anp')).toBe(true);
    const empty = plate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO ISOLANTE' });
    expect(isFieldHidden(empty, 'tipo_anp', ctx)).toBe(false);
    expect(nameplateMissingKeys(snapshotOf(empty), empty.id).has('tipo_anp')).toBe(true);
  });

  it('a dry unit: both liquid fields excused ("-" in print), the sampling NA with its reason', () => {
    const block = plate(sheet('transformador_forca'), { tipo_de_isolacao: 'EPÓXI' });
    for (const key of ['natureza_liquido', 'tipo_anp']) expect(isOilFieldExcused(block, key, ctx), key).toBe(true);
    const sampling = measurement(block, 'coleta_oleo');
    expect(sampling.applicability).toMatchObject({ state: 'na', reason: 'Não se aplica: TIPO DE ISOLAÇÃO não é ÓLEO ISOLANTE.' });
  });

  it('the older spellings ÓLEO and ÓLEO MINERAL read as ÓLEO ISOLANTE on a v13 copy', () => {
    const field = definitionOf(sheet('transformador_forca')).nameplate.find((one) => one.key === 'tipo_de_isolacao')!;
    expect(selectOptionFor(field, 'ÓLEO MINERAL')).toBe('ÓLEO ISOLANTE');
    expect(selectOptionFor(field, 'ÓLEO')).toBe('ÓLEO ISOLANTE');
    expect(selectOptionFor(field, 'Óleo isolante')).toBe('ÓLEO ISOLANTE');
  });

  it('Não coletado asks for its reason (required), never raises the floor; Coletado asks none', () => {
    const base = plate(sheet('transformador_forca'), { tipo_de_isolacao: 'ÓLEO ISOLANTE' });
    const notCollected = cells(base, 'coleta_oleo', { '0/0': choiceValue('nao_coletado') });
    const motivo = (block: BlockRow) => measurement(block, 'coleta_oleo').values.find((one) => one.key === 'motivo')!;
    expect(motivo(notCollected)).toMatchObject({ shown: true, missing: true });
    expect(measurement(notCollected, 'coleta_oleo').rows[0]!.cells[0]!.verdict).toBe('within');
    const answered = value(notCollected, 'coleta_oleo', 'motivo', choiceValue('equipamento_energizado'));
    expect(motivo(answered)).toMatchObject({ shown: true, missing: false });
    expect(measurement(answered, 'coleta_oleo').valuesLine!.text).toBe('Motivo: Equipamento energizado');
    const collected = cells(base, 'coleta_oleo', { '0/0': choiceValue('coletado') });
    expect(motivo(collected)).toMatchObject({ shown: false, missing: false });
    expect(conclusionFloor(answered, definitionOf(answered))?.pair.result ?? null).not.toBe('reprovado');
  });

  it('the disjuntor: Óleo applies its sampling, Vácuo makes it NA', () => {
    expect(measurement(plate(sheet('disjuntor_mt'), { meio_de_extincao: 'Óleo' }), 'coleta_oleo').applicability.state).toBe('met');
    expect(measurement(plate(sheet('disjuntor_mt'), { meio_de_extincao: 'Vácuo' }), 'coleta_oleo').applicability.state).toBe('na');
  });
});

describe('23.15 to 23.19-UNIT company copies carry the keys and prune what names a removed field', () => {
  it('"Duplicar" on the v13 transformer and seccionadora keeps every e23t key and publishes clean', () => {
    for (const type of ['transformador_forca', 'chave_seccionadora', 'disjuntor_mt'] as const) {
      const copy = duplicateSeededType('v13', type).draft;
      expect(companyTypeDefinitionSchema.safeParse(copy).success, type).toBe(true);
    }
    const tf = duplicateSeededType('v13', 'transformador_forca').draft;
    expect(tf.tests.find((test) => test.key === 'isolacao')!.polarization_index).toBeDefined();
    expect(tf.measurement_tests!.find((test) => test.key === 'resistencia_enrolamento')!.winding_correction).toBeDefined();
    expect(tf.nameplate.find((field) => field.key === 'tipo_anp')!.excused_unless).toEqual({ field: 'natureza_liquido', in: ['MINERAL'] });
  });

  it('removing MATERIAL DO ENROLAMENTO drops the winding correction and its history rule; NATUREZA DO LÍQUIDO drops the excused_unless', () => {
    const tf = duplicateSeededType('v13', 'transformador_forca').draft;
    const at = (key: string) => tf.nameplate.findIndex((field) => field.key === key);
    const noMaterial = removeDraftEntry(tf, 'nameplate', at('material_enrolamento'));
    const winding = noMaterial.measurement_tests!.find((test) => test.key === 'resistencia_enrolamento')!;
    expect([winding.winding_correction, winding.history_deviation_pct]).toEqual([undefined, undefined]);
    expect(companyTypeDefinitionSchema.safeParse(noMaterial).success).toBe(true);
    const noOilTemperature = removeDraftEntry(tf, 'nameplate', at('temperatura_oleo_c'));
    expect(noOilTemperature.measurement_tests!.find((test) => test.key === 'resistencia_enrolamento')!.winding_correction).toEqual({ to_c: 75, material_field: 'material_enrolamento', dry_field: 'temperatura_enrolamento_c' });
    const noLiquid = removeDraftEntry(tf, 'nameplate', at('natureza_liquido'));
    expect(noLiquid.nameplate!.find((field) => field.key === 'tipo_anp')!.excused_unless).toBeUndefined();
    expect(companyTypeDefinitionSchema.safeParse(noLiquid).success).toBe(true);
  });
});

// --- one v13 snapshot: every reader agrees ---------------------------------------------------------

function v13Snapshot(): RelatorioSnapshot {
  return structuredClone(layoutLockSnapshot('v13', { epic24: false }));
}
const blockOf = (snapshot: RelatorioSnapshot, type: string) => snapshot.blocks.find((block) => block.block_type === type && block.removed_at === null)!;
function editBlock(snapshot: RelatorioSnapshot, type: string, edit: (block: BlockRow) => void): BlockRow {
  const next = structuredClone(blockOf(snapshot, type));
  edit(next);
  snapshot.blocks = snapshot.blocks.map((block) => (block.id === next.id ? next : block));
  return next;
}
const printedSheet = (snapshot: RelatorioSnapshot, blockId: string) => section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === blockId)!;
const tablesOf = (snapshot: RelatorioSnapshot, blockId: string): PrintTable[] => printedSheet(snapshot, blockId).parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const tableWith = (snapshot: RelatorioSnapshot, blockId: string, text: string) => tablesOf(snapshot, blockId).find((table) => table.rows.some((row) => row.cells.some((one) => one.text === text)));

describe('23.15 to 23.19-UNIT one v13 snapshot: floor, points, parecer, progress and sections 8 and 9 agree', () => {
  it('a restricted winding phase: Aprovado · Com restrições everywhere, one restricao entry, the winding table printed with its 75 °C group and TEMPERATURA line', () => {
    const snapshot = v13Snapshot();
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.nameplate.tipo_de_isolacao = cell('ÓLEO ISOLANTE');
      block.sheet.nameplate.material_enrolamento = cell('Cu');
      block.sheet.nameplate.temperatura_oleo_c = cell(measured('30', '°C'));
      block.sheet.test.resistencia_enrolamento = {
        cells: {
          '0': { '0': cell(ohm('1.000')), '1': cell(ohm('1.010')), '2': cell(ohm('1.030')) },
          '3': { '0': cell(measured('2', 'mΩ')), '1': cell(measured('2', 'mΩ')), '2': cell(measured('2', 'mΩ')) },
        },
      };
    });
    const definition = definitionOf(tf);
    const visit = visitContextOf(snapshot, tf);
    expect(conclusionFloor(tf, definition, visit)!.reasons).toContain('restriction');
    // Fix batch e24h: the restriction is a finding (it floors) and prints no automatic point (was its restricao entry and bullet).
    expect(hasPointSource(snapshot)).toBe(true);
    expect(resolveSection8(snapshot, new Map()).some((bullet) => bullet.text.includes('Resistência ôhmica dos enrolamentos'))).toBe(false);
    const tag = snapshot.equipment.find((row) => row.id === tf.equipment_id)!.tag;
    expect(parecerCounts(snapshot).reprovado.includes(tag)).toBe(effectiveConclusionPair(tf, definition, visit).result === 'reprovado');
    // A restricted phase is within its criterion for the progress (B-8): no reading out of its limit on the winding.
    expect(sheetProgress(snapshot, tf.id).steps.ensaios.outOfLimit).toBe(sheetProgress({ ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === tf.id ? { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, resistencia_enrolamento: { cells: {} } } } } : block)) }, tf.id).steps.ensaios.outOfLimit);
    const table = tableWith(snapshot, tf.id, 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS')!;
    expect(table.rows.map((row) => row.cells.map((one) => one.text))).toEqual([
      ['RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS'],
      ['INSTRUMENTO: -'],
      ['TEMPERATURA: 30 °C (ÓLEO)'],
      ['', '', '75 °C'],
      ['ENROLAMENTO', 'FASE A', 'FASE B', 'FASE C', 'FASE A', 'FASE B', 'FASE C'],
      ['AT, TAP ATUAL', '1,000 Ω', '1,010 Ω', '1,030 Ω', '1,17 Ω', '1,182 Ω', '1,205 Ω'],
      ['AT, PRIMEIRO TAP', '-', '-', '-', '-', '-', '-'],
      ['AT, ÚLTIMO TAP', '-', '-', '-', '-', '-', '-'],
      ['BT', '2 mΩ', '2 mΩ', '2 mΩ', '2,34 mΩ', '2,34 mΩ', '2,34 mΩ'],
    ]);
    expect(table.textHalfPoints ?? 18).toBeGreaterThanOrEqual(16);
    expect(wordsWiderThanColumns(table, READING_FIT_WIDTH_EM)).toEqual([]);
  });

  it('a dry transformer\'s IP of 0,8: Reprovado, a reading entry naming the IP, section 9 prints it; an over-range row prints N/A', () => {
    const snapshot = v13Snapshot();
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.nameplate.tipo_de_isolacao = cell('EPÓXI');
      block.sheet.test.isolacao!.cells['0']!['4'] = cell(measured('0.8', null));
      block.sheet.test.isolacao!.cells['1']!['1'] = cell(overRange('2', 'TΩ'));
      block.sheet.test.isolacao!.cells['1']!['4'] = cell(measured('3', null));
    });
    const definition = definitionOf(tf);
    expect(conclusionFloor(tf, definition, visitContextOf(snapshot, tf))!.pair.result).toBe('reprovado');
    // Fix batch e24h: ~~the reading entry "IP de 0,8 em Primário–Massa (critério: IP ≥ 1,0)"~~; the conclusion still names it.
    expect(composeConclusion(tf, definition, 'TR-1', visitContextOf(snapshot, tf)).text).toContain('IP de 0,8 no ensaio de isolação em Primário–Massa (critério: IP ≥ 1,0, NETA MTS-2023 7.2.1/7.2.2)');
    const table = tableWith(snapshot, tf.id, 'POLARIZAÇÃO')!;
    const bottom = table.rows.filter((row) => row.header === true).at(-1)!;
    const col = bottom.cells.findIndex((one) => one.text === 'POLARIZAÇÃO');
    const data = table.rows.filter((row) => row.header !== true && row.band !== true);
    expect(data.map((row) => row.cells[col]!.text)).toEqual(['0,8', 'N/A', '-']);
  });

  it('a seccionadora without fuses and a dry transformer\'s sampling: absent from section 9; the liquid fields print "-"', () => {
    const snapshot = v13Snapshot();
    const sc = editBlock(snapshot, 'chave_seccionadora', (block) => {
      block.sheet.nameplate.tipo_seccionadora = cell('SEM CARGA');
    });
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.nameplate.tipo_de_isolacao = cell('EPÓXI');
    });
    expect(tableWith(snapshot, sc.id, 'RESISTÊNCIA DOS FUSÍVEIS HH')).toBeUndefined();
    expect(tableWith(snapshot, tf.id, 'COLETA DE ÓLEO')).toBeUndefined();
    const nameplate = tablesOf(snapshot, tf.id)[0]!;
    const valueOf = (label: string) => {
      for (const row of nameplate.rows) {
        const at = row.cells.findIndex((one) => one.text === label);
        if (at !== -1) return row.cells[at + 1]!.text;
      }
      return null;
    };
    expect(valueOf('NATUREZA DO LÍQUIDO')).toBe('-');
    expect(valueOf('TIPO (ANP)')).toBe('-');
  });
});

describe('23.15 to 23.19-UNIT v12 and v5 unchanged with a non-empty visit context (AD-21)', () => {
  it.each(['v12', 'v5'] as const)('%s: every sheet\'s measurement evaluation and readings are those of no context', (version) => {
    const snapshot = layoutLockSnapshot(version);
    for (const block of snapshot.blocks.filter((one) => one.equipment_id !== null && one.removed_at === null)) {
      const definition = definitionOf(block);
      const context: VisitContext = {
        ambientC: 40,
        previous: {
          relatorio_id: id(901),
          revision_number: 2,
          issued_at: '2026-11-01T12:00:00.000Z',
          seed_version: version,
          block_type: block.block_type,
          readings: Object.fromEntries(readingSlotsOf(definition).map((slot) => [slot.key, { raw: '1', unit: 'Ω', state: 'measured' as const, corrected: { raw: '1', unit: 'Ω' } }])),
        },
      };
      expect(evaluateSheetMeasurements(block, definition, context), block.block_type).toEqual(evaluateSheetMeasurements(block, definition));
      expect(evaluateSheetReadings(block, definition, context), block.block_type).toEqual(evaluateSheetReadings(block, definition));
    }
  });
});

// --- review fixes (batch e23t) -------------------------------------------------------------------------

/** A previous v13 visit whose corrected winding readings of the AT row on the tap in service were `raw` Ω. */
function previousWinding(block: BlockRow, raw: string): PreviousResults {
  const keys = readingSlotsOf(definitionOf(block), block).filter((slot) => slot.testKey === 'resistencia_enrolamento' && slot.row === 0);
  return {
    relatorio_id: id(900),
    revision_number: 2,
    issued_at: '2026-10-01T12:00:00.000Z',
    seed_version: 'v13',
    block_type: 'transformador_forca',
    readings: Object.fromEntries(keys.map((slot) => [slot.key, { raw, unit: 'Ω', state: 'measured' as const, corrected: { raw, unit: 'Ω' } }])),
  };
}

describe('e23p-P3 a winding cell in the restricted band whose value also moved since the previous visit', () => {
  it('dry, 75 °C: phase C 3 % above the lowest (restricted band) and 3 % above its previous 1 Ω: the history rule reads only a cell still within, so the point names the band alone, never the values beside it', () => {
    const block = atRow(transformer('dry', { temperatura_enrolamento_c: measured('75', '°C') }), ohm('1'), ohm('1'), ohm('1.03'));
    const test = measurement(block, 'resistencia_enrolamento', { ambientC: null, previous: previousWinding(block, '1') });
    expect(verdictsOf(test, 0)).toEqual(['within', 'within', 'restricted']);
    const restriction = cellAt(test, 0, 2).restriction!;
    expect(restriction.reason).toBe('desvio de 3 % sobre a menor fase');
    expect(restriction.pointReason).toBeUndefined();
    const [restricted] = restrictedMeasurements([test]);
    expect(restricted!.pointItems).toEqual(['AT, tap atual, Fase C: desvio de 3 % sobre a menor fase']);
    expect(restricted!.pointItems).toEqual(restricted!.items);
    // Phases A and B, unchanged since the previous visit and within the band, carry no restriction at all.
    expect([cellAt(test, 0, 0).restriction ?? null, cellAt(test, 0, 1).restriction ?? null]).toEqual([null, null]);
  });
});

describe('e23t review fixes: the history rule runs only on a cell within, named by the criterion in force', () => {
  it('medium unknown (no deviation judged): a corrected value 2,5 % off the previous visit is not restricted', () => {
    const block = atRow(transformer(null, { temperatura_oleo_c: measured('75', '°C') }), ohm('1.025'), ohm('1.025'), ohm('1.025'));
    const test = measurement(block, 'resistencia_enrolamento', { ambientC: 75, previous: previousWinding(block, '1') });
    expect(test.rows[0]!.cells.map((cell) => [cell.verdict, cell.restriction ?? null])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it('a lone measured phase (no deviation judged) is not restricted either', () => {
    const block = cells(transformer('oil', { temperatura_oleo_c: measured('75', '°C') }), 'resistencia_enrolamento', { '0/0': ohm('1.025') });
    expect(measurement(block, 'resistencia_enrolamento', { ambientC: null, previous: previousWinding(block, '1') }).rows[0]!.cells[0]!.verdict).toBeNull();
  });

  it('on a dry unit the restricted cell names the dry criterion and its source', () => {
    const block = atRow(transformer('dry', { temperatura_enrolamento_c: measured('75', '°C') }), ohm('1.025'), ohm('1.025'), ohm('1.025'));
    const cell = measurement(block, 'resistencia_enrolamento', { ambientC: null, previous: previousWinding(block, '1') }).rows[0]!.cells[0]!;
    expect(cell.verdict).toBe('restricted');
    expect([cell.criterionText, cell.sourceName]).toEqual(['desvio entre fases ≤ 2 % (com restrição acima)', 'NETA MTS-2023 7.2.1.2']);
  });
});

describe('e23t review fixes: "E{n} ·" stays on every type but a seeded FO.SERV-03 one', () => {
  it('a company type copying the seccionadora (seeded tests and a measurement table) keeps "E1 ·"; the seeded one drops it', () => {
    const seeded = definitionOf(sheet('chave_seccionadora'));
    const company: BlockDefinition = { ...seeded, block_type: companyBlockType('019a6100-0000-7000-8000-0000000000e1') };
    const block = sheet('chave_seccionadora');
    expect(evaluateSheetMeasurements(block, company).find((test) => test.testKey === 'resistencia_fusiveis')!.title).toBe('E1 · Resistência dos fusíveis HH');
    expect(measurementTestTitle(company, 'resistencia_fusiveis')).toBe('E1 · Resistência dos fusíveis HH');
    expect(evaluateSheetMeasurements(block, seeded).find((test) => test.testKey === 'resistencia_fusiveis')!.title).toBe('Resistência dos fusíveis HH');
    expect(measurementTestTitle(seeded, 'resistencia_fusiveis')).toBe('Resistência dos fusíveis HH');
  });

  it('the conclusion of fuses at 10, 10 and 12 mΩ names the test by its label, its acronym kept, in the text and the criteria line', () => {
    const block = cells(plate(sheet('chave_seccionadora'), { tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS' }), 'resistencia_fusiveis', {
      '0/0': measured('10', 'mΩ'),
      '1/0': measured('10', 'mΩ'),
      '2/0': measured('12', 'mΩ'),
    });
    const composed = composeConclusion(block, definitionOf(block), 'SC-1');
    expect(composed.text).toContain('resistência dos fusíveis HH fora do critério em');
    const item = composed.criteriaItems.find((one) => one.includes('12 mΩ'))!;
    expect(item.startsWith('Resistência dos fusíveis HH ')).toBe(true);
  });
});

describe('e23t review fixes: consumers judge under a non-empty visit context', () => {
  it('a v13 winding with no oil temperature and the cabine at 30 °C: section 9 prints TEMPERATURA (AMBIENTE) and the 75 °C cells; last_results keeps the corrected values', () => {
    const snapshot = v13Snapshot();
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.nameplate.tipo_de_isolacao = cell('ÓLEO ISOLANTE');
      block.sheet.nameplate.material_enrolamento = cell('Cu');
      delete block.sheet.nameplate.temperatura_oleo_c;
      block.sheet.test.resistencia_enrolamento = { cells: { '0': { '0': cell(ohm('1')), '1': cell(ohm('1')), '2': cell(ohm('1')) } } };
    });
    const cabine = snapshot.locations.find((location): location is Extract<RelatorioSnapshot['locations'][number], { kind: 'cabine' }> => location.kind === 'cabine')!;
    cabine.env.temperature_c = measured('30', '°C');
    const table = tableWith(snapshot, tf.id, 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS')!;
    const rows = table.rows.map((row) => row.cells.map((one) => one.text));
    expect(rows).toContainEqual(['TEMPERATURA: 30 °C (AMBIENTE)']);
    expect(rows.find((row) => row[0] === 'AT, TAP ATUAL')!.slice(4)).toEqual(['1,17 Ω', '1,17 Ω', '1,17 Ω']);
    const readings = blockReadings(tf, definitionOf(tf), visitContextOf(snapshot, tf));
    const winding = Object.entries(readings).filter(([key]) => key.startsWith('resistencia_enrolamento|'));
    expect(winding.map(([, reading]) => reading.corrected)).toEqual([
      { raw: '1.17', unit: 'Ω' },
      { raw: '1.17', unit: 'Ω' },
      { raw: '1.17', unit: 'Ω' },
    ]);
  });

  it('a previous v13 visit on the equipment row whose corrected value moved 2,5 %: a restricao entry and the restriction floor through visitContextOf', () => {
    const snapshot = v13Snapshot();
    const tf = editBlock(snapshot, 'transformador_forca', (block) => {
      block.sheet.nameplate.tipo_de_isolacao = cell('ÓLEO ISOLANTE');
      block.sheet.nameplate.material_enrolamento = cell('Cu');
      block.sheet.nameplate.temperatura_oleo_c = cell(measured('75', '°C'));
      block.sheet.test.resistencia_enrolamento = { cells: { '0': { '0': cell(ohm('1.025')), '1': cell(ohm('1.025')), '2': cell(ohm('1.025')) } } };
    });
    snapshot.equipment = snapshot.equipment.map((row) => (row.id === tf.equipment_id ? { ...row, last_results: { ...previousWinding(tf, '1'), prior: null } } : row));
    const visit = visitContextOf(snapshot, tf);
    expect(visit.previous?.revision_number).toBe(2);
    expect(conclusionFloor(tf, definitionOf(tf), visit)!.reasons).toContain('restriction');
    // Fix batch e24h: ~~the point naming both corrected values (fix batch e23p, P3)~~: no automatic point; the paragraph keeps the reason alone.
    expect(hasPointSource(snapshot)).toBe(true);
    expect(composeConclusion(tf, definitionOf(tf), 'TR-1', visit).text).not.toContain('para 1,025 Ω');
  });
});

describe('e23t review fixes: the Enter run over the typed IP and DAR', () => {
  const insulationRows = (medium: 'oil' | 'dry') =>
    cells(transformer(medium), 'isolacao', { '0/1': measured('5', 'GΩ'), '1/1': overRange('2', 'TΩ'), '2/1': measured('5', 'GΩ') });
  const readingsOf = (block: BlockRow) => evaluateSheetReadings(block, definitionOf(block));

  it('down POLARIZAÇÃO, Enter skips the row whose IP is N/A', () => {
    expect(runTarget(readingsOf(insulationRows('dry')), { testKey: 'isolacao', row: 0, col: 4 }, 'next')).toEqual({ testKey: 'isolacao', row: 2, col: 4 });
  });

  it('a jump from the last 1 minuto stops on a required dry IP, skipping the empty DAR; on an oil unit it skips both', () => {
    const dry = readingsOf(insulationRows('dry'));
    expect(runTarget(dry, { testKey: 'isolacao', row: 2, col: 1 }, 'next')).toEqual({ testKey: 'isolacao', row: 0, col: 4 });
    expect(firstRunCell(dry)).toEqual({ testKey: 'isolacao', row: 0, col: 4 });
    const oil = readingsOf(insulationRows('oil'));
    const jump = runTarget(oil, { testKey: 'isolacao', row: 2, col: 1 }, 'next');
    expect(jump === 'end' || jump === null || jump.testKey !== 'isolacao').toBe(true);
    const first = firstRunCell(oil);
    expect(first === null || first.testKey !== 'isolacao').toBe(true);
  });
});

describe('e23t gate fix: the sheet\'s one Enter run joins the seeded tables and the measurement tests', () => {
  const runOf = (block: BlockRow) => ({ readings: evaluateSheetReadings(block, definitionOf(block)), measurements: evaluateSheetMeasurements(block, definitionOf(block)) });
  const contactEnd = { testKey: 'resistencia_contato' as const, row: 2, col: 0 };
  const fuse = (row: number) => ({ testKey: 'resistencia_fusiveis', row, col: 0 });

  it('a v13 seccionadora with TIPO DE SECCIONADORA empty: Enter on the last contact cell goes to the first empty fuse, the last fuse hands it to the primary', () => {
    const run = runOf(sheet('chave_seccionadora'));
    expect(sheetRunTarget(run, contactEnd, 'next')).toEqual(fuse(0));
    expect(sheetRunEnterKeyHint(run, contactEnd)).toBe('next');
    expect(sheetRunTarget(run, fuse(2), 'next')).toBe('end');
    expect(sheetRunEnterKeyHint(run, fuse(2))).toBe('done');
    expect(sheetRunTarget(run, fuse(0), 'previous')).toEqual(lastRunCell(run.readings));
    expect(lastRunCell(run.readings)).toEqual(contactEnd);
  });

  it('the fuses filled, the seeded run ends on the primary; with the fuses NA (SEM CARGA) too, as before', () => {
    const filled = cells(sheet('chave_seccionadora'), 'resistencia_fusiveis', { '0/0': measured('10', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('10', 'mΩ') });
    expect(sheetRunTarget(runOf(filled), contactEnd, 'next')).toBe('end');
    const sem = runOf(plate(sheet('chave_seccionadora'), { tipo_seccionadora: 'SEM CARGA' }));
    expect(sem.measurements.find((test) => test.testKey === 'resistencia_fusiveis')!.applicability.state).toBe('na');
    expect(sheetRunEnterKeyHint(sem, contactEnd)).toBe('done');
  });

  it('a v12 seccionadora (no measurement test): the seeded run alone, unchanged', () => {
    const run = runOf(sheet('chave_seccionadora', 'v12'));
    expect(run.measurements.length).toBe(0);
    expect(sheetRunTarget(run, contactEnd, 'next')).toBe(runTarget(run.readings, contactEnd, 'next'));
  });
});

describe('24.9-UNIT F17 (review of e24b): the screen names each criterion by its medium only while the medium is unknown', () => {
  it('unknown medium: "Óleo: … · Seco: …", each label beside its own line, the printed line unchanged; oil or dry: no screen line', () => {
    const unknown = measurement(transformer(null), 'resistencia_enrolamento');
    const oil = measurement(transformer('oil'), 'resistencia_enrolamento');
    const dry = measurement(transformer('dry'), 'resistencia_enrolamento');
    expect(unknown.screenCriterionText).toBe(`Óleo: ${oil.criterionText} · Seco: ${dry.criterionText}`);
    expect(unknown.criterionText).toBe(`${oil.criterionText}; ${dry.criterionText}`);
    expect(oil.screenCriterionText).toBeUndefined();
    expect(dry.screenCriterionText).toBeUndefined();
  });
});
