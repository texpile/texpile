import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { TypstInsertContext, TypstSymbol, TypstSymbolInsertion } from './typstSymbol.types';

// what a name run into would carry on: a letter or digit makes a longer name, a dot a field, a
// paren a call. `_` is left alone in math, where it attaches a subscript to the symbol
const MATH_NAME_GLUE = /[\p{L}\p{N}.(]/u;
// an embedded `#name` carries on into an identifier (they may hold `-` and `_`), a field, or a call
const MARKUP_CODE_GLUE = /[\p{L}\p{N}_\-.([]/u;
const CODE_NAME_GLUE = /[\p{L}\p{N}_-]/u;
// what markup reads as syntax at the start of a character; a `\` before any character keeps it text
const MARKUP_SYNTAX = /^[\\#$`*_[\]<@~=+/'"-]/;
// the characters Typst's math shorthands are made of: next to one, `->` can become `<->` or `-->`
const MATH_SHORTHAND_GLUE = /[-<>=|~:!.*[\]'+]/;

/** the characters of `shorthand`, as a class: a neighbor made of them runs into it (`-` + `--` is `---`) */
function shorthandGlue(shorthand: string): RegExp {
	return new RegExp(`[${[...new Set(shorthand)].map((ch) => `\\${ch}`).join('')}]`);
}

function isInside(node: SyntaxNode, pos: number): boolean {
	return node.from < pos && pos < node.to;
}

/**
 * What the caret at `pos` is in, read off the Typst syntax tree: an equation, markup, code, or text
 * that is taken as written (a string, raw text, a comment). A call's arguments are code in markup
 * (`#f(|)`) and math inside an equation (`vec(|)`), so they defer to what the call sits in.
 */
export function typstInsertContextAt(state: EditorState, pos: number): TypstInsertContext {
	let inArguments = false;
	for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
		switch (node.name) {
			case 'Math':
				return 'math';
			case 'Equation':
				if (isInside(node, pos)) return 'math';
				break;
			case 'Str':
			case 'Raw':
			case 'BlockComment':
				if (isInside(node, pos)) return 'text';
				break;
			case 'LineComment':
				if (node.from < pos) return 'text';
				break;
			case 'ContentBlock':
				if (isInside(node, pos)) return 'markup';
				break;
			case 'Code':
				return 'code';
			case 'CodeBlock':
				if (isInside(node, pos)) return 'code';
				break;
			case 'Args':
			case 'Array':
			case 'Dict':
			case 'Parenthesized':
				if (isInside(node, pos)) inArguments = true;
				break;
			case 'Markup':
				return inArguments ? 'code' : 'markup';
		}
	}
	return inArguments ? 'code' : 'markup';
}

/** math writes the shorthand, or the bare name: the whole `sym` module is in scope there */
function mathText(symbol: TypstSymbol, before: string, after: string): string {
	if (symbol.mathShorthand && !MATH_SHORTHAND_GLUE.test(before) && !MATH_SHORTHAND_GLUE.test(after)) return symbol.mathShorthand;
	// `emoji` is not in math's scope; an embedded expression reaches it
	const emoji = symbol.module === 'emoji';
	const name = emoji ? `#${symbol.name}` : symbol.path;
	const lead = MATH_NAME_GLUE.test(before) ? ' ' : '';
	const trail = (emoji ? MARKUP_CODE_GLUE : MATH_NAME_GLUE).test(after) ? ' ' : '';
	return lead + name + trail;
}

/**
 * Markup gets what a person writes there: the shorthand Typst has for the character (`--`, `~`),
 * else the character itself. One that would not show (a thin space, a joiner) goes in by name, so
 * the source says what is there; the `;` ends the name before text that would run on from it.
 */
function markupInsertion(symbol: TypstSymbol, before: string, after: string): TypstSymbolInsertion {
	const shorthand = symbol.markupShorthand;
	if (shorthand) {
		const glue = shorthandGlue(shorthand);
		if (!glue.test(before) && !glue.test(after)) return { kind: 'text', text: shorthand };
	}
	if (!symbol.invisible) return { kind: 'text', text: MARKUP_SYNTAX.test(symbol.value) ? `\\${symbol.value}` : symbol.value };
	const code = `#${symbol.name}`;
	return { kind: 'code', text: MARKUP_CODE_GLUE.test(after) ? `${code};` : code };
}

/** what an insertion would run into: the characters either side, an embedded expression it follows, the string it is in */
type Neighbors = { before: string; after: string; afterCode: boolean; inString: boolean };

/** the text `symbol` is written as in `context`, given what is around the caret */
export function typstSymbolInsertion(
	symbol: TypstSymbol,
	context: TypstInsertContext,
	{ before = '', after = '', afterCode = false, inString = false }: Partial<Neighbors> = {}
): TypstSymbolInsertion {
	switch (context) {
		case 'math':
			return { kind: 'text', text: mathText(symbol, before, after) };
		case 'markup': {
			const insertion = markupInsertion(symbol, before, after);
			const first = String.fromCodePoint(insertion.text.codePointAt(0) ?? 0);
			// `#x;` ends the expression and prints nothing
			return afterCode && MARKUP_CODE_GLUE.test(first) ? { ...insertion, text: `;${insertion.text}` } : insertion;
		}
		case 'code': {
			const lead = CODE_NAME_GLUE.test(before) ? ' ' : '';
			const trail = CODE_NAME_GLUE.test(after) ? ' ' : '';
			return { kind: 'code', text: lead + symbol.name + trail };
		}
		case 'text':
			return { kind: 'text', text: inString ? symbol.value.replace(/["\\]/g, '\\$&') : symbol.value };
	}
}

/** true when an embedded expression (`#x`, `#emph[a]`) ends at `pos`, the markup after it able to carry it on */
function endsEmbeddedCode(inner: SyntaxNode, pos: number): boolean {
	let node = inner;
	while (node.parent && node.parent.name !== 'Markup') node = node.parent;
	return node.to === pos && node.prevSibling?.name === 'Hash';
}

function neighbors(state: EditorState, from: number, to: number): Neighbors {
	const node = syntaxTree(state).resolveInner(from, -1);
	return {
		before: state.sliceDoc(Math.max(0, from - 1), from),
		after: state.sliceDoc(to, to + 1),
		afterCode: endsEmbeddedCode(node, from),
		inString: node.name === 'Str'
	};
}

/** the text inserting `symbol` would write at the main caret, for showing before it is chosen */
export function typstSymbolSourceText(state: EditorState, symbol: TypstSymbol): string {
	const { from, to } = state.selection.main;
	return typstSymbolInsertion(symbol, typstInsertContextAt(state, from), neighbors(state, from, to)).text;
}

/** insert `symbol` at every caret (replacing any selection), each written for where it lands */
export function computeTypstSymbolInsert(state: EditorState, symbol: TypstSymbol): TransactionSpec {
	const spec = state.changeByRange((range) => {
		const { text } = typstSymbolInsertion(symbol, typstInsertContextAt(state, range.from), neighbors(state, range.from, range.to));
		return { changes: { from: range.from, to: range.to, insert: text }, range: EditorSelection.cursor(range.from + text.length) };
	});
	return { ...spec, scrollIntoView: true, userEvent: 'input' };
}
