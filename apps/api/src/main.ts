import { serve } from '@hono/node-server';
import { createAuth } from './auth/auth.ts';
import { parseTrustedOrigins } from './auth/trusted-origins.ts';
import { loadConfigOrExit, rateLimitEnabled, requestLimits } from './config.ts';
import { createDb } from './db/client.ts';
import { migrate } from './db/migrate.ts';
import { createApp } from './http/app.ts';
import { now } from './clock.ts';
import { newId } from './ids.ts';
import { probeLibreOffice } from './jobs/generate/libreoffice.ts';
import { registerGenerateWorker } from './jobs/generate/worker.ts';
import { createReadingProviders } from './jobs/reading/providers/index.ts';
import { registerReadingWorker } from './jobs/reading/worker.ts';
import { startQueue } from './jobs/queue.ts';
import { log, logError } from './log.ts';
import { createS3, prepareStorage, probeStorage } from './storage/s3.ts';

const config = loadConfigOrExit();

const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 30) throw error;
      logError(`${label} not ready, retrying`, { attempt });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// Forward-only migrations run first, so `docker compose up` stays one command and
// nothing below (queue, auth) sees a database without its tables.
await withRetry('database', () => migrate(db));
log('migrations applied');
// Story 11.8: ensure the bucket against a local endpoint, only probe it on AWS.
await withRetry('storage', () => prepareStorage(config, s3));
const boss = await withRetry('queue', () => startQueue(config.DATABASE_URL));

// AD-15: the generate worker runs in this process (`WORKER=1`, the compose default). The
// TC-3 fault flag is honoured only outside production.
if (config.WORKER === '1') {
  await registerGenerateWorker(boss, {
    db,
    s3,
    bucket: config.S3_BUCKET,
    now,
    newId,
    fault: config.NODE_ENV === 'production' ? undefined : config.GENERATE_FAULT,
  });
  log('generate worker registered', { fault: config.NODE_ENV === 'production' ? null : (config.GENERATE_FAULT ?? null) });
  // Story 8.4: the plate reading worker, on the providers the env names (both `fake` by default);
  // Story 11.7: `OCR_PROVIDER=textract` reads through TEXTRACT_REGION. Story 11.6:
  // `LLM_PROVIDER=bedrock` structures and writes prose through Converse in BEDROCK_REGION.
  await registerReadingWorker(boss, {
    db,
    s3,
    bucket: config.S3_BUCKET,
    now,
    newId,
    providers: createReadingProviders(config),
    aiFeatures: config.AI_FEATURES === 'on',
  });
  log('reading worker registered', {
    ocr_provider: config.OCR_PROVIDER,
    llm_provider: config.LLM_PROVIDER,
    ai_features: config.AI_FEATURES,
    textract_region: config.TEXTRACT_REGION,
    ...(config.LLM_PROVIDER === 'bedrock'
      ? {
          bedrock_region: config.BEDROCK_REGION,
          bedrock_model_id: config.BEDROCK_MODEL_ID,
          bedrock_panel_model_id: config.BEDROCK_PANEL_MODEL_ID,
          bedrock_prose_model_id: config.BEDROCK_PROSE_MODEL_ID,
          bedrock_escalation_model_id: config.BEDROCK_ESCALATION_MODEL_ID || null,
        }
      : {}),
  });
}

const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const rateLimits = requestLimits(config);
const app = createApp({
  auth,
  db,
  s3,
  bucket: config.S3_BUCKET,
  boss,
  aiFeatures: config.AI_FEATURES === 'on',
  bodyLimitBytes: config.API_BODY_LIMIT_BYTES,
  ...(rateLimits === undefined ? {} : { rateLimits }),
  probes: {
    db: () => sql`select 1`,
    queue: () => boss.getQueues(),
    storage: () => probeStorage(s3, config.S3_BUCKET),
    libreoffice: probeLibreOffice,
  },
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log('api listening', { port: info.port, rate_limit: rateLimitEnabled(config) ? 'on' : 'off' });
});
