import { charCountText } from '@app/domain';

export interface CharCountProps {
  /** How many characters the field holds now (the stored string's length). */
  length: number;
  /** The field's cap, the kernel's (`textCapOf`); null when the field holds no text cap. */
  cap: number | null;
  /** Optional id, so the field can name the counter in its `aria-describedby`. */
  id?: string;
}

/**
 * Story 20.9 (contract 29): the one character counter under a capped text field. It shows the
 * kernel's sentence ("180 de 200 caracteres") once the text reaches 90 % of the cap
 * (`charCountText`), and nothing below it; the field itself stops at the cap (`maxLength`, or the
 * contenteditable guard), so a user never types into a server refusal. `.helper` is the mock's
 * line under a field; the region is polite so a screen reader hears the count as it changes.
 */
export function CharCount({ length, cap, id }: CharCountProps) {
  const text = cap === null ? null : charCountText(length, cap);
  if (text === null) return null;
  return (
    <span className="helper" aria-live="polite" data-testid="char-count" {...(id === undefined ? {} : { id })}>
      {text}
    </span>
  );
}
