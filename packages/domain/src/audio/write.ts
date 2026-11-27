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
import { parseRichText, plainTextToRichBlocks, richRunsText, serializeRichText } from '../templates/rich-text.ts';
import { defaultSectionText } from '../templates/section-text.ts';
import { audioAutomaticCaptions, type AudioContextOptions } from './context.ts';

/*
 * Story 31.1 (AD-30, Epic 31 decision 17): how the text of an audio lands in its prose field, a rule
 * of the kernel the server only applies. The text is added after the value already there (a new
 * paragraph; a new rich-text paragraph in a section text), never replacing it, except a photo caption
 * still equal to its automatic caption, which the audio replaces. On "Texto da conclusão" and the
 * parecer summary the audio adds to the composed text while none was confirmed or edited, and the
 * result is an edited text. The batch that writes it names the audio (`meta.source_audio_id`, set by
 * the server on each put).
 */

/** The text of a field once an audio's text is added: a new paragraph after the value, or the text alone on an empty field. */
export function appendAudioText(current: string | null | undefined, text: string, options: { rich?: boolean } = {}): string {
  const base = (current ?? '').trim() === '' ? '' : (current as string);
  if (options.rich === true) return serializeRichText([...parseRichText(base), ...plainTextToRichBlocks(text)]);
  return base === '' ? text : `${base.replace(/\s+$/, '')}\n\n${text}`;
}

/**
 * Story 31.7: the characters of a rich-text field (a section text) as the audio mark compares them with the
 * audio's written text: one line per block, the markup gone.
 */
export function audioRichFieldText(text: string | null | undefined): string {
  return parseRichText(text ?? '').map((block) => richRunsText(block.runs)).join('\n');
}

/** The puts that write an audio's text into its field, in order. */
export interface AudioProseWrite {
  puts: { path: string; value: JsonValue }[];
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function liveBlock(snapshot: RelatorioSnapshot, blockId: string): BlockRow | null {
  return snapshot.blocks.find((row) => row.id === blockId && row.removed_at === null) ?? null;
}

/**
 * The puts that write `text` (the audio's written text, or its text as heard) into a prose target,
 * against the field as the snapshot holds it; null when the relatório no longer holds the field (a
 * removed sheet, photo or point; a parecer with no verdict tapped; a sheet not marked Não ensaiado)
 * or for a measurement table, which is never written.
 */
export function audioProseWrite(snapshot: RelatorioSnapshot, target: AudioTarget, text: string, options: AudioContextOptions): AudioProseWrite | null {
  const one = (path: string, value: JsonValue): AudioProseWrite => ({ puts: [{ path, value }] });
  switch (target.type) {
    case 'item': {
      const block = liveBlock(snapshot, target.block_id);
      const definition = block === null ? null : blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
      if (block === null || !(definition?.checklist ?? []).some((item) => item.key === target.item_key)) return null;
      return one(sheetChecklistPath(block.id, target.item_key, 'observation'), appendAudioText(textOf(block.sheet.checklist[target.item_key]?.observation?.value), text));
    }
    case 'sheet_field': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null || isSectionBlockType(block.block_type)) return null;
      if (target.field === 'observations') return one(sheetObservationsPath(block.id), appendAudioText(textOf(block.sheet.observations?.value), text));
      if (target.field === 'not_tested_text') {
        if (block.not_tested === null) return null;
        // A stored note is added to; with none, the justification the ficha shows (the utility's default, Story 28.4) is.
        const tag = block.equipment_id === null ? null : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? null);
        const shown = block.not_tested.text ?? (isUtilityNotTested(block) ? notTestedJustification(block, tag) : null);
        return one(blockFieldPath(block.id, 'not_tested'), { ...block.not_tested, text: appendAudioText(shown, text) } as JsonValue);
      }
      // The conclusion text: added to the stored text, else to the composed one, and edited either way.
      const stored = textOf(block.sheet.conclusion.text?.value);
      const puts: AudioProseWrite['puts'] = [];
      if (stored !== null && stored.trim() !== '') {
        puts.push({ path: sheetConclusionPath(block.id, 'text'), value: appendAudioText(stored, text) });
        puts.push({ path: sheetConclusionPath(block.id, 'text_status'), value: 'edited' });
        return { puts };
      }
      const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
      if (definition === null) return null;
      const tag = block.equipment_id === null ? '' : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? '');
      const visit = visitContextOf({ locations: snapshot.locations, equipment: snapshot.equipment, relatorio: snapshot.relatorio }, block);
      const composed = composeConclusion(block, definition, tag, visit);
      puts.push({ path: sheetConclusionPath(block.id, 'text'), value: appendAudioText(composed.text, text) });
      puts.push({ path: sheetConclusionPath(block.id, 'text_status'), value: 'edited' });
      puts.push({ path: sheetConclusionPath(block.id, 'text_basis'), value: composed.basis });
      return { puts };
    }
    case 'test_value': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null) return null;
      return one(sheetTestValuePath(block.id, target.test_key, target.value_key), appendAudioText(textOf(block.sheet.test[target.test_key]?.values?.[target.value_key]?.value), text));
    }
    case 'photo_caption': {
      const photo = snapshot.files.find((file) => file.id === target.file_id && file.kind === 'photo' && file.removed_at === null);
      if (photo === undefined || photo.kind !== 'photo') return null;
      const automatic = photo.caption !== null && audioAutomaticCaptions(snapshot, photo.id, options.registry).includes(photo.caption);
      return one(fileFieldPath(photo.id, 'caption'), automatic ? text : appendAudioText(photo.caption, text));
    }
    case 'point': {
      const point = snapshot.points.find((row) => row.id === target.point_id && row.removed_at === null);
      if (point === undefined) return null;
      return one(pointFieldPath(point.id, target.field), appendAudioText(target.field === 'text' ? point.text : point.action, text));
    }
    case 'setup': {
      const setup = snapshot.relatorio.setup;
      if (target.field !== 'parecer_text') return one(relatorioSetupPath(target.field), appendAudioText(setup[target.field], text));
      const parecer = setup.parecer;
      if (parecer === null) return null;
      const composed = parecer.text === null ? composeParecer(snapshot) : null;
      return one(relatorioSetupPath('parecer'), {
        ...parecer,
        text: appendAudioText(parecer.text ?? composed?.text ?? null, text),
        text_status: 'edited',
        text_basis: composed?.basis ?? parecer.text_basis,
      });
    }
    case 'section': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null || !isSectionBlockType(block.block_type)) return null;
      const own = textOf((block.config as { section_text?: unknown } | null)?.section_text);
      const current = own ?? defaultSectionText(block.seed_version, block.block_type, options.now) ?? '';
      return one(blockFieldPath(block.id, 'config'), editedSectionTextConfig(block.config, appendAudioText(current, text, { rich: true })) as JsonValue);
    }
    case 'table':
      return null;
  }
}
