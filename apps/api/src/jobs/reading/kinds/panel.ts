import { buildPanelSuggestion, locationRowSchema, PANEL_FIELDS, panelFields, panelReadingTargetSchema, relatorioRowSchema } from '@app/domain';
import { PermanentReadingError } from '../providers/errors.ts';
import { entityRecord, readOcr } from './shared.ts';
import type { ReadingKindHandler } from './types.ts';

/*
 * Story 9.2 (FR-38): "Fotografar equipamento", a photo of a panel front taken from the field
 * Block palette. The target is the live cabine or coluna of the photo's relatório the palette
 * was opened on (`{location_id}`); the image goes through the text OCR and the structuring
 * step with the panel's own two fields (the type and the column label), and the kernel turns
 * them into at most one pending suggestion on the photo's `block_id` (`buildPanelSuggestion`).
 * Nothing is created: the device composes the block on a tap.
 *
 * Story 14.5: the types offered to the structuring step are the ones the photo's relatório
 * can hold (`panelFields` of its seed version: the eight up to v4, the library type too on
 * v5), so a model is never asked for a type the palette of that relatório does not list. A
 * relatório row that does not parse keeps `PANEL_FIELDS`, the eight every version ships.
 */

export const panelHandler: ReadingKindHandler = {
  kind: 'panel',
  // The synthetic panel front (`fixtures/images/panel-seccionadora.png`): SECCIONADORA, C09.
  fakeDefaults: [{ sha256: '36f3fca92f329117f736195e6bcdcae60ba683a82a7d3dcd0aff154b158d3d51' }],

  async prepare({ db, companyId, relatorioId, photo }) {
    const target = panelReadingTargetSchema.safeParse(photo.reading_target);
    if (!target.success) throw new PermanentReadingError('the photo has no panel reading target');
    const record = await entityRecord(db, companyId, 'location', target.data.location_id);
    const row = record === null ? null : locationRowSchema.safeParse(record.row);
    if (record === null || row === null || !row.success) throw new PermanentReadingError('the target location does not exist');
    if (record.removed_at !== null || row.data.removed_at !== null) throw new PermanentReadingError('the target location was removed');
    if (row.data.relatorio_id !== relatorioId) throw new PermanentReadingError('the target location is not of the photo relatorio');
    // The job already refused a missing or removed relatório; this read is for its seed version only.
    const relatorio = await entityRecord(db, companyId, 'relatorio', relatorioId);
    const relatorioRow = relatorio === null ? null : relatorioRowSchema.safeParse(relatorio.row);
    const fields = relatorioRow !== null && relatorioRow.success ? panelFields(relatorioRow.data.seed_version) : PANEL_FIELDS;

    return {
      fixture: { block_type: null, table_key: null },
      async run({ providers, image, runId, newId }) {
        const ocr = await readOcr(providers, image, { mode: 'text' });
        const structuring = await providers.structuring.structure({ image: { bytes: image.bytes, mime: image.mime }, ocr, fields: [...fields] });
        const built = buildPanelSuggestion({ relatorioId, photoId: photo.id, runId, ocr, image, output: structuring.output, promptVersion: structuring.prompt_version, newId });
        return { ocr, structuring, rows: built.rows, dropped: built.dropped };
      },
    };
  },
};
