import { formatCriterionValue, makeOp, SEEDED_CRITERIA, type Op } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test } from './support/merged-fixtures.ts';
import { projectCreateOp, readDeviceId, readFileBlobs, readStore, seedOutbox, type SeedUser } from './support/outbox.ts';

/*
 * 2.1-E2E. The Registries surface's Instrumentos tab: the six-tab shell (AC1), the
 * persistent edit panel with no Save button (AC2), the calibration-expired sort and
 * amber row (AC1, AC3), Arquivar/Remover + undo (AC4), and offline create (AC5).
 *
 * "Referenced instrument offers only Arquivar" (the other half of AC4) is not exercised
 * here: no block exists before Epic 5, and seeding one needs a full relatorio/location
 * chain through the server this story does not own. It is covered at the kernel level
 * (`packages/domain/src/checks/references.test.ts`) and is correct the day a block does.
 */

function instrumentOp(user: SeedUser, fields: Record<string, unknown>, id = newId()): Op {
  return makeOp(
    {
      kind: 'create',
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.userId,
      device_id: user.deviceId,
      path: `registry/instrument/${id}`,
      value: {
        id,
        kind: 'instrument',
        code: 'X1',
        name: 'Instrumento seed',
        manufacturer: null,
        model: null,
        serial: null,
        cert_number: null,
        laboratory: null,
        calibrated_at: null,
        calibration_interval_months: null,
        rbc_accredited: null,
        test_isolacao: null,
        test_resistencia_contato: null,
        test_relacao_transformacao: null,
        certificate_file_id: null,
        removed_at: null,
        ...fields,
      },
    },
    { newId, now: new Date() },
  );
}

function clientOp(user: SeedUser, fields: Record<string, unknown>, id = newId()): Op {
  return makeOp(
    {
      kind: 'create',
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.userId,
      device_id: user.deviceId,
      path: `registry/client/${id}`,
      value: {
        id,
        kind: 'client',
        name: 'Cliente seed',
        cnpj: null,
        contact_name: null,
        contact_phone: null,
        sites: [],
        removed_at: null,
        ...fields,
      },
    },
    { newId, now: new Date() },
  );
}

function manufacturerOp(user: SeedUser, fields: Record<string, unknown>, id = newId()): Op {
  return makeOp(
    {
      kind: 'create',
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.userId,
      device_id: user.deviceId,
      path: `registry/manufacturer/${id}`,
      value: { id, kind: 'manufacturer', name: 'Fabricante seed', gender: null, number: null, removed_at: null, ...fields },
    },
    { newId, now: new Date() },
  );
}

function voltageClassOp(user: SeedUser, fields: Record<string, unknown>, id = newId()): Op {
  return makeOp(
    {
      kind: 'create',
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.userId,
      device_id: user.deviceId,
      path: `registry/voltage_class/${id}`,
      value: { id, kind: 'voltage_class', name: '13,8 kV', gender: null, number: null, removed_at: null, ...fields },
    },
    { newId, now: new Date() },
  );
}

async function seedUser(page: Page, account: { companyId: string; userId: string }, database: string): Promise<SeedUser> {
  const deviceId = await readDeviceId(page, database);
  return { companyId: account.companyId, userId: account.userId, deviceId };
}

async function syncNow(page: Page): Promise<void> {
  const badge = page.locator('.app-bar [data-testid="sync-badge"]');
  await badge.click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await button.click();
  await expect(badge).toHaveAttribute('data-pending', '0', { timeout: 20_000 });
}

test('@p0 2.1-E2E-001 Cadastros: tabs render with Instrumentos default and remembered, and a new instrument autosaves field by field', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  await signIn(page, account.email);

  await page.getByRole('link', { name: /Cadastros/ }).click();
  const tablist = page.getByRole('tablist', { name: 'Cadastros' });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab')).toHaveCount(6);
  await expect(page.getByRole('tab', { name: 'Instrumentos' })).toHaveAttribute('aria-selected', 'true');

  // Switch to Empresa, leave and come back: the same tab-session remembers it (AC1).
  await page.getByRole('tab', { name: 'Empresa' }).click();
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/');
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Instrumentos' }).click();

  // Create an instrument: every field commits its own op, no Save button anywhere in the panel.
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Salvar' })).toHaveCount(0);

  await panel.getByLabel('Código').fill('9Z');
  await panel.getByLabel('Nome').fill('Instrumento de teste E2E');
  await panel.getByLabel('Data de calibração').fill('2026-01-15');
  await panel.getByLabel('Intervalo de calibração (meses)').fill('12');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  // Validity is read-only and derived: 2026-01-15 + 12 months = 15/01/2027.
  await page.getByRole('button', { name: /9Z/ }).click();
  await expect(page.locator('.registry-panel')).toContainText('15/01/2027');

  const row = page.getByRole('button', { name: /9Z/ });
  await expect(row).toContainText('9Z');
  await expect(row).toContainText('Instrumento de teste E2E');
});

