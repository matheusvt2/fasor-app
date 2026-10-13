import type { Page } from '@playwright/test';
import { expect } from './merged-fixtures.ts';

/*
 * Status flow 2026-10-10: a relatório leaves Rascunho on its first field edit, and the Sumário
 * of an Em campo relatório opens the path to the last sheet a moment after it draws
 * (`expandToLastSheet`). A spec that comes back to the Sumário after editing a sheet can
 * therefore find a location row opening by itself between "is it collapsed?" and the click,
 * which would then close it again or wait for a button that no longer exists.
 */

/**
 * Leaves the location row `name` of the relatório tree expanded, whatever state it was in and
 * whether or not it opens by itself meanwhile: retried until the row reads "Recolher ⟨name⟩".
 */
export async function expandLocation(page: Page, name: string): Promise<void> {
  const expand = page.getByRole('button', { name: `Expandir ${name}`, exact: true });
  const collapse = page.getByRole('button', { name: `Recolher ${name}`, exact: true });
  await expect(async () => {
    if (!(await collapse.isVisible())) await expand.click({ timeout: 2_000 });
    await expect(collapse).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}
