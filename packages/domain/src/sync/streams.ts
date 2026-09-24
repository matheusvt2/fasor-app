/*
 * Epic 4 retro item 17: the device follows three kinds of pull streams -- the company
 * stream, one per relatório, and one per project (its project-scope ops only, the
 * equipment a new relatório of the obra reuses). A project stream's id is `project:{id}`
 * so it shares the device's per-stream cursor bookkeeping without ever being read as a
 * relatório id.
 */

const PROJECT_STREAM_PREFIX = 'project:';

/** The stream id of a project's own pull stream. */
export function projectStreamId(projectId: string): string {
  return `${PROJECT_STREAM_PREFIX}${projectId}`;
}

/** True for a project stream id (`project:{id}`). */
export function isProjectStreamId(streamId: string): boolean {
  return streamId.startsWith(PROJECT_STREAM_PREFIX);
}

/** The project id of a project stream id, or null for any other stream. */
export function projectIdOfStream(streamId: string): string | null {
  return isProjectStreamId(streamId) ? streamId.slice(PROJECT_STREAM_PREFIX.length) : null;
}
