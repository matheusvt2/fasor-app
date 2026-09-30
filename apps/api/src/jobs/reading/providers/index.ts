import type { OcrProvider, ProseProvider, StructuringProvider } from '@app/domain';
import type { Config } from '../../../config.ts';
import type { ReadingKind } from '../payload.ts';
import { DEFAULT_FIXTURES_DIR, fakeOcrProvider, fakeProseProvider, fakeStructuringProvider } from './fake.ts';
import { ocrSvcProvider } from './ocr-svc.ts';
import { TEXTRACT_DEFAULT_REGION, textractProvider, type TextractLike } from './textract.ts';
import { unimplementedProseProvider, unimplementedStructuringProvider } from './unimplemented.ts';

export * from './errors.ts';

/*
 * Story 8.4 (AD-27): the reading providers chosen by env. Both default to `fake` and compose
 * keeps `fake`; `ocr-svc` calls the local sidecar; `anthropic` and `bedrock` are the Epic 11
 * slots, present and failing permanently. The backend never uses a personal Claude
 * subscription and no provider here reads a cloud credential.
 *
 * Story 11.7 (11.7-ROUTING): `OCR_PROVIDER=textract` routes by reading kind. A display
 * reading (seven-segment digits) goes to the `ocr-svc` sidecar; the text kinds (`plate`,
 * `panel`) go to Amazon Textract through one client per process, built on the first
 * Textract read with the SDK's default credential chain. `ocr_name` names the provider used.
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
  /** Story 11.7: an injected Textract client (tests; nothing then reaches AWS) and the call timeout in ms. */
  textract?: { client?: TextractLike; timeoutMs?: number };
}

export function createReadingProviders(
  config: Pick<Config, 'OCR_PROVIDER' | 'LLM_PROVIDER' | 'OCR_SERVICE_URL'> & Partial<Pick<Config, 'TEXTRACT_REGION'>>,
  options: ReadingProviderOptions = {},
): ReadingProvidersFactory {
  const fixturesDir = options.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  const ocrSvc = () => ocrSvcProvider(config.OCR_SERVICE_URL, options.ocrTimeoutMs === undefined ? {} : { timeoutMs: options.ocrTimeoutMs });
  // Story 11.7: one Textract provider per factory (one per process), its client built on its first read.
  const textract =
    config.OCR_PROVIDER === 'textract'
      ? textractProvider({
          region: config.TEXTRACT_REGION ?? TEXTRACT_DEFAULT_REGION,
          ...(options.textract?.client === undefined ? {} : { client: options.textract.client }),
          ...(options.textract?.timeoutMs === undefined ? {} : { timeoutMs: options.textract.timeoutMs }),
        })
      : null;
  return ({ photo_sha256, reading_kind, block_type, table_key }) => {
    const fixtureKey = { reading_kind, block_type, table_key };
    const { ocr, ocr_name } = ((): { ocr: OcrProvider; ocr_name: string } => {
      switch (config.OCR_PROVIDER) {
        case 'fake':
          return { ocr: fakeOcrProvider(fixturesDir, photo_sha256, fixtureKey), ocr_name: 'fake' };
        case 'ocr-svc':
          return { ocr: ocrSvc(), ocr_name: 'ocr-svc' };
        case 'textract':
          // Display digits stay on the sidecar; every text kind reads through Textract.
          return reading_kind === 'display' ? { ocr: ocrSvc(), ocr_name: 'ocr-svc' } : { ocr: textract!, ocr_name: 'textract' };
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
    return { ocr, structuring, prose, ocr_name };
  };
}
