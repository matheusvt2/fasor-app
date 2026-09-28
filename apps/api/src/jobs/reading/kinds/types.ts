import type { NewId, OcrReadResult, PhotoFileRow, StructuringResult, SuggestionRow } from '@app/domain';
import type { Db } from '../../../db/client.ts';
import type { CompanyId } from '../../../db/repositories/company-id.ts';
import type { ReadingImage } from '../image.ts';
import type { ReadingKind } from '../payload.ts';
import type { ReadingProviders } from '../providers/index.ts';

/*
 * Story 9.1 (batch D): the contract of one reading kind. `runReadingJob` (`../job.ts`) owns
 * everything every kind shares -- the photo and its relatório, the oriented `print` image, the
 * one all-or-nothing batch (discard the photo's previous pending suggestions, create the new
 * ones, `reading_status = done`), the `reading_runs` row and the `failed` path -- and hands
 * the rest to the handler of the payload's kind. A kind is one module under `kinds/` and one
 * line in `kinds/index.ts`. These names are the cross-batch contract (Stories 9.2, 9.3, 9.5).
 */

/** A default fixture the `fake` providers replay for a photo with none of its own (E78-Q2), most specific first. */
export interface FakeFixtureDefault {
  block_type?: string;
  table_key?: string;
  sha256: string;
}

/** What `prepare` reads: the company scope, the photo's relatório and the photo row. */
export interface ReadingKindContext {
  db: Db;
  companyId: CompanyId;
  relatorioId: string;
  photo: PhotoFileRow;
}

/** What `run` gets once the job has the image. */
export interface ReadingKindRunInput {
  providers: ReadingProviders;
  image: ReadingImage;
  runId: string;
  newId: NewId;
}

/** The OCR and structuring results (for the run row) and the rows the batch creates. */
export interface ReadingKindRunResult {
  ocr: OcrReadResult | null;
  structuring: StructuringResult | null;
  rows: SuggestionRow[];
  /** Every value that became no suggestion, with its reason; the job logs each. */
  dropped: { key: string; reason: string }[];
}

/** A target that parsed and exists: the `fake` fixture key and the reading itself. */
export interface PreparedReading {
  fixture: { block_type: string | null; table_key: string | null };
  run(input: ReadingKindRunInput): Promise<ReadingKindRunResult>;
}

/**
 * One reading kind. `prepare` throws `PermanentReadingError` for a target that does not parse
 * or names something gone; `run` may throw provider errors (transient or permanent).
 */
export interface ReadingKindHandler {
  kind: ReadingKind;
  fakeDefaults: readonly FakeFixtureDefault[];
  prepare(ctx: ReadingKindContext): Promise<PreparedReading>;
}
