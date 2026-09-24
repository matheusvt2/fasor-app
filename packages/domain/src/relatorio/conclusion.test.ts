import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import {
  composeConclusion,
  conclusionSuggestionText,
  conclusionTextForPrint,
  conclusionTextState,
  observationRequired,
  restrictionWarning,
  suggestConclusionPair,
} from './conclusion.ts';
import { evaluateSheetReadings } from './readings.ts';

const ID = '019966b0-0051-7000-8000-000000000001';
const OP = '019966b0-0051-7000-8000-000000000002';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => cell({ raw, unit, state: 'measured' });
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');

function block(sheet: Partial<Sheet> = {}, over: Partial<BlockRow> = {}): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
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

const allC = (): Sheet['checklist'] => Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell('C') }]));
const within = (): Sheet['test'] => ({
  isolacao: { cells: Object.fromEntries([0, 1, 2, 3, 4, 5].map((row) => [String(row), { '0': measured('147', 'GΩ') }])) },
  resistencia_contato: { cells: Object.fromEntries([0, 1, 2].map((row) => [String(row), { '0': measured('120', 'µΩ') }])) },
});
const plate: Sheet['nameplate'] = {
  fabricacao: cell('Celtta'),
  tensao_de_placa: cell('15'),
  corrente_nominal: measured('630', 'A'),
};
const contatosIndex = SEC.checklist!.findIndex((item) => item.key === 'contatos') + 1;

