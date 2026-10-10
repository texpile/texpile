import type { Atom } from '../../core/atom-class';
import type { Style } from '../../public/core-types';
import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import { ModeEditor } from '../../editor-mathfield/mode-editor';
import { range } from '../../editor-model/selection-utils';
import { getLatexGroupBody } from '../../editor-mathfield/mode-editor-latex';
import { requestUpdate } from '../../editor-mathfield/render';
import { complete } from '../../editor-mathfield/autocomplete';
import { keyboardEventToChar } from '../../editor/keyboard';
import { hideSuggestionPopover } from '../../editor/suggestion-popover';
import { mightProducePrintableCharacter } from '../../ui/events/utils';
import { TYPST_MATH_SHORTHANDS } from '../symbol-data';
import { named, symbolAtom } from '../read/read';
import { closeCall, nextArgument } from './calls';
import {
  acceptSuggestion,
  continuesName,
  expandShortcut,
  resolveName,
  suggestNames,
  typeIntoName,
} from './compose';
import { alignPoint, breakLine, intoLines } from './lines';
import {
  closeParens,
  exitOperand,
  openFraction,
  openParens,
  openScript,
  operandAt,
  operandEnds,
} from './operands';
import {
  insertAtom,
  isAtCaret,
  isInside,
  isRun,
  placeAtom,
  recordTyping,
  replaceAtoms,
  typingStyle,
  typstTyping,
  withTyping,
  type TypstTyping,
} from './state';

// the brackets and bars stay MathLive's smart fences
const SHORTHANDS = Object.keys(TYPST_MATH_SHORTHANDS).filter(
  (text) => !/[[\]|]/.test(text)
);

const MODIFIERS = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'Fn',
  'OS',
]);

function startsShorthand(text: string): boolean {
  return SHORTHANDS.some((s) => s.length > text.length && s.startsWith(text));
}

function shorthandAtom(text: string, atoms: readonly Atom[]): Atom {
  return named(
    symbolAtom(
      { src: text, style: { ...atoms[0].style } },
      TYPST_MATH_SHORTHANDS[text]
    ),
    text
  );
}

/** `c` after the start of a shorthand: `-` `>` is →, and another `>` makes it ↠ */
function extendShorthand(
  mf: _Mathfield,
  typing: TypstTyping,
  c: string
): boolean {
  const typed = typing.shorthand;
  if (!typed) return false;
  const text = typed.text + c;
  if (!SHORTHANDS.includes(text) && !startsShorthand(text)) return false;
  const atom = insertAtom(mf, c);
  if (!atom) return false;
  const atoms = [...typed.atoms, atom];
  if (SHORTHANDS.includes(text)) {
    const symbol = shorthandAtom(text, atoms);
    replaceAtoms(mf, atoms, symbol);
    typing.shorthand = { text, atoms: [symbol] };
  } else typing.shorthand = { text, atoms };
  return true;
}

function typeSymbol(mf: _Mathfield, typing: TypstTyping, c: string): void {
  let atom: Atom | undefined;
  // `*` and `~` are Typst's own operators; a hyphen is a minus either way
  if (TYPST_MATH_SHORTHANDS[c] && c !== '-') {
    atom = named(
      symbolAtom({ src: c, style: typingStyle(mf) }, TYPST_MATH_SHORTHANDS[c]),
      c
    );
    placeAtom(mf, atom);
  } else atom = insertAtom(mf, c);
  if (atom && startsShorthand(c)) typing.shorthand = { text: c, atoms: [atom] };
}

