import { describe, expect, it } from 'vitest';
import { errorCodeSchema } from './errors.ts';
import { TELEMETRY_ROUTE } from './index.ts';
import { HOME_PAGE_SIZES } from '../home/cards.ts';
import { RELATORIO_STATUSES } from '../status/table.ts';
import {
  homePageSizeTarget,
  homeStatusTileTarget,
  INPUT_REFUSAL_KINDS,
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
  UX_INPUT_TARGETS,
  UX_OUTCOMES,
  uxEventSchema,
  viewportOf,
  VIEWPORTS,
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
      'input_refused',
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
      'home.status_chip_rascunho',
      'home.status_chip_em_campo',
      'home.status_chip_em_revisao',
      'home.status_chip_emitido',
      'home.page_size_10',
      'home.page_size_20',
      'home.page_size_50',
      'home.page_size_100',
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

describe('Story 18.4: how long, in what order, on what and for whom', () => {
  const bare = (() => {
    const event: Record<string, unknown> = { ...base };
    delete event.target;
    return event;
  })();

  it('carries the new closed lists', () => {
    expect(INPUT_REFUSAL_KINDS).toEqual(['not_a_number', 'not_positive', 'not_applicable', 'not_a_date', 'out_of_range', 'bad_format']);
    expect(VIEWPORTS).toEqual(['phone', 'tablet', 'desktop']);
    expect(UX_INPUT_TARGETS).toEqual([
      'ficha.number',
      'ficha.measurement',
      'ficha.reading',
      'ficha.suggestion',
      'ficha.date',
      'setup.altitude',
      'cadastros.cnpj',
      'cadastros.voltage_class',
    ]);
    for (const target of UX_INPUT_TARGETS) expect(TELEMETRY_TARGET_PATTERN.test(target)).toBe(true);
  });

  it('names the viewport by the width: below 768 phone, 768 to 1279 tablet, from 1280 desktop', () => {
    expect([0, 390, 767, 767.98, 768, 1024, 1279, 1279.5, 1280, 1920].map(viewportOf)).toEqual([
      'phone',
      'phone',
      'phone',
      'phone',
      'tablet',
      'tablet',
      'tablet',
      'tablet',
      'desktop',
      'desktop',
    ]);
  });

  it('names a target per Home status tile and per page size, each in the action list', () => {
    expect(RELATORIO_STATUSES.map(homeStatusTileTarget)).toEqual([
      'home.status_chip_rascunho',
      'home.status_chip_em_campo',
      'home.status_chip_em_revisao',
      'home.status_chip_emitido',
    ]);
    expect(HOME_PAGE_SIZES.map(homePageSizeTarget)).toEqual(['home.page_size_10', 'home.page_size_20', 'home.page_size_50', 'home.page_size_100']);
    for (const target of [...RELATORIO_STATUSES.map(homeStatusTileTarget), ...HOME_PAGE_SIZES.map(homePageSizeTarget)]) expect(UX_ACTION_TARGETS).toContain(target);
    // Old bundles still send the shared names.
    expect(parses({ ...base, screen: 'home', target: 'home.status_chip' })).toBe(true);
    expect(parses({ ...base, screen: 'home', target: 'home.page_size' })).toBe(true);
  });

  it('accepts a screen_view with its duration and the screen before it, and a session_start with the device context', () => {
    expect(parses({ ...bare, name: 'screen_view', screen: 'sumario', duration_ms: 4000, from: 'home', relatorio_id: RELATORIO })).toBe(true);
    expect(parses({ ...bare, name: 'screen_view', screen: 'home', duration_ms: 0 })).toBe(true);
    for (const viewport of VIEWPORTS) expect(parses({ ...bare, name: 'session_start', screen: 'home', viewport, standalone: false, online: true })).toBe(true);
    expect(parses({ ...bare, name: 'session_start', screen: 'login', viewport: 'phone', standalone: true, online: false })).toBe(true);
    // An old bundle's session_start carries none of them.
    expect(parses({ ...bare, name: 'session_start', screen: 'home' })).toBe(true);
    expect(parses({ ...bare, name: 'screen_view', screen: 'home' })).toBe(true);
  });

  it('accepts an input_refused with its target and kind, and the ids of where it was', () => {
    for (const kind of INPUT_REFUSAL_KINDS) expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind })).toBe(true);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.measurement', kind: 'not_positive', relatorio_id: RELATORIO, block_id: BLOCK })).toBe(true);
  });

  it('refuses each new field on any name but its own', () => {
    expect(parses({ ...base, from: 'home' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', from: 'home' })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', viewport: 'phone' })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', standalone: false })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', online: true })).toBe(false);
    expect(parses({ ...base, viewport: 'desktop' })).toBe(false);
    expect(parses({ ...bare, name: 'wait', kind: 'sync', online: false })).toBe(false);
  });

  it('refuses an input_refused without its target or kind, with an outcome, a duration or a new field, and a kind of another name', () => {
    expect(parses({ ...bare, name: 'input_refused', kind: 'not_a_number' })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number' })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind: 'not_a_number', outcome: 'refused' })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind: 'not_a_number', duration_ms: 10 })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind: 'not_a_number', from: 'home' })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind: 'not_a_number', viewport: 'phone' })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind: 'reading' })).toBe(false);
    // A refusal kind on another name.
    expect(parses({ ...bare, name: 'wait', kind: 'not_a_number' })).toBe(false);
    // Never the typed value: a target is a constant name, a kind a closed word.
    expect(parses({ ...bare, name: 'input_refused', target: 'abc 12', kind: 'not_a_number' })).toBe(false);
    expect(parses({ ...bare, name: 'input_refused', target: 'ficha.number', kind: 'abc' })).toBe(false);
  });

  it('refuses on screen_view anything but the screen, the ids, the duration and from; on session_start anything but the device context', () => {
    expect(parses({ ...bare, name: 'screen_view', target: 'home.card_open' })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', outcome: 'ok' })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', kind: 'sync' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', target: 'home.card_open' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', kind: 'sync' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', outcome: 'ok' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', duration_ms: 1 })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', relatorio_id: RELATORIO })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', block_id: BLOCK })).toBe(false);
  });

  it('refuses a new field outside its closed list or type', () => {
    expect(parses({ ...bare, name: 'session_start', viewport: 'watch' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', standalone: 'yes' })).toBe(false);
    expect(parses({ ...bare, name: 'session_start', online: 1 })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', from: 'report' })).toBe(false);
    expect(parses({ ...bare, name: 'screen_view', from: '/relatorio/x' })).toBe(false);
  });
});
