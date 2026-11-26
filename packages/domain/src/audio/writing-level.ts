import type { AudioTarget } from '../schemas/entities.ts';

/*
 * Story 31.1 (AD-30, Epic 31 "The two writing levels"): the kernel names the level of every field;
 * the user never picks. `polish` keeps the content and fixes punctuation, agreement, the trade's
 * words and the filler; `report` rewrites as report prose with the field's context; `reading` is a
 * measurement table, never written by a model (its speech is parsed into a Suggestion).
 */

export type AudioWritingLevel = 'polish' | 'report' | 'reading';

/** The writing level of an audio's target, by the epic's table. */
export function audioWritingLevel(target: AudioTarget): AudioWritingLevel {
  switch (target.type) {
    case 'photo_caption':
    case 'item':
    case 'test_value':
    case 'point':
      return 'polish';
    case 'sheet_field':
      return target.field === 'not_tested_text' ? 'polish' : 'report';
    case 'setup':
      return target.field === 'parecer_text' ? 'report' : 'polish';
    case 'section':
      return 'report';
    case 'table':
      return 'reading';
  }
}
