import { TYPST_SYMBOLS } from './symbol-data';
import {
  isDeprecatedName,
  TYPST_ACCENT_NAMES,
  typstSymbolValue,
} from './symbols';
import { TYPST_STYLE_CALLS } from './style';

// The names Typst math has besides its symbols, and what MathLive draws each with. Each table is
// kept once, and read the other way round where reading and writing need it so.

/** `{ a: 'x' }` as `{ x: 'a' }`, the first name kept where two share a value */
export function inverse(
  table: Readonly<Record<string, string>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(table)) out[value] ??= name;
  return out;
}

// the math module's spacing
export const SPACES: Readonly<Record<string, string>> = {
  thin: '\\,',
  med: '\\:',
  thick: '\\;',
  quad: '\\quad',
  wide: '\\qquad',
};

// math-module names that are neither symbols nor functions
export const NAMED_LATEX: Readonly<Record<string, string>> = {
  dif: '\\mathrm{d}',
  Dif: '\\mathrm{D}',
  ...SPACES,
};

// typst's predefined operators; the ones it shows limits on display under and over
export const OPERATORS: ReadonlySet<string> = new Set(
  'arccos arcsin arctan arg cos cosh cot coth csc csch ctg deg dim exp hom id im ker lg ln log mod sec sech sin sinc sinh tan tanh tg tr'.split(
    ' '
  )
);
export const LIMIT_OPERATORS: ReadonlySet<string> = new Set(
  'det gcd lcm inf lim liminf limsup max min Pr sup'.split(' ')
);
// the operators shown otherwise than named
export const OPERATOR_TEXT: Readonly<Record<string, string>> = {
  liminf: 'lim inf',
  limsup: 'lim sup',
};

export const FENCES: Readonly<Record<string, [string, string]>> = {
  abs: ['|', '|'],
  norm: ['\\Vert', '\\Vert'],
  floor: ['\\lfloor', '\\rfloor'],
  ceil: ['\\lceil', '\\rceil'],
  round: ['\\lfloor', '\\rceil'],
};

export const ONE_ARG: Readonly<Record<string, string>> = {
  overline: '\\overline',
  underline: '\\underline',
  overparen: '\\overparen',
  underparen: '\\underparen',
  overshell: '\\overgroup',
  undershell: '\\undergroup',
};

/** the commands written as a call with one argument (a brace's annotation aside), by command */
export const COMMAND_CALLS: Readonly<Record<string, string>> = {
  ...inverse(ONE_ARG),
  '\\overarc': 'overparen',
  '\\wideparen': 'overparen',
  '\\underarc': 'underparen',
  // the line without its end ticks, the nearest Typst draws
  '\\overlinesegment': 'overline',
  '\\underlinesegment': 'underline',
  '\\overbrace': 'overbrace',
  '\\underbrace': 'underbrace',
  '\\cancel': 'cancel',
  '\\bcancel': 'cancel',
  '\\xcancel': 'cancel',
};

// the arrows MathLive stretches over and under a label, as the symbol Typst's `stretch()` takes
export const STRETCHED_ARROWS: Readonly<Record<string, string>> = {
  '\\xrightarrow': 'arrow.r',
  '\\longrightarrow': 'arrow.r',
  '\\xleftarrow': 'arrow.l',
  '\\longleftarrow': 'arrow.l',
  '\\xleftrightarrow': 'arrow.l.r',
  '\\longleftrightarrow': 'arrow.l.r',
  '\\xRightarrow': 'arrow.r.double',
  '\\xLeftarrow': 'arrow.l.double',
  '\\xLeftrightarrow': 'arrow.l.r.double',
  '\\xhookrightarrow': 'arrow.r.hook',
  '\\xhookleftarrow': 'arrow.l.hook',
  '\\xtwoheadrightarrow': 'arrow.r.twohead',
  '\\xtwoheadleftarrow': 'arrow.l.twohead',
  '\\xmapsto': 'arrow.r.bar',
  '\\xlongequal': 'eq',
  '\\xrightharpoonup': 'harpoon.rt',
  '\\xrightharpoondown': 'harpoon.rb',
  '\\xleftharpoonup': 'harpoon.lt',
  '\\xleftharpoondown': 'harpoon.lb',
  '\\xrightleftharpoons': 'harpoons.rtlb',
  '\\longrightleftharpoons': 'harpoons.rtlb',
  '\\xRightleftharpoons': 'harpoons.rtlb',
  '\\longRightleftharpoons': 'harpoons.rtlb',
  '\\xleftrightharpoons': 'harpoons.ltrb',
  '\\xLeftrightharpoons': 'harpoons.ltrb',
  '\\longLeftrightharpoons': 'harpoons.ltrb',
  '\\xtofrom': 'arrows.rl',
  '\\xleftrightarrows': 'arrows.lr',
  '\\longleftrightarrows': 'arrows.lr',
};