test('@p2 tabs-phone-selector-001 Cadastros: a one-row selector replaces the tablist below 768px', async ({ page, seed }) => {
  const account = seed.companies[0];
  await signIn(page, account.email);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: /Cadastros/ }).click();

  await expect(page.getByRole('tablist')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Instrumentos' });
  await expect(trigger).toBeVisible();

  await trigger.click();
  // React Aria labels the menu by its trigger (the current tab's name), not by a
  // separate `aria-label` -- same as `tabs.test.tsx`.
  const menu = page.getByRole('menu', { name: 'Instrumentos' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(6);
  // The popover's hidden dismiss buttons say "Fechar", never React Aria's "Descartar" (Epic 2 retro D-8).
  await expect(page.getByRole('button', { name: 'Descartar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fechar', exact: true })).not.toHaveCount(0);

  await menu.getByRole('menuitemradio', { name: 'Clientes' }).click();
  await expect(page.getByRole('button', { name: 'Clientes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ })).toBeVisible();

  // AC5: the toolbar button is followed directly by the list/empty state, with the
  // helper paragraph after it -- not between the button and the list. On an empty
  // registry the one action lives inside the empty state (Epic 2 retro D-8), which still
  // comes before the note.
  const newClientBox = await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).boundingBox();
  const listOrEmptyBox = await page.locator('.registry-list, .home-empty').first().boundingBox();
  const noteBox = await page.locator('.section-note').first().boundingBox();
  expect(newClientBox).not.toBeNull();
  expect(listOrEmptyBox).not.toBeNull();
  expect(noteBox).not.toBeNull();
  expect(newClientBox!.y).toBeLessThanOrEqual(listOrEmptyBox!.y + listOrEmptyBox!.height);
  expect(newClientBox!.y).toBeLessThan(noteBox!.y);
  expect(listOrEmptyBox!.y).toBeLessThan(noteBox!.y);

  // AC3: the selection persists through Dexie `local_prefs`, same as the desktop tablist
  // (`2.1-E2E-001`) -- a reload still shows Clientes, not the default Instrumentos.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Clientes', exact: true })).toBeVisible();
});

test('@p2 tabs-phone-selector-003 Cadastros: Critérios de aceitação keeps its note-above-table order at 390px', async ({
  page,
  seed,
}) => {
  // Critérios has no toolbar/list, so the phone `.registry-main` reorder rule (AC5) must
  // not touch it: the note stays directly above the table, not pushed after it.
  const account = seed.companies[0];
  await signIn(page, account.email);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('button', { name: 'Instrumentos' }).click();
  await page.getByRole('menuitemradio', { name: 'Critérios de aceitação' }).click();

  const noteBox = await page.locator('.section-note').first().boundingBox();
  const tableBox = await page.getByRole('table').boundingBox();
  expect(noteBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(noteBox!.y).toBeLessThan(tableBox!.y);
});

test('@p2 tabs-phone-selector-002 Cadastros: the six-tab tablist is exposed at 768px and up', async ({ page, seed }) => {
  const account = seed.companies[0];
  await signIn(page, account.email);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('link', { name: /Cadastros/ }).click();

  const tablist = page.getByRole('tablist', { name: 'Cadastros' });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Instrumentos', exact: true })).toHaveCount(0);
});

test('@p1 2.1-E2E-002 an expired instrument sorts first and reads amber, never disabled', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  const expiredId = newId();
  const validId = newId();
  await seedOutbox(page, database, [
    instrumentOp(user, { code: 'Z9', calibrated_at: '2020-01-01', calibration_interval_months: 1 }, expiredId),
    instrumentOp(user, { code: 'A1', calibrated_at: '2026-01-01', calibration_interval_months: 120 }, validId),
  ]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();

  const rows = page.locator('.registry-list .registry-row');
  await expect(rows.first()).toContainText('Z9');
  await expect(rows.first().locator('.rr-expired')).toBeVisible();
  await expect(rows.first()).not.toHaveAttribute('aria-disabled', 'true');
});

test('@p1 2.1-E2E-003 an unreferenced instrument is removed behind a Confirm dialog, with undo', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  const id = newId();
  await seedOutbox(page, database, [instrumentOp(user, { code: 'R1' }, id)]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();

  await page.getByRole('button', { name: /R1/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByRole('button', { name: 'Remover' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remover' }).click();

  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('R1 removido');
  await toast.getByRole('button', { name: 'Desfazer' }).click();

  await expect(page.getByRole('button', { name: /R1/ })).toBeVisible();
});

test('@p2 2.1-E2E-004 an instrument created offline lands in the outbox at once and pushes on reconnect', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill('OFF1');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  await expect(page.getByRole('button', { name: /OFF1/ })).toBeVisible();
  const pending = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(pending.some((row) => row.status === 'pending' && row.path.startsWith('registry/instrument/'))).toBe(true);

  await context.setOffline(false);
  await syncNow(page);
  const afterSync = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(afterSync.every((row) => row.status !== 'pending' || !row.path.startsWith('registry/instrument/'))).toBe(true);
});

test('@p2 2.1-E2E-005 paired fields in the same field-grid row keep the same control top, even when one label wraps', async ({
  page,
  seed,
}) => {
  // Tablet width, where "Intervalo de calibração (meses)" wraps to two lines beside
  // the single-line "Data de calibração" — the exact row a real-browser review found
  // misaligned before the `.field-grid` subgrid fix (registries.css).
  await page.setViewportSize({ width: 768, height: 1024 });
  const account = seed.companies[0];
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();

  const calibratedAtBox = await panel.getByLabel('Data de calibração').boundingBox();
  const intervalBox = await panel.getByLabel('Intervalo de calibração (meses)').boundingBox();
  expect(calibratedAtBox).not.toBeNull();
  expect(intervalBox).not.toBeNull();
  expect(Math.abs(intervalBox!.y - calibratedAtBox!.y)).toBeLessThanOrEqual(1);

  // The RBC toggle stretches to the same row height as "Certificado RBC nº" and its
  // control (the toggle button) starts at the same top as that input.
  const certNumberBox = await panel.getByLabel('Certificado RBC nº').boundingBox();
  const rbcToggleBox = await panel.getByRole('switch', { name: 'Acreditado pela RBC' }).boundingBox();
  expect(certNumberBox).not.toBeNull();
  expect(rbcToggleBox).not.toBeNull();
  expect(Math.abs(rbcToggleBox!.y - certNumberBox!.y)).toBeLessThanOrEqual(1);
});

/*
 * 2.4-E2E. Clientes: create with name/CNPJ/site/contact (AC1), CNPJ validation (I/O
 * matrix), a referenced client offers only Arquivar (AC1), and offline create.
 */

test('@p0 2.4-E2E-001 Clientes: a new client autosaves field by field and the row shows name + CNPJ', async ({ page, seed }) => {
  const account = seed.companies[0];
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();

  await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Salvar' })).toHaveCount(0);

  await panel.getByLabel('Nome').fill('Cliente E2E Ltda');
  await panel.getByLabel('CNPJ').fill('00000000000100');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  const row = page.getByRole('button', { name: /Cliente E2E Ltda/ });
  await expect(row).toContainText('Cliente E2E Ltda');
  await expect(row).toContainText('CNPJ 00.000.000/0001-00');
});

test('@p1 2.4-E2E-002 a non-14-digit CNPJ shows an inline error and never autosaves', async ({ page, seed }) => {
  const account = seed.companies[0];
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();

  await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Nome').fill('Cliente CNPJ inválido');
  await panel.getByLabel('CNPJ').fill('123');
  await expect(panel.getByText('CNPJ inválido')).toBeVisible();
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  await page.getByRole('button', { name: /Cliente CNPJ inválido/ }).click();
  await expect(page.locator('.registry-panel').getByLabel('CNPJ')).toHaveValue('');
});

test('@p1 2.4-E2E-003 a client referenced by a Project offers only Arquivar', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  const clientId = newId();
  await seedOutbox(page, database, [
    clientOp(user, { name: 'Cliente Referenciado' }, clientId),
    projectCreateOp(user, newId(), clientId),
  ]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();

  await page.getByRole('button', { name: /Cliente Referenciado/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel.getByRole('button', { name: 'Arquivar' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /^Remover$/ })).toHaveCount(0);
});

test('@p2 2.4-E2E-004 a client created offline lands in the outbox at once and pushes on reconnect', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Nome').fill('Cliente Offline');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  await expect(page.getByRole('button', { name: /Cliente Offline/ })).toBeVisible();
  const pending = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(pending.some((row) => row.status === 'pending' && row.path.startsWith('registry/client/'))).toBe(true);

  await context.setOffline(false);
  await syncNow(page);
  const afterSync = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(afterSync.every((row) => row.status !== 'pending' || !row.path.startsWith('registry/client/'))).toBe(true);
});

/*
 * 2.5-E2E. Fabricantes and Classes de tensão: create autosaves and is queryable at once
 * (AC1), and an offline create pushes on reconnect (AC4).
 */

test('@p0 2.5-E2E-001 Fabricantes: a new manufacturer autosaves and a seeded one is queryable at once', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  // Queryable at once (AC1): a manufacturer another device already synced renders with no further action.
  await seedOutbox(page, database, [manufacturerOp(user, { name: 'Megabras seed' })]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Fabricantes' }).click();
  await expect(page.getByRole('button', { name: /Megabras seed/ })).toBeVisible();

  // Autosaves field by field, no Save button.
  await page.getByRole('button', { name: /^(Novo|Cadastrar) fabricante$/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
  await panel.getByLabel('Nome').fill('Schneider E2E');
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();

  await expect(page.getByRole('button', { name: /Schneider E2E/ })).toBeVisible();
});

test('@p0 2.5-E2E-002 Classes de tensão: a new voltage class autosaves and a seeded one is queryable at once', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  await seedOutbox(page, database, [voltageClassOp(user, { name: '34,5 kV seed' })]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Classes de tensão' }).click();
  await expect(page.getByRole('button', { name: /34,5 kV seed/ })).toBeVisible();

  await page.getByRole('button', { name: /^(Nova classe|Cadastrar classe de tensão)$/ }).click();
  const panel = page.locator('.registry-panel');
  // Epic 2 retro D-6: a value in kV, no name and no grammar fields.
  await expect(panel.getByLabel('Nome')).toHaveCount(0);
  await expect(panel.getByRole('radiogroup')).toHaveCount(0);
  const value = panel.getByLabel('Valor em kV');
  await value.fill('abc');
  await value.blur();
  await expect(panel.getByRole('alert')).toHaveText('Informe só o número, por exemplo 15 ou 17,5');
  const outbox = await readStore<{ path: string }>(page, database, 'outbox');
  expect(outbox.filter((row) => row.path.startsWith('registry/voltage_class/')).length).toBe(1);

  await value.fill('17,5');
  await value.blur();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: '17,5 kV' })).toBeVisible();
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();

  await expect(page.getByRole('button', { name: '17,5 kV', exact: true })).toBeVisible();
});

test('@p2 2.5-E2E-003 a manufacturer created offline lands in the outbox at once and pushes on reconnect', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Fabricantes' }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: /^(Novo|Cadastrar) fabricante$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Nome').fill('Fabricante Offline');
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();

  await expect(page.getByRole('button', { name: /Fabricante Offline/ })).toBeVisible();
  const pending = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(pending.some((row) => row.status === 'pending' && row.path.startsWith('registry/manufacturer/'))).toBe(true);

  await context.setOffline(false);
  await syncNow(page);
  const afterSync = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(afterSync.every((row) => row.status !== 'pending' || !row.path.startsWith('registry/manufacturer/'))).toBe(true);
});

/* 2.6-E2E. Critérios de aceitação: a read-only table with no row actions (AC3). */

test('@p0 2.6-E2E-001 Critérios de aceitação renders the seeded criteria as a read-only table', async ({ page, seed }) => {
  const account = seed.companies[0];
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Critérios de aceitação' }).click();

  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  for (const criterion of SEEDED_CRITERIA) {
    await expect(table).toContainText(criterion.label);
    await expect(table).toContainText(formatCriterionValue(criterion));
  }
  await expect(table.getByRole('button')).toHaveCount(0);

  // Card-stacked at phone width (`app.css`'s `.data-table` phone rule): the long "used by"
  // free text must never push the page wider than the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('@p0 2.3-E2E-001 Empresa: every field autosaves its own op and the preview follows', async ({ page, seed }) => {
  // Company B: its Empresa row is written only by this test, so the first visit is a fresh one.
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Empresa' }).click();

  const form = page.locator('.empresa-form');
  await expect(form).toBeVisible();
  // AC 2.3-1: no Save button anywhere on the surface.
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
  // The three FO.SERV-03 defaults are in the boxes from the first render, before anything
  // is committed (Epic 2 retro D-5), and leaving one untouched writes nothing.
  await expect(form.getByLabel('Título do formulário')).toHaveValue('Relatório Técnico de Cabine Primária');
  await expect(form.getByLabel('Código do formulário')).toHaveValue('FO.SERV-03');
  await expect(form.getByLabel('Revisão do formulário')).toHaveValue('Revisão 01');
  await form.getByLabel('Código do formulário').click();
  await form.getByLabel('Revisão do formulário').click();
  expect((await readStore<{ path: string }>(page, database, 'outbox')).filter((row) => row.path.startsWith('registry/empresa/'))).toEqual([]);

  await form.getByLabel('Razão social').fill('Empresa E2E');
  // The CNPJ is checked like the Clientes one (Epic 2 retro D-8): 13 digits never commit.
  await form.getByLabel('CNPJ').fill('0000000000001');
  await form.getByLabel('Telefone').click();
  await expect(form.getByRole('alert')).toHaveText('CNPJ inválido — informe 14 dígitos');
  await form.getByLabel('CNPJ').fill('00000000000191');
  await form.getByLabel('Telefone').click();
  await expect(form.getByRole('alert')).toHaveCount(0);

  await form.getByLabel('Telefone').fill('(11) 0000-0000');
  await form.getByLabel('E-mail').fill('contato@exemplo.local');
  await form.getByLabel('Endereço').fill('Rua Um, 100');
  await form.getByLabel('Código do formulário').click();

  // AC 2.3-2: the preview re-renders from the current values and is out of the a11y tree.
  const preview = page.locator('.brand-preview');
  await expect(preview).toHaveAttribute('aria-hidden', 'true');
  await expect(preview).toContainText('Empresa E2E');
  await expect(preview).toContainText('Rua Um, 100 · (11) 0000-0000 · contato@exemplo.local');
  await expect(preview.locator('.bp-page')).toHaveCount(3);
  // The assets are missing, so both slots draw their placeholder.
  await expect(preview.locator('.bp-logo.bp-empty').first()).toBeVisible();

  // AC 2.3-4: the app chrome still reads PRODUTO, never the company name.
  await expect(page.locator('.app-bar')).not.toContainText('Empresa E2E');

  // One op per field, and no Save ever pressed.
  await expect
    .poll(async () => {
      const outbox = await readStore<{ path: string; kind: string }>(page, database, 'outbox');
      return outbox.filter((row) => row.path.startsWith('registry/empresa/')).map((row) => row.path.split('/').pop());
    })
    .toEqual(expect.arrayContaining(['cnpj', 'phone', 'email', 'address']));
  const outbox = await readStore<{ path: string; value: unknown }>(page, database, 'outbox');
  expect(outbox.filter((row) => row.path.endsWith('/cnpj')).map((row) => row.value)).toEqual(['00.000.000/0001-91']);

  // Reopening the tab shows the stored values (AC 2.3-1). The reload lands back on
  // /cadastros, which remembers Empresa as the selected tab.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.empresa-form').getByLabel('Razão social')).toHaveValue('Empresa E2E');
  await expect(page.locator('.empresa-form').getByLabel('Endereço')).toHaveValue('Rua Um, 100');
});

test('@p2 2.3-E2E-002 a logo picked on Empresa reaches the preview and uploads with its variants', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Empresa' }).click();

  // A 1x1 PNG: the smallest thing sharp can make a thumb and a print of.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.locator('.brand-tile.is-logo input[type="file"]').setInputFiles({
    name: 'logo-e2e.png',
    mimeType: 'image/png',
    buffer: png,
  });

  await expect(page.locator('.brand-tile.is-logo .tile-name')).toContainText('logo-e2e.png');
  // The picked bytes are drawn straight away, before any upload: the server has no thumb
  // to give yet, so the preview has to be reading this device's own original.
  await expect(page.locator('.brand-tile.is-logo img.thumb-image')).toBeVisible();
  await expect(page.locator('.brand-preview img.bp-image').first()).toBeVisible();
  const blobs = await readFileBlobs(page, database);
  expect(blobs).toHaveLength(1);

  await syncNow(page);
  await expect.poll(async () => (await readFileBlobs(page, database))[0]?.acked, { timeout: 20_000 }).toBe(true);
  // `syncNow` leaves the Sync status surface open; the Empresa tab is remembered.
  await page.goto('/cadastros');
  await expect(page.locator('.brand-tile.is-logo .tile-name')).toContainText('Enviado');
});

test('@p1 2.3-E2E-003 the Empresa tab fits 390, 768 and 1280 px in both themes, and the app bar stays PRODUTO', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  await signIn(page, account.email);
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Empresa' }).click();
  await page.locator('.empresa-form').getByLabel('Razão social').fill('Empresa Larga de Teste S.A.');
  await page.locator('.empresa-form').getByLabel('CNPJ').click();

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const [width, height] of [
      [390, 844],
      [768, 1024],
      [1280, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect(page.locator('.empresa-form')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `Empresa at ${width}px (${theme})`).toBeLessThanOrEqual(0);
      // AC 2.3-4 / NFR-15: no company brand in the chrome, on this surface or any other.
      await expect(page.locator('.app-bar')).not.toContainText('Empresa Larga');
      // AC 2.3-2: the preview is out of the accessibility tree at every width.
      await expect(page.locator('.brand-preview')).toHaveAttribute('aria-hidden', 'true');
    }
  }
  await page.emulateMedia({ colorScheme: null });

  // AC 2.3-4: with a company name set, the surface that draws a wordmark still draws
  // `PRODUTO` -- the brand lives only in the Empresa preview.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.locator('.app-bar .wordmark')).toHaveText('PRODUTO');
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Empresa' }).click();

  // Both brand tiles are operable from the keyboard: the visible button is the one tab
  // stop and it opens the native picker.
  for (const tile of ['.brand-tile.is-logo', '.brand-tile:not(.is-logo)']) {
    const button = page.locator(`${tile} button.btn-text`);
    await expect(button).toBeVisible();
    await button.focus();
    await expect(button).toBeFocused();
  }
});

