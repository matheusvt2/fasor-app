import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { S3Client } from '@aws-sdk/client-s3';
import { createDb } from '../apps/api/src/db/client.ts';
import { resetTestCompany } from '../apps/api/src/db/reset-test-company.ts';
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
  // Only a seeded test company is ever reset (`resetTestCompany` refuses any other id too).
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

  // E-3 (review 2026-09-30): this company alone, its object versions first (every listing
  // page), then its ops, entities, push register and reading runs, then its pg-boss jobs.
  const { sql, db } = createDb(need('DATABASE_URL'));
  const s3 = new S3Client({
    endpoint: need('S3_ENDPOINT'),
    region: need('S3_REGION'),
    forcePathStyle: true,
    credentials: { accessKeyId: need('S3_ACCESS_KEY_ID'), secretAccessKey: need('S3_SECRET_ACCESS_KEY') },
  });
  try {
    await resetTestCompany({ db, sql, s3, bucket: need('S3_BUCKET') }, companyId);
  } finally {
    await sql.end();
  }
  console.log(`reset company ${companyId}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