describe('5.8-UNIT suggestConclusionPair', () => {
  it('all C/NA and all within: Aprovado · Sem restrições', () => {
    const pair = suggestConclusionPair(block({ checklist: allC(), test: within() }));
    expect(pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(conclusionSuggestionText(pair!)).toBe('Aprovado · Sem restrições?');
  });

  it('any NC row or any out-of-criterion reading: Aprovado · Com restrições; never Reprovado', () => {
    const nc = block({ checklist: { ...allC(), contatos: { result: cell('NC') } }, test: within() });
    expect(suggestConclusionPair(nc)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('330', 'MΩ') };
    const out = block({ checklist: allC(), test });
    expect(suggestConclusionPair(out)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(conclusionSuggestionText(suggestConclusionPair(out)!)).toBe('Aprovado · Com restrições?');
  });

  it('none once any segment is set, when not tested, or while nothing is measured or answered', () => {
    expect(suggestConclusionPair(block({ checklist: allC(), conclusion: { restriction: cell('sem_restricoes') } }))).toBeNull();
    expect(suggestConclusionPair(block({ checklist: allC(), conclusion: { result: cell('reprovado') } }))).toBeNull();
    expect(suggestConclusionPair(block({ checklist: allC() }, { not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-06T12:00:00.000Z', by: ID } }))).toBeNull();
    expect(suggestConclusionPair(block())).toBeNull();
  });
});

describe('5.8-UNIT composeConclusion', () => {
  it('names the identity, the out-of-criterion reading with its criterion, the NC item with its observation and the recommendation', () => {
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('330', 'MΩ') };
    const b = block({
      nameplate: plate,
      checklist: { ...allC(), contatos: { result: cell('NC'), observation: cell('contatos com desgaste') } },
      test,
      conclusion: { result: cell('aprovado'), restriction: cell('com_restricoes') },
    });
    const composed = composeConclusion(b, SEC, 'SEC-C05');
    expect(composed.text).toBe(
      `A seccionadora SEC-C05 (Celtta, 15 kV, 630 A) apresentou resistência de isolação mínima de 330 MΩ em T1–T2 (critério: >400 MΩ, aceitável na ficha) e contatos com desgaste (item ${contatosIndex}, NC). Recomenda-se a correção dos pontos indicados antes da próxima manutenção.`,
    );
    expect(composed.criteriaLine).toBe(`R_iso T1–T2 330 MΩ · critério >400 MΩ · R_cont T1-T2–Fase A 120 µΩ · critério <250 µΩ · item ${contatosIndex} NC`);
    expect(composed.basis).toMatch(/^[0-9a-f]{8}$/);
  });

  it('with everything within and conform: the two fixed clauses, no recommendation, parts dropped when missing', () => {
    const b = block({ checklist: allC(), test: within(), conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') } });
    expect(composeConclusion(b, SEC, 'SEC-C05').text).toBe(
      'A seccionadora SEC-C05 apresentou valores medidos dentro dos critérios de aceitação e todos os itens verificados conformes.',
    );
    const cabos = getDefinition('v1', 'cabine_primaria', 'cabos_entrada');
    const c = block({}, { block_type: 'cabos_entrada', config: defaultBlockConfig('v1', 'cabos_entrada') });
    expect(composeConclusion(c, cabos, 'CB-ENT').text).toMatch(/^Os cabos de entrada CB-ENT não apresentaram /);
  });

  it('E5-Q4 states only what exists: no judged reading, no C row, or neither, plural nouns included', () => {
    const notMeasured = (): Sheet['test'] => ({
      isolacao: { cells: Object.fromEntries([0, 1, 2, 3, 4, 5].map((row) => [String(row), { '0': cell({ raw: '', unit: 'GΩ', state: 'not_measured' }) }])) },
    });
    const allNA = (): Sheet['checklist'] => Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell('NA') }]));
    // Every capture Não medido and the checklist all NA: neither claim.
    const neither = composeConclusion(block({ checklist: allNA(), test: notMeasured() }), SEC, 'SEC-C05').text;
    expect(neither).toBe('A seccionadora SEC-C05 não apresentou valores medidos nem itens verificados registrados.');
    expect(neither).not.toContain('dentro dos critérios');
    expect(neither).not.toContain('conformes');
    // Readings judged, checklist all NA.
    expect(composeConclusion(block({ checklist: allNA(), test: within() }), SEC, 'SEC-C05').text).toBe(
      'A seccionadora SEC-C05 apresentou valores medidos dentro dos critérios de aceitação, sem itens verificados registrados.',
    );
    // A C row, nothing measured.
    expect(composeConclusion(block({ checklist: allC(), test: notMeasured() }), SEC, 'SEC-C05').text).toBe(
      'A seccionadora SEC-C05 apresentou todos os itens verificados conformes, sem valores medidos registrados.',
    );
    // An NC row and an out reading always count as present.
    const out = notMeasured();
    out.isolacao!.cells['0'] = { '0': measured('330', 'MΩ') };
    const nc = composeConclusion(block({ checklist: { ...allNA(), contatos: { result: cell('NC') } }, test: out }), SEC, 'SEC-C05').text;
    expect(nc).toContain('apresentou resistência de isolação mínima de 330 MΩ');
    expect(nc).toContain(`(item ${contatosIndex}, NC).`);
    // Every test sub-block disabled: its retained readings are ignored.
    const config = defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }) as { sub_blocks: Record<string, { enabled: boolean }> };
    const noTests = block(
      { checklist: allC(), test: within() },
      { config: { ...config, sub_blocks: { ...config.sub_blocks, isolacao: { enabled: false }, resistencia_contato: { enabled: false } } } },
    );
    expect(composeConclusion(noTests, SEC, 'SEC-C05').text).toBe(
      'A seccionadora SEC-C05 apresentou todos os itens verificados conformes, sem valores medidos registrados.',
    );
    // Plural nouns.
    const cabos = getDefinition('v1', 'cabine_primaria', 'cabos_entrada');
    const c = block({}, { block_type: 'cabos_entrada', config: defaultBlockConfig('v1', 'cabos_entrada') });
    expect(composeConclusion(c, cabos, 'CB-ENT').text).toBe('Os cabos de entrada CB-ENT não apresentaram valores medidos nem itens verificados registrados.');
    const cabosC = block(
      { checklist: Object.fromEntries(cabos.checklist!.map((item) => [item.key, { result: cell('C') }])) },
      { block_type: 'cabos_entrada', config: defaultBlockConfig('v1', 'cabos_entrada') },
    );
    expect(composeConclusion(cabosC, cabos, 'CB-ENT').text).toBe(
      'Os cabos de entrada CB-ENT apresentaram todos os itens verificados conformes, sem valores medidos registrados.',
    );
  });

  it('E5-Q4 a TTR capture measured with no VAL CALCULADO is a measurement, never judged within the criteria', () => {
    const tp = getDefinition('v1', 'cabine_primaria', 'tp');
    const b = block(
      { test: { relacao_transformacao: { cells: { '0': { '3': measured('120.1', null) } } } } },
      { block_type: 'tp', config: defaultBlockConfig('v1', 'tp') },
    );
    const ratio = evaluateSheetReadings(b, tp).find((t) => t.testKey === 'relacao_transformacao')!.tables[0]!.rows[0]!;
    expect(ratio.calculated).toBeNull();
    const text = composeConclusion(b, tp, 'TP-1').text;
    expect(text).toBe('O TP TP-1 apresentou valores medidos sem comparação com o critério de aceitação, sem itens verificados registrados.');
    const withC = block(
      { checklist: Object.fromEntries(tp.checklist!.map((item) => [item.key, { result: cell('C') }])), test: b.sheet.test },
      { block_type: 'tp', config: defaultBlockConfig('v1', 'tp') },
    );
    expect(composeConclusion(withC, tp, 'TP-1').text).toBe(
      'O TP TP-1 apresentou valores medidos sem comparação com o critério de aceitação e todos os itens verificados conformes.',
    );
  });

  it('E5-Q4 the basis recomposes when a C row or a judged reading appears', () => {
    const allNA = (): Sheet['checklist'] => Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell('NA') }]));
    const before = composeConclusion(block({ checklist: allNA() }), SEC, 'SEC-C05').basis;
    const withC = composeConclusion(block({ checklist: { ...allNA(), contatos: { result: cell('C') } } }), SEC, 'SEC-C05').basis;
    const withReading = composeConclusion(block({ checklist: allNA(), test: within() }), SEC, 'SEC-C05').basis;
    expect(withC).not.toBe(before);
    expect(withReading).not.toBe(before);
  });

  it('the same evaluation: an out reading drives the field helper, the Com restrições suggestion and the criteria line', () => {
    const test = within();
    test.resistencia_contato!.cells['2'] = { '0': measured('300', 'µΩ') };
    const b = block({ checklist: allC(), test });
    const cellEval = evaluateSheetReadings(b, SEC)[1]!.tables[0]!.rows[2]!.cells[0]!;
    expect(cellEval.helperText).toBe('Acima do aceitável (<250 µΩ)');
    expect(suggestConclusionPair(b)?.restriction).toBe('com_restricoes');
    const composed = composeConclusion(b, SEC, 'SEC-C05');
    expect(composed.criteriaItems).toContain('R_cont T5-T6–Fase C 300 µΩ · critério <250 µΩ');
    expect(composed.text).toContain('resistência de contato máxima de 300 µΩ em T5-T6–Fase C (critério: <250 µΩ, aceitável na ficha)');
  });
});

