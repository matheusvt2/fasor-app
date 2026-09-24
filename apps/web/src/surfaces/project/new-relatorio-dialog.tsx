import {
  defaultTemplateFor,
  endBeforeStart,
  instantiateTemplate,
  newRelatorioReason,
  newRelatorioSubject,
  pickableTemplates,
  templateBlocksText,
  templateBlockTotal,
  templateHelperText,
  type ClientRow,
  type ProjectRow,
  type RelatorioRow,
  type TemplateRow,
} from '@app/domain';
import { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Combobox, DateField, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { now } from '../../clock.ts';
import { commitBatch } from '../../db/commit.ts';
import { equipmentRows } from '../../db/home-store.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { writeErrorText } from '../templates/template-ops.ts';

export interface NewRelatorioDialogProps {
  project: ProjectRow;
  client: ClientRow | null;
  /** The project's relatórios, so the last used template is preselected. */
  relatorios: readonly RelatorioRow[];
  templates: readonly TemplateRow[];
  onClose: () => void;
}

/**
 * The "Novo relatório" Form dialog (`30-project.html` `#proj-dlg-novo`, Story 4.1): the
 * one report type preselected, the template (the project's last used one, or the only
 * pickable one), the two dates with the end following the start, and "Criar relatório",
 * disabled with its reason until a template and a start exist. Criar is ONE batch of
 * every create `instantiateTemplate` produces (FR-13, AR-5), then the Sumário opens.
 */
export function NewRelatorioDialog({ project, client, relatorios, templates, onClose }: NewRelatorioDialogProps) {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const { showToast } = useToast();
  const navigate = useNavigate();
  const t = copy.newRelatorio;
  const descriptionId = useId();
  const typeLabelId = useId();
  const typeNoteId = useId();
  const helperId = useId();

  const pickable = useMemo(() => pickableTemplates(templates), [templates]);
  const options = useMemo(() => pickable.map((row) => ({ id: row.id, label: row.name, meta: templateBlocksText(templateBlockTotal(row)) })), [pickable]);
  const [templateId, setTemplateId] = useState<string | null>(() => defaultTemplateFor(relatorios, templates));
  const [templateText, setTemplateText] = useState(() => pickable.find((row) => row.id === templateId)?.name ?? '');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);

  const template = pickable.find((row) => row.id === templateId) ?? null;
  const reason = creating ? t.creating : (newRelatorioReason({ templateId, start, end }) ?? undefined);

  function onStart(next: string | null): void {
    // The end follows the start until the user types an end of their own.
    setEnd((current) => (current === null || current === start ? next : current));
    setStart(next);
  }

  async function create(): Promise<void> {
    if (db === null || user === null || template === null || start === null || inFlight.current) return;
    inFlight.current = true;
    setCreating(true);
    try {
      const existingEquipment = await equipmentRows(db, project.id);
      const { relatorioId, drafts } = instantiateTemplate(
        template,
        project,
        { service_start: start, service_end: end, existingEquipment },
        { newId, actorId: user.id, companyId: user.companyId },
      );
      await commitBatch(db, drafts, { newId, now });
      onClose();
      void navigate(`/relatorio/${relatorioId}`);
    } catch (error) {
      showToast(writeErrorText(error));
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.title}
      className="new-relatorio-dialog"
    >
      <p className="t-body" id={descriptionId}>
        {t.descriptionLead}
        <strong>{newRelatorioSubject(client, project)}</strong>
        {t.descriptionTail}
      </p>

      <div className="field" role="radiogroup" aria-labelledby={typeLabelId} aria-describedby={typeNoteId}>
        <span className="field-label" id={typeLabelId}>
          {t.typeLabel}
        </span>
        <div className="option-row is-selected" role="radio" aria-checked="true" tabIndex={0}>
          <span className="radio is-on" aria-hidden="true" />
          <span className="grow">
            {t.typeName}
            <br />
            <span className="lr-meta">{t.typeMeta}</span>
          </span>
        </div>
        <span className="type-note" id={typeNoteId}>
          {t.typeNote}
        </span>
      </div>

      <div className="field-stack">
        <Combobox
          label={t.templateLabel}
          options={options}
          selectedKey={templateId}
          inputValue={templateText}
          onInputChange={(text) => {
            setTemplateText(text);
            if (templateId !== null && template?.name !== text) setTemplateId(null);
          }}
          onSelectionChange={(key) => {
            setTemplateId(key);
            setTemplateText(pickable.find((row) => row.id === key)?.name ?? templateText);
          }}
        />
        <span className="helper" id={helperId}>
          {templateHelperText(template === null ? null : templateBlockTotal(template))}
        </span>
      </div>

      <div className="field-pair">
        <DateField label={t.startLabel} value={start} onChange={onStart} />
        <DateField label={t.endLabel} value={end} onChange={setEnd} isInvalid={endBeforeStart(start, end)} />
      </div>

      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {t.cancel}
        </Button>
        <Button variant="primary" isDisabled={reason !== undefined} disabledReason={reason} onPress={() => void create()}>
          {t.create}
        </Button>
      </div>
    </FormDialog>
  );
}
