import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { preIssue, preIssueRowsFor } from '../relatorio/pre-issue.ts';
import { progress } from '../relatorio/progress.ts';
import { sumarioRows } from '../relatorio/sumario.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import {
  addPhotosButtonText,
  batchCaptionLabel,
  batchScopeText,
  captionPhotoLabel,
  captionPhotoMetaText,
  GALLERY_ALL,
  galleryCabineOptions,
  galleryCounterText,
  galleryFilterText,
  galleryHeadingText,
  photoCabineId,
  galleryCounts,
  PHOTO_EQUIPMENT_NEARBY_MAX,
  photoEquipmentGroups,
  photoEquipmentOptions,
  photosImportedText,
  photosKeptGeneralText,
  photoItemLine,
  photoRemovedText,
  photosAddedText,
  photoStampFull,
  photoStampShort,
  photoTileLabel,
  skippedFilesText,
  viewerCountText,
} from './gallery.ts';
import { photoCountText } from './text.ts';

/*
 * 6.3/6.4-UNIT: the gallery's stamps, filter, counters and import texts, and section 7's
 * Sumário row, over a relatório of the standard template.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0061-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0062-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0063-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

const base = fresh();
const cabine = (name: string) => base.locations.find((l) => l.name === name && l.parent_id === null)!;
const blockIn = (cabineName: string, type: string) => {
  const root = cabine(cabineName);
  const ids = new Set(base.locations.filter((l) => l.id === root.id || l.parent_id === root.id).map((l) => l.id));
  return base.blocks.find((b) => b.block_type === type && b.location_id !== null && ids.has(b.location_id))!;
};
const chave = blockIn('Cubículo Enel', 'chave_seccionadora');

let n = 0;
function photo(overrides: Partial<{ block_id: string | null; item_key: string | null; caption: string | null; uploaded_at: string | null; captured_at: string }> = {}) {
  n += 1;
  return {
    id: `019966b0-0064-7000-8000-${String(n).padStart(12, '0')}`,
    relatorio_id: base.relatorio.id,
    kind: 'photo' as const,
    sha256: 'x',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: '2026-09-06T17:32:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: n,
    block_id: null,
    item_key: null,
    caption: 'Detalhe',
    reading_kind: null,
    reading_target: null,
    reading_status: 'none' as const,
    ...overrides,
  };
}

describe('6.3-UNIT-002 stamps', () => {
  it('tile: "06/09 14:32" in America/Sao_Paulo', () => {
    expect(photoStampShort('2026-09-06T17:32:00.000Z')).toBe('06/09 14:32');
  });

  it('viewer: date, time and coordinates with four decimals, comma and Unicode minus; the time alone without coords', () => {
    expect(photoStampFull({ captured_at: '2026-09-06T17:32:00.000Z', coords: { lat: -23.55052, lng: -46.63331 } })).toBe('06/09/2026 14:32 · −23,5505, −46,6333');
    expect(photoStampFull({ captured_at: '2026-09-06T17:32:00.000Z', coords: null })).toBe('06/09/2026 14:32');
    expect(photoStampFull({ captured_at: '2026-09-06T17:32:00.000Z', coords: { lat: 1.5, lng: 0 } })).toBe('06/09/2026 14:32 · 1,5000, 0,0000');
  });
});

describe('6.3-UNIT-003 photoItemLine', () => {
  const items = getDefinition(chave.seed_version, 'cabine_primaria', 'chave_seccionadora').checklist!;
  const index = items.findIndex((item) => item.key === 'contatos') + 1;

  it('an NC item: "Item n · Contatos · NC"', () => {
    const nc = { ...chave, sheet: { ...chave.sheet, checklist: { contatos: { result: { value: 'NC' } } } } };
    const snapshot = { blocks: [nc] } as unknown as RelatorioSnapshot;
    expect(photoItemLine({ block_id: chave.id, item_key: 'contatos' }, snapshot)).toEqual({
      text: `Item ${index} · Contatos · NC`,
      head: `Item ${index} · Contatos`,
      result: 'NC',
      nc: true,
    });
  });

  it('an unanswered item: no result; off an item: null', () => {
    expect(photoItemLine({ block_id: chave.id, item_key: 'contatos' }, base)?.text).toBe(`Item ${index} · Contatos`);
    expect(photoItemLine({ block_id: chave.id, item_key: null }, base)).toBeNull();
    expect(photoItemLine({ block_id: null, item_key: 'contatos' }, base)).toBeNull();
  });
});

describe('6.3-UNIT-004 the cabine filter', () => {
  const photos = [
    photo({ block_id: blockIn('Oxigênio', 'chave_seccionadora').id }),
    photo({ block_id: chave.id }),
    photo({ block_id: null }),
  ];

  it('offers "Todas" first, then the cabines holding photos, in tree order', () => {
    expect(galleryCabineOptions(base, photos)).toEqual([
      { id: GALLERY_ALL, label: 'Todas' },
      { id: cabine('Cubículo Enel').id, label: 'Cubículo Enel' },
      { id: cabine('Oxigênio').id, label: 'Oxigênio' },
    ]);
    expect(photoCabineId(photos[1]!, base)).toBe(cabine('Cubículo Enel').id);
    // A photo with no sheet sits under "Todas" only.
    expect(photoCabineId(photos[2]!, base)).toBeNull();
  });

  it('announces the filter with agreement', () => {
    expect(galleryFilterText(4, { name: 'Cubículo Enel', gender: 'm', number: 'singular' })).toBe('Mostrando 4 fotos do Cubículo Enel');
    expect(galleryFilterText(1, { name: 'Cobertura A', gender: 'f', number: 'singular' })).toBe('Mostrando 1 foto da Cobertura A');
    expect(galleryFilterText(20, null)).toBe('Mostrando 20 fotos');
  });
});

describe('6.3-UNIT-005 gallery texts', () => {
  it('heading, counter, viewer count, tile label, removal toast, count', () => {
    expect(galleryHeadingText(20)).toBe('Registro fotográfico (20)');
    expect(galleryCounterText({ pending: 3, error: 1, uncaptioned: 1 })).toBe('3 fotos aguardando envio · 1 com erro · 1 sem legenda');
    expect(galleryCounterText({ pending: 1, error: 0, uncaptioned: 0 })).toBe('1 foto aguardando envio');
    expect(galleryCounterText({ pending: 0, error: 0, uncaptioned: 0 })).toBeNull();
    expect(viewerCountText(4, 20)).toBe('4 de 20 · nº provisório');
    expect(photoTileLabel(4)).toBe('Foto 4, abrir');
    expect(photoRemovedText(4)).toBe('Foto 4 removida do relatório');
    expect(photoCountText(0)).toBe('Nenhuma foto');
    expect(photoCountText(1)).toBe('1 foto');
    expect(photoCountText(82)).toBe('82 fotos');
  });

  it('6.4 import texts', () => {
    expect(addPhotosButtonText(3)).toBe('Adicionar 3 fotos');
    expect(addPhotosButtonText(1)).toBe('Adicionar 1 foto');
    expect(batchScopeText(3)).toBe('— vale para as 3 fotos');
    expect(batchCaptionLabel(3)).toBe('Legenda das 3 fotos');
    expect(photosAddedText(3)).toBe('3 fotos adicionadas — legenda aplicada');
    expect(photosAddedText(1)).toBe('1 foto adicionada — legenda aplicada');
    expect(skippedFilesText(2)).toMatch(/^2 arquivos/);
  });

  it('6.4 "De qual equipamento?": every sheet in tree order, by TAG, type and place', () => {
    const options = photoEquipmentOptions(base);
    expect(options).toHaveLength(94);
    const first = options.find((option) => option.blockId === chave.id)!;
    expect(first.text).toMatch(/ · Chave seccionadora · Cubículo Enel$/);
  });

  it('E6-Q4 photoEquipmentGroups: the current sheet, its location, then its cabine; the full list grouped by location in tree order', () => {
    const all = photoEquipmentOptions(base);
    const { nearby, groups } = photoEquipmentGroups(base, null);
    expect(nearby).toEqual([]);
    // Every sheet once, in tree order, grouped by the location it hangs off.
    expect(groups.flatMap((group) => group.options)).toEqual(all);
    expect(new Set(groups.map((group) => group.locationId)).size).toBe(groups.length);
    expect(groups[0]!.label).toBe('Cubículo Enel');
    const colunaIds = new Set(base.locations.filter((location) => location.kind === 'coluna').map((location) => location.id));
    const colunaGroups = groups.filter((group) => colunaIds.has(group.locationId));
    expect(colunaGroups.length).toBeGreaterThan(1);
    expect(colunaGroups[0]!.label).toMatch(/ › /);

    // A sheet under a coluna: itself, its coluna's other sheets, then its cabine's.
    const colunaGroup = colunaGroups.find((group) => group.options.length > 1)!;
    const current = colunaGroup.options[1]!;
    const withCurrent = photoEquipmentGroups(base, current.blockId);
    expect(withCurrent.nearby).toHaveLength(PHOTO_EQUIPMENT_NEARBY_MAX);
    expect(withCurrent.nearby[0]).toEqual(current);
    const sameColuna = colunaGroup.options.filter((option) => option !== current);
    expect(withCurrent.nearby.slice(1, 1 + Math.min(sameColuna.length, PHOTO_EQUIPMENT_NEARBY_MAX - 1))).toEqual(sameColuna.slice(0, PHOTO_EQUIPMENT_NEARBY_MAX - 1));
    expect(withCurrent.groups).toEqual(groups);

    // A cabine holding its sheets directly: its own sheets.
    const enel = photoEquipmentGroups(base, groups[0]!.options[0]!.blockId);
    expect(enel.nearby[0]).toEqual(groups[0]!.options[0]);
    expect(enel.nearby.every((option) => groups[0]!.options.some((own) => own.blockId === option.blockId))).toBe(true);

    // A pref naming no live sheet counts as none.
    expect(photoEquipmentGroups(base, '019966b0-0064-7000-8000-0000000000ff').nearby).toEqual([]);
  });

  it('E6-Q3 the composer photo line and name', () => {
    expect(captionPhotoMetaText(4, '2026-09-06T11:31:00.000Z')).toBe('Nº provisório 4 · 06/09 08:31');
    expect(captionPhotoMetaText(null, '2026-09-06T11:31:00.000Z')).toBe('06/09 08:31');
    expect(captionPhotoLabel(4)).toBe('Foto 4');
    expect(captionPhotoLabel(null)).toBe('Foto');
  });

  it('E6-Q12 galleryCounts, and the import toasts as one kernel sentence', () => {
    expect(
      galleryCounts([
        { uploaded_at: null, upload_error: null, caption: null },
        { uploaded_at: null, upload_error: 'dead', caption: 'Detalhe' },
        { uploaded_at: T0.toISOString(), upload_error: null, caption: '  ' },
        { uploaded_at: null, caption: 'Detalhe' },
      ]),
    ).toEqual({ pending: 2, error: 1, uncaptioned: 2 });
    expect(photosImportedText(3, 0)).toBe('3 fotos adicionadas — legenda aplicada');
    expect(photosImportedText(3, 1)).toBe('3 fotos adicionadas — legenda aplicada. 1 arquivo não pôde ser lido como foto e ficou de fora');
    expect(photosImportedText(0, 2)).toBe(skippedFilesText(2));
    expect(photosImportedText(0, 0)).toBeNull();
  });

  it('E6-Q8 photosKeptGeneralText: a cancelled batch stays as Geral with no caption', () => {
    expect(photosKeptGeneralText(3, 0)).toBe('3 fotos ficaram como Geral, sem legenda');
    expect(photosKeptGeneralText(1, 0)).toBe('1 foto ficou como Geral, sem legenda');
    expect(photosKeptGeneralText(2, 1)).toBe('2 fotos ficaram como Geral, sem legenda. 1 arquivo não pôde ser lido como foto e ficou de fora');
    expect(photosKeptGeneralText(0, 1)).toBe(skippedFilesText(1));
    expect(photosKeptGeneralText(0, 0)).toBeNull();
  });
});

describe('6.3-UNIT-006 section 7 on the Sumário and in preIssue', () => {
  const rowsOf = (snapshot: RelatorioSnapshot) => {
    const computed = progress(snapshot);
    const issues = preIssue(snapshot, computed);
    return { issues, row: sumarioRows(snapshot, issues, computed).find((r) => r.rowKey === 'section_7')! };
  };

  it('counts the live photos, names the uncaptioned (pending) and the unsent (info), never blocking', () => {
    const files = [
      photo({ caption: null }),
      photo({ caption: '  ', uploaded_at: '2026-09-06T18:00:00.000Z' }),
      photo({ uploaded_at: '2026-09-06T18:00:00.000Z' }),
      photo(),
    ];
    const { issues, row } = rowsOf({ ...base, files } as RelatorioSnapshot);
    expect(row.meta).toBe('4 fotos · 2 sem legenda · 2 aguardando envio');
    expect(row.pending).toBe(true);
    expect(row.blocking).toBe(false);
    expect(preIssueRowsFor(issues, 'section_7').map((r) => [r.kind, r.severity, r.text])).toEqual([
      ['photos_uncaptioned', 'pending', '2 sem legenda'],
      ['photos_pending_upload', 'info', '2 aguardando envio'],
    ]);
  });

  it('only unsent photos: the row is a plain warning, not pending; none: "Nenhuma foto"', () => {
    const { row } = rowsOf({ ...base, files: [photo(), photo()] } as RelatorioSnapshot);
    expect(row.meta).toBe('2 fotos · 2 aguardando envio');
    expect(row.pending).toBe(false);
    expect(rowsOf(base).row.meta).toBe('Nenhuma foto');
  });

  it('Epic 8 carry-over: a photo with a local upload error (failed or dead) is not "aguardando envio"; an uploaded one never is', () => {
    const failed = photo();
    const dead = photo();
    const uploaded = photo({ uploaded_at: '2026-09-06T18:00:00.000Z' });
    const files = [failed, dead, uploaded, photo(), photo()];
    const snapshot = { ...base, files } as RelatorioSnapshot;
    const computed = progress(snapshot);
    // `failed` and `dead` both reach the kernel as one set of ids with a local error; an
    // uploaded photo in the set (the error cleared late) still is not counted.
    const issues = preIssue(snapshot, computed, { photoErrors: new Set([failed.id, dead.id, uploaded.id]) });
    expect(preIssueRowsFor(issues, 'section_7').find((r) => r.kind === 'photos_pending_upload')?.text).toBe('2 aguardando envio');
    expect(sumarioRows(snapshot, issues, computed).find((r) => r.rowKey === 'section_7')!.meta).toBe('5 fotos · 2 aguardando envio');
    // Every error: no "aguardando envio" row at all; no context: every unsent photo counts.
    const allErrors = preIssue(snapshot, computed, { photoErrors: new Set(files.map((f) => f.id)) });
    expect(allErrors.some((r) => r.kind === 'photos_pending_upload')).toBe(false);
    expect(preIssueRowsFor(preIssue(snapshot, computed), 'section_7').find((r) => r.kind === 'photos_pending_upload')?.text).toBe('4 aguardando envio');
  });
});
