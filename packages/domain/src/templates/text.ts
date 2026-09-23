import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { TemplateRow } from '../schemas/entities.ts';
import { plural, relatoriosCount } from '../text/plural.ts';
import { composerView, type ComposerNode, type ComposerView } from './compose.ts';

/*
 * The Templates list's and the Template composer's derived pt-BR text (AGENTS.md "Where a
 * new user-facing string goes": counts, plurals and composed rows are the kernel's). The
 * wording is `41-templates.html` and `42-template-composer.html`'s.
 */

interface TypeNouns {
  /** "1 seccionadora" */
  one: string;
  /** "25 seccionadoras" */
  many: string;
  /** The stepper's accessible name, "Seccionadoras, 25" (EXPERIENCE.md › Quantity stepper). */
  label: string;
}

/**
 * The mock's nouns per type. The cable sets read "1 cabo de entrada" at one and "4 cabos de
 * entrada" at many (Epic 3 review K6: the mock's "1 cabos de entrada" read as a plural bug).
 */
const NOUNS: Readonly<Record<EquipmentBlockType, TypeNouns>> = {
  chave_seccionadora: { one: 'seccionadora', many: 'seccionadoras', label: 'Seccionadoras' },
  disjuntor_mt: { one: 'disjuntor', many: 'disjuntores', label: 'Disjuntores' },
  tp: { one: 'TP', many: 'TP', label: 'TP' },
  tc: { one: 'TC', many: 'TC', label: 'TC' },
  transformador_forca: { one: 'trafo', many: 'trafos', label: 'Transformadores' },
  cabos_entrada: { one: 'cabo de entrada', many: 'cabos de entrada', label: 'Cabos de entrada' },
  cabos_saida: { one: 'cabo de saída', many: 'cabos de saída', label: 'Cabos de saída' },
  para_raio: { one: 'para-raio', many: 'para-raios', label: 'Para-raios' },
};

/** The order the mock lists the per-type totals in ("25 seccionadoras · 21 disjuntores · …"). */
export const TOTALS_ORDER: readonly EquipmentBlockType[] = [
  'chave_seccionadora',
  'disjuntor_mt',
  'tp',
  'tc',
  'transformador_forca',
  'cabos_entrada',
  'cabos_saida',
  'para_raio',
];

// authored: no mock draws a node or a template with no equipment yet.
const NO_EQUIPMENT = 'Nenhum equipamento';

const SEP = ' · ';

/**
 * The per-type totals, "25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 trafos ·
 * 4 cabos de entrada · 9 cabos de saída · 5 para-raios": zeros omitted, singular at one.
 */
export function totalsText(totals: Readonly<Record<EquipmentBlockType, number>>): string {
  const parts = TOTALS_ORDER.filter((type) => totals[type] > 0).map((type) =>
    plural(totals[type], NOUNS[type].one, NOUNS[type].many),
  );
  return parts.length === 0 ? NO_EQUIPMENT : parts.join(SEP);
}

/** The Quantity stepper's accessible name: "Seccionadoras, 25". */
export function quantityLabel(type: EquipmentBlockType, n: number): string {
  return `${NOUNS[type].label}, ${n}`;
}

/**
 * The Templates row's `.rr-secondary`, e.g. for the standard template used by three
 * relatórios: "Semente v1 · 9 seções · 6 cabines · 17 colunas · 94 blocos de equipamento ·
 * usado em 3 relatórios". Every zero part is omitted except the sections; the use part is
 * omitted at zero.
 */
export function templateSummaryText(row: Pick<TemplateRow, 'seed_version' | 'blocks' | 'skeleton'>, useCount: number): string {
  const view = composerView(row);
  const parts = [`Semente ${row.seed_version}`, plural(view.sections.length, 'seção', 'seções')];
  if (view.cabineCount > 0) parts.push(plural(view.cabineCount, 'cabine', 'cabines'));
  if (view.colunaCount > 0) parts.push(plural(view.colunaCount, 'coluna', 'colunas'));
  if (view.blockCount > 0) parts.push(plural(view.blockCount, 'bloco de equipamento', 'blocos de equipamento'));
  if (useCount > 0) parts.push(`usado em ${relatoriosCount(useCount)}`);
  return parts.join(SEP);
}

