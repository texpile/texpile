/**
 * How the Typst source wrote an atom: the parts an edit inside the atom leaves standing, so the
 * atom can be written back the way it was read once its verbatim source no longer applies.
 */
export type TypstSpelling = {
  /** the name, shorthand or call it was written with: `arrow.r`, `->`, `frac`, `bold`, `dif` */
  name?: string;
  /** a symbol: the value `name` stood for, so an atom whose value changed stops using it */
  value?: string;
  /** a call: the text before each argument (the `(` included) and, last, before the `)` */
  args?: string[];
  /** a call's named arguments, verbatim, kept for an edit to a positional one */
  named?: string[];
  /** a fraction written with `/`: the text between the operands */
  slash?: string;
  /** operands written in parentheses Typst strips (numerator and denominator, or subscript and
   *  superscript); `'open'` for one starting with a `(` never closed, written bare */
  parens?: [boolean | 'open', boolean | 'open'];
  /** a delimited group: its delimiters as written (`[|`, `(`) */
  open?: string;
  close?: string;
  /** a grid (mat, vec, cases, a multi-line equation): the text before each cell, by row */
  cells?: string[][];
  /** a grid: the environment it was read as, so one set otherwise since is written anew */
  environment?: string;
  /** the text after a grid's last cell or a group's last atom */
  end?: string;
  /** the first character of a string */
  str?: boolean;
  /** `#code` or an error kept as source */
  code?: string;
  /** an atom the source wrapped in a call that changes no structure: `limits`, `scripts`, `mid` */
  wrap?: string;
  /** a call MathLive has no structure for (`qty(...)`, `phi(...)`): the name, then its arguments */
  call?: string;
};
