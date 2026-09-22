import { serve } from '@hono/node-server';
import { loadConfigOrExit } from './config.ts';
import { createDb } from './db/client.ts';
import { createApp } from './http/app.ts';
import { probeLibreOffice } from './jobs/generate/libreoffice.ts';
import { startQueue } from './jobs/queue.ts';
import { createS3, ensureBucket, probeStorage } from './storage/s3.ts';

const config = loadConfigOrExit();

const db = createDb(config.DATABASE_URL);
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

const app = createApp({
  db: () => db`select 1`,
  queue: () => boss.getQueues(),
  storage: () => probeStorage(s3, config.S3_BUCKET),
  libreoffice: probeLibreOffice,
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(JSON.stringify({ msg: 'api listening', port: info.port }));
});
