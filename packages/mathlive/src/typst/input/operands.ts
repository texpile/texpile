import type { Atom } from '../../core/atom-class';
import { parseLatex } from '../../core/parser';
import { LeftRightAtom } from '../../atoms/leftright';
import { SubsupAtom } from '../../atoms/subsup';
import { hasScripts, isDigit, isDot, isPrime, numberText } from '../atoms';
import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import { range } from '../../editor-model/selection-utils';
import {
  enterBranch,
  isInside,
  typingStyle,
  type TypstOperand,
  type TypstTyping,
} from './state';

// Typst's operands are one token: `x^2y` scripts the 2, `a/b c` divides by b alone.
// What can still continue a token is decided here; `(` right after `^`, `_` or `/` opens an
// operand only the matching `)` ends, and Typst drops those parentheses.

/** what the operand holds; primes `x'^2` put first in a superscript are the base's */
function content(op: TypstOperand): Atom[] {
  const atoms = (op.atom.branch(op.branch) ?? []).filter(
    (x) => x.type !== 'first' && x.type !== 'placeholder'
  );
  let primes = 0;
  if (op.branch === 'superscript')
    while (atoms[primes] && isPrime(atoms[primes])) primes++;
  return atoms.slice(primes);
}

/** typed apart from what came before it: a space was typed, or the source had one */
function isApart(atom: Atom): boolean {
  return /^\s/.test(atom.typstLead ?? '');
}

/** the operand the caret types into, dropping the ones it has left */
export function operandAt(
  mf: _Mathfield,
  typing: TypstTyping
): TypstOperand | undefined {
  const caret = mf.model.at(mf.model.position);
  typing.operands = typing.operands.filter((op) => isInside(caret, op.atom));
  const op = typing.operands[typing.operands.length - 1];
  if (op && caret.parent === op.atom && caret.parentBranch === op.branch)
    return op;
  return undefined;
}

/** whether typing `c` after what the operand holds starts something after it */
export function operandEnds(op: TypstOperand, c: string): boolean {
  if (op.parens) return false;
  const atoms = content(op);
  if (atoms.length === 0) return false;
  // a fraction's operand takes its own scripts and primes, a script's are its base's
  if (c === '^' || c === '_' || c === "'") return op.branch !== 'below';
  // a number goes on with its digits and one decimal point: `x^2.5`
  const number = numberText(atoms);
  if (number !== undefined && /^\d+(\.\d*)?$/.test(number))
    return !(/\d/.test(c) || (c === '.' && !number.includes('.')));
  // `x_i(t)` and `n!` are one operand
  const [only] = atoms;
  if (atoms.length === 1 && /^[a-zA-Z]$/.test(only.value ?? ''))
    return c !== '(' && c !== '!';
  return true;
}

export function exitOperand(
  mf: _Mathfield,
  typing: TypstTyping,
  op: TypstOperand
): void {
  typing.operands = typing.operands.slice(0, typing.operands.indexOf(op));
  // `x^2.` and no digit after: the point was never the number's
  const atoms = content(op);
  const last = atoms[atoms.length - 1];
  if (atoms.length > 1 && last && isDot(last)) {
    op.atom.removeChild(last);
    op.atom.parent!.addChildAfter(last, op.atom);
    mf.model.position = mf.model.offsetOf(last);
    return;
  }
  mf.model.position = mf.model.offsetOf(op.atom);
}

/** `(` as the first thing in an operand: Typst drops it, and writing it back keeps it */
export function openParens(op: TypstOperand): boolean {
  if (op.parens || content(op).length > 0) return false;
  op.parens = true;
  const parens = [...(op.atom.typstSpelling?.parens ?? [false, false])] as [
    boolean,
    boolean,
  ];
  parens[op.branch === 'subscript' ? 0 : 1] = true;
  op.atom.typstSpelling = { ...op.atom.typstSpelling, parens };
  return true;
}

export function closeParens(mf: _Mathfield, typing: TypstTyping): boolean {
  const op = operandAt(mf, typing);
  if (!op?.parens || !mf.model.at(mf.model.position).isLastSibling)
    return false;
  exitOperand(mf, typing, op);
  return true;
}

