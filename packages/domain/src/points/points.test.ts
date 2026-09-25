import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import type { BlockRow, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { progress } from '../relatorio/progress.ts';
import { sumarioRows } from '../relatorio/sumario.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { numberPhotos, photoRefLabel } from '../photos/numbering.ts';
import { extractPhotoRefs, photoToken, pointTextTokens } from './refs.ts';
import { derivedPointReasonText, derivedPoints, groupDerivedPoints, notTestedPointText, type DerivedPoint } from './derived.ts';
import { livePoints, ncRowPointPositions, ncRowPointsText, newPointRow, photoCitedByText, pointMoveOrderKey, pointsCitingPhoto, pointsWithRemovedPhotos } from './checks.ts';
import { pointOrderText, pointsHeadingText, pointsSummary, pointsSummaryText, pointTitle, sectionEightEntries } from './summary.ts';

const A = '019966b0-0070-7000-8000-00000000000a';
const B = '019966b0-0070-7000-8000-00000000000b';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0071-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0072-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0073-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const notTested = (reason: string, text: string | null = null): BlockRow['not_tested'] => ({ reason, text, at: T0.toISOString(), by: TEST_USER });

/** The snapshot with the given sheets (tree order indexes) marked Não ensaiado. */
function withNotTested(snapshot: RelatorioSnapshot, marks: Record<number, BlockRow['not_tested']>): RelatorioSnapshot {
  const order = sheetOrder(snapshot).map((node) => node.blockId);
  const byId = new Map(Object.entries(marks).map(([i, mark]) => [order[Number(i)]!, mark]));
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (byId.has(block.id) ? { ...block, not_tested: byId.get(block.id)! } : block)) };
}

let pointSeq = 0;
function point(snapshot: RelatorioSnapshot, fields: Partial<PointRow>): PointRow {
  pointSeq += 1;
  const row = newPointRow(
    {
      id: `019966b0-0074-7000-8000-${String(pointSeq).padStart(12, '0')}`,
      relatorioId: snapshot.relatorio.id,
      text: 'Texto',
      equipmentId: null,
      origin: 'manual',
      action: 'Agir',
    },
    snapshot.points,
  );
  return { ...row, ...fields };
}

const withPoints = (snapshot: RelatorioSnapshot, ...points: PointRow[]): RelatorioSnapshot => ({ ...snapshot, points: [...snapshot.points, ...points] });

describe('6.6-UNIT photo tokens', () => {
  it('extracts the referenced photos in first-seen order, each once', () => {
    expect(extractPhotoRefs(`Ver ${photoToken(A)} e ${photoToken(B)} e ${photoToken(A)}`)).toEqual([A, B]);
  });

  it('reads a malformed token or a non-uuid id as plain text', () => {
    expect(extractPhotoRefs('Ver [[foto:]] e [[foto:12]] e [[foto:abc]]')).toEqual([]);
    expect(pointTextTokens('Ver [[foto:]] aqui')).toEqual([{ kind: 'text', text: 'Ver [[foto:]] aqui' }]);
  });

  it('splits a text into literal runs and photo tokens', () => {
    expect(pointTextTokens(`Ver ${photoToken(A)}.`)).toEqual([
      { kind: 'text', text: 'Ver ' },
      { kind: 'photo', id: A },
      { kind: 'text', text: '.' },
    ]);
    expect(pointTextTokens(photoToken(A))).toEqual([{ kind: 'photo', id: A }]);
    expect(pointTextTokens('')).toEqual([]);
  });
});

