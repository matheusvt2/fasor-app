import type { Clock } from '@app/domain';

/** The one place apps/api reads the clock (TC-1); everything else takes `now` from here. */
export const now: Clock = () => new Date();
