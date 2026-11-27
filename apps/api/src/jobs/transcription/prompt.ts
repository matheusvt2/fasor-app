import type { WritingStepLevel } from '@app/domain';

/*
 * Story 31.2 (AD-30): the writing step's prompt and tool, versioned together as the reading's and
 * the audit's are. The model gets the text as heard, the field's level and the context the kernel
 * assembled, and answers one text through the tool. It never decides a result, adds a fact or
 * changes a number, a unit or a TAG; the kernel's guard (`writtenTextGuard`) checks the last three
 * and the job falls back to the text as heard. Bump `TRANSCRIPTION_PROMPT_VERSION` with every change
 * of the system text, the request text or the tool schema; the run row carries it.
 */

export const TRANSCRIPTION_PROMPT_VERSION = 'transcription-write-1';

/**
 * Story 31.9: the same family on a tap on the AI control, where the text is one a field already
 * holds (typed, spoken earlier, or composed by the app) rather than a dictation; only the request
 * text differs (`writingPrompt` with `source: 'field'`), so it carries a version of its own.
 */
export const AI_WRITE_PROMPT_VERSION = 'transcription-write-field-1';

export const WRITING_TOOL = 'record_text';

/** One field's text: a paragraph or two at most. */
export const WRITING_MAX_TOKENS = 1200;

/** What each level asks of the model (the epic's table "The two writing levels"). */
export const LEVEL_RULES: Readonly<Record<WritingStepLevel, string>> = {
  polish:
    'Polish the dictated text: fix punctuation, agreement and the spelling of the trade words, and remove filler words and false starts. Keep the content, the order and the meaning exactly; do not add a sentence.',
  report:
    'Rewrite the dictated text as technical report prose for the field named in the context, in the register of an inspection report, using the context only to name things the way the report names them. Keep every fact the text states and add none.',
};

export const WRITING_SYSTEM = [
  'You write one field of the technical report of an inspection of a medium-voltage electrical substation in Brazil, from what the engineer dictated on site.',
  'Write in Brazilian Portuguese (pt-BR).',
  `Call the ${WRITING_TOOL} tool exactly once with the field's text.`,
  'Rules: never decide or change a result (APROVADO, REPROVADO, Conforme, Não conforme, a verdict); never add a fact, a reading, an equipment or a recommendation the dictated text does not state; never add, drop or change a number, a unit or a TAG.',
  'Write numbers the Brazilian way (13,8 kV; 1.500 kVA) and units by their symbols (kV, A, MΩ, GΩ, °C, %).',
].join('\n');

/** Story 31.9: what the request says of a field's own text (the AI control). */
export const FIELD_TEXT_RULE =
  'The text below is what the field holds now (typed, dictated earlier or composed by the app), not a dictation: improve it as report prose, keeping every fact, number, unit and TAG it states.';

/** The request text: the level's rule, the context lines and the dictated text (or, Story 31.9, the field's text). */
export function writingPrompt(input: { level: WritingStepLevel; context: string; text: string; source?: 'audio' | 'field' }): string {
  if (input.source === 'field') {
    return [`Level: ${input.level}. ${LEVEL_RULES[input.level]}`, FIELD_TEXT_RULE, '', 'Context:', input.context, '', 'Field text:', input.text].join('\n');
  }
  return [`Level: ${input.level}. ${LEVEL_RULES[input.level]}`, '', 'Context:', input.context, '', 'Dictated text:', input.text].join('\n');
}

type JsonSchema = Record<string, unknown>;

/** The tool's input: `{text}`, one non-empty text. */
export const WRITING_TOOL_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { text: { type: 'string', minLength: 1, description: "The field's text in Brazilian Portuguese." } },
  required: ['text'],
  additionalProperties: false,
};

export const WRITING_TOOL_DESCRIPTION = "Records the field's text written from the dictation.";
