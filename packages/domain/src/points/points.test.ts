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
import { resolveSection8 } from '../print/section-8.ts';
import { extractPhotoRefs, photoToken, pointTextTokens } from './refs.ts';
import { hasPointSource, notTestedPointText } from './derived.ts';
import { livePoints, livePointsOfLocals, ncRowPointPositions, ncRowPointsText, newPointRow, photoCitedByText, pointMoveOrderKey, pointsCitingPhoto, pointsWithRemovedPhotos } from './checks.ts';
import { pointLinkValues } from './link.ts';
import { pointOrderText, pointsHeadingText, pointsSummary, pointsSummaryText, pointTitle, sectionEightEntries } from './summary.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';

const A = '019966b0-0070-7000-8000-00000000000a';
const B = '019966b0-0070-7000-8000-00000000000b';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0071-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
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
  const base = fresh();
  const photo = (id: string, captured_at: string, local_seq: number, removed_at: string | null = null, over: { block_id?: string; reading_kind?: 'display' } = {}) =>
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
      captured_at,
      tz_offset: -180,
      coords: null,
      local_seq,
      block_id: over.block_id ?? null,
      item_key: null,
      caption: null,
      reading_kind: over.reading_kind ?? null,
      reading_target: null,
      reading_status: 'none',
      people_in_photo: false,
    }) as RelatorioSnapshot['files'][number];

  it('numbers live "Geral" photos by (captured_at, local_seq, id), closing the gap a removed one leaves', () => {
    const numbers = numberPhotos({
      ...base,
      files: [
        photo(B, '2026-09-07T10:00:00.000Z', 2),
        photo(A, '2026-09-07T10:00:00.000Z', 1),
        photo('019966b0-0070-7000-8000-00000000000c', '2026-09-07T09:00:00.000Z', 9, T0.toISOString()),
        photo('019966b0-0070-7000-8000-00000000000d', '2026-09-07T11:00:00.000Z', 3),
        { id: '019966b0-0070-7000-8000-00000000000e', relatorio_id: base.relatorio.id, kind: 'logo', sha256: 'x', mime: 'image/png', size: 1, uploaded_at: null, variants: null, removed_at: null } as RelatorioSnapshot['files'][number],
      ],
    });
    expect([...numbers.entries()]).toEqual([
      [A, 1],
      [B, 2],
      ['019966b0-0070-7000-8000-00000000000d', 3],
    ]);
    expect(photoRefLabel(12)).toBe('Imagem 12');
  });

  it('17.4: a cited display shot of a sheet is numbered after the "Geral" photos, resolves as "Imagem N" and is never a removed photo', () => {
    const chave = base.blocks.find((block) => block.block_type === 'chave_seccionadora')!;
    const D = '019966b0-0070-7000-8000-0000000000dd';
    const cites = point(base, { text: `Leitura em ${photoToken(D)}`, action: null });
    const snapshot = withPoints({ ...base, files: [photo(D, '2026-09-07T08:00:00.000Z', 1, null, { block_id: chave.id, reading_kind: 'display' }), photo(A, '2026-09-07T10:00:00.000Z', 2)] }, cites);
    const numbers = numberPhotos(snapshot);
    expect([...numbers.entries()]).toEqual([
      [A, 1],
      [D, 2],
    ]);
    expect(resolveSection8(snapshot, numbers)).toEqual([{ kind: 'point', text: 'Leitura em Imagem 2', point_id: cites.id }]);
    expect(pointsWithRemovedPhotos(snapshot)).toEqual([]);
  });
});

