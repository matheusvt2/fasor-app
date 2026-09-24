import { describe, expect, it } from 'vitest';
import { idSequence, TEST_USER } from '../test-support.ts';
import { countsAsEdit, editedOnDevice, editedSince, EDITED_SINCE_FAMILIES, type EditCandidate } from './edited-since.ts';

/*
 * Test 1.6-UNIT-001, second half (P1, risk R-015): AD-15's family set. Each excluded
 * family is named so a later story that adds one has to change this table on purpose.
 */

const ids = idSequence('019966b0-0004-7000-8000-');
const BLOCK = ids();
const LOCATION = ids();
const POINT = ids();
const EQUIPMENT = ids();
const FILE = ids();
const SUGGESTION = ids();
const REGISTRY = ids();
const TEMPLATE = ids();
const USER = ids();

/**
 * `countsAsEdit` reads only the path, the actor, the kind and a create's value, so the
 * candidates are written as the literal it takes rather than through `opFactory` — a
 * photo create whose `value` is a whole `file` row would say nothing more about AD-15.
 */
function op(path: string, extra: Partial<EditCandidate> = {}): EditCandidate {
  return { path, actor_id: TEST_USER, kind: 'put', value: 'x', ...extra };
}

const photo = { kind: 'photo' };

const COUNTS: ReadonlyArray<[string, EditCandidate]> = [
  ['relatorio/setup', op('relatorio/setup/local')],
  ['location', op(`location/${LOCATION}/name`)],
  ['block', op(`block/${BLOCK}/order_key`)],
  ['sheet', op(`sheet/${BLOCK}/nameplate/fabricante`)],
  ['sheet cell', op(`sheet/${BLOCK}/test/isolacao/cell/0/1`)],
  ['photo file create', op(`file/${FILE}`, { kind: 'create', value: photo })],
  ['photo caption', op(`file/${FILE}/caption`)],
  ['point', op(`point/${POINT}/text`)],
  ['equipment', op(`equipment/${EQUIPMENT}/tag`)],
];

const DOES_NOT_COUNT: ReadonlyArray<[string, EditCandidate]> = [
  ['suggestion', op(`suggestion/${SUGGESTION}/status`)],
  ['relatorio/status', op('relatorio/status', { value: 'emitido' })],
  ['registry', op(`registry/client/${REGISTRY}/name`)],
  ['template', op(`template/${TEMPLATE}/name`)],
  ['user', op(`user/${USER}/name`)],
  ['a system actor on an edit family', op(`block/${BLOCK}/order_key`, { actor_id: 'system:generate' })],
  ['a non-photo file create', op(`file/${FILE}`, { kind: 'create', value: { kind: 'certificate' } })],
  ['an unparseable path', op('nonsense/path')],
];

describe('countsAsEdit', () => {
  for (const [name, candidate] of COUNTS) {
    it(`counts ${name}`, () => {
      expect(countsAsEdit(candidate)).toBe(true);
    });
  }

  for (const [name, candidate] of DOES_NOT_COUNT) {
    it(`does not count ${name}`, () => {
      expect(countsAsEdit(candidate)).toBe(false);
    });
  }

  it('the family set is exactly AD-15 expanded, with no server-only family in it', () => {
    expect([...EDITED_SINCE_FAMILIES].some((f) => f === 'file/server')).toBe(false);
    expect([...EDITED_SINCE_FAMILIES].some((f) => f === 'equipment/last_nameplate')).toBe(false);
  });
});

describe('editedSince', () => {
  const edit = (seq: number) => ({ ...op(`block/${BLOCK}/order_key`), seq, actor_id: TEST_USER });

  it('is true for an edit after the snapshot seq', () => {
    expect(editedSince([edit(11)], 10)).toBe(true);
  });

  it('an op at exactly the snapshot seq does not count', () => {
    expect(editedSince([edit(10)], 10)).toBe(false);
  });

  it('an op with no seq has not been applied and does not count', () => {
    expect(editedSince([op(`block/${BLOCK}/order_key`)], 0)).toBe(false);
  });

  it('is false when only excluded families moved after the snapshot', () => {
    const excluded = DOES_NOT_COUNT.map(([, candidate], index) => ({ ...candidate, seq: 100 + index }));
    expect(editedSince(excluded, 10)).toBe(false);
  });

  it('is false for an empty log', () => {
    expect(editedSince([], 0)).toBe(false);
  });
});

describe('Epic 4 QA Q11 editedOnDevice', () => {
  const pulled = (seq: number, path = `block/${BLOCK}/order_key`) => ({ ...op(path), seq });

  it('is false with nothing edited past the snapshot and nothing unsent: the status and system ops of a generation do not count', () => {
    expect(editedOnDevice([pulled(10), pulled(11, 'relatorio/status'), { ...pulled(12), actor_id: 'system:generate' }], [op('relatorio/status', { value: 'emitido' })], 10)).toBe(false);
  });

  it('is true for a pulled edit past the snapshot', () => {
    expect(editedOnDevice([pulled(11)], [], 10)).toBe(true);
  });

  it('is true for an unsent edit of this device, which carries no seq yet', () => {
    expect(editedOnDevice([], [op('relatorio/setup/local')], 10)).toBe(true);
  });
});