export function openScript(
  mf: _Mathfield,
  typing: TypstTyping,
  c: '^' | '_'
): void {
  const { model } = mf;
  // a brace's own script branch holds its annotation: scripts after it go on an atom of their own
  const target = model.at(model.position);
  if (
    model.selectionIsCollapsed &&
    (target.command === '\\overbrace' || target.command === '\\underbrace')
  ) {
    let carrier = target.rightSibling;
    if (carrier?.type !== 'subsup') {
      carrier = new SubsupAtom({ style: target.style });
      target.parent!.addChildAfter(carrier, target);
    }
    model.position = model.offsetOf(carrier);
  }
  const branch = c === '^' ? 'superscript' : 'subscript';
  // `x'^2`: the superscript goes on after the primes, which MathLive keeps there
  const primed = model.at(model.position).superscript;
  if (
    model.selectionIsCollapsed &&
    branch === 'superscript' &&
    primed?.some((x) => x.type !== 'first') &&
    primed.every((x) => x.type === 'first' || isPrime(x))
  ) {
    model.position = model.offsetOf(primed[primed.length - 1]);
    typing.operands.push({ atom: primed[0].parent!, branch, parens: false });
    return;
  }
  mf.executeCommand(c === '^' ? 'moveToSuperscript' : 'moveToSubscript');
  const caret = model.at(model.position);
  if (caret.parentBranch === branch && caret.type === 'first')
    typing.operands.push({ atom: caret.parent!, branch, parens: false });
}

/** the atoms of the number ending at `atom`: `12.5`, but `1.2.3` ends in the number 3 */
function numberBefore(atom: Atom): Atom[] {
  const run: Atom[] = [atom];
  for (
    let a = atom;
    !isApart(a) &&
    a.leftSibling &&
    (isDigit(a.leftSibling) || isDot(a.leftSibling));
    a = a.leftSibling
  )
    run.unshift(a.leftSibling);
  const text = numberText(run)!;
  const tokens = text.match(/\d+(\.\d+)?|\./g)!;
  return run.slice(text.length - tokens[tokens.length - 1].length);
}

/** a string's characters, back to the one it starts with */
function stringBefore(atom: Atom): Atom[] {
  const run: Atom[] = [atom];
  for (
    let a = atom;
    !a.typstSpelling?.str &&
    a.leftSibling?.mode === 'text' &&
    a.leftSibling.typstSpelling?.code === undefined;
    a = a.leftSibling
  )
    run.unshift(a.leftSibling);
  return run;
}

/**
 * What Typst divides when `/` comes after `caret`: the item before it, whatever it is (`+/2` is
 * a fraction of a plus), with its scripts. A number, a string, and a letter or name right
 * before parentheses, `f(x)/2`, are one item.
 */
function numerator(caret: Atom): Atom[] {
  let atom: Atom | undefined = caret;
  const scripts: Atom[] = [];
  if (atom.type === 'subsup') {
    scripts.push(atom);
    atom = atom.leftSibling;
  }
  if (!atom || atom.type === 'first') return [];
  let item = [atom];
  if (isDigit(atom)) item = numberBefore(atom);
  else if (atom.mode === 'text' && atom.typstSpelling?.code === undefined)
    item = stringBefore(atom);
  else if (atom.type === 'leftright' && !isApart(atom)) {
    const before = atom.leftSibling;
    const name = before?.typstSpelling?.name ?? before?.value ?? '';
    if (before && !hasScripts(before) && /^\p{L}[\p{L}.]*$/u.test(name))
      item = [before, atom];
  }
  return [...item, ...scripts];
}

export function openFraction(mf: _Mathfield, typing: TypstTyping): void {
  const { model } = mf;
  const style = typingStyle(mf);
  let taken: Atom[];
  let before: Atom;
  if (model.selectionIsCollapsed) {
    taken = numerator(model.at(model.position));
    before = taken[0]?.leftSibling ?? model.at(model.position);
  } else {
    // what is selected is the numerator, put where it was
    const [start, end] = range(model.selection);
    before = model.at(start);
    taken = model.extractAtoms([start, end]).filter((x) => x.type !== 'first');
  }
  const parent = before.parent!;
  for (const atom of taken) if (atom.parent) parent.removeChild(atom);
  const [frac] = parseLatex('\\frac{\\placeholder{}}{\\placeholder{}}', {
    style,
  });
  // the space before the numerator is now before the fraction
  if (taken[0]) {
    frac.typstLead = taken[0].typstLead;
    taken[0].typstLead = undefined;
  }
  parent.addChildAfter(frac, before);
  if (taken.length === 0) {
    enterBranch(mf, frac.branch('above')!);
    return;
  }
  // `(a + b)/c`: Typst drops the parentheses around an operand
  const [only] = taken;
  const unwrapped =
    taken.length === 1 &&
    only instanceof LeftRightAtom &&
    only.leftDelim === '(' &&
    !only.subscript &&
    !only.superscript;
  frac.setChildren(
    unwrapped ? only.body!.filter((x) => x.type !== 'first') : taken,
    'above'
  );
  frac.typstSpelling = { parens: [unwrapped, false] };
  enterBranch(mf, frac.branch('below')!);
  typing.operands.push({ atom: frac, branch: 'below', parens: false });
}
