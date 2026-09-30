import { buildSnapshot, layoutSpec, replay, type BlockRow, type RelatorioSnapshot } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { Document, Packer, Paragraph } from 'docx';
import { describe, expect, it } from 'vitest';
import { buildDocx, richRuns, text } from './docx.ts';
import { extractStructure, readZipEntries } from './docx-structure.ts';
import { placeholderPages } from './toc.ts';

/*
 * Story 11.4 (FR-12): a section's formatted text as the DOCX prints it. The kernel parses
 * the markup (`templates/rich-text.ts`); the renderer turns its runs into bold and italic
 * `TextRun`s, bullet items into the bullet list and numbered items into a decimal list, one
 * numbering instance per list. A text without formatting renders exactly as before.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const RICH_SECTION_1 = 'Serviços para **{cliente}**:\n- **Termografia** dos painéis\n- Inspeção *visual*\n1. Limpeza\n2. Reaperto *quando aplicável*\n\nFim.\n1. Outra lista';

/** The small fixture with one section block, section 1, holding `sectionText`: only it prints. */
function withSection1(sectionText: string): RelatorioSnapshot {
  const snapshot = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
  const block: BlockRow = {
    id: '019966c1-00f3-7000-8000-000000000001',
    relatorio_id: snapshot.relatorio.id,
    location_id: null,
    equipment_id: null,
    block_type: 'section_1',
    config: { block_type: 'section_1', sub_blocks: {}, na_defaults: [], section_text: sectionText },
    seed_version: snapshot.relatorio.seed_version,
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { nameplate: {}, checklist: {}, test: {}, conclusion: {}, observations: null },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
  return { ...snapshot, blocks: [...snapshot.blocks, block] };
}

async function render(snapshot: RelatorioSnapshot): Promise<{ docx: Buffer; entries: Map<string, Buffer> }> {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
  const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
  return { docx, entries: readZipEntries(docx) };
}

const xml = (entries: Map<string, Buffer>, name: string) => entries.get(name)?.toString('utf8') ?? '';

/** Every body paragraph's XML after the Heading 1 "1 OBJETIVO". */
function section1Paragraphs(document: string): string[] {
  const paragraphs = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
  const at = paragraphs.findIndex((p) => p.includes('w:val="Heading1"') && p.includes('1 OBJETIVO'));
  expect(at).toBeGreaterThanOrEqual(0);
  return paragraphs.slice(at + 1);
}

/** A run's XML holding exactly `words`. */
const runOf = (paragraph: string, words: string) => [...paragraph.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((m) => m[0]).find((r) => r.includes(`>${words}</w:t>`));

describe('11.4-UNIT a formatted section text in the DOCX', () => {
  it('prints bold and italic runs, a bullet list and decimal lists restarting per list', async () => {
    const { docx, entries } = await render(withSection1(RICH_SECTION_1));
    const [intro, bullet1, bullet2, numbered1, numbered2, fim, numbered3] = section1Paragraphs(xml(entries, 'word/document.xml'));

    // The variable resolved inside the bold run.
    expect(runOf(intro!, 'Cliente de Testes Ltda')).toContain('<w:b/>');
    expect(runOf(intro!, 'Serviços para ')).not.toContain('<w:b/>');
    expect(runOf(bullet1!, 'Termografia')).toContain('<w:b/>');
    expect(runOf(bullet2!, 'visual')).toContain('<w:i/>');
    expect(runOf(bullet2!, 'visual')).not.toContain('<w:b/>');
    for (const bullet of [bullet1!, bullet2!]) expect(bullet).toMatch(/<w:numPr>/);
    expect(runOf(numbered2!, 'quando aplicável')).toContain('<w:i/>');

    // The numbered items use the decimal list; a list after a paragraph is a new instance.
    const numId = (p: string) => /<w:numId w:val="(\d+)"\/>/.exec(p)?.[1];
    expect(numId(numbered1!)).toBe(numId(numbered2!));
    expect(numId(numbered3!)).not.toBe(numId(numbered1!));
    expect(numId(bullet1!)).not.toBe(numId(numbered1!));
    expect(fim).not.toMatch(/<w:numPr>/);
    const numbering = xml(entries, 'word/numbering.xml');
    expect(numbering).toContain('w:val="decimal"');
    expect(numbering).toContain('w:val="%1."');

    const structure = extractStructure(docx);
    expect(structure.paragraphs).toContain('Serviços para Cliente de Testes Ltda:');
    expect(structure.paragraphs).toContain('Reaperto quando aplicável');
  });

  it('adds no decimal list to a document without a numbered item', async () => {
    const { entries } = await render(withSection1('Intro\nitem a\nitem b'));
    expect(xml(entries, 'word/numbering.xml')).not.toContain('w:val="decimal"');
  });

  it('writes a plain run exactly as text() does, so an unformatted text renders byte for byte as before', async () => {
    const documentXml = async (paragraph: Paragraph) =>
      readZipEntries(await Packer.toBuffer(new Document({ sections: [{ children: [paragraph] }] }))).get('word/document.xml')!.toString('utf8');
    expect(await documentXml(new Paragraph({ children: richRuns([{ text: 'Texto simples' }]) }))).toBe(await documentXml(new Paragraph({ children: [text('Texto simples')] })));
    expect(await documentXml(new Paragraph({ children: richRuns([{ text: 'Título' }], { bold: true }) }))).toBe(
      await documentXml(new Paragraph({ children: [text('Título', { bold: true })] })),
    );
  });
});
