/*
 * Story 8.4: how a reading attempt fails. A permanent error ends the job at once (one
 * attempt, `reading_status = failed`); anything else is transient and pg-boss retries it
 * until the last attempt, which ends `failed` too. Since the review of 2026-10-08 (C4, API-3)
 * these classes are the AI provider base's, shared by the reading providers and the audit.
 */

/** A failure no retry can fix: the job records it and emits `failed` without retrying. */
export class PermanentReadingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentReadingError';
  }
}

/**
 * API-V2 (review 2026-10-08): a permanent failure because the provider refused the call: the
 * caller's rights, the credentials' signature, the model id or the request shape are wrong
 * (`AccessDeniedException`, `ValidationException`, ...). Support looks at IAM and configuration,
 * not at the prompt or the answer.
 */
export class ProviderRefusedError extends PermanentReadingError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderRefusedError';
  }
}

/** Story 11.8 follow-up: the LLM step of a reading while the server's `AI_FEATURES` is `off`. */
export class AiFeaturesOffError extends PermanentReadingError {
  constructor() {
    super('the LLM step is disabled on this server (AI_FEATURES=off)');
    this.name = 'AiFeaturesOffError';
  }
}

/** A provider call that failed in a way a later attempt may not (a 5xx, a dropped connection, a fake `error`). */
export class ProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

/** A provider call that did not answer in time; transient. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export function isPermanentReadingError(error: unknown): boolean {
  return error instanceof PermanentReadingError;
}
