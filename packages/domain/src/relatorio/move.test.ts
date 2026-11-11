import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { takesBlocks } from './local.ts';
import { blockMovedToText, moveTagQuestion, moveTagSuggestion, moveTargets, movePlan, renameToText } from './move.ts';
import { locationBlocks } from './tree.ts';

function relatorio() {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0050-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    // Story 24.8: the TAGs these cases name are the rule's before it.
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId: idSequence('019966b0-0051-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d) => makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0052-7000-8000-'), now: T0 }));
  const snapshot = buildSnapshot(replay(ops.map((op, i) => ({ ...op, seq: i + 1 }))), relatorioId);
  // The standard template holds cabines and colunas only: every location takes blocks.
  const byName = (name: string) => snapshot.locations.filter(takesBlocks).find((row) => row.name === name)!;
  const tagOf = (block: BlockRow) => snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;
  return { snapshot, byName, tagOf };
}

const { snapshot, byName, tagOf } = relatorio();
const coluna5 = byName('Coluna 5');
const coluna9 = byName('Coluna 9');
const sec = locationBlocks(snapshot.blocks, coluna5.id).find((block) => block.block_type === 'chave_seccionadora')!;
const own = (block: BlockRow): EquipmentRow => snapshot.equipment.find((row) => row.id === block.equipment_id)!;

describe('11.2-UNIT moveTargets', () => {
  it('lists every live location in tree order by its path, the block own location left out', () => {
    const targets = moveTargets(snapshot.locations, sec);
    expect(targets).toHaveLength(snapshot.locations.length - 1);
    expect(targets.some((row) => row.id === coluna5.id)).toBe(false);
    expect(targets.find((row) => row.id === coluna9.id)!.label).toBe('1° Subsolo › Coluna 9');
    expect(targets[0]!.kind).toBe('cabine');
  });

  it('never lists a removed location', () => {
    const locations: LocationRow[] = snapshot.locations.map((row) => (row.id === coluna9.id ? { ...row, removed_at: T0.toISOString() } : row));
    expect(moveTargets(locations, sec).some((row) => row.id === coluna9.id)).toBe(false);
  });
});

describe('24.8-UNIT moveTagSuggestion (was 11.2-UNIT): a move offers no TAG rename', () => {
  it('is null for every type: the suggestion no longer depends on the local', () => {
    expect(tagOf(sec)).toBe('SEC-C05');
    expect(moveTagSuggestion()).toBeNull();
    // A move with the rename asked for keeps the TAG, for every type the template holds.
    for (const block of snapshot.blocks.filter((row) => row.equipment_id !== null && row.location_id !== coluna9.id)) {
      const plan = movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, blocks: snapshot.blocks, locations: snapshot.locations, equipment: snapshot.equipment, blockId: block.id, targetId: coluna9.id, rename: true });
      expect(plan).toMatchObject({ kind: 'move', rename: null, text: `${own(block).tag} movida para a Coluna 9` });
    }
  });
});

describe('11.2-UNIT texts', () => {
  it('words the move for a coluna and a cabine', () => {
    expect(blockMovedToText('SEC-C05', { kind: 'coluna', name: 'Coluna 9' })).toBe('SEC-C05 movida para a Coluna 9');
    expect(blockMovedToText('DJ-OXIGENIO', { kind: 'cabine', name: 'Oxigênio' })).toBe('DJ-OXIGENIO movida para Oxigênio');
    expect(moveTagQuestion({ name: 'Coluna 9' })).toBe('Sugerir TAG para Coluna 9?');
    expect(renameToText('SEC-C09')).toBe('Renomear para SEC-C09');
  });
});

describe('11.2-UNIT movePlan', () => {
  const base = { blocks: snapshot.blocks, locations: snapshot.locations, equipment: snapshot.equipment, blockId: sec.id, targetId: coluna9.id };

  it('keeps the TAG and lands after the target last block', () => {
    const plan = movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, rename: false });
    expect(plan).toMatchObject({ kind: 'move', blockId: sec.id, targetId: coluna9.id, rename: null, text: 'SEC-C05 movida para a Coluna 9' });
    const coluna1 = byName('Coluna 1');
    const into1 = movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, targetId: coluna1.id, rename: false });
    const last = locationBlocks(snapshot.blocks, coluna1.id).at(-1)!;
    expect(into1.kind === 'move' && into1.orderKey > last.order_key).toBe(true);
  });

  it('Story 24.8 (was "renames with the suggestion computed now"): a rename asked for writes none and names the TAG it keeps', () => {
    expect(movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, rename: true })).toMatchObject({ kind: 'move', rename: null, text: 'SEC-C05 movida para a Coluna 9' });
  });

  it('names the block by its type when it has no live equipment row or a blank TAG', () => {
    const noEquipment = snapshot.equipment.filter((row) => row.id !== sec.equipment_id);
    expect(movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, equipment: noEquipment, rename: false })).toMatchObject({ text: 'Chave seccionadora movida para a Coluna 9' });
    const blank = snapshot.equipment.map((row) => (row.id === sec.equipment_id ? { ...row, tag: '  ' } : row));
    expect(movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, equipment: blank, rename: false })).toMatchObject({ text: 'Chave seccionadora movida para a Coluna 9' });
  });

  it('refuses a gone block, a gone target and the same location', () => {
    const removed = snapshot.blocks.map((row) => (row.id === sec.id ? { ...row, removed_at: T0.toISOString() } : row));
    expect(movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, blocks: removed, rename: false })).toEqual({ kind: 'refused', reason: 'gone' });
    const gone = snapshot.locations.filter((row) => row.id !== coluna9.id);
    expect(movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, locations: gone, rename: false })).toEqual({ kind: 'refused', reason: 'location-gone' });
    expect(movePlan({ definitions: EMPTY_DEFINITION_CONTEXT, ...base, targetId: coluna5.id, rename: false })).toEqual({ kind: 'refused', reason: 'same-location' });
  });
});
