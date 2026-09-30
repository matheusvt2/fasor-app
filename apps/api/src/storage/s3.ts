import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { Config } from '../config.ts';

type StorageConfig = Pick<Config, 'S3_ENDPOINT' | 'S3_REGION' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'>;

/**
 * Locally (MinIO) the endpoint and the static keys are set: path-style requests signed
 * with those keys. On AWS (Story 11.8) all three are unset: the client gets only its
 * region, reaches S3 virtual-hosted style, and the SDK default credential chain supplies
 * the ECS task role's credentials. No static key ever exists in production.
 */
export function createS3(config: StorageConfig): S3Client {
  const options: S3ClientConfig = { region: config.S3_REGION };
  if (config.S3_ENDPOINT !== undefined) {
    options.endpoint = config.S3_ENDPOINT;
    options.forcePathStyle = true;
  }
  if (config.S3_ACCESS_KEY_ID !== undefined && config.S3_SECRET_ACCESS_KEY !== undefined) {
    options.credentials = {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    };
  }
  return new S3Client(options);
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

/**
 * Boot-time storage step. Against a local S3-compatible endpoint the api owns the bucket
 * and creates it with versioning; on AWS Terraform owns the bucket and its versioning, so
 * boot only probes it and never creates or reconfigures anything.
 */
export async function prepareStorage(
  config: Pick<Config, 'S3_ENDPOINT' | 'S3_BUCKET'>,
  s3: S3Client,
): Promise<void> {
  if (config.S3_ENDPOINT !== undefined) await ensureBucket(s3, config.S3_BUCKET);
  else await probeStorage(s3, config.S3_BUCKET);
}

/*
 * AD-7 object access. There is deliberately no delete helper: object keys are
 * immutable and nothing in the MVP removes one.
 */

/** Stores the bytes under an immutable key. Re-storing the same key is the idempotent retry. */
export async function putObject(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength }),
  );
}

export interface StoredObject {
  body: Readable;
  contentType: string;
  contentLength: number | null;
}

/**
 * True only for "this key holds nothing". Every other failure (the store is down, the
 * credentials are wrong, the bucket is gone) is a fault the caller must not read as an
 * absent object: answering 404 would hide an outage, and treating a failed probe as
 * "not stored" would rewrite a key AD-7 declares immutable.
 */
function isNotFound(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

/** Reads the object for `GET /api/files/{id}/{variant}`; null when the key does not exist. */
export async function getObject(s3: S3Client, bucket: string, key: string): Promise<StoredObject | null> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (result.Body === undefined) return null;
    return {
      body: result.Body as Readable,
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength ?? null,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The idempotency probe: true when the key already holds an object. */
export async function headObject(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}
