import { z } from 'zod';
import { userProfileSchema } from '../registration.ts';

/*
 * AD-13: the typed API contract. The web calls the server only through the
 * routes defined here, with `CONTRACT_VERSION` in the `x-contract-version`
 * header; every error body is the envelope of `./errors.ts`.
 */

export * from './version.ts';
export * from './errors.ts';
export * from './sync.ts';
export * from './generate.ts';
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

/**
 * Response of GET /api/account: the signed-in user's identity, composed with the
 * registration fields of their kernel `user` entity. The registration is written only
 * as `user/{id}/{field}` ops through the sync push; there is no account write route.
 */
export const accountResponseSchema = z.object({ user: userProfileSchema });

export type AccountResponse = z.infer<typeof accountResponseSchema>;

/** A route of the contract: method and path, checked as literals. */
export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
}

/** The account route the client reads its profile through (AD-13). */
export const ACCOUNT_ROUTES = {
  read: { method: 'GET', path: '/api/account' },
} as const satisfies Record<string, ApiRoute>;
