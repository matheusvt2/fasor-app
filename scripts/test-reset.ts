import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import postgres from 'postgres';

/** Company-scoped tables holding ops, materialized entities, files, jobs and revisions. Missing tables are skipped. */
const TABLES = ['ops', 'entities', 'files', 'revisions', 'generation_jobs', 'reading_runs'];

export function assertInCompose(
  env: Record<string, string | undefined> = process.env,
  exists: (path: string) => boolean = existsSync,
): void {
  if (env.RUNNING_IN_COMPOSE !== '1' || !exists('/.dockerenv')) {
    throw new Error(
      'test-reset must run inside docker-compose: use "docker compose run --rm tools pnpm test:reset <company-id>".',
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
  const need = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      console.error(`missing environment variable ${name}`);
      process.exit(1);
    }
    return value;
  };

  const sql = postgres(need('DATABASE_URL'), { max: 1 });
  try {
    for (const table of TABLES) {
      const [found] = await sql`select to_regclass(${`public.${table}`}) as name`;
      if (!found?.name) continue;
      await sql`delete from ${sql(table)} where company_id = ${companyId}`;
    }
    const [queue] = await sql`select to_regclass('pgboss.job') as name`;
    if (queue?.name) await sql`delete from pgboss.job where data->>'companyId' = ${companyId}`;
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
