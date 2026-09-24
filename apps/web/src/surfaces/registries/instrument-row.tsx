import { instrumentDetailSeparator, instrumentRegistryRowText, type CalibrationStatus, type InstrumentRow as InstrumentRowType } from '@app/domain';

export interface InstrumentRowProps {
  instrument: InstrumentRowType;
  status: CalibrationStatus;
  isOpen: boolean;
  onOpen: () => void;
}

/** One `.registry-row` of the Instrumentos list (`80-cadastros.html` L230-259). */
export function InstrumentRow({ instrument, status, isOpen, onOpen }: InstrumentRowProps) {
  const text = instrumentRegistryRowText(instrument, status);
  const label = [`${text.code} ${text.primaryRest}`, text.validity?.text].filter(Boolean).join(', ');
  return (
    <li
      className="registry-row"
      tabIndex={0}
      role="button"
      aria-pressed={isOpen}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="rr-text">
        <span className="rr-primary">
          <strong>{text.code}</strong> {text.primaryRest}
        </span>
        <span className="rr-secondary">
          {text.secondaryLead}
          {instrumentDetailSeparator(text)}
          {text.validity === null ? null : text.validity.expired ? <span className="rr-expired">{text.validity.text}</span> : text.validity.text}
        </span>
      </div>
      <svg className="ico rr-chevron" aria-hidden="true">
        <use href="/sprite.svg#i-chev-right" />
      </svg>
    </li>
  );
}
