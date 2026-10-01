/*
 * Test support (Story 7.3): a small, valid PDF of `pages` A4 pages, each with a frame and
 * its page number, written by hand with a correct cross-reference table so pdfjs and
 * LibreOffice's PDF import both read it. Used by the rasterize tests and the e2e that
 * attaches a certificate; never by the renderer.
 */

/** A4 in PDF points. */
const A4 = { width: 595, height: 842 } as const;

export function samplePdf(pages: number, size: { width: number; height: number } = A4): Buffer {
  const objects: string[] = [];
  const pageIds = Array.from({ length: pages }, (_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (const [i, id] of pageIds.entries()) {
    const stream = `0.2 0.3 0.6 RG 4 w 36 36 ${size.width - 72} ${size.height - 72} re S BT /F1 36 Tf 72 ${size.height - 144} Td (Certificado pagina ${i + 1}) Tj ET`;
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
  }
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, 'latin1');
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
