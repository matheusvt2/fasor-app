import { useId } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

interface DisabledReasonProps {
  /**
   * Disabled controls use `aria-disabled` plus a mandatory adjacent reason, never React
   * Aria's `isDisabled` (it strips the control from the tab order and hides the reason).
   * Omitting `disabledReason` while `isDisabled` is true is a component-level invariant
   * violation and throws in development.
   */
  isDisabled?: boolean;
  disabledReason?: string;
}

function assertReason({ isDisabled, disabledReason }: DisabledReasonProps, componentName: string): void {
  if (isDisabled && !disabledReason) {
    throw new Error(`${componentName}: isDisabled requires a disabledReason shown beside the control (aria-describedby).`);
  }
}

function mergeDescribedBy(existing: string | undefined, reasonId: string | null): string | undefined {
  return [existing, reasonId].filter(Boolean).join(' ') || undefined;
}

export interface ButtonProps
  extends Omit<AriaButtonProps, 'isDisabled' | 'className' | 'children'>,
    DisabledReasonProps {
  variant?: ButtonVariant;
  /** Stretches to the width of its container (`.btn-block`). */
  block?: boolean;
  children: React.ReactNode;
}

/**
 * Primary / secondary / destructive action button. Destructive actions are always the
 * outline-red `.btn-destructive` style, never a red fill (Boundaries & Constraints).
 */
export function Button({ variant = 'primary', block, isDisabled = false, disabledReason, onPress, children, ...rest }: ButtonProps) {
  assertReason({ isDisabled, disabledReason }, 'Button');
  const reasonId = useId();
  const className = ['btn', `btn-${variant}`, block && 'btn-block'].filter(Boolean).join(' ');

  return (
    <>
      <AriaButton
        {...rest}
        className={className}
        aria-disabled={isDisabled || undefined}
        aria-describedby={mergeDescribedBy(rest['aria-describedby'], isDisabled && disabledReason ? reasonId : null)}
        onPress={(event) => {
          if (isDisabled) return;
          onPress?.(event);
        }}
      >
        {children}
      </AriaButton>
      {isDisabled && disabledReason ? (
        <span className="btn-reason" id={reasonId}>
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}

export interface TextButtonProps
  extends Omit<AriaButtonProps, 'isDisabled' | 'className' | 'children'>,
    DisabledReasonProps {
  /** Destructive text actions (e.g. "Remover") take the red tone. */
  tone?: 'red';
  children: React.ReactNode;
}

/**
 * A secondary action that must not compete with the surface's primary Button
 * (Component Patterns › Text button). Same disabled + reason contract as Button.
 */
export function TextButton({ tone, isDisabled = false, disabledReason, onPress, children, ...rest }: TextButtonProps) {
  assertReason({ isDisabled, disabledReason }, 'TextButton');
  const reasonId = useId();
  const className = ['btn', 'btn-text'].join(' ');

  return (
    <>
      <AriaButton
        {...rest}
        className={className}
        data-tone={tone}
        aria-disabled={isDisabled || undefined}
        aria-describedby={mergeDescribedBy(rest['aria-describedby'], isDisabled && disabledReason ? reasonId : null)}
        onPress={(event) => {
          if (isDisabled) return;
          onPress?.(event);
        }}
      >
        {children}
      </AriaButton>
      {isDisabled && disabledReason ? (
        <span className="btn-reason" id={reasonId}>
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}
