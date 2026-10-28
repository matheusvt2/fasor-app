import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { isGeralPhoto } from '../photos/order.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { siteItems } from '../seed/definitions.ts';
import { TEST_PROJECT, T0 } from '../test-support.ts';
import { documentPhotoOrder, sheetChecklistPrinted } from './photo-order.ts';
import { newPointRow } from '../points/checks.ts';
import { photoToken } from '../points/refs.ts';
import { section7Photos } from './section-7.ts';
import { REMOVED_PHOTO_REF_TEXT, resolveSection8 } from './section-8.ts';
import { section9Layout, type SheetPart } from './section-9.ts';

/*
 * Stories 17.1 and 17.4: the one document order of the photos (`documentPhotoOrder`) and the
 * numbers `numberPhotos` reads off it, over small hand-built relatórios: the spec's I/O
 * matrix rows M3, M4, M5 and M9, each checked against what sections 7 and 9 print.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;
const id = (n: number) => `019966b0-0171-7000-8000-${n.toString(16).padStart(12, '0')}`;
const block = (n: number) => id(1000 + n);
const at = (minute: number) => `2026-09-06T10:${String(minute).padStart(2, '0')}:00.000Z`;

const EPI = siteItems('v4').find((item) => item.key === 'epi_disponivel')!.key;

function cabine(n: number, name: string, orderKey: string, agrupar = false): LocationRow {
  return {
    id: id(n),
    relatorio_id: RELATORIO,
    parent_id: null,
    kind: 'cabine',
    name,
    order_key: orderKey,
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: agrupar,
  };
}

interface Built {
  block: BlockRow;
  equipment: EquipmentRow;
}

function sheet(n: number, location: number, type: EquipmentBlockType, orderKey: string): Built {
  return newEquipmentBlock({ blockId: block(n), equipmentId: id(2000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(location), type, tag: `T${n}`, seedVersion: 'v1', orderKey });
}

function snapshotOf(locations: LocationRow[], sheets: Built[], files: RelatorioSnapshot['files'], over: { seed?: string; scheme?: 'ordem_de_campo' | 'por_local_e_tipo' } = {}): RelatorioSnapshot {
  const relatorio = { ...small.relatorio, seed_version: over.seed ?? 'v4', export: { ...small.relatorio.export, scheme: over.scheme ?? small.relatorio.export.scheme } };
  return { ...small, relatorio, locations, blocks: sheets.map((s) => s.block), equipment: sheets.map((s) => s.equipment), files, points: [], suggestions: [], actors: [] };
}

interface PhotoOver {
  block_id?: string | null;
  item_key?: string | null;
  location_id?: string | null;
  reading_kind?: 'plate' | 'display' | 'caption' | null;
  caption?: string | null;
  removed_at?: string | null;
}

function photo(n: number, capturedAt: string, over: PhotoOver = {}): RelatorioSnapshot['files'][number] {
  return {
    id: id(3000 + n),
    relatorio_id: RELATORIO,
    kind: 'photo',
    sha256: 'ab',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: over.removed_at ?? null,
    captured_at: capturedAt,
    tz_offset: -180,
    coords: null,
    local_seq: n,
    block_id: over.block_id ?? null,
    item_key: over.item_key ?? null,
    caption: over.caption ?? null,
    reading_kind: over.reading_kind ?? null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
    ...(over.location_id === undefined ? {} : { location_id: over.location_id }),
  };
}

/** The numbers as [file id, number] in number order. */
const entries = (snapshot: RelatorioSnapshot) => [...numberPhotos(snapshot).entries()];

/** Every printed photo of section 9, in print order, as [file id, number]. */
function section9Numbers(snapshot: RelatorioSnapshot): [string, number][] {
  const section = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS');
  if (section === null) return [];
  const photos = (parts: readonly SheetPart[]) => parts.flatMap((part) => (part.kind === 'photos' ? part.photos.map((p): [string, number] => [p.fileId, p.number]) : []));
  return section.subsections.flatMap((s) => [...photos(s.localParts ?? []), ...s.sheets.flatMap((sh) => photos(sh.parts))]);
}

