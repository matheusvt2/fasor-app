import { measurementCellPath } from '../ops/path.ts';
import { parseTableUtterance } from '../parse/utterance.ts';
import { evaluateTest } from '../relatorio/readings.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { suggestionRowSchema, type AudioTarget, type SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';

/*
 * Story 31.1 (AD-30, decision 4): a reading spoken into a measurement table is the one text of an
 * audio that is suggested, never written. The kernel reads the text as heard on the table as the
 * sheet evaluates it now (`parseTableUtterance`): a parsed reading becomes one pending Suggestion
 * on its cell, sourced by the audio; anything else is no reading, and its text goes to the ficha's
 * OBSERVAÇÕES as prose from that audio (the transcription job).
 */

/** The prompt version a reading suggestion carries: no model ran, the kernel parsed it. */
export const AUDIO_READING_VERSION = 'audio-reading-1';

/** The reading a table's speech names: its cell's path and its value, or null when the speech is no reading on that table. */
export function audioTableReading(
  snapshot: RelatorioSnapshot,
  target: Extract<AudioTarget, { type: 'table' }>,
  heard: string,
): { target_path: string; value: { raw: string; unit: string | null; state: 'measured' } } | null {
  const block = snapshot.blocks.find((row) => row.id === target.block_id && row.removed_at === null);
  if (block === undefined) return null;
  const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
  const test = definition?.tests.find((one) => one.key === target.test_key);
  if (definition === null || definition === undefined || test === undefined) return null;
  const visit = visitContextOf({ locations: snapshot.locations, equipment: snapshot.equipment, relatorio: snapshot.relatorio }, block);
  const table = evaluateTest(block, definition, test, visit).tables.find((one) => one.key === target.table_key);
  if (table === undefined) return null;
  const parsed = parseTableUtterance(heard, table);
  if (parsed.kind !== 'cell') return null;
  return { target_path: measurementCellPath(block.id, parsed.address), value: { raw: parsed.raw, unit: parsed.unit, state: 'measured' } };
}

/** The pending Suggestion of a spoken reading (AD-12), sourced by the audio: no box, no tokens. */
export function audioReadingSuggestion(input: {
  id: string;
  relatorioId: string;
  audioId: string;
  reading: { target_path: string; value: { raw: string; unit: string | null; state: 'measured' } };
}): SuggestionRow {
  return suggestionRowSchema.parse({
    id: input.id,
    relatorio_id: input.relatorioId,
    target_path: input.reading.target_path,
    value: input.reading.value,
    trust: 'suggested',
    mode: 'fill',
    source: { audio_id: input.audioId },
    status: 'pending',
    prompt_version: AUDIO_READING_VERSION,
    hint: null,
  });
}
