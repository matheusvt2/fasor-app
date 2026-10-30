import { describe, expect, it } from 'vitest';
import { errorCodeSchema } from './errors.ts';
import { TELEMETRY_ROUTE } from './index.ts';
import {
  READING_RESULT_KINDS,
  SCREENS,
  screenOf,
  SYNC_RESULT_KINDS,
  TELEMETRY_BATCH_MAX,
  syncResultKind,
  TELEMETRY_TARGET_PATTERN,
  telemetryBatchSchema,
  UX_ACTION_TARGETS,
  UX_DIALOG_TARGETS,
  UX_EVENT_NAMES,
  UX_OUTCOMES,
  uxEventSchema,
  WAIT_KINDS,
} from './telemetry.ts';

const RELATORIO = '019966c1-0000-7000-8000-000000000007';
const BLOCK = '019966c1-0000-7000-8000-000000000008';

const base = {
  v: 1,
  ts: '2026-10-29T12:00:00.000Z',
  session_id: '019966c1-0000-7000-8000-0000000000aa',
  device_id: '019966c1-0000-7000-8000-0000000000bb',
  app_version: 'dev',
  name: 'action',
  screen: 'ficha',
  target: 'ficha.mark_c',
} as const;

const parses = (event: Record<string, unknown>) => uxEventSchema.safeParse(event).success;

