import { request } from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * Story 14.10 part 1 (2026-10-15): the gate's preflight. A compose container restarting in a
 * loop (the root-owned `apps/web/node_modules/.vite-temp` of 2026-10-15: the `web` dev
 * container crash-looped 6137 times) loads the VM until every gate stage times out, and
 * nothing said why. Before any stage runs, this reads the container engine through its
 * socket (mounted read-write by compose, but only GET requests are ever sent: the probe
 * never changes a container) and fails fast naming the looping container, its restart count
 * and the first line of its last log.
 *
 * - First sample: every container of the compose project (`COMPOSE_PROJECT_NAME`). One that
 *   is restarting fails at once.
 * - Second sample, after `PREFLIGHT_INTERVAL_MS` (10 s), only when some container has
 *   restarted before (a nonzero restart count): a count that grew fails. A stack where no
 *   container ever restarted needs one sample.
 * - No socket (another machine, a host without the mount) or no project: one note, exit 0.
 *   An engine error or a request over 5 s: one note naming it, exit 0. It fails only on
 *   evidence of a loop.
 * - `GATE_PREFLIGHT_DONE=1` (set by `scripts/verify.ts` for its stages): no second probe.
 *
 * The tools one-off container that runs the gate (and any other one-off `run` container) is
 * ignored.
 */

/** One container as the decision reads it, from one sample. */
export interface ContainerSample {
  id: string;
  name: string;
  /** The compose service (`com.docker.compose.service`), when labelled. */
  service: string | null;
  /** A `compose run` container (`com.docker.compose.oneoff=True`). */
  oneoff: boolean;
  /** `State.Status`: running, exited, restarting, created... */
  state: string;
  /** `State.Restarting`. */
  restarting: boolean;
  restartCount: number;
}

export type PreflightDecision = { verdict: 'ok' } | { verdict: 'loop'; container: ContainerSample };

/** The containers the decision looks at: every one of the project but the gate's own one-off runs. */
export function watched(samples: readonly ContainerSample[]): ContainerSample[] {
  return samples.filter((sample) => !sample.oneoff && sample.service !== 'tools');
}

/** A container restarting now: `State.Restarting`, or the status says so. */
export function restartingNow(samples: readonly ContainerSample[]): ContainerSample | null {
  return watched(samples).find((sample) => sample.restarting || sample.state === 'restarting') ?? null;
}

/** Whether a second sample is worth taking: some watched container has restarted before. */
export function needsSecondSample(first: readonly ContainerSample[]): boolean {
  return watched(first).some((sample) => sample.restartCount > 0);
}

/**
 * The decision over one or two samples: a restarting container in either fails; so does a
 * container whose restart count is higher at the second sample (matched by id). An exited
 * container (a one-shot that ended, a stopped service) is never a loop by itself.
 */
export function decide(first: readonly ContainerSample[], second: readonly ContainerSample[] | null = null): PreflightDecision {
  const now = restartingNow(first) ?? (second === null ? null : restartingNow(second));
  if (now !== null) return { verdict: 'loop', container: now };
  if (second !== null) {
    const before = new Map(watched(first).map((sample) => [sample.id, sample.restartCount]));
    const grown = watched(second).find((sample) => sample.restartCount > (before.get(sample.id) ?? sample.restartCount));
    if (grown !== undefined) return { verdict: 'loop', container: grown };
  }
  return { verdict: 'ok' };
}

/** The one message of a failed preflight. */
export function loopMessage(container: Pick<ContainerSample, 'name' | 'restartCount'>, lastLog: string | null): string {
  return `preflight: ${container.name} is restarting (restarts: ${container.restartCount}); last log: ${lastLog ?? '(none)'}`;
}

/**
 * The engine's log stream as text. A container without a TTY answers in 8-byte framed
 * chunks (stream type, three zero bytes, a big-endian length, then the payload); one with a
 * TTY answers raw. A buffer whose first header does not read as a frame is taken as raw.
 */
