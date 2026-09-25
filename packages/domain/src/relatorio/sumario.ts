import { dateRangeText } from '../format/datetime.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import type { BlockRow, EquipmentRow, LocationRow, RelatorioStatus } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { isRelatorioSectionType, relatorioSectionNumber, type RelatorioSectionType } from './instantiate.ts';
import { blockingRows, preIssueRowsFor, type PreIssueRow, type SumarioRowKey } from './pre-issue.ts';
import { progressCounterText, type Progress } from './progress.ts';
import { sectionTextEdited } from './section-variables.ts';
import { locationPathText } from './location-path.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { pointsSummary, pointsSummaryText } from '../points/summary.ts';

/*
 * Story 4.3: the Sumário as data (`40-relatorio-overview.html`): the relatório's own table
 * of contents in the FO.SERV-03 order, one row per part, its title, its number (the
 * position among the numbered rows, redrawn after every move), the status line the
 * pre-issue check and `progress` wrote, and what kind of row it is (AD-2: every count,
 * order and composed line is the kernel's). Story 4.1's texts of the Project surface and
 * the "Novo relatório" dialog are `project.ts`'s.
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
 * (7, 8 and 9: the renderer produces their content from what the relatório stores; 8 opens
 * the Points surface, Story 6.6), `pending-epic` (10, 11: status only until their epic lands).
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
  section_8: 'generated',
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

/** A cabine number value as its meta line prints it: "13,8 kV", "19 °C", "67 %"; null when not typed. */
function measure(value: { raw: string; unit: string | null } | null, unit: string): string | null {
  if (value === null || value.raw.trim() === '') return null;
  return `${value.raw.trim().replace('.', ',')} ${value.unit ?? unit}`;
}

/** `cabineMetaText` of a cabine that holds no data yet. */
export const CABINE_META_NONE = '—';

/**
 * `.s9-cab-meta` of a cabine row (DESIGN.md › Relatório tree: "SE · 13,8 kV · 19 °C · 67 %",
 * read-only), from the cabine's own data: its SE type, primary voltage, test temperature
 * and humidity, and "agrupar por tipo" when the flag is on; "—" when none is set. A coluna
 * has no data line and reads "".
 */
export function cabineMetaText(location: LocationRow): string {
  if (location.kind !== 'cabine') return '';
  const line = join([
    location.se.type,
    measure(location.se.primary_kv, 'kV'),
    measure(location.env.temperature_c, '°C'),
    measure(location.env.humidity_pct, '%'),
    // Verbatim from the mock's cabine rows.
    location.agrupar_por_tipo ? 'agrupar por tipo' : null,
  ]);
  return line === '' ? CABINE_META_NONE : line;
}
const join = (parts: readonly (string | null | undefined)[]) => parts.filter((p): p is string => typeof p === 'string' && p !== '').join(SEP);

