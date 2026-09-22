/**
 * Structured JSON stdout logging (one line per event).
 *
 * `company_id` and `relatorio_id` are carried on every line, `null` when not
 * known: the request logger in `http/app.ts` fills `company_id` from the
 * session the middleware resolved (Story 1.3), and `relatorio_id` stays `null`
 * until the sync routes carry one. `job_id` is optional and only set by job
 * code once background jobs exist.
 */

export interface LogFields {
  company_id?: string | null;
  relatorio_id?: string | null;
  job_id?: string | null;
  [key: string]: unknown;
}

function line(level: 'info' | 'error', msg: string, fields: LogFields): string {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    // Applied after the spread so an explicit `undefined` in `fields`
    // (which JSON.stringify would otherwise drop the key for) still comes
    // out as `null` -- these three keys are always present.
    ...fields,
    company_id: fields.company_id ?? null,
    relatorio_id: fields.relatorio_id ?? null,
    job_id: fields.job_id ?? null,
  });
}

export function log(msg: string, fields: LogFields = {}): void {
  console.log(line('info', msg, fields));
}

export function logError(msg: string, fields: LogFields = {}): void {
  console.error(line('error', msg, fields));
}