export function decodeLogFrames(buffer: Buffer): string {
  const isFrame = (at: number) => at + 8 <= buffer.length && buffer[at]! <= 2 && buffer[at + 1] === 0 && buffer[at + 2] === 0 && buffer[at + 3] === 0;
  if (buffer.length === 0 || !isFrame(0)) return buffer.toString('utf8');
  const parts: Buffer[] = [];
  let at = 0;
  while (isFrame(at)) {
    const size = buffer.readUInt32BE(at + 4);
    parts.push(buffer.subarray(at + 8, Math.min(buffer.length, at + 8 + size)));
    at += 8 + size;
  }
  if (at < buffer.length) parts.push(buffer.subarray(at));
  return Buffer.concat(parts).toString('utf8');
}

/** The first non-blank line of a log, trimmed; null when it holds none. */
export function firstLine(log: string): string | null {
  return log.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) ?? null;
}

// --- the engine client (GET only) ------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 5_000;

class NoSocketError extends Error {}

/** The engine answered a status over 299 (a 404: the container went away between the list and its inspect). */
class EngineStatusError extends Error {
  constructor(
    path: string,
    readonly status: number,
  ) {
    super(`GET ${path.split('?')[0]} answered ${status}`);
  }
}

/** The probe's overall deadline passed before the engine answered. */
class DeadlineError extends Error {}

/** One GET on the engine socket; the body as a buffer. Rejects on a status over 299 or after 5 s. */
function get(socketPath: string, path: string): Promise<Buffer> {
  return new Promise((resolveGet, rejectGet) => {
    const req = request({ socketPath, path, method: 'GET', timeout: REQUEST_TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if ((res.statusCode ?? 500) > 299) rejectGet(new EngineStatusError(path, res.statusCode ?? 500));
        else resolveGet(body);
      });
      res.on('error', rejectGet);
    });
    req.on('timeout', () => req.destroy(new Error(`GET ${path.split('?')[0]} timed out after ${REQUEST_TIMEOUT_MS / 1000} s`)));
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'ENOTSOCK' || error.code === 'ECONNREFUSED') rejectGet(new NoSocketError(error.code));
      else rejectGet(error);
    });
    req.end();
  });
}

interface ListedContainer {
  Id: string;
}
interface InspectedContainer {
  Id: string;
  Name: string;
  RestartCount?: number;
  State?: { Status?: string; Restarting?: boolean; StartedAt?: string };
  Config?: { Labels?: Record<string, string> | null };
}

export interface Engine {
  sample(): Promise<ContainerSample[]>;
  lastLog(container: ContainerSample): Promise<string | null>;
}

/** The engine behind `socketPath`, read for the containers of `project`. */
export function socketEngine(socketPath: string, project: string): Engine {
  const startedAt = new Map<string, string>();
  return {
    async sample() {
      const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${project}`] }));
      const listed = JSON.parse((await get(socketPath, `/containers/json?all=1&filters=${filters}`)).toString('utf8')) as ListedContainer[];
      // A container removed between the list and its inspect (404) is dropped; any other failure fails the sample.
      const settled = await Promise.allSettled(listed.map(async (row) => JSON.parse((await get(socketPath, `/containers/${row.Id}/json`)).toString('utf8')) as InspectedContainer));
      const inspected: InspectedContainer[] = [];
      for (const result of settled) {
        if (result.status === 'fulfilled') inspected.push(result.value);
        else if (!(result.reason instanceof EngineStatusError && result.reason.status === 404)) throw result.reason;
      }
      return inspected.map((row): ContainerSample => {
        const labels = row.Config?.Labels ?? {};
        if (row.State?.StartedAt !== undefined) startedAt.set(row.Id, row.State.StartedAt);
        return {
          id: row.Id,
          name: row.Name.replace(/^\//, ''),
          service: labels['com.docker.compose.service'] ?? null,
          oneoff: (labels['com.docker.compose.oneoff'] ?? '').toLowerCase() === 'true',
          state: row.State?.Status ?? 'unknown',
          restarting: row.State?.Restarting === true,
          restartCount: row.RestartCount ?? 0,
        };
      });
    },
    async lastLog(container) {
      const started = Date.parse(startedAt.get(container.id) ?? '');
      const read = async (query: string) => firstLine(decodeLogFrames(await get(socketPath, `/containers/${container.id}/logs?stdout=1&stderr=1${query}`)));
      // With no readable start time, the last lines of the log, never the whole of it.
      if (!Number.isFinite(started) || started <= 0) return read('&tail=20');
      // The last run's log; when it is empty (the run had not printed yet), the last lines of any run.
      return (await read(`&since=${Math.floor(started / 1000)}`)) ?? (await read('&tail=20'));
    },
  };
}

/**
 * Story 14.10 part 4: the log of a compose service's container (not a one-off run) since
 * `sinceUnix` (seconds), decoded; null when no engine socket is reachable. GET only, like the
 * probe: the api suite's generation-time test reads the api's `generate timing` lines with it.
 */
export async function serviceLog(socketPath: string, project: string, service: string, sinceUnix: number): Promise<string | null> {
  try {
    const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${project}`, `com.docker.compose.service=${service}`] }));
    const listed = JSON.parse((await get(socketPath, `/containers/json?filters=${filters}`)).toString('utf8')) as (ListedContainer & { Labels?: Record<string, string> | null })[];
    const container = listed.find((row) => (row.Labels?.['com.docker.compose.oneoff'] ?? '').toLowerCase() !== 'true');
    if (container === undefined) throw new Error(`no running ${service} container in ${project}`);
    return decodeLogFrames(await get(socketPath, `/containers/${container.Id}/logs?stdout=1&stderr=1&since=${Math.floor(sinceUnix)}`));
  } catch (error) {
    if (error instanceof NoSocketError) return null;
    throw error;
  }
}

