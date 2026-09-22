import { PRODUTO } from '@app/domain';
import { useId } from 'react';
import { Button } from '../components/index.ts';
import { copy } from '../copy/pt-br.ts';

/**
 * The full-screen state a pull's `426 contract_outdated` puts the app in (AD-13,
 * AR-12): rendered instead of the shell, like `Booting`. Pushes keep running behind
 * it, so nothing done on the device is lost; only receiving stops until the page
 * reloads into the new bundle. There is no mock; the copy is authored.
 */
export function ContractOutdatedSurface() {
  const titleId = useId();
  return (
    <main className="screen" data-route="/outdated">
      <div className="content">
        <section className="section" aria-labelledby={titleId}>
          <div className="section-head">
            <h1 id={titleId}>{copy.outdated.title}</h1>
          </div>
          <p className="t-body">{copy.outdated.body(PRODUTO)}</p>
          <p style={{ marginTop: 'var(--sp-5)' }}>
            <Button onPress={() => window.location.reload()}>{copy.outdated.action}</Button>
          </p>
        </section>
      </div>
    </main>
  );
}
