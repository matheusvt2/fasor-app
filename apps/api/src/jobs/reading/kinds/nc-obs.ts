import { buildProseSuggestion, getDefinition, ncObsReadingTargetSchema, ncObsSkipReason, sheetChecklistPath } from '@app/domain';
import { PermanentReadingError } from '../providers/errors.ts';
import { targetBlock } from './shared.ts';
import type { ReadingKindHandler } from './types.ts';

/*
 * Story 9.5 (FR-75): the one-sentence observation draft of an NC checklist row, read from the
 * photo taken on that row. The target (`{block_id, block_type, item_key}`) must name a live
 * block of the photo's relatório with that checklist item; anything else fails permanently.
 * The row may turn C/NA, be cleared or get its observation typed before the job runs, so the
 * handler re-checks it (Conflict 10) and skips the reading. Otherwise the whole image goes to
 * the prose step with the item's label, and the sentence, if any, becomes one `suggested` fill
 * on that row's observation: never on another item, never a verdict.
 */

export const ncObsHandler: ReadingKindHandler = {
  kind: 'nc_obs',
  // `fixtures/images/nc-obs-default.png`: "Oxidação aparente na estrutura do equipamento.".
  fakeDefaults: [{ sha256: '14f52bebef057c7290ef65ff6951b4c56447f1d7e9e94d3d35ac8d39f197a312' }],

  async prepare({ db, companyId, relatorioId, photo }) {
    const parsed = ncObsReadingTargetSchema.safeParse(photo.reading_target);
    if (!parsed.success) throw new PermanentReadingError('the photo has no nc_obs reading target');
    const target = parsed.data;
    const block = await targetBlock(db, companyId, relatorioId, target);
    let checklist;
    try {
      checklist = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).checklist;
    } catch (error) {
      throw new PermanentReadingError('the target block has no definition', { cause: error });
    }
    const item = checklist?.find((entry) => entry.key === target.item_key);
    if (item === undefined) throw new PermanentReadingError('the target checklist item is not on the block');

    const skip = ncObsSkipReason(block, target.item_key);
    return {
      fixture: { block_type: block.block_type, table_key: null },
      ...(skip === null ? {} : { skip }),
      async run({ providers, image, runId, newId }) {
        const prose = await providers.prose.describe({
          image: { bytes: image.bytes, mime: image.mime },
          kind: 'nc_obs',
          context: { block_type: block.block_type, item_label: item.label },
        });
        const built = buildProseSuggestion({
          relatorioId,
          photoId: photo.id,
          runId,
          targetPath: sheetChecklistPath(block.id, target.item_key, 'observation'),
          output: prose.output,
          promptVersion: prose.prompt_version,
          newId,
        });
        return { ocr: null, structuring: null, model: { model: prose.model, prompt_version: prose.prompt_version, usage: prose.usage }, rows: built.rows, dropped: built.dropped };
      },
    };
  },
};
