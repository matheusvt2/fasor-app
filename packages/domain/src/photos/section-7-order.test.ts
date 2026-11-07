import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { makeOp, type Op } from '../ops/op.ts';
import { orderKeyBetween } from '../ops/order-key.ts';
import { replay } from '../ops/replay.ts';
import { section7Photos } from '../print/section-7.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { photoFileRowSchema, type FileRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, opFactory, T0, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { numberPhotos } from './numbering.ts';
import {
  captureOrderKey,
  comparePhotos,
  compareSection7,
  galleryTileOrder,
  geralMoveOptions,
  geralPhotoMoveKey,
  geralPhotos,
  photoMovedText,
  section7Key,
} from './order.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';

/*
 * 21.3-UNIT (Story 21.3, spec I/O matrix): section 7 in the order of the work. A "Geral" photo
 * moved with "Subir" or "Descer" carries an `order_key`; every other one sorts by a key
 * encoding its capture order, so a relatório with no key anywhere keeps today's order and
 * numbers, and a move is one put.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0213-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-05', service_end: '2026-11-05', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0214-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0215-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const base = fresh();
const chave = base.blocks.find((block) => block.block_type === 'chave_seccionadora')!.id;
const id = (n: number) => `019966b0-0000-7000-8000-0000002130${String(n).padStart(2, '0')}`;
const T = (minute: number) => new Date(Date.UTC(2026, 10, 5, 10, 0, 0) + minute * 60_000).toISOString();

type Photo = RelatorioSnapshot['files'][number] & { kind: 'photo' };

function photo(n: number, minute: number, over: Partial<Photo> = {}): Photo {
  return {
    id: id(n),
    company_id: TEST_COMPANY,
    relatorio_id: base.relatorio.id,
    kind: 'photo',
    sha256: 'x',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: T(minute),
    tz_offset: -180,
    coords: null,
    local_seq: n,
    block_id: null,
    item_key: null,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
    ...over,
  } as Photo;
}

const snap = (files: readonly Photo[]): RelatorioSnapshot => ({ ...base, files: [...files] });
const geralIds = (files: readonly Photo[]) => geralPhotos(snap(files)).map((p) => p.id);

/** The files after a "Subir"/"Descer" landing `idOf` at `toIndex` of section 7 (one put, as the gallery writes it). */
function move(files: readonly Photo[], idOf: string, toIndex: number): Photo[] {
  const key = geralPhotoMoveKey(geralPhotos(snap(files)), idOf, toIndex);
  if (key === null) return [...files];
  return files.map((f) => (f.id === idOf ? { ...f, order_key: key } : f));
}

/** Five "Geral" photos captured a minute apart, and two sheet photos between them. */
const FIVE = [photo(1, 1), photo(2, 2), photo(3, 3), photo(4, 4), photo(5, 5)];
const SHEET = [photo(11, 2, { block_id: chave, local_seq: 11 }), photo(12, 6, { block_id: chave, local_seq: 12 })];

describe('21.3-UNIT-001 captureOrderKey equals capture order', () => {
  it('is `t`, 9 base36 instant digits and 8 base36 local_seq digits, in the alphabet `0-9a-z`', () => {
    const key = captureOrderKey({ captured_at: '2026-11-05T10:00:00.000Z', local_seq: 7 });
    expect(key).toMatch(/^t[0-9a-z]{17}$/);
    expect(key.endsWith('00000007')).toBe(true);
  });

  it('an unparsable instant sorts last, as comparePhotos puts it', () => {
    const bad = { id: id(1), captured_at: 'not a date', local_seq: 0 };
    const late = { id: id(2), captured_at: '9999-12-31T23:59:59.999Z', local_seq: 99 };
    expect(captureOrderKey(bad) > captureOrderKey(late)).toBe(true);
    expect(compareSection7(bad, late)).toBe(comparePhotos(bad, late));
  });

  it('property: over random unkeyed photos, the section 7 order equals comparePhotos', () => {
    let seed = 2113;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 50; round += 1) {
      const photos = Array.from({ length: 30 }, (_, i) => ({
        // Few distinct instants and seqs, so ties on both reach the id.
        id: id(Math.floor(random() * 99)) + String(i),
        captured_at: new Date(Date.UTC(2020, 0, 1) + Math.floor(random() * 4) * 1000 + Math.floor(random() * 3)).toISOString(),
        local_seq: Math.floor(random() * 4),
      }));
      expect([...photos].sort(compareSection7)).toEqual([...photos].sort(comparePhotos));
    }
  });

  it('section7Key: the key a move wrote, else the capture key; null and absent are the same', () => {
    const p = { id: id(1), captured_at: T(1), local_seq: 1 };
    expect(section7Key(p)).toBe(captureOrderKey(p));
    expect(section7Key({ ...p, order_key: null })).toBe(captureOrderKey(p));
    expect(section7Key({ ...p, order_key: 'e' })).toBe('e');
  });
});

