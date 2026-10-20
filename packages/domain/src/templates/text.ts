import { headerText, readingLabelText } from '../relatorio/readings.ts';
import type { EquipmentBlockType, SubBlockKey } from '../schemas/block-config.ts';
import type { TemplateRow } from '../schemas/entities.ts';
import { formatCriterionValue, SEEDED_CRITERIA } from '../seed/criteria.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { funcaoLabel } from '../relatorio/local.ts';
import { plural, relatoriosCount } from '../text/plural.ts';
import { composerView, type ComposerCabine, type ComposerNode, type ComposerView } from './compose.ts';

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
  // authored (Story 14.5): the library type, named in full (no mock abbreviates it).
  chave_transferencia_automatica: {
    one: 'chave de transferência automática',
    many: 'chaves de transferência automática',
    label: 'Chaves de transferência automática',
  },
  // authored (Story 14.9).
  quadro_eletrico: { one: 'quadro elétrico', many: 'quadros elétricos', label: 'Quadros elétricos' },
};

/**
 * The order the mock lists the per-type totals in ("25 seccionadoras · 21 disjuntores · …").
 * Story 14.5: the library type comes after the eight, as in both palettes.
 */
export const TOTALS_ORDER: readonly EquipmentBlockType[] = [
  'chave_seccionadora',
  'disjuntor_mt',
  'tp',
  'tc',
  'transformador_forca',
  'cabos_entrada',
  'cabos_saida',
  'para_raio',
  'chave_transferencia_automatica',
  'quadro_eletrico',
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
 * The counts of the skeleton's three levels, "7 locais · 6 painéis · 26 colunas" (the
 * composer heading of `42-template-composer.html`): every zero part omitted, so a template
 * with no painel reads "6 locais · 17 colunas".
 */
function skeletonCountParts(view: ComposerView): string[] {
  const parts: string[] = [];
  if (view.cabineCount > 0) parts.push(plural(view.cabineCount, 'local', 'locais'));
  if (view.painelCount > 0) parts.push(plural(view.painelCount, 'painel', 'painéis'));
  if (view.colunaCount > 0) parts.push(plural(view.colunaCount, 'coluna', 'colunas'));
  return parts;
}

/**
 * The Templates row's `.rr-secondary`, e.g. for the standard template used by three
 * relatórios: "Semente v1 · 9 seções · 6 locais · 17 colunas · 94 blocos de equipamento ·
 * usado em 3 relatórios" (the painéis part only when there is one). Every zero part is
 * omitted except the sections; the use part is omitted at zero.
 */
export function templateSummaryText(row: Pick<TemplateRow, 'seed_version' | 'blocks' | 'skeleton'>, useCount: number): string {
  const view = composerView(row);
  const parts = [`Semente ${row.seed_version}`, plural(view.sections.length, 'seção', 'seções'), ...skeletonCountParts(view)];
  if (view.blockCount > 0) parts.push(plural(view.blockCount, 'bloco de equipamento', 'blocos de equipamento'));
  if (useCount > 0) parts.push(`usado em ${relatoriosCount(useCount)}`);
  return parts.join(SEP);
}

/**
 * The composer's skeleton heading: "Esqueleto de locais · 7 locais · 6 painéis · 26 colunas ·
 * 94 blocos" (the mock), "Esqueleto de locais · 6 locais · 17 colunas · 94 blocos" for the
 * standard template, which holds no painel.
 */
export function skeletonHeading(view: ComposerView): string {
  const parts = ['Esqueleto de locais', ...skeletonCountParts(view)];
  if (view.blockCount > 0) parts.push(plural(view.blockCount, 'bloco', 'blocos'));
  return parts.join(SEP);
}

/**
 * p020 P-1a: the composer's warning over its sections list, from the template's section
 * types: no FO.SERV-03 text section at all, or section 8 or section 10 missing; null with
 * both 8 and 10 present. A relatório made from the template prints only its own sections
 * (plus the generated 7 and 9), so this says what it will lack.
 */
