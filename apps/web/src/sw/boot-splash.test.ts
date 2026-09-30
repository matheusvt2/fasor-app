// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRODUTO } from '@app/domain';
import { describe, expect, it } from 'vitest';

/*
 * Matheus, 2026-09-30: a loading screen never looks frozen. Before the bundle runs, the
 * document itself says what is loading: a worded splash inside `#root`, which React's first
 * render replaces. The literal must stay the product constant (`PRODUTO`), as the `<title>` is.
 */

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

describe('the boot splash of index.html', () => {
  it(`says "Carregando ${PRODUTO}…" as a status inside #root`, () => {
    const root = /<div id="root">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    expect(root).toContain(`Carregando ${PRODUTO}…`);
    expect(root).toMatch(/<p class="boot-splash" role="status">/);
  });

  it('names the product only by the placeholder, as the title does', () => {
    expect(html).toContain(`<title>${PRODUTO}</title>`);
    expect(html.toLowerCase()).not.toContain('fasor');
  });
});
