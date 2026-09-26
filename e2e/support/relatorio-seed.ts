import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, instantiateTemplate, makeOp, standardTemplate, type JsonValue, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../../apps/api/src/ids.ts';
import { expect, type SeedAccount } from './merged-fixtures.ts';
import { readDeviceId } from './outbox.ts';

type Account = SeedAccount;

/**
 * Stories 4.4/4.5: a relatório of the standard template born on "another device" — the
 * `project` create and the 223 `instantiateTemplate` drafts pushed through `/api/sync/ops`
 * with the page's own session — so a spec opens `/relatorio/:id` and the Sumário pulls it
 * on open. Returns the relatório and project ids.
 */
export async function pushNewRelatorio(page: Page, account: Account, database: string): Promise<{ relatorioId: string; projectId: string }> {
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra da árvore', site: 'Obra da árvore', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  await pushDrafts(page, database, [project, ...drafts]);
  return { relatorioId, projectId };
}

/** Pushes drafts as one batch from an "office" device of this account, through the page's session. */
export async function pushDrafts(page: Page, database: string, drafts: readonly OpDraft[]): Promise<void> {
  const deviceId = await readDeviceId(page, database);
  const batchId = newId();
  const at = new Date();
  const ops = drafts.map((draft) => makeOp({ ...draft, batch_id: drafts.length > 1 ? batchId : null, device_id: `${deviceId}-office` }, { newId, now: at }));
  const pushed = await page.request.post('/api/sync/ops', {
    headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    data: { ops },
  });
  expect(pushed.ok(), await pushed.text()).toBe(true);
  const body = (await pushed.json()) as { rejected?: unknown[] };
  expect(body.rejected ?? []).toEqual([]);
}

/** One relatório- or project-scope put, pushed from the office device (an edit made elsewhere). */
export function officeDraft(account: Account, scope: { relatorioId: string } | { projectId: string }, path: string, value: unknown, kind: 'put' | 'create' = 'put'): OpDraft {
  const relatorio = 'relatorioId' in scope;
  return {
    kind,
    scope: relatorio ? 'relatorio' : 'project',
    company_id: account.companyId,
    project_id: relatorio ? null : scope.projectId,
    relatorio_id: relatorio ? scope.relatorioId : null,
    path,
    value: value as JsonValue,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
}

/** Stories 12.3-12.4: the instrument MG-01 of the account's company, created from the office device (pulled with "Sincronizar agora"). */
export function instrumentDraft(account: Account): OpDraft {
  const id = newId();
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/instrument/${id}`,
    value: {
      id,
      kind: 'instrument',
      code: 'MG-01',
      name: 'Megôhmetro',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: 'IN919021',
      cert_number: '37428/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

/** One equipment sheet of a relatório built by `newRelatorioDrafts`, in template order. */
export interface SeededSheet {
  blockId: string;
  blockType: string;
  locationName: string;
  tag: string;
}

/**
 * Story 12.1: the same relatório `pushNewRelatorio` pushes, returned as drafts (nothing
 * pushed yet) with its equipment sheets read off them, so a spec can add its own seed ops,
 * push everything in one batch and open a sheet by its address without walking the tree.
 */
export function newRelatorioDrafts(account: Account): { relatorioId: string; projectId: string; drafts: OpDraft[]; sheets: SeededSheet[] } {
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra da árvore', site: 'Obra da árvore', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const rows = (prefix: string) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const locationName = new Map(rows('location/').map((row) => [row.id as string, row.name as string]));
  const tagOf = new Map(rows('equipment/').map((row) => [row.id as string, row.tag as string]));
  const sheets = rows('block/')
    .filter((row) => row.equipment_id !== null)
    .map((row) => ({
      blockId: row.id as string,
      blockType: row.block_type as string,
      locationName: locationName.get(row.location_id as string) ?? '',
      tag: tagOf.get(row.equipment_id as string) ?? '',
    }));
  return { relatorioId, projectId, drafts: [project, ...drafts], sheets };
}
