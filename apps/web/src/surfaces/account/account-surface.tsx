import {
  avatarInitial,
  defaultTitleForCouncil,
  registrationRowText,
  type Registration,
} from '@app/domain';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { RegistrationDialog } from './registration-dialog.tsx';
import { SignOutDialog } from './sign-out-dialog.tsx';
import './account.css';

/**
 * Account (UX-DR22, UX-DR65) from `mockups/key-account.html`: identity rows, the
 * "Registro profissional" settings row with its Form dialog, the "Aguardando envio" row
 * that opens Sync status, and the destructive "Sair" with its Confirm dialog, whose
 * wording carries the kernel's pending summary when something waits to be sent.
 *
 * There is no "Instalar na tela inicial" row: `source-deltas.md` removed it (web only,
 * no install), even though the mock still draws it. Theme and storage rows belong to
 * Story 1.6.
 */
export function AccountSurface() {
  const session = useSession();
  const sync = useSync();
  const identityHeadingId = useId();
  const registrationHeadingId = useId();
  const syncHeadingId = useId();
  const sessionHeadingId = useId();
  const signOutNoteId = useId();
  const signOutReasonId = useId();

  const [editing, setEditing] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const user = session.user;
  if (user === null) return null;

  const pending = sync.pendingText;
  const signOutNote = pending === '' ? copy.account.signOutNote : copy.account.signOutNotePending(pending);

  const council = user.council ?? 'crea';
  const initial: Registration = {
    council,
    registrationNumber: user.registrationNumber ?? '',
    title: user.title ?? defaultTitleForCouncil(council),
  };

  async function save(registration: Registration) {
    await session.saveRegistration(registration);
    setEditing(false);
  }

  /** A sign-out the server never confirmed keeps the session and says so. */
  async function signOut() {
    setSignOutError(null);
    try {
      await session.signOut();
    } catch {
      setSignOutError(copy.account.signOutFailed);
    }
  }

  return (
    <main className="screen">
      <div className="content">
        <section className="section" aria-labelledby={identityHeadingId}>
          <h2 id={identityHeadingId} className="visually-hidden">
            {copy.account.identityHeading}
          </h2>
          <div className="account-name">
            <span className="avatar" aria-hidden="true">
              {avatarInitial(user.name)}
            </span>
            <div>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
          </div>
          <ul className="settings-list">
            <li className="settings-row">
              <span className="grow">
                <span className="sr-label">{copy.account.nameLabel}</span>
                <br />
                <span className="sr-value">{user.name}</span>
              </span>
              <span className="btn-reason">{copy.account.providedByCompany}</span>
            </li>
            <li className="settings-row">
              <span className="grow">
                <span className="sr-label">{copy.account.emailLabel}</span>
                <br />
                <span className="sr-value">{user.email}</span>
              </span>
              <span className="btn-reason">{copy.account.providedByCompany}</span>
            </li>
            <li className="settings-row">
              <span className="grow">
                <span className="sr-label">{copy.account.companyLabel}</span>
                <br />
                <span className="sr-value">{user.companyName}</span>
              </span>
            </li>
          </ul>
        </section>

        <section className="section" aria-labelledby={registrationHeadingId}>
          <div className="section-head">
            <h2 id={registrationHeadingId}>{copy.account.registrationHeading}</h2>
          </div>
          <p className="section-note">{copy.account.registrationNote}</p>
          <ul className="settings-list">
            <li className="settings-row">
              <span className="grow">
                <span className="sr-label">{copy.account.registrationHeading}</span>
                <br />
                <span className="sr-value" data-testid="registration-row-value">
                  {registrationRowText(user)}
                </span>
              </span>
              <button type="button" className="btn btn-text" onClick={() => setEditing(true)}>
                {copy.account.edit}
              </button>
            </li>
          </ul>
        </section>

        <section className="section" aria-labelledby={syncHeadingId}>
          <div className="section-head">
            <h2 id={syncHeadingId}>{copy.account.syncHeading}</h2>
          </div>
          <ul className="settings-list">
            <li className="settings-row">
              <span className="grow">
                <span className="sr-label">{copy.account.pendingLabel}</span>
                <br />
                <span className="sr-value" data-testid="account-pending-value">
                  {pending === '' ? copy.account.nothingPending : copy.sync.waiting(pending)}
                </span>
              </span>
              <Link className="btn btn-text" to="/sync">
                {copy.account.syncStatusLink}
              </Link>
            </li>
          </ul>
        </section>

        <section className="section" aria-labelledby={sessionHeadingId}>
          <div className="section-head">
            <h2 id={sessionHeadingId}>{copy.account.sessionHeading}</h2>
          </div>
          <div className="sign-out">
            <button
              type="button"
              className="btn btn-destructive"
              // Offline, both the reason and the data-safety note are announced.
              aria-describedby={
                session.online ? signOutNoteId : `${signOutNoteId} ${signOutReasonId}`
              }
              aria-disabled={session.online ? undefined : true}
              onClick={() => {
                if (session.online) setConfirmingSignOut(true);
              }}
            >
              {copy.account.signOut}
            </button>
            <span className="btn-reason" id={signOutNoteId}>
              {signOutNote}
            </span>
            {session.online ? null : (
              <span className="btn-reason" id={signOutReasonId}>
                {copy.account.signOutOfflineReason}
              </span>
            )}
            {signOutError === null ? null : (
              <span className="login-error" role="alert">
                {signOutError}
              </span>
            )}
          </div>
        </section>
      </div>

      {editing ? (
        <RegistrationDialog
          initial={initial}
          online={session.online}
          onCancel={() => setEditing(false)}
          onSave={save}
        />
      ) : null}

      {confirmingSignOut ? (
        <SignOutDialog
          pending={pending === '' ? null : { text: pending, count: sync.pendingCount }}
          onCancel={() => setConfirmingSignOut(false)}
          onConfirm={() => {
            setConfirmingSignOut(false);
            void signOut();
          }}
        />
      ) : null}
    </main>
  );
}
