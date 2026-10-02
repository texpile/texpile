import type { Atom } from '../core/atom-class';
import { parseLatex } from '../core/parser';
import { argAtoms } from '../latex-commands/definitions-utils';
import type { PrivateStyle } from '../core/types';
import type { LatexValue } from '../public/core-types';
import type { ArrayAtom } from '../atoms/array';
import type { GenfracAtom } from '../atoms/genfrac';
import type { LeftRightAtom } from '../atoms/leftright';
import {
  typstAccentCommand,
  typstShorthandValue,
  typstSymbolName,
  typstSymbolValue,
  TYPST_ACCENT_NAMES,
} from './symbols';
import { applyTypstStyle, typstStyleCalls, TYPST_STYLE_CALLS } from './style';
import type { TypstSpelling } from './spelling';
import {
  children,
  hasScripts,
  isDigit,
  isNumber,
  isPrime,
  primeCount,
} from './atoms';
import { TYPST_MATH_SHORTHANDS } from './symbol-data';
import {
  COMMAND_CALLS,
  DELIMITERS,
  FENCES,
  inverse,
  LIMIT_OPERATORS,
  MATRIX_DELIMS,
  OPERATOR_TEXT,
  OPERATORS,
  SIZES,
  SPACES,
  STRETCHED_ARROWS,
} from './names';

// An atom whose `verbatimTypst` survived is written as it was read. Anything an edit reached is
// rebuilt from its structure, keeping what `typstSpelling` remembers of how the source wrote it,
// so only the edited atom and the syntax enclosing it change in the file.

/** the Typst for a field's root, or for atoms cut from one */
export function atomToTypst(atom: Atom | readonly Atom[] | undefined): string {
  if (!atom) return '';
  if (Array.isArray(atom))
    return writeBranch(atom as readonly Atom[], {}, true, false);
  const root = atom as Atom;
  if (root.type !== 'root') return writeBranch([root], {}, true, false);
  if (root.verbatimTypst !== undefined) return root.verbatimTypst;
  const spelling = root.typstSpelling ?? {};
  return `${spelling.open ?? ''}${writeBranch(root.body ?? [], {}, true, false)}${spelling.close ?? ''}`;
}

const NAMED_SPACING: Readonly<Record<string, string>> = {
  ...inverse(SPACES),
  '\\>': 'med',
  '\\ ': 'space',
  '\\space': 'space',
  '\\enskip': 'space.en',
  '\\enspace': 'space.en',
  '~': 'space.nobreak',
  '\\!': '#h(-1em/6)',
};

// a width's unit as a part of Typst's em, where Typst has no such unit
const EM_PARTS: Readonly<Record<string, number>> = { mu: 1 / 18, ex: 0.43 };

const SIZE_CALLS = inverse(SIZES);

const OPERATOR_NAMES = inverse(OPERATOR_TEXT);

const FENCE_CALLS: Readonly<Record<string, string>> = {
  ...inverse(
    Object.fromEntries(
      Object.entries(FENCES).map(([name, [left, right]]) => [
        name,
        `${left} ${right}`,
      ])
    )
  ),
  '\\vert \\vert': 'abs',
  '\\lVert \\rVert': 'norm',
};

const DELIMITER_TEXT: Readonly<Record<string, string>> = {
  ...inverse(DELIMITERS),
  '\\{': '{',
  '\\}': '}',
  '\\vert': '|',
  '\\lvert': '|',
  '\\rvert': '|',
  '\\|': '‖',
  '\\lVert': '‖',
  '\\rVert': '‖',
  '\\lbrack': '[',
  '\\rbrack': ']',
  '\\lparen': '(',
  '\\rparen': ')',
  '.': '',
};

const BRACE_ANNOTATIONS: Readonly<Record<string, 'superscript' | 'subscript'>> =
  { '\\overbrace': 'superscript', '\\underbrace': 'subscript' };

// characters Typst math reads as syntax, written escaped when they stand alone
const ESCAPED = new Set([
  '\\',
  '$',
  '#',
  '_',
  '^',
  '&',
  '/',
  '"',
  "'",
  '*',
  '~',
  '`',
]);
// what typst-syntax's shorthands are made of; two of them meeting may read as one shorthand
const SHORTHAND_PIECES = Object.keys(TYPST_MATH_SHORTHANDS).filter(
  (text) => text.length > 1
);

// the delimiters typst-syntax pairs, any opening one with any closing one; the characters of
// Unicode's opening and closing math classes
const OPENING = new Set([...'([{⌈⌊⌜⌞⎰❲⟅⟦⟨⟪⟬⟮⦃⦅⦇⦉⦋⦍⦏⦑⦓⦕⦗⧘⧚⧼', '[|']);
const CLOSING = new Set([...')]}⌉⌋⌝⌟⎱❳⟆⟧⟩⟫⟭⟯⦄⦆⦈⦊⦌⦎⦐⦒⦔⦖⦘⧙⧛⧽', '|]']);

/** a delimiter as a character Typst pairs with nothing: `\(`, and `\⟦` for `[|` */
function unpairedDelimiter(delimiter: string): string {
  if (!OPENING.has(delimiter) && !CLOSING.has(delimiter)) return delimiter;
  return `\\${typstShorthandValue(delimiter) ?? delimiter}`;
}

// whether the branch being written is inside a call's parentheses, where a comma or a semicolon
// ends the argument; what a branch holds at its own level, a slash fraction's operands or an
// equation's lines, is in the same place
let inArgument = false;

