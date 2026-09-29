import { buildProseSuggestion, captionSkipReason, fileFieldPath } from '@app/domain';
import type { ReadingKindHandler } from './types.ts';

/*
 * Story 9.3 (FR-39, NFR-11): a vision caption for a photo with no context. The device queues
 * `caption` on a photo created with no sheet, no caption and no "Pessoas na foto" mark; the
 * mark, a typed caption or a chosen equipment may land before the job runs, so the handler
 * re-checks them (Conflict 7) and skips the reading, never sending a marked photo. Otherwise
 * the whole image goes to the prose step (no OCR call), and its one sentence, if any, becomes
 * one `suggested` fill on `file/{id}/caption` (Conflict 8).
 */

export const captionHandler: ReadingKindHandler = {
  kind: 'caption',
  // `fixtures/images/caption-default.png`: "Vista geral da cabine primária".
  fakeDefaults: [{ sha256: '1c9e7aafc2603b61d76e54c08f36183ff2ebdcf14bd58621bdb12483244139e8' }],

  async prepare({ relatorioId, photo }) {
    const fixture = { block_type: null, table_key: null };
    const skip = captionSkipReason(photo);
    return {
      fixture,
      ...(skip === null ? {} : { skip }),
      async run({ providers, image, runId, newId }) {
        const prose = await providers.prose.describe({ image: { bytes: image.bytes, mime: image.mime }, kind: 'caption', context: { block_type: null, item_label: null } });
        const built = buildProseSuggestion({
          relatorioId,
          photoId: photo.id,
          runId,
          targetPath: fileFieldPath(photo.id, 'caption'),
          output: prose.output,
          promptVersion: prose.prompt_version,
          newId,
        });
        return { ocr: null, structuring: null, model: { model: prose.model, prompt_version: prose.prompt_version, usage: prose.usage }, rows: built.rows, dropped: built.dropped };
      },
    };
  },
};
