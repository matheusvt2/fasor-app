import { calendarDateOfInstant, dateRangeText, projectLabel, relatorioOpEnvelope, relatorioSetupPath, textCapOf, type RelatorioSnapshot } from '@app/domain';
import { useId } from 'react';
import { CharCount, DateField, UploadTile } from '../../../components/index.ts';
import { useAssetUrl } from '../../../components/use-asset-url.ts';
import { copy } from '../../../copy/pt-br.ts';
import { now } from '../../../clock.ts';
import { commitFilePick, useAttachedFile } from '../../../db/file-commit.ts';
import { newId } from '../../../ids.ts';
import { AudioButton, AudioFieldLines } from '../../../speech/audio-field.tsx';
import { useSession } from '../../../state/session.tsx';
import { useServicePeriod, useTextField, type BandRef, type CommitField, type CommitFields } from './setup-fields.ts';

// --- Etapa 1 — Capa ----------------------------------------------------------------------

/** Story 13.4 (INP-3): the "Hoje" chip of an empty service date, today in America/Sao_Paulo. */
const today = () => calendarDateOfInstant(now());

/** Story 20.9: the kernel's cap of "Informações adicionais" (long text). */
const ADDITIONAL_INFO_CAP = textCapOf(relatorioSetupPath('additional_info'));

/** Story 31.7: the field an audio of the cover's additional information fills (the audio's text arrives through the server's put). */
const ADDITIONAL_INFO_AUDIO = { type: 'setup', field: 'additional_info' } as const;

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
  // Story 27.12 (F15): the tile's thumbnail, read from this device's file as the Empresa tab's tiles do.
  const coverSrc = useAssetUrl(db, setup.cover_photo_file_id);
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
              <DateField label={t.startLabel} value={period.start} onChange={period.onStartChange} onBlur={period.blur} today={today} />
            </div>
            <div>
              <DateField label={t.endLabel} value={period.end} onChange={period.onEndChange} onBlur={period.blur} today={today} />
              {datesEcho === '' ? null : <span className="echo">{t.datesEcho(datesEcho)}</span>}
            </div>
          </div>
          <div className="field span-2">
            <div className="section-head">
              <label className="field-label" htmlFor={additionalInfoId}>
                {t.additionalInfoLabel}
              </label>
              <AudioButton target={ADDITIONAL_INFO_AUDIO} label={t.audioAdditionalInfo} />
            </div>
            {/* Story 27.12 (F16): long text gets a text area of the mock's textarea class
                (`components.css` `.observation-field`); the mock draws a one-line `.input`. */}
            <textarea
              id={additionalInfoId}
              className="observation-field"
              value={additionalInfo.text}
              maxLength={ADDITIONAL_INFO_CAP ?? undefined}
              onChange={(event) => additionalInfo.change(event.target.value)}
              onBlur={additionalInfo.blur}
            />
            <CharCount length={additionalInfo.text.length} cap={ADDITIONAL_INFO_CAP} />
            <AudioFieldLines target={ADDITIONAL_INFO_AUDIO} text={additionalInfo.text} label={t.audioAdditionalInfo} />
          </div>
          <UploadTile
            className="span-2"
            kind="cover_photo"
            layout="tile"
            label={t.coverPhotoLabel}
            file={cover}
            previewSrc={coverSrc}
            onPick={(picked) => attachCover(picked)}
          />
        </div>
      </div>
    </section>
  );
}
