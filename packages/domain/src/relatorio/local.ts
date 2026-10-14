import { FUNCAO_KEYS, type FuncaoKey } from '../schemas/block-config.ts';
import type { LocationRow } from '../schemas/entities.ts';
import { siteChecklistOf } from '../seed/definitions.ts';

/*
 * Story 14.2 (Local › Painel › Coluna): the Função of a local. On screen the root location
 * is the "local"; its row keeps `kind = cabine` and holds `funcao`, one string: a reserved
 * key of `FUNCAO_KEYS` or a typed name ("Medição"). Every surface that names a local's
 * Função (the tree, the composer card, the Função dialog) takes the label from
 * `funcaoLabel`, so the word is composed once (AD-1/AD-13).
 */

/** The reserved Funções as the mock's dialog words them (`42-template-composer.html` `#tc-dlg-local`). */
const FUNCAO_LABEL: Readonly<Record<FuncaoKey, string>> = {
  entrada: 'Entrada',
  primaria: 'Primária',
  transformacao: 'Transformação',
  distribuicao: 'Distribuição',
};

/** The name a new local starts with, per reserved Função, verbatim from the mock's dialog. */
const DEFAULT_NAME: Readonly<Record<FuncaoKey, string>> = {
  entrada: 'Cabine de entrada',
  primaria: 'Cabine primária',
  transformacao: 'Cabine de transformação',
  distribuicao: 'Cabine de distribuição',
};

function isFuncaoKey(value: string): value is FuncaoKey {
  return (FUNCAO_KEYS as readonly string[]).includes(value);
}

/**
 * A local's Função as it reads on screen: "Entrada", "Primária", "Transformação",
 * "Distribuição" for a reserved key, the trimmed typed text otherwise, and null when the
 * local holds none (absent, null or blank). A typed text equal to a key reads as that key.
 */
export function funcaoLabel(funcao: string | null | undefined): string | null {
  if (funcao === null || funcao === undefined) return null;
  const trimmed = funcao.trim();
  if (trimmed === '') return null;
  return isFuncaoKey(trimmed) ? FUNCAO_LABEL[trimmed] : trimmed;
}

/** One reserved Função of the dialog's radio group: its stored key and its label. */
export interface FuncaoOption {
  key: FuncaoKey;
  label: string;
}

/** The reserved Funções in the dialog's order; "Outra" (a typed name) is the surface's fifth option. */
export const FUNCAO_OPTIONS: readonly FuncaoOption[] = FUNCAO_KEYS.map((key) => ({ key, label: FUNCAO_LABEL[key] }));

/**
 * The name the Função dialog proposes for a local: "Cabine de entrada", "Cabine primária",
 * "Cabine de transformação", "Cabine de distribuição" for a reserved key (the mock's own
 * words); a typed Função gives "Cabine de ⟨função in lower case⟩" ("Cabine de medição").
 * A stored default name keeps "Cabine": only the on-screen noun of the level is "local".
 */
export function defaultLocalName(funcao: string): string {
  const trimmed = funcao.trim();
  if (isFuncaoKey(trimmed)) return DEFAULT_NAME[trimmed];
  // "Outra" with nothing typed yet: the bare noun, completed as the Função is typed.
  if (trimmed === '') return 'Cabine';
  // authored: the mock draws one typed example, "Medição" giving "Cabine de medição".
  return `Cabine de ${trimmed.toLocaleLowerCase('pt-BR')}`;
}

/** A location a block can sit on: a local (the cabine row) or a coluna, never a painel. */
export type BlockLocationRow = Exclude<LocationRow, { kind: 'painel' }>;

/** True for a location a block can sit on (see `BlockLocationRow`); a painel only groups colunas. */
export function takesBlocks<T extends { kind: LocationRow['kind'] }>(location: T): location is T & { kind: 'cabine' | 'coluna' } {
  return location.kind !== 'painel';
}

/**
 * Epic 14 QA Q-17: the "Adicionar local" dialog's description for a template or relatório on
 * `seedVersion`. On a seed with site items (v4 or later) it is the mock's sentence
 * (`42-template-composer.html` `#tc-local-desc`), which names the Verificações do local; on
 * v1 to v3, where a local has none, the same sentence without that part.
 */
export function localDialogDescription(seedVersion: string): string {
  return siteChecklistOf(seedVersion) === null
    ? // authored (Story 14.2): the mock's sentence without its "Verificações do local" part.
      'Cada cabine é um local. O local guarda a função, as características da SE, o ambiente de ensaio e o agrupamento por tipo. Os equipamentos ficam direto no local ou nas colunas de um painel.'
    : 'Cada cabine é um local. O local guarda a função, as características da SE, o ambiente de ensaio, o agrupamento por tipo e as Verificações do local. Os equipamentos ficam direto no local ou nas colunas de um painel.';
}

/**
 * Epic 14 QA Q-17: the note under the "Do local" block (`60-ficha.html` CB-ENT), saying where
 * CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO print on `seedVersion` (`section9Layout`): on
 * v4 or later once under the local's own heading, before its sheets; on v1 to v3 inside the
 * local's first sheet.
 */
export function cabineDataNoteText(seedVersion: string): string {
  // authored (Story 14.2): CB-ENT's note, "cabine" reworded to "local".
  const edit = 'Editar aqui altera o local — todas as fichas do local passam a mostrar o mesmo valor.';
  return siteChecklistOf(seedVersion) === null
    ? `Impressas uma vez, na primeira ficha do local. ${edit}`
    : // authored: Epic 14 QA Q-17 (open for Bruno).
      `Impressas uma vez, sob o título do local, antes das fichas. ${edit}`;
}
