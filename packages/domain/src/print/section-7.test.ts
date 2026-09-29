import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { getDefinition } from '../seed/definitions.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { EMPTY_SECTION_NOTE, layoutSpec } from './layout.ts';
import { captionSentence, PHOTO_UNAVAILABLE_TEXT, section7Layout, section7Photos } from './section-7.ts';

/*
 * 7.2-UNIT: section 7's layout data (the I/O rows S7 happy, uncaptioned, none) on a
 * relatório of the standard template and on the full Porto Seguro fixture.
 */

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0701-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0702-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0703-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

type SnapshotPhoto = Extract<RelatorioSnapshot['files'][number], { kind: 'photo' }>;

let n = 0;
function photo(snapshot: RelatorioSnapshot, overrides: Partial<SnapshotPhoto> = {}): SnapshotPhoto {
  n += 1;
  return {
    id: `019966b0-0704-7000-8000-${String(n).padStart(12, '0')}`,
    relatorio_id: snapshot.relatorio.id,
    kind: 'photo',
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
    reading_status: 'none',
    people_in_photo: false,
    ...overrides,
  };
}

const heading = { number: 7, title: 'REGISTRO FOTOGRÁFICO MANUTENÇÃO PREVENTIVA' };

describe('7.2-UNIT-001 section 7 layout', () => {
  const base = fresh();
  const chave = base.blocks.find((block) => block.id === sheetOrder(base).find((node) => node.blockType === 'chave_seccionadora')!.blockId)!;
  const items = getDefinition(chave.seed_version, 'cabine_primaria', 'chave_seccionadora').checklist!;
  const contatos = items.findIndex((item) => item.key === 'contatos') + 1;
  const ncChave = { ...chave, sheet: { ...chave.sheet, checklist: { contatos: { result: { value: 'NC', source_suggestion_id: null, op_id: '019966b0-0705-7000-8000-000000000001' } } } } };

  it('S7 happy: numberPhotos order, bold label and caption as a sentence, the full stamp, the item line', () => {
    const late = photo(base, { captured_at: '2026-09-06T18:00:00.000Z', caption: 'Detalhe da chave!', coords: { lat: -23.55052, lng: -46.63331, accuracy_m: 5, source: 'geolocation' } });
    const early = photo(base, { captured_at: '2026-09-06T17:00:00.000Z', caption: '  Detalhe da verificação de contatos  ', block_id: chave.id, item_key: 'contatos' });
    const middle = photo(base, { captured_at: '2026-09-06T17:30:00.000Z', caption: 'Vista geral.' });
    const snapshot = { ...base, blocks: base.blocks.map((block) => (block.id === chave.id ? ncChave : block)), files: [late, early, middle] };
    const photos = section7Photos(snapshot);
    expect(photos.map((p) => p.fileId)).toEqual([early.id, middle.id, late.id]);
    expect(photos.map((p) => p.number)).toEqual([1, 2, 3]);
    expect([...numberPhotos(snapshot.files)].map(([id, number]) => ({ id, number }))).toEqual(photos.map((p) => ({ id: p.fileId, number: p.number })));
    expect(photos[0]).toEqual({
      fileId: early.id,
      number: 1,
      label: 'Imagem 1:',
      caption: ' Detalhe da verificação de contatos.',
      stamp: '06/09/2026 14:00',
      itemLine: `Item ${contatos} · Contatos · NC`,
    });
    // A caption already ending in ".", "!" or "?" gets no second period.
    expect(photos[1]!.caption).toBe(' Vista geral.');
    expect(photos[2]).toMatchObject({ label: 'Imagem 3:', caption: ' Detalhe da chave!', stamp: '06/09/2026 15:00 · −23,5505, −46,6333', itemLine: null });
  });

  it('S7 uncaptioned: "Imagem N." alone; a removed photo is gone and the numbers close the gap', () => {
    const first = photo(base, { captured_at: '2026-09-06T17:00:00.000Z', caption: null });
    const removed = photo(base, { captured_at: '2026-09-06T17:10:00.000Z', removed_at: '2026-09-06T19:00:00.000Z' });
    const blank = photo(base, { captured_at: '2026-09-06T17:20:00.000Z', caption: '   ' });
    const photos = section7Photos({ ...base, files: [first, removed, blank] });
    expect(photos.map((p) => [p.fileId, p.label, p.caption])).toEqual([
      [first.id, 'Imagem 1.', null],
      [blank.id, 'Imagem 2.', null],
    ]);
  });

  it('S7 none: no live photo gives null, and the section prints the empty note', () => {
    expect(section7Layout(base, heading)).toBeNull();
    expect(section7Layout({ ...base, files: [photo(base, { removed_at: '2026-09-06T19:00:00.000Z' })] }, heading)).toBeNull();
    const layout = layoutSpec(base, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
    expect(layout.sections.find((s) => s.number === 7)).toEqual({ number: 7, title: heading.title, kind: 'empty', note: EMPTY_SECTION_NOTE });
  });

  it('carries the heading it is given and the authored placeholder the renderer prints without bytes', () => {
    const one = photo(base);
    expect(section7Layout({ ...base, files: [one] }, heading)).toMatchObject({ number: 7, title: heading.title, kind: 'photos', photos: [{ fileId: one.id, number: 1 }] });
    expect(PHOTO_UNAVAILABLE_TEXT).toBe('(foto não disponível no servidor)');
    expect(captionSentence(' a ')).toBe('a.');
    expect(captionSentence('a?')).toBe('a?');
  });
});

describe('7.2-UNIT-002 section 7 on the Porto Seguro fixture', () => {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
  const section = layout.sections.find((s) => s.number === 7)!;

  it('lists the 82 photos numbered 1 to 82 in numberPhotos order, each captioned', () => {
    expect(section.kind).toBe('photos');
    if (section.kind !== 'photos') return;
    expect(section.photos).toHaveLength(82);
    expect(section.photos.map((p) => p.number)).toEqual(Array.from({ length: 82 }, (_, i) => i + 1));
    const numbers = numberPhotos(snapshot.files);
    for (const p of section.photos) expect(numbers.get(p.fileId)).toBe(p.number);
    expect(section.photos.every((p) => p.label === `Imagem ${p.number}:` && p.caption !== null && p.caption.endsWith('.'))).toBe(true);
    expect(section.photos[0]!.caption).toBe(' Detalhe da equipe da Enel no local para desligamento e religamento da energia.');
  });
});