function typeChar(
  mf: _Mathfield,
  typing: TypstTyping,
  c: string,
  fence: (c: string, style: Style) => boolean
): void {
  const { model } = mf;
  if (model.selectionIsPlaceholder) model.deleteAtoms(range(model.selection));
  intoLines(mf);
  if (!isAtCaret(mf, typing.name)) typing.name = [];
  if (typing.shorthand && !isAtCaret(mf, typing.shorthand.atoms))
    typing.shorthand = undefined;

  if (typing.name.length > 0) {
    if (continuesName(typing, c)) {
      typeIntoName(mf, typing, c);
      expandShortcut(mf, typing);
      return;
    }
    if (resolveName(mf, typing, c)) return;
  }
  if (extendShorthand(mf, typing, c)) return;
  typing.shorthand = undefined;

  for (
    let op = operandAt(mf, typing);
    op && operandEnds(op, c);
    op = operandAt(mf, typing)
  )
    exitOperand(mf, typing, op);

  if (/^[a-zA-Z]$/.test(c)) {
    typeIntoName(mf, typing, c);
    expandShortcut(mf, typing);
    return;
  }
  switch (c) {
    case ' ':
      typing.spaced = true;
      return;
    case '(': {
      const op = operandAt(mf, typing);
      if (!(op && openParens(op)) && !fence(c, typingStyle(mf)))
        insertAtom(mf, c);
      return;
    }
    case ')':
      // a `(` typed as a character pairs first, as a fence MathLive draws or, after a
      // decimal, `1.2(3)`, a character too
      if (parenOpen(mf)) {
        if (!fence(c, typingStyle(mf))) insertAtom(mf, c);
        return;
      }
      if (
        !closeParens(mf, typing) &&
        !closeCall(mf) &&
        !fence(c, typingStyle(mf))
      )
        insertAtom(mf, c);
      return;
    case '[':
    case ']':
    case '{':
    case '}':
    case '|':
      if (!fence(c, typingStyle(mf))) insertAtom(mf, c);
      return;
    case ',':
    case ';':
      if (!nextArgument(mf, c)) typeSymbol(mf, typing, c);
      return;
    case '^':
    case '_':
      openScript(mf, typing, c);
      return;
    case '/':
      openFraction(mf, typing);
      return;
    case '\\':
      if (!breakLine(mf)) model.announce('plonk');
      return;
    case '&':
      if (!alignPoint(mf)) model.announce('plonk');
      return;
    case '"':
      typing.string = { after: model.at(model.position), apart: false };
      typing.switchTo = 'text';
      return;
    case '#':
      typing.switchTo = 'latex';
      return;
    case '$':
      model.announce('plonk');
      return;
  }
  typeSymbol(mf, typing, c);
}

/**
 * Whether a `(` typed as a character before the caret still waits for its `)`, which Typst
 * pairs with it before the call around them: `abs(f(x))`, where MathLive draws no fence
 */
function parenOpen(mf: _Mathfield): boolean {
  let closed = 0;
  for (
    let atom: Atom | undefined = mf.model.at(mf.model.position);
    atom && atom.type !== 'first';
    atom = atom.leftSibling
  ) {
    if (atom.type === 'mclose' && atom.value === ')') closed++;
    if (atom.type === 'mopen' && atom.value === '(' && closed-- === 0)
      return true;
  }
  return false;
}

/** what a space typed before this step keeps apart: the atom it put after `before` */
function keepApart(before: Atom, next: Atom | undefined): void {
  const typed = before.parent ? before.rightSibling : undefined;
  if (before.type !== 'first' && typed && typed !== next)
    typed.typstLead ??= ' ';
}

/** a character typed in a Typst field's math, read the way Typst's own source would be */
export function insertTypstChar(
  mf: _Mathfield,
  c: string,
  fence: (c: string, style: Style) => boolean
): void {
  const typing = typstTyping(mf);
  const { model } = mf;
  const spaced = typing.spaced;
  typing.spaced = false;
  const before = model.at(model.position);
  const next = before.rightSibling;
  withTyping(mf, c, () => {
    typeChar(mf, typing, c, fence);
    if (spaced) keepApart(before, next);
  });
  // a string opened by this key, after a space
  if (spaced && typing.string) typing.string.apart = true;
  const mode = typing.switchTo;
  typing.switchTo = undefined;
  if (mode === 'text') mf.switchMode('text');
  else if (mode === 'latex') {
    mf.switchMode('latex', '', '#');
    // `x #h(1em)`: what is typed apart from what is before it stays apart once it is read
    const group = getLatexGroupBody(model)[0]?.parent;
    if (spaced && before.type !== 'first' && group) group.typstLead = ' ';
  }
  recordTyping(mf, `insert-${model.at(model.position).type}`);
  suggestNames(mf, typing);
}

/** the first character of the string being typed starts a string of its own, `"a" "b"` */
function markString(mf: _Mathfield, typing: TypstTyping): void {
  if (!typing.string) return;
  const { after, apart } = typing.string;
  const first = after.parent ? after.rightSibling : undefined;
  if (first?.mode === 'text') {
    first.typstSpelling = { ...first.typstSpelling, str: true };
    if (apart && after.type !== 'first') first.typstLead ??= ' ';
    typing.string = undefined;
  } else if (mf.model.mode !== 'text') typing.string = undefined;
}

