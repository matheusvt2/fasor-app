import { expect, signIn, test } from './support/merged-fixtures.ts';

/*
 * TC-4: the theme control's on state is proved in a real browser — the visible `.seg`
 * button carries `aria-checked="true"`, which is the selector `components.css` fills —
 * the root element follows at once, the choice survives a reload, and "Sistema" removes
 * the attribute again. Plus the storage row and the link to Sync status.
 */

test('@p1 1.6-E2E-004 Account: Tema applies at once, survives a reload, and Armazenamento reads a value', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  await signIn(page, account.email);
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Conta' })).toBeVisible();

  const group = page.getByRole('radiogroup', { name: 'Tema' });
  await expect(group).toHaveClass(/segmented/);
  const sistema = group.getByRole('radio', { name: 'Sistema' });
  const escuro = group.getByRole('radio', { name: 'Escuro' });
  await expect(sistema).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

  await escuro.click();
  // The visible button is the styled element: `.segmented .seg[aria-checked="true"]`.
  await expect(escuro).toHaveClass(/seg/);
  await expect(escuro).toHaveAttribute('aria-checked', 'true');
  await expect(group.locator('.seg[aria-checked="true"]')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // The mock's check glyph only shows on the selected segment.
  await expect(escuro.locator('.check')).toBeVisible();
  await expect(sistema.locator('.check')).toBeHidden();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Escuro' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Sistema' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

  // The APG radiogroup keyboard contract, in a real browser. The regression this guards:
  // a Tab that landed on an unchecked segment, plus a key that moved no focus, used to
  // rewrite the stored theme without the user choosing anything.
  const claro = page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Claro' });
  await claro.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Roving tab stop: the checked segment is the group's only tab stop, so Tab arrives on
  // it rather than on the first segment. (Driving Tab from the page would walk the whole
  // App bar first; the attributes are the contract, and they are read from the real DOM.)
  const group2 = page.getByRole('radiogroup', { name: 'Tema' });
  await expect(claro).toHaveAttribute('tabindex', '0');
  await expect(group2.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('tabindex', '-1');
  await expect(group2.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('tabindex', '-1');

  // A key that moves nothing changes nothing.
  await claro.press('PageDown');
  await expect(claro).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Arrows move focus and selection together; Space on the focused segment is a no-op
  // when it is already the checked one.
  await claro.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Escuro' }).press(' ');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Home goes to the first segment and selects it.
  await page.getByRole('radio', { name: 'Escuro' }).press('Home');
  await expect(page.getByRole('radio', { name: 'Sistema' })).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

  // Armazenamento: the kernel's line, with a value the browser actually reported.
  const storage = page.getByTestId('storage-value');
  await expect(storage).toBeVisible();
  await expect(storage.locator('.sr-value.t-value')).not.toBeEmpty();
  await expect(storage).toContainText('relatório');

  await page.getByRole('link', { name: 'Ver status de sincronização' }).click();
  await expect(page).toHaveURL(/\/sync$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sincronização' })).toBeVisible();
});
