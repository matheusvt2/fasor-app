import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildSnapshot, layoutSpec, PHOTO_UNAVAILABLE_TEXT, replay, type LayoutSection } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildDocx, TOC_PLACEHOLDER } from './docx.ts';
import { extractStructure, paragraphText, readZipEntries } from './docx-structure.ts';
import { placeholderPages } from './toc.ts';

/*
 * 4.8-UNIT-006: the structure golden (NFR-17, AR-28). The full Porto Seguro fixture is
 * rendered with fixed inputs, unpacked without the `docx` library, and its headings,
 * tables, header and footer are compared with `golden/porto-seguro-skeleton.json`. Drift
 * fails here; a deliberate change is recorded with `GOLDEN_UPDATE=1`. No LibreOffice is
 * needed: the rendering is asserted, the conversion is the integration suite's.
 */

const GOLDEN_PATH = resolve(__dirname, 'golden/porto-seguro-skeleton.json');
const ISSUED_AT = '2026-09-23T12:00:00.000Z';

async function renderFixture(): Promise<Buffer> {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  return buildDocx(layout, { tocPages: placeholderPages(layout) });
}

describe('4.8-UNIT-006 DOCX structure golden', () => {
  it('matches golden/porto-seguro-skeleton.json (headings, tables, header, footer)', async () => {
    const docx = await renderFixture();
    const structure = extractStructure(docx);
    const subject = { headings: structure.headings, tables: structure.tables, header: structure.header, footer: structure.footer };
    if (process.env.GOLDEN_UPDATE === '1') {
      mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(subject, null, 2)}\n`);
    } else if (!existsSync(GOLDEN_PATH)) {
      throw new Error(`${GOLDEN_PATH} is missing; regenerate it deliberately with GOLDEN_UPDATE=1`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as typeof subject;
    expect(subject).toEqual(golden);
  }, 30_000);

  it('prints the AC parts: header lines, PAGE/NUMPAGES footer, DADOS DO CLIENTE, document control with "Rev. 1", the ÍNDICE and the empty section 9', async () => {
    const structure = extractStructure(await renderFixture());
    expect(structure.header).toEqual(['Relatório Técnico de Cabine Primária', 'FO.SERV-03 · Revisão 00']);
    // The fixture's Empresa has no address, phone or e-mail: no empty contact line is printed.
    expect(structure.footer).toEqual(['Fasor Engenharia', 'Página {PAGE} de {NUMPAGES}']);
    expect(structure.headings.map((h) => h.level)).toEqual(new Array(11).fill(1));
    expect(structure.headings.map((h) => h.text)).toEqual([
      '1 OBJETIVO',
      '2 DEFINIÇÕES',
      '3 LIMITE DE ESCOPO',
      '4 REQUISITOS BÁSICOS PARA EXECUÇÃO DE MANUTENÇÃO PREVENTIVA EM CABINES PRIMÁRIAS',
      '5 RECOMENDAÇÕES GERAIS TÉCNICAS E DE SEGURANÇA',
      '6 VERIFICAÇÕES E ENSAIOS APLICÁVEIS',
      '7 REGISTRO FOTOGRÁFICO MANUTENÇÃO PREVENTIVA',
      '8 PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES',
      '9 RELATÓRIOS DOS ENSAIOS',
      '10 CONCLUSÃO E OBSERVAÇÕES TÉCNICAS',
      '11 CERTIFICADOS',
    ]);
    // The cover table: a merged title row, then the five rows.
    const [cover, control] = structure.tables;
    expect(cover![0]).toEqual(['DADOS DO CLIENTE']);
    expect(cover!.slice(1).map((row) => row[0])).toEqual(['Cliente', 'Cidade/local', 'Data da execução do serviço', 'Informações adicionais', 'Responsável']);
    expect(cover![1]![1]).toBe('Porto Seguro Companhia de Seguros Gerais');
    // Q3: the cover's "Informações adicionais" is the setup's own additional_info.
    expect(cover![4]).toEqual(['Informações adicionais', 'Manutenção Preventiva nas Cabines Primárias']);
    expect(control!.map((row) => row[0])).toEqual([
      'Documento',
      'Revisão do documento',
      'Data de emissão',
      'Contratante',
      'Contratada',
      'Responsável técnico',
      'ART/TRT',
      'Período do serviço',
    ]);
    expect(control![1]![1]).toBe('Rev. 1');
    expect(control![2]![1]).toBe('23/09/2026');
    expect(control![5]![1]).toBe('—');
    // The ÍNDICE: one entry per section with a right tab and the placeholder.
    const toc = structure.paragraphs.filter((p) => /^\d+ .*\t00$/.test(p));
    expect(toc).toHaveLength(11);
    expect(toc[0]).toBe(`1 OBJETIVO\t${TOC_PLACEHOLDER}`);
    expect(structure.paragraphs).toContain('ÍNDICE');
    // Section 3's exclusions and the empty section's note (9, until Story 7.1; 7, 8 and 11 print their content).
    expect(structure.paragraphs).toContain('Exclusões:');
    expect(structure.paragraphs).toContain('Quadros elétricos terminais, localizados nos respectivos setores;');
    expect(structure.paragraphs.filter((p) => p === '(sem conteúdo nesta revisão)')).toHaveLength(1);
    const section1 = structure.paragraphs.find((p) => p.startsWith('O presente relatório tem por objetivo'));
    expect(section1).toContain('realizadas pela Fasor Engenharia');
    expect(section1).not.toMatch(/\{[a-z_]+\}/);
  }, 30_000);

  it('writes the page numbers it is given into the ÍNDICE', async () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const layout = layoutSpec(snapshot, { revisionNumber: 2, issuedAt: ISSUED_AT });
    const pages = new Map(layout.toc.map((entry, i) => [entry.number, 4 + i]));
    const structure = extractStructure(await buildDocx(layout, { tocPages: pages }));
    expect(structure.paragraphs.filter((p) => /^\d+ .*\t\d+$/.test(p)).map((p) => p.split('\t')[1])).toEqual(
      layout.toc.map((_, i) => String(4 + i)),
    );
    expect(structure.tables[1]![1]![1]).toBe('Rev. 2');
  }, 30_000);
});

describe('Epic 4 QA Q13 footer size and document properties', () => {
  it('sets the footer size on its paragraph style and paragraph marks, where the PAGE/NUMPAGES results take it from, and names PRODUTO as the last editor', async () => {
    const entries = readZipEntries(await renderFixture());
    const footerName = [...entries.keys()].find((name) => /^word\/footer\d+\.xml$/.test(name))!;
    const footer = entries.get(footerName)!.toString('utf8');
    const paragraphs = footer.match(/<w:p>.*?<\/w:p>|<w:p [^>]*>.*?<\/w:p>/gs) ?? [];
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const paragraph of paragraphs) {
      const pPr = /<w:pPr>(.*?)<\/w:pPr>/s.exec(paragraph)?.[1] ?? '';
      expect(pPr).toContain('<w:pStyle w:val="FooterText"/>');
      // The paragraph mark's own run properties carry the 9 pt size.
      expect(pPr).toMatch(/<w:rPr>.*<w:sz w:val="18"\/>.*<\/w:rPr>/s);
    }
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
    const styles = entries.get('word/styles.xml')!.toString('utf8');
    const footerStyle = /<w:style [^>]*w:styleId="FooterText"[^>]*>(.*?)<\/w:style>/s.exec(styles)?.[1] ?? '';
    expect(footerStyle).toContain('<w:sz w:val="18"/>');
    const core = entries.get('docProps/core.xml')!.toString('utf8');
    expect(core).toContain('<cp:lastModifiedBy>PRODUTO</cp:lastModifiedBy>');
    expect(core).not.toContain('Un-named');
  }, 30_000);
});

describe('4.8-UNIT-007 images', () => {
  const snapshot = () => buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const png = () => sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 40, b: 90 } } }).png().toBuffer();
  const jpeg = () => sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 100, b: 20 } } }).jpeg().toBuffer();
  /** The image files under `word/media/` (the archive also lists the directory itself). */
  const mediaFiles = (entries: Map<string, Buffer>) => [...entries.keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'));

  it('embeds the logo in the header and the cover photo in the body', async () => {
    const layout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { logo: await png(), cover: await jpeg() } });
    const entries = readZipEntries(docx);
    expect(mediaFiles(entries)).toHaveLength(2);
    expect(entries.get('word/header1.xml')?.toString('utf8')).toContain('<w:drawing');
    expect(entries.get('word/document.xml')?.toString('utf8')).toContain('<w:drawing');
    // The header keeps its two lines; the logo sits a tab before the title.
    expect(extractStructure(docx).header).toEqual(['\tRelatório Técnico de Cabine Primária', 'FO.SERV-03 · Revisão 00']);
  }, 30_000);

  it('prints without an image sharp cannot read, and never throws for it', async () => {
    const layout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { logo: Buffer.from('not an image'), cover: Buffer.from('garbage') } });
    const entries = readZipEntries(docx);
    expect(mediaFiles(entries)).toHaveLength(0);
    expect(entries.get('word/header1.xml')?.toString('utf8')).not.toContain('<w:drawing');
    expect(extractStructure(docx).header).toEqual(['Relatório Técnico de Cabine Primária', 'FO.SERV-03 · Revisão 00']);
  }, 30_000);
});

describe('7.2/7.3-UNIT sections 7, 8 and 11', () => {
  const snapshot = () => buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  const colour = (r: number, width = 40, height = 30) => sharp({ create: { width, height, channels: 3, background: { r, g: 90, b: 40 } } });
  const mediaFiles = (entries: Map<string, Buffer>) => [...entries.keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'));
  const kindOf = <K extends LayoutSection['kind']>(sections: LayoutSection[], kind: K) => sections.find((s): s is Extract<LayoutSection, { kind: K }> => s.kind === kind)!;

  it('prints the photo table, the bullets and the certificate placeholders from the layout alone (no bytes)', async () => {
    const layout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
    const structure = extractStructure(docx);
    expect(mediaFiles(readZipEntries(docx))).toHaveLength(0);
    // Section 7: 82 photos two per row, each cell its placeholder, "Imagem N: caption." and the stamp.
    const photoTable = structure.tables.find((table) => table[0]![0]!.startsWith(PHOTO_UNAVAILABLE_TEXT))!;
    expect(photoTable).toHaveLength(41);
    expect(photoTable[0]![0]).toBe(`${PHOTO_UNAVAILABLE_TEXT}\nImagem 1: Detalhe da equipe da Enel no local para desligamento e religamento da energia.\n10/09/2026 09:00`);
    expect(photoTable[40]![1]!.split('\n')[1]).toMatch(/^Imagem 82: /);
    expect(structure.paragraphs.filter((p) => p === PHOTO_UNAVAILABLE_TEXT)).toHaveLength(82);
    // Section 8: each bullet as a numbered-list paragraph, in order.
    const bullets = kindOf(layout.sections, 'points').bullets;
    const start = structure.paragraphs.indexOf(bullets[0]!);
    expect(start).toBeGreaterThan(0);
    expect(structure.paragraphs.slice(start, start + bullets.length)).toEqual(bullets);
    // Section 11: the three placeholder lines.
    expect(structure.paragraphs.filter((p) => p.startsWith('Certificado não anexado: '))).toEqual([
      'Certificado não anexado: 2E — Megôhmetro Digital (nº 37428/26)',
      'Certificado não anexado: 3M — Micro-Ohmmeter (nº 37276/26)',
      'Certificado não anexado: 1T — Transformer Ratiometer (nº 37274/26)',
    ]);
    const document = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
    // The photo rows never split across pages; section 8 is a bulleted list.
    expect(document).toContain('<w:cantSplit/>');
    expect(document).toContain('<w:numPr>');
  }, 60_000);

  it('embeds the photos it has bytes for and each certificate page on its own page; the rest print their placeholders', async () => {
    const layout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const photosSection = kindOf(layout.sections, 'photos');
    const certificates = kindOf(layout.sections, 'certificates');
    // Two certificates attached: one with two page images, one the job could not read.
    certificates.certificates[0] = { ...certificates.certificates[0]!, certificateFileId: 'cert-a' };
    certificates.certificates[1] = { ...certificates.certificates[1]!, certificateFileId: 'cert-b' };
    const photos = new Map([
      [photosSection.photos[0]!.fileId, await colour(10).jpeg().toBuffer()],
      [photosSection.photos[1]!.fileId, await colour(60).png().toBuffer()],
      // Bytes sharp cannot read print the placeholder too.
      [photosSection.photos[2]!.fileId, Buffer.from('garbage')],
    ]);
    const pages = new Map([['cert-a', [await colour(120, 1240, 1754).png().toBuffer(), await colour(180, 1240, 1754).png().toBuffer()]]]);
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { photos, certificates: pages } });
    const entries = readZipEntries(docx);
    expect(mediaFiles(entries)).toHaveLength(4);
    const structure = extractStructure(docx);
    expect(structure.paragraphs.filter((p) => p === PHOTO_UNAVAILABLE_TEXT)).toHaveLength(80);
    expect(structure.paragraphs.filter((p) => p.startsWith('Certificado não anexado: '))).toEqual([
      'Certificado não anexado: 3M — Micro-Ohmmeter (nº 37276/26)',
      'Certificado não anexado: 1T — Transformer Ratiometer (nº 37274/26)',
    ]);
    const document = entries.get('word/document.xml')!.toString('utf8');
    // The first certificate page sits under the heading (kept with it); every later one
    // starts its own page, and each fits the content box (at most 18.46 x 23 cm in EMU).
    expect(document.match(/<w:pageBreakBefore\/>/g) ?? []).toHaveLength(1);
    const extents = [...document.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(extents).toHaveLength(4);
    for (const [cx, cy] of extents.slice(2)) {
      expect(cx).toBeLessThanOrEqual(Math.round(18.47 * 360_000));
      expect(cy).toBeLessThanOrEqual(Math.round(23.01 * 360_000));
    }
    // The photos fit 8.5 x 6.4 cm.
    for (const [cx, cy] of extents.slice(0, 2)) {
      expect(cx).toBeLessThanOrEqual(Math.round(8.51 * 360_000));
      expect(cy).toBeLessThanOrEqual(Math.round(6.41 * 360_000));
    }
  }, 60_000);
});

describe('docx-structure helpers', () => {
  it('reads a zip written by docx and serializes fields and tabs', async () => {
    const entries = readZipEntries(await renderFixture());
    expect(entries.has('word/document.xml')).toBe(true);
    expect(entries.has('[Content_Types].xml')).toBe(true);
    expect(
      paragraphText(
        '<w:p><w:r><w:t xml:space="preserve">Página </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:tab/><w:t>a &amp; b</w:t></w:r></w:p>',
      ),
    ).toBe('Página {PAGE}\ta & b');
  });
});