export function composerSectionsWarning(sectionTypes: readonly string[]): string | null {
  // authored: p020 P-1a, the four warnings of the composer's sections list.
  if (sectionTypes.length === 0) return 'Este template não tem seções de texto: os relatórios saem só com as seções 7 e 9, sem pontos de atenção, parecer e assinatura.';
  const no8 = !sectionTypes.includes('section_8');
  const no10 = !sectionTypes.includes('section_10');
  if (no8 && no10) return 'Sem as seções 8 e 10, os pontos de atenção, o parecer e a assinatura não saem nos relatórios deste template.';
  if (no8) return 'Sem a seção 8, os pontos de atenção não saem nos relatórios deste template.';
  if (no10) return 'Sem a seção 10, o parecer e a assinatura não saem nos relatórios deste template.';
  return null;
}

/** The composer's section-block heading, adapted from the mock's "Blocos · 9 seções + …". */
export function sectionsHeading(count: number): string {
  return `Blocos${SEP}${plural(count, 'seção', 'seções')}`;
}

export interface NodeSummary {
  /**
   * `.loc-flag`: "1 painel · 17 colunas · 53 blocos" or "sem painéis · 2 blocos" on a local,
   * "17 colunas · 53 blocos" or "sem colunas · 0 blocos" on a painel, "4 blocos" on a coluna.
   */
  flag: string;
  /** `.col-sum` (and the painel's `.block-sub`): the per-type counts, as `totalsText`. */
  sum: string;
}

/**
 * The mock's summary of one skeleton node (`42-template-composer.html`). A local counts its
 * painéis, its colunas (those of its painéis and those directly under it) and every block
 * on it or under it; a painel its colunas and their blocks; a coluna its own.
 */
export function nodeSummaryText(node: ComposerNode): NodeSummary {
  if (node.kind === 'coluna') {
    return { flag: plural(node.blockCount, 'bloco', 'blocos'), sum: totalsText(node.quantities) };
  }
  if (node.kind === 'painel') {
    const colunas = node.colunas.length > 0 ? plural(node.colunas.length, 'coluna', 'colunas') : 'sem colunas';
    return { flag: [colunas, plural(node.totalBlockCount, 'bloco', 'blocos')].join(SEP), sum: totalsText(node.totals) };
  }
  const parts: string[] = [];
  const colunaCount = node.colunas.length + node.paineis.reduce((n, painel) => n + painel.colunas.length, 0);
  // A local with colunas directly under it and no painel (every template from before the
  // painel level) keeps its line as it read: "17 colunas · 55 blocos".
  if (node.paineis.length > 0) parts.push(plural(node.paineis.length, 'painel', 'painéis'));
  else if (colunaCount === 0) parts.push('sem painéis');
  if (colunaCount > 0) parts.push(plural(colunaCount, 'coluna', 'colunas'));
  parts.push(plural(node.totalBlockCount, 'bloco', 'blocos'));
  return { flag: parts.join(SEP), sum: totalsText(node.totals) };
}

/**
 * A local card's `.block-sub` (`42-template-composer.html`, without the 14.3 part): "Função:
 * primária · Agrupar por tipo: ativado"; the Função part is left out while the local holds
 * none. The Função is the kernel's label in lower case, as the mock writes it mid-sentence.
 */
export function localSubText(cabine: Pick<ComposerCabine, 'funcao' | 'agrupar_por_tipo'>): string {
  const funcao = funcaoLabel(cabine.funcao);
  const parts: string[] = [];
  if (funcao !== null) parts.push(`Função: ${funcao.toLocaleLowerCase('pt-BR')}`);
  parts.push(`Agrupar por tipo: ${cabine.agrupar_por_tipo ? 'ativado' : 'desativado'}`);
  return parts.join(SEP);
}

/**
 * The palette's `.pal-target` name of the current node (`#tc-pal-current`): "Coluna 5 · Painel
 * de média tensão" for a coluna of a painel, "Cubículo Enel, direto no local" for a local,
 * and a coluna directly under a local names that local ("Coluna 5 · 1° Subsolo").
 */
export function paletteTargetText(view: ComposerView, node: ComposerNode): string {
  if (node.kind === 'cabine') return `${node.name}, direto no local`;
  const parent = findParentName(view, node.parent_ref);
  return parent === null ? node.name : `${node.name}${SEP}${parent}`;
}

/**
 * "Painel de entrada em Cubículo Enel": a painel named with its local, for the controls of
 * its composer card (`42-template-composer.html`: "Reordenar …", "Mais opções de …",
 * "Colunas de …"). Every local's first painel is "Painel 1" by default, so the painel alone
 * would name the controls of two locals alike.
 */
export function painelInLocalText(painelName: string, localName: string): string {
  return `${painelName} em ${localName}`;
}

