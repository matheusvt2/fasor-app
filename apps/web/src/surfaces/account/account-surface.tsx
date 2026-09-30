import {
  avatarInitial,
  defaultTitleForCouncil,
  pendingNotSentText,
  registrationOfUserRow,
  registrationRowText,
  storageLine,
  type Registration,
  type ThemePreference,
} from '@app/domain';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { Button, ConfirmDialog, SegmentedControl, TextButton, Toggle } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { relatorioRows, originalFileCount } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { clearGeolocationDenied, useGeolocationDenied, writeGeolocationDenied } from '../../db/photo-store.ts';
import { localUser } from '../../db/sync-store.ts';
import { estimateStorageUsage } from '../../device/storage-estimate.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useTheme } from '../../state/theme.tsx';
import { RegistrationDialog } from './registration-dialog.tsx';
import './account.css';

/**
 * Account (UX-DR22, UX-DR65) from `mockups/key-account.html`: identity rows, the
 * "Registro profissional" settings row with its Form dialog, the "Localização nas fotos"
 * Toggle row (Story 11.5, FR-8, `90-account.html` `#acc-loc-row`), the "Aguardando envio"
 * row that opens Sync status, and the destructive "Sair" with its Confirm dialog, whose
 * wording carries the kernel's pending summary when something waits to be sent.
 *
 * There is no "Instalar na tela inicial" row: `source-deltas.md` removed it (web only,
 * no install), even though the mock still draws it. "Leituras por IA" is marked out of
 * the slice in the mock and is not built here either.
 *
 * "Localização nas fotos" writes the user's own `photo_location_enabled` (default on; off,
 * the next photos carry date and time only). When the browser refused the position (the
 * device-local `geolocation_denied` pref the capture records, or a Permissions API state of
 * `denied`), the denied line replaces the "on" helper and the switch stays on, so a later
 * permission works again at once. A switch is its own inverse: no undo toast.
 */

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: copy.account.themeSystem },
  { value: 'light', label: copy.account.themeLight },
  { value: 'dark', label: copy.account.themeDark },
];
export function AccountSurface() {
  const session = useSession();
  const sync = useSync();
  const identityHeadingId = useId();
  const registrationHeadingId = useId();
  const locationHeadingId = useId();
  const locationLabelId = useId();
  const locationHelperId = useId();
  const themeHeadingId = useId();
  const storageHeadingId = useId();
  const sessionHeadingId = useId();
  const signOutNoteId = useId();

  const theme = useTheme();
  const db = session.database;
  // `undefined` is "still measuring", `null` is "this browser has no estimate": without
  // the distinction the row shows "Indisponível neste navegador" for a frame on every
  // visit, before the promise settles.
  const [usageBytes, setUsageBytes] = useState<number | null | undefined>(undefined);

  const relatorios = useLiveQuery(() => (db === null ? Promise.resolve([]) : relatorioRows(db)), [db], []);
  const photos = useLiveQuery(() => (db === null ? Promise.resolve(0) : originalFileCount(db)), [db], 0);
  // AD-1: the registration is read from this user's kernel row on the device, so a save
  // (offline or not) shows at once. Until the company pull brings the row, the profile
  // the session read from the server stands in.
  const userId = session.user?.id ?? null;
  const userRow = useLiveQuery(
    () => (db === null || userId === null ? Promise.resolve(null) : localUser(db, userId)),
    [db, userId],
    null,
  );

  const geolocationDenied = useGeolocationDenied(db);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Story 11.5: the Permissions API, where the browser has it, says at once whether the
  // position is refused or allowed again (the capture's own answer also sets and clears it).
  useEffect(() => {
    if (db === null || typeof navigator === 'undefined' || navigator.permissions?.query === undefined) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const apply = (state: PermissionState) => {
      if (state === 'denied') void writeGeolocationDenied(db).catch(() => undefined);
      else if (state === 'granted') void clearGeolocationDenied(db).catch(() => undefined);
    };
    const onChange = () => {
      if (status !== null) apply(status.state);
    };
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) return;
        status = result;
        apply(result.state);
        result.addEventListener('change', onChange);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [db]);

  // One measurement per visit; `estimateStorageUsage` never throws, so a browser
  // without the API simply leaves the value null and the kernel writes the sentence.
  useEffect(() => {
    let cancelled = false;
    void estimateStorageUsage().then((bytes) => {
      if (!cancelled) setUsageBytes(bytes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [editing, setEditing] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const user = session.user;
  if (user === null) return null;

  const storage =
    usageBytes === undefined ? null : storageLine({ usage_bytes: usageBytes, relatorios: relatorios.length, photos });
  const pending = sync.pendingText;
  const signOutNote = pending === '' ? copy.account.signOutNote : copy.account.signOutNotePending(pending);

  const registration = userRow === null ? user : registrationOfUserRow(userRow);
  const council = registration.council ?? 'crea';
  const initial: Registration = {
    council,
    registrationNumber: registration.registrationNumber ?? '',
    title: registration.title ?? defaultTitleForCouncil(council),
  };

  const locationEnabled = userRow?.photo_location_enabled ?? true;

  async function saveLocation(enabled: boolean) {
    setLocationError(null);
    try {
      await session.savePhotoLocation(enabled);
    } catch {
      setLocationError(copy.account.locationSaveFailed);
    }
  }

  async function save(registration: Registration) {
    await session.saveRegistration(registration);
    setEditing(false);
  }

  /** A sign-out the server never confirmed keeps the session and says so. */
  async function signOut() {
    if (signingOut) return;
    setSignOutError(null);
    setSigningOut(true);
    try {
      await session.signOut();
    } catch {
      setSignOutError(copy.account.signOutFailed);
    } finally {
      setSigningOut(false);
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
                  {registrationRowText(registration)}
                </span>
              </span>
              <TextButton onPress={() => setEditing(true)}>{copy.account.edit}</TextButton>
            </li>
          </ul>
        </section>

        <section className="section" aria-labelledby={locationHeadingId}>
          <div className="section-head">
            <h2 id={locationHeadingId}>{copy.account.locationHeading}</h2>
          </div>
          <div className="location-row">
            <div className="toggle-row">
              <span>
                <span className="toggle-label" id={locationLabelId}>
                  {copy.account.locationLabel}
                </span>
                <br />
                <span className="toggle-sub">{copy.account.locationSub}</span>
              </span>
              <Toggle
                isSelected={locationEnabled}
                aria-labelledby={locationLabelId}
                aria-describedby={locationHelperId}
                onChange={(enabled) => void saveLocation(enabled)}
              />
            </div>
            {!locationEnabled ? (
              <span className="helper helper-off" id={locationHelperId}>
                {copy.account.locationHelperOff}
              </span>
            ) : geolocationDenied ? (
              <span className="helper helper-denied" id={locationHelperId} data-tone="amber">
                {copy.account.locationDenied}
              </span>
            ) : (
              <span className="helper helper-on" id={locationHelperId}>
                {copy.account.locationHelperOn}
              </span>
            )}
            {locationError === null ? null : (
              <span className="login-error" role="alert">
                {locationError}
              </span>
            )}
          </div>
        </section>

        <section className="section" aria-labelledby={themeHeadingId}>
          <div className="section-head">
            <h2 id={themeHeadingId}>{copy.account.themeHeading}</h2>
          </div>
          <p className="section-note">{copy.account.themeNote}</p>
          <div className="theme-choice">
            <SegmentedControl
              value={theme.theme}
              onChange={theme.setTheme}
              options={THEME_OPTIONS}
              aria-labelledby={themeHeadingId}
            />
          </div>
        </section>

        <section className="section" aria-labelledby={storageHeadingId}>
          <div className="section-head">
            <h2 id={storageHeadingId}>{copy.account.storageHeading}</h2>
          </div>
          <ul className="settings-list">
            <li className="settings-row">
              <span className="grow">
                <span className="sr-label">{copy.account.storageInUse}</span>
                <br />
                <span className="storage-line" data-testid="storage-value">
                  {storage === null ? null : (
                    <>
                      <span className="sr-value t-value">{storage.value}</span>
                      {storage.detail === '' ? null : <span className="sr-value">{storage.detail}</span>}
                    </>
                  )}
                </span>
              </span>
            </li>
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
          <p className="section-note">{copy.account.storageNote}</p>
        </section>

        <section className="section" aria-labelledby={sessionHeadingId}>
          <div className="section-head">
            <h2 id={sessionHeadingId}>{copy.account.sessionHeading}</h2>
          </div>
          <div className="sign-out">
            <Button
              variant="destructive"
              // Offline, both the reason and the data-safety note are announced; the
              // component adds its own `disabledReason` node, so only the note is linked here.
              aria-describedby={signOutNoteId}
              isDisabled={!session.online}
              disabledReason={copy.account.signOutOfflineReason}
              onPress={() => {
                if (!signingOut) setConfirmingSignOut(true);
              }}
            >
              {signingOut ? copy.account.signingOut : copy.account.signOut}
            </Button>
            <span className="btn-reason" id={signOutNoteId}>
              {signOutNote}
            </span>
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
          onCancel={() => setEditing(false)}
          onSave={save}
        />
      ) : null}

      {/* Confirm dialog of the destructive "Sair" (mock: `#acc-dlg-sair`). With pending work
          it is the mock's "Sair com envios pendentes?" with the kernel's sentence; with
          nothing pending it says what is true today: nothing on this device is deleted. */}
      <ConfirmDialog
        isOpen={confirmingSignOut}
        onOpenChange={setConfirmingSignOut}
        title={pending === '' ? copy.account.signOutDialogTitle : copy.account.signOutPendingDialogTitle}
        description={pending === '' ? copy.account.signOutDialogBody : pendingNotSentText(pending, sync.pendingCount)}
        confirmLabel={copy.account.signOutConfirm}
        cancelLabel={copy.account.cancel}
        isDestructive
        onConfirm={() => void signOut()}
      />
    </main>
  );
}
