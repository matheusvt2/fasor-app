import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 14.10-E2E (Story 14.10 part 11, `key-suggestion-options.html` option A, DESIGN.md › Suggestion
 * field): a reading that differs from a typed nameplate value shows an amber tray joined under
 * the field, "Sugerido: ⟨valor⟩" and two Secondary buttons, 48 px tall, stacked on phone and side
 * by side from 768 px, whose accessible names name the field. "Substituir" writes the confirm
 * pair, "Manter o digitado" discards the suggestion and keeps the typed value.
 *
 * Every test resets Empresa B, pushes a relatório of the standard template and opens the first
 * Chave seccionadora of Cubículo Enel; the values are typed first, then the reading's
 * suggestions are written as the reading job writes them (server ops) and pulled with
 * "Sincronizar agora".
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  op_id: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  meta: { source_suggestion_id?: string } | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

const TYPED = { n_serie: 'SU-TYPED-1', tipo: 'TIPO-TYPED-1' } as const;
const READ = { n_serie: '240815-07', tipo: 'TSE-500/15' } as const;

/** Types each value into its nameplate field and waits for its cell on the device. */
async function typeValues(page: Page, blockId: string, values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    const input = field(page, key).locator('input').first();
    await input.fill(value);
    await input.press('Enter');
    await expect.poll(async () => (await outbox(page)).some((op) => op.path === `sheet/${blockId}/nameplate/${key}` && op.value === value)).toBe(true);
  }
}

/** The field's tray, its two buttons by the field-named accessible names, and the field's label. */
async function trayOf(page: Page, key: keyof typeof READ) {
  const wrapper = field(page, key);
  const label = ((await wrapper.locator('.field-label').first().textContent()) ?? '').trim();
  expect(label).not.toBe('');
  const tray = wrapper.getByRole('group', { name: `${label}: a leitura difere do digitado` });
  return {
    wrapper,
    tray,
    replace: tray.getByRole('button', { name: `Substituir ${label} por ${READ[key]}`, exact: true }),
    keep: tray.getByRole('button', { name: `Manter o digitado em ${label}, ${TYPED[key]}`, exact: true }),
  };
}

test('@p0 14.10-E2E-030 the tray under a typed nameplate value: two 48 px Secondary buttons named after the field, inside the field and right under its input, stacked at 390 and side by side at 768 and 1280', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  await typeValues(page, ids.blockId, TYPED);
  for (const [key, value] of Object.entries(READ)) {
    await pushSuggestion(account.companyId, ids.relatorioId, { targetPath: `sheet/${ids.blockId}/nameplate/${key}`, value, actorId: account.userId });
  }
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const { wrapper, tray, replace, keep } = await trayOf(page, 'n_serie');
    await tray.scrollIntoViewIfNeeded();
    await expect(tray).toHaveClass(/\bsuggestion-tray\b/);
    await expect(tray.locator('.suggestion-tray-text')).toHaveText(`Sugerido: ${READ.n_serie}`);
    await expect(replace).toHaveText('Substituir');
    await expect(keep).toHaveText('Manter o digitado');
    await expect(replace).toHaveClass(/\bbtn-secondary\b/);
    await expect(keep).toHaveClass(/\bbtn-secondary\b/);
    // The typed value stays in the field above the tray.
    await expect(wrapper.locator('input').first()).toHaveValue(TYPED.n_serie);

    const box = (await wrapper.boundingBox())!;
    const input = (await wrapper.locator('input').first().boundingBox())!;
    const trayBox = (await tray.boundingBox())!;
    const a = (await replace.boundingBox())!;
    const b = (await keep.boundingBox())!;
    // The tray hangs off the input: no gap between them (within 2 px).
    expect(Math.abs(trayBox.y - (input.y + input.height)), `tray top at ${width}`).toBeLessThanOrEqual(2);
    for (const [name, button] of [
      ['Substituir', a],
      ['Manter o digitado', b],
    ] as const) {
      expect(button.height, `${name} height at ${width}`).toBeGreaterThanOrEqual(48);
      expect(button.y, `${name} below the input at ${width}`).toBeGreaterThanOrEqual(input.y + input.height - 2);
      expect(button.x, `${name} left edge at ${width}`).toBeGreaterThanOrEqual(box.x - 1);
      expect(button.x + button.width, `${name} right edge at ${width}`).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(button.y + button.height, `${name} bottom at ${width}`).toBeLessThanOrEqual(box.y + box.height + 1);
    }
    if (width === 390) {
      // Stacked: the second below the first.
      expect(b.y, 'stacked at 390').toBeGreaterThanOrEqual(a.y + a.height);
    } else {
      // Side by side, each at least 200 px wide.
      expect(Math.abs(b.y - a.y), `same row at ${width}`).toBeLessThanOrEqual(1);
      expect(a.width, `Substituir width at ${width}`).toBeGreaterThanOrEqual(200);
      expect(b.width, `Manter o digitado width at ${width}`).toBeGreaterThanOrEqual(200);
    }
  }
});

test('@p0 14.10-E2E-031 "Substituir" on one field writes the confirm pair, "Manter o digitado" on another discards the suggestion and keeps the typed value; after a reload no tray is left', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database, { width: 768 });
  await typeValues(page, ids.blockId, TYPED);
  const sid: Record<string, string> = {};
  for (const [key, value] of Object.entries(READ)) {
    sid[key] = await pushSuggestion(account.companyId, ids.relatorioId, { targetPath: `sheet/${ids.blockId}/nameplate/${key}`, value, actorId: account.userId });
  }
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();

  // "Substituir" on Nº de série: the suggested value with its provenance and the status, one batch.
  const serie = await trayOf(page, 'n_serie');
  await serie.replace.click();
  await expect(field(page, 'n_serie').locator('.suggestion-tray')).toHaveCount(0);
  await expect(field(page, 'n_serie').locator('input').first()).toHaveValue(READ.n_serie);
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `suggestion/${sid.n_serie}/status`)).toBe(true);
  let rows = await outbox(page);
  const status = rows.find((op) => op.path === `suggestion/${sid.n_serie}/status`)!;
  const value = rows.filter((op) => op.path === `sheet/${ids.blockId}/nameplate/n_serie`).find((op) => op.value === READ.n_serie)!;
  expect(status.value).toBe('confirmed');
  expect(value.meta).toMatchObject({ source_suggestion_id: sid.n_serie });
  expect(value.batch_id).toBe(status.batch_id);

  // "Manter o digitado" on Tipo: the suggestion discarded, the typed value untouched.
  const tipo = await trayOf(page, 'tipo');
  await tipo.keep.click();
  await expect(field(page, 'tipo').locator('.suggestion-tray')).toHaveCount(0);
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `suggestion/${sid.tipo}/status`).map((op) => op.value)).toEqual(['discarded']);
  rows = await outbox(page);
  expect(rows.filter((op) => op.path === `sheet/${ids.blockId}/nameplate/tipo`).map((op) => op.value)).toEqual([TYPED.tipo]);

  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(field(page, 'n_serie').locator('input').first()).toHaveValue(READ.n_serie);
  await expect(field(page, 'tipo').locator('input').first()).toHaveValue(TYPED.tipo);
  await expect(page.locator('#ficha-nameplate .suggestion-tray')).toHaveCount(0);
});
