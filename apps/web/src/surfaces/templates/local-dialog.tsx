import { defaultLocalName, FUNCAO_MAX_LENGTH, FUNCAO_OPTIONS, type FuncaoKey } from '@app/domain';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import './local-dialog.css';

/*
 * Story 14.2: the Função dialog (`42-template-composer.html` `#tc-dlg-local`), shared by the
 * Template composer and the relatório tree. "Adicionar local" asks the Função and a name;
 * "Função e nome" is the same form filled in.
 *
 * The Função is a `radiogroup` of `.option-row` radios (the Priority picker's pattern: one
 * row in the tab order, the arrows move the focus, a tap, Space or Enter selects):
 * Entrada · Primária · Transformação · Distribuição · Outra. "Qual função" shows only with
 * Outra. "Nome" follows the Função (`defaultLocalName`) until the user types in it. The
 * labels and the proposed name are the kernel's; what is stored is a reserved key or the
 * typed name.
 */

/** What the dialog hands back: the Função as stored (a key, a typed name, or null for none) and the name. */
export interface LocalDialogResult {
  funcao: string | null;
  name: string;
}

export interface LocalDialogProps {
  /** `add`: "Adicionar local", nothing chosen. `edit`: "Função e nome", filled from the local. */
  mode: 'add' | 'edit';
  /** The local's stored Função and name when editing. */
  initial?: { funcao: string | null; name: string };
  onSubmit: (result: LocalDialogResult) => void;
  onClose: () => void;
}

const OUTRA = 'outra';
type Choice = FuncaoKey | typeof OUTRA | null;

const isKey = (value: string): value is FuncaoKey => FUNCAO_OPTIONS.some((option) => option.key === value);

export function LocalDialog({ mode, initial, onSubmit, onClose }: LocalDialogProps) {
  const t = copy.localDialog;
  const stored = initial?.funcao ?? null;
  const [choice, setChoice] = useState<Choice>(stored === null ? null : isKey(stored) ? stored : OUTRA);
  const [other, setOther] = useState(stored !== null && !isKey(stored) ? stored : '');
  const [name, setName] = useState(initial?.name ?? '');
  // The name follows the Função until it is typed in; a local being edited keeps its own.
  const [nameEdited, setNameEdited] = useState(mode === 'edit');
  const [tried, setTried] = useState(false);
  const descriptionId = useId();
  const funcaoLabelId = useId();
  const otherId = useId();
  const otherHelperId = useId();
  const nameId = useId();
  const nameHelperId = useId();
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const options: { value: FuncaoKey | typeof OUTRA; label: string }[] = [...FUNCAO_OPTIONS.map((option) => ({ value: option.key, label: option.label })), { value: OUTRA, label: t.outra }];
  const checkedIndex = options.findIndex((option) => option.value === choice);
  const tabIndexOf = focusIndex ?? (checkedIndex === -1 ? 0 : checkedIndex);

  const funcaoOf = (picked: Choice, typed: string): string | null => (picked === null ? null : picked === OUTRA ? (typed.trim() === '' ? null : typed.trim()) : picked);
  const follow = (picked: Choice, typed: string) => {
    if (nameEdited) return;
    const funcao = funcaoOf(picked, typed);
    setName(picked === null ? '' : defaultLocalName(funcao ?? ''));
  };

  const pick = (value: FuncaoKey | typeof OUTRA) => {
    setChoice(value);
    follow(value, other);
  };
  const move = (to: number) => {
    const index = (to + options.length) % options.length;
    setFocusIndex(index);
    rows.current[index]?.focus();
  };
  const onRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(options.length - 1);
        break;
      default:
    }
  };

  const funcao = funcaoOf(choice, other);
  // "Adicionar local" asks for the Função; "Função e nome" may leave a local with none as it is.
  const reason =
    mode === 'add' && choice === null
      ? t.pickFuncao
      : choice === OUTRA && other.trim() === ''
        ? t.missingOther
        : name.trim() === ''
          ? t.missingName
          : undefined;
  const submit = () => {
    setTried(true);
    if (reason !== undefined) return;
    onSubmit({ funcao, name: name.trim() });
  };
  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  };
  const otherRefused = tried && choice === OUTRA && other.trim() === '';
  const nameRefused = tried && name.trim() === '';

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={mode === 'add' ? t.addTitle : t.editTitle}
      className="tc-local-dialog"
    >
      <p className="t-body" id={descriptionId}>
        {t.description}
      </p>
      <div className="field" role="radiogroup" aria-labelledby={funcaoLabelId} aria-describedby={descriptionId}>
        <span className="field-label" id={funcaoLabelId}>
          {t.funcaoLabel}
        </span>
        <div className="tc-fn-options">
          {options.map((option, index) => {
            const checked = option.value === choice;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  rows.current[index] = element;
                }}
                type="button"
                className={checked ? 'option-row is-selected' : 'option-row'}
                role="radio"
                aria-checked={checked}
                data-fn={option.value}
                tabIndex={index === tabIndexOf ? 0 : -1}
                onFocus={() => setFocusIndex(index)}
                onClick={() => pick(option.value)}
                onKeyDown={(event) => onRadioKeyDown(event, index)}
              >
                <span className="radio" aria-hidden="true" />
                <span className="grow">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Each helper sits beside its field, outside the label, so the field is named by its label alone ("Nome"). */}
      {choice === OUTRA ? (
        <div className="field tc-fn-other">
          <label className="field-label" htmlFor={otherId}>
            {t.otherLabel}
          </label>
          <input
            id={otherId}
            className="input"
            value={other}
            maxLength={FUNCAO_MAX_LENGTH}
            aria-invalid={otherRefused ? true : undefined}
            aria-describedby={otherHelperId}
            onChange={(event) => {
              setOther(event.target.value);
              follow(OUTRA, event.target.value);
            }}
            onKeyDown={onFieldKeyDown}
          />
          {otherRefused ? (
            <span className="helper" data-tone="red" id={otherHelperId} role="alert">
              {t.missingOther}
            </span>
          ) : (
            <span className="helper" id={otherHelperId}>
              {t.otherHelper}
            </span>
          )}
        </div>
      ) : null}
      <div className="field">
        <label className="field-label" htmlFor={nameId}>
          {t.nameLabel}
        </label>
        <input
          id={nameId}
          className="input"
          value={name}
          aria-invalid={nameRefused ? true : undefined}
          aria-describedby={nameHelperId}
          onChange={(event) => {
            setNameEdited(true);
            setName(event.target.value);
          }}
          onKeyDown={onFieldKeyDown}
        />
        {nameRefused ? (
          <span className="helper" data-tone="red" id={nameHelperId} role="alert">
            {t.missingName}
          </span>
        ) : (
          <span className="helper" id={nameHelperId}>
            {t.nameHelper}
          </span>
        )}
      </div>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {t.cancel}
        </Button>
        <Button variant="primary" isDisabled={reason !== undefined} disabledReason={reason} onPress={submit}>
          {mode === 'add' ? t.add : t.save}
        </Button>
      </div>
    </FormDialog>
  );
}
