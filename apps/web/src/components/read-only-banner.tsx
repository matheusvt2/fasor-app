import { permissionRefusalText, READ_ONLY_LEAD_TEXT } from '@app/domain';

/**
 * Story 26.5 (`62-ficha-consulta.html` `.fc-banner`; EXPERIENCE.md § State Patterns, "A relatório
 * the role cannot fill"): the info Banner a screen draws once, under its header, when the role
 * does not hold `relatorio.fill`, instead of a line beside every control. The words are the
 * kernel's.
 */
export function ReadOnlyBanner() {
  return (
    <div className="banner fc-banner" data-variant="info" role="status">
      <span className="banner-text">
        <strong>{READ_ONLY_LEAD_TEXT}</strong> {permissionRefusalText('relatorio.fill')}
      </span>
    </div>
  );
}
