import { SEED_VERSION, sectionRefText, sectionRowTitle, sectionTextEmptyText, siteItems, siteMissingText, type BlockRow, type OpDraft, type RegistryRow, type RelatorioRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { copy } from '../apps/web/src/copy/pt-br.ts';
import { deviceSnapshot } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { instrumentDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 27.10 (F23 to F26 and F28, the manual pass of 2026-11-21): the five slips the app now catches,
 * made as a person makes them on one relatório of the standard template (seed from the kernel), each
 * asserted on the screen and on what the device stores. Spec 27.10-E2E-001.
 *
 *   - "Restaurar ficha removida" with nothing removed: disabled, with its reason (F28).
 *   - An exclusion row left empty, then "Concluir dados do relatório": the stored list holds no empty row (F25).
 *   - A section text emptied: the Sumário row reads "texto vazio", the Gerar dialog lists it with its
 *     section, and "Gerar relatório" stays enabled (F24).
 *   - "Concluir verificações" with three items unanswered: the message beside the button, the first focused (F26).
 *   - Cadastros › Clientes, "cliente  local" beside "Cliente Local": the warning before anything is
 *     created; "Criar mesmo assim" creates it (F23).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TRT = '2620262602583';
const CLIENT_NAME = 'Cliente Local';
const ENEL = 'Cubículo Enel';
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const sumarioStatus = (page: Page, row: string) => sumario(page).locator(`li.sum-row[data-row="${row}"] .sum-status`);
const entities = <T,>(page: Page) => readStore<{ entity: string; id: string; row: T }>(page, database, 'entities');
const outbox = (page: Page) => readStore<{ kind: string; path: string; value: unknown }>(page, database, 'outbox');

function clientDraft(clientId: string, name: string): OpDraft {
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/client/${clientId}`,
    value: { id: clientId, kind: 'client', name, cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
}

test('@p0 27.10-E2E-001 the five slips: nothing to restore, an empty exclusion, an emptied section text, unanswered items, a repeated client', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // A Rascunho relatório whose setup is complete (client, responsible, ART, an instrument), its Cubículo
  // Enel answered on every site item but the last three.
  const built = newRelatorioDrafts(account);
  const { relatorioId } = built;
  const scope = { relatorioId };
  const clientId = newId();
  const instrument = instrumentDraft(account);
  const instrumentId = (instrument.value as { id: string }).id;
  const enelId = (built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === ENEL)!.value as { id: string }).id;
  const items = siteItems(SEED_VERSION);
  const answered = items.slice(0, -3);
  const drafts = built.drafts.map((draft) =>
    draft.kind === 'create' && draft.path === `project/${built.projectId}` ? { ...draft, value: { ...(draft.value as Record<string, unknown>), client_id: clientId } as never } : draft,
  );
  await pushDrafts(page, database, [
    clientDraft(clientId, CLIENT_NAME),
    ...drafts,
    instrument,
    officeDraft(account, scope, 'relatorio/setup/responsible_user_id', account.userId),
    officeDraft(account, scope, 'relatorio/setup/art_trt_number', TRT),
    officeDraft(account, scope, 'relatorio/setup/instrument_ids', [instrumentId]),
    ...answered.map((item) => officeDraft(account, scope, `location/${enelId}/checklist/${item.key}/result`, 'C')),
  ]);
  await syncNowAndReturn(page);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // --- F28: nothing removed, so "Restaurar ficha removida" is disabled with its reason; no dialog opens.
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  const restore = page.getByRole('menuitem', { name: 'Restaurar ficha removida' });
  await expect(restore).toHaveAttribute('aria-disabled', 'true');
  await expect(restore).toHaveAccessibleDescription(copy.sumario.restoreNoneReason);
  await expect(restore).toHaveAccessibleDescription('Nada para restaurar');
  await restore.click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Restaurar ficha removida' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // --- F25: an exclusion row added and left empty, stored as such; "Concluir dados do relatório" drops it.
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=2`);
  const exclusions = page.getByRole('list', { name: 'Exclusões' });
  await expect(exclusions).toBeVisible({ timeout: 30_000 });
  const before = await exclusions.getByRole('listitem').count();
  await page.getByRole('button', { name: 'Adicionar exclusão' }).click();
  await expect(exclusions.getByRole('listitem')).toHaveCount(before + 1);
  const exclusionPuts = async () => (await outbox(page)).filter((op) => op.path === 'relatorio/setup/exclusions').map((op) => op.value as string[]);
  await expect.poll(async () => (await exclusionPuts()).at(-1)?.at(-1)).toBe('');
  const complete = page.getByRole('button', { name: 'Concluir dados do relatório' });
  await expect(complete).not.toHaveAttribute('aria-disabled', 'true');
  await complete.click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`), { timeout: 30_000 });
  const storedRelatorio = async () => (await entities<RelatorioRow>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)!.row;
  await expect.poll(async () => (await storedRelatorio()).status).toBe('em_campo');
  const kept = (await storedRelatorio()).setup.exclusions!;
  expect(kept).toHaveLength(before);
  expect(kept.every((text) => text.trim() !== '')).toBe(true);
  expect((await exclusionPuts()).at(-1)).toEqual(kept);

  // --- F24: section 4's text emptied in the editor.
  await sumario(page).getByRole('button', { name: /^Requisitos básicos/ }).click();
  await expect(page.locator('.section-text-title')).toHaveText('Seção 4 — Requisitos básicos', { timeout: 30_000 });
  const area = page.getByRole('textbox', { name: 'Texto da seção' });
  await area.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(area).toHaveText('');
  await page.getByRole('button', { name: 'Voltar ao sumário' }).click();
  // Stored: the block's own text is empty.
  const section4 = async () => (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.block_type === 'section_4')!.row;
  await expect.poll(async () => {
    const text = ((await section4()).config as { section_text?: unknown }).section_text;
    return typeof text === 'string' ? text.trim() : text;
  }).toBe('');
  await expect(sumarioStatus(page, 'section_4')).toHaveText('texto vazio', { timeout: 30_000 });
  await expect(sumario(page).locator('li.sum-row[data-row="section_4"]')).toHaveClass(/has-pend/);

  // The Gerar dialog lists it with its section, and nothing stops "Gerar relatório" because of it.
  await setParecer(page, relatorioId);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const precheck = dialog.locator('.precheck');
  const emptyText = sectionTextEmptyText(sectionRowTitle('section_4'));
  expect(emptyText).toBe('Texto vazio em Requisitos básicos');
  const row = precheck.locator('li', { hasText: emptyText });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.pc-meta')).toHaveText(`— ${sectionRefText(await deviceSnapshot(page, database, relatorioId), 4)}`);
  await expect(precheck.locator('li.is-blocking')).toHaveCount(0);
  // Nothing is generated here (the spec stays in the parallel group): the button is only read.
  const generate = dialog.getByRole('button', { name: 'Gerar relatório', exact: true });
  await expect(generate).toHaveCount(1);
  await expect(generate).toBeEnabled();
  await expect(generate).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // --- F26: "Concluir verificações" with three items unanswered: the kernel's sentence beside the button.
  await page.goto(`/relatorio/${relatorioId}/local/${enelId}/verificacoes`);
  const concluir = page.getByRole('button', { name: 'Concluir verificações' });
  await expect(concluir).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('local-missing')).toHaveCount(0);
  await concluir.click();
  const missing = siteMissingText(await deviceSnapshot(page, database, relatorioId), enelId)!;
  const first = items.at(-3)!;
  expect(missing).toBe(`3 itens sem resposta — o primeiro é o item ${first.number}, ${first.label}`);
  await expect(page.getByTestId('local-missing')).toHaveText(missing);
  await expect(concluir).toHaveAccessibleDescription(missing);
  const firstRow = page.locator(`li.checklist-row[data-item-key="${first.key}"]`);
  await expect(firstRow.getByRole('radio').first()).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/local/${enelId}/verificacoes$`));

  // --- F23: Cadastros › Clientes, a new client typed like "Cliente Local": warned, nothing created until confirmed.
  const clients = async () => (await entities<RegistryRow>(page)).filter((record) => record.entity === 'registry' && record.row.kind === 'client').map((record) => record.row);
  expect((await clients()).map((client) => client.name)).toEqual([CLIENT_NAME]);
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Clientes' }).click();
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  const panel = page.locator('.registry-panel');
  const name = panel.getByLabel('Nome', { exact: true });
  await name.fill('cliente  local');
  const warning = copy.registries.clientes.nameRepeats(CLIENT_NAME);
  expect(warning).toBe('Já existe um cliente com este nome: Cliente Local');
  await expect(panel.getByText(warning)).toBeVisible();
  await expect(name).toHaveAccessibleDescription(warning);
  // Left for another field: still nothing created.
  await name.press('Enter');
  await panel.getByLabel('Contato', { exact: true }).click();
  await expect(panel.getByText(warning)).toBeVisible();
  expect((await outbox(page)).filter((op) => op.path.startsWith('registry/client/'))).toEqual([]);
  expect(await clients()).toHaveLength(1);
  // The user may still create it.
  await panel.getByRole('button', { name: copy.registries.clientes.createAnyway }).click();
  await expect.poll(async () => (await clients()).map((client) => client.name).sort()).toEqual([CLIENT_NAME, 'cliente  local'].sort());
  await expect(panel.getByRole('button', { name: copy.registries.clientes.createAnyway })).toHaveCount(0);
});
