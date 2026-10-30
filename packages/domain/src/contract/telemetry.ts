import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';
import { errorCodeSchema } from './errors.ts';

/*
 * AD-28 (Epic 18): usage events. A usage event records where an engineer went, what they
 * tapped, cancelled, waited for and saw fail; it never changes the record, so it lives
 * outside the op log (no op, no `applyOp`, no status or count derives from one) and travels
 * on its own route, `TELEMETRY_ROUTE` (beside `ACCOUNT_ROUTES` in `./index.ts`).
 *
 * Every string field is from a closed list, a pattern, a uuid or an ISO instant: no free
 * text (a typed value, a caption, a TAG, a name) can pass the schema.
 */

export const UX_EVENT_NAMES = [
  'session_start',
  'screen_view',
  'action',
  'dialog_open',
  'dialog_cancel',
  'disabled_tap',
  'wait',
  'retry',
  'undo',
  'sync_result',
  'reading_result',
  'error',
] as const;
export type UxEventName = (typeof UX_EVENT_NAMES)[number];

/** The screens a route maps to (`screenOf`); ids never appear. */
export const SCREENS = [
  'login',
  'home',
  'project',
  'setup',
  'sumario',
  'ficha',
  'local',
  'photos',
  'gallery',
  // Coordinator, 2026-10-29 (o18a D5): section 8, Pontos de atenção, is a funnel step of its own.
  'points',
  'export',
  'templates',
  'composer',
  'cadastros',
  'sync',
  'account',
  'recovery',
  'update',
  'other',
] as const;
export type Screen = (typeof SCREENS)[number];

/** `kind` of a `wait`: what the engineer waited for. */
export const WAIT_KINDS = ['reading', 'sync', 'generate', 'preview', 'upload'] as const;
export type WaitKind = (typeof WAIT_KINDS)[number];

/** `kind` of a `reading_result`: which reading landed. */
export const READING_RESULT_KINDS = ['plate', 'display', 'caption', 'panel', 'nc_obs'] as const;
export type ReadingResultKind = (typeof READING_RESULT_KINDS)[number];

/** `kind` of a `sync_result`: how a sync cycle ended. */
export const SYNC_RESULT_KINDS = ['ran', 'offline', 'contract_outdated', 'unauthorized', 'failed'] as const;
export type SyncResultKind = (typeof SYNC_RESULT_KINDS)[number];

export const UX_OUTCOMES = ['ok', 'cancel', 'fail', 'refused', 'timeout', 'offline'] as const;
export type UxOutcome = (typeof UX_OUTCOMES)[number];

/** A control or dialog name, from the surface's `data-telemetry` attribute. */
export const TELEMETRY_TARGET_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/** The build's commit sha (`VITE_APP_VERSION`), or `dev` without one. */
export const APP_VERSION_PATTERN = /^(dev|[0-9a-f]{7,40})$/;

/** A batch of `POST /api/telemetry` holds at most this many events. */
export const TELEMETRY_BATCH_MAX = 200;

/** The kinds each name allows; a name absent from this table carries no `kind`. */
const KINDS_BY_NAME: Partial<Record<UxEventName, readonly string[]>> = {
  wait: WAIT_KINDS,
  reading_result: READING_RESULT_KINDS,
  sync_result: SYNC_RESULT_KINDS,
  error: errorCodeSchema.options,
};

const ALL_KINDS = [...new Set(Object.values(KINDS_BY_NAME).flat())] as [string, ...string[]];

/** The `action` targets of the minimum instrumentation (the funnel, Epic 18). */
export const UX_ACTION_TARGETS = [
  'home.card_open',
  'home.continue',
  'home.summary',
  'home.new_relatorio',
  'home.status_chip',
  'home.shortcut_templates',
  'home.shortcut_cadastros',
  'sumario.open_sheet',
  'sumario.preview',
  'sumario.generate',
  'sumario.export',
  'ficha.plate_shot',
  'ficha.read_display',
  'ficha.photo',
  'ficha.na',
  'ficha.mark_c',
  'ficha.mark_nc',
  'ficha.mark_na',
  'ficha.conclude',
  'ficha.next_sheet',
  'reading.type_instead',
  'reading.retry',
  'sync.now',
  // Story 19.2: the Home list's page-size chips (10 · 20 · 50 · 100).
  'home.page_size',
] as const;
export type UxActionTarget = (typeof UX_ACTION_TARGETS)[number];

