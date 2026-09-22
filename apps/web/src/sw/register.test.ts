import { describe, expect, it, vi } from 'vitest';
import { promoteWaitingShell, registerServiceWorker } from './register.ts';

/*
 * AD-8's activation rule, both branches (1.8-E2E-005 asserts the same rule end to end),
 * and the registration's promise never rejecting.
 */

function container(register: () => Promise<unknown>): ServiceWorkerContainer {
  return { register } as unknown as ServiceWorkerContainer;
}

function registration(waiting: { postMessage: (data: unknown) => void } | null): ServiceWorkerRegistration {
  return { waiting } as unknown as ServiceWorkerRegistration;
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
