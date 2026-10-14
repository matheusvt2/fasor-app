import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { locationChecklistPath, locationFieldPath } from '../ops/path.ts';
import { contextCaption, siteCaption, type ContextCaptionMeta } from '../photos/caption.ts';
import { galleryCabineOptions, photoCabineId, photoItemLine, photoSiteLocal } from '../photos/gallery.ts';
import { ncRowPointPositions, ncRowPointsText, newPointRow } from '../points/checks.ts';
import { photoToken } from '../points/refs.ts';
import { pointsSummary, pointTitle, POINT_TITLE_GENERAL, sectionEightEntries } from '../points/summary.ts';
import { section7Photos } from '../print/section-7.ts';
import { resolveActionPlan, resolveSection8 } from '../print/section-8.ts';
import { numberPhotos } from '../photos/numbering.ts';
import { SITE_ITEM_KEYS } from '../schemas/block-config.ts';
import { relatorioRowSchema, type FileRow, type LocationRow, type PointRow, type RelatorioRow } from '../schemas/entities.ts';
import { buildSnapshot, createSnapshotBuilder, serializeSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { siteItems } from '../seed/definitions.ts';
import { opFactory, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { preIssue, preIssueRowsFor, blockingRows } from './pre-issue.ts';
import {
  localIssuedBannerText,
  recentSiteObservations,
  SITE_CHECKLIST_LABEL,
  siteChecklistProgress,
  siteChecklistView,
  siteCounterText,
  siteFirstUnanswered,
  siteHeaderMeta,
  siteHeaderTitle,
  siteLocals,
  siteMissingText,
  siteObservationOf,
  sitePointTitle,
  siteProgressState,
  siteRailMetaText,
  siteResultOf,
  siteRowText,
  siteUnanswered,
  siteUnansweredText,
  siteUnsetItems,
} from './site-checklist.ts';
import { fichaIssuedBannerText } from './status-advance.ts';
import { statusStepText } from './sumario.ts';
import { locationTree, treeNodes, type TreeLocationNode } from './tree.ts';

/*
 * Stories 14.3 and 14.4, group 2: the kernel readers of a local's site checklist. Every
 * state is folded from real `location/{id}/checklist/...` ops (`applyOp`), then read through
 * `buildSnapshot`, as the device and the server read it. One describe per reader; the spec's
 * I/O matrix rows are named where a test answers one.
 */

const ENEL = '019966b0-0143-7000-8000-000000000001';
const SUBSOLO = '019966b0-0143-7000-8000-000000000002';
const PAINEL = '019966b0-0143-7000-8000-000000000003';
const COLUNA = '019966b0-0143-7000-8000-000000000004';
const PHOTO = '019966b0-0143-7000-8000-000000000005';
const POINT = '019966b0-0143-7000-8000-000000000006';
const OTHER_PHOTO = '019966b0-0143-7000-8000-000000000007';
const BLOCK = '019966b0-0143-7000-8000-000000000008';

const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
const EXTINTOR = 'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido';
const EPI = 'epi_disponivel';

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

const cabine = (id: string, name: string, orderKey: string, over: Partial<Cabine> = {}): Cabine => ({
  id,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name,
  order_key: orderKey,
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  removed_at: null,
  ...over,
});
const painel = (): LocationRow => ({ id: PAINEL, relatorio_id: TEST_RELATORIO, parent_id: SUBSOLO, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0', removed_at: null });
const coluna = (): LocationRow => ({ id: COLUNA, relatorio_id: TEST_RELATORIO, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 1', order_key: 'a0', removed_at: null });

const relatorio = (seedVersion: string, status: RelatorioRow['status'] = 'rascunho'): RelatorioRow =>
  relatorioRowSchema.parse({
    id: TEST_RELATORIO,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: seedVersion,
    status,
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  });

/** Cubículo Enel (Entrada) and 1° Subsolo (Primária, with a painel and a coluna), on `seedVersion`. */
function baseState(seedVersion = 'v4'): EntityState {
  const rows: [string, unknown][] = [
    [entityKey('relatorio', TEST_RELATORIO), relatorio(seedVersion)],
    [entityKey('location', ENEL), cabine(ENEL, 'Cubículo Enel', 'a0', { funcao: 'entrada' })],
    [entityKey('location', SUBSOLO), cabine(SUBSOLO, '1° Subsolo', 'a1', { funcao: 'primaria' })],
    [entityKey('location', PAINEL), painel()],
    [entityKey('location', COLUNA), coluna()],
  ];
  return new Map(rows as never);
}

const fold = (state: EntityState, ops: readonly Op[]): EntityState => ops.reduce((s, op) => applyOp(s, op), state);
const snapshotOf = (state: EntityState): RelatorioSnapshot => buildSnapshot(state, TEST_RELATORIO);

/** The mock's state of `61-verificacoes-local.html`: 12 of 19 answered, by group 5/7, 2/2, 2/2, 2/2, 1/3, 0/3; item 11 NC, items 9 and 13 NA. */
const MOCK_ANSWERS: Readonly<Record<number, 'C' | 'NC' | 'NA'>> = { 1: 'C', 2: 'C', 3: 'C', 4: 'C', 5: 'C', 8: 'C', 9: 'NA', 10: 'C', 11: 'NC', 12: 'C', 13: 'NA', 14: 'C' };

function mockOps(locationId: string, f = opFactory()): Op[] {
  const items = siteItems('v4');
  const ops = Object.entries(MOCK_ANSWERS).map(([n, value]) => f.op({ path: locationChecklistPath(locationId, items[Number(n) - 1]!.key, 'result'), value }));
  ops.push(f.op({ path: locationChecklistPath(locationId, EMERGENCIA, 'observation'), value: ' Duas luminárias de emergência sem carga ' }));
  ops.push(f.op({ path: locationChecklistPath(locationId, EXTINTOR, 'observation'), value: 'CO2 6 kg dentro da sala, validade 03/2027' }));
  return ops;
}

const mockSnapshot = (): RelatorioSnapshot => snapshotOf(fold(baseState(), mockOps(SUBSOLO)));

const sitePhoto = (over: Partial<FileRow & { kind: 'photo' }> = {}): FileRow => ({
  id: PHOTO,
  company_id: TEST_COMPANY,
  relatorio_id: TEST_RELATORIO,
  kind: 'photo',
  sha256: 'c'.repeat(64),
  mime: 'image/jpeg',
  size: 10,
  uploaded_at: null,
  variants: null,
  removed_at: null,
  captured_at: '2026-09-21T12:00:00.000Z',
  tz_offset: -180,
  coords: null,
  local_seq: 1,
  block_id: null,
  item_key: EMERGENCIA,
  caption: null,
  reading_kind: null,
  reading_target: null,
  reading_status: 'none',
  people_in_photo: false,
  location_id: SUBSOLO,
  ...over,
});

const sitePoint = (over: Partial<PointRow> = {}): PointRow => ({
  ...newPointRow({ id: POINT, relatorioId: TEST_RELATORIO, text: `Luminária de emergência inoperante ${photoToken(PHOTO)}`, equipmentId: null, origin: 'manual', action: null, locationId: SUBSOLO }, []),
  ...over,
});

const withRows = (state: EntityState, rows: [string, unknown][]): EntityState => new Map([...state, ...rows] as never);

describe('14.3 siteChecklistView: who has a site checklist', () => {
  it('a live root cabine of a v4 relatório has one: six groups of 7, 2, 2, 2, 3, 3, the 19 items numbered across them, all unanswered at first', () => {
    const view = siteChecklistView(snapshotOf(baseState()), ENEL)!;
    expect(view.groups.map((group) => [group.label, group.rows.length, group.counterText])).toEqual([
      ['Segurança e EPC no local', 7, '0 de 7'],
      ['Combate a incêndio', 2, '0 de 2'],
      ['Iluminação', 2, '0 de 2'],
      ['Aterramento', 2, '0 de 2'],
      ['Sinalização e documentação', 3, '0 de 3'],
      ['Ambiente', 3, '0 de 3'],
    ]);
    const rows = view.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.number)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(rows.map((row) => row.key)).toEqual([...SITE_ITEM_KEYS]);
    expect(rows.every((row) => row.result === null && row.observation === null && row.nc_phrases.length >= 3)).toBe(true);
    expect(rows[10]).toMatchObject({ number: 11, label: 'Iluminação de emergência (autonomia mínima de 2 h)', nc_phrases: ['Luminária de emergência inoperante', 'Autonomia abaixo de 2 h', 'Sem iluminação de emergência'] });
    expect(view).toMatchObject({ locationId: ENEL, name: 'Cubículo Enel', funcao: 'entrada', title: 'Verificações do local — Cubículo Enel', meta: 'Função: Entrada', answered: 0, total: 19, counterText: '0 de 19', state: 'pending', latestOpId: null });
  });

  it('a painel, a coluna, an unknown id and a removed local have none', () => {
    const snapshot = snapshotOf(baseState());
    for (const id of [PAINEL, COLUNA, POINT]) {
      expect(siteChecklistView(snapshot, id)).toBeNull();
      expect(siteChecklistProgress(snapshot, id)).toBeNull();
      expect(siteMissingText(snapshot, id)).toBeNull();
    }
    const f = opFactory();
    const removed = snapshotOf(fold(baseState(), [f.op({ path: locationFieldPath(ENEL, 'removed_at'), value: '2026-09-21T13:00:00.000Z' })]));
    expect(siteChecklistView(removed, ENEL)).toBeNull();
    expect(siteLocals(removed).map((row) => row.id)).toEqual([SUBSOLO]);
  });

  it('a relatório on v1, v2 or v3 has none on any local, and nothing is counted or named for it', () => {
    for (const version of ['v1', 'v2', 'v3', 'v99']) {
      const snapshot = snapshotOf(baseState(version));
      expect(siteLocals(snapshot)).toEqual([]);
      expect(siteChecklistView(snapshot, ENEL)).toBeNull();
      expect(siteChecklistProgress(snapshot, ENEL)).toBeNull();
      expect(siteUnanswered(snapshot)).toEqual([]);
      expect(siteFirstUnanswered(snapshot, ENEL)).toBeNull();
      expect(recentSiteObservations(snapshot, EMERGENCIA)).toEqual([]);
    }
  });

  it('a cabine whose parent is not live is a local (drawn as a root); one under a live parent is not', () => {
    const nested = cabine(COLUNA, 'Cabine interna', 'a0', { parent_id: ENEL });
    const state = withRows(baseState(), [[entityKey('location', COLUNA), nested]]);
    expect(siteLocals(snapshotOf(state)).map((row) => row.id)).toEqual([ENEL, SUBSOLO]);
    const orphan = withRows(baseState(), [[entityKey('location', COLUNA), { ...nested, parent_id: POINT }]]);
    expect(siteLocals(snapshotOf(orphan)).map((row) => row.id)).toContain(COLUNA);
  });
});

describe('14.3 the counters and texts of a local, on the mock state (12 of 19)', () => {
  const snapshot = mockSnapshot();
  const view = siteChecklistView(snapshot, SUBSOLO)!;

  it('counts an item as answered once its result is C, NC or NA; the groups read 5/7, 2/2, 2/2, 2/2, 1/3, 0/3', () => {
    expect(view.groups.map((group) => group.counterText)).toEqual(['5 de 7', '2 de 2', '2 de 2', '2 de 2', '1 de 3', '0 de 3']);
    expect(view).toMatchObject({ answered: 12, total: 19, counterText: '12 de 19', state: 'pending' });
    expect(siteChecklistProgress(snapshot, SUBSOLO)).toEqual({ answered: 12, total: 19 });
    // The other local is untouched: items are answered per local.
    expect(siteChecklistProgress(snapshot, ENEL)).toEqual({ answered: 0, total: 19 });
  });

  it('gives each row its result and its trimmed observation', () => {
    const rows = view.groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.number === 11)).toMatchObject({ result: 'NC', observation: 'Duas luminárias de emergência sem carga' });
    expect(rows.find((row) => row.number === 8)).toMatchObject({ result: 'C', observation: 'CO2 6 kg dentro da sala, validade 03/2027' });
    expect(rows.find((row) => row.number === 9)).toMatchObject({ result: 'NA', observation: null });
    expect(rows.find((row) => row.number === 6)).toMatchObject({ result: null, observation: null });
    const local = snapshot.locations.find((row) => row.id === SUBSOLO) as Cabine;
    expect(siteResultOf(local, EMERGENCIA)).toBe('NC');
    expect(siteResultOf(local, EPI)).toBeNull();
    expect(siteObservationOf(local, EPI)).toBeNull();
  });

  it('names the latest op of the checklist, for the attribution line', () => {
    const ops = mockOps(SUBSOLO);
    expect(view.latestOpId).toBe(ops.at(-1)!.op_id);
  });

  it('writes the counter, the Sumário row, the rail meta and the header from one place', () => {
    expect(siteCounterText(view)).toBe('12 de 19');
    expect(siteRowText(view)).toBe('Verificações do local · 12 de 19');
    expect(siteRailMetaText(19)).toBe('19 itens · uma vez por local');
    expect(siteHeaderTitle(' 1° Subsolo ')).toBe('Verificações do local — 1° Subsolo');
    expect(view.title).toBe('Verificações do local — 1° Subsolo');
    expect(view.meta).toBe('Função: Primária');
    expect(siteHeaderMeta('Medição')).toBe('Função: Medição');
    expect(siteHeaderMeta(null)).toBeNull();
    expect(siteHeaderMeta('  ')).toBeNull();
    expect(siteProgressState({ answered: 19, total: 19 })).toBe('complete');
    expect(siteProgressState({ answered: 18, total: 19 })).toBe('pending');
    expect(SITE_CHECKLIST_LABEL).toBe('Verificações do local');
  });

  it('matrix "Mark the rest": the unset items are the seven unanswered ones, in order; an answered item (NC and NA included) is never touched', () => {
    const local = snapshot.locations.find((row) => row.id === SUBSOLO) as Cabine;
    const unset = siteUnsetItems(local, 'v4');
    expect(unset.map((key) => siteItems('v4').find((item) => item.key === key)!.number)).toEqual([6, 7, 15, 16, 17, 18, 19]);
    expect(siteUnsetItems(local, 'v3')).toEqual([]);
    // Marking them Conforme completes the local.
    const f = opFactory(new Date('2026-09-22T12:00:00.000Z'));
    const done = snapshotOf(fold(fold(baseState(), mockOps(SUBSOLO)), unset.map((key) => f.op({ path: locationChecklistPath(SUBSOLO, key, 'result'), value: 'C', batch_id: null }))));
    expect(siteChecklistView(done, SUBSOLO)).toMatchObject({ answered: 19, counterText: '19 de 19', state: 'complete' });
    expect(siteUnsetItems(done.locations.find((row) => row.id === SUBSOLO) as Cabine, 'v4')).toEqual([]);
    expect(siteMissingText(done, SUBSOLO)).toBeNull();
    expect(siteFirstUnanswered(done, SUBSOLO)).toBeNull();
  });

  it('"Concluir verificações" names what is missing: the mock sentence, its singular, null when nothing is', () => {
    expect(siteMissingText(snapshot, SUBSOLO)).toBe('7 itens sem resposta — o primeiro é o item 6, EPI disponível');
    expect(siteFirstUnanswered(snapshot, SUBSOLO)).toMatchObject({ number: 6, key: EPI });
    const f = opFactory(new Date('2026-09-22T12:00:00.000Z'));
    const allButLast = SITE_ITEM_KEYS.slice(0, -1).map((key) => f.op({ path: locationChecklistPath(ENEL, key, 'result'), value: 'C' }));
    expect(siteMissingText(snapshotOf(fold(baseState(), allButLast)), ENEL)).toBe('1 item sem resposta — é o item 19, Limpeza e ausência de infiltração');
  });

  it('an answer cleared back to null is unanswered again (the undo of a put), and its cell stays on the row', () => {
    const f = opFactory();
    const c = f.op({ path: locationChecklistPath(ENEL, EPI, 'result'), value: 'C' });
    const cleared = f.op({ path: locationChecklistPath(ENEL, EPI, 'result'), value: null, prev_op_id: c.op_id });
    const snapshot2 = snapshotOf(fold(baseState(), [c, cleared]));
    expect(siteChecklistProgress(snapshot2, ENEL)).toEqual({ answered: 0, total: 19 });
    expect((snapshot2.locations.find((row) => row.id === ENEL) as Cabine).checklist![EPI]!.result!.op_id).toBe(cleared.op_id);
  });
});

describe('14.3 recentSiteObservations: the same item on the other locals', () => {
  it('offers the other locals observations of that item, newest first, without repeats, without the seeded phrases and never the current local own', () => {
    const f = opFactory();
    const state = fold(baseState(), [
      f.op({ path: locationChecklistPath(ENEL, EMERGENCIA, 'observation'), value: 'Autonomia abaixo de 2 h' }),
      f.op({ path: locationChecklistPath(SUBSOLO, EMERGENCIA, 'observation'), value: 'Bloco autônomo sem bateria' }),
      f.op({ path: locationChecklistPath(SUBSOLO, EXTINTOR, 'observation'), value: 'PQS ABC 6 kg' }),
    ]);
    const snapshot = snapshotOf(state);
    const seeded = siteItems('v4').find((item) => item.key === EMERGENCIA)!.nc_phrases;
    expect(recentSiteObservations(snapshot, EMERGENCIA, seeded, ENEL)).toEqual(['Bloco autônomo sem bateria']);
    // From the other side the Enel text is a seeded phrase: nothing to add.
    expect(recentSiteObservations(snapshot, EMERGENCIA, seeded, SUBSOLO)).toEqual([]);
    expect(recentSiteObservations(snapshot, EMERGENCIA, [], SUBSOLO)).toEqual(['Autonomia abaixo de 2 h']);
    expect(recentSiteObservations(snapshot, EMERGENCIA)).toEqual(['Bloco autônomo sem bateria', 'Autonomia abaixo de 2 h']);
    expect(recentSiteObservations(snapshot, EPI, [], ENEL)).toEqual([]);
  });
});

describe('14.3 localIssuedBannerText: the sheet sentence with "estas verificações"', () => {
  it('reads on an Emitido relatório with a revision, and nowhere else', () => {
    expect(localIssuedBannerText('emitido', { number: 2 })).toBe('Relatório emitido (revisão 2). Editar estas verificações reabre o relatório como Em revisão e gera a revisão 3.');
    expect(localIssuedBannerText('emitido', { number: 2 })).toBe(fichaIssuedBannerText('emitido', { number: 2 })!.replace('esta ficha', 'estas verificações'));
    expect(localIssuedBannerText('emitido', null)).toBeNull();
    for (const status of ['rascunho', 'em_campo', 'em_revisao'] as const) expect(localIssuedBannerText(status, { number: 2 })).toBeNull();
  });
});

describe('14.3 the tree: a local node carries its site checklist', () => {
  const nodes = (snapshot: RelatorioSnapshot): TreeLocationNode[] => treeNodes(locationTree(snapshot)).filter((node): node is TreeLocationNode => node.kind !== 'equipment');
  const siteOf = (snapshot: RelatorioSnapshot, id: string) => nodes(snapshot).find((node) => node.id === id)!.site;

  it('the local row shows "Verificações do local · N de 19", its rail counter and meta, and its state; a painel and a coluna show none', () => {
    const snapshot = mockSnapshot();
    expect(siteOf(snapshot, SUBSOLO)).toEqual({
      answered: 12,
      total: 19,
      text: 'Verificações do local · 12 de 19',
      railCounter: '12 de 19',
      railMeta: '19 itens · uma vez por local',
      state: 'pending',
      railStateAttr: 'em-preenchimento',
      glyph: '●',
    });
    expect(siteOf(snapshot, ENEL)).toMatchObject({ answered: 0, text: 'Verificações do local · 0 de 19', state: 'vazia', railStateAttr: 'vazia', glyph: '○' });
    expect(siteOf(snapshot, PAINEL)).toBeNull();
    expect(siteOf(snapshot, COLUNA)).toBeNull();
  });

  it('reads concluída once the 19 are answered, and the sheet counter of the local stays sheets-only', () => {
    const f = opFactory();
    const snapshot = snapshotOf(fold(baseState(), SITE_ITEM_KEYS.map((key) => f.op({ path: locationChecklistPath(ENEL, key, 'result'), value: 'C' }))));
    expect(siteOf(snapshot, ENEL)).toMatchObject({ answered: 19, text: 'Verificações do local · 19 de 19', railCounter: '19 de 19', state: 'concluida', railStateAttr: 'concluida', glyph: '✓' });
    expect(nodes(snapshot).find((node) => node.id === ENEL)!.counterText).toBe('0 de 0');
  });

  it('a relatório on v1 to v3, and a caller with no relatório row, get no site node anywhere', () => {
    for (const version of ['v1', 'v2', 'v3']) expect(nodes(snapshotOf(baseState(version))).every((node) => node.site === null)).toBe(true);
    const { locations, blocks, equipment } = mockSnapshot();
    expect(treeNodes(locationTree({ locations, blocks, equipment })).every((node) => node.kind === 'equipment' || node.site === null)).toBe(true);
  });
});

describe('14.3 preIssue: one non-blocking row names the locals with unanswered items', () => {
  it('names every live local and its count, in tree order; pending on section 9; the parecer stays the only blocking row', () => {
    const snapshot = mockSnapshot();
    expect(siteUnanswered(snapshot)).toEqual([
      { locationId: ENEL, name: 'Cubículo Enel', missing: 19 },
      { locationId: SUBSOLO, name: '1° Subsolo', missing: 7 },
    ]);
    const rows = preIssue(snapshot);
    expect(rows.filter((row) => row.kind === 'site_checklist_unanswered')).toEqual([
      { id: 'site_checklist_unanswered', row: 'section_9', severity: 'pending', text: 'Verificações do local sem resposta: Cubículo Enel (19 itens) e 1° Subsolo (7 itens)', kind: 'site_checklist_unanswered' },
    ]);
    expect(preIssueRowsFor(rows, 'section_9').some((row) => row.kind === 'site_checklist_unanswered')).toBe(true);
    expect(blockingRows(rows).map((row) => row.kind)).toEqual(['parecer_missing']);
  });

  it('words one local and one item in the singular, and raises nothing once every local is complete or on a relatório with no site list', () => {
    expect(siteUnansweredText([{ locationId: ENEL, name: 'Cubículo Enel', missing: 1 }])).toBe('Verificações do local sem resposta: Cubículo Enel (1 item)');
    expect(siteUnansweredText([])).toBeNull();
    const f = opFactory();
    const all = [ENEL, SUBSOLO].flatMap((id) => SITE_ITEM_KEYS.map((key) => f.op({ path: locationChecklistPath(id, key, 'result'), value: 'NA' })));
    expect(preIssue(snapshotOf(fold(baseState(), all))).some((row) => row.kind === 'site_checklist_unanswered')).toBe(false);
    for (const version of ['v1', 'v2', 'v3']) expect(preIssue(snapshotOf(baseState(version))).some((row) => row.kind === 'site_checklist_unanswered')).toBe(false);
  });

  it('matrix "Removed local": a removed local leaves the row, and comes back with its restore', () => {
    const f = opFactory(new Date('2026-09-23T12:00:00.000Z'));
    const answered = fold(baseState(), mockOps(SUBSOLO));
    const remove = f.op({ path: locationFieldPath(SUBSOLO, 'removed_at'), value: '2026-09-23T12:00:00.000Z' });
    const removed = fold(answered, [remove]);
    expect(siteUnanswered(snapshotOf(removed)).map((row) => row.name)).toEqual(['Cubículo Enel']);
    expect(siteChecklistProgress(snapshotOf(removed), SUBSOLO)).toBeNull();
    const restored = fold(removed, [f.op({ path: locationFieldPath(SUBSOLO, 'removed_at'), value: null, prev_op_id: remove.op_id })]);
    expect(siteChecklistProgress(snapshotOf(restored), SUBSOLO)).toEqual({ answered: 12, total: 19 });
    expect(siteUnanswered(snapshotOf(restored)).map((row) => [row.name, row.missing])).toEqual([
      ['Cubículo Enel', 19],
      ['1° Subsolo', 7],
    ]);
  });
});

describe('14.3 statusStepText: the Rascunho sentences name the site items on a seeded relatório', () => {
  it('says "preencher uma ficha ou as verificações do local" on v4, with and without setup gaps', () => {
    expect(statusStepText({ status: 'rascunho', latest: null, edited: false, seedVersion: 'v4' })).toBe(
      'Rascunho: concluir os dados do relatório, ou preencher uma ficha ou as verificações do local, passa o relatório a Em campo.',
    );
    expect(statusStepText({ status: 'rascunho', latest: null, edited: false, setupGaps: 'o número da ART', seedVersion: 'v4' })).toBe(
      'Rascunho: falta o número da ART em Dados do relatório. Preencher uma ficha ou as verificações do local passa o relatório a Em campo.',
    );
  });

  it('keeps the v1 to v3 text byte for byte, and every other status whatever the seed', () => {
    const plain = statusStepText({ status: 'rascunho', latest: null, edited: false });
    expect(plain).toBe('Rascunho: concluir os dados do relatório ou preencher uma ficha passa o relatório a Em campo.');
    for (const seedVersion of ['v1', 'v2', 'v3', 'v99', null]) expect(statusStepText({ status: 'rascunho', latest: null, edited: false, seedVersion })).toBe(plain);
    expect(statusStepText({ status: 'rascunho', latest: null, edited: false, setupGaps: 'o cliente', seedVersion: 'v3' })).toBe(statusStepText({ status: 'rascunho', latest: null, edited: false, setupGaps: 'o cliente' }));
    for (const status of ['em_campo', 'em_revisao', 'emitido'] as const) {
      expect(statusStepText({ status, latest: 1, edited: false, seedVersion: 'v4' })).toBe(statusStepText({ status, latest: 1, edited: false }));
    }
  });
});

describe('14.3 a point created from a site item', () => {
  it('matrix "NC to point": newPointRow writes `location_id` only when a local is given, so every other point keeps its row shape', () => {
    const point = sitePoint();
    expect(point).toMatchObject({ location_id: SUBSOLO, equipment_id: null, origin: 'manual' });
    expect(point.text).toContain(`[[foto:${PHOTO}]]`);
    const general = newPointRow({ id: POINT, relatorioId: TEST_RELATORIO, text: 't', equipmentId: null, origin: 'manual', action: null }, []);
    expect('location_id' in general).toBe(false);
    expect('location_id' in newPointRow({ id: POINT, relatorioId: TEST_RELATORIO, text: 't', equipmentId: null, origin: 'manual', action: null, locationId: null }, [])).toBe(false);
  });

  it('the NC row then shows its point mark: the points of that local citing one of the item photos, by section 8 position', () => {
    const other = sitePoint({ id: OTHER_PHOTO, text: 'Outro ponto do mesmo local, sem foto', order_key: 'a1' });
    const elsewhere = sitePoint({ id: BLOCK, location_id: ENEL, order_key: 'a2' });
    const points = [sitePoint(), other, elsewhere];
    expect(ncRowPointPositions(points, { locationId: SUBSOLO }, [PHOTO])).toEqual([1]);
    expect(ncRowPointsText(ncRowPointPositions(points, { locationId: SUBSOLO }, [PHOTO]))).toBe('Ponto de atenção 1');
    expect(ncRowPointPositions(points, { locationId: ENEL }, [PHOTO])).toEqual([3]);
    // No photo on the item, no owner, or another photo: no mark.
    expect(ncRowPointPositions(points, { locationId: SUBSOLO }, [])).toEqual([]);
    expect(ncRowPointPositions(points, { locationId: SUBSOLO }, [OTHER_PHOTO])).toEqual([]);
    expect(ncRowPointPositions(points, {}, [PHOTO])).toEqual([]);
    expect(ncRowPointPositions(points, null, [PHOTO])).toEqual([]);
    // The sheet rows keep their rule: by equipment id, as a string or in an owner.
    const ofEquipment: PointRow = { ...sitePoint({ id: COLUNA, order_key: 'a3' }), equipment_id: BLOCK, location_id: null };
    expect(ncRowPointPositions([...points, ofEquipment], BLOCK, [PHOTO])).toEqual([4]);
    expect(ncRowPointPositions([...points, ofEquipment], { equipmentId: BLOCK }, [PHOTO])).toEqual([4]);
  });

  it('is titled with its local, "⟨local⟩ · Verificações do local", and prints in section 8 and the action plan like any manual point', () => {
    const state = withRows(fold(baseState(), mockOps(SUBSOLO)), [
      [entityKey('file', PHOTO), sitePhoto()],
      [entityKey('point', POINT), sitePoint()],
    ]);
    const snapshot = snapshotOf(state);
    expect(pointTitle(snapshot.points[0]!, snapshot)).toBe('1° Subsolo · Verificações do local');
    expect(sitePointTitle(' 1° Subsolo ')).toBe('1° Subsolo · Verificações do local');
    expect(pointTitle({ equipment_id: null }, snapshot)).toBe(POINT_TITLE_GENERAL);
    expect(pointTitle({ equipment_id: null, location_id: POINT }, snapshot)).toBe(POINT_TITLE_GENERAL);
    const numbering = numberPhotos(snapshot.files);
    expect(resolveSection8(snapshot, numbering)).toEqual([{ kind: 'point', text: 'Luminária de emergência inoperante, conforme Imagem 1', point_id: POINT }]);
    expect(resolveActionPlan(snapshot, numbering)[0]).toMatchObject({ number: '1', local: '1° Subsolo · Verificações do local', images: '1' });
    expect(pointsSummary(snapshot)).toMatchObject({ total: 1, semAcao: 1 });
  });

  it('review 2026-10-13: the title resolves the local as every site reader does: a painel or a coluna id, and any id on a relatório with no site list, read "Geral"', () => {
    const snapshot = snapshotOf(baseState());
    expect(pointTitle({ equipment_id: null, location_id: SUBSOLO }, snapshot)).toBe('1° Subsolo · Verificações do local');
    expect(pointTitle({ equipment_id: null, location_id: PAINEL }, snapshot)).toBe(POINT_TITLE_GENERAL);
    expect(pointTitle({ equipment_id: null, location_id: COLUNA }, snapshot)).toBe(POINT_TITLE_GENERAL);
    expect(resolveActionPlan({ ...snapshot, points: [sitePoint({ location_id: PAINEL })] }, new Map())[0]).toMatchObject({ local: '—' });
    expect(pointTitle({ equipment_id: null, location_id: SUBSOLO }, snapshotOf(baseState('v3')))).toBe(POINT_TITLE_GENERAL);
  });

  it('matrix "Removed local": both snapshot builders leave the point out while its local is removed, and bring it back on restore; a point naming no local is always kept', () => {
    const f = opFactory(new Date('2026-09-23T12:00:00.000Z'));
    const general = newPointRow({ id: OTHER_PHOTO, relatorioId: TEST_RELATORIO, text: 'Ponto geral', equipmentId: null, origin: 'manual', action: null }, [sitePoint()]);
    const live = withRows(fold(baseState(), mockOps(SUBSOLO)), [
      [entityKey('point', POINT), sitePoint()],
      [entityKey('point', OTHER_PHOTO), general],
    ]);
    const remove = f.op({ path: locationFieldPath(SUBSOLO, 'removed_at'), value: '2026-09-23T12:00:00.000Z' });
    const removed = fold(live, [remove]);
    const restored = fold(removed, [f.op({ path: locationFieldPath(SUBSOLO, 'removed_at'), value: null, prev_op_id: remove.op_id })]);
    const incremental = createSnapshotBuilder();
    for (const [state, ids] of [
      [live, [POINT, OTHER_PHOTO]],
      [removed, [OTHER_PHOTO]],
      [restored, [POINT, OTHER_PHOTO]],
    ] as const) {
      const built = snapshotOf(state);
      expect(built.points.map((point) => point.id)).toEqual(ids);
      expect(sectionEightEntries(built)).toHaveLength(ids.length);
      expect(pointsSummary(built).total).toBe(ids.length);
      // The incremental builder agrees byte for byte.
      expect(serializeSnapshot(incremental(state, TEST_RELATORIO))).toBe(serializeSnapshot(built));
    }
    // The removed local's row still holds its answers (no tombstone of its own): the restore reads them back.
    expect((removed.get(entityKey('location', SUBSOLO)) as Cabine).checklist![EMERGENCIA]!.result!.value).toBe('NC');
    // A point whose local was never on this device is left out too.
    const unknown = withRows(baseState(), [[entityKey('point', POINT), sitePoint({ location_id: BLOCK })]]);
    expect(snapshotOf(unknown).points).toEqual([]);
  });
});

describe('14.3 a photo taken on a site item', () => {
  const meta: ContextCaptionMeta = { step: null, testKey: null, words: { atividades: [], locais: [] }, registry: [] };
  const state = (): EntityState => withRows(fold(baseState(), mockOps(SUBSOLO)), [[entityKey('file', PHOTO), sitePhoto()]]);

  it('matrix "Site photo": its item line names the site item and its result; its local is the photo cabine', () => {
    const snapshot = snapshotOf(state());
    const photo = snapshot.files[0]! as Extract<RelatorioSnapshot['files'][number], { kind: 'photo' }>;
    expect(photoItemLine(photo, snapshot)).toEqual({
      head: 'Item 11 · Iluminação de emergência (autonomia mínima de 2 h)',
      text: 'Item 11 · Iluminação de emergência (autonomia mínima de 2 h) · NC',
      result: 'NC',
      nc: true,
    });
    expect(photoCabineId(photo, snapshot)).toBe(SUBSOLO);
    expect(photoSiteLocal(photo, snapshot)?.id).toBe(SUBSOLO);
    expect(galleryCabineOptions(snapshot, [photo])).toEqual([
      { id: 'all', label: 'Todos' },
      { id: SUBSOLO, label: '1° Subsolo' },
    ]);
    // An unanswered item reads without a result.
    expect(photoItemLine({ ...photo, item_key: EPI }, snapshot)).toMatchObject({ text: 'Item 6 · EPI disponível', result: null, nc: false });
    // Section 7 prints the line under the photo.
    expect(section7Photos(snapshot).map((row) => row.itemLine)).toEqual(['Item 11 · Iluminação de emergência (autonomia mínima de 2 h) · NC']);
  });

  it('its caption is prefilled "Verificação de ⟨item⟩ d⟨o/a⟩ ⟨local⟩", agreeing with the local name', () => {
    const snapshot = snapshotOf(state());
    expect(contextCaption({ block_id: null, item_key: EMERGENCIA, location_id: SUBSOLO }, snapshot, meta)).toBe(
      'Verificação de iluminação de emergência (autonomia mínima de 2 h) do 1° Subsolo',
    );
    expect(contextCaption({ block_id: null, item_key: EPI, location_id: ENEL }, snapshot, meta)).toBe('Verificação de EPI disponível do Cubículo Enel');
    const feminine = snapshotOf(withRows(baseState(), [[entityKey('location', ENEL), cabine(ENEL, 'Cabine primária', 'a0')]]));
    expect(siteCaption({ item_key: EXTINTOR, location_id: ENEL }, feminine, meta)).toBe(
      'Verificação de extintor de incêndio carregado, lacrado, dentro da validade, sinalizado e desobstruído da Cabine primária',
    );
    // A registered local's agreement wins, as in every caption.
    const registry: ContextCaptionMeta['registry'] = [{ id: POINT, company_id: TEST_COMPANY, kind: 'local', name: 'Geradores', gender: 'm', number: 'plural', removed_at: null } as never];
    const plural = snapshotOf(withRows(baseState(), [[entityKey('location', ENEL), cabine(ENEL, 'Geradores', 'a0')]]));
    expect(siteCaption({ item_key: 'ventilacao', location_id: ENEL }, plural, { ...meta, registry })).toBe('Verificação de ventilação dos Geradores');
  });

  it('a photo with no site item, an item outside the list, or a relatório with no site list gets no site caption and no line', () => {
    const snapshot = snapshotOf(state());
    expect(contextCaption({ block_id: null, item_key: null, location_id: SUBSOLO }, snapshot, meta)).toBeNull();
    expect(contextCaption({ block_id: null, item_key: null }, snapshot, meta)).toBeNull();
    expect(contextCaption({ block_id: null, item_key: 'contatos', location_id: SUBSOLO }, snapshot, meta)).toBeNull();
    expect(photoItemLine({ block_id: null, item_key: 'contatos', location_id: SUBSOLO }, snapshot)).toBeNull();
    expect(photoItemLine({ block_id: null, item_key: EMERGENCIA }, snapshot)).toBeNull();
    const v3 = snapshotOf(withRows(baseState('v3'), [[entityKey('file', PHOTO), sitePhoto()]]));
    expect(contextCaption({ block_id: null, item_key: EMERGENCIA, location_id: SUBSOLO }, v3, meta)).toBeNull();
    expect(photoItemLine(v3.files[0]! as never, v3)).toBeNull();
    expect(photoCabineId({ block_id: null, location_id: SUBSOLO }, v3)).toBeNull();
    // A caller passing blocks alone resolves sheet items only (the pre-14.3 call shape).
    expect(photoItemLine({ block_id: null, item_key: EMERGENCIA, location_id: SUBSOLO }, { blocks: snapshot.blocks })).toBeNull();
  });

  it('a row carrying both a block and a local is read as its block own, never the local', () => {
    const snapshot = snapshotOf(state());
    const both = { block_id: BLOCK, item_key: EMERGENCIA, location_id: SUBSOLO };
    expect(photoSiteLocal(both, snapshot)).toBeNull();
    // The block is not in the snapshot: the photo reads as one whose block is absent.
    expect(photoItemLine(both, snapshot)).toBeNull();
    expect(photoCabineId(both, snapshot)).toBeNull();
    expect(contextCaption(both, snapshot, meta)).toBeNull();
  });

  it('matrix "Removed local": the photo stays in section 7 as a photo whose block is absent, with no item line and no local', () => {
    const f = opFactory(new Date('2026-09-23T12:00:00.000Z'));
    const remove = f.op({ path: locationFieldPath(SUBSOLO, 'removed_at'), value: '2026-09-23T12:00:00.000Z' });
    const removed = snapshotOf(fold(state(), [remove]));
    const photo = removed.files[0]! as Extract<RelatorioSnapshot['files'][number], { kind: 'photo' }>;
    expect(photoItemLine(photo, removed)).toBeNull();
    expect(photoCabineId(photo, removed)).toBeNull();
    expect(contextCaption(photo, removed, meta)).toBeNull();
    expect(section7Photos(removed).map((row) => [row.number, row.itemLine])).toEqual([[1, null]]);
    const restored = snapshotOf(fold(state(), [remove, f.op({ path: locationFieldPath(SUBSOLO, 'removed_at'), value: null, prev_op_id: remove.op_id })]));
    expect(section7Photos(restored)[0]!.itemLine).toBe('Item 11 · Iluminação de emergência (autonomia mínima de 2 h) · NC');
  });
});
