import { TELEMETRY_BATCH_MAX } from '@app/domain';
import { z } from 'zod';
import { DEFAULT_AUDIT_DAILY_QUOTA, DEFAULT_READING_DAILY_QUOTA } from './db/repositories/ai-usage.ts';
import { logError } from './log.ts';

/**
 * The session secrets committed to this public repository (`docker-compose.yml`,
 * `.env.example`): anyone can forge a session cookie signed with one of them.
 */
export const KNOWN_DEV_SESSION_SECRETS: ReadonlySet<string> = new Set(['change-me-change-me-change-me-32ch']);

/** Compose passes an unset variable as `''` (`${VAR:-}`); an empty value is unset. */
const unsetWhenEmpty = (value: unknown) => (value === '' ? undefined : value);

/** Story 11.6 (Matheus, 2026-10-05): the reference model, Claude Haiku 4.5 through its global inference profile. */
export const DEFAULT_BEDROCK_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

/**
 * Matheus, 2026-10-06: the model that reads panel fronts. Haiku 4.5 returned the block type of a panel
 * with no OCR word cited, so the adapter dropped it; Qwen3 VL 235B read both panel fields with valid
 * citations in the live evaluation, at about half Haiku's price, on a 100M TPM quota.
 */
export const DEFAULT_BEDROCK_PANEL_MODEL_ID = 'qwen.qwen3-vl-235b-a22b';

/** Story 11.6 (Matheus, 2026-10-05): the larger model a low-confidence plate reading is retried on. */
export const DEFAULT_BEDROCK_ESCALATION_MODEL_ID = 'us.amazon.nova-pro-v1:0';

/** Story 26.6: the sender address until Story 26.7 names one; it shows neither the codename nor a brand. */
export const DEFAULT_EMAIL_FROM = 'nao-responda@example.invalid';

