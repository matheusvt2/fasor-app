// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Boundaries: "the field surface used by the durability scenarios is a dev-only fixture
 * route that is absent from a production build". Nothing else enforces that. The route
 * writes ops, so a refactor that moved the guard inside the component — or read
 * `import.meta.env.DEV` at render time, where Rollup cannot fold it away — would ship a
 * write-capable surface with no navigation to it and nobody would notice.
 *
 * The guard has to be a module-scope constant over a literal `import.meta.env.DEV`: that
 * is the only shape the bundler can evaluate at build time and tree-shake the surface out
 * with. `pnpm --filter @app/web run build` is checked against this in the story's
 * verification; this test is what keeps the shape from drifting between builds.
 */

const webSrc = resolve(__dirname, '../..');
const appSource = readFileSync(join(webSrc, 'app.tsx'), 'utf8');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

describe('the dev-only field fixture cannot reach a production bundle', () => {
  it('is reachable only through a module-scope import.meta.env.DEV constant', () => {
    const declaration = /const fixtureRoutes[^=]*=\s*import\.meta\.env\.DEV\s*\?([\s\S]*?)\n\s*:\s*\[\];/.exec(
      appSource,
    );
    expect(declaration, 'app.tsx must declare `const fixtureRoutes = import.meta.env.DEV ? [...] : []`').not.toBeNull();
    // The surface is named inside that ternary and nowhere else, so dropping the branch
    // drops the only reference to it.
    expect(declaration![1]).toContain('FieldFixtureSurface');
  });

  it('names the surface exactly twice in app.tsx: the import and that one branch', () => {
    expect(appSource.match(/FieldFixtureSurface/g)).toHaveLength(2);
  });

  it('is not reached at render time, where the bundler could not fold the branch away', () => {
    // Every `import.meta.env.DEV` in app.tsx sits at module scope, before the first
    // component; a guard inside a component body would survive into the bundle.
    const firstComponent = appSource.indexOf('export function App');
    for (const match of appSource.matchAll(/import\.meta\.env\.DEV/g)) {
      expect(match.index, 'import.meta.env.DEV must be evaluated at module scope').toBeLessThan(firstComponent);
    }
  });

  it('is imported by nothing else under src', () => {
    const importers = sourceFiles(webSrc)
      .filter((file) => !file.includes(`${join('surfaces', 'fixtures')}`))
      .filter((file) => /surfaces\/fixtures\//.test(readFileSync(file, 'utf8')));
    expect(importers.map((file) => file.replace(webSrc, ''))).toEqual(['/app.tsx']);
  });

  it('has no navigation pointing at it', () => {
    // The route path exists in the router entry and in the surface's own `data-route`
    // marker; no Link, no navigate() and no other surface may name it.
    for (const file of sourceFiles(webSrc)) {
      if (file.endsWith(join('src', 'app.tsx'))) continue;
      if (file.includes(join('surfaces', 'fixtures'))) continue;
      expect(readFileSync(file, 'utf8'), file).not.toContain('__fixture');
    }
    expect(appSource).not.toMatch(/(to|navigate\()\s*=?\s*['"]\/__fixture/);
  });
});
