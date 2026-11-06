import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, readPath, type EntityState } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { NOT_APPLICABLE_NUMBER, NOT_APPLICABLE_TEXT } from '../parse/pt-br-number.ts';
import { invertBatch } from '../ops/outbox.ts';
import { blockFieldPath, sheetConclusionPath, sheetObservationsPath, sheetTestPath } from '../ops/path.ts';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { idSequence, opFactory, T1, TEST_RELATORIO } from '../test-support.ts';
import { emptySheet, type BlockRow, type Cell, type JsonValue, type Sheet } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import {
  composeConclusion,
  conclusionAdjusted,
  conclusionBasisMatches,
  conclusionFloor,
  conclusionFloorReasonText,
  conclusionPairComplete,
  conclusionSuggestion,
  conclusionSuggestionText,
  conclusionTextForPrint,
  conclusionTextOnConclude,
  conclusionTextState,
  effectiveConclusionPair,
  isLooserThanFloor,
  observationRequired,
  suggestedSheetObservation,
} from './conclusion.ts';
import { measurementInstrumentHeaderOf } from './instrument-pick.ts';
import { blockOf, choice, CTA_BLOCK, CTA_TAG, ctaDefinition, ctaFilledWrites, ctaState, E1, E2, E3, E5, num, writeSheet } from './measurement-test-support.ts';
import { preIssue } from './pre-issue.ts';
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

const floorPair = (b: BlockRow) => conclusionFloor(b)?.pair ?? null;

