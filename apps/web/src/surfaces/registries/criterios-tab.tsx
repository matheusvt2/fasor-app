import { formatCriterionValue, SEEDED_CRITERIA } from '@app/domain';
import { copy } from '../../copy/pt-br.ts';

/**
 * Critérios de aceitação (Story 2.6): a read-only table sourced straight from
 * `SEEDED_CRITERIA` (NFR-14 — no criterion number outside the seed module, no Dexie
 * query, no `registry/criterion` op) — columns test sub-block type · criterion
 * (`.cell-crit`) · source (`.cell-dim`) · used by (Code Map, Design Notes).
 */
export function CriteriosTab() {
  const t = copy.registries.criterios;
  return (
    <div className="registry-main is-narrow">
      <p className="section-note">{t.note}</p>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{t.columnSubBlock}</th>
            <th scope="col">{t.columnCriterion}</th>
            <th scope="col">{t.columnSource}</th>
            <th scope="col">{t.columnUsedBy}</th>
          </tr>
        </thead>
        <tbody>
          {SEEDED_CRITERIA.map((criterion) => (
            <tr key={criterion.key}>
              <td data-label={t.columnSubBlock}>{criterion.label}</td>
              <td className="cell-crit" data-label={t.columnCriterion}>
                {formatCriterionValue(criterion)}
              </td>
              <td className="cell-dim" data-label={t.columnSource}>
                {criterion.source.name}
              </td>
              <td className="cell-dim" data-label={t.columnUsedBy}>
                {criterion.usedBy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
