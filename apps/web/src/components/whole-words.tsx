import { Fragment } from 'react';

/**
 * Review fixes 2026-10-08 (DC-1, DB-3, DA-6): a label as its words, each in a `className` span the
 * surface styles unbreakable (`white-space: nowrap`), so a line breaks only between words, never
 * inside one at a hyphen ("X3-" over "X0", "Para-" over "raio"). The text is the label as it is.
 */
export function WholeWords({ text, className }: { text: string; className: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <Fragment key={i}>
          {i === 0 ? null : ' '}
          <span className={className}>{word}</span>
        </Fragment>
      ))}
    </>
  );
}
