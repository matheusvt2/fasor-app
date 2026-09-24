import { dateRangeText, formatDateOfInstant, uuidV7Instant } from '../format/datetime.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import type { BlockRow, EquipmentRow, LocationRow, ProjectRow, RelatorioRow, TemplateRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { pickableTemplates } from '../templates/list.ts';
import { isRelatorioSectionType, relatorioSectionNumber, type RelatorioSectionType } from './instantiate.ts';
import { blockingRows, preIssueRowsFor, type PreIssueRow, type SumarioRowKey } from './pre-issue.ts';
import { progressCounterText, type Progress } from './progress.ts';
import { isEquipmentBlock } from './sheet-state.ts';

/*
 * Story 4.3: the Sumário as data (`40-relatorio-overview.html`): the relatório's own table
 * of contents in the FO.SERV-03 order, one row per part, its title, its number (the
 * position among the numbered rows, redrawn after every move), the status line the
 * pre-issue check and `progress` wrote, and what kind of row it is. Story 4.1's texts of
 * the Project surface and the "Novo relatório" dialog live here too (AD-2: every count,
 * order and composed line is the kernel's).
 */

/** The row titles, the mock's sentence-case ones (the seed's `SECTION_TITLES_V1` are the printed uppercase headings). */
export const SUMARIO_TITLES: Readonly<Record<SumarioRowKey, string>> = {
  capa: 'Capa e dados do relatório',
  controle: 'Controle do documento',
  section_1: 'Objetivo',
  section_2: 'Definições',
  section_3: 'Limite de escopo',
  section_4: 'Requisitos básicos',
  section_5: 'Recomendações gerais (NR-10)',
  section_6: 'Verificações e ensaios aplicáveis',
  section_7: 'Registro fotográfico',
  section_8: 'Pontos de atenção',
  section_9: 'Relatórios dos ensaios',
  section_10: 'Conclusão e parecer',
  section_11: 'Certificados',
};

/**
 * What a row is: `fixed` (the cover and the control, no reorder controls), `setup` (opens
 * Dados do relatório, rows 1 and 3), `text` (a section text, rows 2, 4, 5, 6), `generated`
 * (7 and 9: the renderer produces their content, so they only move), `pending-epic`
 * (8, 10, 11: status only until their epic lands).
 */
export type SumarioRowKind = 'fixed' | 'text' | 'setup' | 'generated' | 'pending-epic';

const KIND_OF: Readonly<Record<RelatorioSectionType, SumarioRowKind>> = {
  section_1: 'setup',
  section_2: 'text',
  section_3: 'setup',
  section_4: 'text',
  section_5: 'text',
  section_6: 'text',
  section_7: 'generated',
  section_8: 'pending-epic',
  section_9: 'generated',
  section_10: 'pending-epic',
  section_11: 'pending-epic',
};

export interface SumarioRow {
  /** Unique in the list: the block id of a numbered row, `capa` or `controle`. */
  key: string;
  /** Which pre-issue rows address it. */
  rowKey: SumarioRowKey;
  kind: SumarioRowKind;
  /** The FO.SERV-03 number, the row's position among the numbered rows; null on the fixed rows. */
  number: number | null;
  title: string;
  /** `.sum-status`. */
  meta: string;
  blocking: boolean;
  /** Any pending or blocking pre-issue row addresses it (the mock's `.has-pend`). */
  pending: boolean;
  blockId: string | null;
  blockType: string | null;
  /** Section 9 opens into the location tree. */
  expandable: boolean;
  /** 1-based position among the numbered rows, and how many there are (the Position box). */
  position: number;
  siblings: number;
}

const SEP = ' · ';

/** The rows that still ask for something: pending or blocking, never a plain warning. */
function pendingRows(rows: readonly PreIssueRow[]): PreIssueRow[] {
  return rows.filter((row) => row.severity !== 'info');
}