export const configSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    /**
     * Story 11.8: the S3-compatible endpoint (MinIO locally). Unset on AWS, where the SDK
     * reaches S3 itself (virtual-hosted style) and boot only probes the bucket.
     */
    S3_ENDPOINT: z.preprocess(unsetWhenEmpty, z.string().url().optional()),
    S3_REGION: z.string().min(1),
    /**
     * Story 11.8: static keys, both or neither. Unset on AWS, where the SDK default
     * credential chain supplies the ECS task role's credentials.
     */
    S3_ACCESS_KEY_ID: z.preprocess(unsetWhenEmpty, z.string().min(1).optional()),
    S3_SECRET_ACCESS_KEY: z.preprocess(unsetWhenEmpty, z.string().min(1).optional()),
    S3_BUCKET: z.string().min(3),
    PORT: z.coerce.number().int().min(1).max(65535),
    SESSION_SECRET: z.string().min(32),
    /**
     * Origins allowed to post to /api/auth/* (better-auth CSRF check). Comma separated;
     * locally the Vite dev server (5173), the Playwright preview server (5200) and the api
     * itself. Same origin in production, so this stays a local-development list.
     */
    TRUSTED_ORIGINS: z.string().min(1),
    /**
     * The origin better-auth treats as its own. Optional: when unset, the first entry of
     * TRUSTED_ORIGINS is used. Never derived from the request, so a forged Host header
     * cannot widen the allowlist.
     */
    AUTH_BASE_URL: z.string().url().optional(),
    /** Story 11.6: `bedrock` structures readings and writes prose through Bedrock Converse; `fake` replays fixtures. */
    LLM_PROVIDER: z.enum(['fake', 'bedrock']).default('fake'),
    OCR_PROVIDER: z.enum(['fake', 'textract', 'ocr-svc']).default('fake'),
    /**
     * Story 31.2 (AD-30): the speech step of the transcription job. `fake` (the default) replays
     * fixtures; `transcribe` is Amazon Transcribe batch (Story 31.8, `speech-transcribe.ts`).
     */
    STT_PROVIDER: z.preprocess(unsetWhenEmpty, z.enum(['fake', 'transcribe']).default('fake')),
    /** Story 31.8: the region of the `transcribe` provider; it must be the files bucket's region (Transcribe reads the object from there). */
    TRANSCRIBE_REGION: z.preprocess(unsetWhenEmpty, z.string().min(1).default('us-east-1')),
    /** Story 31.8: the custom vocabulary's name (Terraform, `infra/production/transcribe.tf`); unset sends none. */
    TRANSCRIBE_VOCABULARY_NAME: z.preprocess(unsetWhenEmpty, z.string().min(1).optional()),
    /**
     * Story 11.8 follow-up: `off` refuses every reading whose pipeline needs the LLM step
     * (`readingNeedsAi`: plate, panel, caption, nc_obs) and tells the web to hide their entry
     * points; `display` (OCR only) stays. Production runs `off` until the Bedrock quota (Story 11.6).
     */
    AI_FEATURES: z.preprocess(unsetWhenEmpty, z.enum(['on', 'off']).default('on')),
    /** Story 8.3: base URL of the `services/ocr` sidecar (compose profile `ocr`), read by the `ocr-svc` provider. */
    OCR_SERVICE_URL: z.string().url().default('http://ocr:8000'),
    /** Story 11.7: the region of the `textract` provider; Textract has no `sa-east-1` endpoint. */
    TEXTRACT_REGION: z.string().min(1).default('us-east-1'),
    /** Story 11.6: the region of the `bedrock` provider's Converse calls. */
    BEDROCK_REGION: z.preprocess(unsetWhenEmpty, z.string().min(1).default('us-east-1')),
    /** Story 11.6: the structuring model (plate and panel), a model or inference-profile id; Claude Haiku 4.5 is the reference. */
    BEDROCK_MODEL_ID: z.preprocess(unsetWhenEmpty, z.string().min(1).default(DEFAULT_BEDROCK_MODEL_ID)),
    /** The panel-front model (`panel` readings); unset or empty, Qwen3 VL 235B. Name `BEDROCK_MODEL_ID` to use the plate model. */
    BEDROCK_PANEL_MODEL_ID: z.preprocess(unsetWhenEmpty, z.string().min(1).default(DEFAULT_BEDROCK_PANEL_MODEL_ID)),
    /** Story 11.6: the prose model (vision caption, NC draft); unset or empty, `BEDROCK_MODEL_ID`. */
    BEDROCK_PROSE_MODEL_ID: z.preprocess(unsetWhenEmpty, z.string().min(1).optional()),
    /**
     * Story 11.6: the model a plate reading that is more than half `verify` is read again on
     * (`shouldEscalate`). Unset, Amazon Nova Pro; an empty value disables the escalation.
     */
    BEDROCK_ESCALATION_MODEL_ID: z.string().default(DEFAULT_BEDROCK_ESCALATION_MODEL_ID),
    /** Story 4.8: `1` registers the pg-boss generate worker in this process (the compose default). */
    WORKER: z.enum(['0', '1']).default('1'),
    NODE_ENV: z.string().optional(),
    /**
     * TC-3: a fault the generate job injects at its conversion step, honoured only when
     * `NODE_ENV !== 'production'` (`main.ts` drops it otherwise). An empty value is unset.
     */
    GENERATE_FAULT: z.preprocess(unsetWhenEmpty, z.enum(['libreoffice_timeout']).optional()),
    /**
     * Security review 2026-09-30 (E11-A5): the request limits of `http/rate-limit.ts`. Unset,
     * they are on in production and off elsewhere, where the gates sign in and push far faster
     * than a person; `on` or `off` overrides that.
     */
    RATE_LIMIT: z.preprocess(unsetWhenEmpty, z.enum(['on', 'off']).optional()),
    /** Sign-in attempts per client address, and per e-mail, in one window. */
    SIGN_IN_RATE_LIMIT_MAX: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(10)),
    SIGN_IN_RATE_LIMIT_WINDOW_SECONDS: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(300)),
    /** Pushes (`POST /api/sync/ops`) per signed-in user in one window. */
    PUSH_RATE_LIMIT_MAX: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(120)),
    PUSH_RATE_LIMIT_WINDOW_SECONDS: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(60)),
    /**
     * `1`: the api sits behind one reverse proxy (Caddy) and the client address is the last
     * `X-Forwarded-For` entry; `0`: the socket address. Only the rate limits read it.
     */
    TRUST_PROXY: z.preprocess(unsetWhenEmpty, z.enum(['0', '1']).default('1')),
    /**
     * The largest body a JSON route of the api reads (the push, the generate barrier and the
     * reread); `PUT /api/files/:id` keeps its own 25 MB cap and `/api/auth/*` a 64 KiB one.
     */
    API_BODY_LIMIT_BYTES: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(16 * 1024 * 1024)),
    /**
     * Epic 18 (AD-28): where `POST /api/telemetry` writes the usage events. `stdout` (the
     * default: local, tests, the compose stack) is one `ux_event` log line per event;
     * `cloudwatch` (production, `infra/production/ecs.tf`) puts them on TELEMETRY_LOG_GROUP.
     */
    TELEMETRY_SINK: z.preprocess(unsetWhenEmpty, z.enum(['stdout', 'cloudwatch']).default('stdout')),
    TELEMETRY_LOG_GROUP: z.preprocess(unsetWhenEmpty, z.string().min(1).optional()),
    /**
     * Story 20.13: usage events per signed-in user per minute, over every device (always on). At
     * least one full batch (`TELEMETRY_BATCH_MAX`), else every full batch would be refused for good.
     */
    TELEMETRY_USER_RATE_LIMIT_MAX: z.preprocess(unsetWhenEmpty, z.coerce.number().int().min(TELEMETRY_BATCH_MAX).default(2000)),
    /**
     * Story 20.12 (security pass S6): the daily ceilings of paid AI work per company, on the
     * `America/Sao_Paulo` calendar day: readings started (rereads included) and emission audits.
     */
    READING_DAILY_QUOTA: z.preprocess(unsetWhenEmpty, z.coerce.number().int().nonnegative().default(DEFAULT_READING_DAILY_QUOTA)),
    AUDIT_DAILY_QUOTA: z.preprocess(unsetWhenEmpty, z.coerce.number().int().nonnegative().default(DEFAULT_AUDIT_DAILY_QUOTA)),
    /**
     * Story 26.6 (AD-9): where the two e-mails go. `fake` (the default: local, tests, every gate)
     * stores each message in the `fake_email` table the tests and the e2e helpers read; `ses`
     * sends through Amazon SES v2 with the SDK's default credential chain (the ECS task role, no
     * stored key; the identity is Story 26.7's).
     */
    EMAIL_PROVIDER: z.preprocess(unsetWhenEmpty, z.enum(['fake', 'ses']).default('fake')),
    /** The sender address; its display name is the product's (`EMAIL_SENDER_NAME`). A placeholder until Story 26.7. */
    EMAIL_FROM: z.preprocess(unsetWhenEmpty, z.email().default(DEFAULT_EMAIL_FROM)),
    /** The region of the `ses` provider. */
    SES_REGION: z.preprocess(unsetWhenEmpty, z.string().min(1).default('us-east-1')),
    /**
     * Story 26.6: "Esqueci minha senha" (`POST /api/auth/request-password-reset`) per e-mail address
     * in one window, and per client address in the same window; always on (not tied to RATE_LIMIT).
     */
    PASSWORD_RESET_RATE_LIMIT_MAX: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(5)),
    PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(60)),
    PASSWORD_RESET_IP_RATE_LIMIT_MAX: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(20)),
    /**
     * Story 26.8: the Admin's create, resend-invitation and password-reset routes share one window
     * per Admin; always on.
     */
    ADMIN_EMAIL_RATE_LIMIT_MAX: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(30)),
    ADMIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS: z.preprocess(unsetWhenEmpty, z.coerce.number().int().positive().default(600)),
  })
  .superRefine((config, ctx) => {
    // The compose default is public (this repository is): a production process refuses it.
    if (config.NODE_ENV === 'production' && KNOWN_DEV_SESSION_SECRETS.has(config.SESSION_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'is the public development default; production needs its own secret',
      });
    }
    // 2026-11-22 (e26r, review of Epic 26): a production process sends the two e-mails for real,
    // from a real sender. The `fake` mailer only stores them, and the placeholder sender is no
    // address anyone can answer or a mail server accepts.
    if (config.NODE_ENV === 'production' && config.EMAIL_PROVIDER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'is fake; production sends the invitation and the password reset through ses',
      });
    }
    // 2026-11-26 (e31f, review of Epic 31): with AI features on, a production process transcribes
    // the users' audios for real. The `fake` speech provider replays a fixture, so every audio would
    // land in its field as a canned sentence nobody said.
    if (config.NODE_ENV === 'production' && config.AI_FEATURES === 'on' && config.STT_PROVIDER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['STT_PROVIDER'],
        message: 'is fake; production with AI_FEATURES on transcribes audios through transcribe',
      });
    }
    if (config.NODE_ENV === 'production' && config.EMAIL_PROVIDER === 'ses' && config.EMAIL_FROM === DEFAULT_EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'is the placeholder sender; production needs the address of the verified SES identity',
      });
    }
    if (config.TELEMETRY_SINK === 'cloudwatch' && config.TELEMETRY_LOG_GROUP === undefined) {
      ctx.addIssue({ code: 'custom', path: ['TELEMETRY_LOG_GROUP'], message: 'required when TELEMETRY_SINK is cloudwatch' });
    }
    // Half a key pair is a misconfiguration, never a silent fall back to the default chain.
    const pair = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
    const [first, second] = pair.map((name) => config[name] !== undefined);
    if (first === second) return;
    const [present, missing] = first ? pair : [pair[1], pair[0]];
    ctx.addIssue({
      code: 'custom',
      path: [missing],
      message: `required when ${present} is set (static S3 keys are both or neither)`,
    });
  })
  // Story 11.6: the prose model defaults to the structuring model.
  .transform((config) => ({ ...config, BEDROCK_PROSE_MODEL_ID: config.BEDROCK_PROSE_MODEL_ID ?? config.BEDROCK_MODEL_ID }));

