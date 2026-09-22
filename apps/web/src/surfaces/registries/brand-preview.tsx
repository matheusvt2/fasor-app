import { empresaFooterLine, empresaFormLine, type EmpresaRow } from '@app/domain';
import { copy } from '../../copy/pt-br.ts';

/*
 * The CSS approximation of the generated document (Epic 2 context: "a CSS approximation
 * only, never a rendered PDF"). Three miniature pages — cover, header strip, footer strip
 * (AC 2.3-2, which wins over the mock's cover + inner page) — drawn with the existing
 * `components.css` `.brand-preview`/`.bp-*` rules. No watermark element: the toggle and
 * the field are cut by source-deltas.
 *
 * The whole card is `aria-hidden`: it is a picture of a document, and every value in it
 * is already read out by the field it came from.
 */

export interface BrandPreviewProps {
  empresa: EmpresaRow | null;
  /** Object URL of the logo, when this device holds its bytes. */
  logoSrc?: string | null;
  /** Object URL of the cover background, when this device holds its bytes. */
  coverSrc?: string | null;
}

/** The logo slot: the image when there is one, else the `border-hairline` placeholder. */
function LogoSlot({ src, label }: { src: string | null; label: string }) {
  return src === null ? (
    <i className="bp-box bp-logo bp-empty">{label}</i>
  ) : (
    <img className="bp-box bp-logo bp-image" src={src} alt="" />
  );
}

export function BrandPreview({ empresa, logoSrc = null, coverSrc = null }: BrandPreviewProps) {
  const t = copy.registries.empresa;
  const name = empresa?.name?.trim() ?? '';
  const cnpj = empresa?.cnpj?.trim() ?? '';
  const identity = [name, cnpj === '' ? '' : `CNPJ ${cnpj}`].filter((part) => part !== '').join(' · ');
  const formLine = empresaFormLine(empresa);
  const headerLine = [empresa?.form_title ?? '', formLine].filter((part) => part !== '').join(' · ');

  return (
    <div className="brand-preview" aria-hidden="true">
      <p className="bp-label">{t.previewTitle}</p>
      <div className="bp-pages">
        <figure className="bp-page bp-cover">
          <LogoSlot src={logoSrc} label={t.logoPlaceholder} />
          <span className="bp-title">{t.previewSampleTitle}</span>
          {coverSrc === null ? (
            <i className="bp-box bp-cover-photo bp-empty">{t.coverPlaceholder}</i>
          ) : (
            <img className="bp-box bp-cover-photo bp-image" src={coverSrc} alt="" />
          )}
          <span>{identity}</span>
          <span className="bp-footer">
            <span>{formLine}</span>
          </span>
          <figcaption className="bp-caption">{t.previewCover}</figcaption>
        </figure>

        <figure className="bp-page bp-strip">
          <span className="bp-header">
            <LogoSlot src={logoSrc} label={t.logoPlaceholder} />
            <span>{headerLine}</span>
          </span>
          <span className="bp-lines">
            <i className="bp-line" />
            <i className="bp-line" />
            <i className="bp-line short" />
          </span>
          <figcaption className="bp-caption">{t.previewHeader}</figcaption>
        </figure>

        <figure className="bp-page bp-strip">
          <span className="bp-lines">
            <i className="bp-line" />
            <i className="bp-line short" />
            <i className="bp-line" />
          </span>
          <span className="bp-footer">
            <span>{empresaFooterLine(empresa)}</span>
            <span>{t.previewPageNumber}</span>
          </span>
          <figcaption className="bp-caption">{t.previewFooter}</figcaption>
        </figure>
      </div>
      <p className="bp-note">{t.previewNote}</p>
    </div>
  );
}
