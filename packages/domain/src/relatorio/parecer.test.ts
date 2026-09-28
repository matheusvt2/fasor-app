import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, Cell, RelatorioParecer, UserRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import {
  composeParecer,
  parecerBoxText,
  parecerBoxTone,
  parecerHintText,
  parecerTextForPrint,
  parecerTextState,
  parecerVerdictLabel,
  parecerWithText,
  parecerWithVerdict,
  suggestParecer,
} from './parecer.ts';
import { isEquipmentBlock } from './sheet-state.ts';

const TEMPLATE_ID = '019966b0-0071-7000-8000-000000000001';
const AT = '2026-09-08T12:00:00.000Z';

/** A fresh relatório from the standard template, then only its first `n` equipment sheets kept. */
function withSheets(n: number): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0072-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0073-7000-8000-'), now: T0 }), seq: i + 1 }));
  const snapshot = buildSnapshot(replay(ops), relatorioId);
  const keep = new Set(snapshot.blocks.filter(isEquipmentBlock).slice(0, n).map((b) => b.id));
  const blocks = snapshot.blocks.filter((b) => !isEquipmentBlock(b) || keep.has(b.id));
  const equipmentIds = new Set(blocks.map((b) => b.equipment_id));
  return { ...snapshot, blocks, equipment: snapshot.equipment.filter((e) => equipmentIds.has(e.id)) };
}

const cell = (value: Cell['value']): Cell => ({ value, source_suggestion_id: null, op_id: '019966b0-0074-7000-8000-000000000001' });

function conclude(block: BlockRow, result: 'aprovado' | 'reprovado', restriction: 'sem_restricoes' | 'com_restricoes'): BlockRow {
  return {
    ...block,
    concluded_by: { actor_id: TEST_USER, at: AT },
    sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, result: cell(result), restriction: cell(restriction) } },
  };
}

function untested(block: BlockRow, reason: 'impossibilidade_desligamento' | 'outro', text: string | null = null): BlockRow {
  return { ...block, not_tested: { reason, text, at: AT, by: TEST_USER } };
}

function withNc(block: BlockRow, itemKey: string): BlockRow {
  return { ...block, sheet: { ...block.sheet, checklist: { ...block.sheet.checklist, [itemKey]: { result: cell('NC') } } } };
}

function mapSheets(snapshot: RelatorioSnapshot, fn: (block: BlockRow, index: number) => BlockRow): RelatorioSnapshot {
  let i = -1;
  return { ...snapshot, blocks: snapshot.blocks.map((b) => (isEquipmentBlock(b) ? fn(b, ++i) : b)) };
}

const tagOf = (snapshot: RelatorioSnapshot, index: number) => {
  const block = snapshot.blocks.filter(isEquipmentBlock)[index]!;
  return snapshot.equipment.find((e) => e.id === block.equipment_id)!.tag;
};

