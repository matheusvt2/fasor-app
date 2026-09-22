import { z } from 'zod';

export const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  PORT: z.coerce.number().int().min(1).max(65535),
  SESSION_SECRET: z.string().min(32),
  LLM_PROVIDER: z.enum(['fake', 'anthropic', 'bedrock']).default('fake'),
  OCR_PROVIDER: z.enum(['fake', 'textract', 'ocr-svc']).default('fake'),
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
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