describe('usage events contract (Epic 18, AD-28)', () => {
  it('names the route and the batch limit', () => {
    expect(TELEMETRY_ROUTE).toEqual({ method: 'POST', path: '/api/telemetry' });
    expect(TELEMETRY_BATCH_MAX).toBe(200);
  });

  it('carries the epic vocabulary', () => {
    expect(UX_EVENT_NAMES).toEqual([
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
    ]);
    expect(SCREENS).toEqual([
      'login',
      'home',
      'project',
      'setup',
      'sumario',
      'ficha',
      'local',
      'photos',
      'gallery',
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
    ]);
    expect(WAIT_KINDS).toEqual(['reading', 'sync', 'generate', 'preview', 'upload']);
    expect(READING_RESULT_KINDS).toEqual(['plate', 'display', 'caption', 'panel', 'nc_obs']);
    expect(SYNC_RESULT_KINDS).toEqual(['ran', 'offline', 'contract_outdated', 'unauthorized', 'failed']);
    expect(UX_OUTCOMES).toEqual(['ok', 'cancel', 'fail', 'refused', 'timeout', 'offline']);
  });

  it('accepts the epic shape: every optional field, and the bare minimum', () => {
    expect(parses(base)).toBe(true);
    const bare: Omit<typeof base, 'target'> & { target?: string } = { ...base };
    delete bare.target;
    expect(parses({ ...bare, name: 'session_start', screen: 'home' })).toBe(true);
    expect(parses({ ...bare, name: 'screen_view', relatorio_id: RELATORIO, block_id: BLOCK })).toBe(true);
    expect(parses({ ...bare, name: 'wait', kind: 'reading', outcome: 'ok', duration_ms: 0, relatorio_id: RELATORIO, block_id: BLOCK })).toBe(true);
    expect(parses({ ...bare, name: 'wait', kind: 'generate', outcome: 'timeout', duration_ms: 12_345 })).toBe(true);
    expect(parses({ ...bare, name: 'reading_result', kind: 'nc_obs', outcome: 'fail' })).toBe(true);
    expect(parses({ ...bare, name: 'sync_result', kind: 'contract_outdated' })).toBe(true);
    expect(parses({ ...bare, name: 'error', kind: 'reading_running' })).toBe(true);
    expect(parses({ ...bare, name: 'dialog_cancel', target: 'capture_sheet' })).toBe(true);
    expect(parses({ ...base, app_version: '87ff8a9d' })).toBe(true);
    expect(parses({ ...base, app_version: '87ff8a9d1c2b3a4d5e6f708192a3b4c5d6e7f809' })).toBe(true);
    for (const code of errorCodeSchema.options) expect(parses({ ...bare, name: 'error', kind: code })).toBe(true);
  });

  it('refuses an unknown key, and the server-stamped keys in a device event', () => {
    expect(parses({ ...base, extra: 1 })).toBe(false);
    expect(parses({ ...base, user_id: RELATORIO })).toBe(false);
    expect(parses({ ...base, company_id: RELATORIO })).toBe(false);
    expect(parses({ ...base, received_at: base.ts })).toBe(false);
  });

  it('refuses an unknown name, screen, kind or outcome', () => {
    expect(parses({ ...base, name: 'click' })).toBe(false);
    expect(parses({ ...base, screen: 'report' })).toBe(false);
    expect(parses({ ...base, name: 'wait', kind: 'download' })).toBe(false);
    expect(parses({ ...base, name: 'wait', kind: 'plate' })).toBe(false);
    expect(parses({ ...base, name: 'reading_result', kind: 'reading' })).toBe(false);
    expect(parses({ ...base, name: 'sync_result', kind: 'ok' })).toBe(false);
    expect(parses({ ...base, name: 'error', kind: 'duplicate_tag' })).toBe(false);
    // A name without subtypes carries no kind at all.
    expect(parses({ ...base, kind: 'reading' })).toBe(false);
    expect(parses({ ...base, outcome: 'done' })).toBe(false);
  });

  it('refuses a target outside its pattern', () => {
    expect(TELEMETRY_TARGET_PATTERN.test('home.card_open')).toBe(true);
    for (const target of ['', 'Home.card', '.home', '-x', 'ficha mark', 'a/b', 'x'.repeat(65), 'TR-01', 'Transformador 1', 'ficha.mark_c\n']) {
      expect(parses({ ...base, target })).toBe(false);
    }
    expect(parses({ ...base, target: 'x'.repeat(64) })).toBe(true);
  });

  it('refuses a negative or fractional duration_ms', () => {
    expect(parses({ ...base, name: 'wait', kind: 'sync', duration_ms: -1 })).toBe(false);
    expect(parses({ ...base, name: 'wait', kind: 'sync', duration_ms: 1.5 })).toBe(false);
    expect(parses({ ...base, name: 'wait', kind: 'sync', duration_ms: '10' })).toBe(false);
  });

  it('refuses free text in every string field', () => {
    const text = 'Transformador da cabine 1';
    expect(parses({ ...base, v: 2 })).toBe(false);
    expect(parses({ ...base, ts: text })).toBe(false);
    expect(parses({ ...base, ts: '2026-10-29' })).toBe(false);
    expect(parses({ ...base, session_id: text })).toBe(false);
    expect(parses({ ...base, device_id: text })).toBe(false);
    expect(parses({ ...base, app_version: text })).toBe(false);
    expect(parses({ ...base, app_version: 'v1.2.3' })).toBe(false);
    expect(parses({ ...base, app_version: '87ff8a' })).toBe(false);
    expect(parses({ ...base, relatorio_id: text })).toBe(false);
    expect(parses({ ...base, block_id: text })).toBe(false);
    // A uuid that is not v7 is not a kernel id.
    expect(parses({ ...base, relatorio_id: '019966c1-0000-4000-8000-000000000007' })).toBe(false);
    expect(parses({ ...base, name: 'error', kind: text })).toBe(false);
    expect(parses({ ...base, outcome: text })).toBe(false);
  });

  it('caps a batch at 200 events and refuses a non-array', () => {
    expect(telemetryBatchSchema.safeParse([]).success).toBe(true);
    expect(telemetryBatchSchema.safeParse(Array(TELEMETRY_BATCH_MAX).fill(base)).success).toBe(true);
    expect(telemetryBatchSchema.safeParse(Array(TELEMETRY_BATCH_MAX + 1).fill(base)).success).toBe(false);
    expect(telemetryBatchSchema.safeParse({}).success).toBe(false);
    expect(telemetryBatchSchema.safeParse([base, { ...base, name: 'nope' }]).success).toBe(false);
  });

  it('maps a route to its screen, never to an id', () => {
    const cases: [string, string][] = [
      ['/', 'home'],
      ['/login', 'login'],
      [`/project/${RELATORIO}`, 'project'],
      [`/relatorio/${RELATORIO}`, 'sumario'],
      [`/relatorio/${RELATORIO}/`, 'sumario'],
      [`/relatorio/${RELATORIO}/arvore`, 'sumario'],
      [`/relatorio/${RELATORIO}/setup`, 'setup'],
      [`/relatorio/${RELATORIO}/ficha/${BLOCK}`, 'ficha'],
      [`/relatorio/${RELATORIO}/local/${BLOCK}/verificacoes`, 'local'],
      [`/relatorio/${RELATORIO}/fotos`, 'gallery'],
      [`/relatorio/${RELATORIO}/pontos`, 'points'],
      [`/relatorio/${RELATORIO}/secao/${BLOCK}`, 'other'],
      ['/templates', 'templates'],
      [`/templates/${BLOCK}`, 'composer'],
      ['/cadastros', 'cadastros'],
      ['/sync', 'sync'],
      ['/account', 'account'],
      ['/nowhere', 'other'],
      [`/relatorio/${RELATORIO}/ficha`, 'other'],
      ['/relatorio', 'other'],
      ['', 'other'],
    ];
    for (const [pathname, screen] of cases) expect([pathname, screenOf(pathname)]).toEqual([pathname, screen]);
    for (const [pathname] of cases) expect(SCREENS).toContain(screenOf(pathname));
  });

  it('names the minimum instrumentation: every action and dialog target fits the pattern', () => {
    expect(UX_ACTION_TARGETS).toEqual([
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
      'home.page_size',
    ]);
    expect(UX_DIALOG_TARGETS).toEqual(['capture_sheet', 'move_block', 'rename_tag', 'export', 'not_tested', 'conflict']);
    for (const target of [...UX_ACTION_TARGETS, ...UX_DIALOG_TARGETS]) expect(TELEMETRY_TARGET_PATTERN.test(target)).toBe(true);
  });

  it('says how a finished sync cycle ended', () => {
    expect(syncResultKind({ outdated: false, failure: null })).toBe('ran');
    expect(syncResultKind({ outdated: true, failure: null })).toBe('contract_outdated');
    expect(syncResultKind({ outdated: false, failure: { kind: 'http', status: 426 } })).toBe('contract_outdated');
    expect(syncResultKind({ outdated: false, failure: { kind: 'http', status: 401 } })).toBe('unauthorized');
    expect(syncResultKind({ outdated: false, failure: { kind: 'http', status: 503 } })).toBe('failed');
    expect(syncResultKind({ outdated: false, failure: { kind: 'network' } })).toBe('failed');
    expect(syncResultKind({ outdated: false, failure: { kind: 'apply' } })).toBe('failed');
  });
});
