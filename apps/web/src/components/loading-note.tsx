import { ui } from '../copy/ui.ts';

export interface LoadingNoteProps {
  /** What is being read, e.g. "relatórios": the note reads "Carregando relatórios…". */
  what: string;
}

/**
 * Matheus, 2026-09-30: a surface whose rows are still being read from the device store says
 * what it is reading, never a blank area or a bare spinner (EXPERIENCE.md, state patterns).
 * The app's existing loading markup (`p.section-note[role=status]`), in one place.
 */
export function LoadingNote({ what }: LoadingNoteProps) {
  return (
    <p className="section-note" role="status">
      {ui.loadingNote.text(what)}
    </p>
  );
}
