import { makeOp, type Op } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test } from './support/merged-fixtures.ts';
import { readDeviceId, readFileBlobs, readStore, seedOutbox, type SeedUser } from './support/outbox.ts';

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
  await page.getByRole('button', { name: 'Novo instrumento' }).click();
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
  await page.getByRole('button', { name: 'Novo instrumento' }).click();
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
  await page.getByRole('button', { name: 'Novo instrumento' }).click();
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

test('@p1 2.3-E2E-001 Empresa: every field autosaves its own op and the preview follows', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Empresa' }).click();

  const form = page.locator('.empresa-form');
  await expect(form).toBeVisible();
  // AC 2.3-1: no Save button anywhere on the surface.
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0);
  // The three FO.SERV-03 defaults are already in the box before anything is typed
  // (they arrive with the row the first committed field creates).
  await form.getByLabel('Razão social').fill('Empresa E2E');
  await form.getByLabel('CNPJ').click();
  await expect(form.getByLabel('Título do formulário')).toHaveValue('Relatório Técnico de Cabine Primária');
  await expect(form.getByLabel('Código do formulário')).toHaveValue('FO.SERV-03');
  await expect(form.getByLabel('Revisão do formulário')).toHaveValue('Revisão 01');

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
    .toEqual(expect.arrayContaining(['phone', 'email', 'address']));

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