export type Config = z.infer<typeof configSchema>;

/**
 * The request limits `createApp` gets from the configuration (`main.ts`): absent when they
 * are off, else the sign-in and push rules and whether a proxy is trusted.
 */
export function requestLimits(
  config: Pick<
    Config,
    | 'RATE_LIMIT'
    | 'NODE_ENV'
    | 'SIGN_IN_RATE_LIMIT_MAX'
    | 'SIGN_IN_RATE_LIMIT_WINDOW_SECONDS'
    | 'PUSH_RATE_LIMIT_MAX'
    | 'PUSH_RATE_LIMIT_WINDOW_SECONDS'
    | 'TRUST_PROXY'
  >,
): { signIn: { max: number; windowMs: number }; push: { max: number; windowMs: number }; trustProxy: boolean } | undefined {
  if (!rateLimitEnabled(config)) return undefined;
  return {
    signIn: { max: config.SIGN_IN_RATE_LIMIT_MAX, windowMs: config.SIGN_IN_RATE_LIMIT_WINDOW_SECONDS * 1000 },
    push: { max: config.PUSH_RATE_LIMIT_MAX, windowMs: config.PUSH_RATE_LIMIT_WINDOW_SECONDS * 1000 },
    trustProxy: config.TRUST_PROXY === '1',
  };
}

