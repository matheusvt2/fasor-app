import { isEquipmentBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, RegistryRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { cabineOf } from '../relatorio/cabine.ts';
import { screenLabel } from '../relatorio/screen-label.ts';
import type { SheetStep } from '../relatorio/sheet-progress.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { SeedWord } from '../seed/schema.ts';

/*
 * Story 6.1 (FR-39): the context caption a photo is born with, composed locally from data
 * and never guessed. "Detalhe d⟨o/a⟩(s) ⟨atividade⟩ realizad⟨o/a⟩(s) n⟨o/a⟩(s)
 * ⟨equipamento⟩ d⟨o/a⟩(s) ⟨local⟩", with gender and number from the seed words and the
 * registry (AD-19). A part the data does not give is left out, never invented; with no
 * part at all the caption is null. No trailing period (the mock and EXPERIENCE examples).
 */

/** Gender and number of one caption word. */
type Agreement = Pick<SeedWord, 'gender' | 'number'>;

/**
 * The equipment noun phrase of each block type, lowercase, with its agreement. A kernel
 * table rather than a seed version (spec open question: the conservative choice).
 */
export const CAPTION_EQUIPMENT_WORDS: Readonly<Record<EquipmentBlockType, SeedWord>> = {
  cabos_entrada: { name: 'cabos de entrada', gender: 'm', number: 'plural' },
  para_raio: { name: 'para-raio', gender: 'm', number: 'singular' },
  chave_seccionadora: { name: 'chave seccionadora', gender: 'f', number: 'singular' },
  disjuntor_mt: { name: 'disjuntor de média tensão', gender: 'm', number: 'singular' },
  tp: { name: 'transformador de potencial', gender: 'm', number: 'singular' },
  tc: { name: 'transformador de corrente', gender: 'm', number: 'singular' },
  cabos_saida: { name: 'cabos de saída', gender: 'm', number: 'plural' },
  transformador_forca: { name: 'transformador de força', gender: 'm', number: 'singular' },
};

/** The seed atividade a test table on screen names ("ensaios de resistência de isolação"). */
const TEST_ACTIVITY: Readonly<Record<string, string>> = {
  isolacao: 'ensaios de resistência de isolação',
  resistencia_contato: 'ensaios de resistência de contato',
  relacao_transformacao: 'ensaios de relação de transformação',
};

const MASCULINE_SINGULAR: Agreement = { gender: 'm', number: 'singular' };
const MASCULINE_PLURAL: Agreement = { gender: 'm', number: 'plural' };

/** The article that agrees with a word: o, a, os, as. */
function article(word: Agreement): string {
  return `${word.gender === 'f' ? 'a' : 'o'}${word.number === 'plural' ? 's' : ''}`;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

/** A checklist item's label as a caption noun: lowercase pt-BR, the screen label's acronyms kept. */
function itemNoun(label: string): string {
  return screenLabel(label)
    .split(' ')
    .map((word) => (word.length > 1 && word === word.toLocaleUpperCase('pt-BR') && /\p{L}/u.test(word) ? word : word.toLocaleLowerCase('pt-BR')))
    .join(' ');
}

export interface ContextCaptionMeta {
  /** The sheet step on screen when the shot was taken, or null off a sheet. */
  step: SheetStep | null;
  /** The key of the test table nearest the viewport top (the web's `use-on-screen`), else null (the block's first test). */
  testKey: string | null;
  words: { atividades: readonly SeedWord[]; locais: readonly SeedWord[] };
  registry: readonly RegistryRow[];
}

interface CaptionWord extends Agreement {
  name: string;
}

function definitionOf(block: BlockRow) {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return null;
  }
}

function activityOf(photo: { item_key: string | null }, block: BlockRow, meta: ContextCaptionMeta): CaptionWord | null {
  if (photo.item_key !== null) {
    const label = definitionOf(block)?.checklist?.find((item) => item.key === photo.item_key)?.label ?? null;
    if (label === null) return null;
    return { name: `verificação de ${itemNoun(label)}`, gender: 'f', number: 'singular' };
  }
  if (meta.step !== 'ensaios') return null;
  const key = meta.testKey ?? definitionOf(block)?.tests[0]?.key ?? null;
  const name = key === null ? undefined : TEST_ACTIVITY[key];
  if (name === undefined) return null;
  const seeded = meta.words.atividades.find((word) => sameName(word.name, name));
  return { name, ...(seeded === undefined ? MASCULINE_PLURAL : { gender: seeded.gender, number: seeded.number }) };
}

function localOf(block: BlockRow, snapshot: RelatorioSnapshot, meta: ContextCaptionMeta): CaptionWord | null {
  const name = cabineOf(snapshot.locations, block.location_id)?.name.trim() ?? '';
  if (name === '') return null;
  const registered = meta.registry.find(
    (row): row is Extract<RegistryRow, { kind: 'local' }> => row.kind === 'local' && row.removed_at === null && sameName(row.name, name),
  );
  if (registered !== undefined && registered.gender !== null && registered.number !== null) {
    return { name, gender: registered.gender, number: registered.number };
  }
  const seeded = meta.words.locais.find((word) => sameName(word.name, name));
  return { name, ...(seeded === undefined ? MASCULINE_SINGULAR : { gender: seeded.gender, number: seeded.number }) };
}

/**
 * The caption of a photo taken where the engineer stands: equipment and location from its
 * sheet, activity from the section on screen (an NC row's item, or the test table). Null
 * when no part is known (a photo with no sheet).
 */
export function contextCaption(
  photo: { block_id: string | null; item_key: string | null },
  snapshot: RelatorioSnapshot,
  meta: ContextCaptionMeta,
): string | null {
  const block = photo.block_id === null ? undefined : snapshot.blocks.find((row) => row.id === photo.block_id);
  if (block === undefined) return null;
  const activity = activityOf(photo, block, meta);
  const equipment: CaptionWord | null = isEquipmentBlockType(block.block_type) ? CAPTION_EQUIPMENT_WORDS[block.block_type] : null;
  const local = localOf(block, snapshot, meta);

  const parts: string[] = [];
  if (activity !== null) {
    parts.push(`Detalhe d${article(activity)} ${activity.name} realizad${activity.gender === 'f' ? 'a' : 'o'}${activity.number === 'plural' ? 's' : ''}`);
    if (equipment !== null) {
      parts.push(`n${article(equipment)} ${equipment.name}`);
      if (local !== null) parts.push(`d${article(local)} ${local.name}`);
    } else if (local !== null) {
      parts.push(`n${article(local)} ${local.name}`);
    }
  } else if (equipment !== null) {
    parts.push(`Detalhe d${article(equipment)} ${equipment.name}`);
    if (local !== null) parts.push(`d${article(local)} ${local.name}`);
  } else if (local !== null) {
    parts.push(`Detalhe d${article(local)} ${local.name}`);
  }
  return parts.length === 0 ? null : parts.join(' ');
}

/** The camera view's `.cam-context` line ("Contexto: Cubículo Enel · foto geral" in the mock). */
export function cameraContextText(caption: string | null): string {
  return caption === null ? 'Contexto: foto geral' : `Contexto: ${caption}`;
}
