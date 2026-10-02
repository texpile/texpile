import { Atom } from '../../core/atom-class';
import { Mode } from '../../core/modes-utils';
import { parseLatex } from '../../core/parser';
import type { PrivateStyle } from '../../core/types';
import { GroupAtom } from '../../atoms/group';
import { SubsupAtom } from '../../atoms/subsup';
import { LeftRightAtom } from '../../atoms/leftright';
import { TextAtom } from '../../atoms/text';
import {
  charToLatex,
  getDefinition,
  MATH_SYMBOLS,
} from '../../latex-commands/definitions-utils';
import type {
  Argument,
  LatexCommandDefinition,
} from '../../latex-commands/types';
import {
  hasTypstError,
  parseTypstSyntax,
  type TypstSyntaxNode,
} from '../syntax';
import {
  typstShorthandValue,
  typstSymbolValue,
  withoutPresentation,
} from '../symbols';
import type { TypstSpelling } from '../spelling';
import {
  DELIMITERS,
  inverse,
  LIMIT_OPERATORS,
  NAMED_LATEX,
  OPERATOR_TEXT,
  OPERATORS,
  STRETCHED_ARROWS,
} from '../names';
import { readCall } from './read-call';
import { readLines } from './read-grid';

/** the source being read and the style the content at hand is in */
export type TypstReader = { src: string; style: PrivateStyle };

const TRIVIA = new Set(['Space', 'LineComment', 'BlockComment']);

// characters MathLive only sizes and places limits on when they come in as these commands
const LARGE_OPERATORS: Readonly<Record<string, string>> = {
  '∑': '\\sum',
  '∏': '\\prod',
  '∐': '\\coprod',
  '∫': '\\int',
  '∬': '\\iint',
  '∭': '\\iiint',
  '∮': '\\oint',
  '∯': '\\oiint',
  '∰': '\\oiiint',
  '⋃': '\\bigcup',
  '⋂': '\\bigcap',
  '⨁': '\\bigoplus',
  '⨂': '\\bigotimes',
  '⨀': '\\bigodot',
  '⨄': '\\biguplus',
  '⨆': '\\bigsqcup',
  '⋁': '\\bigvee',
  '⋀': '\\bigwedge',
  '∱': '\\intclockwise',
  '∲': '\\varointclockwise',
  '∳': '\\ointctrclockwise',
  '⨑': '\\intctrclockwise',
  '⋒': '\\Cap',
  '⋓': '\\Cup',
  '⊔': '\\sqcup',
  '⊓': '\\sqcap',
  '⊎': '\\uplus',
  '≀': '\\wr',
  '⨿': '\\amalg',
};

/** atoms for the Typst between `$` and `$`, each keeping the source it was read from */
export function readTypst(
  src: string,
  style: PrivateStyle = {}
): { atoms: Atom[]; lead: string; trail: string } {
  const math = parseTypstSyntax(src);
  const reader: TypstReader = { src, style };
  return {
    atoms: readMath(reader, math),
    lead: src.slice(0, math.from),
    trail: src.slice(math.to),
  };
}

export function sourceOf(r: TypstReader, node: TypstSyntaxNode): string {
  return r.src.slice(node.from, node.to);
}

/** a symbol-like atom as written: the spelling holds while the atom keeps its value */
export function named(atom: Atom, name: string): Atom {
  return keep(atom, name, { name, value: atom.value });
}

/** records `node` as the source of `atom`, which is final from here on */
export function keep(
  atom: Atom,
  verbatim: string,
  spelling?: TypstSpelling
): Atom {
  if (spelling) atom.typstSpelling = { ...atom.typstSpelling, ...spelling };
  atom.verbatimTypst = verbatim;
  return atom;
}

export function isTrivia(node: TypstSyntaxNode): boolean {
  return TRIVIA.has(node.kind);
}

