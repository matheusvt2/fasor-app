import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { newPointRow } from '../points/checks.ts';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig, standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import {
  chosenConclusionPair,
  conclusionAdjusted,
  conclusionFloor,
  conclusionFloorReasonText,
  conclusionSuggestion,
  effectiveConclusionPair,
  isLooserThanFloor,
  observationRequired,
  printedConclusionPair,
} from './conclusion.ts';
import { instantiateTemplate } from './instantiate.ts';
import { composeParecer, derivedParecer, effectiveParecer, parecerCounts, parecerReasonText } from './parecer.ts';
import { isEquipmentBlock } from './sheet-state.ts';

/*
 * Fix batch e24h, H9 (Bruno through Matheus, 2026-11-10): an observation never forces a restriction,
 * on every seed. The sheet's OBSERVAÇÕES or a C/NA row's observation is a comment: the floor stays
 * Aprovado · Sem restrições, Sem stays choosable, no reason line names it, and the parecer of
 * relatórios whose fichas only carry observations is Apto. Every other source of the floor is as before.
 */

const ID = '019966b0-0e24-7009-8000-000000000001';
const OP = '019966b0-0e24-7009-8000-000000000002';
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
const stored = (b: BlockRow, restriction: 'sem_restricoes' | 'com_restricoes'): BlockRow => ({
  ...b,
  concluded_by: { actor_id: TEST_USER, at: T0.toISOString() },
  sheet: { ...b.sheet, conclusion: { ...b.sheet.conclusion, result: cell('aprovado'), restriction: cell(restriction) } },
});
const SEM = { result: 'aprovado', restriction: 'sem_restricoes' } as const;

describe('e24h-UNIT H9 an observation never forces a restriction', () => {
  const cases: [string, BlockRow][] = [
    ['the sheet\'s OBSERVAÇÕES', block({ checklist: allC(), test: within(), observations: cell('Pintura desgastada na porta, sem efeito na operação') })],
    ['a C row\'s observation', block({ checklist: { ...allC(), contatos: { result: cell('C'), observation: cell('Leve oxidação') } }, test: within() })],
    ['an NA row\'s observation', block({ checklist: { ...allC(), contatos: { result: cell('NA'), observation: cell('Sem acesso') } }, test: within() })],
  ];
  for (const [name, b] of cases) {
    it(`${name}: the floor is Aprovado · Sem restrições with no reason, Sem enabled, no reason line, the suggestion Sem`, () => {
      expect(conclusionFloor(b)).toEqual({ pair: SEM, reasons: [] });
      expect(isLooserThanFloor(b, 'sem_restricoes')).toBe(false);
      expect(conclusionFloorReasonText(b)).toBeNull();
      expect(conclusionSuggestion(b)).toEqual(SEM);
    });
  }

  it('every other source floors as before, the observation no longer listed beside it', () => {
    const nc = block({ checklist: { ...allC(), contatos: { result: cell('NC'), observation: cell('Contato queimado') } }, test: within(), observations: cell('Ver item') });
    expect(conclusionFloor(nc)).toEqual({ pair: { result: 'aprovado', restriction: 'com_restricoes' }, reasons: ['nc'] });
    expect(conclusionFloorReasonText(nc)).toBe('A ficha exige no mínimo Aprovado · Com restrições: item não conforme.');
    const test = within();
    test.isolacao!.cells['0'] = { '0': measured('300', 'MΩ') };
    const out = block({ checklist: allC(), test, observations: cell('Reapertar') });
    expect(conclusionFloor(out)).toEqual({ pair: { result: 'reprovado', restriction: 'com_restricoes' }, reasons: ['reading'] });
    expect(conclusionFloorReasonText(out)).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
  });

  it('Com restrições picked: OBSERVAÇÕES is still required; Sem with an observation requires nothing', () => {
    const withObs = block({ checklist: allC(), test: within(), observations: cell('Comentário') });
    expect(observationRequired(stored(block({ checklist: allC(), test: within() }), 'com_restricoes'))).toBe(true);
    expect(observationRequired(stored(withObs, 'com_restricoes'))).toBe(true);
    expect(observationRequired(stored(withObs, 'sem_restricoes'))).toBe(false);
  });

  it('a ficha stored Aprovado · Sem restrições with an observation reads Sem everywhere, not adjusted; one stored Com stays Com', () => {
    const sem = stored(block({ checklist: allC(), test: within(), observations: cell('Comentário') }), 'sem_restricoes');
    expect(effectiveConclusionPair(sem)).toEqual(SEM);
    expect(chosenConclusionPair(sem)).toEqual(SEM);
    expect(printedConclusionPair(sem)).toEqual(SEM);
    expect(conclusionAdjusted(sem)).toBe(false);
    const com = stored(block({ checklist: allC(), test: within(), observations: cell('Comentário') }), 'com_restricoes');
    expect(effectiveConclusionPair(com)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(printedConclusionPair(com)).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(conclusionAdjusted(com)).toBe(false);
  });
});

describe('e24h-UNIT H9 the parecer of fichas with observations only', () => {
  function relatorio(n: number): RelatorioSnapshot {
    const { relatorioId, drafts } = instantiateTemplate(
      standardTemplate({ id: '019966b0-0e24-7009-8000-000000000010' }),
      { id: TEST_PROJECT },
      { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
      { newId: idSequence('019966b0-0e24-7009-8001-'), actorId: TEST_USER, companyId: TEST_COMPANY },
    );
    const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e24-7009-8002-'), now: T0 }), seq: i + 1 }));
    const snapshot = buildSnapshot(replay(ops), relatorioId);
    const keep = new Set(snapshot.blocks.filter(isEquipmentBlock).slice(0, n).map((b) => b.id));
    const blocks = snapshot.blocks
      .filter((b) => !isEquipmentBlock(b) || keep.has(b.id))
      .map((b) => (isEquipmentBlock(b) ? stored({ ...b, sheet: { ...b.sheet, observations: cell('Comentário sem restrição') } }, 'sem_restricoes') : b));
    return { ...snapshot, blocks };
  }

  it('every ficha Aprovado · Sem restrições with an observation: Apto, no restriction named; one stored point gives Apto com restrições', () => {
    const snapshot = relatorio(3);
    expect(derivedParecer(snapshot)).toBe('apto');
    expect(effectiveParecer(snapshot)).toBe('apto');
    expect(parecerReasonText(snapshot)).toBeNull();
    expect(parecerCounts(snapshot).withRestriction).toEqual([]);
    expect(composeParecer(snapshot).text).not.toContain('restriç');
    const withPoint = { ...snapshot, points: [newPointRow({ id: '019966b0-0e24-7009-8003-000000000001', relatorioId: snapshot.relatorio.id, text: 'Ponto', equipmentId: null, origin: 'manual', action: null }, [])] };
    expect(derivedParecer(withPoint)).toBe('apto_com_restricoes');
  });
});
