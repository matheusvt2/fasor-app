import { blockRowSchema, type BlockRow, type OcrReadOptions, type OcrReadResult } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.ts';
import type { CompanyId } from '../../../db/repositories/company-id.ts';
import { entities } from '../../../db/schema.ts';
import type { Tx } from '../../../sync/apply.ts';
import type { ReadingImage } from '../image.ts';
import { PermanentReadingError, ProviderError } from '../providers/errors.ts';
import type { ReadingProviders } from '../providers/index.ts';

/*
 * Story 9.1: what the job and every reading kind read the same way. Every lookup is scoped by
 * the payload's company (AD-10).
 */

export interface EntityRecord {
  row: unknown;
  relatorio_id: string | null;
  removed_at: string | null;
}

export async function entityRecord(db: Db | Tx, companyId: CompanyId, entity: string, id: string): Promise<EntityRecord | null> {
  const [record] = await db
    .select({ row: entities.row, relatorio_id: entities.relatorio_id, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)))
    .limit(1);
  return record ?? null;
}

/**
 * The live block a photo's target names, of the photo's own relatório and of the type the
 * target says; anything else is a permanent failure (Story 8.4's guards, shared by every kind).
 */
export async function targetBlock(db: Db, companyId: CompanyId, relatorioId: string, target: { block_id: string; block_type: string }): Promise<BlockRow> {
  const blockRecord = await entityRecord(db, companyId, 'block', target.block_id);
  const blockParsed = blockRecord === null ? null : blockRowSchema.safeParse(blockRecord.row);
  if (blockRecord === null || blockParsed === null || !blockParsed.success) throw new PermanentReadingError('the target block does not exist');
  const block: BlockRow = blockParsed.data;
  if (blockRecord.removed_at !== null) throw new PermanentReadingError('the target block was removed');
  if (block.relatorio_id !== relatorioId || block.block_type !== target.block_type) {
    throw new PermanentReadingError('the target block is not the photo relatorio block it names');
  }
  return block;
}

/**
 * One OCR read of the job's image. A read of another size than the image sent is transient
 * (the boxes would not be the image's), as it always was.
 */
export async function readOcr(providers: ReadingProviders, image: ReadingImage, options: OcrReadOptions): Promise<OcrReadResult> {
  const ocr = await providers.ocr.read({ bytes: image.bytes, mime: image.mime }, options);
  if (ocr.image.width !== image.width || ocr.image.height !== image.height) {
    throw new ProviderError(`the OCR read a ${ocr.image.width}x${ocr.image.height} image, the job sent ${image.width}x${image.height}`);
  }
  return ocr;
}
