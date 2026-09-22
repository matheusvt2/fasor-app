import { GetBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
import { healthResponseSchema } from '@app/domain';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const apiUrl = process.env.API_URL ?? 'http://api:3000';

describe('clean boot against the compose stack', () => {
  it('serves /api/health with every component up', async () => {
    const res = await fetch(`${apiUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json())).toEqual({
      status: 'up',
      db: 'up',
      queue: 'up',
      storage: 'up',
      libreoffice: 'up',
    });
  });

  it('ran the migrations at boot', async () => {
    const sql = postgres(process.env.DATABASE_URL ?? 'postgres://app:app@postgres:5432/app', { max: 1 });
    try {
      const [row] = await sql`select to_regclass('public.ops') as ops, to_regclass('public.entities') as entities`;
      expect(row?.ops).toBe('ops');
      expect(row?.entities).toBe('entities');
    } finally {
      await sql.end();
    }
  });

  it('keeps bucket versioning enabled', async () => {
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      },
    });
    const result = await s3.send(new GetBucketVersioningCommand({ Bucket: process.env.S3_BUCKET }));
    expect(result.Status).toBe('Enabled');
  });
});