/** The composer's skeleton heading: "Esqueleto de locais · 6 cabines · 17 colunas · 94 blocos" (the standard template). */
export function skeletonHeading(view: ComposerView): string {
  const parts = ['Esqueleto de locais'];
  if (view.cabineCount > 0) parts.push(plural(view.cabineCount, 'cabine', 'cabines'));
  if (view.colunaCount > 0) parts.push(plural(view.colunaCount, 'coluna', 'colunas'));
  if (view.blockCount > 0) parts.push(plural(view.blockCount, 'bloco', 'blocos'));
  return parts.join(SEP);
}

/** The composer's section-block heading, adapted from the mock's "Blocos · 9 seções + …". */
export function sectionsHeading(count: number): string {
  return `Blocos${SEP}${plural(count, 'seção', 'seções')}`;
}

export interface NodeSummary {
  /** `.cabine-flag`: "17 colunas · 55 blocos" on a cabine, "4 blocos" on a coluna. */
  flag: string;
  /** `.col-sum` (and the cabine's `.block-sub`): the per-type counts, as `totalsText`. */
  sum: string;
}

/**
 * The mock's summary of one skeleton node. A cabine counts its colunas and every block on
 * it or on them; a coluna counts its own.
 */
export function nodeSummaryText(node: ComposerNode): NodeSummary {
  if (node.kind === 'coluna') {
    return { flag: plural(node.blockCount, 'bloco', 'blocos'), sum: totalsText(node.quantities) };
  }
  const parts: string[] = [];
  if (node.colunas.length > 0) parts.push(plural(node.colunas.length, 'coluna', 'colunas'));
  parts.push(plural(node.totalBlockCount, 'bloco', 'blocos'));
  return { flag: parts.join(SEP), sum: totalsText(node.totals) };
}

/** What a composer announcement or toast names: a cabine, a coluna or a section block. */
export type ComposerItemKind = 'cabine' | 'coluna' | 'section';

const KIND_NOUN: Readonly<Record<ComposerItemKind, string>> = { cabine: 'Cabine', coluna: 'Coluna', section: 'Seção' };

/**
 * The item as a feminine noun phrase, so "movida" and "removida" always agree: "Coluna 5"
 * stays as it is, "Cubículo Enel" reads "Cabine Cubículo Enel", a free coluna name "Entrada"
 * reads "Coluna Entrada", and a section is "Seção" plus its FO.SERV-03 number ("Seção 2").
 */
function itemPhrase(kind: ComposerItemKind, name: string): string {
  const noun = KIND_NOUN[kind];
  const lead = name.trim().split(/\s+/)[0] ?? '';
  return lead.localeCompare(noun, 'pt-BR', { sensitivity: 'base' }) === 0 ? name.trim() : `${noun} ${name.trim()}`;
}

/**
 * Every reorder's polite announcement: "Coluna 5 movida para a posição 3 de 17",
 * "Cabine Cubículo Enel movida para a posição 1 de 6", "Seção 2 movida para a posição 1
 * de 9". For a section, `name` is its FO.SERV-03 number.
 */
export function moveAnnouncement(kind: ComposerItemKind, name: string, position: number, total: number): string {
  return `${itemPhrase(kind, name)} movida para a posição ${position} de ${total}`;
}

/** The toast of a composer removal: "Coluna 3 removida", "Cabine Geradores removida", "Seção 8 removida". */
export function removedText(kind: ComposerItemKind, name: string): string {
  return `${itemPhrase(kind, name)} removida`;
}

/** The name a new cabine gets: "Cabine 7" when six exist. */
export function defaultCabineName(n: number): string {
  return `Cabine ${n}`;
}

/** The name a new coluna gets: "Coluna 3" when its cabine holds two. */
export function defaultColunaName(n: number): string {
  return `Coluna ${n}`;
}

/**
 * The NA pre-marks of a subtype in the type defaults panel (Story 3.5): "2 itens marcados
 * NA por padrão", "1 item marcado NA por padrão", and "Nenhum item marcado NA por padrão"
 * without a subtype.
 */
export function naDefaultsCountText(n: number): string {
  if (n === 0) return 'Nenhum item marcado NA por padrão';
  return `${plural(n, 'item marcado', 'itens marcados')} NA por padrão`;
}
