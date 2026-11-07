import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { resolveActionPlan, resolveSection8 } from '../print/section-8.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { cellAddressesOf } from '../relatorio/readings.ts';
import { siteItems, findDefinition } from '../seed/definitions.ts';
import type { BlockRow, Cell, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { newPointRow } from './checks.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { derivedPoints, derivedPointKindLabel, derivedPointSeed, possibleDuplicatePoints, resolvedOriginPoints, withPhotoTokens } from './derived.ts';
import { photoToken } from './refs.ts';
import { pointsSummary, pointsSummaryText, sectionEightEntries } from './summary.ts';

/*
 * Story 22.5 (Bruno, 2026-11-06): every NC row (of a sheet or a local), every test out of
 * criterion and every Reprovado sheet is a derived section 8 entry, after the manual points in
 * tree order; a point written from the same source replaces it, and removing that point brings
 * it back.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-2205-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
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

describe('22.5-UNIT the derived kinds', () => {
  it('two NC rows on a transformer, one NC on a local and an out insulation: four entries after the manual point, in tree order, "automáticos" counting 4 more', () => {
    const { snapshot, trafo, dj, local, siteKey } = scenario();
    const entries = derivedPoints(snapshot);
    // Tree order: the local first (before its equipment), then the disjuntor, then the transformer, as section 9 orders them.
    expect(entries.map((entry) => entry.kind)).toEqual(['nc', 'reading', 'nc', 'nc']);
    expect(entries[0]).toMatchObject({ location_id: local.id, item_key: siteKey, block_id: null, equipment_id: null });
    expect(entries[1]).toMatchObject({ block_id: dj.id, test_key: 'isolacao' });
    expect(entries[1]!.text).toMatch(/^Ensaio de isolação: 300 MΩ em .+ \(critério: .+\)$/);
    expect(entries.slice(2).every((entry) => entry.block_id === trafo.id)).toBe(true);
    expect(entries[2]!.text).toBe(`Item 1 (${findDefinition(trafo.seed_version, trafo.block_type)!.checklist![0]!.label.toLocaleLowerCase('pt-BR')}): oxidação nos terminais`);
    expect(entries[3]!.text).toMatch(/^Item 2 \(.+\) não conforme$/);
    expect(sectionEightEntries(snapshot).map((entry) => entry.kind)).toEqual(['point', 'derived', 'derived', 'derived', 'derived']);
    const summary = pointsSummary(snapshot);
    expect(summary).toMatchObject({ total: 5, derived: 4, derivedNotTested: 0, naoEnsaiadas: 0 });
    expect(pointsSummaryText(summary)).toBe('1 ponto + 4 automáticos');
    // Section 8: one bullet and one action-plan row per entry, after the manual one.
    const bullets = resolveSection8(snapshot, new Map());
    expect(bullets).toHaveLength(5);
    expect(bullets[1]!.text).toMatch(/^Item não conforme: .+ · Verificações do local\. Item 3 \(.+\) não conforme\.$/);
    expect(bullets[2]!.text).toMatch(/^Ensaio fora do critério: .+\. Ensaio de isolação: 300 MΩ em .+\.$/);
    expect(bullets[3]!.text).toMatch(/^Item não conforme: .+\. Item 1 \(.+\): oxidação nos terminais\.$/);
    const plan = resolveActionPlan(snapshot, new Map());
    expect(plan.map((row) => row.number)).toEqual(['1', '2', '3', '4', '5']);
    expect(plan[2]).toMatchObject({ point: bullets[2]!.text, action: '—', images: '—' });
    expect(entries.map((entry) => derivedPointKindLabel(entry.kind))).toEqual(['Não conforme', 'Fora do critério', 'Não conforme', 'Não conforme']);
  });

  it('a point written from an NC entry (origin nc, its item_key) replaces it; removing that point brings it back; the source gone flags it "Origem resolvida"', () => {
    const { snapshot, trafo } = scenario();
    const entry = derivedPoints(snapshot).find((e) => e.kind === 'nc' && e.block_id === trafo.id)!;
    const seed = derivedPointSeed(entry);
    expect(seed).toEqual({ text: entry.text, equipmentId: trafo.equipment_id, locationId: null, origin: 'nc', itemKey: entry.item_key, testKey: null });
    const own = point(snapshot, { origin: 'nc', equipment_id: trafo.equipment_id, item_key: entry.item_key, text: seed.text, action: 'Limpar os terminais', deadline: '2026-12-01' });
    const replaced = withPoints(snapshot, own);
    expect(derivedPoints(replaced).some((e) => e.key === entry.key)).toBe(false);
    expect(derivedPoints(replaced)).toHaveLength(3);
    expect(resolvedOriginPoints(replaced).size).toBe(0);
    // Removed, the entry comes back.
    expect(derivedPoints(withPoints(snapshot, { ...own, removed_at: T0.toISOString() })).some((e) => e.key === entry.key)).toBe(true);
    // The row set back to C: no entry; the point stays, "Origem resolvida".
    const resolved = edit(replaced, trafo.id, (b) => ({ ...b, sheet: { ...b.sheet, checklist: { ...b.sheet.checklist, [entry.item_key!]: { result: cell('C') } } } }));
    expect(derivedPoints(resolved).some((e) => e.key === entry.key)).toBe(false);
    expect([...resolvedOriginPoints(resolved)]).toEqual([own.id]);
  });

  it('a reading point (origin reading, its test_key) replaces the test entry; a sheet with no equipment is never suppressed', () => {
    const { snapshot, dj } = scenario();
    const own = point(snapshot, { origin: 'reading', equipment_id: dj.equipment_id, test_key: 'isolacao' });
    expect(derivedPoints(withPoints(snapshot, own)).some((e) => e.kind === 'reading')).toBe(false);
    const orphan = edit(snapshot, dj.id, (b) => ({ ...b, equipment_id: null }));
    expect(derivedPoints(withPoints(orphan, { ...own, equipment_id: null })).some((e) => e.kind === 'reading')).toBe(true);
  });

  it('an old manual point on the equipment of an NC entry suppresses nothing: both read "Possível duplicado"', () => {
    const { snapshot, trafo } = scenario();
    // e22f N4: as a client older than contract 31 wrote it, with no `item_key` key at all.
    const old = point(snapshot, { origin: 'manual', equipment_id: trafo.equipment_id, text: 'Terminais oxidados' });
    delete (old as Partial<PointRow>).item_key;
    const both = withPoints(snapshot, old);
    expect(derivedPoints(both).filter((e) => e.block_id === trafo.id)).toHaveLength(2);
    const flags = possibleDuplicatePoints(both);
    expect([...flags.pointIds]).toEqual([old.id]);
    expect([...flags.entryKeys]).toEqual(derivedPoints(both).filter((e) => e.block_id === trafo.id).map((e) => e.key));
    // Removing the manual point leaves only the entries, unflagged.
    expect(possibleDuplicatePoints(withPoints(snapshot, { ...old, removed_at: T0.toISOString() })).entryKeys.size).toBe(0);
  });

  it('a sheet the engineer concluded Reprovado with no failure lists itself as "Equipamento reprovado"; a floor Reprovado (an out reading) does not add one', () => {
    const { snapshot, trafo, dj } = scenario();
    const chosen = edit(snapshot, trafo.id, (b) => ({
      ...b,
      sheet: { ...b.sheet, observations: cell('Carcaça com corrosão avançada.'), conclusion: { ...b.sheet.conclusion, result: cell('reprovado'), restriction: cell('com_restricoes') } },
    }));
    const reprovado = derivedPoints(chosen).filter((e) => e.kind === 'reprovado');
    expect(reprovado).toHaveLength(1);
    expect(reprovado[0]).toMatchObject({ block_id: trafo.id, text: 'Carcaça com corrosão avançada.' });
    expect(resolveSection8(chosen, new Map()).some((bullet) => bullet.text.startsWith('Equipamento reprovado: '))).toBe(true);
    const floorOnly = edit(snapshot, dj.id, (b) => ({ ...b, sheet: { ...b.sheet, conclusion: { ...b.sheet.conclusion, result: cell('reprovado') } } }));
    expect(derivedPoints(floorOnly).filter((e) => e.kind === 'reprovado')).toEqual([]);
    // Suppressed by a point of origin reprovado.
    expect(derivedPoints(withPoints(chosen, point(chosen, { origin: 'reprovado', equipment_id: trafo.equipment_id }))).some((e) => e.kind === 'reprovado')).toBe(false);
  });

  it('an NC row with a photo: its entry cites the photo, the section 8 bullet reads "conforme Imagem N", the action-plan row names N', () => {
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
    const n = numbering.get(photoId);
    expect(n).toBeDefined();
    const entry = derivedPoints(withPhoto).find((e) => e.kind === 'nc' && e.item_key === item.key)!;
    expect(entry.text.endsWith(photoToken(photoId))).toBe(true);
    const bullets = resolveSection8(withPhoto, numbering);
    const bulletIndex = bullets.findIndex((bullet) => bullet.text.includes('oxidação nos terminais'));
    expect(bullets[bulletIndex]!.text).toMatch(new RegExp(`oxidação nos terminais, conforme Imagem ${n}\\.$`));
    expect(resolveActionPlan(withPhoto, numbering)[bulletIndex]!.images).toBe(String(n));
    // The seed of "Criar ponto de atenção" keeps a photo the entry does not cite yet.
    expect(withPhotoTokens(entry.text, [photoId, 'other'])).toBe(`${entry.text} ${photoToken('other')}`);
    expect(withPhotoTokens(null, [photoId])).toBe(photoToken(photoId));
  });

  it('a v5 relatório gets the derived entries as a v11 one does (the rule is the kernel\'s)', () => {
    const { snapshot, trafo } = scenario();
    const v5 = { ...snapshot, relatorio: { ...snapshot.relatorio, seed_version: 'v5' }, blocks: snapshot.blocks.map((b) => ({ ...b, seed_version: 'v5' })) };
    const ofTrafo = derivedPoints(v5).filter((e) => e.block_id === trafo.id);
    expect(ofTrafo.map((e) => e.kind)).toEqual(['nc', 'nc']);
  });
});
