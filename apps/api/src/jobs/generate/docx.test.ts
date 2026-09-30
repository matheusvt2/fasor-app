import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ACTION_PLAN_COLUMNS, buildSnapshot, layoutSpec, livePoints, numberPhotos, PHOTO_UNAVAILABLE_TEXT, replay, tocLines, type LayoutSection, type RelatorioSnapshot } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildDocx, TOC_PLACEHOLDER } from './docx.ts';
import { extractStructure, paragraphText, readZipEntries, type DocxStructure } from './docx-structure.ts';
import { placeholderPages } from './toc.ts';

/*
 * 4.8-UNIT-006: the structure golden (NFR-17, AR-28). The full Porto Seguro fixture is
 * rendered with fixed inputs, unpacked without the `docx` library, and its headings,
 * tables, header and footer are compared with `golden/porto-seguro-skeleton.json`. Drift
 * fails here; a deliberate change is recorded with `GOLDEN_UPDATE=1`. No LibreOffice is
 * needed: the rendering is asserted, the conversion is the integration suite's. Since Story
 * 7.1 the golden carries section 9's 94 sheets, one table row per line so its diff reads.
 */

const GOLDEN_PATH = resolve(__dirname, 'golden/porto-seguro-skeleton.json');
const ISSUED_AT = '2026-09-23T12:00:00.000Z';

type Golden = Pick<DocxStructure, 'headings' | 'tables' | 'header' | 'footer'>;

/** The golden's JSON: pretty-printed, but every heading and every table row on one line. */
function goldenJson(subject: Golden): string {
  const list = (items: readonly unknown[], indent: string) => items.map((item) => `${indent}${JSON.stringify(item)}`).join(',\n');
  const tables = subject.tables.map((table) => `    [\n${list(table, '      ')}\n    ]`).join(',\n');
  return `{\n  "headings": [\n${list(subject.headings, '    ')}\n  ],\n  "tables": [\n${tables}\n  ],\n  "header": [\n${list(subject.header, '    ')}\n  ],\n  "footer": [\n${list(subject.footer, '    ')}\n  ]\n}\n`;
}

function fixtureSnapshot(): RelatorioSnapshot {
  return buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
}

