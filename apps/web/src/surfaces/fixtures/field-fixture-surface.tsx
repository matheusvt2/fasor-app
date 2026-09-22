import { useCallback, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Checkbox, FilterChipGroup, Toggle } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { newId } from '../../ids.ts';
import { useFieldCommit } from '../../input/use-field-commit.ts';
import { useDraftSource } from '../../state/drafts.tsx';
import { useSession } from '../../state/session.tsx';

/*
 * DEV ONLY. The route that mounts this is guarded by `import.meta.env.DEV`, so the
 * surface is absent from a production build and nothing navigates to it.
 *
 * FR-54's first scenario is "the tab closed mid-sheet", and no sheet, dialog or field
 * surface exists before Epic 5. Rather than invent product scope this story does not
 * own, the three durability scenarios drive the machinery they are actually about: one
 * input on the `createFieldCommitter` -> `commitBatch` path, registered as a draft source.
 * Epic 5 replaces this with real surfaces by registering their own sources; nothing in
 * `src/state/drafts.tsx` or `src/db/drafts.ts` changes when it does.
 */

const SURFACE = 'fixture-field';
/** A fixed id, so a reopened tab addresses the same draft key and the same op path. */
export const FIXTURE_RELATORIO_ID = '019966b0-0808-7000-8000-0000000000f1';
const FIELD = 'local';

export function FieldFixtureSurface() {
  const session = useSession();
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
      // `commitBatch` stamps this device's minted id on the op (AD-3).
      await commitBatch(
        db,
        [
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
          },
        ],
        { newId, now },
      );
      setCommitted(value);
    },
    [db, session.user],
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
        <OnStateSection />
      </div>
    </main>
  );
}

/**
 * Toggle, Checkbox and a grouped filter chip, one on and one off each, so the on states
 * of `components.css` (and the chip alias in `app.css`) can be checked in a real browser
 * before a product surface renders them (retro F-SPEC-6). Dev-only, like the rest of this
 * route.
 */
function OnStateSection() {
  const [toggleOn, setToggleOn] = useState(true);
  const [toggleOff, setToggleOff] = useState(false);
  const [checkOn, setCheckOn] = useState(true);
  const [checkOff, setCheckOff] = useState(false);
  const [chip, setChip] = useState('a');
  return (
    <section className="section" data-testid="fixture-on-states">
      <div className="section-head">
        <h2>Estados ligados</h2>
      </div>
      <div className="stack">
        <Toggle isSelected={toggleOn} onChange={setToggleOn} aria-label="Alternador ligado" />
        <Toggle isSelected={toggleOff} onChange={setToggleOff} aria-label="Alternador desligado" />
        <Checkbox isSelected={checkOn} onChange={setCheckOn}>
          Caixa marcada
        </Checkbox>
        <Checkbox isSelected={checkOff} onChange={setCheckOff}>
          Caixa desmarcada
        </Checkbox>
        <FilterChipGroup
          options={[
            { id: 'a', label: 'Opção A' },
            { id: 'b', label: 'Opção B' },
          ]}
          selectedId={chip}
          onChange={setChip}
          aria-label="Filtro de teste"
        />
      </div>
    </section>
  );
}