describe('17.1-UNIT M1 isGeralPhoto', () => {
  it('is true only when the block, the item, the local and the reading are all null (an absent `location_id` reads null)', () => {
    const none = { block_id: null, item_key: null, location_id: null, reading_kind: null };
    expect(isGeralPhoto(none)).toBe(true);
    expect(isGeralPhoto({ block_id: null, item_key: null, reading_kind: null })).toBe(true);
    expect(isGeralPhoto({ ...none, location_id: id(1) })).toBe(false);
    expect(isGeralPhoto({ ...none, item_key: 'contatos' })).toBe(false);
    expect(isGeralPhoto({ ...none, block_id: block(1), reading_kind: 'display' })).toBe(false);
    expect(isGeralPhoto({ ...none, block_id: block(1) })).toBe(false);
    // Story 9.3's vision-caption request is what a context-less photo carries: still Geral.
    expect(isGeralPhoto({ ...none, reading_kind: 'caption' })).toBe(true);
    expect(isGeralPhoto({ ...none, reading_kind: 'panel' })).toBe(false);
    expect(isGeralPhoto({ ...none, reading_kind: 'nc_obs' })).toBe(false);
  });
});

describe('17.1-UNIT documentPhotoOrder', () => {
  it('M3: one cabine with one sheet (checklist printed): Geral in capture order, then the local\'s site photo, then the sheet\'s plate, items and other photos', () => {
    const files = [
      photo(2, at(10), { reading_kind: 'caption' }), // g2, a gallery photo asking for its vision caption (Story 9.3)
      photo(3, at(11), { block_id: block(1) }), // s1, a burst
      photo(4, at(12), { block_id: block(1), item_key: 'contatos' }), // n1, an NC item
      photo(5, at(13), { block_id: block(1), reading_kind: 'plate' }), // p1
      photo(6, at(14), { block_id: block(1), reading_kind: 'display' }), // d1
      photo(7, at(15), { location_id: id(1), item_key: EPI }), // t1, a site item
      photo(1, at(5)), // g1, captured before g2
    ];
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'chave_seccionadora', 'a0')], files);
    expect(sheetChecklistPrinted(snapshot.blocks[0]!)).toBe(true);
    const walk = documentPhotoOrder(snapshot);
    expect(walk.geral.map((p) => p.id)).toEqual([id(3001), id(3002)]);
    expect(walk.locals.get(id(1))!.map((p) => p.id)).toEqual([id(3007)]);
    const groups = walk.sheets.get(block(1))!;
    expect([groups.plate, groups.items, groups.other].map((g) => g.map((p) => p.id))).toEqual([[id(3005)], [id(3004)], [id(3003), id(3006)]]);
    expect(entries(snapshot)).toEqual([
      [id(3001), 1],
      [id(3002), 2],
      [id(3007), 3],
      [id(3005), 4],
      [id(3004), 5],
      [id(3003), 6],
      [id(3006), 7],
    ]);
    // Section 7 prints the first two, section 9 the rest, in the same order and numbers.
    expect(section7Photos(snapshot).map((p) => [p.fileId, p.number])).toEqual(entries(snapshot).slice(0, 2));
    expect(section9Numbers(snapshot)).toEqual(entries(snapshot).slice(2));
  });

  it('M3: a sheet whose checklist does not print puts its item photos with the other photos, in capture order', () => {
    const files = [photo(1, at(1), { block_id: block(1), item_key: 'limpeza' }), photo(2, at(2), { block_id: block(1) }), photo(3, at(3), { block_id: block(1), reading_kind: 'plate' })];
    const bare = { ...sheet(1, 1, 'tp', 'a0') };
    bare.block = { ...bare.block, config: { block_type: 'section_1', sub_blocks: {}, na_defaults: [] } as BlockRow['config'] };
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [bare], files);
    expect(sheetChecklistPrinted(snapshot.blocks[0]!)).toBe(false);
    const groups = documentPhotoOrder(snapshot).sheets.get(block(1))!;
    expect([groups.plate, groups.items, groups.other].map((g) => g.map((p) => p.id))).toEqual([[id(3003)], [], [id(3001), id(3002)]]);
    expect(entries(snapshot).map(([, n]) => n)).toEqual([1, 2, 3]);
    expect(section9Numbers(snapshot)).toEqual(entries(snapshot));
  });

  it('M4: two locals, three sheets, photos captured in reverse: the numbers follow the subsections; "Agrupar por tipo" reorders the sheets and the numbers follow the stored scheme', () => {
    const files = [
      photo(1, at(1), { block_id: block(3) }), // L2's S3, captured first
      photo(2, at(2), { location_id: id(2), item_key: EPI }), // L2's site item
      photo(3, at(3), { block_id: block(2) }), // L1's S2 (a chave)
      photo(4, at(4), { block_id: block(1) }), // L1's S1 (a disjuntor)
      photo(5, at(5), { location_id: id(1), item_key: EPI }), // L1's site item, captured last
    ];
    const sheets = [sheet(1, 1, 'disjuntor_mt', 'a0'), sheet(2, 1, 'chave_seccionadora', 'a1'), sheet(3, 2, 'chave_seccionadora', 'a0')];
    const field = snapshotOf([cabine(1, 'Cabine A', 'a0'), cabine(2, 'Cabine B', 'a1')], sheets, files, { scheme: 'ordem_de_campo' });
    expect(entries(field)).toEqual([
      [id(3005), 1],
      [id(3004), 2],
      [id(3003), 3],
      [id(3002), 4],
      [id(3001), 5],
    ]);
    expect(section9Numbers(field)).toEqual(entries(field));
    // L1 grouped by type: the seccionadoras (S2) print before the disjuntores (S1), and so are numbered.
    const grouped = snapshotOf([cabine(1, 'Cabine A', 'a0', true), cabine(2, 'Cabine B', 'a1')], sheets, files, { scheme: 'por_local_e_tipo' });
    expect(entries(grouped)).toEqual([
      [id(3005), 1],
      [id(3003), 2],
      [id(3004), 3],
      [id(3002), 4],
      [id(3001), 5],
    ]);
    expect(section9Numbers(grouped)).toEqual(entries(grouped));
    // The flag alone does not move them while the stored scheme is the field order.
    const flagOnly = snapshotOf([cabine(1, 'Cabine A', 'a0', true), cabine(2, 'Cabine B', 'a1')], sheets, files, { scheme: 'ordem_de_campo' });
    expect(entries(flagOnly)).toEqual(entries(field));
  });

  it('M5: an unplaced photo still holds a number: after every placed photo, in capture order; section 9 prints them as today (not at all)', () => {
    const files = [
      photo(1, at(1), { block_id: block(99) }), // a block in no subsection
      photo(2, at(2), { location_id: id(1), item_key: 'contatos' }), // an item key outside the site list
      photo(3, at(3), { item_key: 'contatos' }), // an item key with no sheet and no local
      photo(4, at(4), { block_id: block(1) }), // placed
      photo(5, at(5)), // Geral
    ];
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'chave_seccionadora', 'a0')], files);
    expect(entries(snapshot)).toEqual([
      [id(3005), 1],
      [id(3004), 2],
      [id(3001), 3],
      [id(3002), 4],
      [id(3003), 5],
    ]);
    expect(section9Numbers(snapshot)).toEqual([[id(3004), 2]]);
  });

  it('M5: a site photo on a seed without a site list (v1 to v3) is unplaced; on v4 it prints under its local', () => {
    const files = [photo(1, at(1), { location_id: id(1), item_key: EPI }), photo(2, at(2), { block_id: block(1) })];
    const v3 = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'chave_seccionadora', 'a0')], files, { seed: 'v3' });
    expect(documentPhotoOrder(v3).locals.size).toBe(0);
    expect(entries(v3)).toEqual([
      [id(3002), 1],
      [id(3001), 2],
    ]);
    const v4 = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'chave_seccionadora', 'a0')], files, { seed: 'v4' });
    expect(entries(v4)).toEqual([
      [id(3001), 1],
      [id(3002), 2],
    ]);
  });

  it('M5: a Não ensaiada sheet between two tested sheets prints its plate photo before its reason band and its burst after it; the printed numbers run 1..N with no gap', () => {
    const files = [
      photo(1, at(1), { block_id: block(2) }), // the untested sheet's burst
      photo(2, at(2), { block_id: block(1) }),
      photo(3, at(3), { block_id: block(3) }),
      photo(4, at(4), { block_id: block(2), reading_kind: 'plate' }), // the untested sheet's plate
    ];
    const untested = sheet(2, 1, 'disjuntor_mt', 'a1');
    untested.block = { ...untested.block, not_tested: { reason: 'outro', text: 'Sem acesso', at: T0.toISOString(), by: id(900) } };
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'chave_seccionadora', 'a0'), untested, sheet(3, 1, 'chave_seccionadora', 'a2')], files);
    expect(entries(snapshot)).toEqual([
      [id(3002), 1],
      [id(3004), 2],
      [id(3001), 3],
      [id(3003), 4],
    ]);
    expect(section9Numbers(snapshot)).toEqual(entries(snapshot));
    expect(section9Numbers(snapshot).map(([, n]) => n)).toEqual([1, 2, 3, 4]);
    // Under the untested sheet: the plate photo, the reason band, then the burst.
    const printed = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections.flatMap((sub) => sub.sheets).find((s) => s.blockId === block(2))!;
    const names = printed.parts.map((part) => (part.kind === 'photos' ? `photos ${part.photos.map((p) => p.number).join(' ')}` : part.kind === 'table' ? part.table.rows[0]!.cells[0]!.text : 'paragraph'));
    const band = names.findIndex((name) => name.startsWith('NÃO ENSAIADO'));
    expect(band).toBeGreaterThan(-1);
    expect(names.slice(band - 1, band + 2)).toEqual(['photos 2', names[band], 'photos 3']);
  });

  it('M5: a block whose definition does not resolve is not placed: its photo numbers after every placed photo and prints nowhere', () => {
    const unknown = sheet(2, 1, 'chave_seccionadora', 'a1');
    unknown.block = { ...unknown.block, seed_version: 'v0' };
    const files = [photo(1, at(1), { block_id: block(2) }), photo(2, at(2), { block_id: block(1) }), photo(3, at(3), { block_id: block(3) }), photo(4, at(4))];
    const snapshot = snapshotOf([cabine(1, 'Cabine A', 'a0')], [sheet(1, 1, 'chave_seccionadora', 'a0'), unknown, sheet(3, 1, 'chave_seccionadora', 'a2')], files);
    expect(documentPhotoOrder(snapshot).sheets.has(block(2))).toBe(false);
    expect(entries(snapshot)).toEqual([
      [id(3004), 1],
      [id(3002), 2],
      [id(3003), 3],
      [id(3001), 4],
    ]);
    expect(section9Numbers(snapshot)).toEqual([
      [id(3002), 2],
      [id(3003), 3],
    ]);
    expect(section7Photos(snapshot).map((p) => [p.fileId, p.number])).toEqual([[id(3004), 1]]);
  });

  it('M9 boundary: zero photos, one Geral only, display shots only, a removed photo', () => {
    const one = [sheet(1, 1, 'chave_seccionadora', 'a0')];
    const locals = [cabine(1, 'Cabine A', 'a0')];
    expect(numberPhotos(snapshotOf(locals, one, [])).size).toBe(0);
    expect(entries(snapshotOf(locals, one, [photo(1, at(1))]))).toEqual([[id(3001), 1]]);
    const displays = [photo(2, at(2), { block_id: block(1), reading_kind: 'display' }), photo(1, at(1), { block_id: block(1), reading_kind: 'display' })];
    expect(entries(snapshotOf(locals, one, displays))).toEqual([
      [id(3001), 1],
      [id(3002), 2],
    ]);
    const removed = snapshotOf(locals, one, [photo(1, at(1), { removed_at: at(9) }), photo(2, at(2))]);
    expect(entries(removed)).toEqual([[id(3002), 1]]);
    expect(numberPhotos(removed).has(id(3001))).toBe(false);
    // A point citing the removed photo prints the removed text in section 8; the live one its number.
    const cited = { ...removed, points: [{ ...newPointRow({ id: id(5001), relatorioId: RELATORIO, text: `Ver ${photoToken(id(3001))} e ${photoToken(id(3002))}`, equipmentId: null, origin: 'manual', action: null }, []) }] };
    expect(resolveSection8(cited, numberPhotos(cited))).toEqual([{ kind: 'point', text: `Ver ${REMOVED_PHOTO_REF_TEXT} e Imagem 1`, point_id: id(5001) }]);
  });
});