describe('21.3-UNIT-002 the I/O matrix', () => {
  it('"No key anywhere": section 7, its numbers and the gallery are capture order, as before contract 30', () => {
    const files = [...FIVE, ...SHEET];
    expect(geralIds(files)).toEqual(FIVE.map((p) => p.id));
    const numbers = numberPhotos(snap(files));
    expect(FIVE.map((p) => numbers.get(p.id))).toEqual([1, 2, 3, 4, 5]);
    expect(section7Photos(snap(files)).map((p) => p.label)).toEqual(['Imagem 1.', 'Imagem 2.', 'Imagem 3.', 'Imagem 4.', 'Imagem 5.']);
    const tiles = [...files].reverse();
    expect(galleryTileOrder(tiles).map((t) => t.id)).toEqual([...files].sort(comparePhotos).map((t) => t.id));
  });

  it('"Move 4 up twice": section 7 prints 1, 4, 2, 3, 5 as Imagem 1 to 5; the section 9 numbers are unchanged', () => {
    let files = [...FIVE, ...SHEET];
    const before = numberPhotos(snap(files));
    files = move(files, id(4), 2);
    expect(geralIds(files)).toEqual([id(1), id(2), id(4), id(3), id(5)]);
    files = move(files, id(4), 1);
    expect(geralIds(files)).toEqual([id(1), id(4), id(2), id(3), id(5)]);
    // One key written, on the moved photo only.
    expect(files.filter((f) => f.order_key != null).map((f) => f.id)).toEqual([id(4)]);
    const layout = section7Photos(snap(files));
    expect(layout.map((p) => [p.fileId, p.number])).toEqual([
      [id(1), 1],
      [id(4), 2],
      [id(2), 3],
      [id(3), 4],
      [id(5), 5],
    ]);
    const after = numberPhotos(snap(files));
    for (const sheetPhoto of SHEET) expect(after.get(sheetPhoto.id)).toBe(before.get(sheetPhoto.id));
    // The gallery: sheet tiles keep their capture slots, the Geral slots follow section 7.
    expect(galleryTileOrder(files).map((t) => t.id)).toEqual([id(1), id(4), id(11), id(2), id(3), id(5), id(12)]);
  });

  it('"Move to last, then capture": the new photo is last, the moved one second to last, even one millisecond later', () => {
    let files = move([...FIVE], id(2), 4);
    expect(geralIds(files)).toEqual([id(1), id(3), id(4), id(5), id(2)]);
    const lastMs = Date.parse(T(5));
    const tight = photo(6, 0, { captured_at: new Date(lastMs + 1).toISOString(), local_seq: 0 });
    files = [...files, tight, photo(7, 60)];
    expect(geralIds(files)).toEqual([id(1), id(3), id(4), id(5), id(2), id(6), id(7)]);
  });

  it('"Move to first": photo 5 up until first gets a key below every capture key, and Subir is disabled on it', () => {
    let files = [...FIVE];
    for (let i = 0; i < 4; i += 1) {
      const at = geralIds(files).indexOf(id(5));
      files = move(files, id(5), at - 1);
    }
    expect(geralIds(files)).toEqual([id(5), id(1), id(2), id(3), id(4)]);
    const key = files.find((f) => f.id === id(5))!.order_key!;
    expect(key < 't').toBe(true);
    expect(geralMoveOptions(geralPhotos(snap(files)), id(5))).toEqual({ position: 1, total: 5, canMoveUp: false, canMoveDown: true });
    expect(geralMoveOptions(geralPhotos(snap(files)), id(4))).toEqual({ position: 5, total: 5, canMoveUp: true, canMoveDown: false });
    // A move to where it already is writes nothing.
    expect(geralPhotoMoveKey(geralPhotos(snap(files)), id(5), 0)).toBeNull();
    expect(geralPhotoMoveKey(geralPhotos(snap(files)), id(5), -3)).toBeNull();
  });

  it('"Old-dated import": a keyed photo stays between its neighbours; an EXIF-less import keeps its capture place', () => {
    // An import whose file date sorts it last, moved to second place.
    const imported = photo(9, 600, { local_seq: 9 });
    let files = move([...FIVE, imported], id(9), 1);
    expect(geralIds(files)).toEqual([id(1), id(9), id(2), id(3), id(4), id(5)]);
    // A later import with an older EXIF date takes its capture-order place, the keyed one stays put.
    const older = photo(8, -30, { local_seq: 8 });
    files = [...files, older];
    expect(geralIds(files)).toEqual([id(8), id(1), id(9), id(2), id(3), id(4), id(5)]);
  });

  it('"Equal keys": two photos holding one key sort by id, and a move next to the run lands after the whole run', () => {
    const shared = orderKeyBetween(captureOrderKey(FIVE[0]!), captureOrderKey(FIVE[1]!));
    const a = photo(21, 50, { order_key: shared });
    const b = photo(22, 40, { order_key: shared });
    let files = [...FIVE, b, a];
    expect(geralIds(files)).toEqual([id(1), id(21), id(22), id(2), id(3), id(4), id(5)]);
    // Photo 3 put right after id(21): it lands after the whole run (after id(22)), no RangeError.
    files = move(files, id(3), 2);
    expect(geralIds(files)).toEqual([id(1), id(21), id(22), id(3), id(2), id(4), id(5)]);
    // A run of equal keys at the end: a move to last still finds a key.
    const tail = [photo(1, 1), photo(31, 2, { order_key: 'tz' }), photo(32, 3, { order_key: 'tz' })];
    expect(geralIds(move(tail, id(1), 2))).toEqual([id(31), id(32), id(1)]);
  });

  it('"Removed neighbour": the rest keep their order and the numbers close the gap', () => {
    let files = move(move([...FIVE], id(4), 2), id(4), 1);
    files = files.map((f) => (f.id === id(2) ? { ...f, removed_at: T(30) } : f));
    expect(geralIds(files)).toEqual([id(1), id(4), id(3), id(5)]);
    const numbers = numberPhotos(snap(files));
    expect([id(1), id(4), id(3), id(5)].map((p) => numbers.get(p))).toEqual([1, 2, 3, 4]);
  });

  it('"Non-Geral photo": no move verdicts, and a stale key on a sheet photo is ignored in section 9', () => {
    const stale = [...FIVE, photo(11, 2, { block_id: chave, local_seq: 11, order_key: 'zzz' }), photo(12, 6, { block_id: chave, local_seq: 12, order_key: '0' })];
    const files = [...FIVE, ...SHEET];
    expect(geralMoveOptions(geralPhotos(snap(stale)), id(11))).toBeNull();
    const numbers = numberPhotos(snap(stale));
    expect(numbers.get(id(11))).toBe(numberPhotos(snap(files)).get(id(11)));
    expect(numbers.get(id(12))).toBe(numberPhotos(snap(files)).get(id(12)));
    expect(() => geralPhotoMoveKey(geralPhotos(snap(stale)), id(11), 0)).toThrow(RangeError);
  });

  it('"Null key": a put of null sends the photo back to its capture-order place', () => {
    const files = move(move([...FIVE], id(4), 2), id(4), 1).map((f) => (f.id === id(4) ? { ...f, order_key: null } : f));
    expect(geralIds(files)).toEqual(FIVE.map((p) => p.id));
  });
});

