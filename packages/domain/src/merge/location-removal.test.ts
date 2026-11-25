import { describe, expect, it } from 'vitest';
import { SERVER_DEVICE_ID } from '../ids.ts';
import { applyOp, entityKey, splitEntityKey, targetsOf, type EntityState } from '../ops/apply.ts';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { locationChecklistPath } from '../ops/path.ts';
import { replay } from '../ops/replay.ts';
import { restorableEntries } from '../relatorio/sumario.ts';
import { entityRowSchemas, relatorioRowSchema, type FileRow, type LocationRow, type PointRow, type RelatorioRow } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, siteItems } from '../seed/definitions.ts';
import { opFactory, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { holdsLocationRemovalMark, locationRemovalToastText, openDecisions, syncDecisionRows, decisionText, type DecisionTextContext, type LocationRemovalDecision } from './conflicts.ts';
import { stampSeen } from './stamp.ts';

/*
 * Story 30.4 (contract 61, Q-8): a local removed on one device while another wrote site work on it
 * (an answer of its "Verificações do local", a site photo, a site point) without having seen the
 * removal. The fold marks the local as it marks a block (`removal_conflict`), in either order of
 * arrival; nothing is deleted. The kernel lists it as a decision, words the notice, keeps the
 * local's restore entry past the emission cut while the mark stands, and both resolutions clear it.
 */

const LOCAL = '019966b0-0030-7000-8000-000000000001';
const PHOTO = '019966b0-0030-7000-8000-000000000004';
const POINT = '019966b0-0030-7000-8000-000000000005';
const ANA = '019966b0-0030-7000-8000-000000000008';
const BRUNO = '019966b0-0030-7000-8000-000000000009';
const A_DEVICE = 'tablet-ana';
const B_DEVICE = 'tablet-bruno';

const KEYS = siteItems('v4').map((item) => item.key);

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

const local = (): Cabine => ({
  id: LOCAL,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: 'Cubículo Enel',
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  removed_at: null,
});

const relatorio = (): RelatorioRow =>
  relatorioRowSchema.parse({
    id: TEST_RELATORIO,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: 'v4',
    status: 'rascunho',
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  });

const sitePhoto = (): FileRow => ({
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
  item_key: KEYS[0]!,
  caption: null,
  reading_kind: null,
  reading_target: null,
  reading_status: 'none',
  people_in_photo: false,
  location_id: LOCAL,
});

const sitePoint = (): PointRow => ({
  id: POINT,
  relatorio_id: TEST_RELATORIO,
  text: 'Luminária de emergência inoperante',
  equipment_id: null,
  origin: 'manual',
  order_key: 'a0',
  removed_at: null,
  action: null,
  priority: null,
  deadline: null,
  owner: null,
  location_id: LOCAL,
});

const locKey = entityKey('location', LOCAL);
const relKey = entityKey('relatorio', TEST_RELATORIO);

/** One relatório on v4 with its local, created from the office; `f` mints every later op one minute apart. */
function world() {
  const f = opFactory();
  const createRelatorio = f.op({ kind: 'create', path: `relatorio/${TEST_RELATORIO}`, value: relatorio(), device_id: 'office' });
  const createLocal = f.op({ kind: 'create', path: `location/${LOCAL}`, value: local(), device_id: 'office' });
  /** Bruno, on his tablet, answers `n` site items (result C). */
  const brunoAnswers = (n: number): Op[] => KEYS.slice(0, n).map((key) => f.op({ path: locationChecklistPath(LOCAL, key, 'result'), value: 'C', actor_id: BRUNO, device_id: B_DEVICE }));
  /** Ana, on her tablet, removes the local; `seen` is what her row held of its site work (the commit's stamp). */
  const anaRemoves = (seen: string | null | undefined): Op =>
    f.op({ kind: 'remove', path: `location/${LOCAL}/removed_at`, value: null, actor_id: ANA, device_id: A_DEVICE, ...(seen === undefined ? {} : { meta: { seen_modified_at: seen } }) });
  return { f, createRelatorio, createLocal, brunoAnswers, anaRemoves };
}

/** The log as the server numbers it. */
const seqd = (ops: readonly Op[]): Op[] => ops.map((op, i) => ({ ...op, seq: i + 1 }));
const cabineOf = (s: EntityState): Cabine => s.get(locKey) as Cabine;
const fold = (ops: readonly Op[]): Cabine => cabineOf(ops.reduce<EntityState>((s, op) => applyOp(s, op), new Map()));

/** Every layer of the kernel folds the log to the same bytes: the replay, the device's materialization, a re-parse. */
function expectSameOnEveryLayer(log: readonly Op[]): Cabine {
  const reference = replay(log);
  for (const [key, row] of reference) {
    const ref = splitEntityKey(key);
    const ops = log.filter((op) => targetsOf(op).some((target) => target.key === key));
    expect(JSON.stringify(materializeEntity(ref, ops, [])), key).toBe(JSON.stringify(row));
    expect(JSON.stringify(entityRowSchemas[ref.entity].parse(row)), `${key} re-parsed`).toBe(JSON.stringify(row));
  }
  return cabineOf(reference);
}

const context = (viewer: string | null): DecisionTextContext => ({
  blocks: [],
  equipment: [],
  locations: [local()],
  users: [
    { id: ANA, name: 'Ana Andrade' },
    { id: BRUNO, name: 'Bruno Barros' },
  ],
  viewerActorId: viewer,
  viewerDeviceId: null,
  definitions: EMPTY_DEFINITION_CONTEXT,
});

describe('30.4-UNIT-001 the mark, in both orders of arrival', () => {
  it('removal first: answers Bruno wrote without seeing it land on the removed local and mark it; nothing is deleted', () => {
    const { createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const remove = anaRemoves(null);
    const answers = brunoAnswers(3);
    const row = expectSameOnEveryLayer(seqd([createRelatorio, createLocal, remove, ...answers]));
    expect(row.removed_at).toBe(remove.client_ts);
    expect(row.removed_by).toBe(ANA);
    expect(row.removal_conflict).toEqual({ removed_by: ANA, removed_at: remove.client_ts, edited_by: BRUNO, edited_at: answers.at(-1)!.client_ts });
    expect(Object.keys(row.checklist ?? {})).toHaveLength(3);
    expect(holdsLocationRemovalMark(row)).toBe(true);
  });

  it('work first: a removal stamped with what Ana saw (nothing) lands on Bruno\'s answers and marks the local', () => {
    const { createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const answers = brunoAnswers(2);
    const remove = anaRemoves(null);
    const row = expectSameOnEveryLayer(seqd([createRelatorio, createLocal, ...answers, remove]));
    expect(row.site_modified_by).toBe(BRUNO);
    expect(row.site_modified_at).toBe(answers.at(-1)!.client_ts);
    expect(row.removal_conflict).toEqual({ removed_by: ANA, removed_at: remove.client_ts, edited_by: BRUNO, edited_at: answers.at(-1)!.client_ts });
    expect(Object.keys(row.checklist ?? {})).toHaveLength(2);
  });

  it('the commit stamps a local\'s removal with the site work its row held; a removal that saw that work marks nothing', () => {
    const { createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const answers = brunoAnswers(2);
    const held = [createRelatorio, createLocal, ...answers].reduce<EntityState>((s, op) => applyOp(s, op), new Map());
    const stamped = stampSeen(anaRemoves(undefined), held);
    expect(stamped.meta).toEqual({ seen_modified_at: answers.at(-1)!.client_ts });
    const row = fold([createRelatorio, createLocal, ...answers, stamped]);
    expect(row.removed_at).not.toBeNull();
    expect(row.removal_conflict).toBeUndefined();
    // A local with no site work stamps null, and a removal with no stamp (an older bundle) folds as before.
    expect(stampSeen(anaRemoves(undefined), new Map([[locKey, local()]])).meta).toEqual({ seen_modified_at: null });
    expect(fold([createRelatorio, createLocal, ...answers, anaRemoves(undefined)]).removal_conflict).toBeUndefined();
  });

  it('a server op never marks, and a local with no site work is never marked by its removal', () => {
    const { f, createRelatorio, createLocal, anaRemoves } = world();
    const remove = anaRemoves(null);
    const server = f.op({ path: locationChecklistPath(LOCAL, KEYS[0]!, 'result'), value: 'C', device_id: SERVER_DEVICE_ID });
    expect(fold([createRelatorio, createLocal, remove, server]).removal_conflict).toBeUndefined();
    expect(fold([createRelatorio, createLocal, anaRemoves(null)]).removal_conflict).toBeUndefined();
  });

  it('a site photo and a site point Bruno created on the removed local name it and mark it, in both orders', () => {
    const { f, createRelatorio, createLocal, anaRemoves } = world();
    const photo = f.op({ kind: 'create', path: `file/${PHOTO}`, value: sitePhoto(), actor_id: BRUNO, device_id: B_DEVICE });
    const point = f.op({ kind: 'create', path: `point/${POINT}`, value: sitePoint(), actor_id: BRUNO, device_id: B_DEVICE });
    expect(targetsOf(photo).map((ref) => ref.key)).toEqual([entityKey('file', PHOTO), locKey]);
    expect(targetsOf(point).map((ref) => ref.key)).toEqual([entityKey('point', POINT), locKey]);
    const removeFirst = anaRemoves(null);
    const after = expectSameOnEveryLayer(seqd([createRelatorio, createLocal, removeFirst, photo, point]));
    expect(after.removal_conflict).toMatchObject({ removed_by: ANA, edited_by: BRUNO, edited_at: point.client_ts });
    const before = expectSameOnEveryLayer(seqd([createRelatorio, createLocal, photo, point, anaRemoves(null)]));
    expect(before.removal_conflict).toMatchObject({ removed_by: ANA, edited_by: BRUNO, edited_at: point.client_ts });
    // A photo of a sheet (it names a block) is never a site photo.
    const sheetPhoto = f.op({ kind: 'create', path: `file/${PHOTO}`, value: { ...sitePhoto(), block_id: LOCAL }, actor_id: BRUNO, device_id: B_DEVICE });
    expect(targetsOf(sheetPhoto).map((ref) => ref.key)).toEqual([entityKey('file', PHOTO), entityKey('block', LOCAL)]);
  });

  it('a created row never brings the derived columns of its own', () => {
    const { f, createRelatorio } = world();
    const forged = f.op({
      kind: 'create',
      path: `location/${LOCAL}`,
      value: { ...local(), removed_by: ANA, site_modified_by: ANA, site_modified_at: '2026-09-21T12:00:00.000Z', removal_conflict: { removed_by: ANA, removed_at: '2026-09-21T12:00:00.000Z', edited_by: BRUNO, edited_at: null } } as never,
      device_id: 'office',
    });
    expect(fold([createRelatorio, forged])).toEqual(local());
  });
});

describe('30.4-UNIT-002 the decision and its count', () => {
  function marked(n: number, extra: { photo?: boolean; point?: boolean } = {}) {
    const { createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const remove = anaRemoves(null);
    const row = fold([createRelatorio, createLocal, remove, ...brunoAnswers(n)]);
    const files = extra.photo === true ? [sitePhoto()] : [];
    const points = extra.point === true ? [sitePoint()] : [];
    const decisions = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [], locations: [row], equipment: [], opOf: () => undefined, createOpOf: () => undefined, definitions: EMPTY_DEFINITION_CONTEXT, files, points });
    return { row, remove, decisions };
  }

  it('one location_removal decision names the local, who removed it and when, who wrote and how many answers, photos and points', () => {
    const { remove, decisions } = marked(19, { photo: true, point: true });
    expect(decisions).toHaveLength(1);
    const decision = decisions[0] as LocationRemovalDecision;
    expect(decision).toMatchObject({ kind: 'location_removal', location_id: LOCAL, removed_by: ANA, removed_at: remove.client_ts, edited_by: BRUNO, answers: 19, photos: 1, points: 1 });
  });

  it('the Banner, the Decisões row and the Toast compose the story\'s sentences, by viewer, with photos and points only when present', () => {
    const { remove, decisions } = marked(19);
    const decision = decisions[0]!;
    const when = remove.client_ts;
    const at = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(when)).replace(',', '');
    expect(decisionText(decision, context(BRUNO))).toBe(`Cubículo Enel: removido por Ana em ${at}. 19 respostas de você nas Verificações do local não foram mantidas.`);
    expect(decisionText(decision, context(ANA))).toBe(`Cubículo Enel: removido por você em ${at}. 19 respostas de Bruno nas Verificações do local não foram mantidas.`);
    expect(locationRemovalToastText(decision as LocationRemovalDecision, context(BRUNO))).toBe('Cubículo Enel foi removido por Ana. Suas 19 respostas não foram mantidas.');
    const rows = syncDecisionRows([{ relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, decisions, blocks: [], equipment: [], locations: [local()] }], context(BRUNO));
    expect(rows).toEqual([{ key: `${TEST_RELATORIO}:location_removal:${LOCAL}`, kind: 'location_removal', title: 'Local removido com respostas', text: decisionText(decision, context(BRUNO)) }]);

    const one = marked(1, { photo: true }).decisions[0] as LocationRemovalDecision;
    expect(locationRemovalToastText(one, context(BRUNO))).toBe('Cubículo Enel foi removido por Ana. Sua 1 resposta e 1 foto não foram mantidas.');
    expect(decisionText(one, context(BRUNO))).toContain('1 resposta e 1 foto de você nas Verificações do local não foram mantidas.');
    const single = marked(1).decisions[0] as LocationRemovalDecision;
    expect(locationRemovalToastText(single, context(BRUNO))).toBe('Cubículo Enel foi removido por Ana. Sua 1 resposta não foi mantida.');
    const withPoint = marked(2, { point: true }).decisions[0] as LocationRemovalDecision;
    expect(locationRemovalToastText(withPoint, context(BRUNO))).toBe('Cubículo Enel foi removido por Ana. Suas 2 respostas e 1 ponto de atenção não foram mantidos.');
  });

  it('a removal whose author is unknown (a server removal) leaves out who and when', () => {
    const { decisions } = marked(3);
    const unknown = { ...(decisions[0] as LocationRemovalDecision), removed_by: null };
    expect(decisionText(unknown, context(BRUNO))).toBe('Cubículo Enel foi removido em outro aparelho. 3 respostas de você nas Verificações do local não foram mantidas.');
    expect(locationRemovalToastText(unknown, context(BRUNO))).toBe('Cubículo Enel foi removido em outro aparelho. Suas 3 respostas não foram mantidas.');
  });
});

describe('30.4-UNIT-003 the restore', () => {
  it('"Restaurar local" (the restore put of null) brings the local back with every answer and clears the mark', () => {
    const { f, createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const remove = anaRemoves(null);
    const answers = brunoAnswers(4);
    const restore = f.op({ path: `location/${LOCAL}/removed_at`, value: null, actor_id: ANA, device_id: A_DEVICE });
    const row = expectSameOnEveryLayer(seqd([createRelatorio, createLocal, remove, ...answers, restore]));
    expect(row.removed_at).toBeNull();
    expect(row.removal_conflict).toBeUndefined();
    expect(row.removed_by).toBeUndefined();
    expect(Object.keys(row.checklist ?? {})).toHaveLength(4);
  });

  it('while the mark stands the local\'s restore entry is offered past the emission cut; once cleared the usual cut applies', () => {
    const { f, createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const remove = anaRemoves(null);
    const markedRow = fold([createRelatorio, createLocal, remove, ...brunoAnswers(2)]);
    const issuedAfter = '2099-01-01T00:00:00.000Z';
    const offered = (row: LocationRow) => restorableEntries({ blocks: [], equipment: [], locations: [row], since: issuedAfter }).map((entry) => entry.id);
    expect(offered(markedRow)).toEqual([LOCAL]);
    const left = f.op({ path: `location/${LOCAL}/removed_at`, value: markedRow.removed_at, actor_id: BRUNO, device_id: B_DEVICE });
    const cleared = fold([createRelatorio, createLocal, remove, ...brunoAnswers(2), left]);
    expect(offered(cleared)).toEqual([]);
    expect(restorableEntries({ blocks: [], equipment: [], locations: [cleared], since: null }).map((entry) => entry.id)).toEqual([LOCAL]);
  });
});

describe('30.4-UNIT-004 the clear op ("Deixar removido")', () => {
  it('a put of the removal\'s own time clears the mark on every layer; the local stays removed at the same time; its answers stay', () => {
    const { f, createRelatorio, createLocal, brunoAnswers, anaRemoves } = world();
    const remove = anaRemoves(null);
    const answers = brunoAnswers(3);
    const markedRow = fold([createRelatorio, createLocal, remove, ...answers]);
    const held = [createRelatorio, createLocal, remove, ...answers].reduce<EntityState>((s, op) => applyOp(s, op), new Map());
    const leave = stampSeen(f.op({ path: `location/${LOCAL}/removed_at`, value: markedRow.removed_at, actor_id: BRUNO, device_id: B_DEVICE }), held);
    const row = expectSameOnEveryLayer(seqd([createRelatorio, createLocal, remove, ...answers, leave]));
    expect(row.removed_at).toBe(remove.client_ts);
    expect(row.removal_conflict).toBeUndefined();
    expect(holdsLocationRemovalMark(row)).toBe(false);
    expect(Object.keys(row.checklist ?? {})).toHaveLength(3);
    expect(openDecisions({ relatorioId: TEST_RELATORIO, blocks: [], locations: [row], equipment: [], opOf: () => undefined, createOpOf: () => undefined, definitions: EMPTY_DEFINITION_CONTEXT })).toEqual([]);
    // The relatório row the fold read is untouched.
    expect(replay(seqd([createRelatorio, createLocal, remove, ...answers, leave])).get(relKey)).toEqual(relatorio());
  });
});
