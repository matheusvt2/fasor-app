import { AUDIT_FINDING_KINDS } from '@app/domain';

/*
 * Story 13.8 (AI-3): the audit's prompt and tool, versioned together. The model reads the
 * assembled relatório (`auditInput`) and points at contradictions, one pt-BR sentence each,
 * citing one of the refs written in the text. It never edits the relatório: it is asked only
 * to point, and the server keeps a finding only as information (`validateAuditFindings`).
 * Bump `AUDIT_PROMPT_VERSION` with every change of the system text, the request text or the
 * tool schema; the run row and the log line carry it.
 */

export const AUDIT_PROMPT_VERSION = 'audit-1';

export const AUDIT_TOOL = 'record_findings';

/** The longest answer: twenty findings of one sentence each fit with room. */
export const AUDIT_MAX_TOKENS = 2000;

/** What each kind means, as the prompt names it (in the order of `AUDIT_FINDING_KINDS`). */
export const AUDIT_KIND_RULES: Readonly<Record<(typeof AUDIT_FINDING_KINDS)[number], string>> = {
  conclusion_vs_nc: 'a sheet whose CONCLUSÃO (APROVADO or REPROVADO, SEM or COM RESTRIÇÕES, and its text) disagrees with its checklist items marked NC',
  reading_out_of_family: 'a reading far out of family against the same reading on the other phases or units of the same equipment type, with no mark or observation explaining it',
  parecer_vs_restricoes: 'a PARECER (APTO, APTO COM RESTRIÇÕES, NÃO APTO) or its text that disagrees with the restrições the sheets and the points of attention carry',
  caption_equipment: 'a photo caption (an "Imagem N" line) that names an equipment the relatório does not carry',
};

export const AUDIT_SYSTEM = [
  'You check the assembled technical report of an inspection of a medium-voltage electrical substation in Brazil before it is issued.',
  'You only point at contradictions for the engineer to check. The engineer decides; the report is never changed from your answer.',
  `Call the ${AUDIT_TOOL} tool exactly once.`,
  'Report only these four kinds of finding:',
  ...AUDIT_FINDING_KINDS.map((kind) => `- ${kind}: ${AUDIT_KIND_RULES[kind]}.`),
  'Each line the report lets you point at starts with a ref in square brackets, like [sheet:...], [row:...], [section:...] or [photo:...].',
  'For each finding give its kind, exactly one ref copied from those brackets (the most specific one: the row, else the sheet, else the section or the photo), and one short sentence in Brazilian Portuguese (pt-BR) saying what disagrees with what.',
  'Rules: cite only refs written in the report; never invent a ref, a value, an equipment or a reading; point at what disagrees and say nothing else.',
  'When nothing disagrees, give an empty list.',
].join('\n');

/** The request text: the report as assembled, nothing else. */
export function auditPrompt(text: string): string {
  return `The report:\n\n${text}`;
}

type JsonSchema = Record<string, unknown>;

/** The tool's input: `{findings: [{kind, ref, text}]}`; the ref set is checked server side, not by an enum (it can hold thousands). */
export const AUDIT_TOOL_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      description: 'One entry per contradiction found; an empty list when there is none.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...AUDIT_FINDING_KINDS] },
          ref: { type: 'string', description: 'One ref exactly as written between square brackets in the report, without the brackets.' },
          text: { type: 'string', minLength: 1, description: 'One short sentence in Brazilian Portuguese saying what disagrees with what.' },
        },
        required: ['kind', 'ref', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};

export const AUDIT_TOOL_DESCRIPTION = 'Records the contradictions found in the report, each with its kind, the ref it points at and one sentence.';
