import { auditCheckedAtText, auditCoverageText, auditFindingRows, auditSummaryText, type AuditFindingRow, type AuditRunRow, type AuditTarget } from '@app/domain';
import { TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import './export.css';

export interface AuditFindingsProps {
  /** The newest finished run (the kernel's `auditDisplay(...).done`), or null: nothing to list. */
  run: AuditRunRow | null;
  /** A finding's "Ver": where its target is (a Sumário row, a sheet, the gallery); absent, no "Ver". */
  onSee?: ((target: AuditTarget) => void) | undefined;
  /**
   * Story 25.24: the kernel's fixed rules (`auditRuleRows`), always current, listed first and marked
   * "Regra", with or without a run. Absent (the Sumário), none.
   */
  rules?: readonly AuditFindingRow[] | undefined;
  /** Story 25.24: the run is out of date (`auditRunStale`): the mark over its findings, which stay readable, dimmed. */
  stale?: boolean | undefined;
  /** Story 25.24: the mark's "Conferir de novo" (a tap; the check never runs by itself); absent, no action. */
  onRunAgain?: (() => void) | undefined;
  /** Why "Conferir de novo" waits (offline, a run in flight); undefined while it can run. */
  runAgainDisabledReason?: string | undefined;
}

/**
 * Story 13.8 (AI-3): the emission audit's findings as information rows, shared by the Export
 * dialog and the Sumário. The `.precheck` list markup of `73-exportar.html` (`pc-text`,
 * `pc-meta`, `pc-actions` with a text button): each row is the model's sentence, then its
 * kind and what it names, then "Ver". Nothing here writes: a finding is never an op, a count
 * or a status. The mock has no findings class of its own (open question for DESIGN.md).
 *
 * Story 25.24 (`73-exportar.html`, the Conferência por IA frame): an out-of-date run carries the
 * warning Banner "Conferência desatualizada: …" with "Conferir de novo" (`.e25-audit-stale`) and its
 * findings at 72 % opacity (`.e25-audit-old`); a fixed rule's row starts with the outlined "Regra"
 * pill (`.e25-rule-word`) and is never dimmed (DESIGN.md: the old findings are the dimmed ones).
 */
export function AuditFindings({ run, onSee, rules = [], stale = false, onRunAgain, runAgainDisabledReason }: AuditFindingsProps) {
  if (run === null && rules.length === 0) return null;
  const rows = auditFindingRows(run);
  const checkedAt = auditCheckedAtText(run);
  // Story 14.10 lane B: how many sheets the model read ("Conferidas 2 de 76 fichas"); none for a run older than contract 20.
  const coverage = auditCoverageText(run);
  const summary = auditSummaryText(run, rules.length);
  const marked = stale && run !== null;
  return (
    <div className="audit-findings">
      {marked ? (
        <div className="banner e25-audit-stale" data-variant="warning" role="status">
          <span className="banner-text">{copy.audit.staleMark}</span>
          {onRunAgain === undefined ? null : (
            <span className="banner-actions">
              <TextButton isDisabled={runAgainDisabledReason !== undefined} disabledReason={runAgainDisabledReason} onPress={onRunAgain}>
                {copy.audit.runAgain}
              </TextButton>
            </span>
          )}
        </div>
      ) : null}
      {summary === '' ? null : (
        <p className="pc-meta audit-summary">
          <span>{summary}</span>
          {coverage === '' ? null : <span className="audit-coverage">{coverage}</span>}
          {checkedAt === '' ? null : <span className="audit-checked-at">{checkedAt}</span>}
        </p>
      )}
      {rows.length === 0 && rules.length === 0 ? null : (
        <ul className="precheck" aria-label={copy.audit.listLabel}>
          {rules.map((row) => (
            <FindingRow key={row.key} row={row} onSee={onSee} old={false} />
          ))}
          {rows.map((row) => (
            <FindingRow key={row.key} row={row} onSee={onSee} old={marked} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingRow({ row, onSee, old }: { row: AuditFindingRow; onSee: ((target: AuditTarget) => void) | undefined; old: boolean }) {
  return (
    <li data-kind={row.target.kind} data-rule={row.rule === true ? 'true' : undefined} className={old ? 'e25-audit-old' : undefined}>
      <span className="pc-text">
        {row.rule === true ? <span className="e25-rule-word">{copy.audit.ruleWord}</span> : null}
        {row.text}
        <span className="pc-meta">
          {' — '}
          {row.kindLabel}
          {' · '}
          {row.targetLabel}
        </span>
      </span>
      {onSee === undefined ? null : (
        <span className="pc-actions">
          <TextButton aria-label={copy.audit.seeLabel(row.targetLabel)} onPress={() => onSee(row.target)}>
            {copy.audit.see}
          </TextButton>
        </span>
      )}
    </li>
  );
}
