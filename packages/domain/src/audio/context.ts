import { contextCaption } from '../photos/caption.ts';
import { checklistItemLabel } from '../relatorio/oil-rule.ts';
import { parecerCounts } from '../relatorio/parecer.ts';
import { evaluateSheetReadings, outReadings } from '../relatorio/readings.ts';
import { checklistResultOf, SHEET_STEPS, type SheetStep } from '../relatorio/sheet-progress.ts';
import { blockTypeLabelIn } from '../relatorio/tree.ts';
import { visitContextOf } from '../relatorio/visit-context.ts';
import { isSectionBlockType, typeVersionOf } from '../schemas/block-config.ts';
import type { AudioTarget, BlockRow, RegistryRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, getSeed, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition, SeedWord } from '../seed/schema.ts';
import { sectionNumber } from '../templates/compose.ts';

/*
 * Story 31.1 (AD-30): the context the writing step's prompt carries, assembled by the kernel from
 * the snapshot of the audio's own relatório (only that company and that relatório ever enter a
 * prompt): the field, the equipment type and TAG; for a checklist observation the item and its
 * answer; for a ficha conclusion the picked result, the NC items and the readings outside their
 * criterion; for the parecer the relatório's counts and restrictions. Pure over the snapshot.
 */

export interface AudioContextOptions {
  /** The instant a section's seed text in force is read at. */
  now: Date;
  /** The company's `local` and `atividade` registry rows, the words an automatic caption agrees with. */
  registry: readonly RegistryRow[];
}

export interface AudioWritingContext {
  /** The field's name, as the screen calls it. */
  field: string;
  /** The equipment type of the ficha the field belongs to, or null. */
  equipment_type: string | null;
  /** The TAG of that equipment, or null. */
  tag: string | null;
  /** A checklist observation: its item and the answer picked. */
  item?: { label: string; answer: 'C' | 'NC' | 'NA' | null };
  /** A ficha conclusion: the picked result and restriction, the NC items, the readings outside their criterion. */
  conclusion?: { result: string | null; restriction: string | null; nc_items: string[]; readings_out: string[] };
  /** The parecer summary: the verdict picked and the relatório's counts and restrictions. */
  parecer?: {
    verdict: string | null;
    total: number;
    concluded: number;
    not_tested: number;
    open: number;
    with_restriction: string[];
    reprovado: string[];
    out_readings: string[];
  };
}

// authored (Story 31.1, listed for Bruno): the field names a prompt carries.
const FIELD_NAMES = {
  item: 'Observação do item',
  observations: 'Observações da ficha',
  conclusion_text: 'Texto da conclusão',
  not_tested_text: 'Justificativa de não ensaiado',
  test_value: 'Motivo do ensaio',
  photo_caption: 'Legenda da foto',
  point_text: 'Ponto de atenção',
  point_action: 'Ação recomendada',
  additional_info: 'Informações adicionais',
  next_intervention_justification: 'Justificativa da próxima intervenção',
  parecer_text: 'Resumo do parecer',
  section: 'Texto da seção',
  table: 'Leitura da tabela',
} as const;

/** A live block of the snapshot and its definition, or null. */
interface Sheet {
  block: BlockRow;
  definition: BlockDefinition | null;
  ctx: DefinitionContext;
}

function sheetOf(snapshot: RelatorioSnapshot, blockId: string): Sheet | null {
  const block = snapshot.blocks.find((row) => row.id === blockId && row.removed_at === null);
  if (block === undefined) return null;
  const ctx = snapshotDefinitionContext(snapshot);
  return { block, definition: blockDefinitionIn(ctx, block), ctx };
}

