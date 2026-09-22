import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.ts';

const valid = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/app',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'app-files',
  PORT: '3000',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('config', () => {
  it('parses a valid environment and defaults providers to fake', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.LLM_PROVIDER).toBe('fake');
    expect(config.OCR_PROVIDER).toBe('fake');
  });

  it('names a missing variable', () => {
    const rest: Record<string, string | undefined> = { ...valid };
    delete rest.DATABASE_URL;
    expect(() => loadConfig(rest)).toThrow(ConfigError);
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it('names a malformed variable', () => {
    expect(() => loadConfig({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...valid, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
});
