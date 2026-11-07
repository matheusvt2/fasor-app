import type { EquipmentBlockType } from '@app/domain';
import { expect, type Locator, type Page } from '@playwright/test';
import { readStore } from './outbox.ts';

/*
 * Stories 14.7 and 14.8: driving Templates › "Tipos de equipamento" and the type editor
 * (`43-tipo-equipamento.html`) as a person does. Every expected word is the kernel's in the spec
 * that calls these; here are only the ways in.
 */

interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

/** Opens Templates from the address bar and waits for the type list. */
export async function openTypeList(page: Page): Promise<void> {
  await page.goto('/templates');
  await expect(page.getByRole('heading', { level: 2, name: 'Tipos de equipamento' })).toBeVisible({ timeout: 30_000 });
}

/** A library type's row of the list. */
export const libraryRow = (page: Page, type: EquipmentBlockType): Locator => page.locator(`ul[data-group="library-types"] > li[data-block-type="${type}"]`);

/** A company type's row of the list. */
export const companyRow = (page: Page, typeId: string): Locator => page.locator(`ul[data-group="company-types"] > li[data-type-id="${typeId}"]`);

/** "Duplicar" on a library type: the editor of the new draft opens; its id is answered. */
export async function duplicateLibraryType(page: Page, type: EquipmentBlockType): Promise<string> {
  await libraryRow(page, type).getByRole('button', { name: 'Duplicar' }).click();
  await expect(page).toHaveURL(/\/templates\/tipos\/[0-9a-f-]{36}$/);
  await expect(page.locator('.tipo-head h2')).toBeVisible();
  return new URL(page.url()).pathname.split('/')[3]!;
}

/** Selects one tab of the editor by the start of its label ("Critérios" matches "Critérios (2) · 1 aviso"). */
export async function editorTab(page: Page, word: string): Promise<void> {
  const tab = page.getByRole('tab', { name: new RegExp(`^${word}`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Types into an input of the editor and leaves it with Tab, as a person does (the blur writes the draft). */
export async function typeInto(input: Locator, text: string): Promise<void> {
  await input.click();
  await input.fill(text);
  await input.press('Tab');
}

/** The editor's "Publicar versão N". */
export const publishButton = (page: Page): Locator => page.locator('.sticky-action-bar').getByRole('button', { name: /^Publicar versão \d+$/ });

/** The device's company type row and its version rows, as Dexie holds them. */
export async function typeRows<TType, TVersion>(page: Page, database: string, typeId: string): Promise<{ type: TType | undefined; versions: TVersion[] }> {
  const records = await readStore<EntityRecord<unknown>>(page, database, 'entities');
  return {
    type: records.find((record) => record.entity === 'equipment_type' && record.id === typeId)?.row as TType | undefined,
    versions: records
      .filter((record) => record.entity === 'equipment_type_version' && (record.row as { type_id?: string }).type_id === typeId)
      .map((record) => record.row as TVersion)
      .sort((a, b) => (a as { version: number }).version - (b as { version: number }).version),
  };
}
