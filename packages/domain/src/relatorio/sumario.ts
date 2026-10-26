import { dateRangeText } from '../format/datetime.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import { isNotApplicableNumber, NOT_APPLICABLE_TEXT } from '../parse/pt-br-number.ts';
import { livePhotos } from '../photos/order.ts';
import { photoCountText } from '../photos/text.ts';
import type { BlockRow, EquipmentRow, LocationRow, RelatorioStatus, RevisionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { isRelatorioSectionType, relatorioSectionNumber, type RelatorioSectionType } from './instantiate.ts';
import { blockingRows, issueConfirmReason, preIssueRowsFor, type IssueConfirmation, type PreIssueRow, type SumarioRowKey } from './pre-issue.ts';
import { progressCounterText, type Progress } from './progress.ts';
import { sectionTextEdited } from './section-variables.ts';
import { funcaoLabel } from './local.ts';
import { hiddenLocationIds } from './location-live.ts';
import { locationPathText } from './location-path.ts';
import { locationRestoreDetailText, locationRestorePlan, removedAncestorIds, type SiteWorkRow } from './removal.ts';
import { isEquipmentBlock } from './sheet-state.ts';
import { locationControlName } from './tree.ts';
import { pointsSummary, pointsSummaryText } from '../points/summary.ts';
import { parecerOf, parecerVerdictLabel } from './parecer.ts';
import { certificatesAttachedText, instrumentsCountText, section11Instruments } from '../print/section-11.ts';
import { getSeed, siteChecklistOf } from '../seed/definitions.ts';
import { idleRevisionNumber, latestRevision, revisionTitle } from '../print/revisions.ts';
import { statusLabel } from '../status/table.ts';

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
  // Story 7.5: the Export dialog's sync lines; no Sumário row carries this key.
  sync: 'Sincronização',
};

/**
 * What a row is: `fixed` (the cover and the control, no reorder controls), `setup` (opens
 * Dados do relatório, rows 1 and 3, and 10 at its Etapa 6 since Story 7.4), `text` (a
 * section text, rows 2, 4, 5, 6), `generated` (7, 8, 9 and 11: the renderer produces their
 * content from what the relatório stores; 8 opens the Points surface, Story 6.6; 11 prints the
 * certificates, Story 7.3), `pending-epic` (none since Stories 7.3 and 7.4).
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
  section_10: 'setup',
  section_11: 'generated',
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
  /**
   * E78-Q1: a numbered row with no section block behind it, drawn for a snapshot that has no
   * live section block (a relatório older than them, the Porto Seguro fixtures), which prints
   * the seed's eleven sections (`print/layout.ts` `printedSections`). It has no Position box,
   * no Overflow and no move; it opens only where no block is needed.
   */
  virtual: boolean;
}

const SEP = ' · ';

/** The rows that still ask for something: pending or blocking, never a plain warning. */
function pendingRows(rows: readonly PreIssueRow[]): PreIssueRow[] {
  return rows.filter((row) => row.severity !== 'info');
}

/** A cabine number value as its meta line prints it: "13,8 kV", "19 °C", "67 %"; "N.A" with no unit for the `not_applicable` state (Story 16.4, read before `raw`); null when not typed. */
function measure(value: { raw: string; unit: string | null } | null, unit: string): string | null {
  if (isNotApplicableNumber(value)) return NOT_APPLICABLE_TEXT;
  if (value === null || value.raw.trim() === '') return null;
  return `${value.raw.trim().replace('.', ',')} ${value.unit ?? unit}`;
}

/** `cabineMetaText` of a cabine that holds no data yet. */
export const CABINE_META_NONE = '—';

/**
 * The data line of a local's row (`.s9-loc-meta`, `40-relatorio-overview.html`: "Entrada ·
 * Blindada · 13,8 kV · 19 °C · 67 %", read-only), from the cabine row's own data: its Função
 * first when it holds one (Story 14.2, `funcaoLabel`), then its SE type, primary voltage,
 * test temperature and humidity, and "agrupar por tipo" when the flag is on; "—" when none
 * is set. A painel or a coluna has no data line and reads "".
 */
