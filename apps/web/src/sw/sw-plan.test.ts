import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * AD-8's request rule, read out of the worker that ships.
 *
 * `public/sw.js` is copied verbatim into the bundle: no bundler, no typechecker and no
 * other test evaluates a line of it. So the one decision it makes is a pure function,
 * and that function is pulled out of the real file and run here — the same way
 * `src/state/theme-boot.test.ts` runs the inline boot script of `index.html`.
 */

const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

type Plan = 'cache-first' | 'network-first' | 'passthrough';
interface PlanInput {
  isApi: boolean;
  mode: string;
  isShellPath: boolean;
  hold: boolean;
}

function loadShellPlan(): (input: PlanInput) => Plan {
  const match = /\nfunction shellPlan\(input\) \{[\s\S]*?\n\}/.exec(source);
  if (match === null) throw new Error('public/sw.js no longer declares shellPlan(input)');
  return new Function(`${match[0]}\nreturn shellPlan;`)() as (input: PlanInput) => Plan;
}

const shellPlan = loadShellPlan();

const plan = (over: Partial<PlanInput> = {}): Plan =>
  shellPlan({ isApi: false, mode: 'no-cors', isShellPath: false, hold: false, ...over });

describe('the fetch rule in public/sw.js', () => {
  it('never handles /api, whatever else is true', () => {
    for (const hold of [false, true]) {
      for (const mode of ['navigate', 'cors', 'no-cors']) {
        expect(plan({ isApi: true, mode, hold, isShellPath: true }), `${mode}, hold ${hold}`).toBe('passthrough');
      }
    }
  });

  it('leaves anything outside the precache list to the network', () => {
    expect(plan({ isShellPath: false, mode: 'no-cors' })).toBe('passthrough');
    expect(plan({ isShellPath: false, mode: 'cors', hold: true })).toBe('passthrough');
  });

  it('serves a precached asset from the cache either way', () => {
    expect(plan({ isShellPath: true })).toBe('cache-first');
    expect(plan({ isShellPath: true, hold: true })).toBe('cache-first');
  });

  // The matrix the rule exists for: (the backlog, the request mode). The page turns the
  // backlog into `hold` (`shouldHoldShell` in src/sw/register.ts), and the worker keeps it
  // as a pin in Cache Storage; `hold` here is "a shell is pinned".
  it('answers navigations network-first while nothing is pinned', () => {
    expect(plan({ mode: 'navigate', hold: false })).toBe('network-first');
  });

  it('answers navigations from the cache while a shell is pinned', () => {
    // A non-empty outbox: the job stays on the version it started on, instead of the
    // network handing it the new document mid-job.
    expect(plan({ mode: 'navigate', hold: true })).toBe('cache-first');
  });
});

/*
 * The hold's lifecycle across worker restarts and a browser-driven activation is run
 * against the real file in `sw-lifecycle.test.ts`. Here only the wiring is pinned: the
 * hold reaches the pure rule from the Cache Storage pin, never from a module flag that a
 * stopped worker would lose.
 */
describe('the worker derives the hold from the pin', () => {
  it('keeps no module-level hold flag', () => {
    expect(source).not.toMatch(/let holdShell/);
    expect(source).toMatch(/hold: pin !== null/);
  });

  it('writes the pin from a hold-shell message, inside waitUntil', () => {
    expect(source).toMatch(/data\.type === 'hold-shell'\) event\.waitUntil\(setHold\(data\.hold === true\)\)/);
  });

  it('keeps the sentinel out of the shell cache namespace', () => {
    const name = /const HOLD_CACHE = '([^']+)'/.exec(source)?.[1];
    expect(name).toBeDefined();
    expect(name!.startsWith('releng-shell-')).toBe(false);
  });
});
