import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, instantiateTemplate, makeOp, standardTemplate, type JsonValue, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../../apps/api/src/ids.ts';
import { expect, TEST_SEED } from './merged-fixtures.ts';
import { readDeviceId } from './outbox.ts';

type Account = (typeof TEST_SEED.companies)[number];

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
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [] },
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
