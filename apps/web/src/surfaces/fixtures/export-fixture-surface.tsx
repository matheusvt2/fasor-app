import { statusLabel } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '../../components/index.ts';
import { useRelatorio } from '../../db/generate-store.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { ExportDialog } from '../export/export-dialog.tsx';

/*
 * DEV ONLY. The route that mounts this is guarded by `import.meta.env.DEV`, so the
 * surface is absent from a production build and nothing navigates to it.
 *
 * Story 4.8 ships the Export dialog before the Sumário (Story 4.3, another batch) that
 * will open it. This route mounts the dialog behind a "Gerar relatório" trigger of its
 * own, so the `@p0` e2e can drive generation as a person would, including the focus
 * return to the trigger on Esc. The Sumário replaces this trigger once it lands.
 */

export function ExportFixtureSurface() {
  const session = useSession();
  const sync = useSync();
  /** The relatório named by `?relatorio=`; without one, the small fixture's id (the "not on this device" note then shows). */
  const relatorioId = new URLSearchParams(useLocation().search).get('relatorio') ?? portoSeguroSmall.relatorioId;
  const relatorio = useRelatorio(session.database, relatorioId);
  const [open, setOpen] = useState(false);

  // AD-8: the relatório is pulled when opened on this device; ask once, like a real surface.
  const { syncRelatorio } = sync;
  useEffect(() => {
    void syncRelatorio(relatorioId);
  }, [syncRelatorio, relatorioId]);

  return (
    <main className="screen" data-route="/__fixture/export">
      <div className="content">
        <section className="section">
          <div className="section-head">
            <h2>Exportar (fixture)</h2>
          </div>
          <p className="section-note" data-testid="fixture-relatorio">
            {relatorio === null ? 'Relatório ainda não está neste aparelho.' : `Relatório neste aparelho · ${statusLabel(relatorio.status)}`}
          </p>
          <Button variant="primary" onPress={() => setOpen(true)}>
            Gerar relatório
          </Button>
        </section>
        <ExportDialog relatorioId={relatorioId} isOpen={open} onOpenChange={setOpen} />
      </div>
    </main>
  );
}
