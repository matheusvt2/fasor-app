import type { CompanyTypeDraft } from '@app/domain';
import { DEFINITION_1 } from '@app/domain/fixtures/company-types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChecklistPanel, type DraftEdit } from './type-editor-parts.tsx';

/*
 * Review e22h finding 3: the rows of a type editor list are keyed by their index. A phrase typed
 * in item 1's chip input and not added, then "Remover" on item 1, used to make the chip list's
 * unmount add (fix batch e22h B2) write into item 2, which had shifted to index 0. Every row menu
 * action now cancels the pending add first; with no row menu action the unmount add still runs.
 */

type Item = { key: string; nc_phrases: string[] };
const itemsOf = (draft: CompanyTypeDraft | null) => ((draft as { checklist?: Item[] } | null)?.checklist ?? []).map((item) => ({ key: item.key, nc_phrases: item.nc_phrases }));

function Harness({ shown, onDraft }: { shown: boolean; onDraft: (draft: CompanyTypeDraft | null) => void }) {
  const latest = useRef<CompanyTypeDraft | null>(structuredClone(DEFINITION_1) as unknown as CompanyTypeDraft);
  const [draft, setDraft] = useState(latest.current);
  const edit: DraftEdit = (change) => {
    latest.current = change(latest.current);
    onDraft(latest.current);
    setDraft(latest.current);
  };
  return shown ? <ChecklistPanel draft={draft} issues={[]} edit={edit} /> : null;
}

function setup() {
  let last: CompanyTypeDraft | null = null;
  const onDraft = (draft: CompanyTypeDraft | null) => {
    last = draft;
  };
  const view = render(<Harness shown onDraft={onDraft} />);
  return { view, onDraft, last: () => last };
}

const first = DEFINITION_1.checklist![0]!;
const second = DEFINITION_1.checklist![1]!;

async function typeInFirstItem() {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^1\\. ${first.label}`) }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Nova frase de NC' }), 'Frase pendente');
}

describe('type editor chip list: the unmount add and the row menu', () => {
  it('Remover on the open item drops the typed phrase instead of writing it into the next item', async () => {
    const { last } = setup();
    await typeInFirstItem();
    await userEvent.click(screen.getByRole('button', { name: `Mais opções de 1. ${first.label}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    expect(itemsOf(last())).toEqual([{ key: second.key, nc_phrases: second.nc_phrases }]);
  });

  it('Descer on the open item drops the typed phrase instead of writing it into the item that took its index', async () => {
    const { view, onDraft, last } = setup();
    await typeInFirstItem();
    await userEvent.click(screen.getByRole('button', { name: `Mais opções de 1. ${first.label}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    // The editor goes (a tab change): nothing is added to either item.
    view.rerender(<Harness shown={false} onDraft={onDraft} />);
    expect(itemsOf(last())).toEqual([
      { key: second.key, nc_phrases: second.nc_phrases },
      { key: first.key, nc_phrases: first.nc_phrases },
    ]);
  });

  it('with no row menu action, the editor going adds the typed phrase to its own item', async () => {
    const { view, onDraft, last } = setup();
    await typeInFirstItem();
    view.rerender(<Harness shown={false} onDraft={onDraft} />);
    expect(itemsOf(last())).toEqual([
      { key: first.key, nc_phrases: [...first.nc_phrases, 'Frase pendente'] },
      { key: second.key, nc_phrases: second.nc_phrases },
    ]);
  });
});