/** `.s9-cab-meta` of a cabine row: "Blindada · 13,8 kV · agrupar por tipo" from the cabine's own data. */
export function cabineMetaText(location: LocationRow): string {
  if (location.kind !== 'cabine') return '';
  const kv = location.se.primary_kv;
  return join([
    location.se.type,
    kv !== null && kv.raw !== '' ? `${kv.raw.replace('.', ',')} ${kv.unit ?? 'kV'}` : null,
    // Verbatim from the mock's cabine rows.
    location.agrupar_por_tipo ? 'agrupar por tipo' : null,
  ]);
}
const join = (parts: readonly (string | null | undefined)[]) => parts.filter((p): p is string => typeof p === 'string' && p !== '').join(SEP);

// Verbatim from `40-relatorio-overview.html`.
const META = {
  capaFixed: 'sempre no início',
  controleFixed: 'montado sozinho',
  controle: 'montado dos dados do relatório · Rev. 1 na primeira emissão',
  setup: 'editado em Dados do relatório › Etapa 2',
  textDefault: 'texto padrão',
  // authored: the block carries the template's own boilerplate; Story 4.7 refines the word once
  // a relatório edits its text.
  textFromTemplate: 'texto do template',
  // authored: rows whose epic has not landed.
  pendingEpic: 'disponível em uma próxima etapa',
} as const;

/** `.sum-ro` of the two fixed rows. */
export function fixedRowNote(key: 'capa' | 'controle'): string {
  return key === 'capa' ? META.capaFixed : META.controleFixed;
}

/** The title of a numbered row: the mock's title for its section type, else the type itself. */
export function sectionRowTitle(blockType: string): string {
  return isRelatorioSectionType(blockType) ? SUMARIO_TITLES[blockType] : blockType;
}

/** The live section blocks of a snapshot in `order_key` order: the numbered rows. */
export function sectionBlocks(blocks: readonly BlockRow[]): BlockRow[] {
  return sortByOrderKey(blocks.filter((block) => block.removed_at === null && block.location_id === null && !isEquipmentBlock(block)));
}

function metaOfSection(block: BlockRow, issues: readonly PreIssueRow[], computed: Progress): string {
  const kind = isRelatorioSectionType(block.block_type) ? KIND_OF[block.block_type] : 'text';
  const own = issues.map((row) => row.text);
  if (block.block_type === 'section_9') return own.length > 0 ? join(own) : progressCounterText(computed);
  if (own.length > 0) return join(own);
  if (kind === 'setup') return META.setup;
  if (kind === 'text') {
    const config = block.config as { section_text?: unknown } | null;
    return typeof config?.section_text === 'string' ? META.textFromTemplate : META.textDefault;
  }
  return META.pendingEpic;
}

/**
 * The Sumário's rows: the cover, the document control, then one row per live section
 * block in `order_key` order, numbered by position. The metas come from the pre-issue rows
 * addressed to each row, else the row's own fixed line.
 */
export function sumarioRows(snapshot: RelatorioSnapshot, issues: readonly PreIssueRow[], computed: Progress): SumarioRow[] {
  const capaIssues = preIssueRowsFor(issues, 'capa');
  const controleIssues = preIssueRowsFor(issues, 'controle');
  const capaMeta = capaIssues.length > 0
    ? join(capaIssues.map((r) => r.text))
    : join([snapshot.client?.name ?? null, dateRangeText(snapshot.relatorio.setup.service_start, snapshot.relatorio.setup.service_end)]);
  const rows: SumarioRow[] = [
    {
      key: 'capa',
      rowKey: 'capa',
      kind: 'fixed',
      number: null,
      title: SUMARIO_TITLES.capa,
      meta: capaMeta,
      blocking: blockingRows(capaIssues).length > 0,
      pending: pendingRows(capaIssues).length > 0,
      blockId: null,
      blockType: null,
      expandable: false,
      position: 0,
      siblings: 0,
    },
    {
      key: 'controle',
      rowKey: 'controle',
      kind: 'fixed',
      number: null,
      title: SUMARIO_TITLES.controle,
      meta: join([META.controle, ...controleIssues.map((r) => r.text)]),
      blocking: blockingRows(controleIssues).length > 0,
      pending: pendingRows(controleIssues).length > 0,
      blockId: null,
      blockType: null,
      expandable: false,
      position: 0,
      siblings: 0,
    },
  ];
  const sections = sectionBlocks(snapshot.blocks);
  sections.forEach((block, i) => {
    const rowKey: SumarioRowKey = isRelatorioSectionType(block.block_type) ? block.block_type : 'section_11';
    const own = isRelatorioSectionType(block.block_type) ? preIssueRowsFor(issues, block.block_type) : [];
    rows.push({
      key: block.id,
      rowKey,
      kind: isRelatorioSectionType(block.block_type) ? KIND_OF[block.block_type] : 'text',
      number: i + 1,
      title: sectionRowTitle(block.block_type),
      meta: metaOfSection(block, own, computed),
      blocking: blockingRows(own).length > 0,
      pending: pendingRows(own).length > 0,
      blockId: block.id,
      blockType: block.block_type,
      expandable: block.block_type === 'section_9',
      position: i + 1,
      siblings: sections.length,
    });
  });
  return rows;
}

