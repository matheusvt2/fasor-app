import type { RelatorioStatus, StatusChangeCause } from '@app/domain';

/*
 * Status flow 2026-10-10 (M3): every status change this device writes is said. The commit
 * path (`commit.ts`) is the one place every `relatorio/status` op of this device passes,
 * the ones the edit emitter appends (`advanceOnEdit`) and the ones a surface asks for
 * ("Concluir", a generate, "Marcar como enviado ao cliente", a backward move), so it
 * publishes each change here once its transaction has committed, and the shell's
 * `StatusToaster` turns it into the kernel's toast. No surface raises a status toast itself.
 */

export interface CommittedStatusChange {
  relatorioId: string;
  from: RelatorioStatus;
  to: RelatorioStatus;
  /** `edit`: `advanceOnEdit` appended the op to an edit's batch; `action`: the caller wrote it; `undo`: "Desfazer" put it back. */
  cause: StatusChangeCause;
}

type Listener = (change: CommittedStatusChange) => void;

const listeners = new Set<Listener>();

/** Subscribes to the status changes this device commits; returns the unsubscribe. */
export function onStatusChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by `commit.ts` after the transaction committed; a listener's failure never reaches the write. */
export function publishStatusChanges(changes: readonly CommittedStatusChange[]): void {
  for (const change of changes) {
    if (change.from === change.to) continue;
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('status change listener failed', error);
      }
    }
  }
}