// Fix batch e24h (Matheus, 2026-11-10): an untested sheet lists nothing until the technician
// creates its point ("Criar ponto" on its band); ~~6.6-UNIT derivedPoints~~ and ~~groupDerivedPoints~~
// went with the automatic entries.
describe('6.6-UNIT an untested sheet (fix batch e24h)', () => {
  const base = fresh();

  it('lists nothing by itself; the finding stands for the parecer and the point written from its band lists', () => {
    const marked = withNotTested(base, { 3: notTested('outro', ' Sem acesso à sala '), 1: notTested('impossibilidade_desligamento') });
    expect(sectionEightEntries(marked)).toEqual([]);
    expect(hasPointSource(marked)).toBe(true);
    const block = marked.blocks.find((row) => row.id === sheetOrder(marked)[1]!.blockId)!;
    const own = point(marked, { origin: 'not_tested', equipment_id: block.equipment_id, text: notTestedPointText(block) });
    expect(own.text).toMatch(/^Não foi possível realizar os ensaios elétricos/);
    expect(sectionEightEntries(withPoints(marked, own)).map((entry) => entry.kind)).toEqual(['point']);
    expect(snapshotPointIds(withPoints(marked, own))).toEqual([own.id]);
  });

  it('starts its point with the seed\'s justification, the typed text for "Outro"', () => {
    const marked = withNotTested(base, { 0: notTested('solicitacao_cliente'), 1: notTested('outro', ' Sala trancada ') });
    const order = sheetOrder(marked);
    expect(notTestedPointText(marked.blocks.find((row) => row.id === order[0]!.blockId)!)).toBe('Os ensaios não foram realizados conforme solicitação do cliente.');
    expect(notTestedPointText(marked.blocks.find((row) => row.id === order[1]!.blockId)!)).toBe('Sala trancada');
  });
});

const snapshotPointIds = (snapshot: RelatorioSnapshot) => sectionEightEntries(snapshot).map((entry) => entry.point.id);

