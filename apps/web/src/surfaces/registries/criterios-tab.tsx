import { criteriaTablesView, formatCriterionValue, SEEDED_CRITERIA, seededCriterionAppliesText, type CriteriaTableView } from '@app/domain';
import { useId } from 'react';
import { copy } from '../../copy/pt-br.ts';

/**
 * Critérios de aceitação (Story 2.6): a read-only table sourced straight from
 * `SEEDED_CRITERIA` (NFR-14 — no criterion number outside the seed module, no Dexie
 * query, no `registry/criterion` op) — columns test sub-block type · criterion
 * (`.cell-crit`) · source (`.cell-dim`) · used by (Code Map, Design Notes).
 *
 * Story 27.6 (F10): each seeded row says when it applies, and the two ANSI/NETA tables the fichas
 * judge insulation by follow, one `data-table` each under its `section-head` (`80-cadastros.html`
 * `#cad-panel-criterios`), every row, number and sentence the kernel's (`criteriaTablesView`).
 */
export function CriteriosTab() {
  const t = copy.registries.criterios;
  const tables = criteriaTablesView();
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
                <div className="helper" data-applies="">
                  {seededCriterionAppliesText(criterion)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tables.map((table) => (
        <CriteriaTable key={table.key} table={table} />
      ))}
    </div>
  );
}

function CriteriaTable({ table }: { table: CriteriaTableView }) {
  const t = copy.registries.criterios;
  const headingId = useId();
  return (
    <section className="section" aria-labelledby={headingId} data-criteria-table={table.key}>
      <div className="section-head">
        <h2 id={headingId}>{table.title}</h2>
      </div>
      <p className="section-note" data-applies="">
        {table.appliesText}
      </p>
      <table className="data-table" aria-labelledby={headingId}>
        <thead>
          <tr>
            <th scope="col">{t.columnRated}</th>
            <th scope="col">{t.columnTestVoltage}</th>
            {table.columns.map((column) => (
              <th scope="col" key={column}>
                {t.columnMinimum[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.ratedText}>
              <td className="tabular" data-label={t.columnRated}>
                {row.ratedText}
              </td>
              <td className="cell-dim tabular" data-label={t.columnTestVoltage}>
                {row.testVoltageText}
              </td>
              {row.minimums.map((minimum, i) => (
                <td className="cell-crit tabular" data-label={t.columnMinimum[table.columns[i]!]} key={table.columns[i]}>
                  {minimum}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
