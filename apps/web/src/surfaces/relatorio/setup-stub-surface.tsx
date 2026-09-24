import { Link, useParams, useSearchParams } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import './relatorio.css';

/**
 * `/relatorio/:id/setup?etapa=n` (Story 4.2, batch C): the Sumário's cover row and rows 1
 * and 3 open here. This batch only holds the route and the `?etapa=` parameter; Story 4.2
 * replaces the file and keeps both.
 *
 * Tracked stub, owner batch C (`deferred-work.md`).
 */
export function SetupStubSurface() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const etapa = Number.parseInt(search.get('etapa') ?? '1', 10);
  return (
    <main className="screen" data-route="/relatorio/:id/setup">
      <div className="content">
        <h2 className="visually-hidden">{copy.setupStub.title}</h2>
        <p className="section-note" data-testid="setup-stub-note">
          {copy.setupStub.note(Number.isNaN(etapa) ? 1 : etapa)}
        </p>
        <Link to={`/relatorio/${id}`}>{copy.setupStub.backToSumario}</Link>
      </div>
    </main>
  );
}
