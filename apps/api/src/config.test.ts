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

  it('defaults the OCR sidecar URL and reads an override (Story 8.3)', () => {
    expect(loadConfig(valid).OCR_SERVICE_URL).toBe('http://ocr:8000');
    expect(loadConfig({ ...valid, OCR_SERVICE_URL: 'http://localhost:32800' }).OCR_SERVICE_URL).toBe('http://localhost:32800');
    expect(() => loadConfig({ ...valid, OCR_SERVICE_URL: 'not-a-url' })).toThrow(/OCR_SERVICE_URL/);
  });

  it('defaults the Textract region to us-east-1 and reads an override (Story 11.7)', () => {
    expect(loadConfig(valid).TEXTRACT_REGION).toBe('us-east-1');
    expect(loadConfig({ ...valid, TEXTRACT_REGION: 'us-west-2' }).TEXTRACT_REGION).toBe('us-west-2');
    expect(() => loadConfig({ ...valid, TEXTRACT_REGION: '' })).toThrow(/TEXTRACT_REGION/);
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

  describe('S3 endpoint and static keys (Story 11.8)', () => {
    const aws: Record<string, string | undefined> = { ...valid };
    delete aws.S3_ENDPOINT;
    delete aws.S3_ACCESS_KEY_ID;
    delete aws.S3_SECRET_ACCESS_KEY;

    function offending(env: Record<string, string | undefined>): string[] {
      try {
        loadConfig(env);
      } catch (error) {
        if (error instanceof ConfigError) return error.variables;
        throw error;
      }
      return [];
    }

    it('keeps the local endpoint and both static keys', () => {
      const config = loadConfig(valid);
      expect(config.S3_ENDPOINT).toBe('http://localhost:9000');
      expect(config.S3_ACCESS_KEY_ID).toBe('key');
      expect(config.S3_SECRET_ACCESS_KEY).toBe('secret');
    });

    it('accepts no endpoint and no keys (AWS: default credential chain)', () => {
      const config = loadConfig(aws);
      expect(config.S3_ENDPOINT).toBeUndefined();
      expect(config.S3_ACCESS_KEY_ID).toBeUndefined();
      expect(config.S3_SECRET_ACCESS_KEY).toBeUndefined();
    });

    it('treats empty strings as unset', () => {
      const config = loadConfig({ ...valid, S3_ENDPOINT: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' });
      expect(config.S3_ENDPOINT).toBeUndefined();
      expect(config.S3_ACCESS_KEY_ID).toBeUndefined();
      expect(config.S3_SECRET_ACCESS_KEY).toBeUndefined();
    });

    it('names the missing half of a key pair', () => {
      expect(() => loadConfig({ ...aws, S3_ACCESS_KEY_ID: 'key' })).toThrow(ConfigError);
      expect(offending({ ...aws, S3_ACCESS_KEY_ID: 'key' })).toEqual(['S3_SECRET_ACCESS_KEY']);
      expect(offending({ ...aws, S3_SECRET_ACCESS_KEY: 'secret' })).toEqual(['S3_ACCESS_KEY_ID']);
      expect(offending({ ...valid, S3_ACCESS_KEY_ID: '' })).toEqual(['S3_ACCESS_KEY_ID']);
    });

    it('still rejects a malformed endpoint', () => {
      expect(() => loadConfig({ ...valid, S3_ENDPOINT: 'not-a-url' })).toThrow(/S3_ENDPOINT/);
    });
  });
});