function equipmentOf(snapshot: RelatorioSnapshot, sheet: Sheet | null): { equipment_type: string | null; tag: string | null } {
  if (sheet === null || isSectionBlockType(sheet.block.block_type)) return { equipment_type: null, tag: null };
  const { block, ctx } = sheet;
  const tag = block.equipment_id === null ? null : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? null);
  return { equipment_type: blockTypeLabelIn(ctx, block.seed_version, block.block_type, typeVersionOf(block.config)), tag: tag === null || tag.trim() === '' ? null : tag };
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** "item 8 (Contatos): contato oxidado", the NC items of a sheet with their observations. */
function ncItems(sheet: Sheet): string[] {
  const { block, definition, ctx } = sheet;
  if (definition === null) return [];
  return (definition.checklist ?? []).flatMap((item, index) => {
    if (checklistResultOf(block, item.key, ctx) !== 'NC') return [];
    const observation = textOf(block.sheet.checklist[item.key]?.observation?.value);
    const head = `item ${index + 1} (${checklistItemLabel(item, definition, block)})`;
    return [observation === null ? head : `${head}: ${observation}`];
  });
}

function readingsOut(snapshot: RelatorioSnapshot, sheet: Sheet): string[] {
  const { block, definition } = sheet;
  if (definition === null) return [];
  const visit = visitContextOf({ locations: snapshot.locations, equipment: snapshot.equipment, relatorio: snapshot.relatorio }, block);
  return outReadings(evaluateSheetReadings(block, definition, visit)).map((reading) => `${reading.where}: ${reading.valueText} (critério ${reading.criterionText})`);
}

/** The context of an audio's target, or null when the relatório does not hold the target. */
export function audioWritingContext(snapshot: RelatorioSnapshot, target: AudioTarget): AudioWritingContext | null {
  switch (target.type) {
    case 'item': {
      const sheet = sheetOf(snapshot, target.block_id);
      const item = sheet?.definition?.checklist?.find((entry) => entry.key === target.item_key);
      if (sheet === null || item === undefined) return null;
      return {
        field: FIELD_NAMES.item,
        ...equipmentOf(snapshot, sheet),
        item: { label: checklistItemLabel(item, sheet.definition, sheet.block), answer: checklistResultOf(sheet.block, item.key, sheet.ctx) },
      };
    }
    case 'sheet_field': {
      const sheet = sheetOf(snapshot, target.block_id);
      if (sheet === null) return null;
      const base = { field: FIELD_NAMES[target.field], ...equipmentOf(snapshot, sheet) };
      if (target.field !== 'conclusion_text') return base;
      const conclusion = sheet.block.sheet.conclusion;
      return {
        ...base,
        conclusion: { result: textOf(conclusion.result?.value), restriction: textOf(conclusion.restriction?.value), nc_items: ncItems(sheet), readings_out: readingsOut(snapshot, sheet) },
      };
    }
    case 'test_value':
    case 'table': {
      const sheet = sheetOf(snapshot, target.block_id);
      if (sheet === null) return null;
      return { field: target.type === 'table' ? FIELD_NAMES.table : FIELD_NAMES.test_value, ...equipmentOf(snapshot, sheet) };
    }
    case 'section': {
      const sheet = sheetOf(snapshot, target.block_id);
      if (sheet === null || !isSectionBlockType(sheet.block.block_type)) return null;
      return { field: `${FIELD_NAMES.section} ${sectionNumber(sheet.block.block_type)}`, equipment_type: null, tag: null };
    }
    case 'photo_caption': {
      const photo = snapshot.files.find((file) => file.id === target.file_id && file.kind === 'photo' && file.removed_at === null);
      if (photo === undefined || photo.kind !== 'photo') return null;
      const sheet = photo.block_id === null ? null : sheetOf(snapshot, photo.block_id);
      return { field: FIELD_NAMES.photo_caption, ...equipmentOf(snapshot, sheet) };
    }
    case 'point': {
      const point = snapshot.points.find((row) => row.id === target.point_id && row.removed_at === null);
      if (point === undefined) return null;
      const block = point.equipment_id === null ? undefined : snapshot.blocks.find((row) => row.equipment_id === point.equipment_id && row.removed_at === null);
      return { field: target.field === 'text' ? FIELD_NAMES.point_text : FIELD_NAMES.point_action, ...equipmentOf(snapshot, block === undefined ? null : sheetOf(snapshot, block.id)) };
    }
    case 'setup': {
      if (target.field !== 'parecer_text') return { field: FIELD_NAMES[target.field], equipment_type: null, tag: null };
      const counts = parecerCounts(snapshot);
      return {
        field: FIELD_NAMES.parecer_text,
        equipment_type: null,
        tag: null,
        parecer: {
          verdict: snapshot.relatorio.setup.parecer?.verdict ?? null,
          total: counts.total,
          concluded: counts.concluded,
          not_tested: counts.notTested.length,
          open: counts.open,
          with_restriction: counts.withRestriction,
          reprovado: counts.reprovado,
          out_readings: counts.outReadings,
        },
      };
    }
  }
}

