import { normalizeRegistryName, sortClientRegistryRows, type ClientRow, type OpDraft, type ProjectRow } from '@app/domain';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Combobox, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { writeErrorText } from '../templates/template-ops.ts';

export interface NewProjectDialogProps {
  clients: readonly ClientRow[];
  projects: readonly ProjectRow[];
  onClose: () => void;
}

/**
 * Home › "Novo relatório" (Story 4.1): a relatório is born in a Project (one client, one
 * obra), so the dialog first asks for both through the client Combobox
 * `50-relatorio-setup.html` draws, with "Criar “⟨texto⟩”" last on each list. A new
 * client is the same `registry/client/{id}` create the Cadastros tab emits; a new obra is
 * one `project/{id}` create. Both work offline. "Continuar" opens the Project surface,
 * which opens its own "Novo relatório" dialog at once for a project born here.
 */
export function NewProjectDialog({ clients, projects, onClose }: NewProjectDialogProps) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const navigate = useNavigate();
  const t = copy.home.newProject;
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientText, setClientText] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectText, setProjectText] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const clientOptions = useMemo(() => sortClientRegistryRows(clients).map((row) => ({ id: row.id, label: row.name })), [clients]);
  const projectOptions = useMemo(
    () =>
      projects
        .filter((row) => row.client_id === clientId && row.removed_at === null)
        .sort((a, b) => (a.site ?? a.name).localeCompare(b.site ?? b.name, 'pt-BR'))
        .map((row) => ({ id: row.id, label: row.site ?? row.name })),
    [projects, clientId],
  );

  const author = (): Omit<OpDraft, 'kind' | 'path' | 'value'> | null =>
    user === null
      ? null
      : {
          scope: 'company',
          company_id: user.companyId,
          project_id: null,
          relatorio_id: null,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: user.id,
        };

  // The labels of rows created here: the live query lists them a tick after the commit,
  // and an input event in that tick must not read the missing option as a changed name.
  const createdLabels = useRef(new Map<string, string>());
  const labelOf = (options: readonly { id: string; label: string }[], id: string): string | undefined =>
    options.find((option) => option.id === id)?.label ?? createdLabels.current.get(id);

  function pickClient(id: string, label: string): void {
    setClientId(id);
    setClientText(label);
    setProjectId(null);
    setProjectText('');
  }

  async function createClient(name: string): Promise<void> {
    // A name typed like an existing client is that client, not a second registry row.
    const existing = clientOptions.find((option) => normalizeRegistryName(option.label) === normalizeRegistryName(name));
    if (existing !== undefined) {
      pickClient(existing.id, existing.label);
      return;
    }
    const base = author();
    if (db === null || base === null) return;
    const id = newId();
    const row: ClientRow = { id, kind: 'client', name, cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null };
    try {
      await commitBatch(db, [{ ...base, kind: 'create', path: `registry/client/${id}`, value: row as never }], { newId, now });
    } catch (error) {
      showToast(writeErrorText(error));
      return;
    }
    createdLabels.current.set(id, name);
    pickClient(id, name);
    showToast(t.clientCreated);
  }

  async function createProject(site: string): Promise<void> {
    // The same for an obra of this client, compared trimmed and case-insensitively.
    const wanted = site.trim().toLocaleLowerCase('pt-BR');
    const existing = projectOptions.find((option) => option.label.trim().toLocaleLowerCase('pt-BR') === wanted);
    if (existing !== undefined) {
      setProjectId(existing.id);
      setProjectText(existing.label);
      return;
    }
    const base = author();
    if (db === null || base === null || clientId === null) return;
    const id = newId();
    const row: ProjectRow = { id, client_id: clientId, name: site, site, removed_at: null };
    try {
      await commitBatch(db, [{ ...base, kind: 'create', path: `project/${id}`, value: row as never }], { newId, now });
    } catch (error) {
      showToast(writeErrorText(error));
      return;
    }
    createdLabels.current.set(id, site);
    setProjectId(id);
    setProjectText(site);
    setCreated(id);
  }

  const reason = clientId === null ? t.needsClient : projectId === null ? t.needsSite : undefined;

  function proceed(): void {
    if (projectId === null) return;
    onClose();
    // Only a project born here opens its "Novo relatório" dialog at once.
    void navigate(`/project/${projectId}`, created === projectId ? { state: { openNew: true } } : undefined);
  }

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.title}
    >
      <Combobox
        label={t.clientLabel}
        options={clientOptions}
        selectedKey={clientId}
        inputValue={clientText}
        onInputChange={(text) => {
          setClientText(text);
          const label = clientId === null ? undefined : labelOf(clientOptions, clientId);
          // A known label that differs is a new name; an unknown one is a row still landing.
          if (clientId !== null && label !== undefined && label !== text) {
            setClientId(null);
            setProjectId(null);
            setProjectText('');
          }
        }}
        onSelectionChange={(key) => {
          setClientId(key);
          setClientText(clientOptions.find((o) => o.id === key)?.label ?? clientText);
          setProjectId(null);
          setProjectText('');
        }}
        onCreate={(text) => void createClient(text)}
      />
      <Combobox
        label={t.siteLabel}
        options={projectOptions}
        selectedKey={projectId}
        inputValue={projectText}
        onInputChange={(text) => {
          setProjectText(text);
          const label = projectId === null ? undefined : labelOf(projectOptions, projectId);
          if (projectId !== null && label !== undefined && label !== text) setProjectId(null);
        }}
        onSelectionChange={(key) => {
          setProjectId(key);
          setProjectText(projectOptions.find((o) => o.id === key)?.label ?? projectText);
        }}
        onCreate={clientId === null ? undefined : (text) => void createProject(text)}
        isDisabled={clientId === null}
        disabledReason={clientId === null ? t.needsClient : undefined}
      />
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {t.cancel}
        </Button>
        <Button variant="primary" isDisabled={reason !== undefined} disabledReason={reason} onPress={proceed}>
          {t.continue}
        </Button>
      </div>
    </FormDialog>
  );
}