/*
 * Epic 2 retrospective fixes (E2-A1 to E2-A3). Names carry a per-run suffix: the test
 * companies keep their registries across the specs of one run.
 */

const runSuffix = () => Date.now().toString(36).slice(-5);

/** Opens Sync status and runs one cycle; the caller decides what "done" means. */
async function runOneCycle(page: Page): Promise<void> {
  await page.locator('.app-bar [data-testid="sync-badge"]').click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await button.click();
}

test('@p0 2.5-E2E-004 the instrument form picks its Fabricante from the registry and creates one offline (Epic 2 retro D-2)', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  const name = `Celtta ${runSuffix()}`;
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Instrumentos' }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill('7F');
  await panel.getByLabel('Nome').click();

  // Desktop: the Combobox directly, with "Criar “…”" last for a name the registry lacks.
  const fabricante = panel.getByRole('combobox', { name: 'Fabricante' });
  await fabricante.pressSequentially(name);
  await page.getByRole('option', { name: `Criar “${name}”` }).click();
  await expect(fabricante).toHaveValue(name);

  // One batch: the new Fabricantes entry and the instrument field that names it (AC 2.5-3).
  const outbox = await readStore<{ path: string; kind: string; batch_id: string | null; value: unknown }>(page, database, 'outbox');
  const created = outbox.find((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/'));
  const field = outbox.find((row) => row.path.endsWith('/manufacturer') && row.path.startsWith('registry/instrument/'));
  expect(created?.value).toMatchObject({ kind: 'manufacturer', name });
  expect(field?.value).toBe(name);
  expect(created!.batch_id).toBe(field!.batch_id);

  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: /^7F / })).toContainText(name);
  // The entry is in the registry on this device at once, still offline.
  await page.getByRole('tab', { name: 'Fabricantes' }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();

  // Picking an existing entry offers no "Criar" for it.
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await page.getByRole('button', { name: /^7F / }).click();
  await panel.getByRole('combobox', { name: 'Fabricante' }).fill('');
  await panel.getByRole('combobox', { name: 'Fabricante' }).pressSequentially(name.toUpperCase());
  await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /Criar/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await context.setOffline(false);
  await runOneCycle(page);
  await expect(page.locator('.app-bar [data-testid="sync-badge"]')).toHaveAttribute('data-pending', '0', { timeout: 20_000 });
});

