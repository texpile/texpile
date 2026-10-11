import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { isMathContext } from '$lib/languages/latex/intellisense/completion/mathContext';
import { collapseNodeSelection } from '$lib/editor/symbols/symbolVisualCaret';
import { loadsPackageFor } from './latexSymbolPackage';
import type { LatexSymbol } from './latexSymbol.types';

const LETTER = /[a-zA-Z]/;
// `\$`, `\%`: characters the visual editor holds as themselves and escapes when it writes them
const ESCAPED = /^\\([$_{}&#%])$/;
const AMSMATH = { package: 'amsmath', fontenc: '' };
// the arguments math sets as text, where a math symbol needs a formula of its own
const TEXT_ARGUMENT = /\\(?:text(?:rm|sf|tt|bf|it|sl|sc|up|md|normal)?|[mhf]box|(?:short)?intertext)\s*$/;
const TEXT_ARGUMENT_WINDOW = 2000;

/** what goes in, and how far into it the caret lands: inside `\sqrt{}`'s braces, else after it */
export type LatexSymbolInsertion = { text: string; caret: number };

/** the caret between a trailing `{}`, where the argument is written */
function caretIn(text: string, suffix = ''): number {
	return text.endsWith(`{}${suffix}`) ? text.length - suffix.length - 1 : text.length;
}

/**
 * The text `symbol` is written as, given whether the caret is in math and the character after it. A
 * math symbol in running text goes in `$...$`, a text one in math in `\text{...}` (`\mbox`, which
 * the kernel has, where amsmath is not loaded). A command name must not run into what follows: in
 * text TeX drops the space after one, so it ends in `{}`; in math a space parts it from a letter.
 */
export function latexSymbolInsertion(symbol: LatexSymbol, inMath: boolean, after = '', amsmath = false): LatexSymbolInsertion {
	const { command, mode } = symbol;
	const named = /\\[a-zA-Z]+$/.test(command);
	if (mode === 'math' && !inMath) {
		const text = `$${command}$`;
		return { text, caret: caretIn(text, '$') };
	}
	if (mode === 'text' && inMath) {
		const text = `${amsmath ? '\\text' : '\\mbox'}{${command}}`;
		return { text, caret: text.length };
	}
	if (inMath) {
		const text = named && LETTER.test(after) ? `${command} ` : command;
		return { text, caret: caretIn(text) };
	}
	const text = named ? `${command}{}` : command;
	return { text, caret: text.length };
}

/** an insertion placed in the document: the range it replaces, and the caret as an offset from `from` */
type PlacedInsertion = LatexSymbolInsertion & { from: number; to: number };

/** true when the `$` at `pos` is a lone one that closes (`side` -1) or opens (1) an inline formula */
function inlineDollar(state: EditorState, pos: number, side: -1 | 1): boolean {
	if (state.sliceDoc(pos, pos + 1) !== '$' || state.sliceDoc(pos - 1, pos) === '$' || state.sliceDoc(pos + 1, pos + 2) === '$')
		return false;
	if (state.sliceDoc(pos - 1, pos) === '\\') return false;
	return isMathContext(state, side < 0 ? pos : pos + 1);
}

/** true when `pos` is in a text argument (`\text{...}`) still open before it, looking back to the formula's start */
export function inTextArgument(state: EditorState, pos: number): boolean {
	const text = state.sliceDoc(Math.max(0, pos - TEXT_ARGUMENT_WINDOW), pos);
	let depth = 0;
	for (let i = text.length - 1; i >= 0; i--) {
		let slashes = 0;
		while (text[i - slashes - 1] === '\\') slashes++;
		const escaped = slashes % 2 === 1;
		if (escaped ? text[i] === '(' || text[i] === '[' : text[i] === '$') return false;
		if (escaped) continue;
		if (text[i] === '}') depth++;
		else if (text[i] === '{' && depth > 0) depth--;
		else if (text[i] === '{' && TEXT_ARGUMENT.test(text.slice(0, i))) return true;
	}
	return false;
}

/**
 * Where and what inserting `symbol` writes for the range from..to. A math symbol against a formula
 * joins it instead of starting another: `$a$$b$` would read as display math's `$$`.
 */
function placeAt(state: EditorState, from: number, to: number, symbol: LatexSymbol): PlacedInsertion {
	const inMath = isMathContext(state, from) && !inTextArgument(state, from);
	if (symbol.mode === 'math' && !inMath && from === to) {
		if (inlineDollar(state, from - 1, -1)) {
			const joined = latexSymbolInsertion(symbol, true, '$');
			return { ...joined, from: from - 1, to: from - 1, caret: joined.caret < joined.text.length ? joined.caret : joined.text.length + 1 };
		}
		if (inlineDollar(state, from, 1)) {
			const joined = latexSymbolInsertion(symbol, true, state.sliceDoc(from + 1, from + 2));
			return { ...joined, from: from + 1, to: from + 1 };
		}
	}
	const amsmath = symbol.mode === 'text' && loadsPackageFor(state.doc.toString(), AMSMATH);
	return { ...latexSymbolInsertion(symbol, inMath, state.sliceDoc(to, to + 1), amsmath), from, to };
}

/** the text inserting `symbol` would write at the main caret, for showing before it is chosen */
export function latexSymbolSourceText(state: EditorState, symbol: LatexSymbol): string {
	const { from, to } = state.selection.main;
	return placeAt(state, from, to, symbol).text;
}

/** insert `symbol` at every caret (replacing any selection), each written for where it lands */
export function computeLatexSymbolInsert(state: EditorState, symbol: LatexSymbol): TransactionSpec {
	const spec = state.changeByRange((range) => {
		const { text, caret, from, to } = placeAt(state, range.from, range.to, symbol);
		return { changes: { from, to, insert: text }, range: EditorSelection.cursor(from + caret) };
	});
	return { ...spec, scrollIntoView: true, userEvent: 'input' };
}

/** what the visual editor puts in: characters as typed, a formula, or a code chip of raw LaTeX */
export type LatexVisualInsertion = { kind: 'text' | 'math' | 'chip'; text: string };

/**
 * The visual editor is never in math at the caret (a formula is edited in its own field), so a
 * math symbol goes in as a formula of its own and a text one as the code chip the Insert menu's
 * symbols go in as; a character it types itself (`$`, `[`) goes in as that character. Where neither
 * can stand (a code block, code-formatted text) the command goes in as it is written.
 */
export function latexSymbolVisualInsertion(tr: Transaction, symbol: LatexSymbol): LatexVisualInsertion {
	const { command, mode } = symbol;
	const { schema } = tr.doc.type;
	const { $from } = tr.selection;
	if (mode !== 'math') {
		const typed = ESCAPED.exec(command)?.[1] ?? (command.startsWith('\\') ? null : command);
		if (typed) return { kind: 'text', text: typed };
	}
	const type = mode === 'math' ? schema.nodes.inline_math : schema.nodes.inline_latex;
	const inCode = (tr.storedMarks ?? $from.marks()).some((mark) => mark.type.name === 'code');
	if (type === undefined || inCode || !$from.parent.canReplaceWith($from.index(), $from.index(), type))
		return { kind: 'text', text: command };
	return mode === 'math' ? { kind: 'math', text: command } : { kind: 'chip', text: latexSymbolInsertion(symbol, false).text };
}

/** how `insertion` reads in the file, for showing before it is chosen */
export function latexVisualInsertionText(insertion: LatexVisualInsertion): string {
	return insertion.kind === 'math' ? `$${insertion.text}$` : insertion.text;
}

export function insertLatexSymbolVisual(view: EditorView, symbol: LatexSymbol): void {
	const tr = collapseNodeSelection(view.state);
	const insertion = latexSymbolVisualInsertion(tr, symbol);
	const { schema } = view.state;
	if (insertion.kind === 'text') tr.insertText(insertion.text);
	else {
		const type = insertion.kind === 'math' ? schema.nodes.inline_math : schema.nodes.inline_latex;
		tr.replaceSelectionWith(type.create(null, schema.text(insertion.text)), false);
	}
	view.dispatch(tr.scrollIntoView());
	view.focus();
}