// typst's size calls
export const SIZES: Readonly<Record<string, string>> = {
  display: '\\displaystyle',
  inline: '\\textstyle',
  script: '\\scriptstyle',
  sscript: '\\scriptscriptstyle',
};

/** a matrix's `delim` argument, by the environment MathLive draws it as; parentheses need none */
export const MATRIX_DELIMS: Readonly<Record<string, string | undefined>> = {
  pmatrix: undefined,
  bmatrix: '"["',
  Bmatrix: '"{"',
  vmatrix: '"|"',
  Vmatrix: '"‖"',
  matrix: '#none',
};

// delimiters typst scales, as the commands MathLive's \left and \right take
export const DELIMITERS: Readonly<Record<string, string>> = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '{': '\\lbrace',
  '}': '\\rbrace',
  '|': '|',
  '‖': '\\Vert',
  '⟨': '\\langle',
  '⟩': '\\rangle',
  '⌊': '\\lfloor',
  '⌋': '\\rfloor',
  '⌈': '\\lceil',
  '⌉': '\\rceil',
  '⟮': '\\lgroup',
  '⟯': '\\rgroup',
};

/** the math functions MathLive has a structure for */
export const TYPST_FUNCTIONS: readonly string[] = [
  'frac',
  'binom',
  'sqrt',
  'root',
  'vec',
  'mat',
  'cases',
  ...Object.keys(FENCES),
  ...Object.keys(ONE_ARG),
  'overbrace',
  'underbrace',
  'cancel',
  ...TYPST_STYLE_CALLS,
];

// how a function shows in a list of names
const SAMPLES: Readonly<Record<string, string>> = {
  frac: 'frac(a, b)',
  binom: 'binom(n, k)',
  root: 'root(n, x)',
  mat: 'mat(a, b; c, d)',
  vec: 'vec(a, b)',
  cases: 'cases(a, b)',
};

/** a name that means something only as a call, so taking it opens one */
export function isFunctionName(name: string): boolean {
  return TYPST_FUNCTIONS.includes(name) && typstSymbolValue(name) === undefined;
}

/** what a name draws as, a function with an argument to show its shape */
export function typstNameSample(name: string): string {
  return SAMPLES[name] ?? (isFunctionName(name) ? `${name}(x)` : name);
}

/** a name Typst's math module defines, which reads as one atom */
export function isTypstConstant(name: string): boolean {
  return (
    NAMED_LATEX[name] !== undefined ||
    OPERATORS.has(name) ||
    LIMIT_OPERATORS.has(name)
  );
}

export type TypstName = {
  name: string;
  /** an accent is a symbol as well, called on what it goes over: `hat(x)` */
  kind: 'function' | 'accent' | 'symbol' | 'constant';
};

let names: TypstName[] | undefined;

/** every name typing completes to, deprecated ones aside; a symbol by its base and each variant */
export function typstNames(): readonly TypstName[] {
  if (names) return names;
  const list: TypstName[] = [];
  for (const name of TYPST_FUNCTIONS) list.push({ name, kind: 'function' });
  for (const name of new Set(Object.values(TYPST_ACCENT_NAMES)))
    list.push({ name, kind: 'accent' });
  for (const [base, entry] of Object.entries(TYPST_SYMBOLS)) {
    const variants =
      typeof entry === 'string'
        ? [base]
        : [base, ...entry.map(([mods]) => (mods ? `${base}.${mods}` : base))];
    for (const name of new Set(variants))
      if (!isDeprecatedName(name)) list.push({ name, kind: 'symbol' });
  }
  for (const name of [
    ...OPERATORS,
    ...LIMIT_OPERATORS,
    ...Object.keys(NAMED_LATEX),
  ])
    list.push({ name, kind: 'constant' });
  return (names = list);
}

let bases: string[] | undefined;

/**
 * Names starting with `prefix`, the closest first: before a dot the functions, symbols and
 * constants, after one the variants of the symbol it names.
 */
export function typstNamesStartingWith(prefix: string): string[] {
  const dot = prefix.indexOf('.');
  let found: string[];
  if (dot < 0) {
    bases ??= [
      ...new Set(
        typstNames()
          .map(({ name }) => name)
          .filter((name) => !name.includes('.'))
      ),
    ];
    found = bases.filter((name) => name.startsWith(prefix));
  } else {
    const base = `${prefix.slice(0, dot)}.`;
    found = typstNames()
      .filter(
        ({ name, kind }) =>
          kind === 'symbol' && name.startsWith(base) && name.startsWith(prefix)
      )
      .map(({ name }) => name);
  }
  return found.sort(
    (a, b) =>
      Number(b === prefix) - Number(a === prefix) ||
      a.length - b.length ||
      a.localeCompare(b)
  );
}
