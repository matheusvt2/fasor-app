import { serve } from '@hono/node-server';
import { createAuth } from './auth/auth.ts';
import { loadConfigOrExit } from './config.ts';
import { createDb, createSql } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { createApp } from './http/app.ts';
import { probeLibreOffice } from './jobs/generate/libreoffice.ts';
import { startQueue } from './jobs/queue.ts';
import { createS3, ensureBucket, probeStorage } from './storage/s3.ts';
import { parseTrustedOrigins } from './auth/trusted-origins.ts';

const config = loadConfigOrExit();

const sql = createSql(config.DATABASE_URL);
const db = createDb(sql);
const s3 = createS3(config);

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 30) throw error;
      console.error(`${label} not ready (attempt ${attempt}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

await withRetry('storage', () => ensureBucket(s3, config.S3_BUCKET));
const boss = await withRetry('queue', () => startQueue(config.DATABASE_URL));

// Forward-only migrations run here, after the db is reachable and before the server
// accepts a request, so `docker compose up` stays one command.
await withRetry('migrations', () => runMigrations(db));
console.log(JSON.stringify({ msg: 'migrations applied' }));

const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
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
  console.log(JSON.stringify({ msg: 'api listening', port: info.port }));
});
