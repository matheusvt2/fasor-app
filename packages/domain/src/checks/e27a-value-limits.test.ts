import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { entityKey } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { locationEnvPath, safeParsePath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { HUMIDITY_RANGE_PCT, numberRangeOf, opValueIssue, SITE_ALTITUDE_RANGE_M } from '../ops/value-limits.ts';
import { exportPrecheck, preIssue } from '../relatorio/pre-issue.ts';
import { evaluatedCells, evaluateSheetReadings } from '../relatorio/readings.ts';
import { evaluateSheetMeasurements, parseMeasurementReadingPtBr } from '../relatorio/measurement-evaluation.ts';
import { ctaDefinition, ctaRows } from '../relatorio/measurement-test-support.ts';
import { emptySheet, type BlockRow, type Cell, type LocationRow, type RelatorioRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { criterionTextInUnit, RESISTANCE_POSITIVE_ONLY_TEXT } from '../seed/criteria.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { isValidCnpjFormat } from './cnpj.ts';
import { cnpjInputRefusal, numberRangeRefusal, refusedMeasurementKind, refusedNumberKind } from './input-refusal.ts';
import { artTrtNotNumeric, artTrtRemarkText, artTrtRowText, envFieldRemarkText, outOfRangeText, temperatureRemarkText, temperatureRowText } from './value-remarks.ts';

/*
 * 27.2-UNIT (Story 27.2, decision 3 of 2026-11-21): the impossible refused where it is typed and by
 * the push route, the improbable remarked and listed, never blocking.
 */

const CABINE = '019966c1-0000-7000-8000-000000000008';
const humidityPath = locationEnvPath(CABINE, 'humidity_pct');
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

describe('27.2-UNIT humidity: 0 to 100 %, refused outside on the device and by the push route', () => {
  const issueOf = (raw: string) => {
    const op = makeOp(
      { kind: 'put', scope: 'relatorio', company_id: portoSeguroSmall.companyId, project_id: null, relatorio_id: portoSeguroSmall.relatorioId, path: humidityPath, value: measured(raw, '%'), prev_op_id: null, batch_id: null, meta: null, actor_id: portoSeguroSmall.userId, device_id: 'unit' },
      { newId: () => '019a0000-0000-7000-8000-0000000000f1', now: new Date('2026-11-21T12:00:00.000Z') },
    );
    return opValueIssue(op, safeParsePath(humidityPath)!);
  };

  it('the range of the path is the kernel constant', () => {
    expect(numberRangeOf(humidityPath)).toEqual(HUMIDITY_RANGE_PCT);
    expect(numberRangeOf(locationEnvPath(CABINE, 'temperature_c'))).toBeNull();
    expect(numberRangeOf('relatorio/setup/site_altitude_m')).toEqual(SITE_ALTITUDE_RANGE_M);
  });

  it('0 and 100 are accepted; -0,1, 100,1 and 150 are refused (op_value_invalid on the server)', () => {
    expect(issueOf('0')).toBeNull();
    expect(issueOf('100')).toBeNull();
    expect(issueOf('-0.1')).not.toBeNull();
    expect(issueOf('100.1')).not.toBeNull();
    expect(issueOf('150')).not.toBeNull();
  });

  it('the device refuses the same with the range message, and names out_of_range', () => {
    const range = numberRangeOf(humidityPath);
    expect(numberRangeRefusal('0', '%', range)).toBeNull();
    expect(numberRangeRefusal('100', '%', range)).toBeNull();
    expect(numberRangeRefusal('-0,1', '%', range)).toBe('Fora da faixa: 0 a 100 %');
    expect(numberRangeRefusal('100,1', '%', range)).toBe('Fora da faixa: 0 a 100 %');
    expect(numberRangeRefusal('150', '%', range)).toBe('Fora da faixa: 0 a 100 %');
    expect(refusedNumberKind('150', '%', range)).toBe('out_of_range');
    expect(refusedNumberKind('abc', '%', range)).toBe('not_a_number');
    expect(outOfRangeText(SITE_ALTITUDE_RANGE_M, 'm')).toBe('Fora da faixa: -500 a 9000 m');
  });
});

describe('27.2-UNIT temperature: remarked outside -10 to 60 °C, never refused', () => {
  it('-10 and 60 are usual; -10,1, 60,1 and 999 are remarked; the range never refuses it', () => {
    expect(temperatureRemarkText(measured('-10', '°C'))).toBeNull();
    expect(temperatureRemarkText(measured('60', '°C'))).toBeNull();
    for (const raw of ['-10.1', '60.1', '999']) expect(temperatureRemarkText(measured(raw, '°C')), raw).toBe('Temperatura incomum: confira o valor (o usual é de -10 a 60 °C)');
    expect(envFieldRemarkText('temperature_c', measured('999', '°C'))).not.toBeNull();
    expect(envFieldRemarkText('humidity_pct', measured('999', '%'))).toBeNull();
    expect(temperatureRemarkText(null)).toBeNull();
    expect(temperatureRemarkText({ raw: '', unit: '°C', state: 'not_applicable' })).toBeNull();
    expect(numberRangeOf(locationEnvPath(CABINE, 'temperature_c'))).toBeNull();
    expect(temperatureRowText('Cabine 1', measured('999', '°C'))).toBe('Cabine 1: temperatura de 999 °C, fora do usual (-10 a 60 °C)');
  });
});

describe('27.2-UNIT zero resistance on an absolute criterion', () => {
  const ID = '019966b0-0272-7000-8000-000000000001';
  const OP = '019966b0-0272-7000-8000-000000000002';
  const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
  const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
  const block = (sheet: Partial<BlockRow['sheet']> = {}): BlockRow => ({
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora') as BlockRow['config'],
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
  });

  it('a seeded contact resistance (< 250 µΩ) and insulation (> 400 MΩ) capture refuses 0 and -1 as not_positive; 0,1 is read', () => {
    const cells = evaluatedCells(evaluateSheetReadings(block(), SEC));
    const contact = cells.filter((c) => c.address.testKey === 'resistencia_contato');
    const insulation = cells.filter((c) => c.address.testKey === 'isolacao');
    expect(contact.length).toBeGreaterThan(0);
    expect(insulation.length).toBeGreaterThan(0);
    for (const c of [...contact, ...insulation]) expect(c.positiveOnlyText).toBe(RESISTANCE_POSITIVE_ONLY_TEXT);
    const target = contact[0]!;
    expect(parseMeasurementReadingPtBr('0', target, 'µΩ')).toBe('invalid');
    expect(parseMeasurementReadingPtBr('-1', target, 'µΩ')).toBe('invalid');
    expect(parseMeasurementReadingPtBr('0,1', target, 'µΩ')).toMatchObject({ raw: '0.1' });
    expect(refusedMeasurementKind('0', target, 'µΩ')).toBe('not_positive');
  });

  it('a measurement test with an absolute criterion in Ω refuses zero; a relative one keeps its own message (as today)', () => {
    const { block: cta } = ctaRows();
    const tests = evaluateSheetMeasurements(cta, ctaDefinition());
    const absolute = tests.find((t) => t.testKey === 'cta_isolamento_principal')!;
    const relative = tests.find((t) => t.testKey === 'cta_resistencia_contato')!;
    const absoluteCells = absolute.rows.flatMap((row) => row.cells).filter((c) => c.kind === 'number' && c.fixed === null);
    const relativeCells = relative.rows.flatMap((row) => row.cells).filter((c) => c.kind === 'number' && c.fixed === null);
    expect(absoluteCells.length).toBeGreaterThan(0);
    for (const c of absoluteCells) expect(c.positiveOnlyText).toBe(RESISTANCE_POSITIVE_ONLY_TEXT);
    for (const c of relativeCells) expect(c.positiveOnlyText).toMatch(/^Informe um valor maior que zero: o critério compara com o /);
    expect(refusedMeasurementKind('0', absoluteCells[0]!, 'MΩ')).toBe('not_positive');
    expect(refusedMeasurementKind('0', relativeCells[0]!, 'µΩ')).toBe('not_positive');
  });

  it('a stored zero is not judged again: it keeps the verdict it had (Aprovado under a maximum)', () => {
    const stored = block({ test: { resistencia_contato: { cells: { '0': { '0': cell(measured('0', 'µΩ')) } } } } as BlockRow['sheet']['test'] });
    const contact = evaluatedCells(evaluateSheetReadings(stored, SEC)).find((c) => c.address.testKey === 'resistencia_contato' && c.address.row === 0)!;
    expect(contact.verdict).toBe('within');
  });
});

describe('27.2-UNIT the remark cites the criterion in the unit typed (screen only)', () => {
  it('a GΩ reading out of "> 400 MΩ" says "> 0,4 GΩ"; a NETA "≥ 5.000 MΩ" reads "≥ 5 GΩ"', () => {
    expect(criterionTextInUnit({ operator: '>', value: 400, unit: 'MΩ' }, 'GΩ')).toBe('>0,4 GΩ');
    expect(criterionTextInUnit({ operator: '>', value: 400, unit: 'MΩ' }, 'MΩ')).toBe('>400 MΩ');
    expect(criterionTextInUnit({ operator: '>=', value: 5000, unit: 'MΩ', text: '≥ 5.000 MΩ' }, 'GΩ')).toBe('≥ 5 GΩ');
    expect(criterionTextInUnit({ operator: '±', value: 0.5, unit: '%' }, 'GΩ')).toBe('±0,5 %');
    expect(criterionTextInUnit({ operator: '<', value: 250, unit: 'µΩ' }, null)).toBe('<250 µΩ');
  });

  it('the seeded insulation cell typed in GΩ cites the criterion in GΩ', () => {
    const OP = '019966b0-0272-7000-8000-000000000003';
    const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
    const base = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId).blocks.find((b) => b.block_type === 'chave_seccionadora')!;
    const sheet = { ...base.sheet, test: { ...base.sheet.test, isolacao: { ...base.sheet.test.isolacao, cells: { '0': { '0': { value: measured('0.129', 'GΩ'), source_suggestion_id: null, op_id: OP } } } } } } as BlockRow['sheet'];
    const out = evaluatedCells(evaluateSheetReadings({ ...base, sheet }, SEC)).find((c) => c.address.testKey === 'isolacao' && c.address.row === 0)!;
    expect(out.verdict).toBe('out');
    expect(out.helperText).toBe('Abaixo do aceitável (>0,4 GΩ)');
  });
});

describe('27.2-UNIT CNPJ check digits', () => {
  it('valid numbers pass; wrong check digits, a repeated digit and a wrong length are refused', () => {
    for (const valid of ['11.222.333/0001-81', '11222333000181', '12.345.678/0001-95']) expect(isValidCnpjFormat(valid), valid).toBe(true);
    for (const invalid of ['11.111.111/1111-11', '00.000.000/0000-00', '11.222.333/0001-82', '12.345.678/0001-90', '00.000.000/0001-00', '123']) expect(isValidCnpjFormat(invalid), invalid).toBe(false);
    expect(cnpjInputRefusal('11.111.111/1111-11')).toBe('bad_format');
    expect(cnpjInputRefusal('11.222.333/0001-81')).toBeNull();
    expect(cnpjInputRefusal('')).toBeNull();
  });
});

describe('27.2-UNIT ART/TRT: a number that is not numeric is remarked, never refused', () => {
  it('digits with the councils\' separators are numeric; letters are remarked', () => {
    for (const ok of ['2620262602583', '28027230201234567', '123.456/2026-0', '2620 2626 0258']) expect(artTrtNotNumeric(ok), ok).toBe(false);
    for (const odd of ['abc', 'ART 123', '123-', '12a3']) expect(artTrtNotNumeric(odd), odd).toBe(true);
    expect(artTrtNotNumeric(null)).toBe(false);
    expect(artTrtNotNumeric('  ')).toBe(false);
    expect(artTrtRemarkText('ART', 'abc')).toBe('Confira o número da ART: ele costuma ter só algarismos');
    expect(artTrtRemarkText('ART', '2620262602583')).toBeNull();
    expect(artTrtRowText('TRT', ' abc ')).toBe('Número da TRT com letras ou símbolos: abc');
  });
});

describe('27.2-UNIT the two pre-issue rows, listed in the Gerar dialog and never blocking', () => {
  const state = () => replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds });

  it('a temperature of 999 °C and an ART "abc": one row each, pending, listed by name; no blocking row of theirs', () => {
    const s = new Map(state());
    const cabine = s.get(entityKey('location', CABINE)) as Extract<LocationRow, { kind: 'cabine' }>;
    s.set(entityKey('location', CABINE), { ...cabine, env: { ...cabine.env, temperature_c: measured('999', '°C') } });
    const relatorio = s.get(entityKey('relatorio', portoSeguroSmall.relatorioId)) as RelatorioRow;
    s.set(entityKey('relatorio', relatorio.id), { ...relatorio, setup: { ...relatorio.setup, art_trt_number: 'abc' } });
    const rows = preIssue(buildSnapshot(s, portoSeguroSmall.relatorioId));
    const temperature = rows.filter((row) => row.kind === 'temperature_unusual');
    const art = rows.filter((row) => row.kind === 'art_trt_not_numeric');
    expect(temperature).toEqual([{ id: `temperature_unusual:${CABINE}`, row: 'section_9', severity: 'pending', text: 'Cabine de Testes: temperatura de 999 °C, fora do usual (-10 a 60 °C)', kind: 'temperature_unusual' }]);
    expect(art).toEqual([{ id: 'art_trt_not_numeric', row: 'controle', severity: 'pending', text: 'Número da ART/TRT com letras ou símbolos: abc', kind: 'art_trt_not_numeric' }]);
    const precheck = exportPrecheck(rows);
    expect(precheck.explicit.map((row) => row.kind)).toEqual(expect.arrayContaining(['temperature_unusual', 'art_trt_not_numeric']));
    expect(precheck.blocking.map((row) => row.kind)).not.toContain('temperature_unusual');
    expect(precheck.blocking.map((row) => row.kind)).not.toContain('art_trt_not_numeric');
  });

  it('a usual temperature and a numeric ART raise neither row', () => {
    const rows = preIssue(buildSnapshot(state(), portoSeguroSmall.relatorioId));
    expect(rows.filter((row) => row.kind === 'temperature_unusual' || row.kind === 'art_trt_not_numeric')).toEqual([]);
  });
});
