import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Story 31.3 (AD-30): the browser speech engine is gone. The audio button records on the
 * device and the backend transcribes, so no build flag picks an engine any more: the flag's
 * name and the engine files appear nowhere in the source, the compose file, `.env.example`,
 * the production Dockerfile or the e2e support.
 */

const root = resolve(import.meta.dirname, '..');
// Built from parts, so this file does not name the flag itself.
const FLAG = ['VITE', 'SPEECH', 'ENGINE'].join('_');
const SKIP = new Set(['node_modules', 'dist', '.vite', '.vite-temp', 'test-results', 'playwright-report']);

function files(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...files(path));
    else if (/\.(ts|tsx|js|mjs|json|yml|yaml|html|md)$/.test(name) || name.startsWith('Dockerfile')) found.push(path);
  }
  return found;
}

describe('31.3 the speech engine is removed', () => {
  it('names the speech engine flag nowhere in the source, compose, .env.example, the Dockerfiles or the e2e support', () => {
    const scanned = [
      ...files(join(root, 'apps')),
      ...files(join(root, 'packages')),
      ...files(join(root, 'e2e')),
      ...files(join(root, 'scripts')),
      join(root, 'docker-compose.yml'),
      join(root, '.env.example'),
      join(root, 'docs/DEVELOPMENT.md'),
    ];
    const hits = scanned.filter((file) => readFileSync(file, 'utf8').includes(FLAG)).map((file) => relative(root, file));
    expect(hits).toEqual([]);
  });

  it('keeps none of the engine files', () => {
    for (const file of ['apps/web/src/speech/webspeech-engine.ts', 'apps/web/src/speech/fake-engine.ts', 'apps/web/src/speech/engine.ts', 'e2e/support/speech.ts']) {
      expect(existsSync(join(root, file)), file).toBe(false);
    }
  });
});
