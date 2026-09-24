import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildSnapshot, layoutSpec, replay } from '@app/domain';
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

  it('prints the AC parts: header lines, PAGE/NUMPAGES footer, DADOS DO CLIENTE, document control with "Rev. 1", the ÍNDICE and the empty sections', async () => {
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
    // Section 3's exclusions and the empty sections' note.
    expect(structure.paragraphs).toContain('Exclusões:');
    expect(structure.paragraphs).toContain('Quadros elétricos terminais, localizados nos respectivos setores;');
    expect(structure.paragraphs.filter((p) => p === '(sem conteúdo nesta revisão)')).toHaveLength(4);
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