/** what one atom, or a run of atoms written together, writes as */
type Piece = {
  atom: Atom;
  /** where its last atom is in the branch */
  last: number;
  text: string;
  /** scripts MathLive keeps apart from their base, which attach to what came before */
  attached?: string;
};

/**
 * Atoms side by side, each after the whitespace the source had before it. In a call's
 * `argument` a comma or a semicolon is written as one, not as the end of the argument; left
 * out, the branch is where the one around it is.
 */
export function writeBranch(
  atoms: readonly Atom[],
  style: PrivateStyle,
  firstLead = true,
  argument?: boolean
): string {
  const outer = inArgument;
  inArgument = argument ?? outer;
  try {
    return writeAtoms(atoms, style, firstLead);
  } finally {
    inArgument = outer;
  }
}

function writeAtoms(
  atoms: readonly Atom[],
  style: PrivateStyle,
  firstLead: boolean
): string {
  const list = children(atoms);
  const pieces: Piece[] = [];
  for (let i = 0; i < list.length; i++) {
    const atom = list[i];
    if (
      atom.type === 'error' &&
      UNWRITTEN_WITH_ARGUMENT.test(atom.value ?? '')
    ) {
      if (list[i + 1]?.type === 'group') i++;
      continue;
    }
    let text: string;
    let end = i + 1;
    if (atom.mode === 'text' && !isCode(atom)) {
      // a run of text atoms is one string; a string the source started starts a new one
      while (
        end < list.length &&
        list[end].mode === 'text' &&
        !isCode(list[end]) &&
        !list[end].typstSpelling?.str
      )
        end++;
      text = writeString(list.slice(i, end));
    } else {
      const calls = ownsStyle(atom) ? [] : typstStyleCalls(style, atom.style);
      if (calls.length > 0) {
        // atoms styled alike share one call
        const key = calls.join();
        while (
          end < list.length &&
          !ownsStyle(list[end]) &&
          list[end].mode !== 'text' &&
          typstStyleCalls(style, list[end].style).join() === key
        )
          end++;
        const inner = writeBranch(list.slice(i, end), atom.style, false, true);
        text = calls.reduceRight(
          (body, call) => `${call}(${body})`,
          inner || '""'
        );
      } else text = writeAtom(atom, style, list[i + 1]);
    }
    pieces.push({
      atom,
      last: end - 1,
      text,
      attached:
        atom.type === 'subsup'
          ? (atom.verbatimTypst ??
            writeScripts(atom, style, atom.typstSpelling ?? {}))
          : undefined,
    });
    i = end - 1;
  }
  escapeCharacters(pieces);
  let out = '';
  pieces.forEach((piece, k) => {
    const { atom, text, attached } = piece;
    const previous = pieces[k - 1] ? list[pieces[k - 1].last] : undefined;
    // `#h(1em)` and other code go on through a `(`, `[` or `.` right after them, and take a `;`
    const code =
      previous !== undefined &&
      (isCode(previous) || pieces[k - 1].text.startsWith('#'));
    if (attached !== undefined && out) out += attached;
    else {
      let lead =
        atom.typstLead ??
        (previous
          ? typedSpacing(previous, atom, list[pieces[k - 1].last - 1])
          : '');
      if (k === 0 && !firstLead) lead = '';
      out = joinTokens(out, lead, text, previous, atom, code);
    }
  });
  // an argument starting `x:` or `oo_:` would be named by it
  return inArgument ? out.replace(NAMED_ARGUMENT, '$1 $2') : out;
}

// what typst-syntax takes for a named argument: an identifier, then a colon not starting `:=`
const NAMED_ARGUMENT = /^(\s*[\p{L}_][\p{L}\p{M}\p{N}_-]*)(:(?!:?=))/u;

/**
 * Delimiters that have no partner in the branch are written as characters, `\(`, as Typst would
 * pair them across what holds them; so are the separators of an argument.
 */
function escapeCharacters(pieces: Piece[]): void {
  const open: Piece[] = [];
  const unpaired = new Set<Piece>();
  pieces.forEach((piece, k) => {
    if (piece.attached !== undefined) return;
    if (OPENING.has(piece.text)) {
      // scripts make it a character, as Typst starts a group with it otherwise
      if (pieces[k + 1]?.attached !== undefined) unpaired.add(piece);
      else open.push(piece);
      return;
    }
    if (closingOf(piece.text) && !open.pop()) unpaired.add(piece);
  });
  for (const piece of open) unpaired.add(piece);
  for (const piece of pieces) {
    const { atom, text } = piece;
    const separator =
      inArgument &&
      atom.mode === 'math' &&
      (text[0] === ',' || text[0] === ';') &&
      atom.value === text[0];
    if (separator) piece.text = `\\${text}`;
    else if (unpaired.has(piece)) {
      const delimiter = OPENING.has(text) ? text : closingOf(text)!;
      piece.text = unpairedDelimiter(delimiter) + text.slice(delimiter.length);
    }
  }
}

