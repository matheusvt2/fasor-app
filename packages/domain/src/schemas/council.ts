import { z } from 'zod';

/**
 * The two professional councils of CAP-6 (CREA or CRT). Kept apart from
 * `registration.ts` so the kernel `user` row schema and the registration helpers
 * can both import it without an import cycle.
 */
export const councilSchema = z.enum(['crea', 'crt']);
export type Council = z.infer<typeof councilSchema>;
