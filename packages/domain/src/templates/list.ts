import type { RelatorioSummary } from '../contract/sync.ts';
import type { TemplateRow } from '../schemas/entities.ts';

/*
 * The Templates surface's derived text, order and rules (AGENTS.md: counts, orders and
 * "which templates are pickable" are the kernel's). Story 3.2 listed the live templates by
 * name; Story 3.3 splits them into the active and archived groups and adds the row
 * actions' builders (duplicate, new) and the rule the relatório creation picker (Epic 4)
 * reads.
 */

/** `41-templates.html` `.section-head h2`: "Templates (2)". */
export function templatesHeading(count: number): string {
  return `Templates (${count})`;
}

/** `41-templates.html` archived group heading: "Arquivados (1)". */
export function archivedHeading(count: number): string {
  return `Arquivados (${count})`;
}

const byName = (a: TemplateRow, b: TemplateRow) =>
  a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The live templates, in pt-BR name order (removed ones never list). */
export function sortTemplates(rows: readonly TemplateRow[]): TemplateRow[] {
  return rows.filter((row) => row.removed_at === null).sort(byName);
}

/** The live, not archived templates, by name: the list's first group. */
export function activeTemplates(rows: readonly TemplateRow[]): TemplateRow[] {
  return sortTemplates(rows).filter((row) => row.archived_at === null);
}

/** The live, archived templates, by name: the "Arquivados (n)" group. */
export function archivedTemplates(rows: readonly TemplateRow[]): TemplateRow[] {
  return sortTemplates(rows).filter((row) => row.archived_at !== null);
}

/**
 * The templates a new relatório may be created from (Epic 4's picker): live and not
 * archived. An archived template leaves the picker; the relatórios created from it keep
 * everything, since creation copies and never references (FR-13).
 */
export function pickableTemplates(rows: readonly TemplateRow[]): TemplateRow[] {
  return activeTemplates(rows);
}

/**
 * How many of the company's relatórios were created from this template: the company
 * pull's summary (AD-8) united by id with the relatório rows this device holds, so one
 * created here and not yet synced already makes the template referenced (Story 4.1). A
 * template with any is only ever archived, never removed (FR-9).
 */
export function templateUseCount(
  templateId: string,
  summaries: readonly RelatorioSummary[],
  localRelatorios: readonly { id: string; template_id: string | null; removed_at?: string | null }[] = [],
): number {
  const ids = new Set<string>();
  for (const summary of summaries) if (summary.template_id === templateId) ids.add(summary.id);
  for (const row of localRelatorios) {
    if (row.template_id === templateId && (row.removed_at ?? null) === null) ids.add(row.id);
  }
  return ids.size;
}

/**
 * The name a duplicate gets: "⟨nome⟩ — cópia" (Story 3.3 AC), numbered "— cópia 2",
 * "— cópia 3"... when a live template already holds that name, so two copies of one
 * template can be told apart in the list.
 */
export function duplicateName(name: string, takenNames: readonly string[] = []): string {
  const base = `${name} — cópia`;
  const taken = new Set(takenNames);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/**
 * The row "Duplicar" creates: the source's structure, skeleton, quantities and
 * `BlockConfig` defaults under a new id and name, back at version 1, live and not
 * archived. No relatório data is involved (a template holds none).
 */
export function duplicateTemplate(row: TemplateRow, id: string, takenNames: readonly string[] = []): TemplateRow {
  const copy = JSON.parse(JSON.stringify(row)) as TemplateRow;
  return { ...copy, id, name: duplicateName(row.name, takenNames), version: 1, archived_at: null, removed_at: null };
}

/** The name "Novo template" gives the empty composition it creates. */
export const NEW_TEMPLATE_NAME = 'Novo template';

/** The row "Novo template" creates: an empty composition on the current seed. */
export function emptyTemplate(id: string, seedVersion: string): TemplateRow {
  return {
    id,
    name: NEW_TEMPLATE_NAME,
    version: 1,
    seed_version: seedVersion,
    blocks: [],
    skeleton: [],
    archived_at: null,
    removed_at: null,
  };
}
