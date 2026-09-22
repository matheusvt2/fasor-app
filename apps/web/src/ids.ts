import type { NewId } from '@app/domain';
import { v7 as uuidv7 } from 'uuid';

/** The one place apps/web mints ids (TC-2, AD-4): UUIDv7, born where the row is born. */
export const newId: NewId = () => uuidv7();