/** The context as the lines a prompt carries and the guard reads (`writtenTextGuard`). */
export function audioContextText(context: AudioWritingContext): string {
  const lines = [`Campo: ${context.field}`];
  if (context.equipment_type !== null) lines.push(`Equipamento: ${context.equipment_type}`);
  if (context.tag !== null) lines.push(`TAG: ${context.tag}`);
  if (context.item !== undefined) lines.push(`Item: ${context.item.label}`, `Resposta: ${context.item.answer ?? 'não marcada'}`);
  if (context.conclusion !== undefined) {
    const c = context.conclusion;
    lines.push(`Resultado: ${c.result ?? 'não escolhido'}`, `Restrição: ${c.restriction ?? 'não escolhida'}`);
    lines.push(`Itens NC: ${c.nc_items.length === 0 ? 'nenhum' : c.nc_items.join('; ')}`);
    lines.push(`Leituras fora do critério: ${c.readings_out.length === 0 ? 'nenhuma' : c.readings_out.join('; ')}`);
  }
  if (context.parecer !== undefined) {
    const p = context.parecer;
    lines.push(`Parecer: ${p.verdict ?? 'não escolhido'}`);
    lines.push(`Fichas: ${p.total}, concluídas ${p.concluded}, não ensaiadas ${p.not_tested}, em aberto ${p.open}`);
    if (p.with_restriction.length > 0) lines.push(`Com restrição: ${p.with_restriction.join('; ')}`);
    if (p.reprovado.length > 0) lines.push(`Reprovadas: ${p.reprovado.join('; ')}`);
    if (p.out_readings.length > 0) lines.push(`Com leitura fora do critério: ${p.out_readings.join('; ')}`);
  }
  return lines.join('\n');
}

const NO_WORDS: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] } = { atividades: [], locais: [] };

/**
 * Every caption the kernel composes for a photo from where it was taken (`contextCaption`), at any
 * sheet step and table the screen could have been on: a caption equal to one of them is still the
 * automatic one, which an audio replaces instead of adding to. Empty for a photo the snapshot lacks.
 */
export function audioAutomaticCaptions(snapshot: RelatorioSnapshot, photoId: string, registry: readonly RegistryRow[]): string[] {
  const photo = snapshot.files.find((file) => file.id === photoId && file.kind === 'photo');
  if (photo === undefined || photo.kind !== 'photo') return [];
  const block = photo.block_id === null ? undefined : snapshot.blocks.find((row) => row.id === photo.block_id);
  let words: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] };
  try {
    const seed = getSeed(block?.seed_version ?? snapshot.relatorio.seed_version, 'cabine_primaria');
    words = { atividades: seed.atividades, locais: seed.locais };
  } catch {
    words = NO_WORDS;
  }
  const definition = block === undefined ? null : blockDefinitionIn(snapshotDefinitionContext(snapshot), block);
  const testKeys: (string | null)[] = [null, ...(definition?.tests ?? []).map((test) => test.key)];
  const steps: (SheetStep | null)[] = [null, ...SHEET_STEPS];
  const out = new Set<string>();
  for (const step of steps) {
    for (const testKey of testKeys) {
      const caption = contextCaption({ block_id: photo.block_id, item_key: photo.item_key, location_id: photo.location_id ?? null }, snapshot, { step, testKey, words, registry });
      if (caption !== null) out.add(caption);
    }
  }
  return [...out];
}
