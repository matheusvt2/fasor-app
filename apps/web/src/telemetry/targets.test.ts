// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_PAGE_SIZES, homePageSizeTarget, homeStatusTileTarget, RELATORIO_STATUSES, UX_ACTION_TARGETS, UX_DIALOG_TARGETS, UX_INPUT_TARGETS } from '@app/domain';
import { describe, expect, it } from 'vitest';

/*
 * Epic 18 (Story 18.1): every name of the minimum instrumentation is given to a surface. A
 * surface that drops its `data-telemetry` (or its dialog's `useDialogTelemetry`) fails here.
 * The checklist marks are composed by the Tri-state control (`${telemetry}_${segment}`), so
 * `ficha.mark_c`, `_nc` and `_na` are found as the `ficha.mark` prefix and that composition.
 *
 * Story 18.4: the Home tiles and page-size chips name their targets through the kernel helpers
 * (`homeStatusTileTarget`, `homePageSizeTarget`; their rendered names are
 * `rendered-targets.test.tsx`'s), and the shared names they replaced stay in the kernel for old
 * bundles only. Every refusing field's name is one of `UX_INPUT_TARGETS`, and every
 * `trackInputRefused` names one.
 */

/** Story 18.4: kept in the kernel so old bundles' events still pass; no surface names them any more. */
const RETIRED = new Set<string>(['home.status_chip', 'home.page_size']);
/** Story 18.4: composed by a kernel helper whose call the sources carry. */
const COMPOSED = new Map<string, string>([
  ...RELATORIO_STATUSES.map((status) => [homeStatusTileTarget(status), 'homeStatusTileTarget('] as const),
  ...HOME_PAGE_SIZES.map((size) => [homePageSizeTarget(size), 'homePageSizeTarget('] as const),
]);

const SRC = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [readFileSync(path, 'utf8')] : [];
  });
}

/** Each `action: { … }` object literal of `text`, braces balanced (an `onPress` body may hold its own). */
function actionObjects(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/action:\s*\{/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let at = start; at < text.length; at += 1) {
      if (text[at] === '{') depth += 1;
      else if (text[at] === '}') depth -= 1;
      if (depth === 0) {
        found.push(text.slice(start, at + 1));
        break;
      }
    }
  }
  return found;
}

describe('the minimum instrumentation is wired to the surfaces', () => {
  const text = sources(SRC).join('\n');

  it('names every action target in a non-test source of apps/web/src', () => {
    const composed = text.includes('`${telemetry}_${segment.attr}`');
    const missing = UX_ACTION_TARGETS.filter((target) => {
      if (RETIRED.has(target)) return false;
      const helper = COMPOSED.get(target);
      if (helper !== undefined) return !text.includes(helper);
      const mark = /^(ficha\.mark)_(c|nc|na)$/.exec(target);
      if (mark !== null) return !(composed && text.includes(`"${mark[1]}"`));
      return !text.includes(`'${target}'`) && !text.includes(`"${target}"`);
    });
    expect(missing).toEqual([]);
  });

  it('E18-A1 (R-V10): every toast action labelled by an `.undo` copy key is an undo (`undo: true`), so its "Desfazer" is counted', () => {
    const undoActions = actionObjects(text).filter((action) => /label:\s*[\w.]+\.undo\b/.test(action));
    // The four registry panels and the photo viewer, at least.
    expect(undoActions.length).toBeGreaterThanOrEqual(5);
    expect(undoActions.filter((action) => !/\bundo:\s*true\b/.test(action))).toEqual([]);
  });

  it('Story 18.4: no surface names a retired shared Home name', () => {
    for (const name of RETIRED) {
      expect(text.includes(`'${name}'`) || text.includes(`"${name}"`)).toBe(false);
    }
  });

  it('Story 18.4: every input target is given to a field, and every name a field or trackInputRefused carries is an input target', () => {
    const inputs = new Set<string>(UX_INPUT_TARGETS);
    const missing = UX_INPUT_TARGETS.filter((target) => !text.includes(`'${target}'`) && !text.includes(`"${target}"`));
    expect(missing).toEqual([]);
    // The fields' constants (`INPUT_TARGET`-style constants and attributes), read where they are used.
    const reported = [...text.matchAll(/trackInputRefused\(\s*'([^']+)'/g)].map((match) => match[1]!);
    const attributes = [...text.matchAll(/<(?:input|textarea|select)\b[^>]*?data-telemetry="([^"]+)"/g)].map((match) => match[1]!);
    expect([...reported, ...attributes].filter((name) => !inputs.has(name))).toEqual([]);
    // No input target doubles as an action, a dialog or a retired name.
    for (const target of UX_INPUT_TARGETS) {
      expect((UX_ACTION_TARGETS as readonly string[]).includes(target) || (UX_DIALOG_TARGETS as readonly string[]).includes(target)).toBe(false);
    }
  });

  it('tracks every dialog target', () => {
    const missing = UX_DIALOG_TARGETS.filter((dialog) => !text.includes(`useDialogTelemetry('${dialog}'`));
    expect(missing).toEqual([]);
  });
});
