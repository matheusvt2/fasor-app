import type { StampedUxEvent } from '@app/domain';
import { CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudWatchSink, logStreamName, stdoutSink, telemetrySinkOf, type CloudWatchLogsLike, type TelemetrySink } from './sink.ts';

const event = (ts: string, extra: Partial<StampedUxEvent> = {}): StampedUxEvent => ({
  v: 1,
  ts,
  session_id: '019966c1-0000-7000-8000-0000000000aa',
  device_id: '019966c1-0000-7000-8000-0000000000bb',
  app_version: 'dev',
  name: 'action',
  screen: 'home',
  target: 'home.card_open',
  received_at: '2026-10-29T12:00:05.000Z',
  user_id: '019966c1-0000-7000-8000-0000000000cc',
  company_id: '019966c1-0000-7000-8000-0000000000dd',
  ...extra,
});

const START = new Date('2026-10-29T11:00:00.000Z');

class FakeLogs implements CloudWatchLogsLike {
  readonly sent: (CreateLogStreamCommand | PutLogEventsCommand)[] = [];
  failCreate: Error | null = null;
  failPut: Error | null = null;
  async send(command: CreateLogStreamCommand | PutLogEventsCommand): Promise<unknown> {
    this.sent.push(command);
    if (command instanceof CreateLogStreamCommand && this.failCreate !== null) throw this.failCreate;
    if (command instanceof PutLogEventsCommand && this.failPut !== null) throw this.failPut;
    return {};
  }
}

const errorLines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);

afterEach(() => vi.restoreAllMocks());

describe('stdout sink', () => {
  it('writes one ux_event line per event, the stamped fields included', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await stdoutSink.write([event('2026-10-29T12:00:00.000Z'), event('2026-10-29T12:00:01.000Z', { name: 'screen_view', target: undefined })]);
    const lines = errorLines(spy);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ msg: 'ux_event', name: 'action', target: 'home.card_open', received_at: '2026-10-29T12:00:05.000Z', company_id: '019966c1-0000-7000-8000-0000000000dd', user_id: '019966c1-0000-7000-8000-0000000000cc' });
    expect(lines[1]).toMatchObject({ msg: 'ux_event', name: 'screen_view' });
  });
});