/** a Math node's content: a sequence, or a grid when it breaks lines or aligns */
export function readMath(r: TypstReader, node: TypstSyntaxNode): Atom[] {
  if (node.kind !== 'Math') return readSequence(r, [node]);
  if (
    node.children.some(
      (c) => c.kind === 'Linebreak' || c.kind === 'MathAlignPoint'
    )
  )
    return [readLines(r, node)];
  return readSequence(r, node.children);
}

/**
 * Nodes side by side; the whitespace and comments between them become each atom's lead.
 * `special` reads the nodes only some contexts have, such as a call's commas.
 */
export function readSequence(
  r: TypstReader,
  nodes: readonly TypstSyntaxNode[],
  special?: (node: TypstSyntaxNode) => Atom[] | undefined
): Atom[] {
  const out: Atom[] = [];
  let lead = '';
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isTrivia(node)) {
      lead += sourceOf(r, node);
      continue;
    }
    let atoms: Atom[];
    if (node.kind === 'Hash') {
      const end = codeEnd(nodes, i);
      atoms = [codeAtom(r.src.slice(node.from, nodes[end].to))];
      i = end;
    } else atoms = special?.(node) ?? readNode(r, node);
    if (atoms.length === 0) continue;
    atoms[0].typstLead = lead;
    lead = '';
    out.push(...atoms);
  }
  return out;
}

/** the last node of the code a `#` at `hash` starts: its expression, and a `;` closing it */
export function codeEnd(
  nodes: readonly TypstSyntaxNode[],
  hash: number
): number {
  let end = nodes[hash + 1] ? hash + 1 : hash;
  if (
    nodes[end + 1]?.kind === 'Semicolon' &&
    nodes[end + 1].from === nodes[end].to
  )
    end++;
  return end;
}

export function readNode(r: TypstReader, node: TypstSyntaxNode): Atom[] {
  switch (node.kind) {
    case 'Math':
      return readMath(r, node);
    case 'MathText':
      return [...sourceOf(r, node)].map((ch) => named(charAtom(r, ch), ch));
    case 'MathIdent':
    case 'MathFieldAccess':
      return [readName(r, sourceOf(r, node))];
    case 'MathShorthand': {
      const text = sourceOf(r, node);
      return [named(symbolAtom(r, typstShorthandValue(text) ?? text), text)];
    }
    case 'MathPrimes':
      return [...sourceOf(r, node)].map((p) => named(symbolAtom(r, '′'), p));
    case 'Str':
      return readString(r, node);
    case 'Escape':
      return [readEscape(r, node)];
    case 'MathAttach':
      return readAttach(r, node);
    case 'MathFrac':
      return [readFrac(r, node)];
    case 'MathRoot':
      return [readRoot(r, node)];
    case 'MathDelimited':
      return readDelimited(r, node);
    case 'MathCall':
      return readCall(r, node);
    default:
      return [codeAtom(sourceOf(r, node), hasTypstError(node))];
  }
}

/** an atom built by a LaTeX command's own definition, from arguments already read */
export function commandAtom(
  r: TypstReader,
  command: string,
  args: (readonly Atom[] | null)[]
): Atom {
  const definition = getDefinition(command) as LatexCommandDefinition;
  return definition.createAtom!({
    command,
    args: args as Argument[],
    style: r.style,
    mode: 'math',
  });
}

// characters MathLive's math reads the LaTeX way, `~` as a space and `'` as a prime, which Typst
// draws as themselves
const LITERAL_CHARS = new Set(['~', "'", '`', '"', '*']);