// Verbatim from `40-relatorio-overview.html`.
const META = {
  capaFixed: 'sempre no início',
  controleFixed: 'montado sozinho',
  controle: 'montado dos dados do relatório · Rev. 1 na primeira emissão',
  setup: 'editado em Dados do relatório › Etapa 2',
  textDefault: 'texto padrão',
  // authored: the block carries the template's own boilerplate.
  textFromTemplate: 'texto do template',
  // authored (Epic 4 retro item 22): the relatório's own text, edited in the section text
  // editor (`config.section_text_edited`); no mock covers an edited section row.
  textEdited: 'texto editado',
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

function metaOfSection(block: BlockRow, issues: readonly PreIssueRow[], computed: Progress, snapshot: RelatorioSnapshot): string {
  const kind = isRelatorioSectionType(block.block_type) ? KIND_OF[block.block_type] : 'text';
  const own = issues.map((row) => row.text);
  if (block.block_type === 'section_9') return own.length > 0 ? join(own) : progressCounterText(computed);
  // Story 6.6: row 8 always counts its entries; the "sem ação" count is already in that
  // line, so only the rows naming a point with a removed photo follow it.
  if (block.block_type === 'section_8') {
    return join([pointsSummaryText(pointsSummary(snapshot)), ...issues.filter((row) => row.kind === 'point_photo_removed').map((row) => row.text)]);
  }
  if (own.length > 0) return join(own);
  if (kind === 'setup') return META.setup;
  if (kind === 'text') {
    if (sectionTextEdited(block.config)) return META.textEdited;
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
      meta: metaOfSection(block, own, computed, snapshot),
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

/**
 * Story 12.2 (J-06): the section text after `blockId` in Sumário order, the next live block
 * whose row is a `text` row (sections 2, 4, 5 and 6, the ones the section text surface
 * opens); null on the last one or for a block that is not a live section.
 */
export function nextTextSection(snapshot: Pick<RelatorioSnapshot, 'blocks'>, blockId: string): string | null {
  const sections = sectionBlocks(snapshot.blocks);
  const at = sections.findIndex((block) => block.id === blockId);
  if (at < 0) return null;
  const next = sections.slice(at + 1).find((block) => isRelatorioSectionType(block.block_type) && KIND_OF[block.block_type] === 'text');
  return next?.id ?? null;
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
  /** Where an equipment sheet was: "1° Subsolo › Coluna 5"; null for a section. */
  detail: string | null;
  /**
   * The name no other row of the list shares (F-5): the name and its detail, "SEC-C05 —
   * 1° Subsolo › Coluna 5", with " (2)", " (3)" after the second and later identical ones
   * in list order.
   */
  label: string;
  /** The sheet's equipment row, restored with it (a removal tombstones both); null for a section. */
  equipmentId: string | null;
  removed_at: string;
}

/**
 * The removed blocks "Restaurar ficha removida" offers, newest removal first, each with a
 * label unique in the list. `locations` are the relatório's, removed ones included, so a
 * sheet still names the coluna it was in.
 */
export function restorableBlocks(
  blocks: readonly BlockRow[],
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[] = [],
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'name'>[] = [],
): RestorableBlock[] {
  const tags = new Map(equipment.map((row) => [row.id, row.tag]));
  const rows = blocks
    .filter((block): block is BlockRow & { removed_at: string } => block.removed_at !== null)
    .map((block) => {
      const sheet = isEquipmentBlock(block);
      const name = sheet
        ? ((block.equipment_id !== null && tags.get(block.equipment_id)) || block.block_type)
        : join([relatorioSectionNumber(block.block_type)?.toString() ?? null, sectionRowTitle(block.block_type)]).replace(SEP, ' ');
      const path = sheet ? locationPathText(locations, block.location_id) : '';
      return { id: block.id, name, detail: path === '' ? null : path, equipmentId: sheet ? block.equipment_id : null, removed_at: block.removed_at };
    })
    .sort((a, b) => (a.removed_at < b.removed_at ? 1 : a.removed_at > b.removed_at ? -1 : a.id < b.id ? -1 : 1));
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = row.detail === null ? row.name : `${row.name} — ${row.detail}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...row, label: n === 1 ? base : `${base} (${n})` };
  });
}

// --- the Sumário header (Story 4.3) -----------------------------------------------------

/** `.sheet-meta` after the status pill: "06–08/09/2026 · template ⟨nome⟩ · responsável ⟨nome⟩", the parts that exist. */
export function sumarioMetaText(input: { start: string | null; end: string | null; templateName: string | null; responsibleName: string | null }): string {
  return join([
    dateRangeText(input.start, input.end),
    input.templateName === null ? null : `template ${input.templateName}`,
    input.responsibleName === null ? null : `responsável ${input.responsibleName}`,
  ]);
}

/** EXPERIENCE.md: section 9 opens expanded on an Em campo relatório and collapsed on every other status. */
export function sumarioOpensExpanded(status: RelatorioStatus): boolean {
  return status === 'em_campo';
}

/**
 * The `.sumario` modifier of a status that reads the list without editing it
 * (`40-relatorio-overview.html` `.sumario.is-review`): `is-review` on Em revisão, none otherwise.
 */
export function sumarioReadingMode(status: RelatorioStatus): 'is-review' | null {
  return status === 'em_revisao' ? 'is-review' : null;
}

/** The toast of a Sumário move: "Objetivo movida — numeração refeita" (verbatim mock). */
export function sectionMovedText(title: string): string {
  return `${title} movida — numeração refeita`;
}
