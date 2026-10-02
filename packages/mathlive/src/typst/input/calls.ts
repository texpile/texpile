import type { Atom } from '../../core/atom-class';
import { parseLatex } from '../../core/parser';
import type { PrivateStyle } from '../../core/types';
import { ArrayAtom } from '../../atoms/array';
import { GroupAtom } from '../../atoms/group';
import { LeftRightAtom } from '../../atoms/leftright';
import { PlaceholderAtom } from '../../atoms/placeholder';
import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import { COMMAND_CALLS, FENCES, ONE_ARG } from '../names';
import { applyTypstStyle, TYPST_STYLE_CALLS } from '../style';
import {
  TYPST_ACCENT_NAMES,
  typstAccentCommand,
  typstSymbolValue,
} from '../symbols';
import { callGroup } from '../read/read-call';
import { createGrid } from '../read/read-grid';
import { enterBranch } from './state';

const BOX = '\\placeholder{}';

const LATEX: Readonly<Record<string, string>> = {
  frac: `\\frac{${BOX}}{${BOX}}`,
  binom: `\\binom{${BOX}}{${BOX}}`,
  sqrt: `\\sqrt{${BOX}}`,
  root: `\\sqrt[${BOX}]{${BOX}}`,
  overbrace: `\\overbrace{${BOX}}`,
  underbrace: `\\underbrace{${BOX}}`,
  cancel: `\\cancel{${BOX}}`,
  ...Object.fromEntries(
    Object.entries(ONE_ARG).map(([name, command]) => [
      name,
      `${command}{${BOX}}`,
    ])
  ),
};

// the commands that write as a call with one argument (a brace's annotation aside)
const CALL_COMMANDS = new Set([
  ...Object.keys(TYPST_ACCENT_NAMES),
  ...Object.keys(COMMAND_CALLS),
]);

const LINE_ENVIRONMENTS = new Set([
  'aligned',
  'gathered',
  'lines',
  'split',
  'align',
  'gather',
  'multline',
]);

/** what typing `name(` builds, its first argument empty */
export function typstCallAtom(name: string, style: PrivateStyle): Atom {
  const value = typstSymbolValue(name);
  const accent = value === undefined ? undefined : typstAccentCommand(value);
  const latex = LATEX[name] ?? (accent ? `${accent}{${BOX}}` : undefined);
  if (latex) {
    const [atom] = parseLatex(latex, { style });
    atom.typstSpelling = { name };
    return atom;
  }
  if (FENCES[name]) {
    const [leftDelim, rightDelim] = FENCES[name];
    const atom = new LeftRightAtom('', [new PlaceholderAtom({ style })], {
      leftDelim,
      rightDelim,
      style,
    });
    atom.typstSpelling = { name };
    return atom;
  }
  if (TYPST_STYLE_CALLS.has(name)) {
    const inner = applyTypstStyle(style, name);
    const group = new GroupAtom(
      [new PlaceholderAtom({ style: inner })],
      'math'
    );
    group.style = { ...inner };
    group.typstSpelling = { name };
    return group;
  }
  if (name === 'mat' || name === 'vec' || name === 'cases') {
    const grid = createGrid(
      { src: '', style },
      name === 'cases' ? 'cases' : 'pmatrix',
      [[[new PlaceholderAtom({ style })]]]
    );
    if (name === 'vec') grid.typstSpelling = { name };
    return grid;
  }
  const parens = new LeftRightAtom('', [], {
    leftDelim: '(',
    rightDelim: ')',
    style,
  });
  return callGroup({ src: name, style }, name, parens);
}

/** the caret in a call just built: its first placeholder, or inside its parentheses */
export function enterCall(mf: _Mathfield, call: Atom): void {
  const placeholder = call.children.find((x) => x.type === 'placeholder');
  if (placeholder) {
    const offset = mf.model.offsetOf(placeholder);
    mf.model.setSelection(offset - 1, offset);
    return;
  }
  const parens = call.body?.find((x) => x.type === 'leftright');
  if (parens) mf.model.position = mf.model.offsetOf(parens.body![0]);
}

function isCallFraction(atom: Atom): boolean {
  const name = atom.typstSpelling?.name;
  return name === 'frac' || name === 'binom';
}

export function isLineGrid(atom: Atom): boolean {
  return LINE_ENVIRONMENTS.has((atom as ArrayAtom).environmentName);
}

/** the call whose arguments a branch of `parent` holds, written `name(...)` */
function callOf(parent: Atom): Atom | undefined {
  if (parent.type === 'genfrac' && isCallFraction(parent)) return parent;
  if (parent.type === 'surd' || CALL_COMMANDS.has(parent.command))
    return parent;
  const name = parent.typstSpelling?.name ?? '';
  if (parent instanceof LeftRightAtom && FENCES[name]) return parent;
  if (parent.type === 'group' && TYPST_STYLE_CALLS.has(name)) return parent;
  if (parent instanceof ArrayAtom && !isLineGrid(parent)) return parent;
  if (parent instanceof LeftRightAtom && parent.parent?.typstSpelling?.call)
    return parent.parent;
  return undefined;
}

/** `)` at the end of a call's argument: the caret leaves the call */
export function closeCall(mf: _Mathfield): boolean {
  const { model } = mf;
  const caret = model.at(model.position);
  if (!caret.parent || !caret.isLastSibling) return false;
  const call = callOf(caret.parent);
  if (!call) return false;
  model.position = model.offsetOf(call);
  return true;
}

/** `,` or `;` between a call's arguments: the caret moves on to the next one */
export function nextArgument(mf: _Mathfield, separator: string): boolean {
  const caret = mf.model.at(mf.model.position);
  const parent = caret.parent;
  const branch = caret.parentBranch;
  if (!parent) return false;
  if (parent instanceof ArrayAtom && Array.isArray(branch))
    return nextCell(mf, parent, branch as [number, number], separator);
  if (separator !== ',') return false;
  if (parent.type === 'genfrac' && branch === 'above' && isCallFraction(parent))
    enterBranch(mf, parent.branch('below')!);
  else if (parent.type === 'surd' && branch === 'above')
    enterBranch(mf, parent.body!);
  else if (parent.command === '\\overbrace' && branch === 'body')
    enterBranch(mf, parent.createBranch('superscript'));
  else if (parent.command === '\\underbrace' && branch === 'body')
    enterBranch(mf, parent.createBranch('subscript'));
  else return false;
  return true;
}

function nextCell(
  mf: _Mathfield,
  grid: ArrayAtom,
  [row, column]: [number, number],
  separator: string
): boolean {
  if (isLineGrid(grid)) return false;
  // a matrix's rows end at `;`, a vector's and a case list's at `,`
  const byRow =
    grid.typstSpelling?.name === 'vec' ||
    grid.environmentName === 'cases' ||
    grid.environmentName === 'rcases';
  if (byRow && separator !== ',') return false;
  if (byRow || separator === ';') {
    if (row + 1 >= grid.rowCount) grid.addRowAfter(row);
    enterBranch(mf, grid.getCell(row + 1, 0)!);
    return true;
  }
  if (column + 1 >= grid.colCount) {
    if (grid.colCount >= grid.maxColumns) return false;
    grid.addColumnAfter(grid.colCount - 1);
  }
  enterBranch(mf, grid.getCell(row, column + 1)!);
  return true;
}
