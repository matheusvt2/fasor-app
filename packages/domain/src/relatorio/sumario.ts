import { dateRangeText, formatDateOfInstant, uuidV7Instant } from '../format/datetime.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import type { BlockRow, EquipmentRow, LocationRow, ProjectRow, RelatorioRow, RelatorioStatus, TemplateRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { RelatorioSummary } from '../contract/sync.ts';
import { projectStreamId } from '../sync/streams.ts';
import { pickableTemplates } from '../templates/list.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { isRelatorioSectionType, relatorioSectionNumber, type RelatorioSectionType } from './instantiate.ts';
import { blockingRows, preIssueRowsFor, type PreIssueRow, type SumarioRowKey } from './pre-issue.ts';
import { progressCounterText, type Progress } from './progress.ts';
import { sectionTextEdited } from './section-variables.ts';
import { locationPathText } from './location-path.ts';
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

function metaOfSection(block: BlockRow, issues: readonly PreIssueRow[], computed: Progress): string {
  const kind = isRelatorioSectionType(block.block_type) ? KIND_OF[block.block_type] : 'text';
  const own = issues.map((row) => row.text);
  if (block.block_type === 'section_9') return own.length > 0 ? join(own) : progressCounterText(computed);
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

// --- relatório and project texts (Story 4.1) -------------------------------------------

/** `.lr-title` and the Sumário's document name: "Cabine primária — ⟨site⟩" (the project's name when it has no site). */
export function relatorioTitle(project: Pick<ProjectRow, 'name' | 'site'> | null): string {
  const place = project?.site ?? project?.name ?? null;
  return place === null || place === '' ? 'Cabine primária' : `Cabine primária — ${place}`;
}

/** `.sheet-title`: "⟨cliente⟩ · ⟨site⟩". */
export function sumarioTitle(client: { name: string } | null, project: Pick<ProjectRow, 'name' | 'site'> | null): string {
  return join([client?.name ?? null, project === null ? null : projectLabel(project)]) || relatorioTitle(project);
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

/** What an obra is called wherever it is listed: its site, else its name. */
export function projectLabel(row: Pick<ProjectRow, 'name' | 'site'>): string {
  return row.site ?? row.name;
}

/** The live obras of one client, alphabetical by label (pt-BR collation); none for no client. */
export function projectsOfClient(rows: readonly ProjectRow[], clientId: string | null): ProjectRow[] {
  if (clientId === null) return [];
  return rows.filter((row) => row.client_id === clientId && row.removed_at === null).sort((a, b) => projectLabel(a).localeCompare(projectLabel(b), 'pt-BR'));
}

/**
 * The obra among `rows` whose label reads like `name` (the registry rule: trimmed, inner
 * whitespace collapsed, case- and accent-insensitive), or null: a name typed like an
 * existing obra is that obra, not a second `project` row.
 */
export function projectNamed(rows: readonly ProjectRow[], name: string): ProjectRow | null {
  const wanted = normalizeRegistryName(name);
  return rows.find((row) => normalizeRegistryName(projectLabel(row)) === wanted) ?? null;
}

/** `.lr-sub`: "criado em 23/09/2026 · ⟨template⟩" (the parts it has). */
export function relatorioSubText(row: Pick<RelatorioRow, 'id'>, templateName: string | null): string {
  const born = uuidV7Instant(row.id);
  const created = born === null ? '' : formatDateOfInstant(born);
  return join([created === '' ? null : `criado em ${created}`, templateName]);
}

/** True when both dates exist and the end lies before the start (ISO dates compare as strings). */
export function endBeforeStart(start: string | null, end: string | null): boolean {
  return start !== null && start !== '' && end !== null && end !== '' && end < start;
}

/** The "Novo relatório" dialog's reason beside "Criar relatório", or null when it can create. */
export function newRelatorioReason(input: { templateId: string | null; start: string | null; end: string | null }): string | null {
  // authored: EXPERIENCE.md › Form dialog names the two required fields; the order rule is this story's.
  if (input.templateId === null) return 'Criar relatório: falta o template';
  if (input.start === null || input.start === '') return 'Criar relatório: falta a data de início';
  if (endBeforeStart(input.start, input.end)) return 'Criar relatório: o fim é anterior ao início';
  return null;
}

/**
 * Epic 4 retro item 17: whether this device holds enough of the obra's equipment to create
 * another relatório of it. A new relatório reuses the obra's equipment by base TAG and type
 * (Epic 4 QA Q4), so creating one from a device that never pulled an earlier relatório of
 * the obra would mint a second row for every TAG, and the sync would report each as "TAG
 * duplicada". Ready when the company summary lists no relatório of the project this device
 * does not hold (a first relatório, or every earlier one is here), or when the project's own
 * stream (`project:{id}`) or the stream of a held relatório of the project was downloaded
 * (either carries every project-scope op of the obra).
 */
export function newRelatorioEquipmentReady(input: {
  projectId: string;
  summaries: readonly Pick<RelatorioSummary, 'id' | 'project_id'>[];
  heldRelatorioIds: ReadonlySet<string> | readonly string[];
  downloadedStreamIds: ReadonlySet<string> | readonly string[];
}): boolean {
  const held = new Set(input.heldRelatorioIds);
  const downloaded = new Set(input.downloadedStreamIds);
  const ofProject = input.summaries.filter((row) => row.project_id === input.projectId).map((row) => row.id);
  if (ofProject.every((id) => held.has(id))) return true;
  if (downloaded.has(projectStreamId(input.projectId))) return true;
  return ofProject.some((id) => held.has(id) && downloaded.has(id));
}

/** "Criar relatório"'s refusal while `newRelatorioEquipmentReady` is false. */
export function newRelatorioEquipmentReason(): string {
  // authored: no mock covers a device that holds too little of the obra to create offline.
  return 'Criar relatório: conecte-se para baixar os equipamentos desta obra';
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