describe('6.6-UNIT numberPhotos', () => {
  const photo = (id: string, captured_at: string, local_seq: number, removed_at: string | null = null) => ({ id, kind: 'photo', captured_at, local_seq, removed_at });

  it('numbers live photos by (captured_at, local_seq, id), closing the gap a removed one leaves', () => {
    const numbers = numberPhotos([
      photo(B, '2026-09-07T10:00:00.000Z', 2),
      photo(A, '2026-09-07T10:00:00.000Z', 1),
      photo('019966b0-0070-7000-8000-00000000000c', '2026-09-07T09:00:00.000Z', 9, T0.toISOString()),
      photo('019966b0-0070-7000-8000-00000000000d', '2026-09-07T11:00:00.000Z', 3),
      { id: '019966b0-0070-7000-8000-00000000000e', kind: 'logo', removed_at: null },
    ]);
    expect([...numbers.entries()]).toEqual([
      [A, 1],
      [B, 2],
      ['019966b0-0070-7000-8000-00000000000d', 3],
    ]);
    expect(photoRefLabel(12)).toBe('Imagem 12');
  });
});

describe('6.6-UNIT derivedPoints', () => {
  const base = fresh();

  it('lists an untested sheet after the manual points, in tree order, with its reason and justification; never stored', () => {
    const snapshot = withPoints(
      withNotTested(base, { 3: notTested('outro', ' Sem acesso à sala '), 1: notTested('impossibilidade_desligamento') }),
      point(base, {}),
    );
    const derived = derivedPoints(snapshot);
    const order = sheetOrder(snapshot);
    expect(derived.map((entry) => entry.block_id)).toEqual([order[1]!.blockId, order[3]!.blockId]);
    expect(derived[0]).toMatchObject({ reason_key: 'impossibilidade_desligamento', reason_label: 'Impossibilidade de desligamento' });
    expect(derived[0]!.justification).toMatch(/^Não foi possível realizar os ensaios elétricos/);
    expect(derived[1]).toMatchObject({ reason_key: 'outro', reason_label: 'Outro', justification: 'Sem acesso à sala' });
    expect(derived[0]!.title).toBe(`${order[1]!.name} · Cubículo Enel`);
    const entries = sectionEightEntries(snapshot);
    expect(entries.map((entry) => entry.kind)).toEqual(['point', 'derived', 'derived']);
    expect(snapshot.points).toHaveLength(1);
  });

  it('is suppressed by a live not_tested point of the same equipment, and comes back when that point is removed', () => {
    const marked = withNotTested(base, { 0: notTested('solicitacao_cliente') });
    const block = marked.blocks.find((row) => row.id === sheetOrder(marked)[0]!.blockId)!;
    const own = point(marked, { origin: 'not_tested', equipment_id: block.equipment_id, text: notTestedPointText(block) });
    expect(own.text).toBe('Os ensaios não foram realizados conforme solicitação do cliente.');
    expect(derivedPoints(withPoints(marked, own))).toEqual([]);
    expect(derivedPoints(withPoints(marked, { ...own, removed_at: T0.toISOString() }))).toHaveLength(1);
    // A manual point on the same equipment suppresses nothing.
    expect(derivedPoints(withPoints(marked, { ...own, origin: 'manual' }))).toHaveLength(1);
  });

  it('never suppresses a block with no equipment', () => {
    const marked = withNotTested(base, { 0: notTested('solicitacao_cliente') });
    const id = sheetOrder(marked)[0]!.blockId;
    const orphan = { ...marked, blocks: marked.blocks.map((block) => (block.id === id ? { ...block, equipment_id: null } : block)) };
    expect(derivedPoints(withPoints(orphan, point(orphan, { origin: 'not_tested', equipment_id: null })))).toHaveLength(1);
  });

  it('goes away once the sheet is tested again', () => {
    const marked = withNotTested(base, { 0: notTested('solicitacao_cliente') });
    expect(derivedPoints(marked)).toHaveLength(1);
    expect(derivedPoints(withNotTested(marked, { 0: null }))).toEqual([]);
  });

  it('names the band text: reason and justification, the typed text alone for "Outro"', () => {
    expect(derivedPointReasonText({ reason_key: 'solicitacao_cliente', reason_label: 'Solicitação do cliente', justification: 'J.' })).toBe('Solicitação do cliente — J.');
    expect(derivedPointReasonText({ reason_key: 'outro', reason_label: 'Outro', justification: 'Sala trancada' })).toBe('Sala trancada');
    expect(derivedPointReasonText({ reason_key: 'outro', reason_label: 'Outro', justification: null })).toBe('Outro');
  });
});

