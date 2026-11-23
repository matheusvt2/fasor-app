/*
 * The address of the icon sprite of THIS build, and the one place that names it.
 *
 * The sprite is imported as an asset, so the build emits it under a content-hashed name
 * (`/assets/sprite-<hash>.svg`) like every chunk, stylesheet and font, and the service
 * worker precaches it with them (`shellPrecache()` in `vite.config.ts`). `?no-inline`
 * keeps it a file whatever its size: a `<use>` cannot reference a `data:` URL.
 *
 * Fix batch e26u (2026-11-23): it used to be `public/sprite.svg`, served as `/sprite.svg`
 * by every build. On the first launch after a deploy the document and its chunks are the
 * new build's, but the worker in control is still the old one, and it answered that one
 * unhashed path from its own cache: a symbol the new build added drew nothing (the
 * "Usuários" card of Story 26.9, in production) and a changed one kept its old drawing
 * until a later launch. A hashed name cannot be answered with another build's file: the
 * old worker does not hold it and asks the network, and a tab held on an older shell asks
 * for that shell's name, which its pinned cache holds.
 */
import spriteUrl from './sprite.svg?no-inline';

/** The sprite file of this build: `/assets/sprite-<hash>.svg` once built. */
export const SPRITE_URL: string = spriteUrl;

/** The `href` of a `<use>` that draws the symbol `id` (`i-...`) of this build's sprite. */
export function spriteHref(id: string): string {
  return `${SPRITE_URL}#${id}`;
}
