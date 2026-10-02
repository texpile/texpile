import { Atom } from '../../core/atom-class';
import { parseLatex } from '../../core/parser';
import { GroupAtom } from '../../atoms/group';
import { LeftRightAtom } from '../../atoms/leftright';
import type { TypstSyntaxNode } from '../syntax';
import {
  typstAccentCommand,
  typstShorthandValue,
  typstSymbolValue,
} from '../symbols';
import { applyTypstStyle, TYPST_STYLE_CALLS } from '../style';
import { DELIMITERS, FENCES, ONE_ARG, SIZES } from '../names';
import {
  charAtom,
  codeAtom,
  commandAtom,
  keep,
  named,
  readMath,
  readNode,
  readSequence,
  readSized,
  sourceOf,
  symbolAtom,
  trimTrivia,
  type TypstReader,
} from './read';
import { readCases, readMat, readVec } from './read-grid';

/** a call's arguments as written */
export type TypstCallArgs = {
  /** positional arguments, by row: `;` starts a row */
  rows: TypstSyntaxNode[][][];
  /** named arguments, verbatim */
  named: string[];
  /** the named arguments by name, as written after the colon */
  values: Record<string, string>;
  /** the source before each positional argument and, last, after the final one (parens included) */
  separators: string[];
  spread: boolean;
};

export function splitArgs(
  r: TypstReader,
  args: TypstSyntaxNode
): TypstCallArgs {
  const result: TypstCallArgs = {
    rows: [[]],
    named: [],
    values: {},
    separators: [],
    spread: false,
  };
  let current: TypstSyntaxNode[] = [];
  let cursor = args.from;
  const close = () => {
    const nodes = trimTrivia(current);
    current = [];
    if (nodes.length === 0) return;
    result.rows[result.rows.length - 1].push(nodes);
    result.separators.push(r.src.slice(cursor, nodes[0].from));
    cursor = nodes[nodes.length - 1].to;
  };
  for (const node of args.children) {
    if (node.kind === 'LeftParen' || node.kind === 'RightParen') continue;
    if (node.kind === 'Comma') close();
    else if (node.kind === 'Semicolon') {
      close();
      result.rows.push([]);
    } else if (node.kind === 'Named') {
      const source = sourceOf(r, node);
      result.named.push(source);
      const colon = source.indexOf(':');
      result.values[source.slice(0, colon).trim()] = source
        .slice(colon + 1)
        .trim();
    } else if (node.kind === 'Spread') result.spread = true;
    else current.push(node);
  }
  close();
  if (
    result.rows[result.rows.length - 1].length === 0 &&
    result.rows.length > 1
  )
    result.rows.pop();
  result.separators.push(r.src.slice(cursor, args.to));
  return result;
}

/** the positional arguments in order, rows flattened */
function positional(args: TypstCallArgs): TypstSyntaxNode[][] {
  return args.rows.flat();
}

export function readArg(r: TypstReader, nodes: TypstSyntaxNode[]): Atom[] {
  if (nodes.length === 1) return readMath(r, nodes[0]);
  return readSequence(r, nodes);
}

/** a named argument set to true, `#true` as code writes it */
export function isTrue(value: string | undefined): boolean {
  return value === 'true' || value === '#true';
}