describe('7.4-UNIT suggestParecer (I/O matrix)', () => {
  it('suggests Apto when every live sheet is concluded Aprovado · Sem restrições', () => {
    const snapshot = mapSheets(withSheets(3), (b) => conclude(b, 'aprovado', 'sem_restricoes'));
    expect(suggestParecer(snapshot)).toBe('apto');
    expect(parecerHintText('apto', snapshot)).toBe('Sugerido pelas contagens: Apto? — 3 de 3 fichas concluídas. A escolha é sua: um toque.');
  });

  it('suggests Apto com restrições on any Com restrições, any NC row or any Não ensaiada, concluded or not', () => {
    const base = withSheets(3);
    expect(suggestParecer(mapSheets(base, (b, i) => (i === 0 ? conclude(b, 'aprovado', 'com_restricoes') : b)))).toBe('apto_com_restricoes');
    const firstChecklistKey = Object.keys(base.blocks.filter(isEquipmentBlock)[1]!.sheet.checklist)[0] ?? 'limpeza';
    expect(suggestParecer(mapSheets(base, (b, i) => (i === 1 ? withNc(b, firstChecklistKey) : b)))).toBe('apto_com_restricoes');
    const oneUntested = mapSheets(base, (b, i) => (i === 2 ? untested(b, 'impossibilidade_desligamento') : conclude(b, 'aprovado', 'sem_restricoes')));
    expect(suggestParecer(oneUntested)).toBe('apto_com_restricoes');
    expect(parecerHintText('apto_com_restricoes', oneUntested)).toBe(
      'Sugerido pelas contagens: Apto com restrições? — 3 de 3 fichas concluídas, 1 não ensaiada. A escolha é sua: um toque.',
    );
  });

  it('suggests nothing with no sheet, with sheets open and no restriction, or a Reprovado with no restriction; never Não apto', () => {
    const none = withSheets(0);
    expect(suggestParecer(none)).toBeNull();
    expect(parecerHintText(null, none)).toBeNull();
    expect(suggestParecer(mapSheets(withSheets(3), (b, i) => (i === 0 ? conclude(b, 'aprovado', 'sem_restricoes') : b)))).toBeNull();
    const reprovado = mapSheets(withSheets(2), (b, i) => conclude(b, i === 0 ? 'reprovado' : 'aprovado', 'sem_restricoes'));
    expect(suggestParecer(reprovado)).toBeNull();
    // A Reprovado with a restriction still suggests restrictions, never Não apto.
    expect(suggestParecer(mapSheets(withSheets(2), (b) => conclude(b, 'reprovado', 'com_restricoes')))).toBe('apto_com_restricoes');
  });
});

describe('7.4-UNIT composeParecer', () => {
  it('counts sheets, not tested with TAG and reason, restrictions with TAGs, NC by item and points; states no verdict', () => {
    const base = withSheets(4);
    const nc = Object.keys(base.blocks.filter(isEquipmentBlock)[1]!.sheet.checklist)[0] ?? 'limpeza';
    const snapshot = mapSheets(base, (b, i) =>
      i === 0 ? conclude(b, 'aprovado', 'sem_restricoes') : i === 1 ? conclude(withNc(b, nc), 'aprovado', 'com_restricoes') : i === 2 ? untested(b, 'impossibilidade_desligamento') : b,
    );
    const composed = composeParecer(snapshot);
    const [, second, third] = [0, 1, 2].map((i) => tagOf(snapshot, i));
    expect(composed.text).toContain(`Foram registradas 4 fichas de ensaio: 2 concluídas, 1 não ensaiada (${third}, por impossibilidade de desligamento) e 1 ainda não concluída.`);
    expect(composed.text).toContain(`1 ficha apresentou restrições (${second}).`);
    expect(composed.text).toMatch(/Itens não conformes: item \d+ \([^)]+\) em 1 ficha\./);
    expect(composed.text).not.toMatch(/\b(apto|Apto|Não apto)\b/);
    expect(composed.criteriaItems.slice(0, 4)).toEqual(['4 fichas', '2 concluídas', `1 não ensaiada (${third})`, `1 com restrições (${second})`]);
    expect(composed.criteriaLine).toBe(composed.criteriaItems.join(' · '));
    expect(composed.criteriaItems.some((item) => /P\d/.test(item))).toBe(false);
    expect(composed.basis).toMatch(/^[0-9a-f]{8}$/);
    // Same inputs, same basis; a count that moves changes it.
    expect(composeParecer(snapshot).basis).toBe(composed.basis);
    expect(composeParecer(mapSheets(snapshot, (b, i) => (i === 3 ? conclude(b, 'aprovado', 'sem_restricoes') : b))).basis).not.toBe(composed.basis);
  });

  it('says the typed text of an "Outro" reason and nothing about sheets it does not have', () => {
    const snapshot = mapSheets(withSheets(1), (b) => untested(b, 'outro', 'Cubículo trancado'));
    const composed = composeParecer(snapshot);
    // The untested sheet is section 8's derived entry, so it counts as a point of attention too.
    expect(composed.text).toBe(
      `Foi registrada 1 ficha de ensaio: 1 não ensaiada (${tagOf(snapshot, 0)}, por Cubículo trancado). Foi registrado 1 ponto de atenção na seção 8.`,
    );
    expect(composeParecer(withSheets(0)).text).toBe('Nenhuma ficha de ensaio registrada neste relatório.');
  });
});