/** The fixture rendered once for the tests that only read it: 94 sheets make each render take seconds. */
let fixtureDocx: Promise<Buffer> | null = null;
function renderFixture(): Promise<Buffer> {
  fixtureDocx ??= (async () => {
    const layout = layoutSpec(fixtureSnapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    return buildDocx(layout, { tocPages: placeholderPages(layout) });
  })();
  return fixtureDocx;
}

describe('4.8-UNIT-006 DOCX structure golden', () => {
  it('matches golden/porto-seguro-skeleton.json (headings, tables, header, footer)', async () => {
    const docx = await renderFixture();
    const structure = extractStructure(docx);
    const subject: Golden = { headings: structure.headings, tables: structure.tables, header: structure.header, footer: structure.footer };
    if (process.env.GOLDEN_UPDATE === '1') {
      mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
      writeFileSync(GOLDEN_PATH, goldenJson(subject));
    } else if (!existsSync(GOLDEN_PATH)) {
      throw new Error(`${GOLDEN_PATH} is missing; regenerate it deliberately with GOLDEN_UPDATE=1`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
    expect(subject).toEqual(golden);
  }, 60_000);

  it('prints the AC parts: header lines, PAGE/NUMPAGES footer, DADOS DO CLIENTE, document control with "Rev. 1", the ÍNDICE and the empty section 9', async () => {
    const structure = extractStructure(await renderFixture());
    expect(structure.header).toEqual(['Relatório Técnico de Cabine Primária', 'FO.SERV-03 · Revisão 00']);
    // The fixture's Empresa has no address, phone or e-mail: no empty contact line is printed.
    expect(structure.footer).toEqual(['Fasor Engenharia', 'Página {PAGE} de {NUMPAGES}']);
    // Level 1: the eleven sections; level 2: section 9's subsections (Story 7.1).
    expect(structure.headings.map((h) => h.level)).toEqual([...new Array(9).fill(1), ...new Array(11).fill(2), 1, 1]);
    expect(structure.headings.filter((h) => h.level === 1).map((h) => h.text)).toEqual([
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
    // The ÍNDICE: one entry per section with a right tab and the placeholder, and (E7-A4) section
    // 9's eleven subsections 9.1 to 9.11 right after it, as FO.SERV-03 lists them.
    const toc = structure.paragraphs.filter((p) => /^\d+(\.\d+)? .*\t00$/.test(p));
    expect(toc).toHaveLength(22);
    expect(toc[0]).toBe(`1 OBJETIVO\t${TOC_PLACEHOLDER}`);
    expect(toc.map((p) => p.split(' ', 1)[0])).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', ...Array.from({ length: 11 }, (_, i) => `9.${i + 1}`), '10', '11']);
    expect(toc[9]).toBe(`9.1 Cubículo Enel\t${TOC_PLACEHOLDER}`);
    expect(structure.paragraphs).toContain('ÍNDICE');
    // Section 3's exclusions; every numbered section prints content on the fixture (7, 8, 9, 11 since Epic 7).
    expect(structure.paragraphs).toContain('Exclusões:');
    expect(structure.paragraphs).toContain('Quadros elétricos terminais, localizados nos respectivos setores;');
    expect(structure.paragraphs.filter((p) => p === '(sem conteúdo nesta revisão)')).toHaveLength(0);
    const section1 = structure.paragraphs.find((p) => p.startsWith('O presente relatório tem por objetivo'));
    expect(section1).toContain('realizadas pela Fasor Engenharia');
    expect(section1).not.toMatch(/\{[a-z_]+\}/);
  }, 60_000);

  it('writes the page numbers it is given into the ÍNDICE', async () => {
    const layout = layoutSpec(fixtureSnapshot(), { revisionNumber: 2, issuedAt: ISSUED_AT });
    const lines = tocLines(layout);
    const pages = new Map(lines.map((line, i) => [line.key, 4 + i]));
    const structure = extractStructure(await buildDocx(layout, { tocPages: pages }));
    expect(structure.paragraphs.filter((p) => /^\d+(\.\d+)? .*\t\d+$/.test(p)).map((p) => p.split('\t')[1])).toEqual(lines.map((_, i) => String(4 + i)));
    // The subsection lines indent as level 2; the section lines do not.
    const document = readZipEntries(await buildDocx(layout, { tocPages: pages })).get('word/document.xml')!.toString('utf8');
    const paragraphOf = (start: string) => [...document.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => m[1]!).find((p) => paragraphText(p).startsWith(start))!;
    expect(paragraphOf('9.1 Cubículo Enel\t')).toMatch(/<w:ind w:left="220"\/>/);
    expect(paragraphOf('9 RELATÓRIOS DOS ENSAIOS\t')).not.toContain('<w:ind');
    expect(structure.tables[1]![1]![1]).toBe('Rev. 2');
  }, 60_000);
});

describe('E7-A4 section 9 starts a page', () => {
  it('breaks the page before section 9\'s own Heading 1, and before no other section heading', async () => {
    const document = readZipEntries(await renderFixture()).get('word/document.xml')!.toString('utf8');
    const headings = [...document.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => m[1]!).filter((p) => p.includes('<w:pStyle w:val="Heading1"/>'));
    const section9 = headings.find((p) => paragraphText(p) === '9 RELATÓRIOS DOS ENSAIOS')!;
    expect(section9).toContain('<w:pageBreakBefore/>');
    expect(headings.filter((p) => p.includes('<w:pageBreakBefore/>')).map(paragraphText)).toEqual(['9 RELATÓRIOS DOS ENSAIOS']);
  }, 60_000);
});

describe('7.1-UNIT section 9 in the DOCX', () => {
  const jpeg = () => sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 100, b: 20 } } }).jpeg().toBuffer();

  it('heads the Porto Seguro subsections 9.1 to 9.11 as Heading 2, the FO.SERV-03 titles', async () => {
    const structure = extractStructure(await renderFixture());
    expect(structure.headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual([
      '9.1 Cubículo Enel',
      '9.2 Seccionadoras dos Cubículos de MT do 1° Subsolo',
      '9.3 Disjuntores dos Cubículos de MT do 1° Subsolo',
      "9.4 TP's e TC's dos Cubículos de MT do 1° Subsolo",
      '9.5 Transformadores e Cabos de Alimentação do 1° Subsolo',
      '9.6 Oxigênio',
      '9.7 Cobertura A',
      '9.8 Cobertura B',
      '9.9 Seccionadoras dos Cubículos de MT dos Geradores',
      '9.10 Disjuntores dos Cubículos de MT dos Geradores',
      "9.11 TP's e TC's dos Cubículos de MT dos Geradores",
    ]);
    const styles = readZipEntries(await renderFixture()).get('word/styles.xml')!.toString('utf8');
    const heading2 = /<w:style [^>]*w:styleId="Heading2"[^>]*>(?:(?!<\/w:style>).)*<w:outlineLvl w:val="1"\/>(?:(?!<\/w:style>).)*<\/w:style>/s.exec(styles);
    expect(heading2).not.toBeNull();
  }, 60_000);

  it('prints every sheet as native Word tables, never as a picture', async () => {
    const docx = await renderFixture();
    const entries = readZipEntries(docx);
    expect([...entries.keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'))).toEqual([]);
    const document = entries.get('word/document.xml')!.toString('utf8');
    expect(document).not.toContain('<w:drawing');
    const structure = extractStructure(docx);
    // Two tables before section 9 (the cover and the document control); every sheet adds several.
    expect(structure.tables.length).toBeGreaterThan(2 + 94 * 4);
    expect(structure.tables.filter((table) => table[0]![0] === 'VERIFICAÇÕES GERAIS')).toHaveLength(94 - 3);
    const enelCabos = structure.tables.find((table) => table[0]![0] === 'CARACTERÍSTICAS DA SE')!;
    expect(enelCabos).toEqual([['CARACTERÍSTICAS DA SE'], ['TIPO DE SE', 'TENSÃO PRIMÁRIA', 'TENSÃO SECUNDÁRIA', 'POTÊNCIA INSTALADA'], ['BLINDADA', '13,8 kV', '-', '10 kVA']]);
    // The sheet title bars, in the delivered 9.5 order: each alimentação cable before its transformer.
    const titles = structure.paragraphs.filter((p) => /^(CABOS DE ALIMENTAÇÃO|TRANSFORMADOR DE FORÇA) (CB-)?TR/.test(p));
    expect(titles.slice(0, 4)).toEqual(['CABOS DE ALIMENTAÇÃO CB-TR1', 'TRANSFORMADOR DE FORÇA TR-1', 'CABOS DE ALIMENTAÇÃO CB-TR2', 'TRANSFORMADOR DE FORÇA TR-2']);
  }, 60_000);

  it('starts each subsection after the first and each sheet after its subsection\'s first on a new page, never splits a row, and spans the bands', async () => {
    const document = readZipEntries(await renderFixture()).get('word/document.xml')!.toString('utf8');
    // Section 9's own heading: 1 break (E7-A4); 11 subsections: 10 breaks; 94 sheets in 11 subsections: 83 breaks.
    expect(document.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1 + 10 + 83);
    const tables = [...document.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((match) => match[1]!);
    // The cover and the document control come first; section 7's photo tables, section 10's
    // parecer box and section 11 (Stories 7.2 to 7.4) never carry a row guard, the sheets always do.
    // Section 8's action-plan table (Story 11.10) guards only its repeated header row.
    const sheetRows = tables
      .slice(2)
      .filter((table) => table.includes('<w:cantSplit/>') && !table.includes('<w:tblHeader/>')).flatMap((table) => [...table.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((match) => match[1]!));
    expect(sheetRows.length).toBeGreaterThan(94 * 10);
    for (const row of sheetRows) expect(row).toContain('<w:cantSplit/>');
    const bands = sheetRows.filter((row) => paragraphText(row) === 'DADOS DO EQUIPAMENTO');
    // Every sheet but the cabos (4 de entrada, 9 de saída), whose type has no nameplate.
    expect(bands).toHaveLength(94 - 4 - 9);
    for (const band of bands) expect(band).toContain('<w:gridSpan w:val="6"/>');
  }, 60_000);

  /** The fixture with its first photo moved into the sheet of TR-1, and that photo's id, number and caption. */
  function withPhotoInTr1() {
    const base = fixtureSnapshot();
    const tr1 = base.blocks.find((b) => b.equipment_id === base.equipment.find((e) => e.tag === 'TR-1')!.id)!;
    const photo = base.files.find((f) => f.kind === 'photo')!;
    const snapshot: RelatorioSnapshot = { ...base, files: base.files.map((f) => (f.id === photo.id && f.kind === 'photo' ? { ...f, block_id: tr1.id } : f)) };
    const caption = photo.kind === 'photo' ? photo.caption : null;
    return { snapshot, photoId: photo.id, number: numberPhotos(snapshot.files).get(photo.id)!, caption };
  }

  it('embeds a block-linked photo inside its sheet, with "Imagem N: ⟨legenda⟩." beneath and N its numberPhotos number', async () => {
    const { snapshot, photoId, number, caption } = withPhotoInTr1();
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { photos: new Map([[photoId, await jpeg()]]) } });
    const entries = readZipEntries(docx);
    expect([...entries.keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'))).toHaveLength(1);
    // The fixture's caption already ends in a period: none is added.
    expect(caption).toBe('Detalhe da equipe da Enel no local para desligamento e religamento da energia.');
    const line = `Imagem ${number}: ${caption}`;
    expect(line).toBe('Imagem 1: Detalhe da equipe da Enel no local para desligamento e religamento da energia.');
    const { paragraphs, tables } = extractStructure(docx);
    const at = paragraphs.indexOf('TRANSFORMADOR DE FORÇA TR-1');
    const next = paragraphs.indexOf('CABOS DE ALIMENTAÇÃO CB-TR2');
    expect(at).toBeGreaterThan(-1);
    // Section 7 prints the same line first (Story 7.2); the sheet's copy follows its title bar.
    expect(paragraphs.indexOf(line, at)).toBeGreaterThan(at);
    expect(paragraphs.indexOf(line, at)).toBeLessThan(next);
    // The picture and its line share one cell of the photo table.
    const document = entries.get('word/document.xml')!.toString('utf8');
    const cell = [...document.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((match) => match[0]).find((xml) => paragraphText(xml).includes(line))!;
    expect(cell).toContain('<w:drawing');
    expect(tables.some((table) => table.some((row) => row.includes(`\n${line}`)))).toBe(true);
  }, 60_000);

  it('keeps the photo line and leaves its image cell empty when the bytes are missing or unreadable, and never throws', async () => {
    const { snapshot, photoId, number, caption } = withPhotoInTr1();
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    for (const photos of [new Map<string, Buffer>(), new Map([[photoId, Buffer.from('not an image')]])]) {
      const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { photos } });
      const entries = readZipEntries(docx);
      expect([...entries.keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'))).toHaveLength(0);
      expect(extractStructure(docx).paragraphs).toContain(`Imagem ${number}: ${caption}`);
    }
  }, 60_000);
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
    // The header keeps its two lines, both beside the logo (checked on the XML below).
    expect(extractStructure(docx).header.filter((line) => line !== '')).toEqual(['Relatório Técnico de Cabine Primária', 'FO.SERV-03 · Revisão 00']);
  }, 30_000);

  it('A11: with a logo, the header is a two-cell borderless table, the logo left and both lines right', async () => {
    const layout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { logo: await jpeg() } });
    const header = readZipEntries(docx).get('word/header1.xml')!.toString('utf8');
    const tables = [...header.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)];
    expect(tables).toHaveLength(1);
    const table = tables[0]![0];
    // Borderless: every table border is none.
    const tableBorders = /<w:tblBorders>([\s\S]*?)<\/w:tblBorders>/.exec(table)?.[1] ?? '';
    const borderStyles = [...tableBorders.matchAll(/<w:(\w+) w:val="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(borderStyles.map(([side]) => side).sort()).toEqual(['bottom', 'insideH', 'insideV', 'left', 'right', 'top']);
    expect(borderStyles.every(([, style]) => style === 'none' || style === 'nil')).toBe(true);
    // One row, two cells: the logo alone on the left, the title and form lines on the right.
    const cells = [...table.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1]!);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toContain('<w:drawing');
    expect(paragraphText(cells[0]!)).toBe('');
    expect(cells[1]).not.toContain('<w:drawing');
    const rightLines = [...cells[1]!.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((m) => paragraphText(m[0]));
    expect(rightLines).toEqual(['Relatório Técnico de Cabine Primária', 'FO.SERV-03 · Revisão 00']);
    // No tab stands in for the side-by-side layout any more.
    expect(header).not.toContain('<w:tab/>');

    // A draft with a logo: RASCUNHO rides in the paragraph after the table, behind the text.
    const draftLayout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT, draft: true });
    const draft = await buildDocx(draftLayout, { tocPages: placeholderPages(draftLayout), images: { logo: await jpeg() } });
    const draftHeader = readZipEntries(draft).get('word/header1.xml')!.toString('utf8');
    const afterTable = draftHeader.slice(draftHeader.indexOf('</w:tbl>'));
    expect(afterTable).toContain('<w:drawing');
    expect(afterTable).toContain('behindDoc="1"');
  }, 60_000);

  it('prints without an image sharp cannot read, and never throws for it', async () => {
    const layout = layoutSpec(snapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), images: { logo: Buffer.from('not an image'), cover: Buffer.from('garbage') } });
    const entries = readZipEntries(docx);
    expect(mediaFiles(entries)).toHaveLength(0);
    expect(entries.get('word/header1.xml')?.toString('utf8')).not.toContain('<w:drawing');
    // Without a (readable) logo the header is the two paragraphs, no table.
    expect(entries.get('word/header1.xml')?.toString('utf8')).not.toContain('<w:tbl>');
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
    // Plus section 9's 94 breaks (E7-A4: its own heading; Story 7.1: 10 subsections after the first, 83 sheets).
    expect(document.match(/<w:pageBreakBefore\/>/g) ?? []).toHaveLength(1 + 94);
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

describe('11.10-UNIT section 8 action-plan table', () => {
  /** The body XML between section `n`'s Heading 1 and the next Heading 1 (E7-A6: read from the heading, never by position). */
  function sectionXml(document: string, n: number): string {
    const headings = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter((m) => m[0].includes('w:val="Heading1"'));
    const at = headings.findIndex((m) => paragraphText(m[0]).startsWith(`${n} `));
    expect(at).toBeGreaterThanOrEqual(0);
    const start = headings[at]!.index!;
    const end = headings[at + 1]?.index ?? document.length;
    return document.slice(start, end);
  }

  it('prints the header row and one row per bullet directly after the last bullet', async () => {
    const base = fixtureSnapshot();
    const [first, second] = livePoints(base.points);
    const snapshot: RelatorioSnapshot = {
      ...base,
      points: base.points.map((point) =>
        point.id === first!.id ? { ...point, priority: 'P1' as const, deadline: '2026-10-08', owner: 'Manutenção predial' } : point.id === second!.id ? { ...point, deadline: null } : point,
      ),
    };
    const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const section = layout.sections.find((s): s is Extract<LayoutSection, { kind: 'points' }> => s.kind === 'points')!;
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
    const document = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
    const xml = sectionXml(document, 8);
    // The last bullet, then the table: nothing between them.
    const lastBullet = section.bullets.at(-1)!;
    const tableAt = xml.indexOf('<w:tbl>');
    expect(tableAt).toBeGreaterThan(0);
    const before = [...xml.slice(0, tableAt).matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => paragraphText(m[0]));
    expect(before.at(-1)).toBe(lastBullet);
    const rows = [...xml.slice(tableAt).matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((row) =>
      [...row[1]!.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cell) => paragraphText(cell[1]!)),
    );
    expect(rows[0]).toEqual([...ACTION_PLAN_COLUMNS]);
    expect(rows).toHaveLength(1 + section.bullets.length);
    expect(rows.slice(1).map((row) => row[0])).toEqual(section.bullets.map((_, i) => String(i + 1)));
    expect(rows[1]!.slice(3, 5)).toEqual(['P1 · Curto prazo', '08/10/2026']);
    expect(rows[1]![6]).toBe('Manutenção predial');
    expect(rows[2]![4]).toBe('—');
    // The header row repeats on every page and never splits; a body row taller than a page may split.
    const table = xml.slice(tableAt);
    expect(table.match(/<w:tblHeader\/>/g) ?? []).toHaveLength(1);
    expect(table.match(/<w:cantSplit\/>/g) ?? []).toHaveLength(1);
  }, 60_000);

  /**
   * Advance widths of Arial Bold in 1/1000 em (the Helvetica-Bold AFM; Liberation Sans Bold,
   * which prints in the api image, is metric-compatible) for the header's characters. An
   * unknown character counts a full em, so a new header word can only fail safe.
   */
  const ARIAL_BOLD: Record<string, number> = {
    N: 722, 'º': 365, P: 667, L: 611, T: 611, A: 722, G: 778, R: 722, I: 278, '/': 278,
    a: 556, 'á': 556, 'ã': 556, c: 556, 'ç': 556, d: 611, e: 556, g: 611, i: 278, l: 278, m: 889, n: 611, o: 611, r: 389, s: 556, t: 333, v: 556, z: 500,
  };
  /** A word's width in twips at 9 pt (180 twips to the em), with 5 % for kerning and hinting. */
  const boldWidth9pt = (word: string) => ([...word].reduce((sum, ch) => sum + (ARIAL_BOLD[ch] ?? 1000), 0) / 1000) * 180 * 1.05;

  it('E11-Q4: every header word fits its column at 9 pt bold inside the cell margins, so no word breaks in the PDF', async () => {
    const layout = layoutSpec(fixtureSnapshot(), { revisionNumber: 1, issuedAt: ISSUED_AT });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
    const xml = sectionXml(readZipEntries(docx).get('word/document.xml')!.toString('utf8'), 8);
    const table = xml.slice(xml.indexOf('<w:tbl>'));
    const grid = [...table.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(grid).toHaveLength(ACTION_PLAN_COLUMNS.length);
    const header = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/.exec(table)![1]!;
    const margins = [...header.matchAll(/<w:tcMar>([\s\S]*?)<\/w:tcMar>/g)].map((m) => {
      const side = (names: string) => Number(new RegExp(`<w:(?:${names})\\b[^>]*\\bw:w="(\\d+)"`).exec(m[1]!)![1]);
      return side('left|start') + side('right|end');
    });
    expect(margins).toHaveLength(ACTION_PLAN_COLUMNS.length);
    ACTION_PLAN_COLUMNS.forEach((title, i) => {
      for (const word of title.split(' ')) expect({ word, fits: boldWidth9pt(word) <= grid[i]! - margins[i]! }).toEqual({ word, fits: true });
    });
    // The two words QA saw broken (E11-Q4) are the tightest; the measure is not vacuous.
    expect(boldWidth9pt('Responsável')).toBeGreaterThan(1100);
  }, 60_000);
});
