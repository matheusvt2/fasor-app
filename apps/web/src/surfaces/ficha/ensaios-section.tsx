/**
 * The "Ensaios" step's host. Tracked stub: owner Epic 5 Batch B (Stories 5.5-5.7, the
 * Measurement table, the continuous run and the Instrument picker), `deferred-work.md`.
 * It renders nothing visible: only the step's anchor, which the stepper scrolls to and
 * "Concluir ficha" focuses while the step counts missing.
 */
export function EnsaiosSection() {
  return <section id="ficha-step-ensaios" className="ficha-step" data-step="ensaios" tabIndex={-1} />;
}
