import type { Page } from '@playwright/test';
import { expect } from './merged-fixtures.ts';

/*
 * Story 14.2: "Adicionar local" asks the Função and the name in a dialog, on the Template
 * composer and on the relatório tree alike. A spec that only needs a local in place goes
 * through this helper; the spec that walks the dialog itself is `local-painel-coluna.spec.ts`.
 */

export interface AddLocalOptions {
  /** The Função's label as the radio reads: "Entrada", "Primária", "Transformação", "Distribuição". */
  funcao: string;
  /** The name to store; the one the dialog proposes for the Função when absent. */
  name?: string;
}

/** Taps "Adicionar local", picks the Função, types the name when one is given, and confirms. */
export async function addLocal(page: Page, { funcao, name }: AddLocalOptions): Promise<void> {
  await page.getByRole('button', { name: 'Adicionar local', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar local' });
  await dialog.getByRole('radio', { name: funcao, exact: true }).click();
  if (name !== undefined) await dialog.getByRole('textbox', { name: 'Nome', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Adicionar local', exact: true }).click();
  await expect(dialog).toBeHidden();
}