/**
 * "Coluna 1 em Painel de média tensão em Cabine primária": a coluna of a painel named with
 * its painel and its local, for the controls of its composer row ("Reordenar …", "Mais
 * opções de …", "Posição de …"). authored: the composer's join of the mock's two namings
 * (`42-template-composer.html` words the Position box "Posição de Coluna 1 em Painel de média
 * tensão" and the Overflow "Mais opções de Coluna 1 em Cabine primária"); the painel's part
 * is `painelInLocalText`, since default names repeat across locals ("Painel 1 › Coluna 1" in
 * each), so the painel alone would name the colunas of two locals alike.
 */
export function colunaInPainelText(colunaName: string, painelName: string, localName: string): string {
  return `${colunaName} em ${painelInLocalText(painelName, localName)}`;
}

/**
 * "Coluna 5 em 1° Subsolo": a coluna directly under a local (the shape before the painel
 * level) named with its local, for the controls of its composer row (the mock's Overflow
 * wording, "Mais opções de Coluna 1 em Cabine primária").
 */
export function colunaInLocalText(colunaName: string, localName: string): string {
  return `${colunaName} em ${localName}`;
}

function findParentName(view: ComposerView, ref: string): string | null {
  for (const cabine of view.cabines) {
    if (cabine.ref === ref) return cabine.name;
    const painel = cabine.paineis.find((p) => p.ref === ref);
    if (painel !== undefined) return painel.name;
  }
  return null;
}

/** What a composer announcement or toast names: a local (the cabine row), a painel, a coluna or a section block. */
export type ComposerItemKind = 'cabine' | 'painel' | 'coluna' | 'section';

/** The on-screen noun of each kind: the root row is the "Local" (Story 14.2); its stored `kind` stays `cabine`. */
const KIND_NOUN: Readonly<Record<ComposerItemKind, string>> = { cabine: 'Local', painel: 'Painel', coluna: 'Coluna', section: 'Seção' };

/** "Local" and "Painel" are masculine, "Coluna" and "Seção" feminine: the participle agrees ("movido", "movida"). */
const MASCULINE: ReadonlySet<ComposerItemKind> = new Set(['cabine', 'painel']);

/** An item as a noun phrase, and the ending its participle takes ("movid" + "o" or "a"). */
interface ItemPhrase {
  text: string;
  ending: 'o' | 'a';
}

/**
 * The item as a noun phrase its participle agrees with: "Coluna 5" stays as it is, "Cubículo
 * Enel" reads "Local Cubículo Enel" (masculine), "Painel 2" stays, a free painel name "Média
 * tensão" reads "Painel Média tensão", a free coluna name "Entrada" reads "Coluna Entrada",
 * and a section is "Seção" plus its FO.SERV-03 number ("Seção 2"). A local whose own name
 * leads with "Cabine" ("Cabine de transformação", the Função dialog's default) is read by
 * that name alone, in the feminine: "Cabine de transformação adicionada", never "Local
 * Cabine de transformação adicionado". authored (O4).
 */
function itemPhrase(kind: ComposerItemKind, name: string): ItemPhrase {
  const trimmed = name.trim();
  const lead = trimmed.split(/\s+/)[0] ?? '';
  const leadsWith = (word: string) => lead.localeCompare(word, 'pt-BR', { sensitivity: 'base' }) === 0;
  if (kind === 'cabine' && leadsWith('Cabine')) return { text: trimmed, ending: 'a' };
  const noun = KIND_NOUN[kind];
  return { text: leadsWith(noun) ? trimmed : `${noun} ${trimmed}`, ending: MASCULINE.has(kind) ? 'o' : 'a' };
}

/** "⟨item⟩ ⟨participle stem⟩⟨o|a⟩": the one place the agreement is written. */
function said(kind: ComposerItemKind, name: string, stem: string): string {
  const phrase = itemPhrase(kind, name);
  return `${phrase.text} ${stem}${phrase.ending}`;
}

/**
 * Every reorder's polite announcement: "Coluna 5 movida para a posição 3 de 17", "Local
 * Cubículo Enel movido para a posição 1 de 6", "Painel 2 movido para a posição 1 de 3",
 * "Seção 2 movida para a posição 1 de 9". For a section, `name` is its FO.SERV-03 number.
 * authored: the local and painel sentences (the noun-led form of the coluna's, O4).
 */