/** The dialogs whose `dialog_open` and `dialog_cancel` are tracked, by `target`. */
export const UX_DIALOG_TARGETS = ['capture_sheet', 'move_block', 'rename_tag', 'export', 'not_tested', 'conflict'] as const;
export type UxDialogTarget = (typeof UX_DIALOG_TARGETS)[number];

/** One usage event as the device builds and sends it; strict, so an unknown key is refused. */
export const uxEventSchema = z
  .strictObject({
    v: z.literal(1),
    ts: z.iso.datetime(),
    session_id: z.uuid(),
    device_id: z.uuid(),
    app_version: z.string().regex(APP_VERSION_PATTERN),
    name: z.enum(UX_EVENT_NAMES),
    screen: z.enum(SCREENS),
    target: z.string().regex(TELEMETRY_TARGET_PATTERN).optional(),
    kind: z.enum(ALL_KINDS).optional(),
    outcome: z.enum(UX_OUTCOMES).optional(),
    duration_ms: z.number().int().nonnegative().optional(),
    relatorio_id: uuidV7Schema.optional(),
    block_id: uuidV7Schema.optional(),
  })
  .superRefine((event, ctx) => {
    if (event.kind === undefined) return;
    const allowed = KINDS_BY_NAME[event.name];
    if (allowed === undefined || !allowed.includes(event.kind)) {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: `kind ${event.kind} is not one of ${event.name}'s` });
    }
  });
export type UxEvent = z.infer<typeof uxEventSchema>;

/** The body of `POST /api/telemetry`: an array of at most `TELEMETRY_BATCH_MAX` events. */
export const telemetryBatchSchema = z.array(uxEventSchema).max(TELEMETRY_BATCH_MAX);

/** The keys the api stamps from its clock and the session; a device never sends them. */
export const TELEMETRY_SERVER_KEYS = ['received_at', 'user_id', 'company_id'] as const;

/** An event as the sink writes it: the device's event plus the server's stamps. */
export interface StampedUxEvent extends UxEvent {
  received_at: string;
  user_id: string;
  company_id: string;
}

/** What the device knows of a finished sync cycle: the 426 flag and the failure that ended a phase. */
export interface SyncCycleEnd {
  outdated: boolean;
  failure: { kind: 'network' | 'http' | 'apply'; status?: number } | null;
}

/** The `kind` of the `sync_result` of a cycle that ran (an offline cycle is `offline`, tracked apart). */
export function syncResultKind(end: SyncCycleEnd): SyncResultKind {
  if (end.outdated || (end.failure?.kind === 'http' && end.failure.status === 426)) return 'contract_outdated';
  if (end.failure === null) return 'ran';
  if (end.failure.kind === 'http' && end.failure.status === 401) return 'unauthorized';
  return 'failed';
}

const ID = '[^/]+';
const SCREEN_ROUTES: readonly (readonly [RegExp, Screen])[] = [
  [/^\/$/, 'home'],
  [/^\/login$/, 'login'],
  [new RegExp(`^/project/${ID}$`), 'project'],
  [new RegExp(`^/relatorio/${ID}(/arvore)?$`), 'sumario'],
  [new RegExp(`^/relatorio/${ID}/setup$`), 'setup'],
  [new RegExp(`^/relatorio/${ID}/ficha/${ID}$`), 'ficha'],
  [new RegExp(`^/relatorio/${ID}/local/${ID}/verificacoes$`), 'local'],
  [new RegExp(`^/relatorio/${ID}/fotos$`), 'gallery'],
  [new RegExp(`^/relatorio/${ID}/pontos$`), 'points'],
  [/^\/templates$/, 'templates'],
  [new RegExp(`^/templates/${ID}$`), 'composer'],
  [/^\/cadastros$/, 'cadastros'],
  [/^\/sync$/, 'sync'],
  [/^\/account$/, 'account'],
];

/** The screen a route shows; anything unknown (section text included) is `other`. */
export function screenOf(pathname: string): Screen {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  for (const [pattern, screen] of SCREEN_ROUTES) if (pattern.test(path)) return screen;
  return 'other';
}
