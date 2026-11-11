import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, Cell, RelatorioParecer, UserRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, findDefinition, siteItems } from '../seed/definitions.ts';
import { cellAddressesOf } from './readings.ts';
import { standardTemplate } from '../seed/template.ts';
import { canonicalJson, fnv1a } from '../text/hash.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import {
  composeParecer,
  derivedParecer,
  effectiveParecer,
  parecerBoxText,
  parecerBoxTone,
  parecerCounts,
  parecerLooser,
  parecerOwnText,
  parecerReasonText,
  parecerTextForPrint,
  parecerTextState,
  parecerVerdictLabel,
  parecerWithoutOwnText,
  parecerWithText,
  parecerWithVerdict,
} from './parecer.ts';
import { pointsSummary } from '../points/summary.ts';
import { fichasConcluidasText, progress, relatorioCounter } from './progress.ts';
import { isEquipmentBlock } from './sheet-state.ts';

const TEMPLATE_ID = '019966b0-0071-7000-8000-000000000001';
const AT = '2026-09-08T12:00:00.000Z';

/**
 * A fresh relatório from the standard template, then only its first `n` equipment sheets kept. Batch
 * e24a (Story 24.4): on seed v13, whose sentences these tests pin (seed v14's Reprovado sentence is
 * `e24a-conclusion-rules.test.ts`'s).
 */
function withSheets(n: number): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID, seedVersion: 'v13' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
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

function withParecer(snapshot: RelatorioSnapshot, parecer: RelatorioParecer | null): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer } } };
}

