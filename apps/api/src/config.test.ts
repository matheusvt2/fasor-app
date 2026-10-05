import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigError, KNOWN_DEV_SESSION_SECRETS, loadConfig, rateLimitEnabled, requestLimits } from './config.ts';

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

  it('defaults AI features on and reads off (Story 11.8 follow-up)', () => {
    expect(loadConfig(valid).AI_FEATURES).toBe('on');
    expect(loadConfig({ ...valid, AI_FEATURES: '' }).AI_FEATURES).toBe('on');
    expect(loadConfig({ ...valid, AI_FEATURES: 'off' }).AI_FEATURES).toBe('off');
    expect(() => loadConfig({ ...valid, AI_FEATURES: 'maybe' })).toThrow(/AI_FEATURES/);
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

  it('reads LLM_PROVIDER fake or bedrock only (Story 11.6: no anthropic provider)', () => {
    expect(loadConfig({ ...valid, LLM_PROVIDER: 'bedrock' }).LLM_PROVIDER).toBe('bedrock');
    expect(() => loadConfig({ ...valid, LLM_PROVIDER: 'anthropic' })).toThrow(/LLM_PROVIDER/);
  });

  it('defaults the Bedrock settings: Haiku 4.5, prose on the same model, Nova Pro escalation (Story 11.6)', () => {
    const config = loadConfig(valid);
    expect(config.BEDROCK_REGION).toBe('us-east-1');
    expect(config.BEDROCK_MODEL_ID).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(config.BEDROCK_PROSE_MODEL_ID).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(config.BEDROCK_ESCALATION_MODEL_ID).toBe('us.amazon.nova-pro-v1:0');
    // Compose passes an unset variable as '': the region and models fall back to their defaults.
    const empty = loadConfig({ ...valid, BEDROCK_REGION: '', BEDROCK_MODEL_ID: '', BEDROCK_PROSE_MODEL_ID: '' });
    expect(empty.BEDROCK_REGION).toBe('us-east-1');
    expect(empty.BEDROCK_MODEL_ID).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(empty.BEDROCK_PROSE_MODEL_ID).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
    const set = loadConfig({ ...valid, BEDROCK_REGION: 'us-west-2', BEDROCK_MODEL_ID: 'us.amazon.nova-2-lite-v1:0' });
    expect(set.BEDROCK_REGION).toBe('us-west-2');
    expect(set.BEDROCK_PROSE_MODEL_ID).toBe('us.amazon.nova-2-lite-v1:0');
    expect(loadConfig({ ...valid, BEDROCK_PROSE_MODEL_ID: 'qwen.qwen3-vl-235b-a22b' }).BEDROCK_PROSE_MODEL_ID).toBe('qwen.qwen3-vl-235b-a22b');
    // An empty escalation model disables the escalation (it is not unset).
    expect(loadConfig({ ...valid, BEDROCK_ESCALATION_MODEL_ID: '' }).BEDROCK_ESCALATION_MODEL_ID).toBe('');
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

  it('refuses the public development SESSION_SECRET in production only (security review 2026-09-30)', () => {
    const [devSecret] = [...KNOWN_DEV_SESSION_SECRETS];
    expect(loadConfig({ ...valid, SESSION_SECRET: devSecret }).SESSION_SECRET).toBe(devSecret);
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production', SESSION_SECRET: devSecret })).toThrow(/SESSION_SECRET/);
    expect(loadConfig({ ...valid, NODE_ENV: 'production' }).SESSION_SECRET).toBe('x'.repeat(32));
  });

  it('turns the request limits on in production by default and reads overrides (E11-A5)', () => {
    expect(rateLimitEnabled(loadConfig(valid))).toBe(false);
    expect(rateLimitEnabled(loadConfig({ ...valid, NODE_ENV: 'production' }))).toBe(true);
    expect(rateLimitEnabled(loadConfig({ ...valid, NODE_ENV: 'production', RATE_LIMIT: 'off' }))).toBe(false);
    expect(rateLimitEnabled(loadConfig({ ...valid, RATE_LIMIT: 'on' }))).toBe(true);
    expect(rateLimitEnabled(loadConfig({ ...valid, RATE_LIMIT: '' }))).toBe(false);
    expect(() => loadConfig({ ...valid, RATE_LIMIT: 'maybe' })).toThrow(/RATE_LIMIT/);
  });

  it('defaults the limits and the body cap, and refuses a non-positive one', () => {
    const config = loadConfig(valid);
    expect(config.SIGN_IN_RATE_LIMIT_MAX).toBe(10);
    expect(config.SIGN_IN_RATE_LIMIT_WINDOW_SECONDS).toBe(300);
    expect(config.PUSH_RATE_LIMIT_MAX).toBe(120);
    expect(config.PUSH_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(config.TRUST_PROXY).toBe('1');
    expect(config.API_BODY_LIMIT_BYTES).toBe(16 * 1024 * 1024);
    expect(loadConfig({ ...valid, SIGN_IN_RATE_LIMIT_MAX: '5', API_BODY_LIMIT_BYTES: '' }).SIGN_IN_RATE_LIMIT_MAX).toBe(5);
    expect(() => loadConfig({ ...valid, PUSH_RATE_LIMIT_MAX: '0' })).toThrow(/PUSH_RATE_LIMIT_MAX/);
  });

  it('hands main.ts the limits from the configuration, and none when they are off (review fixes 2026-09-30)', () => {
    expect(requestLimits(loadConfig(valid))).toBeUndefined();
    expect(
      requestLimits(loadConfig({ ...valid, NODE_ENV: 'production', SIGN_IN_RATE_LIMIT_MAX: '7', PUSH_RATE_LIMIT_WINDOW_SECONDS: '30', TRUST_PROXY: '0' })),
    ).toEqual({ signIn: { max: 7, windowMs: 300_000 }, push: { max: 120, windowMs: 30_000 }, trustProxy: false });
  });

  it('knows every development SESSION_SECRET this repository commits', () => {
    const repo = resolve(import.meta.dirname, '../../..');
    const committed = [
      /SESSION_SECRET: \$\{SESSION_SECRET:-([^}]+)\}/.exec(readFileSync(resolve(repo, 'docker-compose.yml'), 'utf8'))?.[1],
      /^SESSION_SECRET=(.+)$/m.exec(readFileSync(resolve(repo, '.env.example'), 'utf8'))?.[1],
    ];
    for (const secret of committed) {
      expect(secret).toBeDefined();
      expect(KNOWN_DEV_SESSION_SECRETS.has(secret!.trim())).toBe(true);
    }
  });
});
