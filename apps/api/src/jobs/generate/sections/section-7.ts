import { livePhotos, PHOTO_UNAVAILABLE_TEXT, type LayoutPhoto, type LayoutSectionPhotos, type RelatorioSnapshot } from '@app/domain';
import { AlignmentType, Paragraph, Table, TableBorders, TableCell, TableRow, WidthType } from 'docx';
import sharp from 'sharp';
import { logError } from '../../../log.ts';
import { CONTENT_WIDTH_TWIPS, image, PX_PER_CM, sizedImage, text } from '../docx.ts';

/*
 * Story 7.2 (AC1): section 7, the photo record, rendered from the kernel's
 * `LayoutSectionPhotos`. A borderless two-column table, two photos per row, each row kept
 * whole on a page; in each cell the `print` variant fitted into 8.5 x 6.4 cm keeping its
 * aspect, then the caption (the bold "Imagem 5:" run and the caption run) and, at 9 pt,
 * the stamp line and the checklist item line. A photo whose bytes the job could not load
 * prints the kernel's `PHOTO_UNAVAILABLE_TEXT` in place of the image and keeps its number.
 * No string is composed here.
 */

/** 9 pt, in half-points. */
const SMALL_SIZE = 18;
const IMAGE_MAX_WIDTH_CM = 8.5;
const IMAGE_MAX_HEIGHT_CM = 6.4;
/** How many photo reads run at once. */
const LOAD_CONCURRENCY = 8;

/**
 * The `print` variant of every live photo of the snapshot, by file id, read with
 * `readPrint` (the job's S3 reader). A photo with no stored bytes, or bytes sharp cannot
 * read, is left out and logged; nothing here throws, so no photo can fail the revision.
 */
export async function loadPhotoImages(
  snapshot: Pick<RelatorioSnapshot, 'files'>,
  readPrint: (fileId: string) => Promise<Buffer | undefined>,
  context: Record<string, unknown> = {},
): Promise<Map<string, Buffer>> {
  const ids = livePhotos(snapshot).map((photo) => photo.id);
  const out = new Map<string, Buffer>();
  const missing: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]!;
      try {
        const bytes = await readPrint(id);
        if (bytes === undefined) {
          missing.push(id);
          continue;
        }
        await sharp(bytes).metadata();
        out.set(id, bytes);
      } catch (error) {
        logError('generate photo unreadable', { ...context, file_id: id, error: String(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, ids.length) }, worker));
  if (missing.length > 0) logError('generate photos without print bytes', { ...context, count: missing.length, file_ids: missing });
  return out;
}

async function photoCell(photo: LayoutPhoto | undefined, photos: ReadonlyMap<string, Buffer>, width: number): Promise<TableCell> {
  const children: Paragraph[] = [];
  if (photo !== undefined) {
    const bytes = photos.get(photo.fileId);
    const sized = bytes === undefined ? null : await sizedImage(bytes, Math.round(IMAGE_MAX_WIDTH_CM * PX_PER_CM), Math.round(IMAGE_MAX_HEIGHT_CM * PX_PER_CM));
    children.push(
      sized === null
        ? new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [text(PHOTO_UNAVAILABLE_TEXT)] })
        : new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [image(sized)] }),
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [text(photo.label, { bold: true }), ...(photo.caption === null ? [] : [text(photo.caption)])],
      }),
    );
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [text(photo.stamp, { size: SMALL_SIZE })] }));
    if (photo.itemLine !== null) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [text(photo.itemLine, { size: SMALL_SIZE })] }));
  } else {
    children.push(new Paragraph({}));
  }
  return new TableCell({ width: { size: width, type: WidthType.DXA }, children });
}

/** Section 7's body: the photo table, two photos per row. */
export async function section7Children(section: LayoutSectionPhotos, photos: ReadonlyMap<string, Buffer>): Promise<(Paragraph | Table)[]> {
  const half = Math.floor(CONTENT_WIDTH_TWIPS / 2);
  const rows: TableRow[] = [];
  for (let i = 0; i < section.photos.length; i += 2) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [await photoCell(section.photos[i], photos, half), await photoCell(section.photos[i + 1], photos, CONTENT_WIDTH_TWIPS - half)],
      }),
    );
  }
  return [
    new Table({
      width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
      columnWidths: [half, CONTENT_WIDTH_TWIPS - half],
      borders: TableBorders.NONE,
      rows,
    }),
  ];
}
