import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { newPointRow } from '../points/checks.ts';
import { derivedPoints, ncRowPointText, possibleDuplicatePairs, possibleDuplicatePoints, possibleDuplicatesText, predatesItemSource } from '../points/derived.ts';
import { PARECER_MISSING_TITLE, section10Layout } from '../print/section-10.ts';
import type { BlockRow, Cell, PointRow, Sheet } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition, getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig, standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import {
  chosenConclusionPair,
  composeConclusion,
  conclusionAdjusted,
  conclusionAdjustWrites,
  conclusionTextState,
  effectiveConclusionPair,
  printedConclusionPair,
  printedConclusionText,
} from './conclusion.ts';
import { clearsNcObservation, sheetOrder } from './ficha.ts';
import { instantiateTemplate } from './instantiate.ts';
import { composeParecer, derivedParecer, effectiveParecer, parecerLooser, parecerReasonText } from './parecer.ts';
import { blockingRows, preIssue } from './pre-issue.ts';
import { cellAddressesOf } from './readings.ts';
import { sheetProgress, sheetSummaryText } from './sheet-progress.ts';

/*
 * e22f: the fix batch of Epic 22 wave A. Each block below is the test that the wave A code
 * failed: the open sheet's conclusion step (12.5-E2E-001, review N2), the stale confirmed text
 * (S1), the empty relatório's verdict (S5), the possible duplicates (S2, N4), the NC row's point
 * text (S4), the Reprovado sheet named once (N1) and the NC phrase cleared on C (N3).
 */

const OP = '019966b0-e22f-7000-8000-000000000001';
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => cell({ raw, unit, state: 'measured' });
const CONCLUDED = { actor_id: TEST_USER, at: '2026-11-06T12:00:00.000Z' };

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-e22f-7000-8000-0000000000a1' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-e22f-7001-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-e22f-7002-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(block) : block)) };
}

function firstOf(snapshot: RelatorioSnapshot, type: string): BlockRow {
  const order = sheetOrder(snapshot);
  return snapshot.blocks.filter((block) => block.block_type === type).sort((a, b) => order.findIndex((n) => n.blockId === a.id) - order.findIndex((n) => n.blockId === b.id))[0]!;
}

const allC = (block: BlockRow): BlockRow => ({
  ...block,
  sheet: { ...block.sheet, checklist: Object.fromEntries(findDefinition(block.seed_version, block.block_type)!.checklist!.map((item) => [item.key, { result: cell('C') }])) },
});

function insulation(block: BlockRow, raw: string, unit = 'MΩ'): BlockRow {
  const definition = findDefinition(block.seed_version, block.block_type)!;
  const cells: Record<string, Record<string, Cell>> = {};
  for (const address of cellAddressesOf(definition, 'isolacao')) (cells[String(address.row)] ??= {})[String(address.col)] = measured(raw, unit);
  return { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, isolacao: { cells } } } };
}

const withConclusion = (block: BlockRow, conclusion: Sheet['conclusion']): BlockRow => ({ ...block, sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, ...conclusion } } });

