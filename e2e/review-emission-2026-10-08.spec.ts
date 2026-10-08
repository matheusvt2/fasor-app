import type { Page, Request } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readDeviceId, readStore, seedOutbox, serverOnlyOp } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Review fixes 2026-10-08, batch r8emit (`spec-review-fixes-2026-10-08-emission.md`): the
 * emission and export fixes driven as the engineer drives them. A dead op stops "Pré-visualizar"
 * (Sumário foot and dialog) and "Conferir antes de emitir" before anything is asked of the
 * server, as "Gerar relatório" already did (QW25); the Sumário foot bar stays within reach on a
 * long Sumário (DF-1); and the issue confirmation names the blank CNPJs and the missing logo
 * (DF-6). Nothing here issues a revision or loads the fixed-id fixture.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  op_id: string;
  status: string;
  error_code: string | null;
}

const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const bar = (page: Page) => page.locator('[data-route="/relatorio/:id"] .sticky-action-bar');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

/** Resets Empresa B, signs in at `width` x `height`, pushes a relatório of the standard template under a client without a CNPJ, and opens its Sumário. */
async function setUp(page: Page, size = { width: 1280, height: 900 }): Promise<string> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize(size);
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const clientId = newId();
  const client = {
    kind: 'create' as const,
    scope: 'company' as const,
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/client/${clientId}`,
    value: { id: clientId, kind: 'client', name: 'Cliente da Emissão', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const drafts = built.drafts.map((draft) =>
    draft.kind === 'create' && draft.path === `project/${built.projectId}` ? { ...draft, value: { ...(draft.value as Record<string, unknown>), client_id: clientId } as never } : draft,
  );
  await pushDrafts(page, database, [client, ...drafts]);
  await openSumario(page, built.relatorioId);
  return built.relatorioId;
}

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
}

test('@p0 R8E-E2E-001 with a dead op held, "Pré-visualizar" on the Sumário foot and in the dialog and "Conferir antes de emitir" open nothing, ask nothing and say why; the op stays dead', async ({ page, context }) => {
  test.setTimeout(240_000);
  const relatorioId = await setUp(page);
  // A rejected op of this device: the server refuses a server-only family for good.
  const rejected = serverOnlyOp({ ...account, deviceId: await readDeviceId(page, database) }, newId(), relatorioId);
  await seedOutbox(page, database, [rejected]);
  await page.reload();
  await syncNow(page);
  const statusOf = async () => (await readStore<OutboxRow>(page, database, 'outbox')).find((row) => row.op_id === rejected.op_id);
  await expect.poll(statusOf, { timeout: 30_000 }).toMatchObject({ status: 'dead', error_code: 'op_server_only' });

  const asked: string[] = [];
  page.on('request', (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && /\/api\/relatorios\/[0-9a-f-]{36}\/(preview|audit)$/.test(path)) asked.push(path);
  });
  const popups: string[] = [];
  context.on('page', (opened) => popups.push(opened.url()));

  // The Sumário foot.
  await openSumario(page, relatorioId);
  const footPreview = bar(page).getByRole('button', { name: 'Pré-visualizar' });
  await footPreview.click();
  await expect(bar(page).getByRole('alert')).toHaveText('Há alterações rejeitadas — resolva em Sincronização antes de pré-visualizar.');
  await expect(footPreview).not.toHaveAttribute('aria-disabled', 'true');

  // The dialog's "Pré-visualizar", then the audit.
  await bar(page).getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = exportDialog(page);
  await expect(modal).toBeVisible();
  const preview = modal.getByRole('button', { name: 'Pré-visualizar' });
  await preview.click();
  await expect(modal.getByText('Há alterações rejeitadas — resolva em Sincronização antes de pré-visualizar.')).toBeVisible();
  await expect(preview).not.toHaveAttribute('aria-disabled', 'true');
  const audit = modal.getByRole('button', { name: 'Conferir antes de emitir' });
  await audit.click();
  await expect(modal.getByText('Há alterações rejeitadas — resolva em Sincronização antes de conferir.')).toBeVisible();
  await expect(audit).not.toHaveAttribute('aria-disabled', 'true');
  await expect(modal.getByText('Não foi possível conferir agora.')).toHaveCount(0);

  await page.waitForTimeout(2_000);
  expect(asked).toEqual([]);
  expect(popups).toEqual([]);
  expect(await statusOf()).toMatchObject({ status: 'dead', error_code: 'op_server_only' });
});

for (const size of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
]) {
  test(`@p0 R8E-E2E-002 at ${size.width} px a long Sumário opened at the top shows "Pré-visualizar" and "Gerar relatório" on top at their centres, and the dialog opens without a scroll`, async ({ page }) => {
    test.setTimeout(180_000);
    const relatorioId = await setUp(page, size);
    const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    const tree = page.getByRole('list', { name: 'Locais do relatório' });
    await expect(tree).toBeVisible();
    // Every cabine and coluna open: the whole section 9 is drawn.
    for (let expand = tree.getByRole('button', { name: /^Expandir / }); (await expand.count()) > 0; ) await expand.first().click();
    // At least 20 sheets: the standard template's 94.
    const sheets = (await readStore<{ entity: string; row: { relatorio_id?: string; location_id?: string | null } }>(page, database, 'entities')).filter(
      (record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.location_id !== null,
    );
    expect(sheets.length).toBeGreaterThanOrEqual(20);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollHeight > 2 * window.innerHeight)).toBe(true);

    for (const name of ['Pré-visualizar', 'Gerar relatório']) {
      const button = bar(page).getByRole('button', { name });
      const box = (await button.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      const topmost = await button.evaluate((element, at) => {
        const hit = document.elementFromPoint(at.x, at.y);
        return hit !== null && element.contains(hit);
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      expect(topmost, name).toBe(true);
    }
    const box = (await bar(page).getByRole('button', { name: 'Gerar relatório' }).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(exportDialog(page)).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(new URL(page.url()).pathname).toBe(`/relatorio/${relatorioId}`);
  });
}

test('@p1 R8E-E2E-008 the issue confirmation and the foot reason name the blank CNPJs and the missing logo after the counts', async ({ page }) => {
  test.setTimeout(180_000);
  const relatorioId = await setUp(page);
  await setParecer(page, relatorioId);
  // The worker's Empresa B has no CNPJ and no logo, and the client none either.
  const gaps = 'os CNPJs do contratante e da contratada em branco e o logo da empresa não cadastrado';
  await expect(bar(page).locator('.btn-reason').first()).toHaveText(new RegExp(`^Nada impede gerar\\. Emitir pede confirmação: 94 fichas vazias, \\d+ campos? em branco, ${gaps}\\.$`), { timeout: 30_000 });
  await bar(page).getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = exportDialog(page);
  await modal.getByRole('button', { name: /^Gerar relatório$/ }).click();
  const question = modal.getByRole('group', { name: new RegExp(`^Emitir com 94 fichas vazias, \\d+ campos? em branco, ${gaps}\\?$`) });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Voltar' }).click();
  await expect(question).toHaveCount(0);
});