describe('22.4-UNIT conclusionFloor and the suggestion row (amends 5.8 suggestConclusionPair)', () => {
  it('all C/NA and all within: Aprovado · Sem restrições, no reason, nothing disabled', () => {
    const b = block({ checklist: allC(), test: within() });
    expect(conclusionFloor(b)).toEqual({ pair: { result: 'aprovado', restriction: 'sem_restricoes' }, reasons: [] });
    expect(conclusionSuggestionText(conclusionSuggestion(b)!)).toBe('Aprovado · Sem restrições?');
    expect(conclusionFloorReasonText(b)).toBeNull();
    for (const value of ['aprovado', 'reprovado', 'sem_restricoes', 'com_restricoes'] as const) expect(isLooserThanFloor(b, value)).toBe(false);
  });

  it('e21g D6: a v11 transformer whose ratio waits for its group gives no floor; a restriction or a failure still sets one', () => {
    const TRAFO = getDefinition('v11', 'cabine_primaria', 'transformador_forca');
    const trafo = (ligacao: string | null, over: { nc?: boolean; captures?: string } = {}) => {
      const checklist = Object.fromEntries(TRAFO.checklist!.map((item, i) => [item.key, { result: cell(over.nc === true && i === 0 ? 'NC' : 'C'), ...(over.nc === true && i === 0 ? { observation: cell('Obs') } : {}) }]));
      const raw = over.captures ?? '36.3';
      const test: Sheet['test'] = { relacao_transformacao: { cells: { '0': { '0': measured('13.8', 'kV'), '1': measured('380', 'V'), '3': measured(raw, null), '4': measured(raw, null), '5': measured(raw, null) } } } };
      return block(
        { checklist, test, nameplate: ligacao === null ? {} : { ligacao_secundaria: cell(ligacao) } },
        { block_type: 'transformador_forca', seed_version: 'v11', config: defaultBlockConfig('v11', 'transformador_forca') },
      );
    };
    for (const ligacao of [null, '', 'Y']) expect(conclusionFloor(trafo(ligacao)), String(ligacao)).toBeNull();
    // An NC row's own observation belongs to the NC: one reason.
    expect(conclusionFloor(trafo(null, { nc: true }))).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['nc'] });
    expect(floorPair(trafo('Yyn0'))).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(conclusionFloor(trafo('Yyn0', { captures: '50' }))).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['ratio'] });
    // The nameplate sub-block off: the group cannot be filled, so it never withholds Sem restrições.
    const config = defaultBlockConfig('v11', 'transformador_forca') as { sub_blocks: Record<string, { enabled: boolean }> };
    const plateOff = { ...trafo(null), config: { ...config, sub_blocks: { ...config.sub_blocks, nameplate: { enabled: false } } } as BlockRow['config'] };
    expect(floorPair(plateOff)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    // The group missing: the pair stays required (no floor fills it).
    expect(effectiveConclusionPair(trafo(null))).toEqual({ result: null, restriction: null });
  });

  it('an NC row, a sheet observation or a row observation: Aprovado · Com restrições; Sem disabled, Reprovado choosable', () => {
    const nc = block({ checklist: { ...allC(), contatos: { result: cell('NC') } }, test: within() });
    expect(conclusionFloor(nc)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['nc'] });
    expect(isLooserThanFloor(nc, 'sem_restricoes')).toBe(true);
    expect(isLooserThanFloor(nc, 'reprovado')).toBe(false);
    expect(isLooserThanFloor(nc, 'aprovado')).toBe(false);
    expect(conclusionFloorReasonText(nc)).toBe('A ficha exige no mínimo Aprovado · Com restrições: item não conforme.');
    const sheetObs = block({ checklist: allC(), test: within(), observations: cell('Porta empenada') });
    expect(conclusionFloor(sheetObs)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['observation'] });
    const rowObs = block({ checklist: { ...allC(), contatos: { result: cell('C'), observation: cell('Leve oxidação') } }, test: within() });
    expect(floorPair(rowObs)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    // A blank observation is no text.
    expect(floorPair(block({ checklist: allC(), test: within(), observations: cell('   ') }))).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
  });

  it('an insulation reading of 300 MΩ against >400 MΩ, or a contact reading out: Reprovado · Com restrições; Aprovado and Sem disabled', () => {
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('300', 'MΩ') };
    const out = block({ checklist: allC(), test });
    expect(conclusionFloor(out)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['reading'] });
    expect(conclusionSuggestionText(conclusionSuggestion(out)!)).toBe('Reprovado · Com restrições?');
    expect(isLooserThanFloor(out, 'aprovado')).toBe(true);
    expect(isLooserThanFloor(out, 'sem_restricoes')).toBe(true);
    expect(conclusionFloorReasonText(out)).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
    const contact = within();
    contact.resistencia_contato!.cells['2'] = { '0': measured('300', 'µΩ') };
    const both = block({ checklist: { ...allC(), contatos: { result: cell('NC') } }, test: contact });
    expect(conclusionFloor(both)?.reasons).toEqual(['reading', 'nc']);
    expect(conclusionFloorReasonText(both)).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério e item não conforme.');
  });

  it('a v5 sheet gets the same floor as a v11 one: the rule is the kernel\'s, not the seed\'s', () => {
    const v5 = (sheet: Partial<Sheet>) =>
      block(sheet, { seed_version: 'v5', config: defaultBlockConfig('v5', 'chave_seccionadora', { subtype: 'manual' }) });
    const SEC5 = getDefinition('v5', 'cabine_primaria', 'chave_seccionadora');
    const allC5 = Object.fromEntries(SEC5.checklist!.map((item) => [item.key, { result: cell('C') }]));
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('300', 'MΩ') };
    expect(floorPair(v5({ checklist: allC5, test: within() }))).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(floorPair(v5({ checklist: allC5, test }))).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(floorPair(v5({ checklist: { ...allC5, contatos: { result: cell('NC') } }, test: within() }))).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
  });

  it('no suggestion once any segment is set, when not tested, or while nothing is measured or answered', () => {
    expect(conclusionSuggestion(block({ checklist: allC(), conclusion: { restriction: cell('sem_restricoes') } }))).toBeNull();
    expect(conclusionSuggestion(block({ checklist: allC(), conclusion: { result: cell('reprovado') } }))).toBeNull();
    expect(conclusionSuggestion(block({ checklist: allC() }, { not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-06T12:00:00.000Z', by: ID } }))).toBeNull();
    expect(conclusionFloor(block({ checklist: allC() }, { not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-06T12:00:00.000Z', by: ID } }))).toBeNull();
    expect(conclusionSuggestion(block())).toBeNull();
    expect(conclusionFloor(block())).toBeNull();
  });
});

describe('22.4-UNIT the effective pair and the adjusted note', () => {
  const sem = { result: cell('aprovado'), restriction: cell('sem_restricoes') };

  it('per dimension the stricter of the floor and the stored pair; an unset half reads the floor', () => {
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('300', 'MΩ') };
    expect(effectiveConclusionPair(block({ checklist: allC(), test, conclusion: sem }))).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    // A stored stricter pair stands over a looser floor.
    expect(effectiveConclusionPair(block({ checklist: allC(), test: within(), conclusion: { result: cell('reprovado'), restriction: cell('com_restricoes') } }))).toEqual({
      result: 'reprovado',
      restriction: 'com_restricoes',
    });
    expect(effectiveConclusionPair(block({ checklist: allC(), test: within() }))).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(effectiveConclusionPair(block({ checklist: allC(), test: within(), conclusion: { result: cell('reprovado') } }))).toEqual({ result: 'reprovado', restriction: 'sem_restricoes' });
    expect(effectiveConclusionPair(block())).toEqual({ result: null, restriction: null });
  });

  it('a sheet concluded Aprovado · Sem restrições before a reading was corrected out reads Reprovado and is adjusted', () => {
    expect(conclusionAdjusted(block({ checklist: allC(), test: within(), conclusion: sem }))).toBe(false);
    const test = within();
    test.isolacao!.cells['1'] = { '0': measured('0.3', 'GΩ') };
    const later = block({ checklist: allC(), test, conclusion: sem });
    expect(conclusionAdjusted(later)).toBe(true);
    expect(effectiveConclusionPair(later)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    // Its composed text recommends the correction (the effective pair), and the stored text is stale.
    expect(composeConclusion(later, SEC, 'SEC-C05').text).toContain('Recomenda-se a correção dos pontos indicados antes da próxima manutenção.');
    // An incomplete stored pair is never "adjusted": the floor only fills it.
    expect(conclusionAdjusted(block({ checklist: allC(), test, conclusion: { result: cell('aprovado') } }))).toBe(false);
  });

  it('observation required by the effective restriction, the floor\'s included', () => {
    expect(observationRequired(block({ checklist: { ...allC(), contatos: { result: cell('NC') } }, test: within() }))).toBe(true);
    expect(observationRequired(block({ checklist: allC(), test: within() }))).toBe(false);
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

  it('16.4: the identity skips an "N.A" nameplate number (no "N.A" in the paragraph)', () => {
    const b = block({
      nameplate: { ...plate, corrente_nominal: cell(NOT_APPLICABLE_NUMBER) },
      checklist: allC(),
      test: within(),
      conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') },
    });
    const text = composeConclusion(b, SEC, 'SEC-C05').text;
    expect(text).toMatch(/^A seccionadora SEC-C05 \(Celtta, 15 kV\) apresentou /);
    expect(text).not.toContain(NOT_APPLICABLE_TEXT);
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

  it('the same evaluation: an out reading drives the field helper, the floor and the criteria line', () => {
    const test = within();
    test.resistencia_contato!.cells['2'] = { '0': measured('300', 'µΩ') };
    const b = block({ checklist: allC(), test });
    const cellEval = evaluateSheetReadings(b, SEC)[1]!.tables[0]!.rows[2]!.cells[0]!;
    expect(cellEval.helperText).toBe('Acima do aceitável (<250 µΩ)');
    expect(conclusionSuggestion(b)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
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

    // p020 P-3: a reading that moves the basis but not the paragraph keeps the text confirmed.
    const within148 = within();
    within148.isolacao!.cells['1'] = { '0': measured('148', 'GΩ') };
    const same = { ...confirmed, sheet: { ...confirmed.sheet, test: within148 } };
    const sameText = composeConclusion(same, SEC, 'SEC-C05');
    expect(sameText.basis).not.toBe(composed.basis);
    expect(sameText.text).toBe(composed.text);
    expect(conclusionTextState(same, sameText)).toBe('confirmed');

    // A reading that changes the paragraph (now out of criterion) makes it stale.
    const changed = within();
    changed.isolacao!.cells['1'] = { '0': measured('0.3', 'GΩ') };
    const later = { ...confirmed, sheet: { ...confirmed.sheet, test: changed } };
    const recomposed = composeConclusion(later, SEC, 'SEC-C05');
    expect(recomposed.basis).not.toBe(composed.basis);
    expect(recomposed.text).not.toBe(composed.text);
    expect(conclusionTextState(later, recomposed)).toBe('stale');
    expect(conclusionTextForPrint(later)).toBe(composed.text);

    const edited = block({ conclusion: { ...pair, text: cell('meu texto'), text_status: cell('edited'), text_basis: cell(composeConclusion(block({ conclusion: pair }), SEC, '').basis) } });
    expect(conclusionTextState(edited, composeConclusion(edited, SEC, ''))).toBe('edited');
    expect(conclusionTextForPrint(edited)).toBe('meu texto');
  });

  it('E5-A4: a confirmed text is not printable once its result or restriction is cleared (and, Story 22.4, no floor fills it)', () => {
    // A sheet with nothing measured or answered has no floor: a cleared half leaves the pair incomplete.
    const b = block({ conclusion: pair });
    const composed = composeConclusion(b, SEC, 'SEC-C05');
    const text = { text: cell(composed.text), text_status: cell('confirmed'), text_basis: cell(composed.basis) };
    const confirmed = block({ conclusion: { ...pair, ...text } });
    expect(conclusionPairComplete(confirmed)).toBe(true);
    expect(conclusionTextForPrint(confirmed)).toBe(composed.text);

    const noResult = block({ conclusion: { ...pair, ...text, result: cell(null) } });
    expect(conclusionPairComplete(noResult)).toBe(false);
    expect(conclusionTextForPrint(noResult)).toBeNull();

    const noRestriction = block({ conclusion: { ...pair, ...text, restriction: cell(null) } });
    expect(conclusionPairComplete(noRestriction)).toBe(false);
    expect(conclusionTextForPrint(noRestriction)).toBeNull();

    // Set again, the stored text prints again (stale or not, as before).
    const setAgain = block({ conclusion: { ...pair, ...text, restriction: cell('com_restricoes') } });
    expect(conclusionTextForPrint(setAgain)).toBe(composed.text);

    // Story 22.4: with a floor, a cleared half reads the floor's, so the pair stays complete.
    const floored = block({ checklist: allC(), test: within(), conclusion: { ...pair, ...text, result: cell(null) } });
    expect(conclusionPairComplete(floored)).toBe(true);
    expect(conclusionTextForPrint(floored)).toBe(composed.text);
  });

  it('E5-A4: the basis predicate says whether the text the engineer saw is still the composed one', () => {
    const seen = block({ checklist: allC(), test: within(), conclusion: pair });
    const basis = composeConclusion(seen, SEC, 'SEC-C05').basis;
    expect(conclusionBasisMatches(seen, SEC, 'SEC-C05', basis)).toBe(true);
    const changed = within();
    changed.isolacao!.cells['1'] = { '0': measured('148', 'GΩ') };
    const fresh = { ...seen, sheet: { ...seen.sheet, test: changed } };
    expect(conclusionBasisMatches(fresh, SEC, 'SEC-C05', basis)).toBe(false);
    expect(conclusionBasisMatches(seen, SEC, 'SEC-C06', basis)).toBe(false);
  });

  it('Com restrições requires the observation; Sem restrições over an NC row is adjusted to Com (Story 22.4: no warning)', () => {
    expect(observationRequired(block({ conclusion: { restriction: cell('com_restricoes') } }))).toBe(true);
    expect(observationRequired(block({ conclusion: { restriction: cell('sem_restricoes') } }))).toBe(false);
    const nc = { ...allC(), contatos: { result: cell('NC') } };
    const semOverNc = block({ checklist: nc, conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') } });
    expect(effectiveConclusionPair(semOverNc).restriction).toBe('com_restricoes');
    expect(observationRequired(semOverNc)).toBe(true);
    expect(conclusionAdjusted(semOverNc)).toBe(true);
  });
});

describe('12.4-UNIT suggestedSheetObservation (J-10, D-7)', () => {
  const at = (key: string) => SEC.checklist!.findIndex((item) => item.key === key) + 1;
  const [first, second, third] = SEC.checklist!;

  it('one line "Item ⟨n⟩: ⟨observação⟩" per NC item with an observation, in checklist order, n the row number', () => {
    const checklist: Sheet['checklist'] = {
      ...allC(),
      contatos: { result: cell('NC'), observation: cell(' conexão frouxa ') },
      [first!.key]: { result: cell('NC'), observation: cell('pintura descascada') },
      // An NC row with no observation yet adds no line.
      [second!.key]: { result: cell('NC') },
      // A C row with an observation is not a non-conformity.
      [third!.key]: { result: cell('C'), observation: cell('ok') },
    };
    expect(suggestedSheetObservation(block({ checklist }), SEC)).toBe(`Item 1: pintura descascada\nItem ${at('contatos')}: conexão frouxa`);
    expect(suggestedSheetObservation(block({ checklist: { ...allC(), contatos: { result: cell('NC'), observation: cell('conexão frouxa') } } }), SEC)).toBe(
      `Item ${contatosIndex}: conexão frouxa`,
    );
  });

  it('is null with the sheet observation written, no NC observation, the observation sub-block off, or the sheet not tested', () => {
    const checklist = { ...allC(), contatos: { result: cell('NC'), observation: cell('conexão frouxa') } };
    expect(suggestedSheetObservation(block({ checklist, observations: cell('Texto próprio') }), SEC)).toBeNull();
    // A cleared observation (null cell) asks again.
    expect(suggestedSheetObservation(block({ checklist, observations: cell(null) }), SEC)).toBe(`Item ${contatosIndex}: conexão frouxa`);
    expect(suggestedSheetObservation(block({ checklist: allC() }), SEC)).toBeNull();
    const config = (off: string) => {
      const base = defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }) as { sub_blocks: Record<string, { enabled: boolean }> };
      return { ...base, sub_blocks: { ...base.sub_blocks, [off]: { enabled: false } } };
    };
    expect(suggestedSheetObservation(block({ checklist }, { config: config('observations') }), SEC)).toBeNull();
    expect(suggestedSheetObservation(block({ checklist }, { not_tested: { reason: 'outro', text: 'x', at: '2026-09-06T12:00:00.000Z', by: 'u1' } }), SEC)).toBeNull();
  });
});

describe('R8CONC-UNIT conclusionTextOnConclude (review 2026-10-08 Decision 1, JRN-V1)', () => {
  const pair = { result: cell('aprovado'), restriction: cell('sem_restricoes') };
  const ready = () => block({ checklist: allC(), test: within(), nameplate: plate, conclusion: pair });

  it('an unconfirmed text with the pair set: the text and basis of one composition of the block', () => {
    const b = ready();
    const composed = composeConclusion(b, SEC, 'SEC-C05');
    expect(conclusionTextOnConclude(b, SEC, 'SEC-C05')).toEqual({ text: composed.text, basis: composed.basis });
    expect(composed.text.startsWith('A seccionadora SEC-C05 (Celtta, 15 kV, 630 A)')).toBe(true);
    // A cleared text (null cells, as an undo leaves them) asks again.
    const cleared = block({ ...b.sheet, conclusion: { ...pair, text: cell(null), text_status: cell(null), text_basis: cell(null) } });
    expect(conclusionTextOnConclude(cleared, SEC, 'SEC-C05')).toEqual({ text: composed.text, basis: composed.basis });
  });

  it('composes from the block it is given: a reading typed right before the tap is in the text and its basis', () => {
    const rendered = ready();
    const test = within();
    test.isolacao!.cells['5'] = { '0': measured('330', 'MΩ') };
    const fresh = block({ ...rendered.sheet, test });
    const folded = conclusionTextOnConclude(fresh, SEC, 'SEC-C05')!;
    expect(folded.basis).toBe(composeConclusion(fresh, SEC, 'SEC-C05').basis);
    expect(folded.basis).not.toBe(composeConclusion(rendered, SEC, 'SEC-C05').basis);
    expect(folded.text).toContain('330 MΩ');
  });

  it('null for an edited text, a confirmed text (fresh or stale), an incomplete pair, the conclusion off, or a sheet not tested', () => {
    const b = ready();
    const composed = composeConclusion(b, SEC, 'SEC-C05');
    const stored = (status: string, basis: string) => block({ ...b.sheet, conclusion: { ...pair, text: cell('x'), text_status: cell(status), text_basis: cell(basis) } });
    expect(conclusionTextOnConclude(stored('edited', composed.basis), SEC, 'SEC-C05')).toBeNull();
    expect(conclusionTextOnConclude(stored('confirmed', composed.basis), SEC, 'SEC-C05')).toBeNull();
    const staleConfirmed = stored('confirmed', 'deadbeef');
    expect(conclusionTextState(staleConfirmed, composeConclusion(staleConfirmed, SEC, 'SEC-C05'))).toBe('stale');
    expect(conclusionTextOnConclude(staleConfirmed, SEC, 'SEC-C05')).toBeNull();
    // Story 22.4: a half the floor fills is no longer missing; with no floor (nothing measured or answered) it is.
    expect(conclusionTextOnConclude(block({ ...b.sheet, conclusion: { result: cell('aprovado') } }), SEC, 'SEC-C05')).toEqual({ text: composed.text, basis: composed.basis });
    expect(conclusionTextOnConclude(block({ conclusion: { result: cell('aprovado') } }), SEC, 'SEC-C05')).toBeNull();
    expect(conclusionTextOnConclude(block({ conclusion: { restriction: cell('sem_restricoes') } }), SEC, 'SEC-C05')).toBeNull();
    // With nothing stored at all, the floor alone completes the pair: "Concluir ficha" writes both and the text.
    expect(conclusionTextOnConclude(block({ ...b.sheet, conclusion: {} }), SEC, 'SEC-C05')).toEqual({ text: composed.text, basis: composed.basis });
    // The conclusion is locked on in every equipment config (LOCKED_SUB_BLOCKS); a config that
    // enables no sub-block at all is the one way to turn it off and exercise the guard.
    expect(conclusionTextOnConclude(block(b.sheet, { config: { block_type: 'section_8', sub_blocks: {}, na_defaults: [] } }), SEC, 'SEC-C05')).toBeNull();
    expect(conclusionTextOnConclude(block(b.sheet, { not_tested: { reason: 'outro', text: 'x', at: '2026-09-06T12:00:00.000Z', by: 'u1' } }), SEC, 'SEC-C05')).toBeNull();
  });

  /** The conclude batch the sheet writes: the three text ops and `concluded_by`, one batch. */
  function concludeBatch(b: BlockRow, tag: string): Op[] {
    const f = opFactory(undefined, idSequence('019966b0-0052-7000-8000-'));
    const batch_id = '019966b0-0051-7000-8000-000000000099';
    const folded = conclusionTextOnConclude(b, SEC, tag)!;
    return [
      f.op({ path: sheetConclusionPath(b.id, 'text'), value: folded.text, batch_id }),
      f.op({ path: sheetConclusionPath(b.id, 'text_status'), value: 'confirmed', batch_id }),
      f.op({ path: sheetConclusionPath(b.id, 'text_basis'), value: folded.basis, batch_id }),
      f.op({ path: blockFieldPath(b.id, 'concluded_by'), value: { actor_id: ID, at: '2026-09-06T12:00:00.000Z' }, batch_id }),
    ];
  }

  function applyRecording(state: EntityState, ops: readonly Op[]): { state: EntityState; before: Map<string, unknown> } {
    const before = new Map<string, unknown>();
    let next = state;
    for (const op of ops) {
      before.set(op.op_id, readPath(next, op));
      next = applyOp(next, op);
    }
    return { state: next, before };
  }

  it('applied, the text reads confirmed and prints the composed text; undone, every field it wrote is back to its prior value', () => {
    const original = ready();
    const key = entityKey('block', original.id);
    const initial: EntityState = new Map([[key, original]]);
    const batch = concludeBatch(original, 'SEC-C05');
    const { state, before } = applyRecording(initial, batch);
    const concluded = state.get(key) as BlockRow;
    const composed = composeConclusion(concluded, SEC, 'SEC-C05');
    expect(conclusionTextState(concluded, composed)).toBe('confirmed');
    expect(conclusionTextForPrint(concluded)).toBe(composed.text);
    expect(concluded.concluded_by).toEqual({ actor_id: ID, at: '2026-09-06T12:00:00.000Z' });

    const inverses = invertBatch(batch, before, { newId: idSequence('019966b0-0053-7000-8000-'), now: T1 });
    const undone = inverses.reduce((s, op) => applyOp(s, op), state).get(key) as BlockRow;
    const values = (row: BlockRow) => Object.fromEntries(Object.entries(row.sheet.conclusion).map(([field, c]) => [field, c?.value ?? null]));
    // A field never set before is undone to a null cell (AD-18: the history is append-only).
    expect(values(undone)).toEqual({ ...values(original), text: null, text_status: null, text_basis: null });
    expect(undone.sheet.conclusion.result).toEqual(original.sheet.conclusion.result);
    expect(undone.sheet.conclusion.restriction).toEqual(original.sheet.conclusion.restriction);
    expect(undone.concluded_by).toEqual(original.concluded_by);
    expect(conclusionTextState(undone, composeConclusion(undone, SEC, 'SEC-C05'))).toBe('unconfirmed');
    expect(conclusionTextForPrint(undone)).toBeNull();
  });

  /** Story 22.4: the batch "Concluir ficha" writes now: the effective pair where the stored one differs, then the text ops and `concluded_by`. */
  function floorBatch(b: BlockRow, tag: string): Op[] {
    const f = opFactory(undefined, idSequence('019966b0-0054-7000-8000-'));
    const batch_id = '019966b0-0051-7000-8000-000000000098';
    const pair = effectiveConclusionPair(b);
    const text = conclusionTextOnConclude(b, SEC, tag)!;
    return [
      ...(pair.result !== null && pair.result !== b.sheet.conclusion.result?.value ? [f.op({ path: sheetConclusionPath(b.id, 'result'), value: pair.result, batch_id })] : []),
      ...(pair.restriction !== null && pair.restriction !== b.sheet.conclusion.restriction?.value
        ? [f.op({ path: sheetConclusionPath(b.id, 'restriction'), value: pair.restriction, batch_id })]
        : []),
      f.op({ path: sheetConclusionPath(b.id, 'text'), value: text.text, batch_id }),
      f.op({ path: sheetConclusionPath(b.id, 'text_status'), value: 'confirmed', batch_id }),
      f.op({ path: sheetConclusionPath(b.id, 'text_basis'), value: text.basis, batch_id }),
      f.op({ path: blockFieldPath(b.id, 'concluded_by'), value: { actor_id: ID, at: '2026-09-06T12:00:00.000Z' }, batch_id }),
    ];
  }

  it('22.4: with no pair chosen, the fold of the Concluir batch stores the floor Aprovado · Sem restrições and the confirmed text', () => {
    const original = block({ checklist: allC(), test: within(), nameplate: plate });
    const key = entityKey('block', original.id);
    const batch = floorBatch(original, 'SEC-C05');
    expect(batch.map((op) => op.path.split('/').at(-1))).toEqual(['result', 'restriction', 'text', 'text_status', 'text_basis', 'concluded_by']);
    const concluded = batch.reduce((s, op) => applyOp(s, op), new Map([[key, original]]) as EntityState).get(key) as BlockRow;
    expect(concluded.sheet.conclusion.result?.value).toBe('aprovado');
    expect(concluded.sheet.conclusion.restriction?.value).toBe('sem_restricoes');
    expect(conclusionAdjusted(concluded)).toBe(false);
    const composed = composeConclusion(concluded, SEC, 'SEC-C05');
    expect(conclusionTextState(concluded, composed)).toBe('confirmed');
    expect(conclusionTextForPrint(concluded)).toBe(composed.text);
  });

  it('22.4: a stored Aprovado · Sem restrições over an out reading: the batch writes Reprovado · Com restrições, and the text it confirms recommends the correction', () => {
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('300', 'MΩ') };
    const original = block({ checklist: allC(), test, nameplate: plate, conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') } });
    expect(conclusionAdjusted(original)).toBe(true);
    const key = entityKey('block', original.id);
    const batch = floorBatch(original, 'SEC-C05');
    const concluded = batch.reduce((s, op) => applyOp(s, op), new Map([[key, original]]) as EntityState).get(key) as BlockRow;
    expect([concluded.sheet.conclusion.result?.value, concluded.sheet.conclusion.restriction?.value]).toEqual(['reprovado', 'com_restricoes']);
    expect(conclusionAdjusted(concluded)).toBe(false);
    expect(conclusionTextForPrint(concluded)).toContain('Recomenda-se a correção dos pontos indicados antes da próxima manutenção.');
    expect(conclusionTextState(concluded, composeConclusion(concluded, SEC, 'SEC-C05'))).toBe('confirmed');
  });
});

describe('C4 (2026-10-14): the composed conclusion of a Chave de transferência automática names each test\'s worst out reading', () => {
  it('two E2 readings out: only the lowest is named, with its criterion; E1 out: its own', () => {
    const { state, f } = ctaState({ polos: '4' });
    const filled = writeSheet(state, f, ctaFilledWrites());
    // E2 at BT asks ≥ 100 MΩ: 0,05 GΩ and 0,08 GΩ are both out, the first the worst.
    const out = writeSheet(filled, f, [
      { test: E2, row: 'a_t', col: 'normal_fechada', value: num('0.05', 'GΩ') },
      { test: E2, row: 'b_t', col: 'normal_fechada', value: num('0.08', 'GΩ') },
    ]);
    const text = composeConclusion(blockOf(out), ctaDefinition(), CTA_TAG).text;
    expect(text).toContain('resistência de contato fora do critério em Polo C, Lado Emergência (63 µΩ;');
    expect(text).toContain('isolamento principal fora do critério em A-T, Normal fechada (');
    expect(text).not.toContain('B-T, Normal fechada');
  });
});

describe('p020 P-3 (v0.2.0 production check): a CTA concluded with "Concluir e avançar" is never stale with its own text', () => {
  const pathOf = (field: 'text' | 'text_status' | 'text_basis') => sheetConclusionPath(CTA_BLOCK, field);
  const registryInstrument = (id: string, code: string) =>
    ({
      id,
      kind: 'instrument',
      code,
      name: code,
      manufacturer: 'Instrum',
      model: 'M1',
      serial: `S-${code}`,
      cert_number: '1/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: true,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    }) as InstrumentRow;

  /**
   * The report's sheet: 4 polos (Polo N), MT, E1 with Polo C out on Lado Emergência, E2
   * filled, E5 "Não realizado", Aprovado with Com restrições and an observation, the plate's
   * Fabricante and Tensão nominal. Then the conclude batch as `use-ficha-actions.ts` builds it
   * (the instrument headers, the text, its status and basis, `concluded_by`), through `applyOp`.
   */
  function concluded(): { state: EntityState; f: ReturnType<typeof ctaState>['f'] } {
    const { state, f } = ctaState({ polos: '4', tensao: 'mt' });
    const writes = ctaFilledWrites().filter((write) => !('test' in write && write.test === E5));
    let s = writeSheet(state, f, [
      ...writes,
      { field: 'fabricante', value: 'WEG' },
      { field: 'tensao_nominal', value: num('380', 'V') },
      { test: E5, key: 'metodo', value: choice('nao_realizado') },
    ]);
    for (const [field, value] of [
      ['result', 'aprovado'],
      ['restriction', 'com_restricoes'],
    ] as const)
      s = applyOp(s, f.op({ path: sheetConclusionPath(CTA_BLOCK, field), value }));
    s = applyOp(s, f.op({ path: sheetObservationsPath(CTA_BLOCK), value: 'Polo C da emergência acima do critério.' }));
    const fresh = blockOf(s);
    const text = conclusionTextOnConclude(fresh, ctaDefinition(), CTA_TAG)!;
    expect(text).not.toBeNull();
    const instruments = [registryInstrument('019966b0-0204-7000-8000-000000000001', 'MI-01'), registryInstrument('019966b0-0204-7000-8000-000000000002', 'MG-01')];
    const batch_id = '019966b0-0204-7000-8000-0000000000ff';
    const ops = [
      f.op({ path: sheetTestPath(CTA_BLOCK, E1, 'instrument'), value: measurementInstrumentHeaderOf(instruments[0]!) as unknown as JsonValue, batch_id }),
      f.op({ path: sheetTestPath(CTA_BLOCK, E2, 'instrument'), value: measurementInstrumentHeaderOf(instruments[1]!) as unknown as JsonValue, batch_id }),
      f.op({ path: sheetTestPath(CTA_BLOCK, E3, 'instrument'), value: measurementInstrumentHeaderOf(instruments[1]!) as unknown as JsonValue, batch_id }),
      f.op({ path: pathOf('text'), value: text.text, meta: { composed: true }, batch_id }),
      f.op({ path: pathOf('text_status'), value: 'confirmed', batch_id }),
      f.op({ path: pathOf('text_basis'), value: text.basis, batch_id }),
      f.op({ path: blockFieldPath(CTA_BLOCK, 'concluded_by'), value: { actor_id: ID, at: '2026-09-06T12:00:00.000Z' }, batch_id }),
    ];
    for (const op of ops) s = applyOp(s, op);
    return { state: s, f };
  }

  /** The block as the server pull stores it: a JSON round trip. */
  const pulled = (state: EntityState): EntityState => {
    const key = entityKey('block', CTA_BLOCK);
    return new Map(state).set(key, JSON.parse(JSON.stringify(state.get(key))) as BlockRow);
  };
  const staleRows = (state: EntityState) => preIssue(buildSnapshot(state, TEST_RELATORIO)).filter((row) => row.kind === 'conclusion_stale');

  it('the conclude batch, then the pull: confirmed, no stale row, the stored text prints', () => {
    const { state } = concluded();
    for (const s of [state, pulled(state)]) {
      const b = blockOf(s);
      const composed = composeConclusion(b, ctaDefinition(), CTA_TAG);
      expect(b.sheet.conclusion.text_basis?.value).toBe(composed.basis);
      expect(conclusionTextState(b, composed)).toBe('confirmed');
      expect(conclusionTextForPrint(b)).toBe(composed.text);
      expect(staleRows(s)).toEqual([]);
    }
  });

  it('a value the text does not show moves the basis, not the state: no "Substituir" with the same text', () => {
    const { state, f } = concluded();
    // An E2 reading still within its criterion: the paragraph does not change, the basis does.
    const moved = writeSheet(state, f, [{ test: E2, row: 'a_t', col: 'normal_fechada', value: num('13', 'GΩ') }]);
    const b = blockOf(moved);
    const composed = composeConclusion(b, ctaDefinition(), CTA_TAG);
    expect(composed.basis).not.toBe(b.sheet.conclusion.text_basis?.value);
    expect(composed.text).toBe(b.sheet.conclusion.text?.value);
    expect(conclusionTextState(b, composed)).toBe('confirmed');
    expect(staleRows(moved)).toEqual([]);
  });

  it('a value changed after the conclude that changes the text: stale, as before', () => {
    const { state, f } = concluded();
    const changed = writeSheet(state, f, [{ test: E1, row: 'polo_c', col: 'lado_emergencia', value: num('70', 'µΩ') }]);
    const b = blockOf(changed);
    const composed = composeConclusion(b, ctaDefinition(), CTA_TAG);
    expect(composed.text).not.toBe(b.sheet.conclusion.text?.value);
    expect(conclusionTextState(b, composed)).toBe('stale');
    expect(staleRows(changed).map((row) => row.text)).toEqual([`Texto de conclusão desatualizado: ${CTA_TAG}`]);
  });

  it('the basis of a sheet of the eight keeps its bytes (a pinned seccionadora basis)', () => {
    const b = block({ checklist: allC(), test: within(), nameplate: plate, conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') } });
    expect(composeConclusion(b, SEC, 'SEC-C05').basis).toBe('230b4355');
  });
});

describe('17.5-UNIT a ratio row INSATISFATÓRIO feeds the floor and the composed conclusion (F42, E15-A2; Story 22.4)', () => {
  const TP = getDefinition('v1', 'cabine_primaria', 'tp');
  const tpAllC = (): Sheet['checklist'] => Object.fromEntries(TP.checklist!.map((item) => [item.key, { result: cell('C') }]));
  const ratio = (capture: string): Sheet['test'] => ({ relacao_transformacao: { cells: { '0': { '0': measured('13.8', 'kV'), '1': measured('115', 'V'), '3': measured(capture, null) } } } });
  const tpBlock = (sheet: Partial<Sheet>) => block(sheet, { block_type: 'tp', config: defaultBlockConfig('v1', 'tp') });
  const ncKey = TP.checklist![0]!.key;

  it('B1 (Story 22.4): a failed ratio and nothing else gives Reprovado · Com restrições', () => {
    const b = tpBlock({ test: ratio('125') });
    expect(conclusionFloor(b)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['ratio'] });
    expect(conclusionSuggestionText(conclusionSuggestion(b)!)).toBe('Reprovado · Com restrições?');
    // Every row within: as before.
    expect(floorPair(tpBlock({ test: ratio('120.1') }))).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    // At the limit (0,5 %): within.
    expect(floorPair(tpBlock({ test: ratio('120.6') }))?.restriction).toBe('sem_restricoes');
  });

  it('B2 (Story 22.4): Sem restrições over a failed ratio is adjusted; the reason line names the ratio, and the NC row with it', () => {
    const sem = { result: cell('aprovado'), restriction: cell('sem_restricoes') };
    expect(conclusionAdjusted(tpBlock({ test: ratio('125'), conclusion: sem }))).toBe(true);
    expect(conclusionFloorReasonText(tpBlock({ test: ratio('125'), conclusion: sem }))).toBe('A ficha exige no mínimo Reprovado · Com restrições: relação de transformação insatisfatória.');
    expect(conclusionFloorReasonText(tpBlock({ test: ratio('125'), checklist: { ...tpAllC(), [ncKey]: { result: cell('NC') } }, conclusion: sem }))).toBe(
      'A ficha exige no mínimo Reprovado · Com restrições: relação de transformação insatisfatória e item não conforme.',
    );
    expect(conclusionAdjusted(tpBlock({ test: ratio('120.1'), conclusion: sem }))).toBe(false);
  });

  it('B3: the composed text names the ratio clause, the criteria line its item, and the basis differs from the within case', () => {
    const pair = { result: cell('aprovado'), restriction: cell('com_restricoes') };
    const out = composeConclusion(tpBlock({ test: ratio('125'), checklist: tpAllC(), conclusion: pair }), TP, 'TP-1');
    expect(out.text).toContain('desvio de relação de transformação de 4,17 % em Fase R (critério: ±0,5 %, aceitável na ficha)');
    expect(out.criteriaItems).toContain('RT Fase R 4,17 % · critério ±0,5 %');
    const within = composeConclusion(tpBlock({ test: ratio('120.1'), checklist: tpAllC(), conclusion: pair }), TP, 'TP-1');
    expect(within.basis).not.toBe(out.basis);
  });
});
