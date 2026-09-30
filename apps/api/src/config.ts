import { z } from 'zod';
import { logError } from './log.ts';

/**
 * The session secrets committed to this public repository (`docker-compose.yml`,
 * `.env.example`): anyone can forge a session cookie signed with one of them.
 */
export const KNOWN_DEV_SESSION_SECRETS: ReadonlySet<string> = new Set(['change-me-change-me-change-me-32ch']);

/** Compose passes an unset variable as `''` (`${VAR:-}`); an empty value is unset. */
const unsetWhenEmpty = (value: unknown) => (value === '' ? undefined : value);

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
    LLM_PROVIDER: z.enum(['fake', 'anthropic', 'bedrock']).default('fake'),
    OCR_PROVIDER: z.enum(['fake', 'textract', 'ocr-svc']).default('fake'),
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
  });

export type Config = z.infer<typeof configSchema>;

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
