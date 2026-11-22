import { revisionRowSegments, type RevisionFileFormat, type RevisionRow } from '@app/domain';
import { Fragment, useState } from 'react';
import { publishReAuth } from '../../api/auth-client.ts';
import { TextButton } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { downloadRevisionFile } from '../export/revision-file.ts';
import { isUnauthorized } from '../export/session-expired.tsx';

/*
 * e26r (2026-11-22, Matheus "sim nos dois", AD-29): a role that downloads and does not issue (the
 * seeded Consulta and Gestor do Projeto) opens no Export dialog ("Gerar relatório" is refused), so
 * on an Emitido relatório the Sumário offers the issued files directly: the latest revision's row,
 * the markup and words of the Export dialog's Revisões row (`73-exportar.html` `.revision-row`,
 * `.rev-files`), and the same download route (`GET /api/revisions/{id}/{docx|pdf}`, which asks
 * `export.download`). Nothing is generated. No frame draws it on the Sumário; this is that row.
 */

export function IssuedFiles({ revision }: { revision: RevisionRow }) {
  const [busy, setBusy] = useState<RevisionFileFormat | null>(null);
  const [failed, setFailed] = useState(false);
  const segments = revisionRowSegments(revision, null);

  function download(format: RevisionFileFormat): void {
    if (busy !== null) return;
    setBusy(format);
    setFailed(false);
    downloadRevisionFile({ revisionId: revision.id, number: revision.number, format }).then(
      () => setBusy(null),
      (error: unknown) => {
        if (isUnauthorized(error)) publishReAuth();
        setBusy(null);
        setFailed(true);
      },
    );
  }

  const label = (format: RevisionFileFormat, text: string) => (busy === format ? copy.export.fileBusy : text);

  return (
    <Fragment>
      <div className="revision-row">
        <span className="rev-text">
          {segments.before}
          <time dateTime={segments.datetime}>{segments.dateText}</time>
          {segments.after}
        </span>
        <span className="rev-files">
          <TextButton onPress={() => download('docx')}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-download" />
            </svg>
            {label('docx', copy.export.revisionDocx)}
          </TextButton>
          <TextButton onPress={() => download('pdf')}>
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-download" />
            </svg>
            {label('pdf', copy.export.revisionPdf)}
          </TextButton>
        </span>
      </div>
      {failed ? (
        <div className="gen-error" role="alert">
          <span>{copy.export.fileFailed}</span>
        </div>
      ) : null}
    </Fragment>
  );
}
