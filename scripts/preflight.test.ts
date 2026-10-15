import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decide, decodeLogFrames, firstLine, loopMessage, needsSecondSample, preflight, serviceLog, type ContainerSample, type Engine } from './preflight.ts';

/*
 * Story 14.10 part 1: the gate preflight's decision on fake container lists, its message,
 * the log frame decoder, and the probe's flow over a fake engine (no socket is touched).
 */

const root = resolve(import.meta.dirname, '..');

function container(name: string, over: Partial<ContainerSample> = {}): ContainerSample {
  const service = name.replace(/^fasor-co15a-/, '').replace(/-\d+$/, '');
  return { id: `id-${name}`, name, service, oneoff: false, state: 'running', restarting: false, restartCount: 0, ...over };
}

const healthy = [
  container('fasor-co15a-postgres-1'),
  container('fasor-co15a-minio-1'),
  container('fasor-co15a-api-1'),
  // A one-shot that ended: exited 0 is healthy.
  container('fasor-co15a-install-1', { state: 'exited' }),
];

describe('scripts/preflight.ts decide', () => {
  it('a healthy stack passes, with one sample or two', () => {
    expect(decide(healthy)).toEqual({ verdict: 'ok' });
    expect(decide(healthy, healthy)).toEqual({ verdict: 'ok' });
  });

  it('a restarting container fails at once, by its flag or by its status', () => {
    const web = container('fasor-co15a-web-1', { state: 'restarting', restarting: true, restartCount: 6137 });
    expect(decide([...healthy, web])).toEqual({ verdict: 'loop', container: web });
    const byStatus = container('fasor-co15a-web-1', { state: 'restarting', restartCount: 3 });
    expect(decide([...healthy, byStatus])).toEqual({ verdict: 'loop', container: byStatus });
    const byFlag = container('fasor-co15a-web-1', { state: 'running', restarting: true, restartCount: 3 });
    expect(decide([...healthy, byFlag])).toEqual({ verdict: 'loop', container: byFlag });
  });

  it('a restart count higher at the second sample fails; a stable nonzero count does not', () => {
    const before = container('fasor-co15a-web-1', { restartCount: 12 });
    const after = { ...before, restartCount: 14 };
    expect(decide([...healthy, before], [...healthy, after])).toEqual({ verdict: 'loop', container: after });
    expect(decide([...healthy, before], [...healthy, before])).toEqual({ verdict: 'ok' });
    // A container that appeared between the samples is not compared.
    expect(decide(healthy, [...healthy, after])).toEqual({ verdict: 'ok' });
  });

  it('the tools one-off container (and any compose run) is ignored, whatever it says', () => {
    const tools = container('fasor-co15a-tools-run-78744a090ea5', { service: 'tools', oneoff: true, state: 'restarting', restarting: true, restartCount: 9 });
    const otherRun = container('fasor-co15a-api-run-1', { service: 'api', oneoff: true, restartCount: 1 });
    expect(decide([...healthy, tools, otherRun], [...healthy, tools, { ...otherRun, restartCount: 5 }])).toEqual({ verdict: 'ok' });
    expect(needsSecondSample([...healthy, tools, otherRun])).toBe(false);
  });

  it('a second sample is needed only once some watched container has restarted before', () => {
    expect(needsSecondSample(healthy)).toBe(false);
    expect(needsSecondSample([...healthy, container('fasor-co15a-web-1', { restartCount: 1 })])).toBe(true);
  });

  it('the message names the container, its restart count and the first line of its last log', () => {
    expect(loopMessage({ name: 'fasor-co15a-web-1', restartCount: 6137 }, "Error: EACCES: permission denied, open '/workspace/apps/web/node_modules/.vite-temp/vite.config.ts.timestamp.mjs'")).toBe(
      "preflight: fasor-co15a-web-1 is restarting (restarts: 6137); last log: Error: EACCES: permission denied, open '/workspace/apps/web/node_modules/.vite-temp/vite.config.ts.timestamp.mjs'",
    );
    expect(loopMessage({ name: 'fasor-co15a-web-1', restartCount: 2 }, null)).toBe('preflight: fasor-co15a-web-1 is restarting (restarts: 2); last log: (none)');
  });
});

describe('scripts/preflight.ts log frames', () => {
  const frame = (stream: number, text: string) => {
    const payload = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(8);
    header[0] = stream;
    header.writeUInt32BE(payload.length, 4);
    return Buffer.concat([header, payload]);
  };

  it('decodes multiplexed stdout and stderr frames in order', () => {
    const buffer = Buffer.concat([frame(1, '\n> @app/web dev\n'), frame(2, 'Error: EACCES: permission denied\n'), frame(1, 'more\n')]);
    expect(decodeLogFrames(buffer)).toBe('\n> @app/web dev\nError: EACCES: permission denied\nmore\n');
    expect(firstLine(decodeLogFrames(buffer))).toBe('> @app/web dev');
  });

  it('reads a raw (TTY) log as it is, and a frame cut short keeps its bytes', () => {
    expect(decodeLogFrames(Buffer.from('plain line\nsecond\n'))).toBe('plain line\nsecond\n');
    const cut = frame(1, 'complete line\n').subarray(0, 12);
    expect(decodeLogFrames(cut)).toBe('comp');
    expect(decodeLogFrames(Buffer.alloc(0))).toBe('');
  });

  it('firstLine skips blank lines and trims; null when nothing is printed', () => {
    expect(firstLine('\n\n   \n  Error: boom  \nnext')).toBe('Error: boom');
    expect(firstLine('  \n')).toBeNull();
  });
});