describe('21.3-UNIT-003 the row schema and the op', () => {
  const row = (over: Record<string, unknown>) => ({ ...photo(1, 1), relatorio_id: TEST_RELATORIO, ...over });

  it('order_key is optional, nullable and `0-9a-z` only; a row without it parses to the same bytes', () => {
    const plain = photo(1, 1);
    expect(photoFileRowSchema.parse(plain)).toEqual(plain);
    expect('order_key' in photoFileRowSchema.parse(plain)).toBe(false);
    expect(photoFileRowSchema.safeParse(row({ order_key: null })).success).toBe(true);
    expect(photoFileRowSchema.safeParse(row({ order_key: 't0mh2k5' })).success).toBe(true);
    for (const bad of ['', 'ABC', 'a-b', 'a b', 'é', 5, true]) expect(photoFileRowSchema.safeParse(row({ order_key: bad })).success, String(bad)).toBe(false);
  });

  it('a key ending in `0` is refused ("0", "00", "a0": no key fits below "0"), and every key a move mints passes', () => {
    for (const bad of ['0', '00', 'a0', 'tz0']) expect(photoFileRowSchema.safeParse(row({ order_key: bad })).success, bad).toBe(false);
    // Moves to first, to last, into the middle, next to a run of equal keys and back: every minted key is storable.
    const minted: string[] = [];
    let files: Photo[] = [...FIVE, photo(21, 50, { order_key: 'tz' }), photo(22, 40, { order_key: 'tz' })];
    const plan: [number, number][] = [[5, 0], [1, 6], [3, 2], [4, 5], [2, 0], [21, 0], [5, 6], [3, 3]];
    for (const [n, to] of plan) {
      const key = geralPhotoMoveKey(geralPhotos(snap(files)), id(n), to);
      if (key === null) continue;
      minted.push(key);
      files = files.map((f) => (f.id === id(n) ? { ...f, order_key: key } : f));
    }
    expect(minted.length).toBeGreaterThan(5);
    for (const key of minted) expect(photoFileRowSchema.safeParse(row({ order_key: key })).success, key).toBe(true);
  });

  it('applyOp writes a `file/{id}/order_key` put, and refuses a number or a key outside the alphabet', () => {
    const f = opFactory();
    const create = f.op({ kind: 'create', path: `file/${id(1)}`, value: row({}) });
    const state = applyOp(new Map(), create);
    const put = (value: unknown) => applyOp(state, f.op({ path: `file/${id(1)}/order_key`, value: value as never }));
    expect((put('e').get(entityKey('file', id(1))) as FileRow & { order_key?: string }).order_key).toBe('e');
    expect(() => put(5)).toThrow();
    expect(() => put('Z!')).toThrow();
  });

  it('two devices moving the same photo converge by the fold: the later seq wins whatever the array order', () => {
    const f = opFactory();
    const create = { ...f.op({ kind: 'create', path: `file/${id(1)}`, value: row({}) }), seq: 1 };
    const tablet = { ...f.op({ path: `file/${id(1)}/order_key`, value: 'e', device_id: 'tablet-a' }), seq: 2 };
    const phone = { ...f.op({ path: `file/${id(1)}/order_key`, value: 'u', device_id: 'phone-b' }), seq: 3 };
    const keyOf = (log: Op[]) => (replay(log).get(entityKey('file', id(1))) as { order_key?: string }).order_key;
    expect(keyOf([create, tablet, phone])).toBe('u');
    expect(keyOf([phone, create, tablet])).toBe('u');
    const both: EntityState[] = [replay([create, tablet, phone]), replay([phone, tablet, create])];
    expect(both[0]).toEqual(both[1]);
  });
});

describe('21.3-UNIT-004 the move announcement', () => {
  it('names the place and section 7 by its Sumário position, or says the photos do not print', () => {
    expect(photoMovedText(2, 5, true, 'seção 3')).toBe('Foto movida: 2 de 5 na seção 3');
    expect(photoMovedText(1, 2, false, 'seção "Registro fotográfico"')).toBe(
      'Foto movida: 1 de 2 · não sai no documento: o relatório não tem a seção "Registro fotográfico"',
    );
  });
});
