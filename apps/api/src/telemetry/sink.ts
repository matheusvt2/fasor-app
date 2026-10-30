import type { StampedUxEvent } from '@app/domain';
import { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import type { Config } from '../config.ts';
import { log, logError } from '../log.ts';

/*
 * Epic 18, Story 18.2 (AD-28): where `POST /api/telemetry` writes the usage events it
 * accepted. `stdout` (the default everywhere but production) is one `ux_event` log line per
 * event; `cloudwatch` puts each batch on the dedicated log group. Events are not records: a
 * failed write is logged once per batch and never fails the device's request.
 */

export interface TelemetrySink {
  /** Never rejects for a sink failure it can log; the route still guards against one. */
  write(events: readonly StampedUxEvent[]): Promise<void>;
}

/** One `ux_event` JSON line per event on stdout. */
export const stdoutSink: TelemetrySink = {
  write: async (events) => {
    for (const event of events) log('ux_event', { ...event });
  },
};

/** The one method of `CloudWatchLogsClient` the sink uses; tests inject a fake. */
export interface CloudWatchLogsLike {
  send(command: CreateLogStreamCommand | PutLogEventsCommand): Promise<unknown>;
}

/**
 * The stream of one api process: `api/<start instant>/<pid>`. CloudWatch Logs refuses a
 * `:` in a stream name, so the instant's colons become `-`.
 */
export function logStreamName(start: Date, pid: number): string {
  return `api/${start.toISOString().replaceAll(':', '-')}/${pid}`;
}

export interface CloudWatchSinkOptions {
  client: CloudWatchLogsLike;
  logGroup: string;
  /** The process start instant names the stream; read once, when the sink is built. */
  now: () => Date;
  pid: number;
}

function alreadyExists(error: unknown): boolean {
  return error instanceof Error && error.name === 'ResourceAlreadyExistsException';
}

/**
 * Puts each batch on `logGroup` in this process's stream, created on first use (a stream
 * that already exists counts as created; a failed creation is tried again on the next
 * batch; a stream gone missing later is created again on the next batch). One
 * `PutLogEvents` per batch, one JSON line per event, each timestamped with the batch's server
 * `received_at`: `PutLogEvents` refuses a batch spanning more than 24 hours and drops events
 * older than 14 days or over 2 hours ahead, which an offline queue or a skewed device clock
 * would hit. The device's own `ts` stays in the message.
 */
export function cloudWatchSink(options: CloudWatchSinkOptions): TelemetrySink {
  const stream = logStreamName(options.now(), options.pid);
  let created = false;

  async function ensureStream(): Promise<void> {
    if (created) return;
    try {
      await options.client.send(new CreateLogStreamCommand({ logGroupName: options.logGroup, logStreamName: stream }));
    } catch (error) {
      if (!alreadyExists(error)) throw error;
    }
    created = true;
  }

  return {
    write: async (events) => {
      if (events.length === 0) return;
      try {
        await ensureStream();
        const logEvents = events.map((event) => ({ timestamp: Date.parse(event.received_at), message: JSON.stringify(event) }));
        await options.client.send(new PutLogEventsCommand({ logGroupName: options.logGroup, logStreamName: stream, logEvents }));
      } catch (error) {
        if (error instanceof Error && error.name === 'ResourceNotFoundException') created = false;
        logError('ux_event_sink_failed', { count: events.length, error: error instanceof Error ? error.name : String(error) });
      }
    },
  };
}

/** The production sink: the default credential chain (the task role), region from `AWS_REGION`. */
export function createCloudWatchSink(logGroup: string): TelemetrySink {
  return cloudWatchSink({ client: new CloudWatchLogsClient({}), logGroup, now: () => new Date(), pid: process.pid });
}

/** The sink the configuration names (`main.ts`): CloudWatch on `TELEMETRY_LOG_GROUP`, else stdout. */
export function telemetrySinkOf(
  config: Pick<Config, 'TELEMETRY_SINK' | 'TELEMETRY_LOG_GROUP'>,
  cloudWatch: (logGroup: string) => TelemetrySink = createCloudWatchSink,
): TelemetrySink {
  return config.TELEMETRY_SINK === 'cloudwatch' && config.TELEMETRY_LOG_GROUP !== undefined ? cloudWatch(config.TELEMETRY_LOG_GROUP) : stdoutSink;
}
