import type { Atom } from '../../core/atom-class';
import type { Style } from '../../public/core-types';
import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import { ModeEditor } from '../../editor-mathfield/mode-editor';
import { range } from '../../editor-model/selection-utils';
import { TYPST_STYLE_CALLS } from '../style';

/** a script or denominator opened by typing `^`, `_` or `/`, which takes one Typst operand */
export type TypstOperand = {
  /** the script carrier or the fraction */
  atom: Atom;
  branch: 'superscript' | 'subscript' | 'below';
  /** opened with `(`: only the matching `)` ends it */
  parens: boolean;
};

/** what a run of keystrokes in a Typst field has typed so far and not yet finished */
export type TypstTyping = {
  /** the letters and dots of a name, which a character that cannot continue it resolves */
  name: Atom[];
  /** the characters of a shorthand such as `->`, which the next one may extend */
  shorthand?: { text: string; atoms: Atom[] };
  /** innermost last */
  operands: TypstOperand[];
  suggestion: number;
  /** names are on offer for the letters typed */
  suggesting: boolean;
  /** set while typing moves the caret itself */
  busy: boolean;
  /** a space was the last key: what comes next is apart from what came before */
  spaced: boolean;
  /** the mode a key switches to once its step is over: a step's selection change would undo it */
  switchTo?: 'text' | 'latex';
  /** a string being typed after `after`; its first character starts a string of its own */
  string?: { after: Atom; apart: boolean };
  /** the content the last undo step holds, so a step that changed nothing takes none */
  recorded?: { root: Atom; count: number };
};

const typings = new WeakMap<_Mathfield, TypstTyping>();

export function typstTyping(mf: _Mathfield): TypstTyping {
  let typing = typings.get(mf);
  if (!typing) {
    typing = {
      name: [],
      operands: [],
      suggestion: 0,
      suggesting: false,
      busy: false,
      spaced: false,
    };
    typings.set(mf, typing);
  }
  return typing;
}

/** whether `atoms` are still in the field, side by side */
export function isRun(atoms: readonly Atom[]): boolean {
  return (
    atoms.length > 0 &&
    atoms.every(
      (atom, i) =>
        atom.parent && (i === 0 || atoms[i - 1].rightSibling === atom)
    )
  );
}

/** whether `atoms` sit side by side with the caret right after the last one */
export function isAtCaret(mf: _Mathfield, atoms: readonly Atom[]): boolean {
  const { model } = mf;
  return (
    model.selectionIsCollapsed &&
    model.at(model.position) === atoms[atoms.length - 1] &&
    isRun(atoms)
  );
}

/** one typing step, one change: the caret moves it makes are not the caret leaving */
export function withTyping(mf: _Mathfield, data: string, step: () => void) {
  const typing = typstTyping(mf);
  typing.busy = true;
  try {
    mf.model.deferNotifications(
      { content: true, selection: true, data, type: 'insertText' },
      step
    );
  } finally {
    typing.busy = false;
  }
  mf.dirty = true;
}

/**
 * An undo step for what typing changed, as MathLive takes one for a character: steps of the same
 * kind coalesce, and `op` undefined folds this one into the step before it, so the letters of a
 * name and what they became undo together.
 */
export function recordTyping(mf: _Mathfield, op?: string): void {
  const typing = typstTyping(mf);
  const { root } = mf.model;
  const count = root.changeCounter;
  if (typing.recorded?.root === root && typing.recorded.count === count) return;
  mf.snapshot(op ?? (mf.undoManager.lastOp || undefined));
  typing.recorded = { root, count };
}

export function nameText(atoms: readonly Atom[]): string {
  return atoms.map((atom) => atom.value).join('');
}

export function isInside(atom: Atom | undefined, ancestor: Atom): boolean {
  for (let a = atom?.parent; a; a = a.parent) if (a === ancestor) return true;
  return false;
}

/** the style what is typed here takes: a style call's own, or MathLive's choice */
export function typingStyle(mf: _Mathfield): Style {
  // the call's argument is styled, not the scripts on it: `bold(x)_i`
  let child = mf.model.at(mf.model.position);
  for (let a = child?.parent; a; child = a, a = a.parent) {
    const name = a.typstSpelling?.name;
    if (
      child.parentBranch === 'body' &&
      a.type === 'group' &&
      name !== undefined &&
      TYPST_STYLE_CALLS.has(name)
    )
      return { ...a.style };
  }
  // Typst styles only through calls: what is typed beside styled atoms is not styled
  return { ...mf.defaultStyle };
}

// characters LaTeX would read as syntax
const LATEX_ESCAPES: Readonly<Record<string, string>> = {
  '{': '\\lbrace',
  '}': '\\rbrace',
  '&': '\\&',
  '#': '\\#',
  '$': '\\$',
  '%': '\\%',
  '~': '\\~',
  '\\': '\\backslash',
};

/** types `c` as a character, or `latex` in its place, and returns the atom it made */
export function insertAtom(
  mf: _Mathfield,
  c: string,
  latex = LATEX_ESCAPES[c] ?? c
): Atom | undefined {
  const { model } = mf;
  const ok = ModeEditor.insert(model, latex, {
    style: typingStyle(mf),
    insertionMode: 'replaceSelection',
    selectionMode: model.selectionIsPlaceholder ? 'after' : 'placeholder',
    format: 'latex',
  });
  return ok ? model.at(model.position) : undefined;
}

/** puts `replacement` where `atoms` were; a selection end on one of them moves after it */
export function replaceAtoms(
  mf: _Mathfield,
  atoms: readonly Atom[],
  replacement: Atom
): void {
  const { model } = mf;
  const ends = [model.at(model.anchor), model.at(model.position)].map((end) =>
    atoms.includes(end) ? replacement : end
  );
  const parent = atoms[0].parent!;
  replacement.typstLead ??= atoms[0].typstLead;
  parent.addChildBefore(replacement, atoms[0]);
  for (const atom of atoms) parent.removeChild(atom);
  model.setSelection(model.offsetOf(ends[0]), model.offsetOf(ends[1]));
}

/** puts `atom` at the caret, in place of what is selected */
export function placeAtom(mf: _Mathfield, atom: Atom): void {
  const { model } = mf;
  if (!model.selectionIsCollapsed) model.deleteAtoms(range(model.selection));
  const caret = model.at(model.position);
  caret.parent!.addChildAfter(atom, caret);
  model.position = model.offsetOf(atom);
}

export function selectPlaceholderIn(mf: _Mathfield, atom: Atom): boolean {
  const placeholder = atom.children.find((x) => x.type === 'placeholder');
  if (!placeholder) return false;
  const offset = mf.model.offsetOf(placeholder);
  mf.model.setSelection(offset - 1, offset);
  return true;
}

/** the caret at the start of a branch, its placeholder selected when it has one */
export function enterBranch(mf: _Mathfield, branch: readonly Atom[]): void {
  const placeholder = branch.find((x) => x.type === 'placeholder');
  const { model } = mf;
  if (placeholder) {
    const offset = model.offsetOf(placeholder);
    model.setSelection(offset - 1, offset);
  } else model.position = model.offsetOf(branch[0]);
}
