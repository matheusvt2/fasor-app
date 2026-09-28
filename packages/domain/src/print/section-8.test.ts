import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { livePoints, newPointRow } from '../points/checks.ts';
import { derivedPoints, groupDerivedPoints } from '../points/derived.ts';
import { photoToken } from '../points/refs.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import type { BlockRow, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { EMPTY_SECTION_NOTE, layoutSpec } from './layout.ts';
import { derivedGroupText, REMOVED_PHOTO_REF_TEXT, resolvePhotoTokens, resolveSection8, section8Layout } from './section-8.ts';

/*
 * 7.3-UNIT: section 8's bullets (the I/O rows S8 manual, token of a removed photo, derived,
 * none) on a relatório of the standard template and on the full Porto Seguro fixture.
 */

const A = '019966b0-0801-7000-8000-00000000000a';
const B = '019966b0-0801-7000-8000-00000000000b';
const GONE = '019966b0-0801-7000-8000-00000000000c';

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0802-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0803-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0804-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const notTested = (reason: string, text: string | null = null): BlockRow['not_tested'] => ({ reason, text, at: T0.toISOString(), by: TEST_USER });

function withNotTested(snapshot: RelatorioSnapshot, marks: Record<number, BlockRow['not_tested']>): RelatorioSnapshot {
  const order = sheetOrder(snapshot).map((node) => node.blockId);
  const byId = new Map(Object.entries(marks).map(([i, mark]) => [order[Number(i)]!, mark]));
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (byId.has(block.id) ? { ...block, not_tested: byId.get(block.id)! } : block)) };
}

let pointSeq = 0;
/** Appends a point after the live ones (its `order_key` follows them). */
function addPoint(snapshot: RelatorioSnapshot, fields: Partial<PointRow>): RelatorioSnapshot {
  pointSeq += 1;
  const row = newPointRow(
    { id: `019966b0-0805-7000-8000-${String(pointSeq).padStart(12, '0')}`, relatorioId: snapshot.relatorio.id, text: 'Texto', equipmentId: null, origin: 'manual', action: null },
    snapshot.points,
  );
  return { ...snapshot, points: [...snapshot.points, { ...row, ...fields }] };
}

const heading = { number: 8, title: 'PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES' };
const numbering = new Map([
  [A, 5],
  [B, 12],
]);

describe('7.3-UNIT-001 photo tokens', () => {
  it('replaces each token with "Imagem N" and a token of a photo the numbering lacks with the removed text', () => {
    expect(resolvePhotoTokens(`Conforme ${photoToken(A)} e ${photoToken(B)}; ver ${photoToken(GONE)}.`, numbering)).toBe('Conforme Imagem 5 e Imagem 12; ver imagem removida.');
    expect(REMOVED_PHOTO_REF_TEXT).toBe('imagem removida');
    expect(resolvePhotoTokens('Sem foto [[foto:12]].', numbering)).toBe('Sem foto [[foto:12]].');
  });
});

describe('7.3-UNIT-002 manual points', () => {
  it('S8 manual: live points in order_key order, tokens resolved, the action after one space', () => {
    let snapshot = fresh();
    snapshot = addPoint(snapshot, { text: `Trocar a chave, conforme ${photoToken(A)}.`, action: `Substituir até a próxima visita (${photoToken(B)}).` });
    snapshot = addPoint(snapshot, { text: 'Ponto removido', removed_at: '2026-09-07T10:00:00.000Z' });
    snapshot = addPoint(snapshot, { text: `Cita ${photoToken(GONE)}.`, action: '   ' });
    const moved = livePoints(snapshot.points)[1]!;
    // Moving the second live point to the front changes the print order.
    snapshot = { ...snapshot, points: snapshot.points.map((p) => (p.id === moved.id ? { ...p, order_key: '0' } : p)) };
    expect(resolveSection8(snapshot, numbering)).toEqual([
      { kind: 'point', text: 'Cita imagem removida.', point_id: moved.id },
      { kind: 'point', text: 'Trocar a chave, conforme Imagem 5. Substituir até a próxima visita (Imagem 12).', point_id: livePoints(snapshot.points)[1]!.id },
    ]);
  });

  it('a stored not_tested point prints as its own bullet, unmerged, and suppresses the derived entry of its equipment', () => {
    const base = withNotTested(fresh(), { 0: notTested('solicitacao_cliente') });
    const equipmentId = base.blocks.find((b) => b.id === sheetOrder(base)[0]!.blockId)!.equipment_id;
    const snapshot = addPoint(base, { text: 'Ensaios não realizados a pedido do cliente.', origin: 'not_tested', equipment_id: equipmentId });
    const bullets = resolveSection8(snapshot, numbering);
    expect(bullets).toEqual([{ kind: 'point', text: 'Ensaios não realizados a pedido do cliente.', point_id: snapshot.points.at(-1)!.id }]);
  });
});

