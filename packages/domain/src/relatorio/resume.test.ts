import { describe, expect, it } from 'vitest';
import { calendarDateOfInstant } from '../format/datetime.ts';
import { homeCards, type HomeCardsInput } from '../home/cards.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, RelatorioRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { resumeTarget } from './resume.ts';
import { sectionBlocks, nextTextSection } from './sumario.ts';
import { locationTree, treeNodes, type TreeEquipmentNode } from './tree.ts';

/*
 * 12.2-UNIT: the forward path's rules, one test per row of the story's I/O matrix: which
 * sheet "Continuar" resumes and its text, the Home card counter, the next section text,
 * and today's date for "Novo relatório".
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0122-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0123-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0124-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const sheetsInOrder = (snapshot: RelatorioSnapshot) =>
  treeNodes(locationTree(snapshot)).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');

const concluded = (block: BlockRow): BlockRow => ({ ...block, concluded_by: { actor_id: TEST_USER, at: '2026-09-07T11:00:00.000Z' } });

function withBlocks(snapshot: RelatorioSnapshot, change: (block: BlockRow) => BlockRow, ids: ReadonlySet<string>): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (ids.has(block.id) ? change(block) : block)) };
}

describe('12.2-UNIT resumeTarget', () => {
  it('resumes the last sheet with "⟨TAG⟩ · n de N"', () => {
    const snapshot = fresh();
    const sheets = sheetsInOrder(snapshot);
    const last = sheets[5]!;
    const done = withBlocks(snapshot, concluded, new Set([sheets[0]!.blockId, sheets[1]!.blockId]));
    expect(resumeTarget(done, last.blockId)).toEqual({ blockId: last.blockId, text: `${last.name} · 2 de ${sheets.length}` });
  });

  it('without a pointer, or with one naming a removed or unknown block, opens the first sheet still missing something', () => {
    const snapshot = fresh();
    const sheets = sheetsInOrder(snapshot);
    const done = withBlocks(snapshot, concluded, new Set([sheets[0]!.blockId, sheets[1]!.blockId]));
    expect(resumeTarget(done, null)?.blockId).toBe(sheets[2]!.blockId);
    expect(resumeTarget(done, 'not-a-block')?.blockId).toBe(sheets[2]!.blockId);
    const removed = withBlocks(done, (block) => ({ ...block, removed_at: '2026-09-07T12:00:00.000Z' }), new Set([sheets[4]!.blockId]));
    expect(resumeTarget(removed, sheets[4]!.blockId)?.blockId).toBe(sheets[2]!.blockId);
  });

  it('with every sheet concluded or not tested, opens the first sheet in tree order', () => {
    const snapshot = fresh();
    const sheets = sheetsInOrder(snapshot);
    const all = new Set(sheets.map((row) => row.blockId));
    const done = withBlocks(snapshot, concluded, all);
    const target = resumeTarget(done, null);
    expect(target).toEqual({ blockId: sheets[0]!.blockId, text: `${sheets[0]!.name} · ${sheets.length} de ${sheets.length}` });
  });

  it('is null for a relatório with no sheet', () => {
    const snapshot = fresh();
    const noSheets = { ...snapshot, blocks: snapshot.blocks.filter((block) => block.location_id === null) };
    expect(resumeTarget(noSheets, null)).toBeNull();
  });
});

describe('12.2-UNIT nextTextSection', () => {
  it('walks the text sections 2 → 4 → 5 → 6 in Sumário order and stops on the last', () => {
    const snapshot = fresh();
    const sections = sectionBlocks(snapshot.blocks);
    const byType = (type: string) => sections.find((block) => block.block_type === type)!.id;
    expect(nextTextSection(snapshot, byType('section_2'))).toBe(byType('section_4'));
    expect(nextTextSection(snapshot, byType('section_4'))).toBe(byType('section_5'));
    expect(nextTextSection(snapshot, byType('section_5'))).toBe(byType('section_6'));
    expect(nextTextSection(snapshot, byType('section_6'))).toBeNull();
    expect(nextTextSection(snapshot, 'not-a-block')).toBeNull();
  });

  it('follows a move: section 6 moved above section 2 is no longer after it', () => {
    const snapshot = fresh();
    const sections = sectionBlocks(snapshot.blocks);
    const s2 = sections.find((block) => block.block_type === 'section_2')!;
    const s6 = sections.find((block) => block.block_type === 'section_6')!;
    const moved = { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === s6.id ? { ...block, order_key: '0' } : block)) };
    expect(nextTextSection(moved, s6.id)).toBe(s2.id);
  });
});

describe('12.2-UNIT calendarDateOfInstant', () => {
  it('is the São Paulo calendar date, not the UTC one', () => {
    expect(calendarDateOfInstant(new Date('2026-09-25T12:00:00.000Z'))).toBe('2026-09-25');
    // 01:30 UTC on the 26th is still 22:30 on the 25th in São Paulo.
    expect(calendarDateOfInstant(new Date('2026-09-26T01:30:00.000Z'))).toBe('2026-09-25');
    expect(calendarDateOfInstant(new Date('2027-01-01T03:00:00.000Z'))).toBe('2027-01-01');
  });
});

describe('12.2-UNIT homeCards counter', () => {
  const snapshot = fresh();
  const relatorio: RelatorioRow = snapshot.relatorio;
  const base: HomeCardsInput = {
    relatorios: [relatorio],
    summary: [],
    projects: [],
    clients: [],
    templates: [],
    syncStates: [{ id: relatorio.id, complete: true, last_sync_at: null }],
    outbox: [],
    filter: null,
    online: true,
    now: new Date('2026-09-08T02:00:00.000Z'),
  };

  it('writes "n de N fichas" on a card whose relatório is on this device', () => {
    const sheets = sheetsInOrder(snapshot);
    const blocks = withBlocks(snapshot, concluded, new Set([sheets[0]!.blockId])).blocks;
    const [card] = homeCards({ ...base, blocks });
    expect(card!.counter).toEqual({ text: `1 de ${sheets.length} fichas`, state: 'pending' });
  });

  it('reads complete once every sheet is concluded', () => {
    const sheets = sheetsInOrder(snapshot);
    const blocks = withBlocks(snapshot, concluded, new Set(sheets.map((row) => row.blockId))).blocks;
    expect(homeCards({ ...base, blocks })[0]!.counter?.state).toBe('complete');
  });

  it('shows none on a card not on this device, nor when no blocks were given', () => {
    expect(homeCards({ ...base, syncStates: [], blocks: snapshot.blocks })[0]!.counter).toBeNull();
    expect(homeCards({ ...base, syncStates: [{ id: relatorio.id, complete: false, last_sync_at: null }], blocks: snapshot.blocks })[0]!.counter).toBeNull();
    expect(homeCards(base)[0]!.counter).toBeNull();
  });
});
