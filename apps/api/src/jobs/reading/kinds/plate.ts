import { buildReadingSuggestions, getDefinition, plateReadingTargetSchema, registryRowSchema, type WordRow } from '@app/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.ts';
import type { CompanyId } from '../../../db/repositories/company-id.ts';
import { entities } from '../../../db/schema.ts';
import { PermanentReadingError } from '../providers/errors.ts';
import { readOcr, targetBlock } from './shared.ts';
import type { ReadingKindHandler } from './types.ts';

/*
 * Stories 8.4 and 8.5, moved unchanged behind the Story 9.1 handler contract: a nameplate
 * photo. The target block's nameplate `FieldDef`s and the company's live registries are read,
 * the image goes through the text OCR and the structuring step, and the kernel turns the
 * values into pending suggestions (`buildReadingSuggestions`: digit coverage, registries,
 * boxes, mode).
 */

async function liveRegistry(db: Db, companyId: CompanyId): Promise<{ manufacturers: WordRow[]; voltageClasses: WordRow[] }> {
  const records = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), isNull(entities.removed_at)));
  const manufacturers: WordRow[] = [];
  const voltageClasses: WordRow[] = [];
  for (const record of records) {
    const parsed = registryRowSchema.safeParse(record.row);
    if (!parsed.success || parsed.data.removed_at !== null) continue;
    if (parsed.data.kind === 'manufacturer') manufacturers.push(parsed.data);
    else if (parsed.data.kind === 'voltage_class') voltageClasses.push(parsed.data);
  }
  return { manufacturers, voltageClasses };
}

export const plateHandler: ReadingKindHandler = {
  kind: 'plate',
  // E78-Q2: the synthetic transformer plate (`services/ocr/tests/fixtures/plate-transformador.jpg`).
  fakeDefaults: [{ block_type: 'transformador_forca', sha256: 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac' }],

  async prepare({ db, companyId, relatorioId, photo }) {
    const target = plateReadingTargetSchema.safeParse(photo.reading_target);
    if (!target.success) throw new PermanentReadingError('the photo has no plate reading target');
    const block = await targetBlock(db, companyId, relatorioId, target.data);
    let fields;
    try {
      fields = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).nameplate;
    } catch (error) {
      throw new PermanentReadingError('the target block has no nameplate definition', { cause: error });
    }
    const registry = await liveRegistry(db, companyId);

    return {
      fixture: { block_type: block.block_type, table_key: null },
      async run({ providers, image, runId, newId }) {
        const ocr = await readOcr(providers, image, { mode: 'text' });
        const structuring = await providers.structuring.structure({ image: { bytes: image.bytes, mime: image.mime }, ocr, fields: [...fields] });
        const built = buildReadingSuggestions({
          relatorioId,
          photoId: photo.id,
          runId,
          block,
          ocr,
          image,
          output: structuring.output,
          promptVersion: structuring.prompt_version,
          registry,
          newId,
        });
        return { ocr, structuring, rows: built.rows, dropped: built.dropped };
      },
    };
  },
};
