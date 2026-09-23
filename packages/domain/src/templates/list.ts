import type { TemplateRow } from '../schemas/entities.ts';

/*
 * The Templates surface's derived text and order (AGENTS.md: counts and orders are the
 * kernel's). Story 3.2 lists only the live templates by name; the archived group, the
 * block count and the seed version line arrive with Story 3.3.
 */

/** `41-templates.html` `.section-head h2`: "Templates (2)". */
export function templatesHeading(count: number): string {
  return `Templates (${count})`;
}

/** The live templates, in pt-BR name order (removed ones never list). */
export function sortTemplates(rows: readonly TemplateRow[]): TemplateRow[] {
  return rows
    .filter((row) => row.removed_at === null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
