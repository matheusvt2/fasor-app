// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  currentShellEntry,
  holdShell,
  promoteWaitingShell,
  registerServiceWorker,
  shouldHoldShell,
  unregisterServiceWorkers,
} from './register.ts';

/*
 * AD-8's activation rule, both branches (1.8-E2E-005 asserts the same rule end to end),
 * and the registration's promise never rejecting.
 */

function container(register: () => Promise<unknown>): ServiceWorkerContainer {
  return { register } as unknown as ServiceWorkerContainer;
}

interface Worker {
  postMessage: (data: unknown) => void;
}

function registration(
  waiting: Worker | null,
  extra: { active?: Worker | null; installing?: Worker | null } = {},
): ServiceWorkerRegistration {
  return { waiting, active: null, installing: null, ...extra } as unknown as ServiceWorkerRegistration;
}

describe('registerServiceWorker', () => {
  it('registers /sw.js at the root scope', async () => {
    const reg = registration(null);
    const register = vi.fn(async () => reg);
    expect(await registerServiceWorker({ container: container(register) })).toBe(reg);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('answers null and logs once when the browser refuses', async () => {
    const log = vi.fn();
    const register = vi.fn(async () => {
      throw new Error('SecurityError');
    });
    expect(await registerServiceWorker({ container: container(register), log })).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('answers null when there is no service-worker container at all', async () => {
    expect(await registerServiceWorker({ container: undefined })).toBeNull();
    expect(await registerServiceWorker({ container: {} as ServiceWorkerContainer })).toBeNull();
  });
});

describe('promoteWaitingShell', () => {
  it('promotes a waiting worker when nothing is on its way to the server', async () => {
    const postMessage = vi.fn();
    const backlog = vi.fn(async () => 0);
    expect(await promoteWaitingShell(registration({ postMessage }), backlog)).toBe('promoted');
    expect(postMessage).toHaveBeenCalledWith({ type: 'activate-shell' });
  });

  it('holds a new shell back while the outbox still has work', async () => {
    const postMessage = vi.fn();
    expect(await promoteWaitingShell(registration({ postMessage }), async () => 3)).toBe('held-back');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('never reads the backlog when no worker is waiting', async () => {
    const backlog = vi.fn(async () => 0);
    expect(await promoteWaitingShell(registration(null), backlog)).toBe('nothing-waiting');
    expect(await promoteWaitingShell(null, backlog)).toBe('nothing-waiting');
    expect(backlog).not.toHaveBeenCalled();
  });
});

/*
 * The other half of AD-8's rule: promoting the waiting worker only delays the *cache*
 * swap, and navigation is network-first, so while online the new build would be served
 * from the network anyway. The hold is what keeps a job on one shell version, and it is
 * the backlog alone: after the browser activates a new worker by itself (every tab
 * closed) nothing is waiting any more, and the job must still stay pinned.
 */
describe('shouldHoldShell', () => {
  it('holds while work is still on its way to the server', () => {
    expect(shouldHoldShell(1)).toBe(true);
    expect(shouldHoldShell(42)).toBe(true);
  });

  it('releases the hold as soon as the backlog reaches zero', () => {
    expect(shouldHoldShell(0)).toBe(false);
  });
});

describe('holdShell', () => {
  it('tells the active worker to hold, and later to stop', () => {
    const active = { postMessage: vi.fn() };
    const reg = registration({ postMessage: vi.fn() }, { active });

    expect(holdShell(reg, 2)).toBe(true);
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'hold-shell', hold: true });

    expect(holdShell(reg, 0)).toBe(false);
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'hold-shell', hold: false });
  });

  it('keeps holding with nothing waiting, as after the browser activated the new shell itself', () => {
    const active = { postMessage: vi.fn() };
    expect(holdShell(registration(null, { active }), 3)).toBe(true);
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'hold-shell', hold: true });
    expect(holdShell(registration(null, { active }), 0)).toBe(false);
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'hold-shell', hold: false });
  });

  it('names the build the page runs, so the worker pins that one and not its own', () => {
    const active = { postMessage: vi.fn() };
    expect(holdShell(registration(null, { active }), 1, '/assets/index-C.js')).toBe(true);
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'hold-shell', hold: true, shell: '/assets/index-C.js' });
    expect(holdShell(registration(null, { active }), 0, '/assets/index-C.js')).toBe(false);
    expect(active.postMessage).toHaveBeenLastCalledWith({ type: 'hold-shell', hold: false, shell: '/assets/index-C.js' });
  });

  it('says nothing when there is no active worker to say it to', () => {
    expect(holdShell(registration({ postMessage: vi.fn() }), 2)).toBeNull();
    expect(holdShell(null, 2)).toBeNull();
  });
});

describe('currentShellEntry', () => {
  it('is the path of the chunk running the code, which names the build', () => {
    expect(currentShellEntry('https://tablet.local:8443/assets/index-Ab12Cd.js')).toBe('/assets/index-Ab12Cd.js');
    expect(currentShellEntry('http://localhost:5200/assets/index-X.js')).toBe('/assets/index-X.js');
  });

  it('is unknown outside a served page', () => {
    expect(currentShellEntry('file:///workspace/apps/web/src/sw/register.ts')).toBeUndefined();
    expect(currentShellEntry('not a url')).toBeUndefined();
    // Under vitest the module is a file, so the default sends no `shell`.
    expect(currentShellEntry()).toBeUndefined();
  });
});

describe('unregisterServiceWorkers', () => {
  it('unregisters every worker on the origin', async () => {
    const unregister = vi.fn(async () => true);
    const container = {
      getRegistrations: async () => [{ unregister }, { unregister }],
    } as unknown as ServiceWorkerContainer;
    expect(await unregisterServiceWorkers({ container })).toBe(2);
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('answers zero, and never throws, when the browser has no answer', async () => {
    expect(await unregisterServiceWorkers({ container: undefined })).toBe(0);
    expect(await unregisterServiceWorkers({ container: {} as ServiceWorkerContainer })).toBe(0);
    const log = vi.fn();
    const container = {
      getRegistrations: async () => {
        throw new Error('SecurityError');
      },
    } as unknown as ServiceWorkerContainer;
    expect(await unregisterServiceWorkers({ container, log })).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