describe('CloudWatch sink', () => {
  it('names the stream for this process: api/<start instant>/<pid>, no colon (CloudWatch refuses one)', () => {
    expect(logStreamName(START, 4242)).toBe('api/2026-10-29T11-00-00.000Z/4242');
  });

  it('creates the stream once, then puts one JSON line per event, timestamped with the server receipt', async () => {
    const client = new FakeLogs();
    const sink = cloudWatchSink({ client, logGroup: '/fasor/production/ux-events', now: () => START, pid: 4242 });
    const late = event('2026-10-29T12:00:02.000Z');
    const early = event('2026-10-29T12:00:01.000Z', { target: 'home.continue' });
    await sink.write([late, early]);
    await sink.write([event('2026-10-29T12:00:03.000Z')]);

    expect(client.sent.map((c) => c.constructor.name)).toEqual(['CreateLogStreamCommand', 'PutLogEventsCommand', 'PutLogEventsCommand']);
    const create = client.sent[0] as CreateLogStreamCommand;
    expect(create.input).toEqual({ logGroupName: '/fasor/production/ux-events', logStreamName: 'api/2026-10-29T11-00-00.000Z/4242' });
    const put = client.sent[1] as PutLogEventsCommand;
    expect(put.input.logGroupName).toBe('/fasor/production/ux-events');
    expect(put.input.logStreamName).toBe('api/2026-10-29T11-00-00.000Z/4242');
    expect(put.input.logEvents).toEqual([
      { timestamp: Date.parse(late.received_at), message: JSON.stringify(late) },
      { timestamp: Date.parse(early.received_at), message: JSON.stringify(early) },
    ]);
  });

  it('counts a stream that already exists as created', async () => {
    const client = new FakeLogs();
    const exists = new Error('The specified log stream already exists');
    exists.name = 'ResourceAlreadyExistsException';
    client.failCreate = exists;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = cloudWatchSink({ client, logGroup: 'g', now: () => START, pid: 1 });
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    expect(client.sent.map((c) => c.constructor.name)).toEqual(['CreateLogStreamCommand', 'PutLogEventsCommand', 'PutLogEventsCommand']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('logs a failed put once with the batch size and never throws', async () => {
    const client = new FakeLogs();
    client.failPut = new Error('throttled');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = cloudWatchSink({ client, logGroup: 'g', now: () => START, pid: 1 });
    await expect(sink.write([event('2026-10-29T12:00:00.000Z'), event('2026-10-29T12:00:01.000Z')])).resolves.toBeUndefined();
    const lines = errorLines(spy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', msg: 'ux_event_sink_failed', count: 2 });
  });

  it('logs a failed stream creation once, puts nothing, and tries the creation again on the next batch', async () => {
    const client = new FakeLogs();
    client.failCreate = new Error('AccessDenied');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = cloudWatchSink({ client, logGroup: 'g', now: () => START, pid: 1 });
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    expect(client.sent.map((c) => c.constructor.name)).toEqual(['CreateLogStreamCommand']);
    expect(errorLines(spy)).toEqual([expect.objectContaining({ msg: 'ux_event_sink_failed', count: 1 })]);
    client.failCreate = null;
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    expect(client.sent.map((c) => c.constructor.name)).toEqual(['CreateLogStreamCommand', 'CreateLogStreamCommand', 'PutLogEventsCommand']);
  });

  it('puts an offline batch whose events lie days apart once, every timestamp the server receipt', async () => {
    const client = new FakeLogs();
    const sink = cloudWatchSink({ client, logGroup: 'g', now: () => START, pid: 1 });
    const batch = [event('2026-10-26T08:00:00.000Z'), event('2026-10-27T09:00:00.000Z'), event('2026-10-29T11:59:00.000Z')];
    await sink.write(batch);
    const puts = client.sent.filter((c): c is PutLogEventsCommand => c instanceof PutLogEventsCommand);
    expect(puts).toHaveLength(1);
    expect(puts[0]!.input.logEvents!.map((e) => e.timestamp)).toEqual([0, 1, 2].map(() => Date.parse('2026-10-29T12:00:05.000Z')));
    // The device's instant stays in the message.
    expect(puts[0]!.input.logEvents!.map((e) => (JSON.parse(e.message!) as { ts: string }).ts)).toEqual(batch.map((e) => e.ts));
  });

  it('creates the stream again after a put finds it gone', async () => {
    const client = new FakeLogs();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sink = cloudWatchSink({ client, logGroup: 'g', now: () => START, pid: 1 });
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    const gone = new Error('The specified log stream does not exist.');
    gone.name = 'ResourceNotFoundException';
    client.failPut = gone;
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    client.failPut = null;
    await sink.write([event('2026-10-29T12:00:00.000Z')]);
    expect(client.sent.map((c) => c.constructor.name)).toEqual([
      'CreateLogStreamCommand',
      'PutLogEventsCommand',
      'PutLogEventsCommand',
      'CreateLogStreamCommand',
      'PutLogEventsCommand',
    ]);
  });

  it('puts nothing for an empty batch', async () => {
    const client = new FakeLogs();
    await cloudWatchSink({ client, logGroup: 'g', now: () => START, pid: 1 }).write([]);
    expect(client.sent).toEqual([]);
  });
});

describe('the configured sink (main.ts)', () => {
  it('is the CloudWatch sink on the named group with cloudwatch, and stdout by default', () => {
    const cloud: TelemetrySink = { write: async () => undefined };
    const groups: string[] = [];
    const make = (group: string) => {
      groups.push(group);
      return cloud;
    };
    expect(telemetrySinkOf({ TELEMETRY_SINK: 'cloudwatch', TELEMETRY_LOG_GROUP: '/fasor/production/ux-events' }, make)).toBe(cloud);
    expect(groups).toEqual(['/fasor/production/ux-events']);
    expect(telemetrySinkOf({ TELEMETRY_SINK: 'stdout', TELEMETRY_LOG_GROUP: undefined }, make)).toBe(stdoutSink);
    expect(telemetrySinkOf({ TELEMETRY_SINK: 'stdout', TELEMETRY_LOG_GROUP: 'g' }, make)).toBe(stdoutSink);
    expect(groups).toHaveLength(1);
  });
});