export function charAtom(r: TypstReader, ch: string): Atom {
  const operator = LARGE_OPERATORS[ch];
  if (operator) return parseLatex(operator, { style: r.style })[0];
  if (LITERAL_CHARS.has(ch)) {
    const code = ch.codePointAt(0)!.toString(16).toUpperCase();
    const [literal] = parseLatex(`\\char"${code}`, { style: r.style });
    literal.value = ch;
    return literal;
  }
  // MathLive reads − as a command of its own and writes it back bare, which pdflatex rejects; `-`
  // draws the same minus
  const command = ch === '\u2212' ? '-' : (plainCommand(ch) ?? ch);
  const atom =
    Mode.createAtom('math', command, r.style) ??
    new Atom({ type: 'mord', mode: 'math', value: ch, style: r.style });
  // ≠ and ⟺ come in as the command MathLive spells them with, which alone knows their class
  if (atom.type === 'mord' && atom.command.startsWith('\\')) {
    const [parsed] = parseLatex(atom.command);
    const core =
      parsed?.type === 'macro'
        ? parsed.body?.find((x) => x.type !== 'first' && x.type !== 'spacing')
        : parsed;
    // a class it can be drawn in: `\textbullet` is no math, which MathLive marks an error
    if (core?.type && /^m(bin|rel|open|close|punct|inner|op)$/.test(core.type))
      atom.type = core.type;
  }
  return atom;
}

let plainCommands: Map<number, string> | undefined;

/**
 * The command for a character MathLive has several for, where the one it picks first is not
 * what Typst draws: plain over AMS (`\sim`, not `\thicksim`), a relation over an ordinary
 * (`\parallel`, not `\Vert`), and a symbol over a spaced macro (`\Longleftrightarrow`, not `\iff`)
 */
function plainCommand(ch: string): string | undefined {
  if (!plainCommands) {
    const rank = (command: string): number => {
      const symbol = MATH_SYMBOLS[command];
      if (!symbol) return -1;
      return (symbol.variant ? 0 : 2) + (symbol.type === 'mrel' ? 1 : 0);
    };
    plainCommands = new Map();
    for (const [command, { codepoint }] of Object.entries(MATH_SYMBOLS)) {
      if (!command.startsWith('\\')) continue;
      const best =
        plainCommands.get(codepoint) ?? charToLatex('math', codepoint);
      if (rank(command) > rank(best)) plainCommands.set(codepoint, command);
    }
  }
  return plainCommands.get(ch.codePointAt(0)!);
}

/** the atom for a symbol's value: one atom however many code points the value has */
export function symbolAtom(r: TypstReader, symbol: string): Atom {
  // `arrow.l.r` asks for the text form of ↔, which is the one math draws anyway
  const value = withoutPresentation(symbol);
  if ([...value].length === 1) return charAtom(r, value);
  return new Atom({
    type: 'mord',
    mode: 'math',
    value,
    command: value,
    style: r.style,
  });
}

/** an identifier: a symbol, a predefined operator or constant, or a name typst defines elsewhere */
export function readName(r: TypstReader, name: string): Atom {
  const value = typstSymbolValue(name);
  if (value !== undefined) return named(symbolAtom(r, value), name);
  // an operator as MathLive's own command, else as its name; `liminf` shows as lim inf
  const operator = `\\operatorname${LIMIT_OPERATORS.has(name) ? '*' : ''}{${(
    OPERATOR_TEXT[name] ?? name
  ).replace(/ /g, '\\,')}}`;
  let latex = NAMED_LATEX[name];
  if (!latex && (OPERATORS.has(name) || LIMIT_OPERATORS.has(name)))
    latex = getDefinition(`\\${name}`) ? `\\${name}` : operator;
  // a command MathLive expands (`\\mod` is a space, a name and more space) is shown by name instead
  let atoms = latex ? parseLatex(latex, { style: r.style }) : [];
  if (atoms.length !== 1 || atoms[0].type === 'macro')
    atoms = parseLatex(operator, { style: r.style });
  return keep(atoms[0], name, { name });
}

function readString(r: TypstReader, node: TypstSyntaxNode): Atom[] {
  const source = sourceOf(r, node);
  const value = source
    .slice(1, -1)
    .replace(/\\u\{([0-9a-fA-F]+)\}|\\(.)/g, (_, hex, ch) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { n: '\n', t: '\t', r: '\r' }[ch as string] ?? ch;
    });
  // an empty string is a base or a spacer: it has to survive with nothing to show
  if (!value) return [codeAtom(source)];
  const atoms = [...value].map((ch) => keep(new TextAtom(ch, ch, r.style), ch));
  atoms[0].typstSpelling = { str: true };
  return atoms;
}

