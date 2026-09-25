import type { RelatorioSummary } from '../contract/sync.ts';
import { formatDateOfInstant, uuidV7Instant } from '../format/datetime.ts';
import type { ProjectRow, RelatorioRow, TemplateRow } from '../schemas/entities.ts';
import { projectStreamId } from '../sync/streams.ts';
import { pickableTemplates } from '../templates/list.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';

/*
 * Story 4.1 (E4-A7(4)): the texts and rules of the Project surface and the "Novo relatório"
 * dialog -- what an obra and a relatório are called, which relatórios an obra lists, and
 * what "Criar relatório" needs -- moved out of the Sumário's module (AD-2: every count,
 * order and composed line is the kernel's).
 */

const SEP = ' · ';
const join = (parts: readonly (string | null | undefined)[]) => parts.filter((p): p is string => typeof p === 'string' && p !== '').join(SEP);

/** `.lr-title` and the Sumário's document name: "Cabine primária — ⟨site⟩" (the project's name when it has no site). */
export function relatorioTitle(project: Pick<ProjectRow, 'name' | 'site'> | null): string {
  const place = project?.site ?? project?.name ?? null;
  return place === null || place === '' ? 'Cabine primária' : `Cabine primária — ${place}`;
}

/** `.sheet-title`: "⟨cliente⟩ · ⟨site⟩". */
export function sumarioTitle(client: { name: string } | null, project: Pick<ProjectRow, 'name' | 'site'> | null): string {
  return join([client?.name ?? null, project === null ? null : projectLabel(project)]) || relatorioTitle(project);
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
