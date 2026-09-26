import { z } from 'zod';
import { logError } from './log.ts';

export const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
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
  /** Story 8.3: base URL of the `services/ocr` sidecar (compose profile `ocr`), read by the `ocr-svc` provider. */
  OCR_SERVICE_URL: z.string().url().default('http://ocr:8000'),
  /** Story 4.8: `1` registers the pg-boss generate worker in this process (the compose default). */
  WORKER: z.enum(['0', '1']).default('1'),
  NODE_ENV: z.string().optional(),
  /**
   * TC-3: a fault the generate job injects at its conversion step, honoured only when
   * `NODE_ENV !== 'production'` (`main.ts` drops it otherwise). An empty value is unset.
   */
  GENERATE_FAULT: z.preprocess((value) => (value === '' ? undefined : value), z.enum(['libreoffice_timeout']).optional()),
});

export type Config = z.infer<typeof configSchema>;

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