/** a Typst math function as the MathLive atom that draws it, undefined when this call does not fit one */
function readBuiltin(
  r: TypstReader,
  name: string,
  args: TypstCallArgs
): Atom | undefined {
  const parts = positional(args);
  const one = parts.length === 1 && args.rows.length === 1;
  const named = Object.keys(args.values);
  if (TYPST_STYLE_CALLS.has(name) && one && named.length === 0) {
    const inner = { ...r, style: applyTypstStyle(r.style, name) };
    const group = new GroupAtom(readArg(inner, parts[0]), 'math');
    group.style = { ...inner.style };
    return group;
  }
  if (SIZES[name] && one && named.length === 0)
    return commandAtom(r, SIZES[name], [readArg(r, parts[0])]);
  if (FENCES[name] && one) {
    const [leftDelim, rightDelim] = FENCES[name];
    return new LeftRightAtom('', readArg(r, parts[0]), {
      leftDelim,
      rightDelim,
      style: r.style,
    });
  }
  if (name === 'sqrt' && one && named.length === 0)
    return commandAtom(r, '\\sqrt', [null, readArg(r, parts[0])]);
  if (ONE_ARG[name] && one && named.length === 0)
    return commandAtom(r, ONE_ARG[name], [readArg(r, parts[0])]);
  if (name === 'root' && parts.length === 2 && named.length === 0)
    return commandAtom(r, '\\sqrt', [
      readArg(r, parts[0]),
      readArg(r, parts[1]),
    ]);
  if (
    (name === 'frac' || name === 'binom') &&
    parts.length === 2 &&
    named.length === 0
  )
    return commandAtom(r, `\\${name}`, [
      readArg(r, parts[0]),
      readArg(r, parts[1]),
    ]);
  if (name === 'cancel' && one) {
    const cross = isTrue(args.values.cross);
    const inverted = isTrue(args.values.inverted);
    const command = cross ? '\\xcancel' : inverted ? '\\bcancel' : '\\cancel';
    return commandAtom(r, command, [readArg(r, parts[0])]);
  }
  if (
    (name === 'overbrace' || name === 'underbrace') &&
    (parts.length === 1 || parts.length === 2) &&
    named.length === 0
  ) {
    const atom = commandAtom(r, `\\${name}`, [readArg(r, parts[0])]);
    if (parts[1]) {
      const annotation = readArg(r, parts[1]);
      if (name === 'overbrace') atom.superscript = annotation;
      else atom.subscript = annotation;
    }
    return atom;
  }
  if (
    name === 'op' &&
    one &&
    parts[0].length === 1 &&
    parts[0][0].kind === 'Str'
  ) {
    const text = sourceOf(r, parts[0][0]).slice(1, -1);
    if (!/^[\w\s.'-]*$/.test(text)) return undefined;
    const limits = isTrue(args.values.limits);
    // a space in the name is kept, as math would drop a plain one
    const name = text.replace(/ /g, '\\ ');
    return parseLatex(`\\operatorname${limits ? '*' : ''}{${name}}`, {
      style: r.style,
    })[0];
  }
  if (name === 'mat') return readMat(r, args);
  if (name === 'vec') return readVec(r, args);
  if (name === 'cases') return readCases(r, args);
  return undefined;
}

/** calls that keep the one atom they hold and only change how it is placed */
function readWrap(
  r: TypstReader,
  name: string,
  args: TypstCallArgs
): Atom | undefined {
  const parts = positional(args);
  if (parts.length !== 1 || args.rows.length !== 1) return undefined;
  if (name === 'lr') {
    const nodes = parts[0];
    const delimited =
      nodes.length === 1 && nodes[0].kind === 'Math'
        ? trimTrivia(nodes[0].children)
        : nodes;
    if (delimited.length === 1 && delimited[0].kind === 'MathDelimited')
      return readNode(r, delimited[0])[0];
    return readSized(r, delimited);
  }
  if (!['limits', 'scripts', 'stretch', 'mid'].includes(name)) return undefined;
  if (Object.keys(args.values).length > 0) return undefined;
  const atoms = readArg(r, parts[0]);
  if (atoms.length === 0 || (atoms.length > 1 && name === 'mid'))
    return undefined;
  // `mid(|)` is MathLive's `\middle|`
  const text = parts[0].map((node) => sourceOf(r, node)).join('');
  const middle =
    DELIMITERS[text] ??
    DELIMITERS[typstSymbolValue(text) ?? typstShorthandValue(text) ?? ''];
  if (name === 'mid' && middle)
    return parseLatex(`\\middle${middle}`, { style: r.style })[0];
  const atom = atoms.length === 1 ? atoms[0] : new GroupAtom(atoms, 'math');
  // what `stretch()` holds takes its scripts under and over it, as with `limits()`
  if (name !== 'mid') {
    atom.subsupPlacement = name === 'scripts' ? 'adjacent' : 'over-under';
    atom.explicitSubsupPlacement = name !== 'stretch';
  }
  return atom;
}

/** `phi(x)`, `qty(1, "m")`: a symbol or a name Typst defines elsewhere, its arguments in parentheses */
function readGenericCall(
  r: TypstReader,
  callee: string,
  argsNode: TypstSyntaxNode
): Atom {
  const content = trimTrivia(argsNode.children.slice(1, -1));
  const body = readSequence(r, content, (node) => {
    if (node.kind === 'Comma' || node.kind === 'Semicolon')
      return [named(charAtom(r, sourceOf(r, node)), sourceOf(r, node))];
    if (node.kind === 'Named' || node.kind === 'Spread')
      return [codeAtom(sourceOf(r, node))];
    return readMath(r, node);
  });
  const open = argsNode.children[0];
  const close = argsNode.children[argsNode.children.length - 1];
  const parens = new LeftRightAtom('', body, {
    leftDelim: '(',
    rightDelim: ')',
    style: r.style,
  });
  keep(parens, sourceOf(r, argsNode), {
    open: r.src.slice(open.from, content[0]?.from ?? open.to),
    close: r.src.slice(content[content.length - 1]?.to ?? open.to, close.to),
    value: '( )',
  });
  return callGroup(r, callee, parens);
}

/** a call MathLive has no structure for: its name as written, then its parentheses */
export function callGroup(
  r: TypstReader,
  callee: string,
  parens: LeftRightAtom
): Atom {
  const value = typstSymbolValue(callee);
  const head = named(
    value !== undefined
      ? symbolAtom(r, value)
      : parseLatex(`\\operatorname{${callee}}`, { style: r.style })[0],
    callee
  );
  parens.typstLead = '';
  const group = new GroupAtom([head, parens], 'math');
  group.typstSpelling = { call: callee };
  return group;
}

export function readCall(r: TypstReader, node: TypstSyntaxNode): Atom[] {
  const [calleeNode, argsNode] = node.children;
  const callee = sourceOf(r, calleeNode);
  const source = sourceOf(r, node);
  const args = splitArgs(r, argsNode);
  if (args.spread) return [codeAtom(source)];

  const builtin = readBuiltin(r, callee, args);
  if (builtin)
    return [
      keep(builtin, source, {
        name: callee,
        args: args.separators,
        named: args.named,
      }),
    ];

  const wrapped = readWrap(r, callee, args);
  if (wrapped)
    return [keep(wrapped, source, { wrap: callee, args: args.separators })];

  const value = typstSymbolValue(callee);
  const accent = value === undefined ? undefined : typstAccentCommand(value);
  const parts = positional(args);
  if (accent && parts.length === 1 && args.rows.length === 1) {
    const body = readArg(r, parts[0]);
    const command =
      accent === '\\vec' && body.length > 1 ? '\\overrightarrow' : accent;
    return [
      keep(commandAtom(r, command, [body]), source, {
        name: callee,
        args: args.separators,
        named: args.named,
      }),
    ];
  }

  return [keep(readGenericCall(r, callee, argsNode), source)];
}
