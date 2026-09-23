import { formatCnpj, isValidCnpjFormat } from '@app/domain';
import { useId, useState } from 'react';
import { useFieldCommit } from '../../input/use-field-commit.ts';

interface CnpjFieldProps {
  value: string;
  label: string;
  invalidText: string;
  onCommit: (value: string | null) => void | Promise<void>;
}

/**
 * Story 2.4 AC1's (and, since Epic 2 retro D-8, the Empresa tab's) "optional CNPJ (14 digits when present)" (I/O matrix): a non-14-digit
 * input never commits; blank commits `null`. A valid value canonicalizes to the standard
 * punctuated form (`00.000.000/0001-00`) at commit time, so two differently-punctuated
 * entries of the same CNPJ never coexist. The inline error is validated and announced only
 * on blur, not on every keystroke — a screen reader would otherwise re-announce it while
 * the user is still mid-typing a valid CNPJ.
 */
export function CnpjField({ value, label, invalidText, onCommit }: CnpjFieldProps) {
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const committer = useFieldCommit<string | null>({ commit: onCommit });
  const helperId = useId();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={text}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? helperId : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          setInvalid(false);
          if (raw.trim() === '') {
            committer.change(null);
            return;
          }
          if (isValidCnpjFormat(raw)) committer.change(formatCnpj(raw));
        }}
        onBlur={() => {
          setInvalid(text.trim() !== '' && !isValidCnpjFormat(text));
          committer.blur();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') committer.enter();
        }}
      />
      {invalid ? (
        <span className="helper" id={helperId} role="alert">
          {invalidText}
        </span>
      ) : null}
    </label>
  );
}
