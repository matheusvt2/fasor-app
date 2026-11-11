import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { resolveActionPlan, resolveSection8 } from '../print/section-8.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { cellAddressesOf } from '../relatorio/readings.ts';
import { EMPTY_DEFINITION_CONTEXT, siteItems, findDefinition } from '../seed/definitions.ts';
import type { BlockRow, Cell, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { newPointRow } from './checks.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { hasPointSource, resolvedOriginPoints, withPhotoTokens } from './derived.ts';
import { photoToken } from './refs.ts';
import { pointsSummary, pointsSummaryText, sectionEightEntries } from './summary.ts';

/*
 * ~~Story 22.5 (Bruno, 2026-11-06): every NC row (of a sheet or a local), every test out of
 * criterion and every Reprovado sheet is a derived section 8 entry, after the manual points in
 * tree order; a point written from the same source replaces it, and removing that point brings
 * it back.~~ Fix batch e24h (Matheus, 2026-11-10): the same scenarios under the new rule: a
 * finding is no point of attention until the technician creates one; it still floors the parecer
 * (`hasPointSource`) and still resolves the origin of a point written from it.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2205-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-2206-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-2207-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const cell = (value: Cell['value']): Cell => ({ value, source_suggestion_id: null, op_id: '019966b0-2208-7000-8000-000000000001' });

function edit(snapshot: RelatorioSnapshot, blockId: string, fn: (block: BlockRow) => BlockRow): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === blockId ? fn(block) : block)) };
}

function ncOn(block: BlockRow, index: number, observation: string | null = null): BlockRow {
  const item = findDefinition(block.seed_version, block.block_type)!.checklist![index]!;
  return {
    ...block,
    sheet: { ...block.sheet, checklist: { ...block.sheet.checklist, [item.key]: { result: cell('NC'), ...(observation === null ? {} : { observation: cell(observation) }) } } },
  };
}

function insulationOut(block: BlockRow): BlockRow {
  const definition = findDefinition(block.seed_version, block.block_type)!;
  const [first] = cellAddressesOf(definition, 'isolacao');
  return {
    ...block,
    sheet: { ...block.sheet, test: { ...block.sheet.test, isolacao: { cells: { [String(first!.row)]: { [String(first!.col)]: cell({ raw: '300', unit: 'MΩ', state: 'measured' }) } } } } },
  };
}

let seq = 0;
function point(snapshot: RelatorioSnapshot, fields: Partial<PointRow>): PointRow {
  seq += 1;
  const row = newPointRow({ id: `019966b0-2209-7000-8000-${String(seq).padStart(12, '0')}`, relatorioId: snapshot.relatorio.id, text: 'Manual', equipmentId: null, origin: 'manual', action: 'Agir' }, snapshot.points);
  return { ...row, ...fields };
}
const withPoints = (snapshot: RelatorioSnapshot, ...points: PointRow[]): RelatorioSnapshot => ({ ...snapshot, points: [...snapshot.points, ...points] });

/** The AC's relatório: two NC rows on the first transformer, one NC on the first local, an insulation out on the first disjuntor, one manual point. */
function scenario() {
  const base = fresh();
  const order = sheetOrder(base);
  const blockOf = (type: string) => base.blocks.find((block) => block.id === order.find((node) => base.blocks.find((b) => b.id === node.blockId)?.block_type === type)!.blockId)!;
  const trafo = blockOf('transformador_forca');
  const dj = blockOf('disjuntor_mt');
  const local = base.locations.find((row) => row.kind === 'cabine' && row.parent_id === null)!;
  const siteKey = siteItems(base.relatorio.seed_version)[2]!.key;
  let snapshot = edit(base, trafo.id, (b) => ncOn(ncOn(b, 0, 'oxidação nos terminais'), 1));
  snapshot = edit(snapshot, dj.id, insulationOut);
  snapshot = {
    ...snapshot,
    locations: snapshot.locations.map((row) => (row.id === local.id && row.kind === 'cabine' ? { ...row, checklist: { ...row.checklist, [siteKey]: { result: cell('NC') } } } : row)),
  };
  snapshot = withPoints(snapshot, point(snapshot, {}));
  return { snapshot, trafo, dj, local, siteKey };
}

describe('22.5-UNIT the derived kinds (fix batch e24h: no automatic point)', () => {
  it('two NC rows on a transformer, one NC on a local and an out insulation: section 8 holds the manual point alone', () => {
    const { snapshot } = scenario();
    expect(hasPointSource(snapshot)).toBe(true);
    expect(sectionEightEntries(snapshot).map((entry) => entry.kind)).toEqual(['point']);
    const summary = pointsSummary(snapshot);
    expect(summary).toEqual({ total: 1, semAcao: 0, naoEnsaiadas: 0 });
    expect(pointsSummaryText(summary)).toBe('1 ponto');
    const bullets = resolveSection8(snapshot, new Map());
    expect(bullets.map((bullet) => bullet.text)).toEqual(['Manual. Agir']);
    expect(resolveActionPlan(snapshot, new Map()).map((row) => row.number)).toEqual(['1']);
  });

  it('a point written from an NC row (origin nc, its item_key) is one entry; the row back to C flags it "Origem resolvida"', () => {
    const { snapshot, trafo } = scenario();
    const itemKey = findDefinition(trafo.seed_version, trafo.block_type)!.checklist![0]!.key;
    const own = point(snapshot, { origin: 'nc', equipment_id: trafo.equipment_id, item_key: itemKey, text: 'Item 1 (x): oxidação nos terminais', action: 'Limpar os terminais', deadline: '2026-12-01' });
    const replaced = withPoints(snapshot, own);
    expect(sectionEightEntries(replaced).map((entry) => entry.kind)).toEqual(['point', 'point']);
    expect(resolvedOriginPoints(replaced).size).toBe(0);
    const resolved = edit(replaced, trafo.id, (b) => ({ ...b, sheet: { ...b.sheet, checklist: { ...b.sheet.checklist, [itemKey]: { result: cell('C') } } } }));
    expect([...resolvedOriginPoints(resolved)]).toEqual([own.id]);
    expect(resolveSection8(resolved, new Map())).toHaveLength(2);
  });

  it('an old manual point on the equipment of an NC row pairs with nothing: one more entry, no flag', () => {
    const { snapshot, trafo } = scenario();
    // e22f N4: as a client older than contract 31 wrote it, with no `item_key` key at all.
    const old = point(snapshot, { origin: 'manual', equipment_id: trafo.equipment_id, text: 'Terminais oxidados' });
    delete (old as Partial<PointRow>).item_key;
    const both = withPoints(snapshot, old);
    expect(sectionEightEntries(both)).toHaveLength(2);
    expect(resolvedOriginPoints(both).size).toBe(0);
  });

  it('a sheet the engineer concluded Reprovado prints no "Equipamento reprovado" bullet', () => {
    const { snapshot, trafo } = scenario();
    const chosen = edit(snapshot, trafo.id, (b) => ({
      ...b,
      sheet: { ...b.sheet, observations: cell('Carcaça com corrosão avançada.'), conclusion: { ...b.sheet.conclusion, result: cell('reprovado'), restriction: cell('com_restricoes') } },
    }));
    expect(resolveSection8(chosen, new Map()).some((bullet) => bullet.text.startsWith('Equipamento reprovado: '))).toBe(false);
    expect(sectionEightEntries(chosen)).toHaveLength(1);
  });

  it('an NC row with a photo: no bullet cites it; "Criar ponto de atenção" still starts with its token', () => {
    const { snapshot, trafo } = scenario();
    const item = findDefinition(trafo.seed_version, trafo.block_type)!.checklist![0]!;
    const photoId = '019966b0-2210-7000-8000-000000000001';
    const photo = {
      id: photoId,
      company_id: TEST_COMPANY,
      relatorio_id: snapshot.relatorio.id,
      kind: 'photo' as const,
      sha256: '0'.repeat(64),
      mime: 'image/jpeg',
      size: 1000,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-09-07T12:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: trafo.id,
      item_key: item.key,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none' as const,
      people_in_photo: false,
    };
    const withPhoto = { ...snapshot, files: [...snapshot.files, photo] } as RelatorioSnapshot;
    const numbering = numberPhotos(withPhoto);
    expect(numbering.get(photoId)).toBeDefined();
    expect(resolveSection8(withPhoto, numbering).some((bullet) => bullet.text.includes('oxidação nos terminais'))).toBe(false);
    expect(resolveActionPlan(withPhoto, numbering).map((row) => row.images)).toEqual(['—']);
    // The seed of "Criar ponto de atenção" keeps a photo the text does not cite yet.
    expect(withPhotoTokens('Item 1', [photoId, 'other'])).toBe(`Item 1 ${photoToken(photoId)} ${photoToken('other')}`);
    expect(withPhotoTokens(`Item 1 ${photoToken(photoId)}`, [photoId])).toBe(`Item 1 ${photoToken(photoId)}`);
    expect(withPhotoTokens(null, [photoId])).toBe(photoToken(photoId));
  });

  it('a v5 relatório is under the same rule: its findings floor the parecer, none lists', () => {
    const { snapshot } = scenario();
    const v5 = { ...snapshot, relatorio: { ...snapshot.relatorio, seed_version: 'v5' }, blocks: snapshot.blocks.map((b) => ({ ...b, seed_version: 'v5' })) };
    expect(hasPointSource(v5)).toBe(true);
    expect(sectionEightEntries(v5)).toHaveLength(1);
  });
});
