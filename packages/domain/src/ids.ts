import { z } from 'zod';

/**
 * Mints a new UUIDv7 (AD-4). The kernel never mints ids itself: every function
 * that needs one takes a NewId from the caller (TC-2).
 */
export type NewId = () => string;

export const uuidV7Schema = z.uuidv7();

export type UuidV7 = z.infer<typeof uuidV7Schema>;

/**
 * Actors are user ids or `system:{files|reading|generate|sync|identity}` (AD-3).
 * `system:identity` is provisioning (the seed CLI), which projects each identity user
 * into the company stream as a server-only `user/{id}` create.
 */
export const actorIdSchema = z.string().min(1);

/** The actor of the server-only `user/{id}` create emitted by provisioning. */
export const SYSTEM_IDENTITY_ACTOR = 'system:identity';

/** Devices are client-minted ids or the literal `server` (AD-3). */
export const deviceIdSchema = z.string().min(1);

export const SERVER_DEVICE_ID = 'server';
