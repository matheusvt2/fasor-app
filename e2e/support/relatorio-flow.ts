import { STANDARD_TEMPLATE_NAME } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { expect } from './merged-fixtures.ts';

/*
 * The relatório's birth as a person does it (Stories 4.1 and 4.3): Home › "Novo relatório"
 * with the client and the obra created inline, then the Project's "Novo relatório" dialog
 * and the Sumário. Shared by `relatorio.spec.ts` and `export.spec.ts`.
 */

export const CLIENT = 'Condomínio Teste';
export const SITE = 'Torre Norte';

/** Types a date into a React Aria date field: click its day segment, then the eight digits. */
export async function typeDate(dialog: Locator, label: string, digits: string): Promise<void> {
  await dialog.getByRole('group', { name: label }).getByRole('spinbutton').first().click();
  await dialog.page().keyboard.type(digits);
}

/** Home › "Novo relatório": creates the client and the obra inline and continues to the Project. */
export async function createProjectFromHome(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Novo relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo relatório' });
  await expect(dialog.getByRole('button', { name: 'Continuar' })).toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('combobox', { name: 'Cliente' }).fill(CLIENT);
  await page.getByRole('option', { name: `Criar “${CLIENT}”` }).click();
  await expect(page.getByText('Cliente criado no cadastro de Clientes')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Cliente' })).toHaveValue(CLIENT);
  await dialog.getByRole('combobox', { name: 'Local (obra)' }).fill(SITE);
  await page.getByRole('option', { name: `Criar “${SITE}”` }).click();
  await expect(dialog.getByRole('combobox', { name: 'Local (obra)' })).toHaveValue(SITE);
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  await expect(page.locator('.app-bar h1')).toHaveText('Obra');
}

/**
 * The Project's "Novo relatório" dialog, already open for a project born on Home: dates
 * typed, Criar. Criar opens Relatório setup at Etapa 1 with the focus on its band heading
 * (Epic 4 QA Q1); `whileOnSetup` runs there, then "Voltar" leads to the Sumário. Returns
 * the relatório id.
 */
export async function createRelatorio(page: Page, options: { whileOnSetup?: () => Promise<void> } = {}): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Novo relatório' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Cabine primária/ })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('combobox', { name: 'Template' })).toHaveValue(STANDARD_TEMPLATE_NAME);
  const create = dialog.getByRole('button', { name: 'Criar relatório' });
  await expect(create).toHaveAttribute('aria-disabled', 'true');
  await expect(create).toHaveAccessibleDescription('Criar relatório: falta a data de início');
  await typeDate(dialog, 'Início da parada', '06092026');
  // The end follows the start.
  await expect(dialog.getByRole('group', { name: 'Fim da parada' }).getByRole('spinbutton')).toHaveText(['06', '09', '2026']);
  await expect(create).not.toHaveAttribute('aria-disabled', 'true');
  await typeDate(dialog, 'Fim da parada', '08092026');
  await create.click();
  await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}\/setup\?etapa=1$/, { timeout: 30_000 });
  await expect(page.locator('.app-bar h1')).toHaveText('Dados do relatório');
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeFocused();
  const relatorioId = new URL(page.url()).pathname.split('/')[2]!;
  await options.whileOnSetup?.();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`), { timeout: 30_000 });
  await expect(page.locator('.app-bar h1')).toHaveText('Sumário');
  return relatorioId;
}
