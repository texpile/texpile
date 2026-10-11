import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import { requestUpdate } from '../../editor-mathfield/render';
import { ModeEditor } from '../../editor-mathfield/mode-editor';
import { hideSuggestionPopover } from '../../editor/suggestion-popover';
import {
  isFunctionName,
  isTypstConstant,
  typstNamesStartingWith,
} from '../names';
import { typstSymbolValue } from '../symbols';
import { readName } from '../read/read';
import { enterCall, typstCallAtom } from './calls';
import { showTypstNames } from './popover';
import {
  insertAtom,
  isAtCaret,
  nameText,
  recordTyping,
  replaceAtoms,
  withTyping,
  type TypstTyping,
} from './state';

// A name is typed as its letters and stays them until a character that cannot continue it, as
// Typst's lexer reads `alpha`, `arrow.r` or `frac(`. Only then does it turn into what it names.

const SHOWN = 12;

export function continuesName(typing: TypstTyping, c: string): boolean {
  if (/^[a-zA-Z]$/.test(c)) return true;
  // a dot goes on a name of two letters or more, and only a letter may follow it
  return (
    c === '.' && /^[a-zA-Z]{2,}(\.[a-zA-Z]+)*$/.test(nameText(typing.name))
  );
}

export function typeIntoName(
  mf: _Mathfield,
  typing: TypstTyping,
  c: string
): void {
  const atom = insertAtom(mf, c);
  if (atom) typing.name.push(atom);
  typing.suggestion = 0;
}

/**
 * Ends the name being typed. A symbol or constant takes the place of its letters, `(` after
 * a name opens its call, and any other name stays the letters it was typed as. True when
 * `terminator` was taken.
 */
export function resolveName(
  mf: _Mathfield,
  typing: TypstTyping,
  terminator?: string
): boolean {
  const atoms = typing.name;
  typing.name = [];
  let text = nameText(atoms);
  // `ab.` followed by no letter: the dot is not the name's
  if (text.endsWith('.')) {
    const dot = atoms.pop()!;
    text = text.slice(0, -1);
    typing.shorthand = { text: '.', atoms: [dot] };
  } else if (text.length >= 2 && terminator === '(') {
    const call = typstCallAtom(text, { ...atoms[0].style });
    replaceAtoms(mf, atoms, call);
    enterCall(mf, call);
    recordTyping(mf);
    return true;
  }
  if (typstSymbolValue(text) !== undefined || isTypstConstant(text)) {
    replaceAtoms(
      mf,
      atoms,
      readName({ src: text, style: atoms[0].style }, text)
    );
    recordTyping(mf);
  }
  return false;
}

function acceptName(mf: _Mathfield, typing: TypstTyping, name: string): void {
  if (!isAtCaret(mf, typing.name)) return;
  const atoms = typing.name;
  typing.name = [];
  const style = { ...atoms[0].style };
  if (isFunctionName(name)) {
    const call = typstCallAtom(name, style);
    replaceAtoms(mf, atoms, call);
    enterCall(mf, call);
  } else replaceAtoms(mf, atoms, readName({ src: name, style }, name));
  recordTyping(mf);
}

function namesFor(mf: _Mathfield, typing: TypstTyping): string[] {
  if (mf.options.popoverPolicy === 'off' || !isAtCaret(mf, typing.name))
    return [];
  const text = nameText(typing.name);
  return text.length < 2 ? [] : typstNamesStartingWith(text).slice(0, SHOWN);
}

/**
 * A name typed whole that is one of the field's Typst shortcuts becomes what it
 * maps to, its first slot selected. True when it did.
 */
export function expandShortcut(mf: _Mathfield, typing: TypstTyping): boolean {
  const shortcut = mf.options.typstShortcuts[nameText(typing.name)];
  if (!shortcut || !isAtCaret(mf, typing.name)) return false;
  const atoms = typing.name;
  typing.name = [];
  const { model } = mf;
  const start = model.offsetOf(atoms[0]) - 1;
  model.deleteAtoms([start, model.offsetOf(atoms[atoms.length - 1])]);
  model.position = start;
  hideSuggestionPopover(mf);
  ModeEditor.insert(model, shortcut.value, {
    format: shortcut.format,
    mode: 'math',
    selectionMode: 'placeholder',
  });
  return true;
}

/** takes the highlighted suggestion in place of what was typed */
export function acceptSuggestion(mf: _Mathfield, typing: TypstTyping): void {
  const name = namesFor(mf, typing)[typing.suggestion];
  hideSuggestionPopover(mf);
  if (name) withTyping(mf, name, () => acceptName(mf, typing, name));
}

/** the names the typed letters may become, under the caret */
export function suggestNames(mf: _Mathfield, typing: TypstTyping): void {
  const names = namesFor(mf, typing);
  typing.suggesting = names.length > 0;
  if (names.length === 0) {
    hideSuggestionPopover(mf);
    return;
  }
  typing.suggestion = (typing.suggestion + names.length) % names.length;
  showTypstNames(mf, names, typing.suggestion, (name) => {
    hideSuggestionPopover(mf);
    withTyping(mf, name, () => acceptName(mf, typing, name));
    requestUpdate(mf);
    mf.focus();
  });
}
