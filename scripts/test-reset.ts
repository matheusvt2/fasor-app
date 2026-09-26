import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createDb } from '../apps/api/src/db/client.ts';
import { resetCompanyJobs } from '../apps/api/src/db/reset-company-jobs.ts';
import { resetTestCompanyData } from '../apps/api/src/db/seed.ts';
import { TEST_SEED } from '../apps/api/src/db/test-seed.ts';

export function assertInCompose(
  env: Record<string, string | undefined> = process.env,
  exists: (path: string) => boolean = existsSync,
  command = 'pnpm test:reset <company-id>',
): void {
  if (env.RUNNING_IN_COMPOSE !== '1' || !exists('/.dockerenv')) {
    throw new Error(
      `this script must run inside docker-compose (RUNNING_IN_COMPOSE=1 in a container): use "docker compose run --rm tools ${command}".`,
    );
  }
}

async function main(): Promise<void> {
  try {
    assertInCompose();
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  const companyId = process.argv[2];
  if (!companyId) {
    console.error('usage: test-reset <company-id>');
    process.exit(1);
  }
  // `resetTestCompanyData` only ever clears the two hardcoded `TEST_SEED` companies (it takes
  // no company argument); passing anything else would silently leave that company's ops/
  // entities/sync_device_push rows untouched while this script still logged success and still
  // cleared its pgboss/S3 state. Fail loudly instead of half-resetting.
  if (!TEST_SEED.companies.some((c) => c.companyId === companyId)) {
    console.error(
      `test-reset only resets the seeded test companies; ${companyId} is not one of ${TEST_SEED.companies.map((c) => c.companyId).join(', ')}.`,
    );
    process.exit(1);
  }
  const need = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      console.error(`missing environment variable ${name}`);
      process.exit(1);
    }
    return value;
  };

  // The `ops`/`entities`/`sync_device_push` reset is the same mechanism `apps/api/src/db/seed.ts`
  // (`resetTestCompanyData`) uses to clean up between the two seeded `TEST_SEED` companies
  // (F-DUP-3): one reset mechanism instead of a guessed, partly-nonexistent table list. It
  // always clears both `TEST_SEED` companies in one transaction, independent of the
  // `company-id` argument below, which still scopes the pgboss queue and object storage
  // cleanup that `resetTestCompanyData` does not cover.
  const { sql, db } = createDb(need('DATABASE_URL'));
  try {
    await resetTestCompanyData(db);
    await resetCompanyJobs(sql, companyId);
  } finally {
    await sql.end();
  }

  const s3 = new S3Client({
    endpoint: need('S3_ENDPOINT'),
    region: need('S3_REGION'),
    forcePathStyle: true,
    credentials: { accessKeyId: need('S3_ACCESS_KEY_ID'), secretAccessKey: need('S3_SECRET_ACCESS_KEY') },
  });
  const bucket = need('S3_BUCKET');
  const prefix = `company/${companyId}/`;
  for (;;) {
    const page = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix }));
    const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].map((o) => ({
      Key: o.Key!,
      VersionId: o.VersionId,
    }));
    if (objects.length === 0) break;
    const deleted = await s3.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }),
    );
    if (deleted.Errors?.length) {
      throw new Error(
        `failed to delete ${deleted.Errors.length} object(s): ${deleted.Errors.map((e) => `${e.Key}: ${e.Code}`).join(', ')}`,
      );
    }
  }
  console.log(`reset company ${companyId}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
