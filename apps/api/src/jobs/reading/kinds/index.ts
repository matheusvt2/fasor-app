import type { ReadingKind } from '../payload.ts';
import { captionHandler } from './caption.ts';
import { displayHandler } from './display.ts';
import { ncObsHandler } from './nc-obs.ts';
import { plateHandler } from './plate.ts';
import type { FakeFixtureDefault, ReadingKindHandler } from './types.ts';

export type * from './types.ts';

/*
 * Story 9.1: the reading kinds the job reads, one handler each. A kind absent here fails
 * permanently at its first attempt ("reading kind ... is not read yet"), and its reread
 * answers 400. Stories 9.2, 9.3 and 9.5 add one line each.
 */
export const READING_KIND_HANDLERS: Readonly<Partial<Record<ReadingKind, ReadingKindHandler>>> = {
  plate: plateHandler,
  display: displayHandler,
  caption: captionHandler,
  nc_obs: ncObsHandler,
};

/** The handler of a reading kind, or undefined when the kind is not read yet. */
export function readingKindHandler(kind: ReadingKind): ReadingKindHandler | undefined {
  return READING_KIND_HANDLERS[kind];
}

/** Every kind's default fixtures for the `fake` providers, with their kind. */
export const FAKE_FIXTURE_DEFAULTS: readonly (FakeFixtureDefault & { reading_kind: ReadingKind })[] = Object.values(READING_KIND_HANDLERS).flatMap((handler) =>
  handler.fakeDefaults.map((entry) => ({ reading_kind: handler.kind, ...entry })),
);