function readEscape(r: TypstReader, node: TypstSyntaxNode): Atom {
  const source = sourceOf(r, node);
  return named(symbolAtom(r, escapeValue(source)), source);
}

/** the character an escape stands for: `\\{` or `\\u{27E8}` */
function escapeValue(source: string): string {
  const hex = /^\\u\{([0-9a-fA-F]+)\}$/.exec(source);
  return hex ? String.fromCodePoint(parseInt(hex[1], 16)) : source.slice(1);
}

/**
 * `lr(\\{ x)`, which sizes a delimiter at either end that pairs with nothing: MathLive's
 * `\\left\\{ x \\right.`
 */
export function readSized(
  r: TypstReader,
  nodes: readonly TypstSyntaxNode[]
): Atom | undefined {
  const delimiter = (node: TypstSyntaxNode | undefined) => {
    if (!node) return undefined;
    const text = sourceOf(r, node);
    if (node.kind === 'Escape') return DELIMITERS[escapeValue(text)];
    if (node.kind === 'MathShorthand' || node.kind === 'MathText')
      return DELIMITERS[delimiterValue(r, node)];
    return DELIMITERS[typstSymbolValue(text) ?? ''];
  };
  const left = delimiter(nodes[0]);
  const right =
    nodes.length > 1 ? delimiter(nodes[nodes.length - 1]) : undefined;
  if (!left && !right) return undefined;
  const inner = trimTrivia(
    nodes.slice(left ? 1 : 0, right ? nodes.length - 1 : nodes.length)
  );
  return new LeftRightAtom('left...right', readSequence(r, inner), {
    leftDelim: left ?? '.',
    rightDelim: right ?? '.',
    style: r.style,
  });
}

/** `#code`, or source Typst could not parse, kept byte for byte as a chip nothing can edit */
export function codeAtom(code: string, error = false): Atom {
  const style: PrivateStyle = { fontFamily: 'monospace' };
  if (error) style.color = '#dc2626';
  const shown =
    code === '""' ? [] : [...code].map((ch) => new TextAtom(ch, ch, style));
  const atom = new GroupAtom(shown, 'text');
  atom.captureSelection = true;
  return keep(atom, code, { code });
}

/** how an operand's parentheses were written: none, a pair Typst strips, or one never closed */
export type OperandParens = boolean | 'open';

/** a script or fraction operand: Typst drops the parentheses around one */
export function readOperand(
  r: TypstReader,
  node: TypstSyntaxNode
): { atoms: Atom[]; parens: OperandParens } {
  const kids = node.children;
  if (
    node.kind === 'Math' &&
    kids[0]?.kind === 'LeftParen' &&
    kids[kids.length - 1]?.kind === 'RightParen'
  )
    return { atoms: readSequence(r, kids.slice(1, -1)), parens: true };
  // `1/(2 (x)`: a `(` never closed takes the rest as the operand, and shows
  if (
    node.kind === 'Math' &&
    kids[0]?.kind === 'MathText' &&
    sourceOf(r, kids[0]) === '('
  )
    return { atoms: readSequence(r, kids), parens: 'open' };
  return { atoms: readNode(r, node), parens: false };
}

/** an operand that may be `#code`, which Typst keeps as two nodes */
function readOperands(
  r: TypstReader,
  nodes: readonly TypstSyntaxNode[]
): { atoms: Atom[]; parens: OperandParens } {
  if (nodes.length === 1) return readOperand(r, nodes[0]);
  return { atoms: readSequence(r, nodes), parens: false };
}

/**
 * A base with scripts. As MathLive's own parser does, the scripts go on the base only when it
 * takes limits (`sum`, `integral`); anything else is followed by a separate `subsup` atom
 * carrying them, which is what MathLive draws and edits.
 */
