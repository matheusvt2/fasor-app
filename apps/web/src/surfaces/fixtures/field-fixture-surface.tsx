import { makeOp } from '@app/domain';
import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { now } from '../../clock.ts';
import { commitOps } from '../../db/commit.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useDraftSource } from '../../state/drafts.tsx';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';

/*
 * DEV ONLY. The route that mounts this is guarded by `import.meta.env.DEV`, so the
 * surface is absent from a production build and nothing navigates to it.
 *
 * FR-54's first scenario is "the tab closed mid-sheet", and no sheet, dialog or field
 * surface exists before Epic 5. Rather than invent product scope this story does not
 * own, the three durability scenarios drive the machinery they are actually about: one
 * input on the `createFieldCommitter` -> `commitOps` path, registered as a draft source.
 * Epic 5 replaces this with real surfaces by registering their own sources; nothing in
 * `src/state/drafts.tsx` or `src/db/drafts.ts` changes when it does.
 */

const SURFACE = 'fixture-field';
/** A fixed id, so a reopened tab addresses the same draft key and the same op path. */
export const FIXTURE_RELATORIO_ID = '019966b0-0808-7000-8000-0000000000f1';
const FIELD = 'local';

export function FieldFixtureSurface() {
  const session = useSession();
  const sync = useSync();
  const db = session.database;
  const [text, setText] = useState('');
  const [committed, setCommitted] = useState('');
  // Read by the draft source at tab-hide time, outside any render.
  const textRef = useRef('');
  const committedRef = useRef('');
  textRef.current = text;
  committedRef.current = committed;

  const commit = useCallback(
    async (value: string) => {
      const user = session.user;
      if (db === null || user === null) return;
      const op = makeOp(
        {
          kind: 'put',
          scope: 'relatorio',
          company_id: user.companyId,
          project_id: null,
          relatorio_id: FIXTURE_RELATORIO_ID,
          path: `relatorio/setup/${FIELD}`,
          value,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: user.id,
          device_id: sync.deviceId ?? user.id,
        },
        { newId, now: now() },
      );
      await commitOps(db, [op]);
      setCommitted(value);
    },
    [db, session.user, sync.deviceId],
  );

  // `?idle=` overrides the 500 ms field-commit timer. A draft is text that has *not*
  // been committed, and a durability test that had to hide the tab inside 500 ms would
  // be measuring the machine, not the behaviour.
  const idleMs = Number(new URLSearchParams(useLocation().search).get('idle'));
  const committer = useFieldCommit<string>({
    commit,
    ...(Number.isFinite(idleMs) && idleMs > 0 ? { idleMs } : {}),
  });

  // What the tab-hide listener persists: the typed text while it differs from the last
  // value the outbox accepted, and null once they agree (nothing is uncommitted then).
  useDraftSource({
    surface: SURFACE,
    entityId: FIXTURE_RELATORIO_ID,
    field: FIELD,
    read: () => (textRef.current === committedRef.current ? null : textRef.current),
    apply: (value) => {
      const recovered = typeof value === 'string' ? value : String(value);
      setText(recovered);
      committer.immediate(recovered);
    },
  });

  return (
    <main className="screen" data-route="/__fixture/field">
      <div className="content">
        <section className="section">
          <div className="section-head">
            <h2>Campo de teste</h2>
          </div>
          <label className="field">
            <span className="field-label">Local</span>
            <input
              className="input"
              data-testid="fixture-input"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                committer.change(event.target.value);
              }}
              onBlur={() => committer.blur()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') committer.enter();
              }}
            />
          </label>
          <p className="section-note" data-testid="fixture-committed">
            {committed}
          </p>
        </section>
      </div>
    </main>
  );
}
