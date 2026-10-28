import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { captionSavedText, photoNumbersStatusText, photoRemoveDescription, photoRemovedText, photoTileLabel, viewerLabel } from './gallery.ts';
import { numberPhotos } from './numbering.ts';

/*
 * 17.4-UNIT (amends 16.3-UNIT): a "Ler visor" display shot (`reading_kind: 'display'`) is
 * numbered like every other photo, in the one document order of Story 17.1 (the "Geral"
 * photos first, then the sheets), and a removed one closes the gap like any removed photo.
 * Spec I/O matrix rows M7, M9, M10, M11 and M12.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0174-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0175-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0176-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const base = fresh();
const chave = base.blocks.find((block) => block.block_type === 'chave_seccionadora')!.id;
const id = (n: number) => `019966b0-0000-7000-8000-0000000174${String(n).padStart(2, '0')}`;
const T = (h: number) => `2026-10-26T${String(h).padStart(2, '0')}:00:00.000Z`;

type ReadingKind = 'plate' | 'display' | 'caption' | 'panel' | 'nc_obs' | null;

function file(n: number, hour: number, over: { block_id?: string | null; reading_kind?: ReadingKind; removed_at?: string | null } = {}): RelatorioSnapshot['files'][number] {
  return {
    id: id(n),
    relatorio_id: base.relatorio.id,
    kind: 'photo',
    sha256: 'x',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: over.removed_at ?? null,
    captured_at: T(hour),
    tz_offset: -180,
    coords: null,
    local_seq: n,
    block_id: over.block_id ?? null,
    item_key: null,
    caption: null,
    reading_kind: over.reading_kind ?? null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
  };
}

const display = (n: number, hour: number, removed_at: string | null = null) => file(n, hour, { block_id: chave, reading_kind: 'display', removed_at });
const numbersOf = (files: RelatorioSnapshot['files']) => numberPhotos({ ...base, files });

describe('17.4-UNIT numberPhotos numbers display shots', () => {
  it('g1, d1 (display on the chave), g2 in capture order: g1 = 1, g2 = 2 (section 7), d1 = 3 under its sheet', () => {
    expect([...numbersOf([file(1, 10), display(2, 11), file(3, 12)]).entries()]).toEqual([
      [id(1), 1],
      [id(3), 2],
      [id(2), 3],
    ]);
  });

  it('every reading kind on a sheet holds a number, the plate first, the rest in capture order', () => {
    const numbers = numbersOf([
      file(1, 10, { block_id: chave, reading_kind: 'panel' }),
      file(2, 11, { block_id: chave, reading_kind: 'caption' }),
      display(3, 12),
      file(4, 13, { block_id: chave, reading_kind: 'nc_obs' }),
      file(5, 14, { block_id: chave, reading_kind: 'plate' }),
    ]);
    expect([...numbers.entries()]).toEqual([
      [id(5), 1],
      [id(1), 2],
      [id(2), 3],
      [id(3), 4],
      [id(4), 5],
    ]);
  });

  it('M7: removing a display shot closes the gap like any removed photo; restoring it gives the numbers back', () => {
    const live = numbersOf([display(1, 10), file(2, 11, { block_id: chave })]);
    expect([...live.entries()]).toEqual([
      [id(1), 1],
      [id(2), 2],
    ]);
    const removed = numbersOf([display(1, 10, T(13)), file(2, 11, { block_id: chave })]);
    expect([...removed.entries()]).toEqual([[id(2), 1]]);
    const restored = numbersOf([display(1, 10, null), file(2, 11, { block_id: chave })]);
    expect([...restored.entries()]).toEqual([...live.entries()]);
  });

  it('M9: display shots only are numbered 1 and 2; no photo gives an empty map', () => {
    expect([...numbersOf([display(2, 11), display(1, 10)]).entries()]).toEqual([
      [id(1), 1],
      [id(2), 2],
    ]);
    expect(numbersOf([]).size).toBe(0);
  });

  it('M10: the numbers are a function of the snapshot alone (a revision stores none: an unchanged snapshot is what freezes them)', () => {
    const files = [file(1, 10), display(2, 11), file(3, 12)];
    expect([...numbersOf(files).entries()]).toEqual([...numbersOf([...files].reverse()).entries()]);
    expect(photoNumbersStatusText({ number: 2 }, false)).toBe('Números da revisão 2');
  });

  it('M11: the screen words carry the display shot\'s number; the bare forms stay for a tile the snapshot has not numbered yet', () => {
    const n = numbersOf([file(1, 10), display(2, 11)]).get(id(2)) ?? null;
    expect(n).toBe(2);
    expect(photoTileLabel(n)).toBe('Foto 2, abrir');
    expect(viewerLabel(n, 2)).toBe('Foto 2 de 2');
    expect(captionSavedText(n)).toBe('Legenda da foto 2 salva');
    expect(photoRemovedText(n)).toBe('Foto 2 removida do relatório');
    expect(photoTileLabel(null)).toBe('Foto, abrir');
    expect(photoTileLabel(null, { suggested: true })).toBe('Foto, legenda sugerida, abrir');
    expect(viewerLabel(null, 2)).toBe('Foto');
    expect(photoRemovedText(null)).toBe('Foto removida do relatório');
    expect(captionSavedText(null)).toBe('Legenda salva');
  });
});

describe('17.1-UNIT M12 photoRemoveDescription', () => {
  const printing = { ref: 'seção 7', prints: true };
  const absent = { ref: 'seção "Registro fotográfico"', prints: false };
  const geral = { block_id: null, item_key: null, location_id: null, reading_kind: null };

  it('says where the photo leaves from, by where it prints', () => {
    expect(photoRemoveDescription(geral, printing)).toBe('A foto sai da galeria e da seção 7. Dá para desfazer pelo aviso logo em seguida.');
    expect(photoRemoveDescription(geral, absent)).toBe('A foto sai da galeria. Dá para desfazer pelo aviso logo em seguida.');
    const sheet = 'A foto sai da galeria e da ficha do equipamento. Dá para desfazer pelo aviso logo em seguida.';
    expect(photoRemoveDescription({ ...geral, block_id: chave }, printing)).toBe(sheet);
    expect(photoRemoveDescription({ ...geral, block_id: chave, reading_kind: 'display' }, printing)).toBe(sheet);
    expect(photoRemoveDescription({ ...geral, block_id: chave, item_key: 'contatos' }, absent)).toBe(sheet);
    expect(photoRemoveDescription({ ...geral, location_id: id(9), item_key: 'epi_disponivel' }, printing)).toBe(
      'A foto sai da galeria e das verificações do local. Dá para desfazer pelo aviso logo em seguida.',
    );
    // A photo neither "Geral" nor of a sheet or a local prints nowhere: the gallery alone.
    expect(photoRemoveDescription({ ...geral, item_key: 'contatos' }, printing)).toBe('A foto sai da galeria. Dá para desfazer pelo aviso logo em seguida.');
  });
});
