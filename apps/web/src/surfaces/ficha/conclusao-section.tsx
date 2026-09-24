/**
 * The "Conclusão" step's host. Tracked stub: owner Epic 5 Batch C (Stories 5.8-5.9, the
 * Conclusion control, the generated conclusion text and "Não ensaiado"), `deferred-work.md`.
 * It renders nothing visible: only the step's anchor, which the stepper scrolls to and
 * "Concluir ficha" focuses while the step counts missing.
 */
export function ConclusaoSection() {
  return <section id="ficha-step-conclusao" className="ficha-step" data-step="conclusao" tabIndex={-1} />;
}