function readAttach(r: TypstReader, node: TypstSyntaxNode): Atom[] {
  const kids = node.children;
  const baseEnd = kids[0].kind === 'Hash' ? codeEnd(kids, 0) : 0;
  const base =
    baseEnd > 0
      ? [codeAtom(r.src.slice(kids[0].from, kids[baseEnd].to))]
      : readNode(r, kids[0]);
  const last = base[base.length - 1];
  // operators place their own scripts; a brace's script branch is its annotation, so
  // `overbrace(x, a)^b` scripts it apart
  const carrier =
    base.length === 1 &&
    last.subsupPlacement !== undefined &&
    PLACES_SCRIPTS.has(last.type ?? '') &&
    last.command !== '\\overbrace' &&
    last.command !== '\\underbrace'
      ? last
      : new SubsupAtom({ style: r.style });
  const rest = kids.slice(baseEnd + 1);
  const parens: [OperandParens, OperandParens] = [false, false];
  let primes: Atom[] = [];
  let primed = false;
  for (let i = 0; i < rest.length; i++) {
    const part = rest[i];
    if (part.kind === 'MathPrimes') {
      primes = readNode(r, part);
      primed = true;
      continue;
    }
    if (part.kind !== 'Underscore' && part.kind !== 'Hat') continue;
    let j = i + 1;
    while (rest[j] && isTrivia(rest[j])) j++;
    if (!rest[j]) break;
    let operand: { atoms: Atom[]; parens: OperandParens };
    if (rest[j].kind === 'Hash') {
      const end = codeEnd(rest, j);
      operand = {
        atoms: [codeAtom(r.src.slice(rest[j].from, rest[end].to))],
        parens: false,
      };
      j = end;
    } else operand = readOperand(r, rest[j]);
    // `x^'` scripts the prime symbol, written apart from `x'` (they differ on `sum`)
    if (part.kind === 'Hat' && rest[j].kind === 'MathPrimes')
      for (const prime of operand.atoms)
        prime.typstSpelling = { ...prime.typstSpelling, name: 'prime' };
    if (part.kind === 'Underscore') {
      carrier.subscript = operand.atoms;
      parens[0] = operand.parens;
    } else {
      carrier.superscript = [...primes, ...operand.atoms];
      primes = [];
      parens[1] = operand.parens;
    }
    i = j;
  }
  if (primes.length > 0) carrier.superscript = primes;
  if (carrier === last) return [keep(last, sourceOf(r, node), { parens })];
  // what `limits()` holds and cannot place scripts itself; primes stay beside it, as Typst
  // draws them
  if (
    base.length === 1 &&
    last.subsupPlacement === 'over-under' &&
    !PLACES_SCRIPTS.has(last.type ?? '') &&
    !primed
  )
    return [keep(overUnder(r, last, carrier), sourceOf(r, node), { parens })];
  const scriptsFrom = kids[baseEnd].to;
  carrier.typstLead = '';
  return [
    ...base,
    keep(carrier, r.src.slice(scriptsFrom, node.to), { parens }),
  ];
}

// the atoms MathLive draws scripts on itself, placed as `subsupPlacement` asks
const PLACES_SCRIPTS = new Set([
  'mop',
  'operator',
  'extensible-symbol',
  'overunder',
]);

let stretchedArrows: Map<string, string> | undefined;

/**
 * `limits(x)^a` and `stretch(arrow.r)^f`, which MathLive cannot script under and over an
 * ordinary atom: the base under and over what scripts it, as `\overset` or `\xrightarrow` puts it
 */