/** the closing delimiter a piece is, with the scripts it takes along: `)^2` */
function closingOf(text: string): string | undefined {
  const delimiter = /^(\|\]|.)(?:[_^'][\s\S]*)?$/u.exec(text)?.[1];
  return delimiter && CLOSING.has(delimiter) ? delimiter : undefined;
}

const OPERAND_ENDS = new Set(['mbin', 'mrel', 'mopen', 'mpunct']);

/** the spacing a person types around an atom the source never had: `a + b`, `x = y`, `a, b` */
function typedSpacing(
  previous: Atom,
  atom: Atom,
  beforePrevious: Atom | undefined
): string {
  if (
    atom.type === 'mrel' ||
    previous.type === 'mrel' ||
    previous.type === 'mpunct'
  )
    return ' ';
  if (
    atom.type === 'mclose' ||
    atom.type === 'mpunct' ||
    atom.type === 'subsup'
  )
    return '';
  // Typst draws a space beside a string, `"if" x`, so none is written that was not typed
  if (isString(previous) || isString(atom)) return '';
  // `f'(x)`, but `x^(-1) y`: whatever else follows a scripted atom reads better apart from it
  if (previous.type === 'subsup' || hasScripts(previous))
    return isPrimed(previous) && atom.type === 'leftright' ? '' : ' ';
  if (atom.type === 'mbin') return isUnary(previous) ? '' : ' ';
  if (previous.type === 'mbin' && !isUnary(beforePrevious)) return ' ';
  // `abs(x) y`, `frac(a, b) c`
  if (STRUCTURES.has(previous.type ?? '') && atom.type !== 'leftright')
    return ' ';
  return '';
}

const STRUCTURES = new Set(['genfrac', 'surd', 'leftright', 'array', 'group']);

function isPrimed(atom: Atom): boolean {
  const sup = children(atom.superscript);
  return (
    children(atom.subscript).length === 0 &&
    sup.length > 0 &&
    sup.every(isPrime)
  );
}

/** whether a binary operator after this atom is a sign rather than an operation */
function isUnary(before: Atom | undefined): boolean {
  return (
    !before || before.type === 'first' || OPERAND_ENDS.has(before.type ?? '')
  );
}

/** atoms whose style is part of what they are, not something to wrap them in */
function ownsStyle(atom: Atom): boolean {
  const name = atom.typstSpelling?.name;
  if (
    atom.type === 'group' &&
    name !== undefined &&
    TYPST_STYLE_CALLS.has(name)
  )
    return true;
  return name === 'dif' || name === 'Dif' || isCode(atom);
}

function isCode(atom: Atom): boolean {
  return atom.typstSpelling?.code !== undefined;
}

function isString(atom: Atom): boolean {
  return atom.mode === 'text' && !isCode(atom);
}

const STRING_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

function writeString(atoms: readonly Atom[]): string {
  const text = atoms.map((atom) => atom.value ?? '').join('');
  return `"${text.replace(/[\\"\n\r\t]/g, (ch) => STRING_ESCAPES[ch])}"`;
}

/**
 * Glues `text` after `out` with the source's own whitespace, adding a space where writing the
 * two together would read differently: `x` `y` as the name `xy`, `<` `=` as `<=`.
 */
function joinTokens(
  out: string,
  lead: string,
  text: string,
  previous: Atom | undefined,
  atom: Atom,
  code: boolean
): string {
  if (!out || !text) return out + lead + text;
  if (/^\s/.test(lead) || lead.includes('/')) return out + lead + text;
  // whole characters, `𝐀` being two code units
  const low = /[\udc00-\udfff]$/.test(out) ? 2 : 1;
  const a = String.fromCodePoint(out.codePointAt(out.length - low)!);
  const b = String.fromCodePoint(text.codePointAt(0)!);
  const word = /[\p{L}\p{N}]/u;
  let space = false;
  // a fraction's numerator would take in what it is written against: `9 25/x`, `f (x)/2`
  const slash = atom.type === 'genfrac' && !/^(frac|binom)\(/.test(text);
  if (word.test(a) && word.test(b)) {
    // digits run together into a number, and a number may lead a variable: `12`, `2x`
    const number = /(^|[^\p{L}\p{N}.])\d+(\.\d+)?$/u.test(out);
    space = !(
      number &&
      ((/\d/.test(b) && !slash) || (/\p{L}/u.test(b) && !isDigit(atom)))
    );
  } else if (b === '(' && NAME_END.test(out) && !isCallArgs(previous, atom))
    space = true;
  else if (slash && /\p{L}$/u.test(out) && opensGroup(text)) space = true;
  // a bare script operand takes in a group written right after it: `x^N(a)` is x^(N(a))
  // (a bar alone may close a pair as well as open one, and a space before it changes which)
  else if (
    /[_^][\p{L}\p{N}.]+$/u.test(out) &&
    opensGroup(text) &&
    (atom.type === 'leftright' || !/^[|‖]/.test(text))
  )
    space = true;
  // a point after a name would reach into it, `at.x`
  else if (b === '.' && NAME_END.test(out)) space = true;
  else if (code && /[\p{L}\p{N}_(.[;]/u.test(b)) space = true;
  else if (glued(a, b)) space = true;
  else if (b === '_' || b === '^' || (b === "'" && a !== "'")) space = true;
  return out + (space ? ' ' : lead) + text;
}

// a name Typst calls when parentheses follow it: `alpha`, `minus.o`, but not `x`
const NAME_END = /\p{L}{2,}(?:\.[\p{L}\p{N}]+)*$/u;

/** whether text starts with what Typst groups a name or an operand with: `(`, `⟨`, a bar */
function opensGroup(text: string): boolean {
  return (
    OPENING.has(String.fromCodePoint(text.codePointAt(0)!)) ||
    /^[|‖]/.test(text)
  );
}

/** a generic call's parentheses, still right after its name */
function isCallArgs(previous: Atom | undefined, atom: Atom): boolean {
  return Boolean(
    previous?.parent?.typstSpelling?.call && previous.parent === atom.parent
  );
}

// LaTeX written as nothing: a rule between an array's rows, which `mat()` draws none of; a row's
// number or a break hint, which Typst sets for the whole equation; and a placement Typst has none
// of, whose argument follows as what it places
const UNWRITTEN =
  /^\\(h(dash)?line|nonumber|notag|(display|allow|no|line|page|nopage)break|protect|hfill|(big|med|small)skip|mathclap|lefteqn|shove(left|right)|fbox)$/;
// and with the argument it takes: a row's label or tag, vertical space, a rule under some columns
const UNWRITTEN_WITH_ARGUMENT = /^\\(label|tag\*?|vspace|c(dash)?line)$/;

/** `next` is the atom written after this one, which scripts it when it is a `subsup` */
function writeAtom(atom: Atom, style: PrivateStyle, next?: Atom): string {
  if (atom.verbatimTypst !== undefined) return atom.verbatimTypst;
  const spelling = atom.typstSpelling ?? {};
  if (spelling.code !== undefined) return spelling.code;
  let core = writeCore(atom, style, spelling, next);
  const wrap = wrapOf(atom, spelling.wrap);
  if (wrap)
    core = writeCall(wrap, [core], wrap === spelling.wrap ? spelling : {});
  // `\int\limits` and `\sum\nolimits`: scripts placed otherwise than Typst would place them
  else if (atom.explicitSubsupPlacement && atom.subsupPlacement !== 'auto')
    core = `${atom.subsupPlacement === 'over-under' ? 'limits' : 'scripts'}(${core})`;
  const scripts = writeScripts(atom, style, spelling);
  // scripts make an opening delimiter a character, as Typst starts a group with it otherwise
  if (scripts && OPENING.has(core)) core = unpairedDelimiter(core);
  return core + scripts;
}

/**
 * The call the source wrapped an atom in, unless it was `limits` or `scripts` and the atom's
 * scripts are placed otherwise now: then the call that places them so, or none
 */
function wrapOf(atom: Atom, wrap: string | undefined): string | undefined {
  if (wrap !== 'limits' && wrap !== 'scripts') return wrap;
  if (!atom.explicitSubsupPlacement || atom.subsupPlacement === 'auto')
    return undefined;
  return atom.subsupPlacement === 'over-under' ? 'limits' : 'scripts';
}

function writeCore(
  atom: Atom,
  style: PrivateStyle,
  spelling: TypstSpelling,
  next?: Atom
): string {
  const command = atom.command;
  switch (atom.type) {
    case 'group':
      return writeGroup(atom, style, spelling);
    case 'genfrac':
      return writeFraction(atom as GenfracAtom, style, spelling, next);
    case 'surd':
      return writeRoot(atom, style, spelling);
    case 'leftright':
      return writeDelimited(atom as LeftRightAtom, style, spelling);
    case 'array':
      return writeGrid(atom as ArrayAtom, style, spelling);
    case 'placeholder':
      return '""';
    case 'spacing':
      return (
        NAMED_SPACING[command] ??
        writeWidth((atom as Atom & { width?: LatexValue }).width)
      );
    // Typst source still being typed, after `#` or Escape, is written as it stands
    case 'latex':
      return atom.value ?? '';
    case 'latexgroup':
      return children(atom.body)
        .map((x) => x.value ?? '')
        .join('');
    case 'subsup':
      return '""';
    // what takes room and is not seen
    case 'phantom':
      // `\smash` takes no room and is seen
      if (!(atom as Atom & { isInvisible?: boolean }).isInvisible)
        return writePlain(atom, atom.body ?? [], style);
      return `#hide[$${writeBranch(atom.body ?? [], style, true, false)}$]`;
    case 'sizeddelim':
      return writeSizedDelimiter(atom.value ?? '');
    // `\middle|`, sized with the delimiters around it
    case 'delim': {
      const middle = delimiterText(atom.value ?? '');
      if (!middle) return '';
      return spelling.wrap === 'mid'
        ? lrDelimiter(middle)
        : `mid(${lrDelimiter(middle)})`;
    }
    case 'macro':
      return writePlain(atom, atom.body ?? [], style);
    // a command MathLive did not know, shown as written
    case 'error':
      if (spelling.name !== undefined) return writeSymbol(atom, spelling);
      return UNWRITTEN.test(atom.value ?? '') ? '' : writeString([atom]);
    case 'operator':
      // `\Re` and `\smallint` are symbols Typst has a name for
      if ([...(atom.value ?? '')].length === 1)
        return writeSymbol(atom, spelling);
      return (
        spelling.name ??
        typstOperator(atom.value ?? '', atom.subsupPlacement === 'over-under')
      );
  }
  if (TYPST_ACCENT_NAMES[command])
    return writeCall(
      accentName(command, spelling),
      [writeBranch(atom.body ?? [], style, true, true)],
      spelling
    );
  if (SIZE_CALLS[command])
    return writeCall(
      spelling.name ?? SIZE_CALLS[command],
      [writeBranch(atom.body!, style, true, true)],
      spelling
    );
  if (COMMAND_CALLS[command]) return writeOneArg(atom, style, spelling);
  if (command === '\\operatorname' || command === '\\operatorname*')
    return writeOperatorName(atom, spelling);
  if (atom.type === 'overunder') return writeOverUnder(atom, style, spelling);
  const negated = writeNegated(atom, style);
  if (negated !== undefined) return negated;
  // `\mathchoice` draws one of its four by the style it is in, the display one in an equation
  if (command === '\\mathchoice')
    return writePlain(atom, argAtoms(atom.args?.[0]), style);
  // `\ang{30}` is 30°
  if (command === '\\ang')
    return `${writeBranch(atom.body ?? [], style)} degree`;
  // a decoration Typst has no word for keeps what it decorates: `\boxed{x}` is `x`
  if (atom.value === undefined && atom.body)
    return writePlain(atom, atom.body, style);
  if (
    atom.type === 'mop' &&
    command.startsWith('\\') &&
    atom.body === undefined &&
    !atom.value
  )
    return spelling.name ?? command.slice(1);
  return writeSymbol(atom, spelling);
}

function writeSymbol(atom: Atom, spelling: TypstSpelling): string {
  const value = atom.value ?? charCode(atom) ?? '';
  if (
    spelling.name !== undefined &&
    (spelling.value === undefined || spelling.value === value)
  )
    return spelling.name;
  // a letter in the AMS font is its double-struck form: `\Bbbk`
  if (atom.style.variant === 'ams' && /^[A-Za-z]$/.test(value))
    return `bb(${value})`;
  // LaTeX's bars, `|` and `\Vert`, which MathLive draws as ∣ and ∥, are Typst's bars and not
  // its relations
  const bar = DELIMITER_TEXT[atom.command];
  if (bar === '|' || bar === '‖') return bar;
  return writeValue(value);
}

/** a character as Typst's name for it, or as itself where it reads as itself */
function writeValue(value: string): string {
  if (/^[A-Za-z0-9]$/.test(value)) return value;
  if (value === '-' || value === '−') return '-';
  const name = typstSymbolName(value);
  if (
    name !== undefined &&
    (value.length !== 1 || !/[(),.;:!?+=<>[\]{}|]/.test(value))
  )
    return name;
  if (ESCAPED.has(value)) return `\\${value}`;
  // `√` alone would be a root missing its radicand, and the slash `\not` lays over what
  // follows it is a combining character Typst draws apart
  if (/^[√∛∜]$/.test(value))
    return `\\u{${value.codePointAt(0)!.toString(16)}}`;
  if (value === NOT_SLASH) return '\\u{338}';
  return value;
}

// MathLive's slash for `\not` and `\ne`, a character of its own font
const NOT_SLASH = '\ue020';

/** the character `\char"2254` stands for, which MathLive only works out to draw it */
function charCode(atom: Atom): string | undefined {
  if (atom.command !== '\\char' && atom.command !== '\\unicode')
    return undefined;
  const code = atom.args?.[0] as LatexValue | undefined;
  return code && 'number' in code
    ? String.fromCodePoint(code.number)
    : undefined;
}

/**
 * `\not=` and `\neq`, which MathLive draws as its slash over what follows: the negated
 * symbol, `!=` or `in.not`, else what follows struck out
 */
function writeNegated(atom: Atom, style: PrivateStyle): string | undefined {
  const [slash, ...rest] = children(atom.body);
  if (slash?.type !== 'overlap' || children(slash.body)[0]?.value !== NOT_SLASH)
    return undefined;
  const value = rest.length === 1 ? rest[0].value : undefined;
  const negated = value && (value + '\u0338').normalize('NFC');
  if (negated && [...negated].length === 1) return writeValue(negated);
  return writeCall('cancel', [writeBranch(rest, style, true, true)], {});
}

/** `\kern1em`, `\mkern18mu`: a width MathLive was given, as Typst's horizontal space */
function writeWidth(width: LatexValue | undefined): string {
  const length = width && 'glue' in width ? width.glue : width;
  if (!length || !('dimension' in length)) return 'space';
  const { dimension, unit = 'pt' } = length;
  const part = EM_PARTS[unit];
  if (part !== undefined)
    return `#h(${Number((dimension * part).toFixed(4))}em)`;
  return /^(em|pt|mm|cm|in)$/.test(unit) ? `#h(${dimension}${unit})` : 'space';
}

/** `\big(` as its delimiter, which Typst sizes itself: `\bigl\uparrow` is `arrow.t` */
function writeSizedDelimiter(delimiter: string): string {
  const char = delimiterText(delimiter);
  if (!char) return '';
  if (char.length === 1 && '([{)]}|'.includes(char)) return char;
  return typstSymbolName(char) ?? char;
}

/** the character a delimiter MathLive takes stands for: `\\langle` is ⟨, `.` none */
function delimiterText(delimiter: string): string {
  return (
    DELIMITER_TEXT[delimiter] ??
    (delimiter.startsWith('\\')
      ? (parseLatex(delimiter)[0]?.value ?? '')
      : delimiter)
  );
}

// what MathLive draws over or under its argument and Typst has no call for, as the symbol nearest it
const MARKS: Readonly<Record<string, ['above' | 'below', string]>> = {
  '\\Overrightarrow': ['above', 'arrow.r.double'],
  '\\underrightarrow': ['below', 'arrow.r'],
  '\\underleftarrow': ['below', 'arrow.l'],
  '\\underleftrightarrow': ['below', 'arrow.l.r'],
  '\\utilde': ['below', 'tilde.op'],
};

/** `\overset`, `\stackrel`, `\xrightarrow` and the like: a base with what goes over and under it */
function writeOverUnder(
  atom: Atom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  const arrow = STRETCHED_ARROWS[atom.command];
  const above = children(atom.above);
  const below = children(atom.below);
  const scripts = (base: string) =>
    `${base}${below.length > 0 ? `_${writeOperand(below, style, false)}` : ''}${
      above.length > 0 ? `^${writeOperand(above, style, false)}` : ''
    }`;
  // `\xrightarrow{f}` is an arrow `stretch()` fits to its label, and a long one without
  if (arrow) {
    if (above.length > 0 || below.length > 0)
      return scripts(`stretch(${arrow})`);
    return typstSymbolValue(`${arrow}.long`) ? `${arrow}.long` : arrow;
  }
  // what `limits()` holds is its argument
  const base = () => writeBranch(atom.body ?? [], style, true, true) || '""';
  const mark = MARKS[atom.command];
  if (mark) {
    const operand = mark[0] === 'above' ? '^' : '_';
    return `limits(${base()})${operand}${mark[1]}`;
  }
  if (above.length === 0 && below.length === 0)
    return writePlain(atom, atom.body ?? [], style);
  return scripts(
    `${spelling.name === 'stretch' ? 'stretch' : 'limits'}(${base()})`
  );
}

const MATH_NAME = /^\p{L}[\p{L}\p{N}]*(?:\.[\p{L}\p{N}]+)*$/u;

function writeOperatorName(atom: Atom, spelling: TypstSpelling): string {
  const name = children(atom.body)
    // `\ ` keeps a space in the name, as a no-break one
    .map((x) =>
      x.type === 'spacing' ? ' ' : (x.value ?? '').replace(/\s/g, ' ')
    )
    .join('');
  if (spelling.name === 'op' && spelling.args)
    return writeCall('op', [JSON.stringify(name)], spelling);
  const read = spelling.name;
  if (read !== undefined && (OPERATOR_TEXT[read] ?? read) === name) return read;
  // a call's name renamed in the field
  if (atom.parent?.typstSpelling?.call !== undefined && MATH_NAME.test(name))
    return name;
  return typstOperator(name, atom.command.endsWith('*'));
}

/** an operator by Typst's own name for it, `liminf` for lim inf, or as `op()` when it has none */
function typstOperator(name: string, limits: boolean): string {
  const own = OPERATOR_NAMES[name] ?? name;
  if ((limits ? LIMIT_OPERATORS : OPERATORS).has(own)) return own;
  return `op(${JSON.stringify(name)}${limits ? ', limits: #true' : ''})`;
}

function accentName(command: string, spelling: TypstSpelling): string {
  const name = spelling.name;
  if (name !== undefined) {
    const value = typstSymbolValue(name);
    const written = value === undefined ? undefined : typstAccentCommand(value);
    if (
      written === command ||
      (written === '\\vec' && command === '\\overrightarrow')
    )
      return name;
  }
  return TYPST_ACCENT_NAMES[command] ?? 'accent';
}

/**
 * `name(arg, arg)`, with the source's text around the arguments when there are as many as it
 * had, and its named arguments otherwise.
 */
function writeCall(
  name: string,
  args: string[],
  spelling: TypstSpelling
): string {
  // an argument left empty is still one: `frac(a, "")`, as `frac(a, )` lacks it
  const written = args.map((arg) => arg || '""');
  const separators = spelling.args;
  if (separators && separators.length === written.length + 1)
    return (
      name +
      written.map((arg, i) => separators[i] + arg).join('') +
      separators[written.length]
    );
  return `${name}(${[...written, ...(spelling.named ?? [])].join(', ')})`;
}

function writeGroup(
  atom: Atom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  const body = children(atom.body);
  if (spelling.call !== undefined) {
    const [head, parens] = body;
    if (body.length === 2 && parens.type === 'leftright')
      return writeAtom(head, style) + writeAtom(parens, style);
  }
  const name = spelling.name;
  if (name !== undefined && TYPST_STYLE_CALLS.has(name))
    return writeCall(
      name,
      [writeBranch(body, applyTypstStyle(style, name), true, true)],
      spelling
    );
  return writePlain(atom, body, style);
}

// atoms written as just what they hold, a group or a decoration Typst has no word for, by what
// they hold: they are one operand only when that is
const PLAIN = new WeakMap<Atom, readonly Atom[]>();

function writePlain(
  atom: Atom,
  atoms: readonly Atom[],
  style: PrivateStyle
): string {
  PLAIN.set(atom, atoms);
  return writeBranch(atoms, style);
}

/**
 * A script or fraction operand. Typst strips one pair of parentheses from it, so a group that
 * shows its own parentheses gets a second pair. Scripts bind tighter than `/`, so one scripted
 * atom needs none as a fraction operand but does as a script.
 */
function writeOperand(
  atoms: readonly Atom[],
  style: PrivateStyle,
  parens: boolean | 'open',
  of: 'script' | 'fraction' = 'script'
): string {
  const list = children(atoms);
  // a group the source left open: its opening delimiter takes in all that follows it
  const [open, ...rest] = list;
  if (parens === 'open' && OPENING.has(open?.value ?? ''))
    return open.value + writeBranch(rest, style);
  const text = writeBranch(list, style);
  if (parens === 'open') return text;
  // code would go on through what follows it
  if (parens || !text || text.startsWith('#') || !isPrimary(list, text, of))
    return `(${text})`;
  return text;
}

function isPrimary(
  written: readonly Atom[],
  text: string,
  of: 'script' | 'fraction'
): boolean {
  // what a group holds is written in its place, as that many operands
  let all = written;
  while (all.length === 1 && PLAIN.has(all[0])) {
    const inner = children(PLAIN.get(all[0]));
    if (hasScripts(all[0])) {
      if (inner.length !== 1) return false;
      break;
    }
    all = inner;
  }
  // scripts MathLive keeps apart belong to the atom before them
  const list = all.filter((atom, i) => i === 0 || atom.type !== 'subsup');
  const apart = list.length < all.length;
  if (isNumber(list)) return !apart || of === 'fraction';
  if (
    list.length > 0 &&
    list.every((atom) => atom.mode === 'text' && !isCode(atom))
  )
    return (
      list.slice(1).every((atom) => !atom.typstSpelling?.str) &&
      (!apart || of === 'fraction')
    );
  // `f(x)` and `pi[x]` are one operand when nothing parts the name from the parentheses
  if (
    list.length === 2 &&
    !apart &&
    list[1].type === 'leftright' &&
    !hasScripts(list[0]) &&
    !hasScripts(list[1]) &&
    /^\p{L}[\p{L}.]*[([{|⟨⌊⌈‖]/u.test(text)
  )
    return true;
  if (list.length !== 1) return false;
  if (apart && of === 'script') return false;
  const [atom] = list;
  if (atom.type === 'genfrac' || atom.type === 'array') return false;
  const scripted =
    children(atom.subscript).length > 0 ||
    children(atom.superscript).length > 0;
  // `(x)` loses its parentheses as an operand; `(x)'` is an attachment and keeps them
  if (
    atom.type === 'leftright' &&
    (atom as LeftRightAtom).leftDelim === '(' &&
    !scripted
  )
    return false;
  return of === 'fraction' || !scripted;
}

const FRACTION_SIZES: Readonly<Record<string, string>> = {
  '\\dfrac': 'display',
  '\\dbinom': 'display',
  '\\tfrac': 'inline',
  '\\tbinom': 'inline',
};

function writeFraction(
  atom: GenfracAtom,
  style: PrivateStyle,
  spelling: TypstSpelling,
  next?: Atom,
  sized = true
): string {
  // `\tfrac` and `\dfrac` keep the size they ask for whatever the equation is set in
  const size = sized ? FRACTION_SIZES[atom.command] : undefined;
  if (size) {
    const outer = inArgument;
    inArgument = true;
    try {
      return `${size}(${writeFraction(atom, style, spelling, next, false)})`;
    } finally {
      inArgument = outer;
    }
  }
  const above = atom.above ?? [];
  const below = atom.below ?? [];
  const args = [
    writeBranch(above, style, true, true),
    writeBranch(below, style, true, true),
  ];
  if (!atom.hasBarLine)
    return writeCall('binom', args, spelling.name === 'binom' ? spelling : {});
  // `a/b^2` puts the script on b: a fraction that carries scripts has to be a call
  const scripted = hasScripts(atom) || next?.type === 'subsup';
  if (spelling.name === 'frac' || scripted)
    return writeCall('frac', args, spelling.name === 'frac' ? spelling : {});
  const [numParens, denParens] = spelling.parens ?? [false, false];
  const numerator = writeOperand(above, style, numParens, 'fraction');
  const denominator = writeOperand(below, style, denParens, 'fraction');
  // apart from what would make a comment of it, `*/` or `/*`
  let slash = spelling.slash ?? '/';
  if (glued(numerator.slice(-1), slash[0])) slash = ` ${slash}`;
  if (glued(slash.slice(-1), denominator[0])) slash = `${slash} `;
  return numerator + slash + denominator;
}

function writeRoot(
  atom: Atom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  const radicand = writeBranch(atom.body ?? [], style, true, true);
  const index = children(atom.above);
  const glyph = spelling.name;
  if (glyph === '√' && index.length === 0)
    return glyph + writeOperand(atom.body ?? [], style, false);
  if (
    (glyph === '∛' || glyph === '∜') &&
    index.length === 1 &&
    index[0].value === (glyph === '∛' ? '3' : '4')
  )
    return glyph + writeOperand(atom.body ?? [], style, false);
  if (index.length === 0)
    return writeCall(
      'sqrt',
      [radicand],
      spelling.name === 'sqrt' ? spelling : {}
    );
  return writeCall(
    'root',
    [writeBranch(index, style, true, true), radicand],
    spelling.name === 'root' ? spelling : {}
  );
}

function writeDelimited(
  atom: LeftRightAtom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  const left = atom.leftDelim ?? '.';
  const right = atom.matchingRightDelim();
  // bars are characters to Typst's parser, so what is between them is where they are
  const bars = /^[|‖]$/;
  const barred =
    bars.test(delimiterText(left)) && bars.test(delimiterText(right));
  const body = writeBranch(
    atom.body ?? [],
    style,
    true,
    barred ? undefined : false
  );
  const delims = `${left} ${right}`;
  const fence = FENCE_CALLS[delims];
  const argument = () => writeBranch(atom.body ?? [], style, true, true);
  if (spelling.name !== undefined && fence === spelling.name)
    return writeCall(fence, [argument()], spelling);
  if (
    spelling.value === delims &&
    !glues(spelling.open!, body, spelling.close!)
  )
    return enclose(spelling.open!, body, spelling.close!);
  const open = delimiterText(left);
  const close = delimiterText(right);
  // bars pair up apart from what is between them, so bars around bars, or nothing, are a call
  if (fence && (fence !== 'abs' || glues(open, body, close)))
    return writeCall(fence, [argument()], {});
  // Typst pairs an opening delimiter with any closing one, and bars with bars
  if ((OPENING.has(open) && CLOSING.has(close)) || barred)
    return enclose(open, body, close);
  // else `lr()` sizes them as characters, which Typst would otherwise pair with what is around
  const sized = enclose(lrDelimiter(open), argument(), lrDelimiter(close));
  return spelling.wrap === 'lr' ? sized : `lr(${sized})`;
}

function lrDelimiter(delimiter: string): string {
  if (OPENING.has(delimiter) || CLOSING.has(delimiter))
    return unpairedDelimiter(delimiter);
  return /^[|‖]?$/.test(delimiter) ? delimiter : writeValue(delimiter);
}

/** whether two characters side by side read as one token, a shorthand `[|` or a comment `/*` */
function glued(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const pair = a + b;
  return (
    pair === '//' ||
    pair === '/*' ||
    pair === '*/' ||
    SHORTHAND_PIECES.some((s) => s.includes(pair))
  );
}

/** whether a delimiter and the body inside it would read as a shorthand */
function glues(open: string, body: string, close: string): boolean {
  if (!body) return glued(open.slice(-1), close[0]);
  return glued(open.slice(-1), body[0]) || glued(body.slice(-1), close[0]);
}

/** delimiters around a body, kept apart from it where they would read as one, `[ |x| ]` */
function enclose(open: string, body: string, close: string): string {
  if (!body)
    return glued(open.slice(-1), close[0]) ? `${open} ${close}` : open + close;
  const before = glued(open.slice(-1), body[0]) ? ' ' : '';
  const after = glued(body.slice(-1), close[0]) ? ' ' : '';
  return `${open}${before}${body}${after}${close}`;
}

function writeOneArg(
  atom: Atom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  const command = atom.command;
  const args = [writeBranch(atom.body ?? [], style, true, true)];
  if (command === '\\overbrace' && children(atom.superscript).length > 0)
    args.push(writeBranch(atom.superscript!, style, true, true));
  if (command === '\\underbrace' && children(atom.subscript).length > 0)
    args.push(writeBranch(atom.subscript!, style, true, true));
  const flag = { '\\bcancel': 'inverted', '\\xcancel': 'cross' }[command];
  if (flag && !spelling.named?.some((arg) => arg.startsWith(flag)))
    args.push(`${flag}: #true`);
  return writeCall(COMMAND_CALLS[command], args, spelling);
}

function writeScripts(
  atom: Atom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  // a brace's annotation sits in a script branch but is written as the brace's argument
  const annotation = BRACE_ANNOTATIONS[atom.command];
  const [subParens, supParens] = spelling.parens ?? [false, false];
  const sub = annotation === 'subscript' ? [] : children(atom.subscript);
  let sup = annotation === 'superscript' ? [] : children(atom.superscript);
  let primes = 0;
  let out = '';
  while (sup[primes] && isPrime(sup[primes]))
    out += "'".repeat(primeCount(sup[primes++]));
  sup = sup.slice(primes);
  // a script written empty, `b^()`, is still there to be typed into
  if (sub.length > 0 || (!annotation && atom.branch('subscript')))
    out += `_${writeOperand(sub, style, subParens)}`;
  if (
    sup.length > 0 ||
    (!annotation && primes === 0 && atom.branch('superscript'))
  )
    out += `^${writeOperand(sup, style, supParens && primes === 0)}`;
  return out;
}

function writeGrid(
  atom: ArrayAtom,
  style: PrivateStyle,
  spelling: TypstSpelling
): string {
  // `bmatrix*` is `bmatrix` with its columns aligned otherwise, `dcases` `cases` in display
  const environment = atom.environmentName
    .replace(/\*$/, '')
    .replace(/^d(r?cases)$/, '$1')
    .replace(/^(smallmatrix|array)$/, 'matrix');
  // the cells of `mat`, `vec` and `cases` are a call's arguments, the lines of an equation not
  const call = environment in MATRIX_DELIMS || /^r?cases$/.test(environment);
  const rows: string[][] = [];
  for (let r = 0; r < atom.rowCount; r++) {
    const row: string[] = [];
    for (let c = 0; c < atom.colCount; c++) {
      const cell = children(atom.getCell(r, c));
      row.push(
        cell.every((x) => x.type === 'placeholder')
          ? ''
          : writeBranch(cell, style, true, call || undefined)
      );
    }
    // MathLive pads short rows; the cells the source never had are not written
    const known = spelling.cells?.[r]?.length ?? 1;
    while (row.length > known && row[row.length - 1] === '') row.pop();
    rows.push(row);
  }
  const before = spelling.cells;
  // a matrix given other delimiters since it was read keeps no separator the source had: the
  // first one holds the old `delim`
  const restyled =
    spelling.environment !== undefined &&
    spelling.environment !== atom.environmentName;
  if (
    before &&
    !restyled &&
    before.length === rows.length &&
    rows.every((row, r) => row.length === before[r].length)
  ) {
    const name = spelling.name ?? '';
    return (
      name +
      rows
        .map((row, r) => row.map((cell, c) => before[r][c] + cell).join(''))
        .join('') +
      (spelling.end ?? '')
    );
  }
  if (environment === 'cases' || environment === 'rcases') {
    const reverse = environment === 'rcases' ? 'reverse: #true, ' : '';
    return `cases(${reverse}${rows.map((row) => row.join(' & ')).join(', ')})`;
  }
  if (environment in MATRIX_DELIMS) {
    const delim = MATRIX_DELIMS[environment];
    // the source's other arguments, `augment` or `gap`, go on as written
    const named = [
      ...(delim ? [`delim: ${delim}`] : []),
      ...(spelling.named ?? []).filter((arg) => !/^\s*delim\s*:/.test(arg)),
    ]
      .map((arg) => `${arg}, `)
      .join('');
    if (spelling.name === 'vec' && rows.every((row) => row.length === 1))
      return `vec(${named}${rows.map((row) => row[0]).join(', ')})`;
    return `mat(${named}${rows.map((row) => row.join(', ')).join('; ')})`;
  }
  return rows.map((row) => row.join(' & ')).join(' \\\n');
}
