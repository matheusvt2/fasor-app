import { expect, test } from './support/merged-fixtures.ts';
import {
  closeEveryTab,
  iconDrawn,
  NEXT_BUILD_SYMBOL,
  runningVersion,
  serveNextBuild,
  shellCacheNames,
  signInForDurability,
  spriteDeclares,
  usuariosIcon,
  waitForNextShellInstalled,
  waitForShellCache,
} from './support/durability.ts';

/*
 * Fix batch e26u (2026-11-23), reported from production right after the v0.13.0 deploy:
 * Home's new "Usuários" shortcut (Story 26.9) had no icon on a phone, while Templates and
 * Cadastros had theirs.
 *
 * The cause, reproduced here before the fix. The sprite was `/sprite.svg`, one path for
 * every build. On the first launch after a deploy the document and its hashed chunks are
 * the new build's (the navigation is network-first), but the worker in control is still
 * the old build's, and it answered `/sprite.svg` from its own cache: the old sprite, with
 * no `i-users`. With this scenario on that code the first launch of the new build named
 * the new symbol and drew an empty box (the sprite the page was given lacked the symbol,
 * the server's had it), and the second launch drew it.
 *
 * The sprite now carries a content hash like every chunk (`src/styles/sprite.ts`), so a
 * page asks for the sprite of its own build by a name no other build's cache answers.
 *
 * Against the built bundle on the preview server, with the real worker, like every
 * durability scenario. Alone in the `solo` lane: `serveNextBuild` rewrites the built
 * `sw.js` on disk, as 1.8-E2E-006 does, and two such tests at once would read each other's.
 */

test('@p0 e26u-E2E-001 the first launch after an update draws the icon the new build added to the sprite, and the launch after it draws it with no network', async ({
  page,
  context,
  seed,
  browserName,
}) => {
  // Closing every tab is watched through CDP, and Playwright only routes the requests a
  // worker makes itself (its network-first navigation, its precache) on Chromium; the rule
  // under test is the same `public/sw.js` everywhere, and `sw-lifecycle.test.ts` runs it too.
  test.skip(browserName !== 'chromium', 'needs CDP to watch the tabs close and service-worker request routing (Chromium only)');
  test.setTimeout(180_000);

  const account = seed.companies[0];
  await signInForDurability(page, context, account.email);
  const cached = await waitForShellCache(page);
  const [original] = await shellCacheNames(page);
  const version = await runningVersion(page);
  expect(original).toBe(`releng-shell-${version}`);

  // The running build: its sprite is a hashed file of the shell, precached with the chunks,
  // and Home draws the "Usuários" shortcut's icon from it.
  const sprite = cached.find((path) => /^\/assets\/sprite-[^/]+\.svg$/.test(path));
  expect(sprite, 'the shell cache holds a hashed sprite').toBeDefined();
  expect(cached).not.toContain('/sprite.svg');
  await expect(usuariosIcon(page)).toHaveAttribute('href', `${sprite}#i-users`);
  await expect.poll(() => iconDrawn(usuariosIcon(page)), { timeout: 10_000 }).toBe(true);
  expect(await spriteDeclares(page, usuariosIcon(page), NEXT_BUILD_SYMBOL)).toBe(false);

  // A release that adds an icon is deployed while the app is closed.
  const restoreBuild = await serveNextBuild(context);
  try {
    // The first launch since: the old build's worker is the one in control, the document
    // and its entry chunk are the new build's.
    let tab = await closeEveryTab(context);
    await tab.goto('/');
    await expect(tab.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await expect(tab.locator('meta[name="shell-build"]')).toHaveCount(1);
    expect(await runningVersion(tab)).toBe(`${version}-next`);

    // The new build's Home names the symbol only its own sprite declares, and draws it.
    const nextSprite = sprite!.replace(/\.svg$/, '-next.svg');
    await expect(usuariosIcon(tab)).toHaveAttribute('href', `${nextSprite}#${NEXT_BUILD_SYMBOL}`);
    expect(await spriteDeclares(tab, usuariosIcon(tab), NEXT_BUILD_SYMBOL), 'the sprite this page is given is its own build\'s').toBe(true);
    await expect
      .poll(() => iconDrawn(usuariosIcon(tab)), { timeout: 10_000, message: 'the first launch of the new build draws the icon it added' })
      .toBe(true);
    // An icon both builds have is drawn too, from the same sprite.
    const templates = tab.locator('.shortcut-card[href="/templates"] svg.ico:not(.chev) use');
    await expect(templates).toHaveAttribute('href', `${nextSprite}#i-layers`);
    expect(await iconDrawn(templates)).toBe(true);

    // During that launch the new worker precached its shell, the sprite included. The app
    // is closed and opened again with no network: the new shell comes from that cache and
    // no icon goes blank.
    await waitForNextShellInstalled(tab, `${original}-next`);
    tab = await closeEveryTab(context);
    await context.setOffline(true);
    try {
      await tab.goto('/');
      await expect(tab.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
      await expect(tab.locator('meta[name="shell-build"]')).toHaveCount(1);
      expect(await runningVersion(tab)).toBe(`${version}-next`);
      await expect(usuariosIcon(tab)).toHaveAttribute('href', `${nextSprite}#${NEXT_BUILD_SYMBOL}`);
      await expect
        .poll(() => iconDrawn(usuariosIcon(tab)), { timeout: 10_000, message: 'the next launch draws the new icon with no network' })
        .toBe(true);
      expect(await iconDrawn(tab.locator('.shortcut-card[href="/templates"] svg.ico:not(.chev) use'))).toBe(true);
    } finally {
      await context.setOffline(false);
    }
  } finally {
    await restoreBuild();
  }
});