export function moveAnnouncement(kind: ComposerItemKind, name: string, position: number, total: number): string {
  return `${said(kind, name, 'movid')} para a posição ${position} de ${total}`;
}

/** The toast of a composer removal: "Coluna 3 removida", "Local Geradores removido", "Painel 2 removido", "Seção 8 removida". */
export function removedText(kind: ComposerItemKind, name: string): string {
  return said(kind, name, 'removid');
}

/**
 * A location back in the relatório (Story 14.2, second pass): "Coluna 3 restaurada", "Painel
 * 2 restaurado", "Local Geradores restaurado". authored: the restore's counterpart of
 * `removedText`; no mock words it.
 */
export function restoredText(kind: ComposerItemKind, name: string): string {
  return said(kind, name, 'restaurad');
}

/** The toast of a location added (Story 4.4, 14.2): "Coluna 18 adicionada", "Painel 2 adicionado", "Local Geradores adicionado", "Cabine de transformação adicionada". */
export function addedText(kind: ComposerItemKind, name: string): string {
  return said(kind, name, 'adicionad');
}

/** The toast of a location renamed (Story 4.4, 14.2): "Coluna Entrada renomeada", "Painel Média tensão renomeado", "Local Geradores Norte renomeado". */
export function renamedText(kind: ComposerItemKind, name: string): string {
  return said(kind, name, 'renomead');
}

/**
 * The toast and announcement of "Função e nome" saved on a local: "Local Geradores
 * atualizado", "Cabine primária atualizada". authored: the mock does not prototype the edit.
 */
export function localUpdatedText(name: string): string {
  return said('cabine', name, 'atualizad');
}

/** The name a new local gets when none is chosen: "Cabine 7" when six exist (stored names keep "Cabine"). */
export function defaultCabineName(n: number): string {
  return `Cabine ${n}`;
}

/** The name a new painel gets: "Painel 2" when its local holds one. */
export function defaultPainelName(n: number): string {
  return `Painel ${n}`;
}

/** The name a new coluna gets: "Coluna 3" when its painel (or local) holds two. */
export function defaultColunaName(n: number): string {
  return `Coluna ${n}`;
}

/**
 * E3-A9: the `.toggle-sub` line under a sub-block of the type defaults panel
 * (`42-template-composer.html` "9 campos", "14 itens C · NC · NA", "T1/T2 · T3/T4 · T5/T6 ×
 * Massa · 10 kV · >400 MΩ (aceitável na ficha)"), from the type's seed definition: the
 * nameplate's field count; the checklist's item count; a test's rows (each row's first
 * connection, table after table) × its captured columns, then its criterion with the
 * source. The mock's "Ler placa da foto" is out of the slice, and its test voltage ("10
 * kV") has no seed value (the instrument carries it), so neither is written. Null for a
 * sub-block with nothing to count (IA/IP, observations, conclusion).
 */
export function subBlockSummaryText(definition: BlockDefinition, key: SubBlockKey): string | null {
  if (key === 'nameplate') return plural(definition.nameplate.length, 'campo', 'campos');
  if (key === 'checklist') return definition.checklist === null ? null : `${plural(definition.checklist.length, 'item', 'itens')} C · NC · NA`;
  const test = definition.tests.find((t) => t.key === key);
  if (test === undefined) return null;
  const rows = test.tables.flatMap((table) => table.rows.map((row) => readingLabelText(row[0] ?? '')).filter((label) => label !== ''));
  const captured = [...new Set(test.tables.flatMap((table) => table.value_columns.filter((c) => c.role === 'capture').map((c) => headerText(c.label))))];
  const criterion = SEEDED_CRITERIA.find((c) => c.key === test.criterion_key);
  const bands = test.criterion_bands;
  // Story 14.9: a criterion picked from the plate names each band and its voltage, then the source.
  // authored: "até ⟨n⟩ V".
  const judged =
    bands !== undefined
      ? `${bands.bands.map((band) => `${band.operator}${String(band.value).replace('.', ',')} ${band.unit} até ${band.up_to} V`).join(' · ')} (${bands.bands[0]!.source.name})`
      : criterion === undefined
        ? null
        : `${formatCriterionValue(criterion)} (${criterion.source.name})`;
  return [`${rows.join(' · ')} × ${captured.join(' · ')}`, judged].filter((part): part is string => part !== null).join(' · ');
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
