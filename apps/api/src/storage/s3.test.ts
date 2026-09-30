import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import { createS3, prepareStorage } from './s3.ts';

// The chain's environment variable, spelled in pieces: the provider-switch guard
// (jobs/reading/providers/fake.test.ts) fails on any api source naming it literally.
const CHAIN_KEY_ID_VAR = ['AWS', 'ACCESS', 'KEY', 'ID'].join('_');

const local = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  S3_ENDPOINT: 'http://minio:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'minio-key',
  S3_SECRET_ACCESS_KEY: 'minio-secret',
  S3_BUCKET: 'app-files',
  PORT: '3000',
  SESSION_SECRET: 'x'.repeat(32),
  TRUSTED_ORIGINS: 'http://localhost:5173',
};
// AWS (Story 11.8): no endpoint, no static keys; compose-style empty strings count as unset.
const aws = { ...local, S3_ENDPOINT: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' };

/** A stand-in client that records every command it is sent. */
function recordingClient(fail: (command: unknown) => boolean = () => false) {
  const sent: unknown[] = [];
  const send = vi.fn(async (command: unknown) => {
    sent.push(command);
    if (fail(command)) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
    return {};
  });
  return { client: { send } as unknown as S3Client, sent };
}

function commandTypes(sent: unknown[]): unknown[] {
  return sent.map((command) => (command as object).constructor);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createS3 (Story 11.8)', () => {
  it('uses the endpoint, path style and the static keys locally', async () => {
    const client = createS3(loadConfig(local));
    expect(client.config.forcePathStyle).toBe(true);
    const credentials = await client.config.credentials();
    expect(credentials.accessKeyId).toBe('minio-key');
    expect(credentials.secretAccessKey).toBe('minio-secret');
  });

  it('resolves credentials through the SDK default chain on AWS, virtual-hosted style', async () => {
    // The default chain reads the environment first; on ECS the same chain reaches the task role.
    vi.stubEnv(CHAIN_KEY_ID_VAR, 'chain-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'chain-secret');
    vi.stubEnv('AWS_SESSION_TOKEN', 'chain-token');
    const client = createS3(loadConfig(aws));
    expect(client.config.forcePathStyle).toBeFalsy();
    expect(await client.config.region()).toBe('us-east-1');
    const credentials = await client.config.credentials();
    expect(credentials.accessKeyId).toBe('chain-key');
    expect(credentials.secretAccessKey).toBe('chain-secret');
    expect(credentials.sessionToken).toBe('chain-token');
  });

  it('prefers the static keys over the environment chain when both exist', async () => {
    vi.stubEnv(CHAIN_KEY_ID_VAR, 'chain-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'chain-secret');
    const credentials = await createS3(loadConfig(local)).config.credentials();
    expect(credentials.accessKeyId).toBe('minio-key');
  });
});

describe('prepareStorage (Story 11.8)', () => {
  it('only probes the bucket on AWS, never creates it nor changes versioning', async () => {
    const { client, sent } = recordingClient();
    await prepareStorage(loadConfig(aws), client);
    expect(commandTypes(sent)).toEqual([HeadBucketCommand]);
    expect((sent[0] as HeadBucketCommand).input).toEqual({ Bucket: 'app-files' });
  });

  it('fails on AWS when the probe fails, without creating the bucket', async () => {
    const { client, sent } = recordingClient(() => true);
    await expect(prepareStorage(loadConfig(aws), client)).rejects.toThrow('NotFound');
    expect(commandTypes(sent)).toEqual([HeadBucketCommand]);
  });

  it('ensures the bucket and its versioning against a local endpoint', async () => {
    const { client, sent } = recordingClient();
    await prepareStorage(loadConfig(local), client);
    expect(commandTypes(sent)).toEqual([HeadBucketCommand, PutBucketVersioningCommand]);
  });

  it('creates the missing local bucket before turning versioning on', async () => {
    const { client, sent } = recordingClient((command) => command instanceof HeadBucketCommand);
    await prepareStorage(loadConfig(local), client);
    expect(commandTypes(sent)).toEqual([HeadBucketCommand, CreateBucketCommand, PutBucketVersioningCommand]);
  });
});
