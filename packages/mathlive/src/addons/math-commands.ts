// Everything an equation can hold, as MathLive knows it: the LaTeX symbols, commands and
// environments it draws in math, or the Typst functions, symbols and operators the fork reads,
// each with what to insert for it. A list or search of all of them is built from this.
import type { MathCommand } from '../public/mathlive-ssr';
// side-effect: fills the tables read here
import '../latex-commands/definitions';
import {
  ENVIRONMENTS,
  LATEX_COMMANDS,
  MATH_SYMBOLS,
} from '../latex-commands/definitions-utils';
import { typstNames, typstNameSample } from '../typst/names';

// a required argument of these kinds is a place to type into; a color, a size or a delimiter is not
const TYPED_ARGUMENTS = new Set(['math', 'auto', 'expression', 'text']);

// MathLive's own commands, which LaTeX does not know
const NOT_LATEX = new Set([
  '\\placeholder',
  '\\error',
  '\\ensuremath',
  '\\mathtip',
  '\\texttip',
  '\\pdiff',
]);

// LaTeX's display environments: an equation sits in one, it cannot hold one
const DISPLAY_ONLY = new Set(
  'equation gather multline align alignat flalign eqnarray'
    .split(' ')
    .flatMap((name) => [name, `${name}*`])
    .concat('subequations')
);

function latexCommands(): MathCommand[] {
  const commands: MathCommand[] = [];
  // one entry per character drawn, its other names as aliases: `\le` and `\leq`
  const byCharacter = new Map<string, MathCommand>();
  for (const [name, definition] of Object.entries(MATH_SYMBOLS)) {
    if (!name.startsWith('\\')) continue;
    const key = `${definition.codepoint} ${definition.variant ?? ''}`;
    const same = byCharacter.get(key);
    if (same) {
      same.aliases.push(name);
      continue;
    }
    const command: MathCommand = {
      name,
      kind: 'symbol',
      insert: name,
      preview: name,
      aliases: [],
    };
    byCharacter.set(key, command);
    commands.push(command);
  }
  for (const [name, definition] of Object.entries(LATEX_COMMANDS)) {
    if (definition.infix || definition.ifMode === 'text' || NOT_LATEX.has(name))
      continue;
    const required = definition.params.filter((param) => !param.isOptional);
    if (!required.every((param) => TYPED_ARGUMENTS.has(param.type))) continue;
    const insert = name + required.map(() => '{#?}').join('');
    commands.push({
      name,
      kind: 'function',
      insert,
      preview: insert,
      aliases: [],
    });
  }
  for (const [name, definition] of Object.entries(ENVIRONMENTS)) {
    if (
      definition.rootOnly ||
      DISPLAY_ONLY.has(name) ||
      definition.params.some((p) => !p.isOptional)
    )
      continue;
    const body = definition.tabular ? '#?&#?\\\\#?&#?' : '#?';
    const insert = `\\begin{${name}}${body}\\end{${name}}`;
    commands.push({
      name: `\\begin{${name}}`,
      kind: 'environment',
      insert,
      preview: insert,
      aliases: [],
    });
  }
  return commands;
}

function typstCommands(): MathCommand[] {
  return typstNames().map(({ name, kind }): MathCommand => {
    // a call is typed, so it opens with the caret in it
    if (kind === 'function' || kind === 'accent')
      return {
        name,
        kind: 'function',
        insert: `${name}(`,
        typed: true,
        preview: kind === 'accent' ? `${name}(x)` : typstNameSample(name),
        aliases: [],
      };
    return {
      name,
      kind: kind === 'symbol' ? 'symbol' : 'function',
      insert: name,
      preview: name,
      aliases: [],
    };
  });
}

const cache: Partial<Record<'latex' | 'typst', readonly MathCommand[]>> = {};

export function mathCommands(
  syntax: 'latex' | 'typst'
): readonly MathCommand[] {
  return (cache[syntax] ??=
    syntax === 'typst' ? typstCommands() : latexCommands());
}