describe('22.6-UNIT derivedParecer, effectiveParecer and the reason line (amends 7.4 suggestParecer)', () => {
  it('Apto when every live sheet is Aprovado · Sem restrições with no site NC and no point; e22f S5: with no sheet or only open sheets, nothing is judged and there is none', () => {
    const snapshot = mapSheets(withSheets(3), (b) => conclude(b, 'aprovado', 'sem_restricoes'));
    expect(derivedParecer(snapshot)).toBe('apto');
    expect(parecerReasonText(snapshot)).toBeNull();
    expect(derivedParecer(withSheets(0))).toBeNull();
    expect(derivedParecer(withSheets(3))).toBeNull();
    for (const verdict of ['apto', 'apto_com_restricoes', 'nao_apto'] as const) expect(parecerLooser(snapshot, verdict)).toBe(false);
  });

  it('Apto com restrições on any Com restrições, any NC row (through the floor), any Não ensaiada or any point; Apto disabled, Não apto choosable', () => {
    const base = withSheets(3);
    expect(derivedParecer(mapSheets(base, (b, i) => (i === 0 ? conclude(b, 'aprovado', 'com_restricoes') : b)))).toBe('apto_com_restricoes');
    const firstChecklistKey = Object.keys(base.blocks.filter(isEquipmentBlock)[1]!.sheet.checklist)[0] ?? 'limpeza';
    // An NC under a stored Sem restrições: the floor makes it Com restrições.
    const nc = mapSheets(base, (b, i) => (i === 1 ? conclude(withNc(b, firstChecklistKey), 'aprovado', 'sem_restricoes') : conclude(b, 'aprovado', 'sem_restricoes')));
    expect(derivedParecer(nc)).toBe('apto_com_restricoes');
    expect(parecerCounts(nc).withRestriction).toEqual([tagOf(nc, 1)]);
    const oneUntested = mapSheets(base, (b, i) => (i === 2 ? untested(b, 'impossibilidade_desligamento') : conclude(b, 'aprovado', 'sem_restricoes')));
    expect(derivedParecer(oneUntested)).toBe('apto_com_restricoes');
    // ~~The untested sheet is a derived point of attention too.~~ Fix batch e24h: it is no point; the verdict holds.
    expect(parecerReasonText(oneUntested)).toBe('O relatório exige no mínimo Apto com restrições: 1 não ensaiada.');
    expect(parecerLooser(oneUntested, 'apto')).toBe(true);
    expect(parecerLooser(oneUntested, 'nao_apto')).toBe(false);
  });

  it('Não apto when any sheet is effectively Reprovado: stored, or set by the floor over an out reading', () => {
    const reprovado = mapSheets(withSheets(2), (b, i) => conclude(b, i === 0 ? 'reprovado' : 'aprovado', 'sem_restricoes'));
    expect(derivedParecer(reprovado)).toBe('nao_apto');
    expect(parecerCounts(reprovado).reprovado).toEqual([tagOf(reprovado, 0)]);
    expect(parecerReasonText(reprovado)).toBe(`O relatório exige no mínimo Não apto: 1 ficha reprovada (${tagOf(reprovado, 0)}).`);
    expect(parecerLooser(reprovado, 'apto')).toBe(true);
    expect(parecerLooser(reprovado, 'apto_com_restricoes')).toBe(true);
    expect(parecerLooser(reprovado, 'nao_apto')).toBe(false);
    const composed = composeParecer(reprovado);
    expect(composed.text).toContain(`1 ficha foi reprovada (${tagOf(reprovado, 0)}).`);
    expect(composed.criteriaItems).toContain(`1 reprovada (${tagOf(reprovado, 0)})`);
  });

  it('the effective verdict: a stored stricter verdict stands, a looser one never shows', () => {
    const apto = mapSheets(withSheets(2), (b) => conclude(b, 'aprovado', 'sem_restricoes'));
    expect(effectiveParecer(apto)).toBe('apto');
    expect(effectiveParecer(withParecer(apto, parecerWithVerdict(null, 'apto_com_restricoes')))).toBe('apto_com_restricoes');
    expect(effectiveParecer(withParecer(apto, parecerWithVerdict(null, 'nao_apto')))).toBe('nao_apto');
    const reprovado = mapSheets(withSheets(2), (b, i) => conclude(b, i === 0 ? 'reprovado' : 'aprovado', 'com_restricoes'));
    expect(effectiveParecer(withParecer(reprovado, parecerWithVerdict(null, 'apto')))).toBe('nao_apto');
  });

  it('E78-Q9 and fxpw G5: the Critérios line\'s "N concluídas" is the parecer\'s one count, a not tested sheet counted apart', () => {
    const snapshot = mapSheets(withSheets(3), (b, i) => (i === 0 ? conclude(b, 'aprovado', 'sem_restricoes') : i === 1 ? untested(b, 'impossibilidade_desligamento') : b));
    const computed = progress(snapshot);
    expect(fichasConcluidasText(computed)).toBe('1 de 3 fichas concluídas');
    expect(computed.not_tested).toBe(1);
    expect(parecerCounts(snapshot)).toMatchObject({ total: 3, concluded: 1, open: 1 });
    const composed = composeParecer(snapshot);
    expect(composed.text).toContain(`Foram registradas 3 fichas de ensaio: 1 concluída, 1 não ensaiada (${tagOf(snapshot, 1)}, por impossibilidade de desligamento) e 1 ainda não concluída.`);
    expect(composed.criteriaItems.slice(0, 3)).toEqual(['3 fichas', '1 concluída', `1 não ensaiada (${tagOf(snapshot, 1)})`]);
    // The remaining-work counter (Home card, Project row) still counts the not-tested sheet as handled.
    expect(relatorioCounter(snapshot.blocks, [], undefined, EMPTY_DEFINITION_CONTEXT).text).toBe('2 de 3 fichas');
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
    // ~~The untested sheet is section 8's derived entry, so it counts as a point of attention too.~~ Fix batch e24h:
    // it is no point, so the summary names no points sentence.
    expect(composed.text).toBe(`Foi registrada 1 ficha de ensaio: 1 não ensaiada (${tagOf(snapshot, 0)}, por Cubículo trancado).`);
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

  it('22.6: prints the composed summary whatever is stored; a typed (edited) text is the own text, which can be cleared', () => {
    const snap = (parecer: RelatorioParecer | null) => withParecer(withSheets(1), parecer);
    const composed = composeParecer(withSheets(1)).text;
    expect(parecerTextForPrint(snap(null))).toBe(composed);
    expect(parecerTextForPrint(snap(set({ text: 'composto' })))).toBe(composed);
    expect(parecerTextForPrint(snap(set({ text: 'Resumo.', text_status: 'confirmed', text_basis: 'old' })))).toBe(composed);
    expect(parecerOwnText(snap(set({ text: 'Resumo.', text_status: 'confirmed', text_basis: 'old' })))).toBeNull();
    expect(parecerOwnText(snap(set({ text: ' Meu texto. ', text_status: 'edited', text_basis: 'x' })))).toBe('Meu texto.');
    expect(parecerOwnText(snap(set({ text: '  ', text_status: 'edited', text_basis: 'x' })))).toBeNull();
    expect(parecerOwnText(snap(null))).toBeNull();
    expect(parecerWithoutOwnText(set({ verdict: 'nao_apto', text: 'Meu texto.', text_status: 'edited', text_basis: 'x' }))).toEqual({ verdict: 'nao_apto', text: null, text_status: null, text_basis: null });
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
      'Seguido do resumo acima e, depois, dos itens fixos da conclusão e da assinatura de Rafael Lamonde (ART 2620262602583).',
    );
    expect(parecerBoxText({ ...withArt, responsible: { ...responsible, council: 'crt' } })).toContain('(TRT 2620262602583)');
    expect(parecerBoxText(s)).toBe('Seguido do resumo acima e, depois, dos itens fixos da conclusão e da assinatura do responsável técnico.');
  });
});

describe('2026-10-14 (Bruno) an NC site item counts in the parecer (N4, N5)', () => {
  const items = siteItems('v5');
  const ncCell = (n: number): Cell => ({ value: 'NC', source_suggestion_id: null, op_id: `019966b0-0074-7000-8000-0000000001${String(n).padStart(2, '0')}` });
  /** `snapshot` with the 1-based site items `numbers` answered NC on its root local number `local` (0-based). */
  function withSiteNc(snapshot: RelatorioSnapshot, local: number, numbers: readonly number[]): RelatorioSnapshot {
    const roots = snapshot.locations.filter((row) => row.kind === 'cabine' && row.parent_id === null);
    const target = roots[local]!;
    return {
      ...snapshot,
      locations: snapshot.locations.map((row) => {
        if (row.id !== target.id || row.kind !== 'cabine') return row;
        const checklist = { ...row.checklist };
        for (const n of numbers) checklist[items[n - 1]!.key] = { result: ncCell(n) };
        return { ...row, checklist };
      }),
    };
  }
  const rootName = (snapshot: RelatorioSnapshot, local: number) => snapshot.locations.filter((row) => row.kind === 'cabine' && row.parent_id === null)[local]!.name.trim();
  const allApto = () => mapSheets(withSheets(3), (b) => conclude(b, 'aprovado', 'sem_restricoes'));

  // Fix batch e24h: ~~and the reason line counts it with its derived point~~.
  it('N4: a site NC with every sheet Aprovado · Sem restrições gives Apto com restrições, and the reason line counts it', () => {
    const snapshot = withSiteNc(allApto(), 0, [3]);
    expect(derivedParecer(allApto())).toBe('apto');
    expect(derivedParecer(snapshot)).toBe('apto_com_restricoes');
    // ~~Story 22.5: the NC site item is a point of attention by itself.~~ Fix batch e24h: it is not.
    expect(parecerReasonText(snapshot)).toBe('O relatório exige no mínimo Apto com restrições: 1 NC nas verificações do local.');
    expect(parecerReasonText(withSiteNc(snapshot, 0, [3, 5]))).toContain('2 NC nas verificações do local');
  });

  it('N4 edge: with no sheet at all, a site NC still gives Apto com restrições (a floor); with none, no verdict (e22f S5)', () => {
    expect(derivedParecer(withSheets(0))).toBeNull();
    expect(derivedParecer(withSiteNc(withSheets(0), 0, [1]))).toBe('apto_com_restricoes');
  });

  it('the whole summary with a sheet NC and a site NC: the site sentence right after "Itens não conformes" (fix batch e24h: no points sentence)', () => {
    const base = withSheets(1);
    const block = base.blocks.filter(isEquipmentBlock)[0]!;
    const key = Object.keys(block.sheet.checklist)[0] ?? 'limpeza';
    const sheetNc = mapSheets(base, (b) => conclude(withNc(b, key), 'aprovado', 'com_restricoes'));
    const snapshot = withSiteNc(sheetNc, 0, [3]);
    const sheetText = composeParecer(sheetNc).text;
    const site = `Verificações do local não conformes: item 3 (${items[2]!.label.toLocaleLowerCase('pt-BR')}) em 1 local.`;
    expect(sheetText).toContain('Itens não conformes: ');
    // ~~Story 22.5: each NC is a derived point, so the points sentence closes the summary.~~ Fix batch e24h: no point is stored.
    expect(sheetText).not.toContain('ponto de atenção');
    expect(composeParecer(snapshot).text).toBe(`${sheetText} ${site}`);
  });

  it('N5: the summary names each site item with its locals count, a Critérios item per item, and the basis changes', () => {
    const base = allApto();
    const roots = base.locations.filter((row) => row.kind === 'cabine' && row.parent_id === null);
    expect(roots.length).toBeGreaterThan(1);
    const snapshot = withSiteNc(withSiteNc(base, 0, [3, 7]), 1, [3]);
    const composed = composeParecer(snapshot);
    const label = (n: number) => items[n - 1]!.label.toLocaleLowerCase('pt-BR');
    expect(composed.text).toContain(`Verificações do local não conformes: item 3 (${label(3)}) em 2 locais e item 7 (${label(7)}) em 1 local.`);
    // ~~Story 22.5: the three NC site items are three derived points.~~ Fix batch e24h: they are no points.
    expect(pointsSummary(snapshot).total).toBe(0);
    expect(composed.criteriaItems).toEqual([...composeParecer(base).criteriaItems, 'verificações do local, item 3 NC (2)', 'verificações do local, item 7 NC (1)']);
    expect(composed.basis).not.toBe(composeParecer(base).basis);
    expect(rootName(snapshot, 0)).not.toBe('');
  });

  it('N5 edge: with no site NC the text, Critérios and basis are as before (no `site` key in the basis)', () => {
    const base = allApto();
    const composed = composeParecer(base);
    const { total, concluded, open, notTested, withRestriction } = parecerCounts(base);
    expect(composed.basis).toBe(fnv1a(canonicalJson({ total, concluded, open, notTested, withRestriction, nc: [], points: 0 })));
    expect(composed.text).not.toContain('Verificações do local');
    // An answer other than NC counts nowhere.
    const conforme = { ...base, locations: base.locations.map((row) => (row.kind === 'cabine' && row.parent_id === null ? { ...row, checklist: { [items[0]!.key]: { result: cell('C') } } } : row)) };
    expect(composeParecer(conforme).basis).toBe(composed.basis);
    expect(derivedParecer(conforme)).toBe('apto');
  });

  it('N2: a removed local carries nothing; a relatório on v3 has no site list', () => {
    const snapshot = withSiteNc(allApto(), 0, [3]);
    const removed = { ...snapshot, locations: snapshot.locations.map((row) => (row.kind === 'cabine' && Object.keys(row.checklist ?? {}).length > 0 ? { ...row, removed_at: AT } : row)) };
    expect(derivedParecer(removed)).toBe('apto');
    expect(composeParecer(removed).text).not.toContain('Verificações do local');
    // Restored, it counts again.
    const restored = { ...removed, locations: removed.locations.map((row) => ({ ...row, removed_at: null })) };
    expect(derivedParecer(restored)).toBe('apto_com_restricoes');
    const v3 = { ...snapshot, relatorio: { ...snapshot.relatorio, seed_version: 'v3' } };
    // A v3 relatório carrying a site-shaped checklist is not restricted by it.
    expect(derivedParecer(v3)).toBe('apto');
    expect(parecerCounts(v3).siteNc).toBe(0);
    expect(composeParecer(v3).criteriaItems.some((item) => item.startsWith('verificações do local'))).toBe(false);
  });
});

describe('17.5-UNIT a ratio row INSATISFATÓRIO restricts the sheet in the parecer (F42, E15-A2)', () => {
  const ratio = (capture: string): BlockRow['sheet']['test'] => ({
    relacao_transformacao: {
      cells: { '0': { '0': cell({ raw: '13.8', unit: 'kV', state: 'measured' }), '1': cell({ raw: '115', unit: 'V', state: 'measured' }), '3': cell({ raw: capture, unit: null, state: 'measured' }) } },
    },
  });
  /** Every sheet of the standard template concluded Aprovado · Sem restrições, its first TP's ratio holding `capture`, that TP concluded `restriction`. */
  const withTp = (capture: string, restriction: 'sem_restricoes' | 'com_restricoes' = 'sem_restricoes') => {
    const base = withSheets(Number.MAX_SAFE_INTEGER);
    const tpId = base.blocks.find((b) => b.block_type === 'tp')!.id;
    return mapSheets(base, (b) => (b.id === tpId ? conclude({ ...b, sheet: { ...b.sheet, test: ratio(capture) } }, 'aprovado', restriction) : conclude(b, 'aprovado', 'sem_restricoes')));
  };
  const tpName = (snapshot: RelatorioSnapshot) => {
    const tp = snapshot.blocks.find((b) => b.block_type === 'tp')!;
    return snapshot.equipment.find((e) => e.id === tp.equipment_id)!.tag;
  };

  it('B5 (Story 22.6): a sheet concluded Sem restrições over a failed ratio is effectively Reprovado: Não apto, and the summary and Critérios name it', () => {
    const snapshot = withTp('125');
    const name = tpName(snapshot);
    const counts = parecerCounts(snapshot);
    // e22f N1: a Reprovado sheet is named once, under its reason.
    expect(counts.withRestriction).toEqual([]);
    expect(counts.reprovado).toEqual([name]);
    // The failed ratio has its own clause, never the out-readings one.
    expect(counts.outReadings).toEqual([]);
    expect(derivedParecer(snapshot)).toBe('nao_apto');
    expect(parecerReasonText(snapshot)).toBe(`O relatório exige no mínimo Não apto: 1 ficha reprovada (${name}).`);
    const composed = composeParecer(snapshot);
    expect(composed.text).toContain(`1 ficha foi reprovada por relação de transformação insatisfatória (${name}).`);
    expect(composed.text).not.toContain('apresentou restrições');
    expect(composed.text).not.toContain('Relação de transformação insatisfatória em');
    expect(composed.criteriaItems).toContain(`1 reprovada (${name})`);
    expect(composed.criteriaItems.some((item) => item.startsWith('relação de transformação') || item.includes('com restrições'))).toBe(false);
  });

  it('B5: concluded Com restrições over a failed ratio, the same counts and the same ratio item', () => {
    const snapshot = withTp('125', 'com_restricoes');
    const name = tpName(snapshot);
    expect(parecerCounts(snapshot).withRestriction).toEqual([]);
    expect(composeParecer(snapshot).text).toContain(`1 ficha foi reprovada por relação de transformação insatisfatória (${name}).`);
  });

  it('a within ratio: Apto, no ratio sentence nor item, and the basis has no `ratio` key (byte-identical to before)', () => {
    const snapshot = withTp('120.1');
    expect(derivedParecer(snapshot)).toBe('apto');
    const composed = composeParecer(snapshot);
    expect(composed.text).not.toContain('Relação de transformação');
    expect(composed.criteriaItems.some((item) => item.startsWith('relação de transformação'))).toBe(false);
    const { total, concluded, open, notTested, withRestriction } = parecerCounts(snapshot);
    expect(composed.basis).toBe(fnv1a(canonicalJson({ total, concluded, open, notTested, withRestriction, nc: [], points: 0 })));
    expect(composeParecer(withTp('125')).basis).not.toBe(composed.basis);
  });

  it('a not tested sheet holding a failed ratio is counted as not tested, never named by the ratio', () => {
    const tpId = withTp('125').blocks.find((b) => b.block_type === 'tp')!.id;
    const snapshot = mapSheets(withTp('125'), (b) => (b.id === tpId ? untested(b, 'impossibilidade_desligamento') : b));
    const composed = composeParecer(snapshot);
    expect(parecerCounts(snapshot).withRestriction).toEqual([]);
    expect(parecerCounts(snapshot).reprovado).toEqual([]);
    expect(composed.text).not.toContain('Relação de transformação');
  });
});

describe('22.6-UNIT the out-of-criterion readings clause', () => {
  it('a sheet with an insulation reading out names the sheet in its own sentence and Critérios item; the basis keys appear only then', () => {
    const base = mapSheets(withSheets(Number.MAX_SAFE_INTEGER), (b) => conclude(b, 'aprovado', 'sem_restricoes'));
    const target = base.blocks.find((b) => b.block_type === 'para_raio')!;
    const [first] = cellAddressesOf(findDefinition(target.seed_version, target.block_type)!, 'isolacao');
    const insulation = { isolacao: { cells: { [String(first!.row)]: { [String(first!.col)]: cell({ raw: '300', unit: 'MΩ', state: 'measured' }) } } } };
    const snapshot = mapSheets(base, (b) => (b.id === target.id ? { ...b, sheet: { ...b.sheet, test: insulation } } : b));
    const name = snapshot.equipment.find((e) => e.id === target.equipment_id)!.tag;
    const counts = parecerCounts(snapshot);
    expect(counts.outReadings).toEqual([name]);
    expect(counts.reprovado).toEqual([name]);
    const composed = composeParecer(snapshot);
    // e22f N1: named once, in the Reprovado sentence with its reason.
    expect(composed.text).toContain(`1 ficha foi reprovada por leituras fora do critério de aceitação (${name}).`);
    expect(composed.text).not.toContain('Leituras fora do critério de aceitação em');
    expect(composed.criteriaItems).not.toContain(`leituras fora do critério (${name})`);
    const { total, concluded, open, notTested, withRestriction } = parecerCounts(base);
    expect(composeParecer(base).basis).toBe(fnv1a(canonicalJson({ total, concluded, open, notTested, withRestriction, nc: [], points: 0 })));
  });
});
