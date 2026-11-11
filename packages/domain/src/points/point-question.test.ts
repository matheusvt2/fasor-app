import { describe, expect, it } from 'vitest';
import type { PointRow } from '../schemas/entities.ts';
import { ncRowPointPositions, pointQuestionText, pointsAskedOnLeave } from './checks.ts';

/*
 * Story 24.7 (every seed, stored points only): the points a checklist row's change asks about
 * when it leaves NC, and the question's words.
 */

const REL = '019966b0-0724-7000-8000-000000000001';
const EQ = '019966b0-0724-7000-8000-000000000002';
const OTHER_EQ = '019966b0-0724-7000-8000-000000000003';
const LOCAL = '019966b0-0724-7000-8000-000000000004';
let seq = 10;

function point(over: Partial<PointRow> = {}): PointRow {
  seq += 1;
  return {
    id: `019966b0-0724-7000-8000-0000000000${seq}`,
    relatorio_id: REL,
    text: 'Item 2 (isoladores): trinca',
    equipment_id: EQ,
    origin: 'nc',
    order_key: `a${seq}`,
    removed_at: null,
    action: null,
    priority: null,
    deadline: null,
    owner: null,
    item_key: 'isoladores',
    ...over,
  };
}

describe('24.7-UNIT pointsAskedOnLeave: the points a row asks about when it leaves NC', () => {
  const fromTap = point();
  const manual = point({ origin: 'manual', item_key: null });
  const otherItem = point({ item_key: 'bobinas' });
  const otherEquipment = point({ equipment_id: OTHER_EQ });
  const removed = point({ removed_at: '2026-11-10T12:00:00.000Z' });
  const points = [manual, fromTap, otherItem, otherEquipment, removed];

  it('a sheet row: its own `nc` point, on NC to C and on NC to N.A.', () => {
    expect(pointsAskedOnLeave(points, { equipmentId: EQ }, 'isoladores', 'NC', 'C')).toEqual([fromTap]);
    expect(pointsAskedOnLeave(points, { equipmentId: EQ }, 'isoladores', 'NC', 'NA')).toEqual([fromTap]);
  });

  it('nothing for any other change: cleared, C to NC, N.A. to C, NC to NC', () => {
    for (const [from, to] of [
      ['NC', null],
      ['C', 'NC'],
      ['NA', 'C'],
      ['NC', 'NC'],
      [null, 'C'],
    ] as const) {
      expect(pointsAskedOnLeave(points, { equipmentId: EQ }, 'isoladores', from, to)).toEqual([]);
    }
  });

  it('a manual point of the same equipment is never asked about, and a row with no stored point asks nothing', () => {
    expect(pointsAskedOnLeave([manual], { equipmentId: EQ }, 'isoladores', 'NC', 'C')).toEqual([]);
    expect(pointsAskedOnLeave([], { equipmentId: EQ }, 'isoladores', 'NC', 'C')).toEqual([]);
  });

  it('two points written from the row are both asked about, in section 8 order', () => {
    const second = point();
    expect(pointsAskedOnLeave([second, ...points], { equipmentId: EQ }, 'isoladores', 'NC', 'C').map((row) => row.id)).toEqual([fromTap.id, second.id]);
  });

  it('a point written before e24h by "Editar" on an automatic NC entry carries the same link and is asked about', () => {
    // The entry's "Editar" wrote `origin: 'nc'` with the row's item (Story 22.5), as the tap does.
    const edited = point({ text: 'Texto editado do ponto' });
    expect(pointsAskedOnLeave([edited], { equipmentId: EQ }, 'isoladores', 'NC', 'C')).toEqual([edited]);
  });

  it("a local's item: the point of that local and item", () => {
    const site = point({ equipment_id: null, location_id: LOCAL, item_key: 'extintor' });
    expect(pointsAskedOnLeave([...points, site], { locationId: LOCAL }, 'extintor', 'NC', 'C')).toEqual([site]);
    expect(pointsAskedOnLeave([...points, site], { locationId: LOCAL }, 'isoladores', 'NC', 'C')).toEqual([]);
  });
});

describe('24.7-UNIT pointQuestionText: the question names the points by their section 8 position', () => {
  const manual = point({ origin: 'manual', item_key: null });
  const first = point();
  const second = point();
  const points = [manual, first, second];

  it('one point, back to Conforme: the mock\'s words', () => {
    expect(pointQuestionText(points, [first], 'C')).toEqual({
      title: 'Remover o ponto de atenção deste item?',
      description: 'O ponto de atenção 2 foi criado a partir deste item, que agora está Conforme. Se mantiver, ele fica com a marca “Origem resolvida”.',
      removed: 'Ponto de atenção 2 removido',
    });
    // The same number the row's mark shows.
    expect(ncRowPointPositions(points, { equipmentId: EQ }, [], 'isoladores')).toEqual([2, 3]);
  });

  it('one point, to N.A., and two points', () => {
    expect(pointQuestionText(points, [first], 'NA')!.description).toBe(
      'O ponto de atenção 2 foi criado a partir deste item, que agora está marcado como Não se aplica. Se mantiver, ele fica com a marca “Origem resolvida”.',
    );
    expect(pointQuestionText(points, [first, second], 'C')).toEqual({
      title: 'Remover os pontos de atenção deste item?',
      description: 'Os pontos de atenção 2 e 3 foram criados a partir deste item, que agora está Conforme. Se mantiver, eles ficam com a marca “Origem resolvida”.',
      removed: 'Pontos de atenção 2 e 3 removidos',
    });
    expect(pointQuestionText(points, [], 'C')).toBeNull();
  });
});
