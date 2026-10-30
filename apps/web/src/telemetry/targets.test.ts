// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UX_ACTION_TARGETS, UX_DIALOG_TARGETS } from '@app/domain';
import { describe, expect, it } from 'vitest';

/*
 * Epic 18 (Story 18.1): every name of the minimum instrumentation is given to a surface. A
 * surface that drops its `data-telemetry` (or its dialog's `useDialogTelemetry`) fails here.
 * The checklist marks are composed by the Tri-state control (`${telemetry}_${segment}`), so
 * `ficha.mark_c`, `_nc` and `_na` are found as the `ficha.mark` prefix and that composition.
 */

const SRC = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('the minimum instrumentation is wired to the surfaces', () => {
  const text = sources(SRC).join('\n');

  it('names every action target in a non-test source of apps/web/src', () => {
    const composed = text.includes('`${telemetry}_${segment.attr}`');
    const missing = UX_ACTION_TARGETS.filter((target) => {
      const mark = /^(ficha\.mark)_(c|nc|na)$/.exec(target);
      if (mark !== null) return !(composed && text.includes(`"${mark[1]}"`));
      return !text.includes(`'${target}'`) && !text.includes(`"${target}"`);
    });
    expect(missing).toEqual([]);
  });

  it('tracks every dialog target', () => {
    const missing = UX_DIALOG_TARGETS.filter((dialog) => !text.includes(`useDialogTelemetry('${dialog}'`));
    expect(missing).toEqual([]);
  });
});
