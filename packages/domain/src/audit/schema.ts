import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';

/*
 * Story 13.8 (AI-3): the shapes of the emission audit, read by the entity registry
 * (`schemas/entities.ts`, the `audit_run` row) and by the audit modules beside this one. Kept
 * free of any other kernel import so the registry can load it first.
 */

/**
 * The four contradictions the audit points at, and nothing else:
 * - `conclusion_vs_nc`: a sheet's conclusion that disagrees with its NC items;
 * - `reading_out_of_family`: a reading far out of family across phases or units, with no mark;
 * - `parecer_vs_restricoes`: a parecer that disagrees with the restrições it summarizes;
 * - `caption_equipment`: a photo caption naming an equipment the relatório does not carry.
 */
export const AUDIT_FINDING_KINDS = ['conclusion_vs_nc', 'reading_out_of_family', 'parecer_vs_restricoes', 'caption_equipment'] as const;
export type AuditFindingKind = (typeof AUDIT_FINDING_KINDS)[number];

/**
 * Where a finding's "Ver" goes: a Sumário row (a section), a sheet (a sheet or one of its
 * rows: no in-sheet row anchor exists, so a row opens its sheet) or the photo gallery.
 * `rowKey` is a `SumarioRowKey` of a section (`section_10`), checked by shape here.
 */
export const auditTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), rowKey: z.string().regex(/^(capa|controle|section_([1-9]|1[01]))$/) }),
  z.object({ kind: z.literal('sheet'), blockId: uuidV7Schema }),
  z.object({ kind: z.literal('photos') }),
]);
export type AuditTarget = z.infer<typeof auditTargetSchema>;

/** One kept finding as the `audit_run` row stores it: the model's kind and sentence, the ref it cited, resolved by the kernel. */
export const auditFindingSchema = z.object({
  kind: z.enum(AUDIT_FINDING_KINDS),
  /** The one sentence the model wrote (pt-BR), trimmed. */
  text: z.string().min(1),
  /** The ref it cited, one of those it was sent (`sheet:<id>`, `row:<id>:<part>:<row>`, `section:<n>`, `photo:<id>`). */
  ref: z.string().min(1),
  /** The kernel's name of what the ref points at ("Seção 10 · Conclusão e parecer"). */
  label: z.string().min(1),
  target: auditTargetSchema,
});
export type AuditFinding = z.infer<typeof auditFindingSchema>;

export const AUDIT_RUN_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type AuditRunStatus = (typeof AUDIT_RUN_STATUSES)[number];