test('@p0 2.5-E2E-005 a server merge converges on the device that sent it, over two sync cycles (Epic 2 retro D-1)', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const suffix = runSuffix();
  const name = `Legrand ${suffix}`;
  const duplicate = `LEGRAND ${suffix.toUpperCase()} `;
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Fabricantes' }).click();

  const panel = page.locator('.registry-panel');
  await page.getByRole('button', { name: /^(Novo|Cadastrar) fabricante$/ }).click();
  await panel.getByLabel('Nome').fill(name);
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await syncNow(page);

  // Cycle 1: the near-duplicate and its gender reach the server, but the pull does not
  // reach the device (a 4xx ends the pull phase at once, with no retry).
  await page.goto('/cadastros');
  await page.getByRole('button', { name: /^(Novo|Cadastrar) fabricante$/ }).click();
  await panel.getByLabel('Nome').fill(duplicate);
  await panel.getByRole('radio', { name: 'Feminino' }).click();
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`legrand ${suffix}`, 'i') })).toHaveCount(2);
  await page.route('**/api/sync/company?**', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'sync_batch_invalid', message: 'blocked by the test' }) }),
  );
  await runOneCycle(page);
  await expect(page.locator('.app-bar [data-testid="sync-badge"]')).toHaveAttribute('data-pending', '0', { timeout: 20_000 });

  // Still two rows here; the one the server merged away gets one more edit.
  await page.goto('/cadastros');
  await expect(page.getByRole('button', { name: new RegExp(`legrand ${suffix}`, 'i') })).toHaveCount(2);
  await page.getByRole('button', { name: duplicate.trim(), exact: true }).click();
  await panel.getByRole('radio', { name: 'Plural' }).click();
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();

  // Cycle 2: the later edit is redirected onto the survivor, and the pull retires the duplicate.
  await page.unroute('**/api/sync/company?**');
  await syncNow(page);
  await page.goto('/cadastros');
  const rows = page.getByRole('button', { name: new RegExp(`legrand ${suffix}`, 'i') });
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAccessibleName(name);
  await rows.click();
  await expect(panel.getByRole('radio', { name: 'Feminino' })).toBeChecked();
  await expect(panel.getByRole('radio', { name: 'Plural' })).toBeChecked();

  // A third cycle changes nothing: the device and the server agree.
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await syncNow(page);
  await page.goto('/cadastros');
  await expect(page.getByRole('button', { name: new RegExp(`legrand ${suffix}`, 'i') })).toHaveCount(1);
});