describe('6.6-UNIT groupDerivedPoints (E3-A9 bullet 4)', () => {
  const entry = (block_id: string, reason_key: string, justification: string | null): DerivedPoint => ({
    block_id,
    equipment_id: null,
    name: block_id,
    title: block_id,
    reason_key,
    reason_label: reason_key,
    justification,
  });

  it('merges consecutive entries with the same reason and justification, and only consecutive ones', () => {
    expect(
      groupDerivedPoints([entry('1', 'r', 'J'), entry('2', 'r', 'J'), entry('3', 'r', 'K'), entry('4', 's', 'K'), entry('5', 'r', 'J')]),
    ).toEqual([
      { reason_key: 'r', justification: 'J', block_ids: ['1', '2'] },
      { reason_key: 'r', justification: 'K', block_ids: ['3'] },
      { reason_key: 's', justification: 'K', block_ids: ['4'] },
      { reason_key: 'r', justification: 'J', block_ids: ['5'] },
    ]);
    expect(groupDerivedPoints([])).toEqual([]);
  });
});

describe('6.6-UNIT pointsSummary and row 8', () => {
  const base = fresh();
  const marked = withNotTested(base, {
    0: notTested('solicitacao_cliente'),
    2: notTested('solicitacao_cliente'),
    4: notTested('impossibilidade_desligamento'),
  });

  it('reads "5 pontos · 1 sem ação · 3 não ensaiadas" for 2 manual (1 without action) and 3 derived', () => {
    const first = point(marked, { action: 'Instalar plaquetas' });
    const snapshot = withPoints(marked, first, point(withPoints(marked, first), { action: '  ' }));
    const summary = pointsSummary(snapshot);
    expect(summary).toEqual({ total: 5, semAcao: 1, naoEnsaiadas: 3 });
    expect(pointsSummaryText(summary)).toBe('5 pontos · 1 sem ação · 3 não ensaiadas');
    const computed = progress(snapshot);
    const row8 = sumarioRows(snapshot, preIssue(snapshot, computed), computed).find((row) => row.rowKey === 'section_8')!;
    expect(row8.meta).toBe('5 pontos · 1 sem ação · 3 não ensaiadas');
    expect(row8.kind).toBe('generated');
    expect(row8.pending).toBe(true);
    expect(preIssue(snapshot, computed).filter((row) => row.row === 'section_8')).toEqual([
      { id: 'points_sem_acao', row: 'section_8', severity: 'pending', text: '1 ponto sem ação', kind: 'points_sem_acao' },
    ]);
  });

  it('omits the parts that are 0, and names an empty section 8', () => {
    expect(pointsSummaryText({ total: 0, semAcao: 0, naoEnsaiadas: 0 })).toBe('Nenhum ponto de atenção');
    expect(pointsSummaryText({ total: 1, semAcao: 0, naoEnsaiadas: 1 })).toBe('1 ponto · 1 não ensaiada');
    expect(pointsSummaryText({ total: 2, semAcao: 2, naoEnsaiadas: 0 })).toBe('2 pontos · 2 sem ação');
    const computed = progress(base);
    const row8 = sumarioRows(base, preIssue(base, computed), computed).find((row) => row.rowKey === 'section_8')!;
    expect(row8.meta).toBe('Nenhum ponto de atenção');
    expect(row8.pending).toBe(false);
  });

  it('counts a stored not_tested point as não ensaiada, never as sem ação', () => {
    const block = marked.blocks.find((row) => row.id === sheetOrder(marked)[0]!.blockId)!;
    const snapshot = withPoints(marked, point(marked, { origin: 'not_tested', equipment_id: block.equipment_id, action: null }));
    expect(pointsSummary(snapshot)).toEqual({ total: 3, semAcao: 0, naoEnsaiadas: 3 });
    // Once that sheet is tested again, its stored point stays but is no longer "não ensaiada".
    expect(pointsSummary(withNotTested(snapshot, { 0: null }))).toEqual({ total: 3, semAcao: 0, naoEnsaiadas: 2 });
  });

  it('writes the heading and the order line', () => {
    expect(pointsHeadingText(0, 0)).toBe('Pontos de atenção');
    expect(pointsHeadingText(4, 0)).toBe('Pontos de atenção (4)');
    expect(pointsHeadingText(4, 1)).toBe('Pontos de atenção (4 + 1 automático)');
    expect(pointsHeadingText(0, 2)).toBe('Pontos de atenção (0 + 2 automáticos)');
    expect(pointOrderText(1, 4)).toBe('1 de 4');
  });

  it('titles a point by its equipment, else "Geral"', () => {
    const order = sheetOrder(base);
    const block = base.blocks.find((row) => row.id === order[0]!.blockId)!;
    expect(pointTitle({ equipment_id: null }, base)).toBe('Geral');
    expect(pointTitle({ equipment_id: block.equipment_id }, base)).toBe(`${order[0]!.name} · Cubículo Enel`);
    expect(pointTitle({ equipment_id: '019966b0-0070-7000-8000-0000000000ff' }, base)).toBe('Geral');
  });
});

