// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * AR-7: the sprite is a precachable file, not markup inside the hashed bundle. That only
 * holds while every `<use href={spriteHref('id')}>` under `src/` names a symbol the file
 * actually declares — otherwise an icon renders as nothing, offline and online alike.
 *
 * Fix batch e26u: and it is a file the build hashes. It lives under `src/` and is named by
 * `sprite.ts` alone, so no page can ask for a path that another build's worker answers
 * from its own cache (the blank "Usuários" icon on the first launch after v0.13.0).
 */

const webRoot = resolve(__dirname, '../..');
const spritePath = join(webRoot, 'src/styles/sprite.svg');
const sprite = readFileSync(spritePath, 'utf8');

/** Shipped source only: a test file may quote a pattern this test is looking for. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

const declared = new Set([...sprite.matchAll(/<symbol\s+id="([^"]+)"/g)].map((m) => m[1]!));

describe('icon sprite', () => {
  it('declares the four symbols the shell used to inline, plus the App bar back chevron, the Registries icons, the upload tile image glyph, the Templates row icons, the composer palette icons, the Project and Sumário glyphs (calendar, chevron down), the Export download glyph, the rail toggle (tree) and the sheet pencil, repeat, check-all and the unit tap-cycle (Epic 5), the camera and the upload arrow (Epic 6), the gallery pin, trash and chevron left (Stories 6.3-6.5), the Export share glyph (Story 7.5), the vision sparkles (Stories 9.3/9.5), the Dictation microphone (Story 9.4), the Photo viewer zoom in, zoom out and fit (Story 13.3), the camera torch and zoom-out (Story 13.2), the Home search glyph (Story 20.2), the audio stop, play and alert glyphs (Story 31.3)', () => {
    expect([...declared].sort()).toEqual([
      'i-alert',
      'i-archive',
      'i-back',
      'i-block',
      'i-book',
      'i-calendar',
      'i-camera',
      'i-check',
      'i-check-all',
      'i-chev-down',
      'i-chev-left',
      'i-chev-right',
      'i-close',
      'i-copy',
      'i-cycle',
      'i-doc',
      'i-download',
      'i-flag',
      'i-flash',
      'i-image',
      'i-layers',
      'i-lock',
      'i-mail',
      'i-mic',
      'i-minus',
      'i-pencil',
      'i-pin',
      'i-play',
      'i-plus',
      'i-repeat',
      'i-search',
      'i-share',
      'i-sparkles',
      'i-stop',
      'i-template',
      'i-trash',
      'i-tree',
      'i-up',
      'i-users',
      'i-zoom-fit',
      'i-zoom-in',
      'i-zoom-out',
    ]);
  });

  it('holds every symbol referenced under apps/web/src', () => {
    const referenced = new Set<string>();
    for (const file of sourceFiles(join(webRoot, 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/spriteHref\('([^']+)'\)/g)) {
        referenced.add(match[1]!);
      }
    }
    expect(referenced.size).toBeGreaterThan(30);
    for (const id of referenced) expect(declared, `sprite.svg is missing ${id}`).toContain(id);
  });

  it('is named by sprite.ts alone: no source file writes a sprite path of its own, and public/ serves no unhashed copy', () => {
    const helper = join(webRoot, 'src/styles/sprite.ts');
    for (const file of sourceFiles(join(webRoot, 'src'))) {
      if (file === helper) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} names a sprite file itself`).not.toMatch(/sprite[^'"`\s]*\.svg/);
      expect(text, `${file} references a symbol without spriteHref`).not.toMatch(/href=["'`{][^>\n]*#i-/);
    }
    // The asset import is what makes the build emit `assets/sprite-<hash>.svg`; `?no-inline`
    // keeps it a file, because a `<use>` cannot reference a `data:` URL.
    expect(readFileSync(helper, 'utf8')).toContain("import spriteUrl from './sprite.svg?no-inline';");
    expect(existsSync(join(webRoot, 'public/sprite.svg'))).toBe(false);
  });

  it('leaves no reference to the removed inline sprite', () => {
    for (const file of sourceFiles(join(webRoot, 'src'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/href="#i-/);
    }
  });
});
