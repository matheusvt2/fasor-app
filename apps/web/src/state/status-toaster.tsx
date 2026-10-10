import { latestRevision, statusChangeToastText } from '@app/domain';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { revisionRows } from '../db/generate-store.ts';
import { onStatusChange } from '../db/status-changes.ts';
import { useSession } from './session.tsx';
import { useToast } from './toast.tsx';

/*
 * Status flow 2026-10-10 (M3): every status change this device writes is said, on whatever
 * surface the user is. The commit path publishes each change (`db/status-changes.ts`); this
 * component, mounted once inside the session's providers beside `GenerateWatcher`, reads the
 * newest revision's number and raises the kernel's sentence (`statusChangeToastText`) as a
 * status toast, which waits behind a live undo toast instead of dropping it (`toast.tsx`).
 * Only the changes this device writes are said, and only of the relatório whose route is open.
 */

/** The relatório whose route is open (`/relatorio/:id` and everything under it), or null. */
export function openRelatorioId(pathname: string): string | null {
  return /^\/relatorio\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/** Mounted once inside the session's providers and the router (`app.tsx`); renders nothing. */
export function StatusToaster() {
  const db = useSession().database;
  const { showToast, withdrawToast } = useToast();
  // The route as it is when a change is published, not when the listener was attached.
  const { pathname } = useLocation();
  const open = useRef<string | null>(null);
  open.current = openRelatorioId(pathname);
  useEffect(() => {
    if (db === null) return;
    // One change is said after the other, in commit order, whatever each read takes.
    let chain: Promise<void> = Promise.resolve();
    /** The sentence last raised per relatório: a newer change of it takes the older one away, said or still waiting. */
    const last = new Map<string, string>();
    return onStatusChange((change) => {
      // Only the relatório on screen is spoken of: an equipment renamed here can reopen another
      // relatório of the obra (its TAG is the project's), and "Relatório reaberto" would read as
      // this one's. That other change stays silent, as every status change did before.
      if (open.current !== change.relatorioId) return;
      const say = async () => {
        const revisions = await revisionRows(db, change.relatorioId).catch(() => []);
        const text = statusChangeToastText({ from: change.from, to: change.to, cause: change.cause, latestNumber: latestRevision(revisions)?.number ?? null });
        if (text === null) return;
        const earlier = last.get(change.relatorioId);
        // "Relatório em campo" still waiting behind an undo toast must not show after that undo
        // put Rascunho back: only the newest status of a relatório is said.
        if (earlier !== undefined && earlier !== text) withdrawToast(earlier);
        last.set(change.relatorioId, text);
        // An edit's status toast arrives beside what the user is doing: passive. One that answers
        // the user's own press ("Concluir", mark as sent, a backward move, an undo) is an ordinary toast.
        showToast(text, { status: true, ...(change.cause === 'edit' ? { passive: true } : {}) });
      };
      // A step that throws is reported and the chain goes on: the next change is still said.
      chain = chain.then(say).catch((error: unknown) => console.error('status toast failed', error));
    });
  }, [db, showToast, withdrawToast]);
  return null;
}