describe('6.6-UNIT a token citing a removed photo', () => {
  const base = fresh();
  const file = (id: string, removed_at: string | null) =>
    ({
      id,
      relatorio_id: base.relatorio.id,
      kind: 'photo',
      sha256: 'x',
      mime: 'image/jpeg',
      size: 1,
      uploaded_at: null,
      variants: null,
      removed_at,
      captured_at: T0.toISOString(),
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
    }) as RelatorioSnapshot['files'][number];

  it('flags one pending row per point whose text cites a photo that is removed or absent', () => {
    const one = point(base, { text: `Ver ${photoToken(A)}` });
    const two = { ...point(withPoints(base, one), { text: `Ver ${photoToken(B)} e ${photoToken(B)}` }) };
    const three = point(withPoints(base, one, two), { text: 'Sem foto' });
    const snapshot = { ...withPoints(base, one, two, three), files: [file(A, null), file(B, T0.toISOString())] };
    expect(pointsWithRemovedPhotos(snapshot).map((entry) => entry.position)).toEqual([2]);
    const rows = preIssue(snapshot).filter((row) => row.kind === 'point_photo_removed');
    expect(rows).toEqual([{ id: `point_photo_removed:${two.id}`, row: 'section_8', severity: 'pending', text: 'Ponto 2 cita uma foto removida', kind: 'point_photo_removed' }]);
    // An absent file (never on this device, or gone from the snapshot) counts as removed too.
    expect(pointsWithRemovedPhotos({ ...snapshot, files: [] }).map((entry) => entry.position)).toEqual([1, 2]);
    const computed = progress(snapshot);
    const row8 = sumarioRows(snapshot, preIssue(snapshot, computed), computed).find((row) => row.rowKey === 'section_8')!;
    expect(row8.meta).toBe('3 pontos · Ponto 2 cita uma foto removida');
  });
});

describe('6.6-UNIT new points and moves', () => {
  const base = fresh();

  it('appends a new point after every live point, and moves one by its order key', () => {
    const one = point(base, {});
    const two = point(withPoints(base, one), {});
    const three = point(withPoints(base, one, two), {});
    const points = [three, one, two];
    expect(livePoints(points).map((row) => row.id)).toEqual([one.id, two.id, three.id]);
    const key = pointMoveOrderKey(points, two.id, 0)!;
    expect(livePoints([three, one, { ...two, order_key: key }]).map((row) => row.id)).toEqual([two.id, one.id, three.id]);
    expect(pointMoveOrderKey(points, one.id, 0)).toBeNull();
    expect(newPointRow({ id: A, relatorioId: base.relatorio.id, text: '', equipmentId: null, origin: 'manual', action: null }, [])).toMatchObject({
      order_key: 'a0',
      action: null,
      priority: null,
      deadline: null,
      owner: null,
      removed_at: null,
    });
  });
});

