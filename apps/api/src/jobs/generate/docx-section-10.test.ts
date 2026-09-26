import { buildSnapshot, layoutSpec, replay, type RelatorioSnapshot, type UserRow } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure, readZipEntries } from './docx-structure.ts';
import { placeholderPages } from './toc.ts';
import { watermarkPng, WATERMARK_SIZE_PX } from './watermark.ts';

/*
 * Stories 7.4 and 7.5: section 10 as the DOCX prints it (the Parecer box, the bullets, the
 * validity line, the signature), and the draft-equals-issued test (Epic 7 testing floor):
 * the preview and the issued document of one snapshot differ only by the RASCUNHO drawing
 * in the header and the "Revisão do documento" value.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const RESPONSIBLE: UserRow = {
  id: '019966c0-0000-7000-8000-000000000002',
  name: 'Rafael Lamonde',
  email: 'r@x',
  council: 'crea',
  registration_number: '5063583141',
  title: null,
  photo_location_enabled: false,
};

/** The Porto Seguro fixture with its responsible, the ART and a confirmed parecer (the log carries neither). */
function fixture(): RelatorioSnapshot {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  return {
    ...snapshot,
    responsible: RESPONSIBLE,
    relatorio: {
      ...snapshot.relatorio,
      setup: {
        ...snapshot.relatorio.setup,
        art_trt_number: '2620262602583',
        parecer: { verdict: 'apto_com_restricoes', text: 'Resumo do parecer confirmado.', text_status: 'confirmed', text_basis: 'x' },
      },
    },
  };
}

async function render(draft: boolean): Promise<Map<string, Buffer>> {
  const layout = layoutSpec(fixture(), { revisionNumber: 1, issuedAt: ISSUED_AT, draft });
  return readZipEntries(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
}

const xml = (entries: Map<string, Buffer>, name: string) => entries.get(name)?.toString('utf8') ?? '';
const headerName = (entries: Map<string, Buffer>) => [...entries.keys()].find((name) => /^word\/header\d+\.xml$/.test(name))!;
const maskDates = (text: string) => text.replace(/\d{2}\/\d{2}\/\d{4}/g, 'DD/MM/AAAA');
const stripDrawings = (text: string) => text.replace(/<w:r>(?:(?!<w:r>).)*?<w:drawing>.*?<\/w:drawing>.*?<\/w:r>/gs, '');

describe('7.4-UNIT section 10 in the DOCX', () => {
  it('prints the box (verdict as title, the confirmed text), the three bullets, the validity line and the signature block', async () => {
    const layout = layoutSpec(fixture(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const structure = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
    expect(structure.tables).toContainEqual([['Apto com restrições\nResumo do parecer confirmado.']]);
    const at = structure.paragraphs.indexOf('Este relatório tem validade apenas acompanhada da ART 2620262602583');
    expect(at).toBeGreaterThan(0);
    expect(structure.paragraphs.slice(at - 3, at).every((p) => p.length > 40)).toBe(true);
    expect(structure.paragraphs.slice(at + 1, at + 4)).toEqual(['Rafael Lamonde', 'Eng. Eletricista', 'CREA 5063583141']);
    expect(structure.headings.map((h) => h.text)).toContain('10 CONCLUSÃO E OBSERVAÇÕES TÉCNICAS');
  }, 30_000);
});

describe('7.5-UNIT draft equals issued', () => {
  it('the document body differs only by the revision row; the header only by the RASCUNHO drawing', async () => {
    const [issued, draft] = [await render(false), await render(true)];
    const issuedBody = maskDates(xml(issued, 'word/document.xml'));
    const draftBody = maskDates(xml(draft, 'word/document.xml'));
    expect(issuedBody).toContain('Rev. 1');
    expect(draftBody).not.toContain('Rev. 1');
    expect(draftBody).toBe(issuedBody.replace('Rev. 1', '—'));

    const issuedHeader = xml(issued, headerName(issued));
    const draftHeader = xml(draft, headerName(draft));
    expect(issuedHeader).not.toContain('<w:drawing');
    expect(draftHeader).toContain('<w:drawing');
    expect(draftHeader).toContain('behindDoc="1"');
    expect(stripDrawings(draftHeader)).toBe(issuedHeader);
    expect(xml(issued, headerName(issued))).toBe(issuedHeader);
    // The watermark is the one image of the draft; the issued document carries none.
    const media = (entries: Map<string, Buffer>) => [...entries.keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'));
    expect(media(issued)).toHaveLength(0);
    expect(media(draft)).toHaveLength(1);
  }, 60_000);

  it('draws RASCUNHO as a square transparent PNG', async () => {
    const png = await watermarkPng('RASCUNHO');
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([WATERMARK_SIZE_PX, WATERMARK_SIZE_PX]);
    expect(meta.hasAlpha).toBe(true);
    const stats = await sharp(png).stats();
    // Some pixels are drawn (the word), most are transparent.
    expect(stats.channels[3]!.max).toBe(255);
    expect(stats.channels[3]!.mean).toBeLessThan(64);
  }, 30_000);
});
