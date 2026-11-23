import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { EARTH_RESISTANCE_PARAGRAPH, layoutSpec, relatorioSectionNumber, type RelatorioSnapshot } from '@app/domain';
import { layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { convertToPdf } from './libreoffice.ts';
import { placeholderPages } from './toc.ts';

/*
 * 28.9-INT-001 and 28.10-INT-001 (batch e28c; B-15, B-14, B-12): the DOCX of the Epic 25 synthetic relatório on seed v18,
 * which holds a Malha de aterramento sheet, with two additional items: section 10 prints them as topics after its fixed
 * items and before the validity line; section 1 reads "Transformação de ⟨cliente⟩"; section 2 prints the paragraph on earth
 * resistance after the one on insulation. Without the Malha, section 2 has no such paragraph; with its own section 2 text
 * it prints that text only. The v17 twin prints none of it, the items it holds included. The PDF half needs LibreOffice,
 * which the api image carries and the tools image does not:
 *   podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/e28c-v18-print.integration.test.ts
 * Where no `soffice` is on the PATH it is skipped. Every value is invented.
 */

const ISSUED_AT = '2026-12-10T15:00:00.000Z';
const NBSP = /\u00a0/gu;
const ITEMS = [
  'O ensaio de isolação dos cabos de saída da Coluna 4 foi feito em conjunto, pelo barramento, com as duas chaves fechadas.',
  'Os ajustes dos relés seguem o estudo de seletividade fornecido pelo cliente, que não foi revisado nesta manutenção.',
];
const OWN_SECTION_2 = 'Definições próprias deste relatório.';

const sofficeOnPath = (process.env.PATH ?? '').split(delimiter).some((dir) => {
  try {
    accessSync(join(dir, 'soffice'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

type Variant = { malha?: boolean; ownSection2?: boolean };

/** The Epic 25 relatório of `version` with the two items; without its Malha, or with an own section 2 text, on request. */
function relatorio(version: 'v17' | 'v18', variant: Variant = {}): RelatorioSnapshot {
  const base = layoutLockEpic25Snapshot(version);
  const blocks = base.blocks
    .filter((block) => variant.malha !== false || block.block_type !== 'malha_aterramento')
    .map((block) => (variant.ownSection2 === true && relatorioSectionNumber(block.block_type) === 2 ? { ...block, config: { ...(block.config as object), section_text: OWN_SECTION_2 } } : block));
  return { ...base, blocks, relatorio: { ...base.relatorio, setup: { ...base.relatorio.setup, additional_items: [...ITEMS] } } };
}

async function docxOf(version: 'v17' | 'v18', variant: Variant = {}): Promise<Buffer> {
  const layout = layoutSpec(relatorio(version, variant), { revisionNumber: 1, issuedAt: ISSUED_AT });
  return buildDocx(layout, { tocPages: placeholderPages(layout) });
}

const plain = (text: string) => text.replace(NBSP, ' ');
const paragraphsOf = async (version: 'v17' | 'v18', variant: Variant = {}) => extractStructure(await docxOf(version, variant)).paragraphs.map(plain);
const EARTH = 'Resistência Ôhmica de Aterramento:';

describe('28.9-INT-001 and 28.10-INT-001 the v18 DOCX', () => {
  it('v18 with a Malha: the two items close section 10\'s topics before the validity line; section 1 "de"; section 2 the paragraph after the insulation one', async () => {
    const paragraphs = await paragraphsOf('v18');
    const validity = paragraphs.findIndex((text) => text.startsWith('Este relatório tem validade'));
    expect(validity).toBeGreaterThan(-1);
    expect(paragraphs.slice(validity - 2, validity)).toEqual(ITEMS);
    expect(paragraphs.filter((text) => ITEMS.includes(text))).toHaveLength(2);
    expect(paragraphs.some((text) => /Transformação de \S.*, unidade /u.test(text))).toBe(true);
    expect(paragraphs.some((text) => text.includes('Transformação da '))).toBe(false);
    const earth = paragraphs.indexOf(EARTH_RESISTANCE_PARAGRAPH);
    expect(earth).toBeGreaterThan(-1);
    expect(paragraphs[earth - 1]!.startsWith('Resistência de Isolação:')).toBe(true);
    expect(paragraphs[earth + 1]!.startsWith('Obs:')).toBe(true);
    expect(EARTH_RESISTANCE_PARAGRAPH).toContain('NBR 15749 e NBR 15751');
  }, 120_000);

  it('v18 without a Malha: section 2 has no paragraph on earth resistance; the items still print', async () => {
    const paragraphs = await paragraphsOf('v18', { malha: false });
    expect(paragraphs.some((text) => text.startsWith(EARTH))).toBe(false);
    expect(paragraphs.filter((text) => ITEMS.includes(text))).toHaveLength(2);
  }, 120_000);

  it('v18 with its own section 2 text and a Malha: that text only', async () => {
    const paragraphs = await paragraphsOf('v18', { ownSection2: true });
    expect(paragraphs).toContain(OWN_SECTION_2);
    expect(paragraphs.some((text) => text.startsWith(EARTH))).toBe(false);
    expect(paragraphs.some((text) => text.startsWith('Resistência de Isolação:'))).toBe(false);
  }, 120_000);

  it('v17: no item, section 1 "da", no paragraph on earth resistance', async () => {
    const paragraphs = await paragraphsOf('v17');
    expect(paragraphs.some((text) => ITEMS.includes(text))).toBe(false);
    expect(paragraphs.some((text) => /Transformação da \S.*, unidade /u.test(text))).toBe(true);
    expect(paragraphs.some((text) => text.startsWith(EARTH))).toBe(false);
  }, 120_000);
});

async function pdfText(pdf: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const parts: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) if ('str' in item) parts.push(item.str);
    }
    return parts.join(' ').replace(/\s+/gu, ' ');
  } finally {
    await task.destroy();
  }
}

describe.skipIf(!sofficeOnPath)('28.9-INT-001 and 28.10-INT-001 the v18 PDF', () => {
  it('reads the two items, the "de" of section 1 and the paragraph citing NBR 15749 and NBR 15751', async () => {
    const text = await pdfText(await convertToPdf(await docxOf('v18'), { jobId: `e28c-v18-print-${Date.now()}` }));
    expect(text).toContain('com as duas chaves fechadas.');
    expect(text).toContain('que não foi revisado nesta manutenção.');
    expect(text).toContain('Transformação de ');
    expect(text).toContain('NBR 15749 e NBR 15751');
  }, 240_000);
});
