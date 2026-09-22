import type { NewId } from '@app/domain';
import { v7 as uuidv7 } from 'uuid';

/** The one place apps/api mints ids (TC-2, AD-4): only for rows the server creates. */
export const newId: NewId = () => uuidv7();
