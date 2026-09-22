import { useId } from 'react';
import { copy } from '../../copy/pt-br.ts';

/**
 * Placeholder Home behind the session guard. Story 1.6 replaces it with the status
 * board and the relatório cards; it exists here only so a signed-in session has
 * somewhere to land.
 */
export function HomeSurface() {
  const titleId = useId();
  return (
    <main className="screen">
      <div className="content">
        <section className="section" aria-labelledby={titleId}>
          <div className="section-head">
            <h1 id={titleId}>{copy.home.title}</h1>
          </div>
          <p className="section-note">{copy.home.placeholder}</p>
        </section>
      </div>
    </main>
  );
}
