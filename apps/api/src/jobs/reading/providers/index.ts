import type { OcrProvider, ProseProvider, StructuringProvider } from '@app/domain';
import { DEFAULT_BEDROCK_ESCALATION_MODEL_ID, DEFAULT_BEDROCK_MODEL_ID, DEFAULT_BEDROCK_PANEL_MODEL_ID, type Config } from '../../../config.ts';
import type { ReadingKind } from '../payload.ts';
import { DEFAULT_FIXTURES_DIR, fakeOcrProvider, fakeProseProvider, fakeStructuringProvider } from './fake.ts';
import { BEDROCK_DEFAULT_REGION, bedrockClientSource, type BedrockClientSource, type BedrockLike } from '../../../ai/bedrock.ts';
import { bedrockProseProvider, bedrockStructuringProvider } from './bedrock.ts';
import { ocrSvcProvider } from './ocr-svc.ts';
import { TEXTRACT_DEFAULT_REGION, textractProvider, type TextractLike } from './textract.ts';
import { aiFeaturesOffProseProvider, aiFeaturesOffStructuringProvider } from './unimplemented.ts';

export * from './errors.ts';

/*
 * Story 8.4 (AD-27): the reading providers chosen by env. Both default to `fake` and compose
 * keeps `fake`; `ocr-svc` calls the local sidecar. The backend never uses a personal Claude
 * subscription and no provider here reads a cloud credential: the cloud ones get theirs from
 * the AWS SDK default chain.
 *
 * Story 11.7 (11.7-ROUTING): `OCR_PROVIDER=textract` routes by reading kind. A display
 * reading (seven-segment digits) goes to the `ocr-svc` sidecar; the text kinds (`plate`,
 * `panel`) go to Amazon Textract through one client per process, built on the first
 * Textract read with the SDK's default credential chain. `ocr_name` names the provider used.
 *
 * Story 11.6: `LLM_PROVIDER=bedrock` structures (plate, panel) on `BEDROCK_MODEL_ID` and writes
 * prose (caption, NC draft) on `BEDROCK_PROSE_MODEL_ID` through Bedrock Converse, every model
 * sharing one client per process built on the first call. A non-empty
 * `BEDROCK_ESCALATION_MODEL_ID` other than `BEDROCK_MODEL_ID` adds the `escalation` structuring
 * provider the plate kind reads a mostly-`verify` or empty reading again on (`shouldEscalate`).
 * `AI_FEATURES=off` still comes first: no Bedrock provider is built at all.
 */

export interface ReadingProviders {
  ocr: OcrProvider;
  structuring: StructuringProvider;
  /** Stories 9.3 and 9.5: the prose step (vision caption, NC draft), chosen by `LLM_PROVIDER`; no OCR call. */
  prose: ProseProvider;
  /** The `reading_runs.ocr_provider` of the attempt. */
  ocr_name: string;
  /**
   * Story 11.6: the larger model a plate reading that is more than half `verify` is structured
   * again on; absent when the provider has none (`fake`, `AI_FEATURES=off`, an empty
   * `BEDROCK_ESCALATION_MODEL_ID` or one equal to `BEDROCK_MODEL_ID`). Panel, caption and NC
   * draft never use it.
   */
  escalation?: StructuringProvider;
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
  /**
   * Story 11.7: an injected Textract client (tests; nothing then reaches AWS), the call timeout
   * in ms, and how the client is built from the region (tests spy on it).
   */
  textract?: { client?: TextractLike; timeoutMs?: number; createClient?: (region: string) => TextractLike };
  /**
   * Story 11.6: an injected Bedrock Runtime client (tests; nothing then reaches AWS), the
   * Converse timeout in ms, and how the client is built from the region (tests spy on it).
   * `source` (review 2026-10-08, API-3) is a client source built once by the caller and shared
   * with the emission audit (`main.ts`), used as is in place of a new one.
   */
  bedrock?: { client?: BedrockLike; timeoutMs?: number; createClient?: (region: string) => BedrockLike; source?: BedrockClientSource };
}

export function createReadingProviders(
  config: Pick<Config, 'OCR_PROVIDER' | 'LLM_PROVIDER' | 'OCR_SERVICE_URL'> &
    Partial<Pick<Config, 'TEXTRACT_REGION' | 'AI_FEATURES' | 'BEDROCK_REGION' | 'BEDROCK_MODEL_ID' | 'BEDROCK_PANEL_MODEL_ID' | 'BEDROCK_PROSE_MODEL_ID' | 'BEDROCK_ESCALATION_MODEL_ID'>>,
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
          ...(options.textract?.createClient === undefined ? {} : { createClient: options.textract.createClient }),
        })
      : null;
  // Story 11.6: one Bedrock client per factory, its providers built once (an unpriced model fails
  // here, at boot). With AI features off no LLM call can happen, so nothing is built or checked.
  const aiOff = config.AI_FEATURES === 'off';
  const bedrock = (() => {
    if (config.LLM_PROVIDER !== 'bedrock' || aiOff) return null;
    const source =
      options.bedrock?.source ??
      bedrockClientSource({
        region: config.BEDROCK_REGION ?? BEDROCK_DEFAULT_REGION,
        ...(options.bedrock?.client === undefined ? {} : { client: options.bedrock.client }),
        ...(options.bedrock?.createClient === undefined ? {} : { createClient: options.bedrock.createClient }),
      });
    const timeout = options.bedrock?.timeoutMs === undefined ? {} : { timeoutMs: options.bedrock.timeoutMs };
    const modelId = config.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL_ID;
    const escalationModel = config.BEDROCK_ESCALATION_MODEL_ID ?? DEFAULT_BEDROCK_ESCALATION_MODEL_ID;
    const panelModel = config.BEDROCK_PANEL_MODEL_ID ?? DEFAULT_BEDROCK_PANEL_MODEL_ID;
    const structuring = bedrockStructuringProvider({ source, modelId, ...timeout });
    return {
      structuring,
      // Panel fronts read on their own model (Matheus, 2026-10-06); the same one as plates when named so.
      panel: panelModel === modelId ? structuring : bedrockStructuringProvider({ source, modelId: panelModel, ...timeout }),
      prose: bedrockProseProvider({ source, modelId: config.BEDROCK_PROSE_MODEL_ID ?? modelId, ...timeout }),
      // No escalation when it is off (empty) or names the structuring model (the same call twice).
      escalation: escalationModel === '' || escalationModel === modelId ? null : bedrockStructuringProvider({ source, modelId: escalationModel, ...timeout }),
    };
  })();
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
    // Story 11.8 follow-up: with AI_FEATURES=off no LLM step runs, whatever LLM_PROVIDER says
    // (a job queued before the flag flipped fails permanently without calling `fake`).
    const structuring = (() => {
      if (aiOff) return aiFeaturesOffStructuringProvider();
      switch (config.LLM_PROVIDER) {
        case 'fake':
          return fakeStructuringProvider(fixturesDir, photo_sha256, fixtureKey);
        case 'bedrock':
          return reading_kind === 'panel' ? bedrock!.panel : bedrock!.structuring;
      }
    })();
    const prose = (() => {
      if (aiOff) return aiFeaturesOffProseProvider();
      switch (config.LLM_PROVIDER) {
        case 'fake':
          return fakeProseProvider(fixturesDir, photo_sha256, fixtureKey);
        case 'bedrock':
          return bedrock!.prose;
      }
    })();
    const escalation = bedrock?.escalation ?? null;
    return { ocr, structuring, prose, ocr_name, ...(escalation === null ? {} : { escalation }) };
  };
}
