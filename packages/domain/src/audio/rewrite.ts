import { blockFieldPath, fileFieldPath, pointFieldPath, relatorioSetupPath, sheetChecklistPath, sheetConclusionPath, sheetObservationsPath, sheetTestValuePath } from '../ops/path.ts';
import { isUtilityNotTested, notTestedJustification } from '../points/derived.ts';
import { composeConclusion } from '../relatorio/conclusion.ts';
import { composeParecer } from '../relatorio/parecer.ts';
import { editedSectionTextConfig } from '../relatorio/section-variables.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { isSectionBlockType } from '../schemas/block-config.ts';
import type { AudioTarget, BlockRow, JsonValue } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import { plainTextToRichBlocks, serializeRichText } from '../templates/rich-text.ts';
import { defaultSectionText } from '../templates/section-text.ts';
import { audioContextText, audioWritingContext, type AudioWritingContext } from './context.ts';
import { writtenTextGuard, type GuardVerdict } from './guard.ts';
import { audioRichFieldText, type AudioProseWrite } from './write.ts';

/*
 * Story 31.9 (AD-30, FR-79): the AI control ("Melhorar o texto com IA"), the kernel's half. On the
 * user's tap the server rewrites the text a prose field holds at the `report` level with the
 * field's context; the device then replaces the field's text by ordinary puts and "Desfazer" puts
 * the former values back. The rules every reader shares live here, against one relatório snapshot:
 *
 * - `aiRewriteSource`: the text the field shows (the composed text of "Texto da conclusão" and of
 *   the parecer summary while none is stored; a section text's characters without its markup) and
 *   the context of the prompt; null on an empty field (no control) or a measurement table.
 * - `aiRewriteVerdict`: `writtenTextGuard` with the field's text as the source; an empty answer
 *   fails too. The model never decides a result, adds a fact or changes a number, unit or TAG.
 * - `aiRewriteWrite`: the puts that replace the field's text (never added to, unlike an audio's);
 *   the conclusion text and the parecer summary become the user's edited text; the picked result
 *   is never written.
 * - `aiRewriteRestore`: the puts that put back what the field holds now (taken before the write).
 *
 * A section text is rewritten as plain paragraphs: its formatting is not kept ("Desfazer" restores it).
 */

export interface AiRewriteSource {
  /** The text the field shows, trimmed of nothing: the exact characters the model rewrites. */
  text: string;
  context: AudioWritingContext;
}

