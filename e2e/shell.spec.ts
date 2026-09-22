import { expect, test } from './support/merged-fixtures.ts';

test('@p0 the web shell renders the product name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PRODUTO');
});
