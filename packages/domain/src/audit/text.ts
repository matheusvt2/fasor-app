import { formatTimeOfDay } from '../format/datetime.ts';
import { isJobActive } from '../print/revisions.ts';
import type { AuditRunRow } from '../schemas/entities.ts';
import { plural } from '../text/plural.ts';
import type { AuditFindingKind, AuditTarget } from './schema.ts';

/*
 * Story 13.8 (AI-3): the audit as the device shows it. Every word derived from a run is
 * composed here (AD-2): the kind labels, the summary count, "Conferido às HH:MM" and which
 * run the Export dialog and the Sumário read. The static copy (the button, the note that the
 * pass is AI) is `apps/web/src/copy/pt-br.ts`'s.
 */

/** Seconds a running audit counts as running after its `started_at`: one Converse call (60 s) with room. pg-boss expires it then. */
export const AUDIT_RUN_EXPIRE_S = 300;

/** Seconds a queued audit waits for a worker before it no longer counts as running: pg-boss's retention of the queue. */
export const AUDIT_RUN_QUEUE_RETENTION_S = 900;

// authored: the kind of each finding, as its row names it (open for Matheus).
export const AUDIT_FINDING_KIND_LABELS: Readonly<Record<AuditFindingKind, string>> = {
  conclusion_vs_nc: 'Conclusão e itens NC',
  reading_out_of_family: 'Leitura fora do padrão',
  parecer_vs_restricoes: 'Parecer e restrições',
  caption_equipment: 'Legenda e equipamento',
};

/** A run that still counts as running: `isJobActive`'s rule with the audit queue's two ages. */
export function auditRunActive(run: Pick<AuditRunRow, 'status' | 'created_at' | 'started_at'>, nowIso: string): boolean {
  return isJobActive(run, nowIso, AUDIT_RUN_EXPIRE_S, AUDIT_RUN_QUEUE_RETENTION_S);
}

const newestFirst = (a: AuditRunRow, b: AuditRunRow) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1);

export interface AuditDisplay {
  /** The newest run, while it still counts as running: the button waits ("Conferindo…"). */
  active: AuditRunRow | null;
  /** The newest run failed, or stopped counting as running before it finished: "Não foi possível conferir agora". */
  failed: boolean;
  /** The newest finished run: its findings are the ones shown. */
  done: AuditRunRow | null;
}

/**
 * Which of a relatório's runs the device shows: the newest run's state (running, failed, or a
 * stale `queued`/`running` read as failed) and the newest finished run's findings. A new tap
 * supersedes the findings only once its run is done.
 */
export function auditDisplay(runs: readonly AuditRunRow[], nowIso: string): AuditDisplay {
  const sorted = [...runs].sort(newestFirst);
  const newest = sorted[0] ?? null;
  const active = newest !== null && auditRunActive(newest, nowIso) ? newest : null;
  const failed = newest !== null && active === null && newest.status !== 'done';
  const done = sorted.find((run) => run.status === 'done') ?? null;
  return { active, failed, done };
}

export interface AuditFindingRow {
  key: string;
  /** "Leitura fora do padrão". */
  kindLabel: string;
  /** What the finding names: "Chave seccionadora SEC-C01 · Fase A", "Seção 10 · Conclusão e parecer", "Imagem 3". */
  targetLabel: string;
  /** The model's sentence, as it came. */
  text: string;
  /** Where "Ver" goes. */
  target: AuditTarget;
}

/** The rows of a finished run, in the model's order; none for a run that is not done. */
export function auditFindingRows(run: AuditRunRow | null): AuditFindingRow[] {
  if (run === null || run.status !== 'done') return [];
  return run.findings.map((finding, index) => ({
    key: `${run.id}:${index}`,
    kindLabel: AUDIT_FINDING_KIND_LABELS[finding.kind],
    targetLabel: finding.label,
    text: finding.text,
    target: finding.target,
  }));
}

/** "Nenhum ponto encontrado", "1 ponto para conferir", "3 pontos para conferir"; '' for a run that is not done. */
export function auditSummaryText(run: AuditRunRow | null): string {
  if (run === null || run.status !== 'done') return '';
  const n = run.findings.length;
  // authored: a finished run with nothing to point at (open for Matheus).
  if (n === 0) return 'Nenhum ponto encontrado';
  return plural(n, 'ponto para conferir', 'pontos para conferir');
}

/** "Conferido às 14:32" (São Paulo time) of a finished run; '' without a finish time. */
export function auditCheckedAtText(run: AuditRunRow | null): string {
  const time = run === null || run.status !== 'done' ? '' : formatTimeOfDay(run.finished_at);
  return time === '' ? '' : `Conferido às ${time}`;
}