describe('5.8-UNIT the text lifecycle', () => {
  const pair = { result: cell('aprovado'), restriction: cell('sem_restricoes') };

  it('unconfirmed recomposes; confirmed keeps its basis; a later change is stale; only confirmed or edited prints', () => {
    const b = block({ checklist: allC(), test: within(), conclusion: pair });
    const composed = composeConclusion(b, SEC, 'SEC-C05');
    expect(conclusionTextState(b, composed)).toBe('unconfirmed');
    expect(conclusionTextForPrint(b)).toBeNull();

    const confirmed = block({ checklist: allC(), test: within(), conclusion: { ...pair, text: cell(composed.text), text_status: cell('confirmed'), text_basis: cell(composed.basis) } });
    expect(conclusionTextState(confirmed, composeConclusion(confirmed, SEC, 'SEC-C05'))).toBe('confirmed');
    expect(conclusionTextForPrint(confirmed)).toBe(composed.text);

    const changed = within();
    changed.isolacao!.cells['1'] = { '0': measured('148', 'GΩ') };
    const later = { ...confirmed, sheet: { ...confirmed.sheet, test: changed } };
    const recomposed = composeConclusion(later, SEC, 'SEC-C05');
    expect(recomposed.basis).not.toBe(composed.basis);
    expect(conclusionTextState(later, recomposed)).toBe('stale');
    expect(conclusionTextForPrint(later)).toBe(composed.text);

    const edited = block({ conclusion: { ...pair, text: cell('meu texto'), text_status: cell('edited'), text_basis: cell(composeConclusion(block({ conclusion: pair }), SEC, '').basis) } });
    expect(conclusionTextState(edited, composeConclusion(edited, SEC, ''))).toBe('edited');
    expect(conclusionTextForPrint(edited)).toBe('meu texto');
  });

  it('Com restrições requires the observation; Sem restrições with an NC row warns', () => {
    expect(observationRequired(block({ conclusion: { restriction: cell('com_restricoes') } }))).toBe(true);
    expect(observationRequired(block({ conclusion: { restriction: cell('sem_restricoes') } }))).toBe(false);
    const nc = { ...allC(), contatos: { result: cell('NC') } };
    expect(restrictionWarning(block({ checklist: nc, conclusion: { restriction: cell('sem_restricoes') } }))).toBe('Há itens não conformes');
    expect(restrictionWarning(block({ checklist: allC(), conclusion: { restriction: cell('sem_restricoes') } }))).toBeNull();
    expect(restrictionWarning(block({ checklist: nc, conclusion: { restriction: cell('com_restricoes') } }))).toBeNull();
  });
});