export function cabineMetaText(location: LocationRow): string {
  if (location.kind !== 'cabine') return '';
  const line = join([
    funcaoLabel(location.funcao),
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
  controle: 'montado dos dados do relatório',
  controleFirst: 'Rev. 1 na primeira emissão',
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

/** What the Controle do documento row reads: the revisions, whether anything was edited since the newest, and the status. */
export interface ControleRevisions {
  revisions: readonly RevisionRow[];
  edited: boolean;
  status: RelatorioStatus;
}

/**
 * The Controle do documento row's line (walk-through 2026-10-09, m1; decision 4 of 2026-10-10):
 * "Rev. 1 na primeira emissão" before any revision (verbatim from the mock); "Rev. N+1 na
 * próxima emissão" once something was edited since revision N; with nothing edited, "Rev. N
 * emitida" only once the relatório is Emitido (the client has it) and "Rev. N gerada" in any
 * other status. The number is `idleRevisionNumber`, the Export dialog's own "Rev." line.
 */
export function controleMetaText(control?: ControleRevisions | null): string {
  // Not known yet (the device is still reading whether anything was edited): no revision part.
  if (control === null) return META.controle;
  const latest = control === undefined ? null : latestRevision(control.revisions);
  if (control === undefined || latest === null) return join([META.controle, META.controleFirst]);
  const title = revisionTitle(idleRevisionNumber(control.revisions, control.edited));
  // authored: 2026-10-10, the three lines after the first revision.
  const line = control.edited ? `${title} na próxima emissão` : control.status === 'emitido' ? `${title} emitida` : `${title} gerada`;
  return join([META.controle, line]);
}

/** `.sum-ro` of the two fixed rows. */
export function fixedRowNote(key: 'capa' | 'controle'): string {
  return key === 'capa' ? META.capaFixed : META.controleFixed;
}

/** The title of a numbered row: the mock's title for its section type, else the type itself. */
export function sectionRowTitle(blockType: string): string {
  return isRelatorioSectionType(blockType) ? SUMARIO_TITLES[blockType] : blockType;
}

/** The eleven FO.SERV-03 section numbers of a seed version in order, from the seed's titles. */
export function seedSectionNumbers(seedVersion: string): number[] {
  return Object.keys(getSeed(seedVersion, 'cabine_primaria').section_titles)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * E78-Q1: whether a snapshot prints the seed's sections instead of its own blocks: no live
 * section block names a FO.SERV-03 section (`print/layout.ts` `printedSections` falls back
 * then, and the Sumário draws the same rows as virtual ones).
 */
export function printsSeedSections(blocks: readonly BlockRow[]): boolean {
  return !sectionBlocks(blocks).some((block) => relatorioSectionNumber(block.block_type) !== null);
}

/** The live section blocks of a snapshot in `order_key` order: the numbered rows. */
export function sectionBlocks(blocks: readonly BlockRow[]): BlockRow[] {
  return sortByOrderKey(blocks.filter((block) => block.removed_at === null && block.location_id === null && !isEquipmentBlock(block)));
}

function metaOfSection(block: Pick<BlockRow, 'block_type' | 'config'>, issues: readonly PreIssueRow[], computed: Progress, snapshot: RelatorioSnapshot): string {
  const kind = isRelatorioSectionType(block.block_type) ? KIND_OF[block.block_type] : 'text';
  const own = issues.map((row) => row.text);
  if (block.block_type === 'section_9') return own.length > 0 ? join(own) : progressCounterText(computed);
  // Story 6.6: row 8 always counts its entries; the "sem ação" count is already in that
  // line, so only the rows naming a point with a removed photo follow it, and (Story 11.10)
  // the "pontos sem prazo" count.
  if (block.block_type === 'section_8') {
    return join([
      pointsSummaryText(pointsSummary(snapshot)),
      ...issues.filter((row) => row.kind === 'point_photo_removed' || row.kind === 'points_sem_prazo').map((row) => row.text),
    ]);
  }
  // Stories 6.3/6.5: "82 fotos · 1 sem legenda · 3 aguardando envio", like section 9's counter.
  if (block.block_type === 'section_7') return join([photoCountText(livePhotos(snapshot).length), ...own]);
  // Story 7.4: row 10 names what stops it ("Parecer não preenchido"), else the verdict set.
  if (block.block_type === 'section_10' && own.length === 0) {
    const parecer = parecerOf(snapshot);
    if (parecer !== null) return parecerVerdictLabel(parecer.verdict);
  }
  // Story 7.3: "3 instrumentos", then its own pre-issue rows, like section 7.
  // With no instrument at all, the pre-issue row already says so; the count would repeat it.
  // Review fixes 2026-10-06 (F-15): then how many certificates are attached; with none, that
  // one line stands for every "MEG-01 sem certificado" row (the Export dialog keeps them).
  if (block.block_type === 'section_11') {
    const instruments = section11Instruments(snapshot);
    const count = instruments.length;
    if (count === 0) return join(own.length > 0 ? own : [instrumentsCountText(0)]);
    const attached = instruments.filter((entry) => entry.certificate_file_id !== null).length;
    const rest = attached === 0 ? issues.filter((row) => row.kind !== 'certificate_missing').map((row) => row.text) : own;
    return join([instrumentsCountText(count), certificatesAttachedText(attached, count), ...rest]);
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
export function sumarioRows(snapshot: RelatorioSnapshot, issues: readonly PreIssueRow[], computed: Progress, control?: ControleRevisions | null): SumarioRow[] {
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
      virtual: false,
    },
    {
      key: 'controle',
      rowKey: 'controle',
      kind: 'fixed',
      number: null,
      title: SUMARIO_TITLES.controle,
      meta: join([controleMetaText(control), ...controleIssues.map((r) => r.text)]),
      blocking: blockingRows(controleIssues).length > 0,
      pending: pendingRows(controleIssues).length > 0,
      blockId: null,
      blockType: null,
      expandable: false,
      position: 0,
      siblings: 0,
      virtual: false,
    },
  ];
  if (printsSeedSections(snapshot.blocks)) {
    rows.push(...virtualSectionRows(snapshot, issues, computed));
    return rows;
  }
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
      virtual: false,
    });
  });
  return rows;
}

