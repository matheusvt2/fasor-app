import {
  betterReading,
  buildReadingSuggestions,
  getDefinition,
  plateReadingTargetSchema,
  registryRowSchema,
  shouldEscalate,
  type StructuringResult,
  type WordRow,
} from '@app/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.ts';
import type { CompanyId } from '../../../db/repositories/company-id.ts';
import { entities } from '../../../db/schema.ts';
import { log } from '../../../log.ts';
import { PermanentReadingError } from '../providers/errors.ts';
import { readOcr, targetBlock } from './shared.ts';
import type { ReadingKindHandler } from './types.ts';

/*
 * Stories 8.4 and 8.5, moved unchanged behind the Story 9.1 handler contract: a nameplate
 * photo. The target block's nameplate `FieldDef`s and the company's live registries are read,
 * the image goes through the text OCR and the structuring step, and the kernel turns the
 * values into pending suggestions (`buildReadingSuggestions`: digit coverage, registries,
 * boxes, mode).
 *
 * Story 11.6: when the providers carry an escalation model and the first reading is more than
 * half `verify` or empty (`shouldEscalate`), the same image, OCR and fields are structured once more on
 * it and the better reading is kept (`betterReading`: more `suggested`, then more rows, then the escalation). The
 * run row then names the model of the kept reading with the usage of both calls summed. A first
 * reading with no suggestion escalates too, unless the OCR found no word; an escalation call
 * that fails keeps the first.
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
  // E78-Q2 and Story 13.7: one synthetic plate per block type with a nameplate (the cables
  // have none). The transformer's is `services/ocr/tests/fixtures/plate-transformador.jpg`; the
  // five others are `fixtures/images/plate-<type>.png`, made by `scripts/make-plate-fixtures.ts`.
  fakeDefaults: [
    { block_type: 'transformador_forca', sha256: 'a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac' },
    // images/plate-para-raio.png
    { block_type: 'para_raio', sha256: '966c9b5417118bef4071ac9ee92797b40f32d446282bbb7d722fad1d126b0bfa' },
    // images/plate-chave-seccionadora.png
    { block_type: 'chave_seccionadora', sha256: 'deaede23509986653767bb328c5b43f4d77542ebbb37ebb97696678e1f69f065' },
    // images/plate-disjuntor-mt.png
    { block_type: 'disjuntor_mt', sha256: 'b0b6f663b5b5f869c2876b0c40af4bf6a6706875d24286b0a1d9d9bd22ae0b35' },
    // images/plate-tp.png
    { block_type: 'tp', sha256: '008145d0ff9770712dacc52395bee359f34dcd5ec4c7cc4d4f9b416216e5b11b' },
    // images/plate-tc.png
    { block_type: 'tc', sha256: '0b5dce48ef09a2a08b164d75a69208fb645ba112302a1631cd299ef3d94618a5' },
  ],

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
        const input = { image: { bytes: image.bytes, mime: image.mime }, ocr, fields: [...fields] };
        const build = (structuring: StructuringResult) =>
          buildReadingSuggestions({
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
        const first = await providers.structuring.structure(input);
        const built = build(first);
        if (providers.escalation === undefined || !shouldEscalate(built.rows, ocr.tokens.length)) {
          return { ocr, structuring: first, rows: built.rows, dropped: built.dropped };
        }

        // A failed escalation (throttled, denied, an answer the schema refuses) keeps the first
        // reading with its own usage; it never fails an attempt the first call already read.
        let second: StructuringResult;
        try {
          second = await providers.escalation.structure(input);
        } catch (error) {
          log('reading escalation failed', { photo_id: photo.id, run_id: runId, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
          return { ocr, structuring: first, rows: built.rows, dropped: built.dropped };
        }
        const escalated = build(second);
        const keptSecond = betterReading(built.rows, escalated.rows) === escalated.rows;
        const kept = keptSecond ? { structuring: second, built: escalated } : { structuring: first, built };
        const usage = {
          input_tokens: first.usage.input_tokens + second.usage.input_tokens,
          output_tokens: first.usage.output_tokens + second.usage.output_tokens,
          usd: Math.round((first.usage.usd + second.usage.usd) * 1e6) / 1e6,
        };
        return { ocr, structuring: { ...kept.structuring, usage }, rows: kept.built.rows, dropped: kept.built.dropped };
      },
    };
  },
};