/** whether `c` goes on with `#code` whose brackets are closed: `.field`, `(args)`, `[content]` */
function continuesCode(code: string, c: string): boolean {
  if (code === '#' || code.endsWith('.') || '.(['.includes(c)) return true;
  // an identifier goes on with letters, digits, `_` and `-`
  return /[\p{L}\p{N}_-]$/u.test(code) && /[\p{L}\p{N}_-]/u.test(c);
}

/** whether `#code` is over: its brackets closed and no string left open */
function isCodeComplete(code: string): boolean {
  let depth = 0;
  let inString = false;
  for (const ch of code) {
    if (inString) inString = ch !== '"';
    else if (ch === '"') inString = true;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
  }
  return depth <= 0 && !inString;
}

/**
 * Keys a Typst field takes before MathLive: `true` passes a character on to be typed, `false`
 * means the key was handled, and undefined leaves it to MathLive.
 */
export function onTypstKeystroke(
  mf: _Mathfield,
  keystroke: string,
  evt: KeyboardEvent
): boolean | undefined {
  const { model } = mf;
  const typing = typstTyping(mf);
  if (model.mode === 'latex') {
    // Typst source typed after Escape or `#`: a space is part of it until `#code` is over
    const source = getLatexGroupBody(model)
      .map((x) => x.value)
      .join('');
    const code = source.startsWith('#') && isCodeComplete(source);
    if (keystroke !== '[Space]') {
      // `#h(1em)_2`: the code ends where Typst's does, before what cannot go on with it
      const c = keyboardEventToChar(evt);
      if (!code || c.length !== 1 || continuesCode(source, c)) return undefined;
      complete(mf, 'accept-all');
      // and the key is typed as math, where the caret now is
      return true;
    }
    if (code) {
      complete(mf, 'accept-all');
      // a space ends it, and keeps what follows apart from it
      typing.spaced = true;
      return false;
    }
    ModeEditor.insert(model, ' ');
    requestUpdate(mf);
    return false;
  }
  if (model.mode === 'text') {
    if (keyboardEventToChar(evt) !== '"') return undefined;
    mf.switchMode('math');
    markString(mf, typing);
    return false;
  }
  const naming = isAtCaret(mf, typing.name);
  if (naming && typing.suggesting) {
    const step = { '[ArrowDown]': 1, '[ArrowUp]': -1 }[keystroke];
    if (step) {
      typing.suggestion += step;
      suggestNames(mf, typing);
      return false;
    }
    if (['[Tab]', '[Enter]', '[Return]'].includes(keystroke)) {
      acceptSuggestion(mf, typing);
      return false;
    }
    if (keystroke === '[Escape]') {
      typing.suggesting = false;
      hideSuggestionPopover(mf);
      return false;
    }
  }
  // beside an equation of lines, deleting reaches into them as typing does
  if (
    keystroke === '[Delete]' &&
    model.selectionIsCollapsed &&
    model.position === 0
  )
    intoLines(mf);
  if (keystroke === '[Backspace]' && model.selectionIsCollapsed) {
    typing.spaced = false;
    if (model.position > 0) intoLines(mf);
    withTyping(mf, '', () => {
      mf.executeCommand('deleteBackward');
      if (naming) typing.name.pop();
    });
    suggestNames(mf, typing);
    return false;
  }
  if (mightProducePrintableCharacter(evt) && !evt.altKey) return true;
  if (!MODIFIERS.has(evt.key)) finishTypstTyping(mf);
  return undefined;
}

/** ends what is being typed: the caret left it, or the field lost focus */
export function finishTypstTyping(mf: _Mathfield): void {
  const typing = typstTyping(mf);
  if (typing.busy) return;
  const { model } = mf;
  const name = isRun(typing.name);
  if (typing.suggesting) hideSuggestionPopover(mf);
  typing.suggesting = false;
  typing.shorthand = undefined;
  // a string or `#code` typed inside an operand is still inside it, which its `)` closes
  const caret = model.at(model.position);
  typing.operands = typing.operands.filter((op) => isInside(caret, op.atom));
  typing.spaced = false;
  markString(mf, typing);
  if (!name) {
    typing.name = [];
    return;
  }
  withTyping(mf, '', () => resolveName(mf, typing));
  // a selection change arrives with notifications silenced, and the change still has to be told
  if (model.silenceNotifications) {
    model.silenceNotifications = false;
    model.contentDidChange({ inputType: 'insertText' });
    model.silenceNotifications = true;
  }
  requestUpdate(mf);
}