test('@p1 2.1-E2E-006 on a phone the instrument form takes the whole screen, and a row keeps body and meta apart (Epic 2 retro D-7)', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  const code = `P${runSuffix().toUpperCase()}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);
  await seedOutbox(page, database, [
    instrumentOp(user, { code, name: 'Megôhmetro', model: 'MI 5500', manufacturer: 'Megabras', serial: 'S1' }),
  ]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();

  const row = page.getByRole('button', { name: new RegExp(`^${code} `) });
  const primary = await row.locator('.rr-primary').boundingBox();
  const secondary = await row.locator('.rr-secondary').boundingBox();
  expect(secondary!.y).toBeGreaterThanOrEqual(primary!.y + primary!.height);

  await row.click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.locator('.registry-list')).toBeHidden();

  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.locator('.registry-list')).toBeVisible();
});

test('@p1 2.1-E2E-007 the Código stays editable, and a field left unchanged writes nothing (Epic 2 retro D-8)', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  const code = `K${runSuffix().toUpperCase()}`;
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill(`${code}X`);
  await panel.getByLabel('Nome').fill('Terrômetro');
  await panel.getByLabel('Código').click();
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();

  // The typo is fixed on the existing instrument.
  await page.getByRole('button', { name: new RegExp(`^${code}X `) }).click();
  await panel.getByLabel('Código').fill(code);
  await panel.getByLabel('Nome').click();
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${code} `) })).toBeVisible();

  // Focusing and leaving a field, or retyping the same value, puts nothing.
  const count = async () => (await readStore<{ path: string }>(page, database, 'outbox')).filter((r) => r.path.startsWith('registry/instrument/')).length;
  const before = await count();
  await page.getByRole('button', { name: new RegExp(`^${code} `) }).click();
  await panel.getByLabel('Nome').fill('Terrômetro');
  await panel.getByLabel('Código').click();
  await panel.getByLabel('Nome').click();
  await panel.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(await count()).toBe(before);
});
