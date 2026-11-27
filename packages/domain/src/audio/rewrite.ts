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
import { parseRichText, richRunsText, serializeRichText, type RichBlock, type RichBlockKind, type RichRun } from '../templates/rich-text.ts';
import { defaultSectionText } from '../templates/section-text.ts';
import { audioContextText, audioWritingContext, type AudioWritingContext } from './context.ts';
import { writtenTextGuard, type GuardReason, type GuardVerdict } from './guard.ts';
import { aiRewriteDiff, type AiDiffSegment } from './proposal.ts';
import { type AudioProseWrite } from './write.ts';

/*
 * Story 31.9 (AD-30, FR-79): the AI control ("Melhorar o texto com IA"), the kernel's half. On the
 * user's tap the server rewrites the text a prose field holds at the `report` level with the
 * field's context; the device then replaces the field's text by ordinary puts and "Desfazer" puts
 * the former text back. The rules every reader shares live here, against one relatório snapshot:
 *
 * - `aiRewriteSource`: the text the field shows (the composed text of "Texto da conclusão" and of
 *   the parecer summary while none is stored; a section text's characters without its markup, one
 *   line per block), the pieces the model rewrites one by one and the context of the prompt; null on
 *   an empty field (no control) or a measurement table.
 * - `aiRewriteJoin`: the pieces the model wrote, as the one text the route answers.
 * - `aiRewriteVerdict`: `writtenTextGuard` with the field's text as the source (per block on a
 *   section text); an empty answer fails too. The model never decides a result, adds a fact or
 *   changes a number, unit or TAG.
 * - `aiRewriteWrite`: the puts that replace the field's text (never added to, unlike an audio's);
 *   the conclusion text and the parecer summary become the user's edited text; the picked result
 *   is never written.
 * - `aiRewriteFormer` and `aiRewriteRestore` (e31f): the text the field held before the write, and
 *   the puts that put only that text back onto the field as it is at "Desfazer", so a verdict, a
 *   Não ensaiado mark or a section's config changed meanwhile is never reverted.
 *
 * e31f (Matheus, 2026-11-26): a section text keeps its formatting. The model rewrites it block by
 * block (one piece per paragraph or list item); the write gives each written block back its kind
 * (a list item stays a list item) and keeps bold and italic on the words that survive verbatim
 * (`remarkRuns`). A mark on words the model changed is lost (Coordinator's reading, open to Matheus).
 */

export interface AiRewriteSource {
  /** The text the field shows, trimmed of nothing: the exact characters the model rewrites. */
  text: string;
  context: AudioWritingContext;
  /** e31f: what the model rewrites, one call each, in order: the whole text, or one per block of a section text. */
  pieces: string[];
  /** e31f: a section text (rich): the written pieces come back one line each and keep their block's kind. */
  rich: boolean;
}

/** e31f: what a field held before the AI control wrote it; only its text, never a verdict or a mark. */
export interface AiRewriteFormer {
  /** The stored text (null when none was stored: the composed text, the utility's default, the seed text). */
  text: string | null;
  /** "Texto da conclusão" and the parecer summary: the text's status and basis before the write. */
  text_status?: string | null;
  text_basis?: string | null;
  /** A section text: whether it was marked edited. */
  edited?: boolean;
}

