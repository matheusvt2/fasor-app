import { APP_VERSION_PATTERN, screenOf, uxEventSchema, type Screen, type UxEvent } from '@app/domain';
import { now } from '../clock.ts';
import type { AppDatabase } from '../db/schema.ts';
import { appendUxEvents } from '../db/ux-events-store.ts';
import { newId } from '../ids.ts';

/*
 * Epic 18, Story 18.1 (AD-28): the one way the device records a usage event. `track()`
 * builds the event, checks it against the kernel schema (one that fails is dropped, so one
 * bad event never poisons a batch), and queues it in `ux_events`. It returns nothing, never
 * throws, never awaits and never writes to the console: an event is not a record, and
 * nothing the user does may wait on one or fail because of one.
 */

/** What a caller names; the rest (v, instant, ids, version) is filled here. `screen` defaults to the current route's. */
export type TrackInput = Omit<UxEvent, 'v' | 'ts' | 'session_id' | 'device_id' | 'app_version' | 'screen'> & { screen?: Screen };

/** Events tracked before the user's database and device id are known, at most this many (oldest dropped). */
export const PRE_CONFIG_BUFFER_MAX = 50;

/** A new id on every app load (Story 18.1: `session_id`). */
export const SESSION_ID: string = newId();

/** The build's commit sha (`VITE_APP_VERSION`), or `dev`; a malformed value reads as `dev` rather than dropping every event. */
export function appVersionOf(value: unknown): string {
  return typeof value === 'string' && APP_VERSION_PATTERN.test(value) ? value : 'dev';
}

const APP_VERSION = appVersionOf(import.meta.env.VITE_APP_VERSION);

export interface TelemetryTarget {
  db: AppDatabase;
  deviceId: string;
}

type Pending = Omit<UxEvent, 'device_id'>;

let target: TelemetryTarget | null = null;
let pending: Pending[] = [];
let writes: Promise<void> = Promise.resolve();

function currentScreen(): Screen {
  return typeof location === 'undefined' ? 'other' : screenOf(location.pathname);
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

function write(to: TelemetryTarget, events: readonly Pending[]): void {
  const valid: UxEvent[] = [];
  for (const event of events) {
    const full = { ...event, device_id: to.deviceId };
    if (uxEventSchema.safeParse(full).success) valid.push(full);
  }
  if (valid.length === 0) return;
  writes = writes.then(() => appendUxEvents(to.db, valid)).catch(() => undefined);
}

/**
 * Points the queue at the signed-in user's database and device (the `SyncProvider` does,
 * once the device id is read), or at nothing on sign-out. Events tracked before are queued now.
 */
export function configureTelemetry(next: TelemetryTarget | null): void {
  target = next;
  if (next === null) return;
  const held = pending;
  pending = [];
  try {
    write(next, held);
  } catch {
    // An event is never worth a failure.
  }
}

/** The database the queue writes to, or null before sign-in (the beacon path reads it). */
export function telemetryDatabase(): AppDatabase | null {
  return target?.db ?? null;
}

/** Queues one usage event. Fire and forget: never throws, never returns a promise. */
export function track(input: TrackInput): void {
  try {
    const { screen, ...rest } = input;
    const event: Pending = withoutUndefined({
      v: 1 as const,
      ts: now().toISOString(),
      session_id: SESSION_ID,
      app_version: APP_VERSION,
      screen: screen ?? currentScreen(),
      ...rest,
    });
    if (target === null) {
      pending.push(event);
      if (pending.length > PRE_CONFIG_BUFFER_MAX) pending.splice(0, pending.length - PRE_CONFIG_BUFFER_MAX);
      return;
    }
    write(target, [event]);
  } catch {
    // An event is never worth a failure.
  }
}

/** Resolves once every write tracked so far has settled (tests). */
export function whenTelemetryWritten(): Promise<void> {
  return writes;
}

/** Forgets the target and the buffer (tests). */
export function resetTelemetryForTests(): void {
  target = null;
  pending = [];
  writes = Promise.resolve();
}
