import { clientRegistryRowText, isClientReferenced, sortClientRegistryRows, type ClientRow, type ProjectRow } from '@app/domain';
import { useMemo, useState } from 'react';
import { Button } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { newId } from '../../ids.ts';
import { clientRows, projectRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { useSession } from '../../state/session.tsx';
import { ClientPanel } from './client-panel.tsx';

const NO_CLIENTS: ClientRow[] = [];
const NO_PROJECTS: ProjectRow[] = [];

interface ClientRowItemProps {
  client: ClientRow;
  isOpen: boolean;
  onOpen: () => void;
}

/** One `.registry-row` of the Clientes list (`80-cadastros.html` L200-215). */
function ClientRowItem({ client, isOpen, onOpen }: ClientRowItemProps) {
  const text = clientRegistryRowText(client);
  return (
    <li
      className="registry-row"
      tabIndex={0}
      role="button"
      aria-pressed={isOpen}
      aria-label={`${text.primary}, ${text.secondary}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="rr-text">
        <span className="rr-primary">{text.primary}</span>
        <span className="rr-secondary">{text.secondary}</span>
      </div>
      <svg className="ico rr-chevron" aria-hidden="true">
        <use href="/sprite.svg#i-chev-right" />
      </svg>
    </li>
  );
}

/**
 * Clientes (`80-cadastros.html` frame, Story 2.4): the registry list, alphabetical
 * (`sortClientRegistryRows`), and the persistent edit panel — the same shape Story 2.1's
 * Instrumentos tab established. Opening "Novo cliente" mints an id locally; nothing is
 * written until the first field commits (`ClientPanel`'s create-on-first-field rule).
 */
export function ClientesTab() {
  const session = useSession();
  const db = session.database;
  const [openId, setOpenId] = useState<string | null>(null);
  const t = copy.registries.clientes;

  const clients = useLiveQuery(() => (db === null ? Promise.resolve(NO_CLIENTS) : clientRows(db)), [db], NO_CLIENTS);
  const projects = useLiveQuery(() => (db === null ? Promise.resolve(NO_PROJECTS) : projectRows(db)), [db], NO_PROJECTS);

  const sorted = useMemo(() => sortClientRegistryRows(clients), [clients]);
  const openClient = useMemo(() => clients.find((row) => row.id === openId) ?? null, [clients, openId]);
  const referenced = openId === null ? false : isClientReferenced(openId, projects);

  return (
    <div className="registry-layout">
      <div className="registry-main">
        {sorted.length === 0 ? null : (
          <div className="registry-toolbar">
            <Button onPress={() => setOpenId(newId())}>{t.newClient}</Button>
          </div>
        )}
        <p className="section-note">{t.note}</p>

        {sorted.length === 0 ? (
          // One action only on an empty registry (Epic 2 retro D-8): the empty state's.
          <div className="home-empty">
            <p className="section-note">{t.emptyText}</p>
            <Button onPress={() => setOpenId(newId())}>{t.empty}</Button>
          </div>
        ) : (
          <ul className="registry-list" aria-label={copy.registries.tabClientes}>
            {sorted.map((client) => (
              <ClientRowItem key={client.id} client={client} isOpen={client.id === openId} onOpen={() => setOpenId(client.id)} />
            ))}
          </ul>
        )}
      </div>

      {openId === null ? null : (
        <ClientPanel key={openId} clientId={openId} client={openClient} referenced={referenced} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