/** The numbered rows, the ones the Position box and Alt+arrows move among. */
export function numberedSiblings(rows: readonly SumarioRow[]): SumarioRow[] {
  return rows.filter((row) => row.number !== null);
}

/** The foot's `.btn-reason`: nothing blocks, or the blocking rows named by line. */
export function generateReason(rows: readonly SumarioRow[]): string {
  const blocking = rows.filter((row) => row.blocking);
  // authored: the mock draws the one-blocker case ("Só o parecer (linha 10) impede gerar.").
  if (blocking.length === 0) return 'Nada impede gerar.';
  const named = blocking.map((row) => (row.number === null ? row.title : `${row.title} (linha ${row.number})`));
  if (named.length === 1) return `Só ${named[0]} impede gerar. O resto está escrito em cada linha.`;
  return `${named.join(', ')} impedem gerar. O resto está escrito em cada linha.`;
}

export interface RestorableBlock {
  id: string;
  /** "2 Definições" for a section, the TAG for an equipment sheet. */
  name: string;
  removed_at: string;
}

/** The removed blocks "Restaurar ficha removida" offers, newest removal first. */
export function restorableBlocks(blocks: readonly BlockRow[], equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[] = []): RestorableBlock[] {
  const tags = new Map(equipment.map((row) => [row.id, row.tag]));
  return blocks
    .filter((block): block is BlockRow & { removed_at: string } => block.removed_at !== null)
    .map((block) => ({
      id: block.id,
      name: isEquipmentBlock(block)
        ? ((block.equipment_id !== null && tags.get(block.equipment_id)) || block.block_type)
        : join([relatorioSectionNumber(block.block_type)?.toString() ?? null, sectionRowTitle(block.block_type)]).replace(SEP, ' '),
      removed_at: block.removed_at,
    }))
    .sort((a, b) => (a.removed_at < b.removed_at ? 1 : a.removed_at > b.removed_at ? -1 : a.id < b.id ? -1 : 1));
}

// --- relatório and project texts (Story 4.1) -------------------------------------------

/** `.lr-title` and the Sumário's document name: "Cabine primária — ⟨site⟩" (the project's name when it has no site). */
export function relatorioTitle(project: Pick<ProjectRow, 'name' | 'site'> | null): string {
  const place = project?.site ?? project?.name ?? null;
  return place === null || place === '' ? 'Cabine primária' : `Cabine primária — ${place}`;
}

/** `.sheet-title`: "⟨cliente⟩ · ⟨site⟩". */
export function sumarioTitle(client: { name: string } | null, project: Pick<ProjectRow, 'name' | 'site'> | null): string {
  return join([client?.name ?? null, project?.site ?? project?.name ?? null]) || relatorioTitle(project);
}

