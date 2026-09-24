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
  TRUSTED_ORIGINS: 'http://localhost:5173',
};

describe('config', () => {
  it('parses a valid environment and defaults providers to fake', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.LLM_PROVIDER).toBe('fake');
    expect(config.OCR_PROVIDER).toBe('fake');
  });

  it('defaults the worker on and reads the generate fault only when set (Story 4.8)', () => {
    const config = loadConfig(valid);
    expect(config.WORKER).toBe('1');
    expect(config.GENERATE_FAULT).toBeUndefined();
    expect(config.NODE_ENV).toBeUndefined();
    expect(loadConfig({ ...valid, WORKER: '0' }).WORKER).toBe('0');
    expect(loadConfig({ ...valid, GENERATE_FAULT: '' }).GENERATE_FAULT).toBeUndefined();
    expect(loadConfig({ ...valid, GENERATE_FAULT: 'libreoffice_timeout' }).GENERATE_FAULT).toBe('libreoffice_timeout');
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    expect(() => loadConfig({ ...valid, WORKER: 'yes' })).toThrow(/WORKER/);
    expect(() => loadConfig({ ...valid, GENERATE_FAULT: 'explode' })).toThrow(/GENERATE_FAULT/);
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
    expect(() => loadConfig({ ...valid, TRUSTED_ORIGINS: '' })).toThrow(/TRUSTED_ORIGINS/);
    expect(() => loadConfig({ ...valid, AUTH_BASE_URL: 'not-a-url' })).toThrow(/AUTH_BASE_URL/);
    expect(loadConfig({ ...valid, AUTH_BASE_URL: 'http://localhost:5173' }).AUTH_BASE_URL).toBe(
      'http://localhost:5173',
    );
  });
});
