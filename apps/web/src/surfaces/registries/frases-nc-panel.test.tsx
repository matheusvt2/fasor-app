import { ncPhraseRegistryRows, registryRowSchema, type NcPhraseRegistryRow } from '@app/domain';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../copy/pt-br.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { FrasesNcPanel } from './frases-nc-panel.tsx';

/*
 * Review of Story 14.12: the Frases de NC panel's field follows a rename that lands from another
 * device while the person has no change of their own waiting, and keeps what they are typing.
 */

const session: SessionState = {
  status: 'signed-in',
  user: {
    id: '0a000000-0000-7000-8000-0000000000a1',
    name: 'Ana Alves',
    email: 'a@teste.local',
    companyId: '0a000000-0000-7000-8000-00000000000a',
    companyName: 'Empresa A de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  settled: true,
  dismissRecovery: vi.fn(),
};

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

function entry(name: string): NcPhraseRegistryRow {
  const row = registryRowSchema.parse({ id: '0a000000-0000-7000-8000-0000000000e1', kind: 'nc_phrase', block_type: 'disjuntor_mt', item_key: 'bobinas', name, removed_at: null });
  return ncPhraseRegistryRows([row])[0]!;
}

const t = copy.registries.frasesNc.panel;

function panel(name: string) {
  return <ToastProvider><FrasesNcPanel entry={entry(name)} onClose={vi.fn()} /></ToastProvider>;
}

afterEach(cleanup);

describe('FrasesNcPanel', () => {
  it('shows a rename from another device while nothing of the person is waiting', () => {
    const view = render(panel('Mola fraca'));
    const field = screen.getByRole('textbox', { name: t.nameLabel });
    expect(field).toHaveValue('Mola fraca');
    view.rerender(panel('Mola fraca na abertura'));
    expect(field).toHaveValue('Mola fraca na abertura');
    expect(screen.getByRole('heading', { name: 'Mola fraca na abertura' })).toBeInTheDocument();
  });

  it('keeps what the person is typing when a rename lands meanwhile', async () => {
    const user = userEvent.setup();
    const view = render(panel('Mola fraca'));
    const field = screen.getByRole('textbox', { name: t.nameLabel });
    await user.click(field);
    await user.type(field, ' X');
    view.rerender(panel('Mola fraca na abertura'));
    expect(field).toHaveValue('Mola fraca X');
  });

  it('takes at most NC_PHRASE_MAX_LENGTH characters', () => {
    render(panel('Mola fraca'));
    expect(screen.getByRole('textbox', { name: t.nameLabel })).toHaveAttribute('maxLength', '200');
  });
});