function overUnder(r: TypstReader, base: Atom, scripts: Atom): Atom {
  const above = scripts.superscript;
  const below = scripts.subscript;
  const wrap = base.typstSpelling?.wrap;
  base.subsupPlacement = undefined;
  base.explicitSubsupPlacement = false;
  base.verbatimTypst = undefined;
  base.typstSpelling = {
    ...base.typstSpelling,
    wrap: undefined,
    args: undefined,
  };
  stretchedArrows ??= new Map(
    Object.entries(inverse(STRETCHED_ARROWS)).map(([name, command]) => [
      withoutPresentation(typstSymbolValue(name)!),
      command,
    ])
  );
  const arrow =
    wrap === 'stretch' ? stretchedArrows.get(base.value ?? '') : undefined;
  if (arrow) return commandAtom(r, arrow, [below ?? null, above ?? []]);
  const atom =
    above && below
      ? commandAtom(r, '\\overunderset', [above, below, [base]])
      : above
        ? commandAtom(r, '\\overset', [above, [base]])
        : commandAtom(r, '\\underset', [below ?? [], [base]]);
  // what `stretch()` fits to its scripts is written back so
  if (wrap === 'stretch') atom.typstSpelling = { name: 'stretch' };
  return atom;
}

function readFrac(r: TypstReader, node: TypstSyntaxNode): Atom {
  const slash = node.children.findIndex((c) => c.kind === 'Slash');
  const numNodes = trimTrivia(node.children.slice(0, slash));
  const denNodes = trimTrivia(node.children.slice(slash + 1));
  const denNode = denNodes[0];
  const num = readOperands(r, numNodes);
  const den = readOperands(r, denNodes);
  const atom = commandAtom(r, '\\frac', [num.atoms, den.atoms]);
  return keep(atom, sourceOf(r, node), {
    slash: r.src.slice(numNodes[numNodes.length - 1].to, denNode.from),
    parens: [num.parens, den.parens],
  });
}

function readRoot(r: TypstReader, node: TypstSyntaxNode): Atom {
  const [sign, radicand] = node.children.filter((c) => !isTrivia(c));
  const glyph = sourceOf(r, sign);
  const index = { '∛': '3', '∜': '4' }[glyph];
  const atom = commandAtom(r, '\\sqrt', [
    index ? [charAtom(r, index)] : null,
    readOperand(r, radicand).atoms,
  ]);
  return keep(atom, sourceOf(r, node), { name: glyph });
}

/** what a delimiter node stands for: `[|` is a shorthand for ⟦ */
function delimiterValue(r: TypstReader, node: TypstSyntaxNode): string {
  const text = sourceOf(r, node);
  return node.kind === 'MathShorthand'
    ? (typstShorthandValue(text) ?? text)
    : text;
}

function readDelimited(r: TypstReader, node: TypstSyntaxNode): Atom[] {
  const kids = node.children;
  const open = kids[0];
  const close = kids[kids.length - 1];
  const inner = trimTrivia(kids.slice(1, -1));
  const body = readSequence(r, inner);
  const leftDelim = DELIMITERS[delimiterValue(r, open)];
  const rightDelim = DELIMITERS[delimiterValue(r, close)];
  const contentFrom = inner[0]?.from ?? open.to;
  const contentTo = inner[inner.length - 1]?.to ?? open.to;
  if (!leftDelim || !rightDelim) {
    // a delimiter MathLive cannot stretch: the pieces stay side by side
    const first = named(
      symbolAtom(r, delimiterValue(r, open)),
      sourceOf(r, open)
    );
    const last = named(
      symbolAtom(r, delimiterValue(r, close)),
      sourceOf(r, close)
    );
    if (body[0]) body[0].typstLead = r.src.slice(open.to, contentFrom);
    last.typstLead = r.src.slice(contentTo, close.from);
    return [first, ...body, last];
  }
  const atom = new LeftRightAtom('', body, {
    leftDelim,
    rightDelim,
    style: r.style,
  });
  return [
    keep(atom, sourceOf(r, node), {
      open: r.src.slice(open.from, contentFrom),
      close: r.src.slice(contentTo, close.to),
      value: `${leftDelim} ${rightDelim}`,
    }),
  ];
}

/** nodes without the whitespace and comments at either end */
export function trimTrivia(
  nodes: readonly TypstSyntaxNode[]
): TypstSyntaxNode[] {
  let from = 0;
  let to = nodes.length;
  while (from < to && isTrivia(nodes[from])) from++;
  while (to > from && isTrivia(nodes[to - 1])) to--;
  return nodes.slice(from, to);
}
