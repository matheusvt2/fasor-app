import { z } from 'zod';

export const componentStatusSchema = z.enum(['up', 'down']);

/** Response of GET /api/health. */
export const healthResponseSchema = z.object({
  status: z.enum(['up', 'degraded']),
  db: componentStatusSchema,
  queue: componentStatusSchema,
  storage: componentStatusSchema,
  libreoffice: componentStatusSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