/** `.sheet-meta` after the status pill: "06–08/09/2026 · template ⟨nome⟩ · responsável ⟨nome⟩", the parts that exist. */
export function sumarioMetaText(input: { start: string | null; end: string | null; templateName: string | null; responsibleName: string | null }): string {
  return join([
    dateRangeText(input.start, input.end),
    input.templateName === null ? null : `template ${input.templateName}`,
    input.responsibleName === null ? null : `responsável ${input.responsibleName}`,
  ]);
}

/** "Relatórios desta obra (3)". */
export function projectRelatoriosHeading(n: number): string {
  return `Relatórios desta obra (${n})`;
}

/**
 * The `.project-meta` "Relatórios" line: the count. authored: the mock's "· último emitido
 * em 24/03/2025" tail needs the revisions of Story 4.8 and is added there.
 */
export function projectRelatoriosMeta(rows: readonly Pick<RelatorioRow, 'removed_at'>[]): string {
  return String(rows.filter((row) => row.removed_at === null).length);
}

/** The live relatórios of one project, newest first (a UUIDv7 id orders by creation, AD-4). */
export function relatoriosOfProject(rows: readonly RelatorioRow[], projectId: string): RelatorioRow[] {
  return rows
    .filter((row) => row.project_id === projectId && row.removed_at === null)
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** `.lr-sub`: "criado em 23/09/2026 · ⟨template⟩" (the parts it has). */
export function relatorioSubText(row: Pick<RelatorioRow, 'id'>, templateName: string | null): string {
  const born = uuidV7Instant(row.id);
  const created = born === null ? '' : formatDateOfInstant(born);
  return join([created === '' ? null : `criado em ${created}`, templateName]);
}

/** The "Novo relatório" dialog's reason beside "Criar relatório", or null when it can create. */
export function newRelatorioReason(input: { templateId: string | null; start: string | null; end: string | null }): string | null {
  // authored: EXPERIENCE.md › Form dialog names the two required fields; the order rule is this story's.
  if (input.templateId === null) return 'Criar relatório: falta o template';
  if (input.start === null || input.start === '') return 'Criar relatório: falta a data de início';
  if (input.end !== null && input.end !== '' && input.end < input.start) return 'Criar relatório: o fim é anterior ao início';
  return null;
}

/** The template the project's newest relatório was created from, or null. */
export function lastTemplateUsed(relatorios: readonly Pick<RelatorioRow, 'id' | 'template_id' | 'removed_at'>[]): string | null {
  const used = relatorios.filter((row) => row.template_id !== null && row.removed_at === null).sort((a, b) => (a.id < b.id ? 1 : -1));
  return used[0]?.template_id ?? null;
}

/**
 * The template the dialog preselects: the project's last used one when it is still
 * pickable, else the only pickable template, else null.
 */
export function defaultTemplateFor(
  relatorios: readonly Pick<RelatorioRow, 'id' | 'template_id' | 'removed_at'>[],
  templates: readonly TemplateRow[],
): string | null {
  const pickable = pickableTemplates(templates);
  const last = lastTemplateUsed(relatorios);
  if (last !== null && pickable.some((row) => row.id === last)) return last;
  return pickable.length === 1 ? pickable[0]!.id : null;
}

/** The template Combobox's option meta: "94 blocos". */
export function templateBlocksText(total: number): string {
  return total === 1 ? '1 bloco' : `${total} blocos`;
}

/** The dialog's helper under the template: "Os 94 blocos nascem nas cabines e colunas do template, com a TAG final. Arquivados não aparecem." */
export function templateHelperText(total: number | null): string {
  const lead = total === null ? 'Os blocos' : `Os ${total} blocos`;
  return `${lead} nascem nas cabines e colunas do template, com a TAG final. Arquivados não aparecem.`;
}

/** The dialog's description: "Para ⟨cliente⟩ · ⟨obra⟩." (the bold part; the sentence after it is the surface's). */
export function newRelatorioSubject(client: { name: string } | null, project: Pick<ProjectRow, 'name' | 'site'>): string {
  return sumarioTitle(client, project);
}

/** The toast of a Sumário move: "Objetivo movida — numeração refeita" (verbatim mock). */
export function sectionMovedText(title: string): string {
  return `${title} movida — numeração refeita`;
}