// --- the probe -------------------------------------------------------------------------------

export interface PreflightOptions {
  env?: NodeJS.ProcessEnv;
  engine?: Engine;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  /** The whole probe's budget; default `PREFLIGHT_DEADLINE_MS`. */
  deadlineMs?: number;
}

export const DEFAULT_INTERVAL_MS = 10_000;
/** The probe ends within 15 s, the gate's promise: 14 s for the engine, the rest for the process. */
export const PREFLIGHT_DEADLINE_MS = 14_000;

/** `PREFLIGHT_INTERVAL_MS` as a wait: a whole number of ms, zero included; anything else (unset, not a number, negative) is the default. */
export function intervalFrom(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_INTERVAL_MS;
}

/** Runs the probe: 0 to go on, 1 when a container loops (its message already printed). */
export async function preflight(options: PreflightOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.log(line));
  if (env.GATE_PREFLIGHT_DONE === '1') return 0;
  const project = env.COMPOSE_PROJECT_NAME ?? '';
  if (project === '' && options.engine === undefined) {
    log('preflight: no compose project (COMPOSE_PROJECT_NAME), skipped');
    return 0;
  }
  const engine = options.engine ?? socketEngine(env.ENGINE_SOCKET ?? '/var/run/engine.sock', project);
  const intervalMs = options.intervalMs ?? intervalFrom(env.PREFLIGHT_INTERVAL_MS);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const deadlineMs = options.deadlineMs ?? PREFLIGHT_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  /** `work`, or a `DeadlineError` once the probe's budget is spent. */
  const within = <T>(work: Promise<T>): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError(`the probe's ${deadlineMs / 1000} s deadline passed`)), Math.max(0, deadline - Date.now()));
    });
    return Promise.race([work, late]).finally(() => clearTimeout(timer));
  };
  let decision: PreflightDecision;
  try {
    const first = await within(engine.sample());
    if (watched(first).length === 0) {
      log(`preflight: no containers for project ${project}, skipped`);
      return 0;
    }
    decision = decide(first);
    if (decision.verdict === 'ok' && needsSecondSample(first)) {
      await within(sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
      decision = decide(first, await within(engine.sample()));
    }
  } catch (error) {
    if (error instanceof NoSocketError) log('preflight: no container engine socket, skipped');
    else log(`preflight: engine error, skipped: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
  if (decision.verdict === 'ok') return 0;
  // A loop was seen: the run stops whatever the log read does, with what it has.
  let lastLog: string | null;
  try {
    lastLog = await within(engine.lastLog(decision.container));
  } catch {
    lastLog = null;
  }
  log(loopMessage(decision.container, lastLog));
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void preflight().then((code) => process.exit(code));
}