describe('7.3-UNIT-003 derived entries', () => {
  it('S8 derived: one bullet per group in tree order, after the manual ones; one sheet and several', () => {
    let snapshot = withNotTested(fresh(), {
      0: notTested('impossibilidade_desligamento'),
      1: notTested('impossibilidade_desligamento'),
      2: notTested('impossibilidade_desligamento'),
      4: notTested('solicitacao_cliente'),
    });
    snapshot = addPoint(snapshot, { text: 'Manual primeiro.' });
    const entries = derivedPoints(snapshot);
    const [t1, t2, t3, t5] = entries.map((e) => e.title);
    const bullets = resolveSection8(snapshot, numbering);
    expect(bullets.map((b) => b.kind)).toEqual(['point', 'derived', 'derived']);
    expect(bullets[1]).toEqual({
      kind: 'derived',
      text: `Equipamentos não ensaiados: ${t1}, ${t2} e ${t3}. Não foi possível realizar os ensaios elétricos devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações.`,
      block_ids: entries.slice(0, 3).map((e) => e.block_id),
    });
    expect(bullets[2]!.text).toBe(`Equipamento não ensaiado: ${t5}. Os ensaios não foram realizados conforme solicitação do cliente.`);
  });

  it('"Outro" prints its typed text as a sentence; without one, the reason label', () => {
    const snapshot = withNotTested(fresh(), { 0: notTested('outro', 'Equipamento sem acesso'), 2: notTested('outro', null) });
    const entries = derivedPoints(snapshot);
    const groups = groupDerivedPoints(entries);
    expect(derivedGroupText(groups[0]!, entries)).toBe(`Equipamento não ensaiado: ${entries[0]!.title}. Equipamento sem acesso.`);
    expect(derivedGroupText(groups[1]!, entries)).toBe(`Equipamento não ensaiado: ${entries[1]!.title}. Outro.`);
  });
});

describe('7.3-UNIT-004 section 8 layout', () => {
  it('S8 none: no live point and no derived entry gives null and the empty note', () => {
    const base = fresh();
    expect(section8Layout(base, heading)).toBeNull();
    const layout = layoutSpec(base, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
    expect(layout.sections.find((s) => s.number === 8)).toEqual({ number: 8, title: heading.title, kind: 'empty', note: EMPTY_SECTION_NOTE });
  });

  it('numbers the tokens with the snapshot\'s own photos (numberPhotos, as section 7 prints them)', () => {
    const base = fresh();
    const photo = (id: string, at: string) => ({
      id,
      relatorio_id: base.relatorio.id,
      kind: 'photo' as const,
      sha256: 'x',
      mime: 'image/jpeg',
      size: 1,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: at,
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none' as const,
      people_in_photo: false,
    });
    const snapshot = addPoint({ ...base, files: [photo(B, '2026-09-06T18:00:00.000Z'), photo(A, '2026-09-06T17:00:00.000Z')] }, { text: `Ver ${photoToken(B)} e ${photoToken(A)}.` });
    expect(numberPhotos(snapshot.files).get(B)).toBe(2);
    expect(section8Layout(snapshot, heading)).toEqual({ number: 8, title: heading.title, kind: 'points', bullets: ['Ver Imagem 2 e Imagem 1.'] });
  });
});

describe('7.3-UNIT-005 section 8 on the Porto Seguro fixture', () => {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);

  it('lists its seven stored points in order_key order (four manual, three written from untested sheets) and no derived entry', () => {
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
    const section = layout.sections.find((s) => s.number === 8)!;
    expect(section.kind).toBe('points');
    if (section.kind !== 'points') return;
    const stored = livePoints(snapshot.points);
    expect(stored).toHaveLength(7);
    expect(section.bullets).toEqual(stored.map((p) => p.text));
    expect(derivedPoints(snapshot)).toEqual([]);
    expect(stored.map((p) => p.origin)).toEqual(['manual', 'manual', 'manual', 'not_tested', 'not_tested', 'not_tested', 'manual']);
  });
});
