import { auditCheckedAtText, auditFindingRows, auditSummaryText, type AuditFindingRow, type AuditRunRow, type AuditTarget } from '@app/domain';
import { TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import './export.css';

export interface AuditFindingsProps {
  /** The newest finished run (the kernel's `auditDisplay(...).done`), or null: nothing to list. */
  run: AuditRunRow | null;
  /** A finding's "Ver": where its target is (a Sumário row, a sheet, the gallery); absent, no "Ver". */
  onSee?: ((target: AuditTarget) => void) | undefined;
}

/**
 * Story 13.8 (AI-3): the emission audit's findings as information rows, shared by the Export
 * dialog and the Sumário. The `.precheck` list markup of `73-exportar.html` (`pc-text`,
 * `pc-meta`, `pc-actions` with a text button): each row is the model's sentence, then its
 * kind and what it names, then "Ver". Nothing here writes: a finding is never an op, a count
 * or a status. The mock has no findings class of its own (open question for DESIGN.md).
 */
export function AuditFindings({ run, onSee }: AuditFindingsProps) {
  if (run === null) return null;
  const rows = auditFindingRows(run);
  const checkedAt = auditCheckedAtText(run);
  return (
    <div className="audit-findings">
      <p className="pc-meta audit-summary">
        <span>{auditSummaryText(run)}</span>
        {checkedAt === '' ? null : <span className="audit-checked-at">{checkedAt}</span>}
      </p>
      {rows.length === 0 ? null : (
        <ul className="precheck" aria-label={copy.audit.listLabel}>
          {rows.map((row) => (
            <FindingRow key={row.key} row={row} onSee={onSee} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FindingRow({ row, onSee }: { row: AuditFindingRow; onSee: ((target: AuditTarget) => void) | undefined }) {
  return (
    <li data-kind={row.target.kind}>
      <span className="pc-text">
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