/** One field as the AI control reads and writes it. */
interface Field {
  /** The text shown, or null when the field holds none. */
  text: string | null;
  /** e31f: the blocks of a section text, or null for a plain field. */
  blocks: RichBlock[] | null;
  replace: (text: string) => AudioProseWrite | null;
  former: AiRewriteFormer;
  /** The puts that put `former`'s text back onto the field as it is now; null when it no longer holds it. */
  restore: (former: AiRewriteFormer) => AudioProseWrite | null;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function liveBlock(snapshot: RelatorioSnapshot, blockId: string): BlockRow | null {
  return snapshot.blocks.find((row) => row.id === blockId && row.removed_at === null) ?? null;
}

/** One put; its former value is `before`. */
function cellField(path: string, before: unknown): Field {
  const text = textOf(before);
  return {
    text,
    blocks: null,
    replace: (next) => ({ puts: [{ path, value: next }] }),
    former: { text },
    restore: (former) => ({ puts: [{ path, value: former.text }] }),
  };
}

/** The non-blank lines of a written text, trimmed. */
function linesOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * e31f: a rewritten block's runs: its new characters, with bold and italic kept on each marked run
 * of the former block whose words the new text still holds verbatim (case aside), searched in
 * order. A marked run the model changed is left unmarked.
 */
export function remarkRuns(former: readonly RichRun[], text: string): RichRun[] {
  const marks: { bold: boolean; italic: boolean }[] = Array.from({ length: text.length }, () => ({ bold: false, italic: false }));
  const lower = text.toLocaleLowerCase('pt-BR');
  const sameLength = lower.length === text.length;
  let cursor = 0;
  for (const source of former) {
    if (source.bold !== true && source.italic !== true) continue;
    const words = source.text.trim();
    if (words === '') continue;
    const find = (from: number): number => {
      const exact = text.indexOf(words, from);
      if (exact !== -1 || !sameLength) return exact;
      return lower.indexOf(words.toLocaleLowerCase('pt-BR'), from);
    };
    let at = find(cursor);
    if (at === -1) at = find(0);
    if (at === -1) continue;
    for (let i = at; i < at + words.length; i++) {
      if (source.bold === true) marks[i]!.bold = true;
      if (source.italic === true) marks[i]!.italic = true;
    }
    cursor = at + words.length;
  }
  const runs: RichRun[] = [];
  for (let i = 0; i < text.length; i++) {
    const mark = marks[i]!;
    const last = runs.at(-1);
    const lastBold = last?.bold === true;
    const lastItalic = last?.italic === true;
    if (last !== undefined && lastBold === mark.bold && lastItalic === mark.italic) last.text += text[i]!;
    else runs.push({ text: text[i]!, ...(mark.bold ? { bold: true as const } : {}), ...(mark.italic ? { italic: true as const } : {}) });
  }
  return runs;
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
          blocks: null,
          replace: (next) => ({ puts: [{ path, value: { ...marked, text: next } as JsonValue }] }),
          former: { text: marked.text },
          // Only the note goes back, onto the mark as it is now (its reason may have changed).
          restore: (former) => ({ puts: [{ path, value: { ...marked, text: former.text } as JsonValue }] }),
        };
      }
      // "Texto da conclusão": the stored text, else the one composed now; edited either way once rewritten.
      const conclusion = block.sheet.conclusion;
      const stored = textOf(conclusion.text?.value);
      const former: AiRewriteFormer = {
        text: stored,
        text_status: textOf(conclusion.text_status?.value),
        text_basis: textOf(conclusion.text_basis?.value),
      };
      // The text and its status and basis only; the picked result and its restriction are never written.
      const restore = (was: AiRewriteFormer): AudioProseWrite => ({
        puts: [
          { path: sheetConclusionPath(block.id, 'text'), value: was.text },
          { path: sheetConclusionPath(block.id, 'text_status'), value: was.text_status ?? null },
          { path: sheetConclusionPath(block.id, 'text_basis'), value: was.text_basis ?? null },
        ],
      });
      if (stored !== null && stored.trim() !== '') {
        return {
          text: stored,
          blocks: null,
          replace: (next) => ({
            puts: [
              { path: sheetConclusionPath(block.id, 'text'), value: next },
              { path: sheetConclusionPath(block.id, 'text_status'), value: 'edited' },
            ],
          }),
          former,
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
        blocks: null,
        replace: (next) => ({
          puts: [
            { path: sheetConclusionPath(block.id, 'text'), value: next },
            { path: sheetConclusionPath(block.id, 'text_status'), value: 'edited' },
            { path: sheetConclusionPath(block.id, 'text_basis'), value: composed.basis },
          ],
        }),
        former,
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
        blocks: null,
        replace: (next) => ({ puts: [{ path, value: { ...parecer, text: next, text_status: 'edited', text_basis: composed?.basis ?? parecer.text_basis } }] }),
        former: { text: parecer.text, text_status: parecer.text_status, text_basis: parecer.text_basis },
        // The summary only, onto the parecer as it is now: the verdict tapped meanwhile stays.
        restore: (former) => ({
          puts: [{ path, value: { ...parecer, text: former.text, text_status: (former.text_status ?? null) as typeof parecer.text_status, text_basis: former.text_basis ?? null } }],
        }),
      };
    }
    case 'section': {
      const block = liveBlock(snapshot, target.block_id);
      if (block === null || !isSectionBlockType(block.block_type)) return null;
      const config = block.config as { section_text?: unknown; section_text_edited?: unknown } | null;
      const own = textOf(config?.section_text);
      const current = own ?? defaultSectionText(block.seed_version, block.block_type, now) ?? '';
      const blocks = parseRichText(current);
      const path = blockFieldPath(block.id, 'config');
      return {
        text: blocks.map((one) => richRunsText(one.runs)).join('\n'),
        blocks,
        // One written line per block, each given back its block's kind and the marks whose words survive.
        replace: (next) => {
          const lines = linesOf(next);
          if (lines.length !== blocks.length) return null;
          const written = blocks.map((one, at) => ({ kind: one.kind, runs: remarkRuns(one.runs, lines[at]!) }));
          return { puts: [{ path, value: editedSectionTextConfig(block.config, serializeRichText(written)) as JsonValue }] };
        },
        former: { text: own, edited: config?.section_text_edited === true },
        // The text and its edited mark only, onto the config as it is now.
        restore: (former) => ({ puts: [{ path, value: { ...((block.config ?? {}) as Record<string, unknown>), section_text: former.text, section_text_edited: former.edited === true } as JsonValue }] }),
      };
    }
    case 'table':
      return null;
  }
}

