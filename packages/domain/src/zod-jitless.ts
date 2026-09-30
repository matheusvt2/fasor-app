import { z } from 'zod';

/**
 * Review fixes 2026-09-30 (security L11): puts zod in jitless mode. zod's JIT probes
 * `Function('')` on the first parse; under the web shell's Content Security Policy (no
 * `'unsafe-eval'`, `apps/api/src/http/security-headers.ts`) the probe is refused, zod falls
 * back to jitless anyway, and the browser reports a violation on every boot. Calling this
 * first skips the probe, with the same parsing the CSP already imposes. The web calls it
 * (`apps/web/src/zod-config.ts`); the api keeps the JIT.
 */
export function useJitlessZod(): void {
  z.config({ jitless: true });
}

/** Whether zod runs jitless (for tests). */
export function isZodJitless(): boolean {
  return z.config().jitless === true;
}
