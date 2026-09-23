import { useId, type ReactNode } from 'react';
import { DialogShell } from './dialog-shell.tsx';

export interface FormDialogProps {
  isOpen: boolean;
  /** Called with false on Esc, on a tap on the scrim and on the system back. */
  onOpenChange: (isOpen: boolean) => void;
  /** The dialog's title, which also names it (`aria-labelledby`). */
  title: string;
  /** Fields, then the surface's own `.dialog-actions` row. */
  children: ReactNode;
  /** A modifier beside `.form-dialog` (the mock's `.rich-dialog`, for instance). */
  className?: string;
}

/**
 * `.form-dialog` (Component Patterns › Form dialog): `role="dialog"`, `aria-modal`,
 * initial focus on the first field, Esc/back cancels, focus back on the opener after a
 * cancel or a save. The surface owns the fields, the validation and the actions; this
 * component owns the modal behavior, through the same shell as the Confirm dialog.
 */
export function FormDialog({ isOpen, onOpenChange, title, children, className }: FormDialogProps) {
  const titleId = useId();
  return (
    <DialogShell
      className={className === undefined ? 'form-dialog' : `form-dialog ${className}`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      aria-labelledby={titleId}
    >
      <h2 className="dialog-title" id={titleId}>
        {title}
      </h2>
      {children}
    </DialogShell>
  );
}
