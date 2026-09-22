import { serve } from '@hono/node-server';
import { createAuth } from './auth/auth.ts';
import { parseTrustedOrigins } from './auth/trusted-origins.ts';
import { loadConfigOrExit } from './config.ts';
import { createDb } from './db/client.ts';
import { migrate } from './db/migrate.ts';
import { createApp } from './http/app.ts';
import { probeLibreOffice } from './jobs/generate/libreoffice.ts';
import { startQueue } from './jobs/queue.ts';
import { log, logError } from './log.ts';
import { createS3, ensureBucket, probeStorage } from './storage/s3.ts';

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
await withRetry('storage', () => ensureBucket(s3, config.S3_BUCKET));
const boss = await withRetry('queue', () => startQueue(config.DATABASE_URL));

const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const app = createApp({
  auth,
  db,
  probes: {
    db: () => sql`select 1`,
    queue: () => boss.getQueues(),
    storage: () => probeStorage(s3, config.S3_BUCKET),
    libreoffice: probeLibreOffice,
  },
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log('api listening', { port: info.port });
});