describe('6.6-UNIT the Porto Seguro fixture', () => {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);

  it('derives nothing (its three untested sheets have their stored points) and keeps its seven entries in stored order', () => {
    expect(derivedPoints(snapshot)).toEqual([]);
    const entries = sectionEightEntries(snapshot);
    expect(entries).toHaveLength(7);
    expect(entries.every((entry) => entry.kind === 'point')).toBe(true);
    const stored = [...snapshot.points].sort((a, b) => (a.order_key < b.order_key ? -1 : 1)).map((row) => row.id);
    expect(entries.map((entry) => (entry.kind === 'point' ? entry.point.id : ''))).toEqual(stored);
    expect(snapshot.points.filter((row) => row.origin === 'manual')).toHaveLength(4);
    // Rows written before Story 6.6 parse with the new fields empty.
    expect(snapshot.points.every((row) => row.action === null && row.priority === null && row.deadline === null && row.owner === null)).toBe(true);
    expect(pointsSummary(snapshot)).toEqual({ total: 7, semAcao: 4, naoEnsaiadas: 3 });
  });
});

describe('E6-Q11 the points a photo or an NC row already has', () => {
  const EQ = '019966b0-0075-7000-8000-000000000001';
  const OTHER = '019966b0-0075-7000-8000-000000000002';
  const rows = (...fields: Partial<PointRow>[]): PointRow[] => {
    let snapshot = fresh();
    for (const f of fields) snapshot = withPoints(snapshot, point(snapshot, f));
    return snapshot.points;
  };

  it('pointsCitingPhoto: the live points citing it, by section 8 position; photoCitedByText names them', () => {
    const points = rows({ text: `Ver ${photoToken(A)}` }, { text: 'Nada' }, { text: `${photoToken(B)} e ${photoToken(A)}` }, { text: photoToken(A), removed_at: T0.toISOString() });
    expect(pointsCitingPhoto(points, A)).toEqual([1, 3]);
    expect(pointsCitingPhoto(points, '019966b0-0075-7000-8000-0000000000ff')).toEqual([]);
    expect(photoCitedByText([])).toBeNull();
    expect(photoCitedByText([2])).toBe('Ela é citada no ponto de atenção 2, que passa a mostrar Foto removida.');
    expect(photoCitedByText([1, 3])).toBe('Ela é citada nos pontos de atenção 1 e 3, que passam a mostrar Foto removida.');
  });

  it('ncRowPointPositions: the equipment points citing the item photos, or citing none when the item has none', () => {
    const points = rows(
      { equipment_id: EQ, text: `Oxidação ${photoToken(A)}` },
      { equipment_id: EQ, text: 'Sem foto' },
      { equipment_id: OTHER, text: 'Outro equipamento' },
      { equipment_id: null, text: 'Geral' },
      { equipment_id: EQ, text: 'Não ensaiado', origin: 'not_tested' },
    );
    expect(ncRowPointPositions(points, EQ, [A])).toEqual([1]);
    expect(ncRowPointPositions(points, EQ, [B])).toEqual([]);
    expect(ncRowPointPositions(points, EQ, [])).toEqual([2]);
    expect(ncRowPointPositions(points, null, [])).toEqual([]);
    expect(ncRowPointsText([])).toBeNull();
    expect(ncRowPointsText([1])).toBe('Ponto de atenção 1');
    expect(ncRowPointsText([1, 2, 4])).toBe('Pontos de atenção 1, 2 e 4');
  });
});