/** One field as the AI control reads and writes it. */
interface Field {
  /** The text shown, or null when the field holds none. */
  text: string | null;
  replace: (text: string) => AudioProseWrite;
  restore: () => AudioProseWrite;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function liveBlock(snapshot: RelatorioSnapshot, blockId: string): BlockRow | null {
  return snapshot.blocks.find((row) => row.id === blockId && row.removed_at === null) ?? null;
}

/** One put whose former value is `before`. */
function cellField(path: string, before: unknown): Field {
  const text = textOf(before);
  return {
    text,
    replace: (next) => ({ puts: [{ path, value: next }] }),
    restore: () => ({ puts: [{ path, value: (before ?? null) as JsonValue }] }),
  };
}

function fieldOf(snapshot: RelatorioSnapshot, target: AudioTarget, now: Date): Field | null {
  switch (target.type) {
    case 'item': {
      const block = liveBlock(snapshot, target.block_id);
      const definition = block === null ? null : blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
      if (block === null || !(definition?.checklist ?? []).some((item) => item.key === target.item_key)) return null;
      return cellField(sheetChecklistPath(block.id, target.item_key, 'observation'), block.sheet.checklist[target.item_key]?.observation?.value);
    }
    case 'sheet_field': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null || isSectionBlockType(block.block_type)) return null;
      if (target.field === 'observations') return cellField(sheetObservationsPath(block.id), block.sheet.observations?.value);
      if (target.field === 'not_tested_text') {
        const marked = block.not_tested;
        if (marked === null) return null;
        // The justification the ficha shows: the stored note, else the utility's default (Story 28.4).
        const tag = block.equipment_id === null ? null : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? null);
        const shown = marked.text ?? (isUtilityNotTested(block) ? notTestedJustification(block, tag) : null);
        const path = blockFieldPath(block.id, 'not_tested');
        return {
          text: shown,
          replace: (next) => ({ puts: [{ path, value: { ...marked, text: next } as JsonValue }] }),
          restore: () => ({ puts: [{ path, value: marked as JsonValue }] }),
        };
      }
      // "Texto da conclusão": the stored text, else the one composed now; edited either way once rewritten.
      const conclusion = block.sheet.conclusion;
      const stored = textOf(conclusion.text?.value);
      const before = (field: 'text' | 'text_status' | 'text_basis') => ({ path: sheetConclusionPath(block.id, field), value: (conclusion[field]?.value ?? null) as JsonValue });
      const restore = () => ({ puts: [before('text'), before('text_status'), before('text_basis')] });
      if (stored !== null && stored.trim() !== '') {
        return {
          text: stored,
          replace: (next) => ({
            puts: [
              { path: sheetConclusionPath(block.id, 'text'), value: next },
              { path: sheetConclusionPath(block.id, 'text_status'), value: 'edited' },
            ],
          }),
          restore,
        };
      }
      const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
      if (definition === null) return null;
      const tag = block.equipment_id === null ? '' : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? '');
      const visit = visitContextOf({ locations: snapshot.locations, equipment: snapshot.equipment, relatorio: snapshot.relatorio }, block);
      const composed = composeConclusion(block, definition, tag, visit);
      return {
        text: composed.text,
        replace: (next) => ({
          puts: [
            { path: sheetConclusionPath(block.id, 'text'), value: next },
            { path: sheetConclusionPath(block.id, 'text_status'), value: 'edited' },
            { path: sheetConclusionPath(block.id, 'text_basis'), value: composed.basis },
          ],
        }),
        restore,
      };
    }
    case 'test_value': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null) return null;
      return cellField(sheetTestValuePath(block.id, target.test_key, target.value_key), block.sheet.test[target.test_key]?.values?.[target.value_key]?.value);
    }
    case 'photo_caption': {
      const photo = snapshot.files.find((file) => file.id === target.file_id && file.kind === 'photo' && file.removed_at === null);
      if (photo === undefined || photo.kind !== 'photo') return null;
      return cellField(fileFieldPath(photo.id, 'caption'), photo.caption);
    }
    case 'point': {
      const point = snapshot.points.find((row) => row.id === target.point_id && row.removed_at === null);
      if (point === undefined) return null;
      return cellField(pointFieldPath(point.id, target.field), target.field === 'text' ? point.text : point.action);
    }
    case 'setup': {
      const setup = snapshot.relatorio.setup;
      if (target.field !== 'parecer_text') return cellField(relatorioSetupPath(target.field), setup[target.field]);
      const parecer = setup.parecer;
      if (parecer === null) return null;
      const composed = parecer.text === null ? composeParecer(snapshot) : null;
      const path = relatorioSetupPath('parecer');
      return {
        text: parecer.text ?? composed?.text ?? null,
        replace: (next) => ({ puts: [{ path, value: { ...parecer, text: next, text_status: 'edited', text_basis: composed?.basis ?? parecer.text_basis } }] }),
        restore: () => ({ puts: [{ path, value: parecer as unknown as JsonValue }] }),
      };
    }
    case 'section': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null || !isSectionBlockType(block.block_type)) return null;
      const own = textOf((block.config as { section_text?: unknown } | null)?.section_text);
      const current = own ?? defaultSectionText(block.seed_version, block.block_type, now) ?? '';
      const path = blockFieldPath(block.id, 'config');
      return {
        text: audioRichFieldText(current),
        replace: (next) => ({ puts: [{ path, value: editedSectionTextConfig(block.config, serializeRichText(plainTextToRichBlocks(next))) as JsonValue }] }),
        restore: () => ({ puts: [{ path, value: (block.config ?? null) as JsonValue }] }),
      };
    }
    case 'table':
      return null;
  }
}

/** The text of a prose field the AI control rewrites, and the prompt's context; null on an empty field, a field the relatório no longer holds, or a table. */
export function aiRewriteSource(snapshot: RelatorioSnapshot, target: AudioTarget, options: { now: Date }): AiRewriteSource | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  const context = audioWritingContext(snapshot, target);
  return context === null ? null : { text: field.text, context };
}

/** Whether the AI control's answer may enter the field: the guard of a written text, with the field's text as what was "heard". */
export function aiRewriteVerdict(source: AiRewriteSource, written: string): GuardVerdict {
  if (written.trim() === '') return { ok: false, reasons: [] };
  return writtenTextGuard(source.text, audioContextText(source.context), written);
}

/** The puts that replace the field's text with `text`; null when the field holds no text. */
export function aiRewriteWrite(snapshot: RelatorioSnapshot, target: AudioTarget, text: string, options: { now: Date }): AudioProseWrite | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  return field.replace(text.trim());
}

/** The puts that put back what the field holds now ("Desfazer"), taken before the write; null when the field holds no text. */
export function aiRewriteRestore(snapshot: RelatorioSnapshot, target: AudioTarget, options: { now: Date }): AudioProseWrite | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  return field.restore();
}
