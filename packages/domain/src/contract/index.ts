import { z } from 'zod';
import { registrationSchema, userProfileSchema } from '../registration.ts';

/*
 * AD-13: the typed API contract. The web calls the server only through the
 * routes defined here, with `CONTRACT_VERSION` in the `x-contract-version`
 * header; every error body is the envelope of `./errors.ts`.
 */

export * from './version.ts';
export * from './errors.ts';
export * from './sync.ts';
export * from './examples.ts';

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

/** Response of GET /api/account and of PUT /api/account/registration. */
export const accountResponseSchema = z.object({ user: userProfileSchema });

export type AccountResponse = z.infer<typeof accountResponseSchema>;

/** Body of PUT /api/account/registration (a named server action, AD-9). */
export const registrationRequestSchema = registrationSchema;

export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