describe('6.6-UNIT pointsSummary and row 8', () => {
  const base = fresh();
  const marked = withNotTested(base, {
    0: notTested('solicitacao_cliente'),
    2: notTested('solicitacao_cliente'),
    4: notTested('impossibilidade_desligamento'),
  });

  // Story 15.2 (F34): ~~"2 pontos + 3 automáticos · 1 sem ação"~~; fix batch e24h: the three untested sheets count nothing.
  it('reads "2 pontos · 1 sem ação" for 2 manual (1 without action) beside 3 untested sheets', () => {
    const first = point(marked, { action: 'Instalar plaquetas' });
    const snapshot = withPoints(marked, first, point(withPoints(marked, first), { action: '  ' }));
    const summary = pointsSummary(snapshot);
    expect(summary).toEqual({ total: 2, semAcao: 1, naoEnsaiadas: 0 });
    expect(pointsSummaryText(summary)).toBe('2 pontos · 1 sem ação');
    const computed = progress(snapshot);
    const row8 = sumarioRows(snapshot, preIssue(snapshot, computed), computed).find((row) => row.rowKey === 'section_8')!;
    expect(row8.meta).toBe('2 pontos · 1 sem ação · 2 pontos sem prazo');
    expect(row8.kind).toBe('generated');
    expect(row8.pending).toBe(true);
    expect(preIssue(snapshot, computed).filter((row) => row.row === 'section_8')).toEqual([
      { id: 'points_sem_acao', row: 'section_8', severity: 'pending', text: '1 ponto sem ação', kind: 'points_sem_acao' },
      { id: 'points_sem_prazo', row: 'section_8', severity: 'info', text: '2 pontos sem prazo', kind: 'points_sem_prazo' },
    ]);
  });

  it('omits the parts that are 0, and names an empty section 8', () => {
    expect(pointsSummaryText({ total: 0, semAcao: 0, naoEnsaiadas: 0 })).toBe('Nenhum ponto de atenção');
    // A live point written from a sheet still untested.
    expect(pointsSummaryText({ total: 1, semAcao: 0, naoEnsaiadas: 1 })).toBe('1 ponto · 1 não ensaiada');
    expect(pointsSummaryText({ total: 2, semAcao: 2, naoEnsaiadas: 0 })).toBe('2 pontos · 2 sem ação');
    expect(pointsSummaryText({ total: 3, semAcao: 0, naoEnsaiadas: 0 })).toBe('3 pontos');
    const computed = progress(base);
    const row8 = sumarioRows(base, preIssue(base, computed), computed).find((row) => row.rowKey === 'section_8')!;
    expect(row8.meta).toBe('Nenhum ponto de atenção');
    expect(row8.pending).toBe(false);
  });

  // ~~15.2-UNIT F34: counts the automatic point once, after the live points~~ (fix batch e24h: no automatic point).
  it('counts a stored not_tested point as não ensaiada, never as sem ação', () => {
    const block = marked.blocks.find((row) => row.id === sheetOrder(marked)[0]!.blockId)!;
    const snapshot = withPoints(marked, point(marked, { origin: 'not_tested', equipment_id: block.equipment_id, action: null }));
    // Fix batch e24h: the two other untested sheets count nothing; the live point from an untested sheet is "não ensaiada".
    expect(pointsSummary(snapshot)).toEqual({ total: 1, semAcao: 0, naoEnsaiadas: 1 });
    expect(pointsSummaryText(pointsSummary(snapshot))).toBe('1 ponto · 1 não ensaiada');
    // Once that sheet is tested again, its stored point stays but is no longer "não ensaiada".
    expect(pointsSummary(withNotTested(snapshot, { 0: null }))).toEqual({ total: 1, semAcao: 0, naoEnsaiadas: 0 });
    expect(pointsSummaryText(pointsSummary(withNotTested(snapshot, { 0: null })))).toBe('1 ponto');
  });

  it('writes the heading and the order line', () => {
    expect(pointsHeadingText(0)).toBe('Pontos de atenção');
    expect(pointsHeadingText(4)).toBe('Pontos de atenção (4)');
    // ~~"Pontos de atenção (4 + 1 automático)"~~ (fix batch e24h: no automatic point).
    expect(pointOrderText(1, 4)).toBe('1 de 4');
  });

  it('titles a point by its equipment, else "Geral"', () => {
    const order = sheetOrder(base);
    const block = base.blocks.find((row) => row.id === order[0]!.blockId)!;
    expect(pointTitle({ equipment_id: null }, base)).toBe('Geral');
    expect(pointTitle({ equipment_id: block.equipment_id }, base)).toBe(`${order[0]!.name} · Cubículo Enel`);
    expect(pointTitle({ equipment_id: '019966b0-0070-7000-8000-0000000000ff' }, base)).toBe('Geral');
  });

  it('Story 20.4: the title follows a relink written as both fields (equipment, local, Geral)', () => {
    const order = sheetOrder(base);
    const equipmentId = base.blocks.find((row) => row.id === order[0]!.blockId)!.equipment_id;
    const local = base.locations.find((row) => row.kind === 'cabine' && row.name === '1° Subsolo')!;
    const geral = point(base, { equipment_id: null, location_id: null });
    expect(pointTitle(geral, base)).toBe('Geral');
    const toEquipment = { ...geral, ...pointLinkValues({ equipmentId, locationId: null }) };
    expect(pointTitle(toEquipment, base)).toBe(`${order[0]!.name} · Cubículo Enel`);
    const toLocal = { ...toEquipment, ...pointLinkValues({ equipmentId: null, locationId: local.id }) };
    expect(pointTitle(toLocal, base)).toBe('1° Subsolo · Verificações do local');
    expect(pointTitle({ ...toLocal, ...pointLinkValues({ equipmentId: null, locationId: null }) }, base)).toBe('Geral');
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
    expect(row8.meta).toBe('3 pontos · Ponto 2 cita uma foto removida · 3 pontos sem prazo');
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
    const key = pointMoveOrderKey(points, base.locations, two.id, 0)!;
    expect(livePoints([three, one, { ...two, order_key: key }]).map((row) => row.id)).toEqual([two.id, one.id, three.id]);
    expect(pointMoveOrderKey(points, base.locations, one.id, 0)).toBeNull();
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

  // ~~Story 22.5: the fixture's 18 sheets with a reading out of criterion each list their test.~~ Fix batch e24h: they list nothing.
  it('lists its seven stored points in stored order, and nothing for its 18 sheets with a reading out of criterion', () => {
    expect(hasPointSource(snapshot)).toBe(true);
    const entries = sectionEightEntries(snapshot);
    expect(entries).toHaveLength(7);
    expect(entries.slice(0, 7).every((entry) => entry.kind === 'point')).toBe(true);
    const stored = [...snapshot.points].sort((a, b) => (a.order_key < b.order_key ? -1 : 1)).map((row) => row.id);
    expect(entries.slice(0, 7).map((entry) => (entry.kind === 'point' ? entry.point.id : ''))).toEqual(stored);
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

  it('ncRowPointPositions: the equipment points citing the item photos; an item with no photo gets no mark', () => {
    const points = rows(
      { equipment_id: EQ, text: `Oxidação ${photoToken(A)}` },
      { equipment_id: EQ, text: 'Sem foto' },
      { equipment_id: OTHER, text: 'Outro equipamento' },
      { equipment_id: null, text: 'Geral' },
      { equipment_id: EQ, text: 'Não ensaiado', origin: 'not_tested' },
    );
    expect(ncRowPointPositions(points, EQ, [A])).toEqual([1]);
    expect(ncRowPointPositions(points, EQ, [B])).toEqual([]);
    // Two NC items with no photo on one sheet: a point from one never marks the other.
    expect(ncRowPointPositions(points, EQ, [])).toEqual([]);
    expect(ncRowPointPositions(points, null, [])).toEqual([]);
    expect(ncRowPointsText([])).toBeNull();
    expect(ncRowPointsText([1])).toBe('Ponto de atenção 1');
    expect(ncRowPointsText([1, 2, 4])).toBe('Pontos de atenção 1, 2 e 4');
  });
});

describe('Epic 14 QA Q-2: a point on a removed local holds no slot', () => {
  const base = fresh();
  // A root local with a coluna under it.
  const local = base.locations.find((location) => location.parent_id === null && base.locations.some((child) => child.parent_id === location.id))!;
  // H is a site point created first on the local; A and B are manual points after it.
  const site = point(base, { location_id: local.id });
  const a = point(withPoints(base, site), {});
  const b = point(withPoints(base, site, a), {});
  const points = [site, a, b];
  const removed = base.locations.map((location) => (location.id === local.id ? { ...location, removed_at: T0.toISOString() } : location));

  it('reads the points section 8 draws from raw rows: the snapshot rule over the location rows', () => {
    expect(livePointsOfLocals(points, base.locations).map((row) => row.id)).toEqual([site.id, a.id, b.id]);
    expect(livePointsOfLocals(points, removed).map((row) => row.id)).toEqual([a.id, b.id]);
    // A coluna under the removed local is hidden too, and so is a point naming it.
    const coluna = base.locations.find((location) => location.parent_id === local.id)!;
    expect(livePointsOfLocals([{ ...site, location_id: coluna.id }, a], removed).map((row) => row.id)).toEqual([a.id]);
  });

  it('moves A down past B while the removed local still holds H: one key, A lands 2 de 2', () => {
    const key = pointMoveOrderKey(points, removed, a.id, 1);
    expect(key).not.toBeNull();
    const moved = livePointsOfLocals([site, { ...a, order_key: key! }, b], removed).map((row) => row.id);
    expect(moved).toEqual([b.id, a.id]);
    // With the local live, the same move is a different slot (H holds the first one).
    expect(pointMoveOrderKey(points, base.locations, a.id, 1)).toBeNull();
  });
});