describe('e22f N2 (12.5-E2E-001): the floor is a floor, not a conclusion', () => {
  it('an open sheet, every row C, no pair stored: the conclusion step is missing (the header line), filled only for the conclude gate; nothing prints', () => {
    const base = fresh();
    const sec = firstOf(base, 'chave_seccionadora');
    const snapshot = edit(base, sec.id, allC);
    const block = snapshot.blocks.find((b) => b.id === sec.id)!;
    // The floor stands (Aprovado · Sem restrições) and the radiogroups show it ...
    expect(effectiveConclusionPair(block)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    // ... but it is not a chosen pair.
    expect(chosenConclusionPair(block)).toEqual({ result: null, restriction: null });
    const shown = sheetProgress(snapshot, sec.id);
    expect(shown.steps.conclusao.missing).toBe(2);
    expect(sheetSummaryText(shown)).toContain('Verificações prontas');
    expect(sheetSummaryText(shown)).not.toContain('conclusão prontas');
    expect(sheetProgress(snapshot, sec.id, { floorFills: true }).steps.conclusao.missing).toBe(0);
    // A draft prints no mark the floor alone sets; once concluded, the floor's.
    expect(printedConclusionPair(block)).toEqual({ result: null, restriction: null });
    // Concluded, the conclude batch has written the floor: it prints.
    const written = withConclusion({ ...block, concluded_by: CONCLUDED }, { result: cell('aprovado'), restriction: cell('sem_restricoes') });
    expect(printedConclusionPair(written)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    // A pair cleared after the conclude: no mark, as the header counts it missing.
    expect(printedConclusionPair({ ...block, concluded_by: CONCLUDED })).toEqual({ result: null, restriction: null });
  });

  it('a stored half counts and prints, made stricter by the floor; the unset half stays missing', () => {
    const base = fresh();
    const sec = firstOf(base, 'chave_seccionadora');
    const snapshot = edit(base, sec.id, (b) => withConclusion(insulation(allC(b), '300'), { restriction: cell('sem_restricoes') }));
    const block = snapshot.blocks.find((b) => b.id === sec.id)!;
    expect(chosenConclusionPair(block)).toEqual({ result: null, restriction: 'com_restricoes' });
    expect(printedConclusionPair(block)).toEqual({ result: null, restriction: 'com_restricoes' });
    // The pair half missing, and Com restrições requires the observation.
    expect(sheetProgress(snapshot, sec.id).steps.conclusao).toMatchObject({ missing: 2, observation: 1 });
  });
});

describe('e22f S1: the floor tightens a concluded sheet with a confirmed text', () => {
  for (const seed of ['v11', 'v5'] as const) {
    it(`seed ${seed}: Confirmar under the adjusted note writes the pair and the recomposed text; the document prints the composed one meanwhile; an edited text is kept`, () => {
      const definition = getDefinition(seed, 'cabine_primaria', 'chave_seccionadora');
      const config = defaultBlockConfig(seed, 'chave_seccionadora', { subtype: 'manual' });
      const base = fresh();
      const sec = { ...firstOf(base, 'chave_seccionadora'), seed_version: seed, config } as BlockRow;
      const tag = 'SEC-1';
      const concluded = withConclusion(insulation(allC(sec), '147', 'GΩ'), { result: cell('aprovado'), restriction: cell('sem_restricoes') });
      const composed = composeConclusion(concluded, definition, tag);
      const confirmed = {
        ...withConclusion(concluded, { text: cell(composed.text), text_status: cell('confirmed'), text_basis: cell(composed.basis) }),
        concluded_by: CONCLUDED,
      };
      expect(printedConclusionText(confirmed, definition, tag)).toBe(composed.text);
      // A reading corrected out of criterion: Reprovado · Com restrições, the stored text stale.
      const out = insulation(confirmed, '300');
      const now = composeConclusion(out, definition, tag);
      expect(conclusionAdjusted(out)).toBe(true);
      expect(conclusionTextState(out, now)).toBe('stale');
      expect(now.text).toContain('Recomenda-se a correção');
      // Never a Reprovado pair with an empty paragraph: the composed text prints until Confirmar.
      expect(printedConclusionPair(out)).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
      expect(printedConclusionText(out, definition, tag)).toBe(now.text);
      const writes = conclusionAdjustWrites(out, definition, tag);
      expect(writes).toEqual({ result: 'reprovado', restriction: 'com_restricoes', text: { text: now.text, basis: now.basis } });
      const after = withConclusion(out, {
        result: cell(writes!.result),
        restriction: cell(writes!.restriction),
        text: cell(writes!.text!.text),
        text_status: cell('confirmed'),
        text_basis: cell(writes!.text!.basis),
      });
      expect(conclusionAdjusted(after)).toBe(false);
      expect(conclusionTextState(after, composeConclusion(after, definition, tag))).toBe('confirmed');
      expect(conclusionAdjustWrites(after, definition, tag)).toBeNull();
      // An edited text is the engineer's: never written, printed as typed.
      const edited = withConclusion(out, { text: cell('Texto do engenheiro.'), text_status: cell('edited') });
      expect(conclusionAdjustWrites(edited, definition, tag)).toEqual({ result: 'reprovado', restriction: 'com_restricoes', text: null });
      expect(printedConclusionText(edited, definition, tag)).toBe('Texto do engenheiro.');
    });
  }

  it('a stale confirmed text on a sheet the floor did not adjust still does not print (AR-11 unchanged)', () => {
    const definition = getDefinition('v11', 'cabine_primaria', 'chave_seccionadora');
    const base = fresh();
    const sec = firstOf(base, 'chave_seccionadora');
    const reprovado = withConclusion(insulation(allC(sec), '147', 'GΩ'), { result: cell('reprovado'), restriction: cell('com_restricoes') });
    const composed = composeConclusion(reprovado, definition, 'SEC-1');
    const confirmed = withConclusion(reprovado, { text: cell(composed.text), text_status: cell('confirmed'), text_basis: cell(composed.basis) });
    const renamed = composeConclusion(confirmed, definition, 'SEC-2');
    expect(conclusionTextState(confirmed, renamed)).toBe('stale');
    expect(printedConclusionText(confirmed, definition, 'SEC-2')).toBeNull();
  });
});

describe('e22f S5: nothing judged, no derived verdict', () => {
  it('a stricter verdict stands without a concluded sheet (a floor): an open sheet with a reading out gives Não apto', () => {
    const empty = fresh();
    const sec = firstOf(empty, 'chave_seccionadora');
    const out = edit(empty, sec.id, (b) => insulation(allC(b), '300'));
    expect(derivedParecer(out)).toBe('nao_apto');
    expect(parecerLooser(out, 'apto')).toBe(true);
    expect(blockingRows(preIssue(out))).toEqual([]);
  });

  it('no concluded sheet, nothing stricter and no verdict tapped: no verdict, "Parecer não preenchido" blocks, section 10 prints [Parecer]; one concluded sheet derives Apto', () => {
    const empty = fresh();
    expect(derivedParecer(empty)).toBeNull();
    expect(effectiveParecer(empty)).toBeNull();
    expect(parecerReasonText(empty)).toBeNull();
    expect(parecerLooser(empty, 'apto')).toBe(false);
    expect(blockingRows(preIssue(empty)).map((row) => row.kind)).toEqual(['parecer_missing']);
    expect(section10Layout(empty, { number: 10, title: 'CONCLUSÃO' }).parecer.title).toBe(PARECER_MISSING_TITLE);
    // A verdict tapped: it stands alone.
    const tapped = { ...empty, relatorio: { ...empty.relatorio, setup: { ...empty.relatorio.setup, parecer: { verdict: 'apto' as const, text: null, text_status: null, text_basis: null } } } };
    expect(effectiveParecer(tapped)).toBe('apto');
    expect(blockingRows(preIssue(tapped))).toEqual([]);
    // One sheet concluded: the fichas give the verdict.
    const sec = firstOf(empty, 'chave_seccionadora');
    const judged = edit(empty, sec.id, (b) => ({ ...withConclusion(insulation(allC(b), '147', 'GΩ'), { result: cell('aprovado'), restriction: cell('sem_restricoes') }), concluded_by: CONCLUDED }));
    expect(derivedParecer(judged)).toBe('apto');
    expect(blockingRows(preIssue(judged))).toEqual([]);
  });
});

/** A manual point as a client older than contract 31 wrote it: no `item_key` key at all. */
function legacyPoint(snapshot: RelatorioSnapshot, id: string, equipmentId: string | null): PointRow {
  const row = newPointRow({ id, relatorioId: snapshot.relatorio.id, text: 'Item 1: contatos oxidados', equipmentId, origin: 'manual', action: 'Limpar' }, snapshot.points);
  delete (row as Partial<PointRow>).item_key;
  return row;
}

function ncOn(block: BlockRow, index: number, observation: string | null): BlockRow {
  const item = findDefinition(block.seed_version, block.block_type)!.checklist![index]!;
  return { ...block, sheet: { ...block.sheet, checklist: { ...block.sheet.checklist, [item.key]: { result: cell('NC'), ...(observation === null ? {} : { observation: cell(observation) }) } } } };
}

describe('e22f S2 and N4: possible duplicates', () => {
  const base = fresh();
  const trafo = firstOf(base, 'transformador_forca');
  const withNc = edit(base, trafo.id, (b) => ncOn(ncOn(allC(b), 0, 'oxidação nos terminais'), 1, null));
  const itemKey = findDefinition(trafo.seed_version, trafo.block_type)!.checklist![0]!.key;

  it('a point row written from contract 31 on always carries item_key; one without the key predates it', () => {
    const row = newPointRow({ id: '019966b0-e22f-7003-8000-000000000001', relatorioId: base.relatorio.id, text: 'x', equipmentId: null, origin: 'manual', action: null }, []);
    expect(row).toHaveProperty('item_key', null);
    expect(predatesItemSource(row)).toBe(false);
    expect(predatesItemSource(legacyPoint(base, '019966b0-e22f-7003-8000-000000000002', null))).toBe(true);
  });

  it('a pre-31 manual point of the equipment pairs with each NC entry: flagged, counted, a pending pre-issue row on section 8 (never blocking)', () => {
    const snapshot = { ...withNc, points: [legacyPoint(withNc, '019966b0-e22f-7003-8000-000000000003', trafo.equipment_id)] };
    expect(possibleDuplicatePoints(snapshot).pointIds.size).toBe(1);
    expect(possibleDuplicatePairs(snapshot)).toBe(2);
    const row = preIssue(snapshot).find((r) => r.kind === 'points_possible_duplicate');
    expect(row).toMatchObject({ row: 'section_8', severity: 'pending', text: '2 pares de pontos possivelmente duplicados' });
    expect(possibleDuplicatesText(1)).toBe('1 par de pontos possivelmente duplicados');
    // Nothing is removed on its own: both NC entries still print.
    expect(derivedPoints(snapshot).filter((e) => e.kind === 'nc')).toHaveLength(2);
  });

  it('a manual point written since (item_key null) is not flagged; one carrying the item suppresses its entry', () => {
    const fresh31 = newPointRow({ id: '019966b0-e22f-7003-8000-000000000004', relatorioId: base.relatorio.id, text: 'Vara de manobra sem laudo', equipmentId: trafo.equipment_id, origin: 'manual', action: null }, []);
    const later = { ...withNc, points: [fresh31] };
    expect(possibleDuplicatePairs(later)).toBe(0);
    expect(preIssue(later).some((r) => r.kind === 'points_possible_duplicate')).toBe(false);
    const named = { ...withNc, points: [{ ...fresh31, item_key: itemKey }] };
    expect(derivedPoints(named).filter((e) => e.kind === 'nc').map((e) => e.item_key)).toEqual([findDefinition(trafo.seed_version, trafo.block_type)!.checklist![1]!.key]);
  });

  it('S4: an NC row\'s "Criar ponto de atenção" text is its derived entry\'s, as "Editar" seeds it', () => {
    const block = withNc.blocks.find((b) => b.id === trafo.id)!;
    const entry = derivedPoints(withNc).find((e) => e.kind === 'nc' && e.item_key === itemKey)!;
    expect(ncRowPointText(withNc, { block }, itemKey)).toBe(entry.text);
    expect(entry.text).toMatch(/^Item 1 \(.+\): oxidação nos terminais$/);
    expect(ncRowPointText(withNc, { block }, 'no_such_item')).toBe('');
  });
});

describe('e22f N1: a Reprovado sheet is named once in the summary', () => {
  it('two sheets reproved by readings: one sentence with the reason, no restriction or reading sentence repeating them', () => {
    const base = fresh();
    const sec = firstOf(base, 'chave_seccionadora');
    const dj = firstOf(base, 'disjuntor_mt');
    let snapshot = edit(base, sec.id, (b) => insulation(allC(b), '300'));
    snapshot = edit(snapshot, dj.id, (b) => insulation(allC(b), '300'));
    const text = composeParecer(snapshot).text;
    expect(text).toMatch(/2 fichas foram reprovadas por leituras fora do critério de aceitação \([^)]+ e [^)]+\)\./);
    expect(text).not.toContain('apresentaram restrições');
    expect(text).not.toContain('apresentou restrições');
    expect(text).not.toContain('Leituras fora do critério de aceitação em');
    expect(composeParecer(snapshot).criteriaItems.filter((item) => item.includes('com restrições'))).toEqual([]);
  });
});

describe('e22f N3: an NC row set back to C clears only its unedited chip phrase', () => {
  const chips = ['Oxidação nos terminais', 'Acúmulo de poeira'];
  it.each([
    ['NC', 'C', 'Oxidação nos terminais', true],
    ['NC', 'C', '  Acúmulo de poeira ', true],
    ['NC', 'C', 'Oxidação nos terminais, Acúmulo de poeira', false],
    ['NC', 'C', 'Oxidação nos terminais do polo B', false],
    ['NC', 'C', '', false],
    ['NC', 'NA', 'Oxidação nos terminais', false],
    ['C', 'C', 'Oxidação nos terminais', false],
    ['NC', null, 'Oxidação nos terminais', false],
  ] as const)('%s to %s with "%s": %s', (from, to, observation, expected) => {
    expect(clearsNcObservation(from, to, observation, chips)).toBe(expected);
  });
});
