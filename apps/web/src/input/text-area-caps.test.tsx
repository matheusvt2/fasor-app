import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharCount } from '../components/char-count.tsx';
import { useRichTextArea } from './use-rich-text-area.ts';
import { useSectionTextArea } from './use-section-text-area.ts';

/*
 * Story 20.9: the two contenteditable areas (the point text, and the rich section text of the
 * Template composer and the relatório) hold their stored string to the kernel's cap: typing
 * past it is stopped and a paste lands cut where the stored text fits. The cap here is small
 * (10) so the cut is easy to read; the surfaces pass the kernel's (`textCapOf`).
 */

const CAP = 10;

/** A paste of `text` as the browser raises it (jsdom has no `ClipboardEvent` with data). */
function paste(element: HTMLElement, text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : '') } });
  act(() => {
    element.dispatchEvent(event);
  });
}

/** A typed character as the browser announces it before inserting it; true when the area let it through. */
function typeAllowed(element: HTMLElement, data: string): boolean {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'inputType', { value: 'insertText' });
  Object.defineProperty(event, 'data', { value: data });
  return element.dispatchEvent(event);
}

function PlainArea({ initialText, onChange }: { initialText: string; onChange: (text: string) => void }) {
  const area = useSectionTextArea({ initialText, onChange, maxLength: CAP });
  return <div {...area.areaProps} aria-label="Texto do ponto" />;
}

function RichArea({ initialText, onChange }: { initialText: string; onChange: (text: string) => void }) {
  const editor = useRichTextArea({ initialText, onChange, maxLength: CAP });
  return (
    <>
      <div {...editor.areaProps} aria-label="Texto da seção" />
      <CharCount length={editor.length} cap={editor.maxLength} />
    </>
  );
}

describe('useSectionTextArea with a cap (Story 20.9)', () => {
  it('a paste past the cap lands cut at the room left; typing at the cap is stopped; below it, typing goes through', () => {
    const onChange = vi.fn();
    render(<PlainArea initialText="abc" onChange={onChange} />);
    const area = screen.getByRole('textbox', { name: 'Texto do ponto' });
    expect(typeAllowed(area, 'z')).toBe(true);
    paste(area, '0123456789xyz');
    expect(onChange).toHaveBeenLastCalledWith('abc0123456');
    expect(area.textContent).toBe('abc0123456');
    expect(typeAllowed(area, 'z')).toBe(false);
    // Nothing is pasted once the text holds the cap.
    onChange.mockClear();
    paste(area, 'more');
    expect(onChange).not.toHaveBeenCalled();
    expect(area.textContent).toBe('abc0123456');
  });

  it('a text stored over the cap before it existed may shrink, never grow', () => {
    const onChange = vi.fn();
    render(<PlainArea initialText={'y'.repeat(CAP + 5)} onChange={onChange} />);
    const area = screen.getByRole('textbox', { name: 'Texto do ponto' });
    expect(typeAllowed(area, 'z')).toBe(false);
    paste(area, 'zz');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('useRichTextArea with a cap (Story 20.9)', () => {
  it('a paste past the cap lands cut where the stored text fits, the counter shows, and typing at the cap is stopped', () => {
    const onChange = vi.fn();
    render(<RichArea initialText="abc" onChange={onChange} />);
    const area = screen.getByRole('textbox', { name: 'Texto da seção' });
    expect(screen.queryByTestId('char-count')).toBeNull();
    expect(typeAllowed(area, 'z')).toBe(true);
    paste(area, 'defghijklmnop');
    const stored = onChange.mock.calls.at(-1)![0] as string;
    expect(stored).toHaveLength(CAP);
    expect(stored.startsWith('abc')).toBe(true);
    expect(screen.getByTestId('char-count')).toHaveTextContent(`${CAP} de ${CAP} caracteres`);
    expect(typeAllowed(area, 'z')).toBe(false);
  });
});