/** A limit rule of `http/rate-limit.ts`. */
interface LimitRule {
  max: number;
  windowMs: number;
}

/**
 * Story 26.6 and 26.8: the limits of the e-mail routes, always on: "Esqueci minha senha" per
 * address and per client address, "Definir senha" per client address, and the Admin's three
 * e-mail actions per Admin.
 */
export function emailLimits(
  config: Pick<
    Config,
    | 'PASSWORD_RESET_RATE_LIMIT_MAX'
    | 'PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS'
    | 'PASSWORD_RESET_IP_RATE_LIMIT_MAX'
    | 'ADMIN_EMAIL_RATE_LIMIT_MAX'
    | 'ADMIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS'
    | 'TRUST_PROXY'
  >,
): { passwordResetEmail: LimitRule; passwordResetAddress: LimitRule; adminEmail: LimitRule; trustProxy: boolean } {
  const resetWindowMs = config.PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS * 1000;
  return {
    passwordResetEmail: { max: config.PASSWORD_RESET_RATE_LIMIT_MAX, windowMs: resetWindowMs },
    passwordResetAddress: { max: config.PASSWORD_RESET_IP_RATE_LIMIT_MAX, windowMs: resetWindowMs },
    adminEmail: { max: config.ADMIN_EMAIL_RATE_LIMIT_MAX, windowMs: config.ADMIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS * 1000 },
    trustProxy: config.TRUST_PROXY === '1',
  };
}

/** Whether the request limits run: `RATE_LIMIT` when set, else on exactly in production. */
export function rateLimitEnabled(config: Pick<Config, 'RATE_LIMIT' | 'NODE_ENV'>): boolean {
  return config.RATE_LIMIT === undefined ? config.NODE_ENV === 'production' : config.RATE_LIMIT === 'on';
}

export class ConfigError extends Error {
  readonly variables: string[];
  constructor(variables: string[], detail: string) {
    super(`Invalid configuration, offending variable(s): ${variables.join(', ')}\n${detail}`);
    this.name = 'ConfigError';
    this.variables = variables;
  }
}

/** Parse the environment; throws a ConfigError naming every missing or malformed variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env);
  if (result.success) return result.data;
  const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  const detail = result.error.issues
    .map((issue) => `  ${String(issue.path[0])}: ${issue.message}`)
    .join('\n');
  throw new ConfigError(variables, detail);
}

/** Boot-time entry: on failure names the variable(s) and exits the process. */
export function loadConfigOrExit(env: Record<string, string | undefined> = process.env): Config {
  try {
    return loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      logError(error.message, { variables: error.variables });
      process.exit(1);
    }
    throw error;
  }
}
