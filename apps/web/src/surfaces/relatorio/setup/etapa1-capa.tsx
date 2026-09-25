import { dateRangeText, projectLabel, relatorioOpEnvelope, relatorioSetupPath, type RelatorioSnapshot } from '@app/domain';
import { useId } from 'react';
import { DateField, UploadTile } from '../../../components/index.ts';
import { copy } from '../../../copy/pt-br.ts';
import { now } from '../../../clock.ts';
import { commitFilePick, useAttachedFile } from '../../../db/file-commit.ts';
import { newId } from '../../../ids.ts';
import { useSession } from '../../../state/session.tsx';
import { useServicePeriod, useTextField, type BandRef, type CommitField, type CommitFields } from './setup-fields.ts';

// --- Etapa 1 — Capa ----------------------------------------------------------------------

export function Etapa1Capa({
  relatorioId,
  snapshot,
  onCommit,
  onCommitFields,
  bandRef,
}: {
  relatorioId: string;
  snapshot: RelatorioSnapshot;
  onCommit: CommitField;
  onCommitFields: CommitFields;
  bandRef: BandRef;
}) {
  const db = useSession().database;
  const user = useSession().user;
  const t = copy.setup;
  const setup = snapshot.relatorio.setup;

  const additionalInfo = useTextField(setup.additional_info ?? '', (v) => onCommit('additional_info', v === '' ? null : v));
  const cover = useAttachedFile(db, setup.cover_photo_file_id);
  const additionalInfoId = useId();
  const period = useServicePeriod(setup.service_start, setup.service_end, onCommitFields);
  const datesEcho = dateRangeText(period.start, period.end);

  async function attachCover(picked: { file: File; sha256: string }): Promise<void> {
    if (db === null || user === null) return;
    const fileId = newId();
    await commitFilePick(
      db,
      {
        companyId: user.companyId,
        actorId: user.id,
        fileId,
        kind: 'cover_photo',
        picked,
        ownerOps: [
          {
            ...relatorioOpEnvelope({ id: user.id, companyId: user.companyId }, relatorioId),
            kind: 'put',
            path: relatorioSetupPath('cover_photo_file_id'),
            value: fileId as never,
          },
        ],
      },
      { newId, now },
    );
  }

  return (
    <section className="section-band" aria-labelledby="setup-e1" ref={(el) => bandRef(el)}>
      <div className="band-head">
        <span className="band-num" aria-hidden="true">
          1
        </span>
        <h2 className="band-title" id="setup-e1" tabIndex={-1}>
          {t.etapa1Title}
        </h2>
        <span className="band-note">{t.etapa1Note}</span>
      </div>
      <div className="band-body">
        <div className="form-grid">
          <div className="field">
            <span className="field-label">{t.clientLabel}</span>
            <div className="input">{snapshot.client?.name ?? ''}</div>
          </div>
          <div className="field">
            <span className="field-label">{t.obraLabel}</span>
            <div className="input">{snapshot.project === null ? '' : projectLabel(snapshot.project)}</div>
          </div>
          <div className="dates-3 span-2">
            {/* Wrapped like the end field's own div (not a bare grid child): the end
                cell is taller because of its "Na capa" echo, and an unwrapped start
                field would stretch to match under the grid's default `align-items:
                stretch`, drifting its absolutely-positioned calendar glyph low. */}
            <div>
              <DateField label={t.startLabel} value={period.start} onChange={period.onStartChange} onBlur={period.blur} />
            </div>
            <div>
              <DateField label={t.endLabel} value={period.end} onChange={period.onEndChange} onBlur={period.blur} />
              {datesEcho === '' ? null : <span className="echo">{t.datesEcho(datesEcho)}</span>}
            </div>
          </div>
          <div className="field span-2">
            <label className="field-label" htmlFor={additionalInfoId}>
              {t.additionalInfoLabel}
            </label>
            <input
              id={additionalInfoId}
              className="input"
              value={additionalInfo.text}
              onChange={(event) => additionalInfo.change(event.target.value)}
              onBlur={additionalInfo.blur}
            />
          </div>
          <UploadTile
            className="span-2"
            kind="cover_photo"
            layout="tile"
            label={t.coverPhotoLabel}
            file={cover}
            onPick={(picked) => attachCover(picked)}
          />
        </div>
      </div>
    </section>
  );
}
