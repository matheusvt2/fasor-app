import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * AR-7: the sprite is a precachable file, not markup inside the hashed bundle. That only
 * holds while every `<use href="/sprite.svg#id">` under `src/` names a symbol the file
 * actually declares — otherwise an icon renders as nothing, offline and online alike.
 */

const webRoot = resolve(__dirname, '../..');
const spritePath = join(webRoot, 'public/sprite.svg');
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
  it('declares the four symbols the shell used to inline, plus the App bar back chevron, the Registries icons and the upload tile image glyph', () => {
    expect([...declared].sort()).toEqual([
      'i-archive',
      'i-back',
      'i-book',
      'i-check',
      'i-chev-right',
      'i-close',
      'i-image',
      'i-layers',
      'i-plus',
    ]);
  });

  it('holds every symbol referenced under apps/web/src', () => {
    const referenced = new Set<string>();
    for (const file of sourceFiles(join(webRoot, 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/href="\/sprite\.svg#([^"]+)"/g)) {
        referenced.add(match[1]!);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) expect(declared, `sprite.svg is missing ${id}`).toContain(id);
  });

  it('leaves no reference to the removed inline sprite', () => {
    for (const file of sourceFiles(join(webRoot, 'src'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/href="#i-/);
    }
  });
});