describe('7.4-UNIT parecer text states and print', () => {
  const composed = { basis: 'abcd1234' };
  const set = (p: Partial<RelatorioParecer>): RelatorioParecer => ({ verdict: 'apto', text: null, text_status: null, text_basis: null, ...p });

  it('is unconfirmed, confirmed, edited or stale as Story 5.8', () => {
    expect(parecerTextState(null, composed)).toBe('unconfirmed');
    expect(parecerTextState(set({}), composed)).toBe('unconfirmed');
    expect(parecerTextState(set({ text: 'x', text_status: 'confirmed', text_basis: 'abcd1234' }), composed)).toBe('confirmed');
    expect(parecerTextState(set({ text: 'x', text_status: 'edited', text_basis: 'abcd1234' }), composed)).toBe('edited');
    expect(parecerTextState(set({ text: 'x', text_status: 'confirmed', text_basis: 'old' }), composed)).toBe('stale');
  });

  it('prints only a confirmed or edited text (a stale one included), never an unconfirmed one', () => {
    const snap = (parecer: RelatorioParecer | null) => {
      const s = withSheets(0);
      return { ...s, relatorio: { ...s.relatorio, setup: { ...s.relatorio.setup, parecer } } };
    };
    expect(parecerTextForPrint(snap(null))).toBeNull();
    expect(parecerTextForPrint(snap(set({ text: 'composto' })))).toBeNull();
    expect(parecerTextForPrint(snap(set({ text: 'Resumo.', text_status: 'confirmed', text_basis: 'old' })))).toBe('Resumo.');
    expect(parecerTextForPrint(snap(set({ text: '  ', text_status: 'edited', text_basis: 'x' })))).toBeNull();
  });

  it('labels, tones and the whole-object writes', () => {
    expect(['apto', 'apto_com_restricoes', 'nao_apto'].map((v) => parecerVerdictLabel(v as never))).toEqual(['Apto', 'Apto com restrições', 'Não apto']);
    expect(['apto', 'apto_com_restricoes', 'nao_apto'].map((v) => parecerBoxTone(v as never))).toEqual(['apto', 'restricoes', 'nao-apto']);
    expect(parecerWithVerdict(null, 'nao_apto')).toEqual({ verdict: 'nao_apto', text: null, text_status: null, text_basis: null });
    const confirmed = parecerWithText(parecerWithVerdict(null, 'apto'), 'Resumo.', 'confirmed', 'b1');
    expect(parecerWithVerdict(confirmed, 'apto_com_restricoes')).toEqual({ verdict: 'apto_com_restricoes', text: 'Resumo.', text_status: 'confirmed', text_basis: 'b1' });
  });

  it('box text names the signer and the ART/TRT when known', () => {
    const s = withSheets(0);
    const responsible: UserRow = { id: TEST_USER, name: 'Rafael Lamonde', email: 'r@x', council: 'crea', registration_number: '5063583141', title: null, photo_location_enabled: false };
    const withArt = { ...s, responsible, relatorio: { ...s.relatorio, setup: { ...s.relatorio.setup, art_trt_number: '2620262602583' } } };
    expect(parecerBoxText(withArt)).toBe(
      'Seguido do resumo confirmado acima e, depois, dos itens fixos da conclusão e da assinatura de Rafael Lamonde (ART 2620262602583).',
    );
    expect(parecerBoxText({ ...withArt, responsible: { ...responsible, council: 'crt' } })).toContain('(TRT 2620262602583)');
    expect(parecerBoxText(s)).toBe('Seguido do resumo confirmado acima e, depois, dos itens fixos da conclusão e da assinatura do responsável técnico.');
  });
});