describe('scripts/preflight.ts the probe', () => {
  function fakeEngine(samples: ContainerSample[][], log: string | null = 'Error: EACCES'): Engine & { calls: number } {
    const engine = {
      calls: 0,
      async sample() {
        const next = samples[Math.min(engine.calls, samples.length - 1)]!;
        engine.calls += 1;
        return next;
      },
      async lastLog() {
        return log;
      },
    };
    return engine;
  }
  const run = async (engine: Engine, env: NodeJS.ProcessEnv = { COMPOSE_PROJECT_NAME: 'fasor-co15a' }) => {
    const lines: string[] = [];
    const slept: number[] = [];
    const code = await preflight({ env, engine, intervalMs: 10_000, sleep: async (ms) => void slept.push(ms), log: (line) => lines.push(line) });
    return { code, lines, slept };
  };

  it('healthy with no restart ever: one sample, no wait, silent, exit 0', async () => {
    const engine = fakeEngine([healthy]);
    expect(await run(engine)).toEqual({ code: 0, lines: [], slept: [] });
    expect(engine.calls).toBe(1);
  });

  it('a restarting container: exit 1 with one message, no wait', async () => {
    const web = container('fasor-co15a-web-1', { state: 'restarting', restarting: true, restartCount: 6137 });
    expect(await run(fakeEngine([[...healthy, web]]))).toEqual({ code: 1, lines: ['preflight: fasor-co15a-web-1 is restarting (restarts: 6137); last log: Error: EACCES'], slept: [] });
  });

  it('a growing count: the second sample after the interval, then exit 1', async () => {
    const before = container('fasor-co15a-web-1', { restartCount: 40 });
    const result = await run(fakeEngine([[...healthy, before], [...healthy, { ...before, restartCount: 43 }]]));
    expect(result).toEqual({ code: 1, lines: ['preflight: fasor-co15a-web-1 is restarting (restarts: 43); last log: Error: EACCES'], slept: [10_000] });
  });

  it('GATE_PREFLIGHT_DONE=1: no probe at all', async () => {
    const engine = fakeEngine([[container('fasor-co15a-web-1', { restarting: true })]]);
    expect(await run(engine, { COMPOSE_PROJECT_NAME: 'fasor-co15a', GATE_PREFLIGHT_DONE: '1' })).toEqual({ code: 0, lines: [], slept: [] });
    expect(engine.calls).toBe(0);
  });

  it('no socket: one line, exit 0', async () => {
    const lines: string[] = [];
    const code = await preflight({ env: { COMPOSE_PROJECT_NAME: 'fasor-co15a', ENGINE_SOCKET: resolve(root, 'no-such-dir/engine.sock') }, log: (line) => lines.push(line) });
    expect({ code, lines }).toEqual({ code: 0, lines: ['preflight: no container engine socket, skipped'] });
  });

  it('an engine error: one line naming it, exit 0', async () => {
    const engine: Engine = {
      sample: () => Promise.reject(new Error('GET /containers/json answered 500')),
      lastLog: () => Promise.resolve(null),
    };
    expect(await run(engine)).toEqual({ code: 0, lines: ['preflight: engine error, skipped: GET /containers/json answered 500'], slept: [] });
  });

  it('serviceLog answers null with no socket, so a reader can skip and say so', async () => {
    expect(await serviceLog(resolve(root, 'no-such-dir/engine.sock'), 'fasor-co15a', 'api', 0)).toBeNull();
  });

  it('no compose project in the environment: one line, exit 0', async () => {
    const lines: string[] = [];
    expect(await preflight({ env: {}, log: (line) => lines.push(line) })).toBe(0);
    expect(lines).toEqual(['preflight: no compose project (COMPOSE_PROJECT_NAME), skipped']);
  });
});

describe('where the preflight runs', () => {
  it('each single stage script runs it first; verify and e2e call it themselves', () => {
    const scripts = (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
    for (const stage of ['lint', 'static', 'test:unit', 'test:api']) expect(scripts[stage]).toMatch(/^tsx scripts\/preflight\.ts && /);
    expect(readFileSync(resolve(root, 'scripts/verify.ts'), 'utf8')).toContain("GATE_PREFLIGHT_DONE: '1'");
    expect(readFileSync(resolve(root, 'scripts/e2e.ts'), 'utf8')).toMatch(/await preflight\(\)/);
  });

  it('the probe sends GET requests only', () => {
    const source = readFileSync(resolve(root, 'scripts/preflight.ts'), 'utf8');
    expect(source.match(/method: '([A-Z]+)'/g)).toEqual(["method: 'GET'"]);
  });
});
