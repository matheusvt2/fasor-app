/*
 * Story 31.1 (AD-30): the voice input of the kernel. An audio is a `file` of kind `audio` with a
 * target, a status and its measures (`schemas/entities.ts`); this folder holds the rules every
 * reader shares: where the target lives in the op paths, its writing level, the status words and
 * the counts, the quality verdict, the guard of a written text, the prompt's context and the write
 * of a prose field; Story 31.9, the AI control's source, guard, write and restore; Story 31.10, its
 * comparison and the refusal text.
 */
export * from './target.ts';
export * from './writing-level.ts';
export * from './status.ts';
export * from './quality.ts';
export * from './guard.ts';
export * from './context.ts';
export * from './write.ts';
export * from './rewrite.ts';
export * from './proposal.ts';
export * from './reading.ts';
export * from './recording.ts';
export * from './hold.ts';
