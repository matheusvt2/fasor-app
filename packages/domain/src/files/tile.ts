import { MAX_FILE_BYTES } from './candidate.ts';

/*
 * The pt-BR line an upload tile shows under its control. Derived text, so it lives
 * here and not in `apps/web` (AGENTS.md "Where a new user-facing string goes":
 * "composed rows" and tile lines are kernel output).
 */

export interface FileTileInput {
  /** The picked file's name, when this device is the one that picked it; null elsewhere. */
  name: string | null;
  mime: string;
  size: number;
  /** AD-7: null until `PUT /api/files/{id}` stored the object. */
  uploaded_at: string | null;
}

const MIME_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/svg+xml': 'SVG',
};

/** "3,2 MB" / "820 kB" / "512 B", pt-BR decimal comma, one decimal above 1 kB. */
export function fileSizeText(bytes: number): string {
  const safe = Math.max(0, Math.round(bytes));
  if (safe < 1024) return `${safe} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = safe / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1).replace('.', ',')} ${units[unit]}`;
}

/** "Envio pendente" until the server stored the object, "Enviado" afterwards. */
export function fileUploadStateText(uploadedAt: string | null): string {
  return uploadedAt === null ? 'Envio pendente' : 'Enviado';
}

/** The tile's one line: what the file is, how big it is and whether the server has it. */
export function fileTileLine(input: FileTileInput): string {
  const what = input.name ?? MIME_LABEL[input.mime] ?? input.mime;
  return `${what} · ${fileSizeText(input.size)} · ${fileUploadStateText(input.uploaded_at)}`;
}

/** The empty tile's line, the same sentence for every kind. */
export const NO_FILE_TEXT = 'Nenhum arquivo';

/** The helper that states the limit, shared by every tile. */
export const FILE_LIMIT_TEXT = `Até ${fileSizeText(MAX_FILE_BYTES)}`;
