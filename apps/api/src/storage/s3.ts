import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Config } from '../config.ts';

export function createS3(config: Config): S3Client {
  return new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
}

/** Creates the bucket when absent and turns versioning on (immutable keys, AD-7). */
export async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: 'Enabled' },
    }),
  );
}

export async function probeStorage(s3: S3Client, bucket: string): Promise<void> {
  await s3.send(new HeadBucketCommand({ Bucket: bucket }));
}