/** The text of a prose field the AI control rewrites, its pieces and the prompt's context; null on an empty field, a field the relatório no longer holds, or a table. */
export function aiRewriteSource(snapshot: RelatorioSnapshot, target: AudioTarget, options: { now: Date }): AiRewriteSource | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  const context = audioWritingContext(snapshot, target);
  if (context === null) return null;
  const rich = field.blocks !== null;
  return { text: field.text, context, pieces: rich ? field.blocks!.map((one) => richRunsText(one.runs)) : [field.text], rich };
}

/** e31f: the pieces the model wrote, in order, as one text: on a section text one line per block (a piece's own line breaks become spaces). */
export function aiRewriteJoin(source: AiRewriteSource, written: readonly string[]): string {
  if (!source.rich) return (written[0] ?? '').trim();
  return written.map((piece) => piece.replace(/\s+/g, ' ').trim()).join('\n');
}

/**
 * Whether the AI control's answer may enter the field: the guard of a written text, with the field's
 * text as what was "heard". On a section text the answer must hold one line per block, each guarded
 * against its own block, so a number moved from one block to another is refused too.
 */
export function aiRewriteVerdict(source: AiRewriteSource, written: string): GuardVerdict {
  if (written.trim() === '') return { ok: false, reasons: [] };
  const context = audioContextText(source.context);
  if (!source.rich) return writtenTextGuard(source.text, context, written);
  const lines = linesOf(written);
  if (lines.length !== source.pieces.length) return { ok: false, reasons: [] };
  const reasons: GuardReason[] = [];
  source.pieces.forEach((piece, at) => {
    const verdict = writtenTextGuard(piece, context, lines[at]!);
    if (!verdict.ok) reasons.push(...verdict.reasons);
  });
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** The puts that replace the field's text with `text`; null when the field holds no text, or a section text's answer does not hold one line per block. */
export function aiRewriteWrite(snapshot: RelatorioSnapshot, target: AudioTarget, text: string, options: { now: Date }): AudioProseWrite | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  return field.replace(text.trim());
}

/** Story 31.10: one block of a side of the comparison: its kind (a plain field is one paragraph) and its runs. */
export interface AiCompareBlock {
  kind: RichBlockKind;
  segments: AiDiffSegment[];
}

/** Story 31.10: the two sides the field shows before anything is written: the user's text and the AI's proposal, changed words marked. */
export interface AiComparison {
  mine: AiCompareBlock[];
  proposed: AiCompareBlock[];
}

/**
 * Story 31.10: the comparison of the field's text with a proposal. A plain field is one block each
 * side (its line breaks kept); a section text keeps its blocks and their kinds on both sides, each
 * proposed line diffed against its own block (the block-by-block rewrite of e31f). Null when the
 * field holds no text, or a section text's proposal does not hold one line per block.
 */
export function aiRewriteComparison(snapshot: RelatorioSnapshot, target: AudioTarget, proposal: string, options: { now: Date }): AiComparison | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  const plain = (text: string): AiDiffSegment[] => [{ text, changed: false }];
  if (field.blocks === null) {
    return { mine: [{ kind: 'paragraph', segments: plain(field.text) }], proposed: [{ kind: 'paragraph', segments: aiRewriteDiff(field.text, proposal.trim()) }] };
  }
  const blocks = field.blocks;
  const lines = linesOf(proposal);
  if (lines.length !== blocks.length) return null;
  return {
    mine: blocks.map((one) => ({ kind: one.kind, segments: plain(richRunsText(one.runs)) })),
    proposed: blocks.map((one, at) => ({ kind: one.kind, segments: aiRewriteDiff(richRunsText(one.runs), lines[at]!) })),
  };
}

/** e31f: what the field holds before the write ("Desfazer" puts its text back); null when the field holds no text. */
export function aiRewriteFormer(snapshot: RelatorioSnapshot, target: AudioTarget, options: { now: Date }): AiRewriteFormer | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null || field.text === null || field.text.trim() === '') return null;
  return field.former;
}

/**
 * e31f: the puts of "Desfazer": the former text (`aiRewriteFormer`, taken before the write) put back
 * onto the field as the snapshot holds it now, never a whole former object, so a verdict, a mark or
 * a config the user changed after the write stays. Null when the relatório no longer holds the field.
 */
export function aiRewriteRestore(snapshot: RelatorioSnapshot, target: AudioTarget, former: AiRewriteFormer, options: { now: Date }): AudioProseWrite | null {
  const field = fieldOf(snapshot, target, options.now);
  if (field === null) return null;
  return field.restore(former);
}
