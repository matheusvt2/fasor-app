import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { buildSnapshot, layoutSpec, replay } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { convertToPdf } from './libreoffice.ts';
import { placeholderPages } from './toc.ts';

/*
 * Batch e27d (X7 of the wave 3 review): the cover's "Informações adicionais" typed on three lines (a text area since
 * Story 27.12) prints as three lines in the PDF LibreOffice makes, each its own line on the cover page, in order.
 * `docx-line-breaks.test.ts` pins the DOCX; this reads the PDF.
 *
 * It needs LibreOffice, which the api image carries and the tools image does not: run it in the api container,
 *   podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/cover-line-breaks.integration.test.ts
 * Where no `soffice` is on the PATH (the tools container's `pnpm test:api`) it is skipped.
 */

const sofficeOnPath = (process.env.PATH ?? '').split(delimiter).some((dir) => {
  try {
    accessSync(join(dir, 'soffice'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

// pdfjs falls back to an in-process "fake worker" in Node, loaded from this path (as `pdf-outline.ts`).
GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const LINES = ['Manutenção preventiva da cabine primária', 'Ensaios elétricos nos transformadores', 'Termografia dos painéis'];

/** The first page's non-blank text items, trimmed, with their distance from the page's bottom edge. */
async function firstPageItems(pdf: Buffer): Promise<{ str: string; y: number }[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const content = await (await doc.getPage(1)).getTextContent();
    return content.items.flatMap((item) => ('str' in item && item.str.trim() !== '' ? [{ str: item.str.trim(), y: item.transform[5] as number }] : []));
  } finally {
    await task.destroy();
  }
}

describe.skipIf(!sofficeOnPath)('e27d-INT X7 the cover\'s "Informações adicionais" on the PDF', () => {
  it('three lines typed print as three lines of the cover page, top to bottom', async () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const withInfo = { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, additional_info: LINES.join('\n') } } };
    const layout = layoutSpec(withInfo, { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
    const docx = await buildDocx(layout, { tocPages: placeholderPages(layout) });
    const pdf = await convertToPdf(docx, { jobId: `cover-line-breaks-${Date.now()}` });
    const items = await firstPageItems(pdf);
    const found = LINES.map((line) => items.find((item) => item.str === line));
    expect(found.every((item) => item !== undefined), JSON.stringify(items.filter((item) => /Manuten|Ensaios|Termografia/.test(item.str)))).toBe(true);
    const ys = found.map((item) => item!.y);
    // pdfjs measures from the bottom edge: each line lower on the page than the one before.
    expect(ys[0]!).toBeGreaterThan(ys[1]!);
    expect(ys[1]!).toBeGreaterThan(ys[2]!);
  }, 120_000);
});
