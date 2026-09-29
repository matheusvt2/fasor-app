import type { OcrProvider, ProseProvider, StructuringProvider } from '@app/domain';
import type { Config } from '../../../config.ts';
import type { ReadingKind } from '../payload.ts';
import { DEFAULT_FIXTURES_DIR, fakeOcrProvider, fakeProseProvider, fakeStructuringProvider } from './fake.ts';
import { ocrSvcProvider } from './ocr-svc.ts';
import { unimplementedOcrProvider, unimplementedProseProvider, unimplementedStructuringProvider } from './unimplemented.ts';

export * from './errors.ts';

/*
 * Story 8.4 (AD-27): the reading providers chosen by env. Both default to `fake` and compose
 * keeps `fake`; `ocr-svc` calls the local sidecar; `textract`, `anthropic` and `bedrock` are
 * the Epic 11 slots, present and failing permanently. The backend never uses a personal
 * Claude subscription and no provider here reads a cloud credential.
 */

export interface ReadingProviders {
  ocr: OcrProvider;
  structuring: StructuringProvider;
  /** Stories 9.3 and 9.5: the prose step (vision caption, NC draft), chosen by `LLM_PROVIDER`; no OCR call. */
  prose: ProseProvider;
  /** The `reading_runs.ocr_provider` of the attempt. */
  ocr_name: string;
}

/** What one attempt's providers are chosen by. */
export interface ReadingProvidersContext {
  photo_sha256: string;
  /** Story 9.1: the photo's reading kind, its target block type and table (`env` for a cabine). */
  reading_kind: ReadingKind;
  block_type: string | null;
  table_key: string | null;
}

/**
 * The providers of one attempt; the fakes key their fixture by the photo's sha256, else by
 * `(reading_kind, block_type, table_key)` (E78-Q2, Story 9.1: the kind's default fixture).
 */
export type ReadingProvidersFactory = (ctx: ReadingProvidersContext) => ReadingProviders;

export interface ReadingProviderOptions {
  /** The fake fixtures directory; defaults to the committed `fixtures/`. */
  fixturesDir?: string;
  /** The `ocr-svc` timeout in ms; defaults to 60 s. */
  ocrTimeoutMs?: number;
}

export function createReadingProviders(
  config: Pick<Config, 'OCR_PROVIDER' | 'LLM_PROVIDER' | 'OCR_SERVICE_URL'>,
  options: ReadingProviderOptions = {},
): ReadingProvidersFactory {
  const fixturesDir = options.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  return ({ photo_sha256, reading_kind, block_type, table_key }) => {
    const fixtureKey = { reading_kind, block_type, table_key };
    const ocr = (() => {
      switch (config.OCR_PROVIDER) {
        case 'fake':
          return fakeOcrProvider(fixturesDir, photo_sha256, fixtureKey);
        case 'ocr-svc':
          return ocrSvcProvider(config.OCR_SERVICE_URL, options.ocrTimeoutMs === undefined ? {} : { timeoutMs: options.ocrTimeoutMs });
        case 'textract':
          return unimplementedOcrProvider('textract');
      }
    })();
    const structuring = (() => {
      switch (config.LLM_PROVIDER) {
        case 'fake':
          return fakeStructuringProvider(fixturesDir, photo_sha256, fixtureKey);
        case 'anthropic':
        case 'bedrock':
          return unimplementedStructuringProvider(config.LLM_PROVIDER);
      }
    })();
    const prose = (() => {
      switch (config.LLM_PROVIDER) {
        case 'fake':
          return fakeProseProvider(fixturesDir, photo_sha256, fixtureKey);
        case 'anthropic':
        case 'bedrock':
          return unimplementedProseProvider(config.LLM_PROVIDER);
      }
    })();
    return { ocr, structuring, prose, ocr_name: config.OCR_PROVIDER };
  };
}
