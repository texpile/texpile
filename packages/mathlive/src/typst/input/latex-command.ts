import { getDefinition } from '../../latex-commands/definitions-utils';

/** what a Typst field reads from LaTeX mode: `#code` as Typst, `\frac{a}{b}` as the LaTeX a writer is used to */
export function typedGroupValue(source: string): {
  value: string;
  format: 'typst' | 'latex';
} {
  if (!source.startsWith('\\')) return { value: source, format: 'typst' };
  const name = /^\\[a-zA-Z]+/.exec(source)?.[0];
  // a name LaTeX does not know is the Typst name it spells
  if (name && !getDefinition(name, 'math'))
    return { value: source.slice(1), format: 'typst' };
  return { value: source, format: 'latex' };
}

/** whether `c` goes on with `\command` typed so far: letters of the name, then its `{}` and `[]` arguments */
export function continuesCommand(source: string, c: string): boolean {
  let depth = 0;
  for (const ch of source) {
    if ('{['.includes(ch)) depth++;
    else if ('}]'.includes(ch)) depth--;
  }
  if (depth > 0) return true;
  if (/^\\[a-zA-Z]*$/.test(source) && /^[a-zA-Z]$/.test(c)) return true;
  return source.length > 1 && '{['.includes(c);
}
