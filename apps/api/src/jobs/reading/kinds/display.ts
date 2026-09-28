import { buildDisplaySuggestions, displayReadingTargetSchema, getDefinition, isDisplayCellTarget, locationRowSchema, type BlockRow, type LocationRow } from '@app/domain';
import { PermanentReadingError } from '../providers/errors.ts';
import { entityRecord, readOcr, targetBlock } from './shared.ts';
import type { ReadingKindHandler } from './types.ts';

/*
 * Story 9.1 (FR-36/37): an instrument display, "Ler visor". The target is a Measurement table
 * of a live block of the photo's relatório (`{block_id, block_type, table_key, start_cell}`,
 * `table_key` the seed test key) or a live cabine of it (`{location_id}`, the
 * thermo-hygrometer). The image goes through the display OCR (`POST /read/display` under
 * `ocr-svc`); no model runs: the kernel reads the values and places them
 * (`buildDisplaySuggestions`).
 */

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

export const displayHandler: ReadingKindHandler = {
  kind: 'display',
  // The committed synthetic displays (`services/ocr/tests/fixtures/displays.md`), most specific first.
  fakeDefaults: [
    // The transformer's insulation tester showing its stored 30 s / 1 min / 10 min.
    { block_type: 'transformador_forca', table_key: 'isolacao', sha256: '69f24caf149e40256ada9a73ac36ed1729f101a24f9216ebeaed1c1d9d07b83f' },
    // An insulation tester that prints its unit, 147 GΩ.
    { table_key: 'isolacao', sha256: 'a3a4e07dab0416ebb66adb045af94cd1ce7626d8eb990d8dcecfa8e47521e9b8' },
    // The micro-ohmmeter's character LCD, 87 µΩ.
    { table_key: 'resistencia_contato', sha256: '039d31eda2f7040dbba258385f395a5ccb53ae9e8a8dbe19770e1ef8a90c6c71' },
    // The ratio meter's character LCD, 34.512.
    { table_key: 'relacao_transformacao', sha256: '084be7868dbd3b05cc7eda4f7797b36ab7f2e0347b624b564a2a6e0afdeccb7d' },
    // The thermo-hygrometer, 23.4 °C and 58 %.
    { table_key: 'env', sha256: '8ab01170c26a7474e8b8c8bbed7713074b8182d1364b21145867eed03a8a1c16' },
    // Anything else: the seven-segment tester with no unit, 3.42.
    { sha256: '0cf24e91c3d6ddc4fd31dcfb7f133a46822344781c221ebfaffcf04b47f815ad' },
  ],

  async prepare({ db, companyId, relatorioId, photo }) {
    const parsed = displayReadingTargetSchema.safeParse(photo.reading_target);
    if (!parsed.success) throw new PermanentReadingError('the photo has no display reading target');
    const target = parsed.data;

    let block: BlockRow | null = null;
    let location: Cabine | null = null;
    let fixture: { block_type: string | null; table_key: string | null };
    if (isDisplayCellTarget(target)) {
      block = await targetBlock(db, companyId, relatorioId, target);
      let tests;
      try {
        tests = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests;
      } catch (error) {
        throw new PermanentReadingError('the target block has no definition', { cause: error });
      }
      if (!tests.some((test) => test.key === target.table_key)) throw new PermanentReadingError('the target test is not on the block');
      fixture = { block_type: block.block_type, table_key: target.table_key };
    } else {
      const record = await entityRecord(db, companyId, 'location', target.location_id);
      const row = record === null ? null : locationRowSchema.safeParse(record.row);
      if (record === null || row === null || !row.success || row.data.kind !== 'cabine') throw new PermanentReadingError('the target cabine does not exist');
      if (record.removed_at !== null || row.data.removed_at !== null) throw new PermanentReadingError('the target cabine was removed');
      if (row.data.relatorio_id !== relatorioId) throw new PermanentReadingError('the target cabine is not the photo relatorio cabine it names');
      location = row.data;
      fixture = { block_type: null, table_key: 'env' };
    }

    return {
      fixture,
      async run({ providers, image, runId, newId }) {
        const ocr = await readOcr(providers, image, { mode: 'display' });
        const built = buildDisplaySuggestions({ relatorioId, photoId: photo.id, runId, target, block, location, ocr, image, newId });
        return { ocr, structuring: null, rows: built.rows, dropped: built.dropped };
      },
    };
  },
};
