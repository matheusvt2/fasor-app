import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSnapshot, layoutSpec, replay } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { renderDocument } from '../apps/api/src/jobs/generate/job.ts';
import { readOutline } from '../apps/api/src/jobs/generate/pdf-outline.ts';

/*
 * Story 4.8: renders the document skeleton of the full Porto Seguro fixture through the
 * real pass loop (docx -> LibreOffice -> outline -> docx) without a database or a queue,
 * and writes `porto-seguro-skeleton-rev1.docx` (plus its PDF) to the directory given.
 * LibreOffice lives in the api image only, so it runs there:
 *
 *   docker compose exec api pnpm exec tsx scripts/render-skeleton.ts <out dir>
 *
 * This is how the DOCX for Bruno's read (Task 17 of the spec) is produced.
 */

const outDir = process.argv[2];
if (outDir === undefined) {
  console.error('usage: tsx scripts/render-skeleton.ts <out dir>');
  process.exit(2);
}

const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: new Date().toISOString() });
const started = Date.now();
const rendered = await renderDocument(layout, {}, { jobId: 'render-skeleton' });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'porto-seguro-skeleton-rev1.docx'), rendered.docx);
writeFileSync(join(outDir, 'porto-seguro-skeleton-rev1.pdf'), rendered.pdf);
const outline = await readOutline(rendered.pdf);
console.log(
  JSON.stringify({
    duration_ms: Date.now() - started,
    pages: rendered.pages,
    toc_passes: rendered.tocPasses,
    toc_converged: rendered.tocConverged,
    outline: outline.headings,
  }),
);
