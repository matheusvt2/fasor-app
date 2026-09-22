import { z } from 'zod';
import { registrationSchema, userProfileSchema } from './registration.ts';

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

/** Error envelope of every /api route (AD-13). */
export const errorResponseSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Response of GET /api/account and of PUT /api/account/registration. */
export const accountResponseSchema = z.object({ user: userProfileSchema });

export type AccountResponse = z.infer<typeof accountResponseSchema>;

/** Body of PUT /api/account/registration (a named server action, AD-9). */
export const registrationRequestSchema = registrationSchema;

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
