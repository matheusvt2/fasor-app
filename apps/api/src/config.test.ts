import { TELEMETRY_BATCH_MAX } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigError, DEFAULT_EMAIL_FROM, emailLimits, KNOWN_DEV_SESSION_SECRETS, loadConfig, rateLimitEnabled, requestLimits } from './config.ts';

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

/**
 * 2026-11-22 (e26r): what a production process needs on top of `valid` to boot (a real mailer and sender);
 * 2026-11-26 (e31f): and, with AI features on (the default), a real speech provider.
 */
const productionMail = { EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'no-reply@example.com', STT_PROVIDER: 'transcribe' };
const realSpeech = { STT_PROVIDER: 'transcribe' };

describe('config', () => {
  it('parses a valid environment and defaults providers to fake', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.LLM_PROVIDER).toBe('fake');
    expect(config.OCR_PROVIDER).toBe('fake');
  });

  it('Story 20.13: the per-user telemetry limit defaults to 2 000 and is never below one full batch', () => {
    expect(loadConfig(valid).TELEMETRY_USER_RATE_LIMIT_MAX).toBe(2000);
    expect(loadConfig({ ...valid, TELEMETRY_USER_RATE_LIMIT_MAX: String(TELEMETRY_BATCH_MAX) }).TELEMETRY_USER_RATE_LIMIT_MAX).toBe(TELEMETRY_BATCH_MAX);
    expect(() => loadConfig({ ...valid, TELEMETRY_USER_RATE_LIMIT_MAX: String(TELEMETRY_BATCH_MAX - 1) })).toThrow(/TELEMETRY_USER_RATE_LIMIT_MAX/);
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

  it('Story 31.2: STT_PROVIDER defaults to fake and reads fake or transcribe only', () => {
    expect(loadConfig(valid).STT_PROVIDER).toBe('fake');
    expect(loadConfig({ ...valid, STT_PROVIDER: '' }).STT_PROVIDER).toBe('fake');
    expect(loadConfig({ ...valid, STT_PROVIDER: 'transcribe' }).STT_PROVIDER).toBe('transcribe');
    expect(() => loadConfig({ ...valid, STT_PROVIDER: 'whisper' })).toThrow(/STT_PROVIDER/);
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
    expect(config.BEDROCK_PANEL_MODEL_ID).toBe('qwen.qwen3-vl-235b-a22b');
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
    // The panel model: empty is the default (Qwen3 VL), a name overrides it.
    expect(loadConfig({ ...valid, BEDROCK_PANEL_MODEL_ID: '' }).BEDROCK_PANEL_MODEL_ID).toBe('qwen.qwen3-vl-235b-a22b');
    expect(loadConfig({ ...valid, BEDROCK_PANEL_MODEL_ID: 'global.anthropic.claude-haiku-4-5-20251001-v1:0' }).BEDROCK_PANEL_MODEL_ID).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
  });

  it('defaults the worker on and reads the generate fault only when set (Story 4.8)', () => {
    const config = loadConfig(valid);
    expect(config.WORKER).toBe('1');
    expect(config.GENERATE_FAULT).toBeUndefined();
    expect(config.NODE_ENV).toBeUndefined();
    expect(loadConfig({ ...valid, WORKER: '0' }).WORKER).toBe('0');
    expect(loadConfig({ ...valid, GENERATE_FAULT: '' }).GENERATE_FAULT).toBeUndefined();
    expect(loadConfig({ ...valid, GENERATE_FAULT: 'libreoffice_timeout' }).GENERATE_FAULT).toBe('libreoffice_timeout');
    expect(loadConfig({ ...valid, ...productionMail, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
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
    expect(() => loadConfig({ ...valid, ...productionMail, NODE_ENV: 'production', SESSION_SECRET: devSecret })).toThrow(/SESSION_SECRET/);
    expect(loadConfig({ ...valid, ...productionMail, NODE_ENV: 'production' }).SESSION_SECRET).toBe('x'.repeat(32));
  });

  it('turns the request limits on in production by default and reads overrides (E11-A5)', () => {
    expect(rateLimitEnabled(loadConfig(valid))).toBe(false);
    expect(rateLimitEnabled(loadConfig({ ...valid, ...productionMail, NODE_ENV: 'production' }))).toBe(true);
    expect(rateLimitEnabled(loadConfig({ ...valid, ...productionMail, NODE_ENV: 'production', RATE_LIMIT: 'off' }))).toBe(false);
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
      requestLimits(loadConfig({ ...valid, ...productionMail, NODE_ENV: 'production', SIGN_IN_RATE_LIMIT_MAX: '7', PUSH_RATE_LIMIT_WINDOW_SECONDS: '30', TRUST_PROXY: '0' })),
    ).toEqual({ signIn: { max: 7, windowMs: 300_000 }, push: { max: 120, windowMs: 30_000 }, trustProxy: false });
  });

  it('Epic 18: defaults the telemetry sink to stdout, and cloudwatch needs a log group', () => {
    expect(loadConfig(valid).TELEMETRY_SINK).toBe('stdout');
    expect(loadConfig({ ...valid, TELEMETRY_SINK: '' }).TELEMETRY_SINK).toBe('stdout');
    expect(loadConfig({ ...valid, TELEMETRY_LOG_GROUP: '' }).TELEMETRY_LOG_GROUP).toBeUndefined();
    const cloud = loadConfig({ ...valid, TELEMETRY_SINK: 'cloudwatch', TELEMETRY_LOG_GROUP: '/fasor/production/ux-events' });
    expect([cloud.TELEMETRY_SINK, cloud.TELEMETRY_LOG_GROUP]).toEqual(['cloudwatch', '/fasor/production/ux-events']);
    expect(() => loadConfig({ ...valid, TELEMETRY_SINK: 'cloudwatch' })).toThrow(/TELEMETRY_LOG_GROUP/);
    expect(() => loadConfig({ ...valid, TELEMETRY_SINK: 'cloudwatch', TELEMETRY_LOG_GROUP: '' })).toThrow(/TELEMETRY_LOG_GROUP/);
    expect(() => loadConfig({ ...valid, TELEMETRY_SINK: 'kinesis' })).toThrow(/TELEMETRY_SINK/);
  });

  it('26.6-API-001a: the e-mail provider defaults to fake, the sender to a placeholder, SES to us-east-1, and ses is read', () => {
    const config = loadConfig(valid);
    expect(config.EMAIL_PROVIDER).toBe('fake');
    expect(config.EMAIL_FROM).toBe(DEFAULT_EMAIL_FROM);
    expect(DEFAULT_EMAIL_FROM).not.toMatch(/fasor/i);
    expect(config.SES_REGION).toBe('us-east-1');
    const ses = loadConfig({ ...valid, EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'nao-responda@mail.example.com', SES_REGION: 'sa-east-1' });
    expect([ses.EMAIL_PROVIDER, ses.EMAIL_FROM, ses.SES_REGION]).toEqual(['ses', 'nao-responda@mail.example.com', 'sa-east-1']);
    expect(loadConfig({ ...valid, EMAIL_PROVIDER: '', EMAIL_FROM: '' }).EMAIL_PROVIDER).toBe('fake');
    expect(() => loadConfig({ ...valid, EMAIL_PROVIDER: 'smtp' })).toThrow(/EMAIL_PROVIDER/);
    expect(() => loadConfig({ ...valid, EMAIL_FROM: 'not-an-address' })).toThrow(/EMAIL_FROM/);
  });

  it('e26r-UNIT-001: production refuses the fake mailer and the placeholder sender; ses with a real sender boots; outside production fake still boots', () => {
    const variablesOf = (env: Record<string, string | undefined>): string[] => {
      try {
        loadConfig(env);
      } catch (error) {
        if (error instanceof ConfigError) return error.variables;
        throw error;
      }
      return [];
    };
    expect(variablesOf({ ...valid, ...realSpeech, NODE_ENV: 'production' })).toEqual(['EMAIL_PROVIDER']);
    expect(variablesOf({ ...valid, ...realSpeech, NODE_ENV: 'production', EMAIL_PROVIDER: 'fake', EMAIL_FROM: 'no-reply@example.com' })).toEqual(['EMAIL_PROVIDER']);
    expect(variablesOf({ ...valid, ...realSpeech, NODE_ENV: 'production', EMAIL_PROVIDER: 'ses' })).toEqual(['EMAIL_FROM']);
    expect(variablesOf({ ...valid, ...realSpeech, NODE_ENV: 'production', EMAIL_PROVIDER: 'ses', EMAIL_FROM: DEFAULT_EMAIL_FROM })).toEqual(['EMAIL_FROM']);
    const booted = loadConfig({ ...valid, ...realSpeech, NODE_ENV: 'production', EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'no-reply@example.com' });
    expect([booted.EMAIL_PROVIDER, booted.EMAIL_FROM]).toEqual(['ses', 'no-reply@example.com']);
    expect(loadConfig({ ...valid, NODE_ENV: 'development' }).EMAIL_PROVIDER).toBe('fake');
    expect(loadConfig({ ...valid, NODE_ENV: 'test', EMAIL_PROVIDER: 'ses' }).EMAIL_FROM).toBe(DEFAULT_EMAIL_FROM);
  });

  it('e31f-UNIT-001: production with AI features on refuses the fake speech provider; transcribe boots; AI off or outside production fake still boots', () => {
    const variablesOf = (env: Record<string, string | undefined>): string[] => {
      try {
        loadConfig(env);
      } catch (error) {
        if (error instanceof ConfigError) return error.variables;
        throw error;
      }
      return [];
    };
    const mail = { EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'no-reply@example.com' };
    expect(variablesOf({ ...valid, ...mail, NODE_ENV: 'production' })).toEqual(['STT_PROVIDER']);
    expect(variablesOf({ ...valid, ...mail, NODE_ENV: 'production', AI_FEATURES: 'on', STT_PROVIDER: 'fake' })).toEqual(['STT_PROVIDER']);
    expect(variablesOf({ ...valid, ...mail, NODE_ENV: 'production', STT_PROVIDER: '' })).toEqual(['STT_PROVIDER']);
    expect(loadConfig({ ...valid, ...mail, NODE_ENV: 'production', STT_PROVIDER: 'transcribe' }).STT_PROVIDER).toBe('transcribe');
    expect(loadConfig({ ...valid, ...mail, NODE_ENV: 'production', AI_FEATURES: 'off' }).STT_PROVIDER).toBe('fake');
    expect(loadConfig({ ...valid, NODE_ENV: 'development' }).STT_PROVIDER).toBe('fake');
  });

  it('26.6-API-001a: the e-mail limits default to 5 per address and 20 per client a minute, 30 Admin e-mails per 10 minutes, whatever RATE_LIMIT says', () => {
    const limits = emailLimits(loadConfig({ ...valid, RATE_LIMIT: 'off' }));
    expect(limits).toEqual({
      passwordResetEmail: { max: 5, windowMs: 60_000 },
      passwordResetAddress: { max: 20, windowMs: 60_000 },
      adminEmail: { max: 30, windowMs: 600_000 },
      trustProxy: true,
    });
    const tuned = emailLimits(loadConfig({ ...valid, PASSWORD_RESET_RATE_LIMIT_MAX: '2', PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: '10', PASSWORD_RESET_IP_RATE_LIMIT_MAX: '3', ADMIN_EMAIL_RATE_LIMIT_MAX: '4', ADMIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS: '5', TRUST_PROXY: '0' }));
    expect(tuned).toEqual({ passwordResetEmail: { max: 2, windowMs: 10_000 }, passwordResetAddress: { max: 3, windowMs: 10_000 }, adminEmail: { max: 4, windowMs: 5_000 }, trustProxy: false });
    expect(() => loadConfig({ ...valid, ADMIN_EMAIL_RATE_LIMIT_MAX: '0' })).toThrow(/ADMIN_EMAIL_RATE_LIMIT_MAX/);
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
