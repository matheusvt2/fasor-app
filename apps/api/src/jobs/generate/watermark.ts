import sharp from 'sharp';

/*
 * Story 7.5: the preview's watermark image. The kernel's layout names the word
 * (`DRAFT_WATERMARK`, "RASCUNHO"); this draws it once as a transparent PNG, light grey on a
 * diagonal, which `docx.ts` anchors behind the text in the default header so every page of
 * the preview carries it. Issued documents never have one.
 */

/** The PNG's side in pixels (a square, so the diagonal word fits the page's middle). */
export const WATERMARK_SIZE_PX = 1200;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The watermark word drawn light grey on a 45 degree diagonal, transparent elsewhere. */
export async function watermarkPng(word: string): Promise<Buffer> {
  const half = WATERMARK_SIZE_PX / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WATERMARK_SIZE_PX}" height="${WATERMARK_SIZE_PX}">` +
    `<text x="${half}" y="${half}" font-family="Liberation Sans, Arial, sans-serif" font-size="200" font-weight="700" fill="#d0d0d0" ` +
    `text-anchor="middle" dominant-baseline="middle" transform="rotate(-45 ${half} ${half})">${escapeXml(word)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