/**
 * E78-Q1: the numbered rows of a snapshot with no live section block, one per section the
 * document prints for it (the seed's eleven, in FO.SERV-03 order), with the metas and
 * states of the same pre-issue rows a real row would carry, so "linha 10" is true on the
 * Sumário, in the Export dialog and in the printed document alike.
 */
function virtualSectionRows(snapshot: RelatorioSnapshot, issues: readonly PreIssueRow[], computed: Progress): SumarioRow[] {
  const types = seedSectionNumbers(snapshot.relatorio.seed_version)
    .map((section) => `section_${section}`)
    .filter(isRelatorioSectionType);
  return types.map((type, i) => {
    const own = preIssueRowsFor(issues, type);
    return {
      key: type,
      rowKey: type,
      kind: KIND_OF[type],
      number: i + 1,
      title: sectionRowTitle(type),
      meta: metaOfSection({ block_type: type, config: null }, own, computed, snapshot),
      blocking: blockingRows(own).length > 0,
      pending: pendingRows(own).length > 0,
      blockId: null,
      blockType: type,
      expandable: type === 'section_9',
      position: i + 1,
      siblings: types.length,
      virtual: true,
    };
  });
}

/** E78-Q1: the Sumário number of the row `key` names ("linha 10"), or null when no numbered row carries it. */
export function sumarioLineOf(rows: readonly SumarioRow[], key: SumarioRowKey): number | null {
  return rows.find((row) => row.rowKey === key && row.number !== null)?.number ?? null;
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

/**
 * The foot's `.btn-reason`: nothing blocks, or the blocking rows named by line. E78-Q1: every
 * row a blocking pre-issue row addresses is named, the rows drawn blocking and the keys of
 * `issues` alike, so a blocker the Sumário has no row for is still named by its title. With
 * nothing blocking, `confirm` (F-03) adds what the issue confirmation will count. The status's
 * next step is its own sentence, under the status pill (`statusStepText`, decision 5 of 2026-10-10).
 * p020 P-1b: `absent` (`absentSectionsSentence`, what will not print) ends the line, after one space.
 */
export function generateReason(rows: readonly SumarioRow[], issues: readonly PreIssueRow[] = [], confirm?: IssueConfirmation, absent: string | null = null): string {
  const reason = blockingReason(rows, issues, confirm);
  return absent === null ? reason : `${reason} ${absent}`;
}

function blockingReason(rows: readonly SumarioRow[], issues: readonly PreIssueRow[], confirm: IssueConfirmation | undefined): string {
  const drawn = rows.filter((row) => row.blocking);
  // A blocking pre-issue row whose Sumário row is not drawn blocking (or not drawn at all).
  const unnamed = [...new Set(blockingRows(issues).map((issue) => issue.row))].filter((key) => !drawn.some((row) => row.rowKey === key));
  // authored: the mock draws the one-blocker case ("Só o parecer (linha 10) impede gerar.").
  if (drawn.length === 0 && unnamed.length === 0) {
    // F-03 (D1): nothing blocks, but issuing with empty sheets or blank fields asks first.
    const ask = confirm === undefined ? null : issueConfirmReason(confirm);
    return ask === null ? 'Nada impede gerar.' : `Nada impede gerar. ${ask}`;
  }
  const named = [
    ...drawn.map((row) => (row.number === null ? row.title : `${row.title} (linha ${row.number})`)),
    ...unnamed.map((key) => SUMARIO_TITLES[key]),
  ];
  if (named.length === 1) return `Só ${named[0]} impede gerar. O resto está escrito em cada linha.`;
  return `${named.join(', ')} impedem gerar. O resto está escrito em cada linha.`;
}

/** What the next-step sentence reads of the status flow. */
export interface StatusFlow {
  status: RelatorioStatus;
  /** The newest revision's number, or null with none. */
  latest: number | null;
  /** Whether anything was edited since the newest revision (`editedSince`). */
  edited: boolean;
  /** The setup gaps as a list (`setupGapsText`), or null when Dados do relatório is complete. */
  setupGaps?: string | null;
  /**
   * Story 14.3: the relatório's seed version. On one that ships a site list (v4 or later) the
   * Rascunho sentences also name the site items, which move it to Em campo like a sheet value.
   * Absent or a version with no site list: the sentences as they were.
   */
  seedVersion?: string | null;
}

/** "Marcar como enviado ao cliente", the one name of the `issue` action (foot, Export dialog, sentences). */
// authored: 2026-10-10 (no mock draws the action).
export const MARK_SENT_LABEL = 'Marcar como enviado ao cliente';

/**
 * Decision 2 of 2026-10-10 (Matheus): "Marcar como enviado ao cliente" is offered only in
 * Em revisão, with a revision on record and nothing edited since it, so Emitido always means
 * the client has the current content. The table (`statusTable(status, 'issue')`) still
 * decides the transition itself.
 */
export function canMarkSent(flow: Pick<StatusFlow, 'status' | 'latest' | 'edited'>): boolean {
  return flow.status === 'em_revisao' && flow.latest !== null && !flow.edited;
}

/**
 * The status's next step (2026-10-10, M6): its own sentence in the Sumário header, right under
 * the status pill at every width (decision 5), never in the Sticky action bar.
 * authored: every sentence.
 */
export function statusStepText(flow: StatusFlow): string {
  const { status, latest, edited } = flow;
  const label = statusLabel(status);
  if (status === 'rascunho') {
    const gaps = flow.setupGaps ?? null;
    if (flow.seedVersion != null && siteChecklistOf(flow.seedVersion) !== null) {
      // authored: 2026-10-13 (Story 14.3), the two Rascunho sentences of a relatório with a site checklist.
      return gaps === null
        ? `${label}: concluir os dados do relatório, ou preencher uma ficha ou as verificações do local, passa o relatório a ${statusLabel('em_campo')}.`
        : `${label}: falta ${gaps} em Dados do relatório. Preencher uma ficha ou as verificações do local passa o relatório a ${statusLabel('em_campo')}.`;
    }
    return gaps === null
      ? `${label}: concluir os dados do relatório ou preencher uma ficha passa o relatório a ${statusLabel('em_campo')}.`
      : `${label}: falta ${gaps} em Dados do relatório. Preencher uma ficha passa o relatório a ${statusLabel('em_campo')}.`;
  }
  if (status === 'em_campo') return `${label}: gerar o relatório passa a ${statusLabel('em_revisao')}.`;
  if (status === 'em_revisao') {
    if (latest === null) return `${label}: gere a revisão 1 para enviar ao cliente.`;
    if (edited) return `${label}: há alterações desde a revisão ${latest}. Gere a revisão ${latest + 1} antes de marcar como enviado ao cliente.`;
    return `${label}: a revisão ${latest} ainda não foi enviada ao cliente. Depois de enviar, use "${MARK_SENT_LABEL}".`;
  }
  if (latest === null) return `${label}.`;
  if (edited) return `${label}: há alterações desde a revisão ${latest}. Gerar cria a revisão ${latest + 1}.`;
  return `${label}: nada mudou desde a revisão ${latest}.`;
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

/** A removed block of the restore list before its label: what `restorableBlocks` and `restorableEntries` both build. */
type RestorableBlockRow = Omit<RestorableBlock, 'label'>;

function restorableBlockRows(
  blocks: readonly BlockRow[],
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[],
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'name'>[],
  since: string | null,
): RestorableBlockRow[] {
  const tags = new Map(equipment.map((row) => [row.id, row.tag]));
  return blocks
    .filter((block): block is BlockRow & { removed_at: string } => block.removed_at !== null && (since === null || block.removed_at > since))
    .map((block) => {
      const sheet = isEquipmentBlock(block);
      const name = sheet
        ? ((block.equipment_id !== null && tags.get(block.equipment_id)) || block.block_type)
        : join([relatorioSectionNumber(block.block_type)?.toString() ?? null, sectionRowTitle(block.block_type)]).replace(SEP, ' ');
      const path = sheet ? locationPathText(locations, block.location_id) : '';
      return { id: block.id, name, detail: path === '' ? null : path, equipmentId: sheet ? block.equipment_id : null, removed_at: block.removed_at };
    });
}

/** Newest removal first; at one timestamp a location before a block, then by id. */
function byNewestRemoval(a: { id: string; removed_at: string; kind?: string }, b: { id: string; removed_at: string; kind?: string }): number {
  if (a.removed_at !== b.removed_at) return a.removed_at < b.removed_at ? 1 : -1;
  const la = a.kind === 'location' ? 0 : 1;
  const lb = b.kind === 'location' ? 0 : 1;
  if (la !== lb) return la - lb;
  return a.id < b.id ? -1 : 1;
}

/**
 * Each row with the label no other row of the list shares (F-5): its name and its detail,
 * with " (2)", " (3)" after the second and later identical ones in list order.
 */
function labelled<T extends { name: string; detail: string | null }>(rows: readonly T[]): (T & { label: string })[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = row.detail === null ? row.name : `${row.name} — ${row.detail}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...row, label: n === 1 ? base : `${base} (${n})` };
  });
}

/**
 * The blocks the restore list may offer by their place (Story 14.2, second pass): on no
 * location, or on one that is not hidden (`hiddenLocationIds`: removed, or under a removed
 * row). A sheet on a hidden location comes back with that location's entry, or shows up
 * once the location is back; one naming a location the rows do not hold is offered, since
 * nothing says its location left.
 */
function onShownLocations(blocks: readonly BlockRow[], locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'removed_at'>[]): BlockRow[] {
  const hidden = hiddenLocationIds(locations);
  return blocks.filter((block) => block.location_id === null || !hidden.has(block.location_id));
}

/**
 * The removed blocks "Restaurar ficha removida" offers, newest removal first, each with a
 * label unique in the list: the block half of `restorableEntries`, by the same rule of
 * place (`onShownLocations`). `locations` are the relatório's, removed ones included: a
 * sheet names the coluna it was in, and one whose location is removed is not offered on its
 * own. Epic 4 retro item 29: `since` (the last revision's `created_at`) cuts the list at
 * the last issue: a block removed before it is part of what was issued and is not offered;
 * null (no revision) offers every one.
 */
export function restorableBlocks(
  blocks: readonly BlockRow[],
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[] = [],
  locations: readonly Pick<LocationRow, 'id' | 'parent_id' | 'name' | 'removed_at'>[] = [],
  since: string | null = null,
): RestorableBlock[] {
  return labelled(restorableBlockRows(onShownLocations(blocks, locations), equipment, locations, since).sort(byNewestRemoval));
}

/**
 * A removed block in the restore list (`restorableBlocks`' row, told apart from a location).
 * Ledger (h), Epic 14 QA: `stranded` marks a live sheet left under a removed location (another
 * device created it there, or kept it, while the location was removed); its restore puts back
 * only the removed locations above it (`removedAncestorIds`), its `removed_at` being the newest
 * of theirs.
 */
export type RestorableBlockEntry = RestorableBlock & { kind: 'block'; stranded?: true };

/** A removed location in the restore list (Story 14.2, second pass). */
export interface RestorableLocationEntry {
  kind: 'location';
  /** What it is: `cabine` is the local. */
  locationKind: LocationRow['kind'];
  id: string;
  /** Its control name (`locationControlName`): "Coluna 1 de Painel 1 de Cubículo Enel". */
  name: string;
  /** Its kind and what comes back with it (`locationRestoreDetailText`): "Painel · 2 colunas · 5 fichas". */
  detail: string;
  /** The name no other row of the list shares: "Painel 1 de Cubículo Enel — Painel · 2 colunas · 5 fichas". */
  label: string;
  removed_at: string;
}

export type RestorableEntry = RestorableBlockEntry | RestorableLocationEntry;

/**
 * Everything "Restaurar ficha removida" offers (Story 14.2, second pass): the removed
 * locations and the removed blocks in one list, newest removal first, each with a label
 * unique across the whole list. `locations`, `blocks` and `equipment` carry the removed rows.
 *
 * A removed location is an entry only when it was removed after `since` (the newest
 * revision's `created_at`; null offers every one) and its parent is null or live
 * (`liveLocationIds`): a coluna that left with its painel comes back with the painel's
 * entry, and one removed on its own under a painel removed later shows up once the painel
 * is back. A removed block is an entry only when its location is null or live, for the same
 * reason (a block naming a location the list does not hold is offered, as before).
 */
export function restorableEntries(input: {
  blocks: readonly BlockRow[];
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag' | 'removed_at'>[];
  locations: readonly LocationRow[];
  since: string | null;
  /** Epic 14 QA Q-6: the relatório's file and point rows, for the site work a local's entry names. */
  files?: readonly SiteWorkRow[];
  points?: readonly SiteWorkRow[];
}): RestorableEntry[] {
  const { blocks, equipment, locations, since } = input;
  const hidden = hiddenLocationIds(locations);
  const blockRows = restorableBlockRows(onShownLocations(blocks, locations), equipment, locations, since).map((row) => ({ ...row, kind: 'block' as const }));
  const locationRows = locations
    .filter((row): row is LocationRow & { removed_at: string } => row.removed_at !== null && (since === null || row.removed_at > since))
    .filter((row) => row.parent_id === null || !hidden.has(row.parent_id))
    .flatMap((row) => {
      const plan = locationRestorePlan({ locations, blocks, equipment, locationId: row.id, files: input.files ?? [], points: input.points ?? [] });
      if (plan === null) return [];
      return [
        {
          kind: 'location' as const,
          locationKind: row.kind,
          id: row.id,
          name: locationControlName(locations, row.id),
          detail: locationRestoreDetailText(row.kind, plan.counts),
          removed_at: row.removed_at,
        },
      ];
    });
  // Ledger (h): a stranded sheet whose removed location is offered comes back with that entry; it is listed alone otherwise.
  const offered = new Set(locationRows.map((row) => row.id));
  const strandedRows = strandedSheetRows(blocks, equipment, locations, hidden).filter(
    (row) => !removedAncestorIds(locations, blocks.find((block) => block.id === row.id)?.location_id ?? null).some((id) => offered.has(id)),
  );
  return labelled<Omit<RestorableBlockEntry, 'label'> | Omit<RestorableLocationEntry, 'label'>>([...locationRows, ...blockRows, ...strandedRows].sort(byNewestRemoval)) as RestorableEntry[];
}

/**
 * Ledger (h), Epic 14 QA: every live equipment sheet whose location is hidden (removed, or
 * under a removed row) is its own entry, whatever `since`: nothing else can reach it (it is
 * not removed, and its location may have left before the newest revision). While one of its
 * removed locations is offered itself (`restorableEntries`), that entry brings it back and the
 * sheet is not listed twice. Its detail names
 * where it is and the removed locations its restore brings back, root first; the sheets that
 * removal tombstoned stay removed.
 */
function strandedSheetRows(
  blocks: readonly BlockRow[],
  equipment: readonly Pick<EquipmentRow, 'id' | 'tag'>[],
  locations: readonly LocationRow[],
  hidden: ReadonlySet<string>,
): Omit<RestorableBlockEntry, 'label'>[] {
  const tags = new Map(equipment.map((row) => [row.id, row.tag]));
  const byId = new Map(locations.map((row) => [row.id, row]));
  return blocks.flatMap((block) => {
    if (block.removed_at !== null || block.location_id === null || !hidden.has(block.location_id) || !isEquipmentBlock(block)) return [];
    const back = removedAncestorIds(locations, block.location_id);
    const stamps = back.map((id) => byId.get(id)?.removed_at ?? null).filter((at): at is string => at !== null);
    if (back.length === 0 || stamps.length === 0) return [];
    const name = (block.equipment_id !== null && tags.get(block.equipment_id)) || block.block_type;
    return [
      {
        kind: 'block' as const,
        stranded: true as const,
        id: block.id,
        name,
        detail: strandedSheetDetailText(locationPathText(locations, block.location_id), back.map((id) => byId.get(id)?.name.trim() ?? '')),
        equipmentId: block.equipment_id,
        removed_at: stamps.reduce((newest, at) => (at > newest ? at : newest)),
      },
    ];
  });
}

/**
 * Ledger (h): the detail of a stranded sheet in the restore list: where it is, then the
 * removed locations its restore brings back, "Sala dos trafos › Coluna 1 · restaura Sala dos
 * trafos › Coluna 1".
 */
export function strandedSheetDetailText(path: string, restored: readonly string[]): string {
  // authored: Epic 14 QA ledger (h) (open for Bruno).
  return `${path}${SEP}restaura ${restored.join(' › ')}`;
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
