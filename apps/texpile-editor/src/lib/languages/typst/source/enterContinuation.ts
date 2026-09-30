// Enter carries on what the line started, the way the LaTeX source's list continuation does for
// \item: the next list, enum or term item; the next line of a doc comment; and an empty equation
// opens up as a display block. Everything is read off the Typst syntax tree, so a `-` inside raw
// text, a string or a function's arguments never grows a bullet.
//
// Each case returns null whenever the answer is not plainly yes, and Enter keeps its normal
// behavior. Before the parser has loaded there is no tree, and every case declines.
import { syntaxTree } from '@codemirror/language';
import { keymap, type EditorView } from '@codemirror/view';
import type { EditorState, Extension, TransactionSpec } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

const ITEMS = new Set(['ListItem', 'EnumItem', 'TermItem']);

/** where the caret is in something that only looks like markup, or that splitting the item would break */
const NOT_MARKUP = new Set([
	'Raw',
	'Str',
	'Equation',
	'LineComment',
	'BlockComment',
	'Args',
	'CodeBlock',
	'Code',
	'Strong',
	'Emph',
	'Label',
	'Ref',
	'Link'
]);

/** the edit Enter makes at the caret, or null to leave Enter to its default */
export function typstEnter(state: EditorState): TransactionSpec | null {
	// one caret, nothing selected: a multi-cursor or a selection replacement is a different edit
	if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return null;
	const pos = state.selection.main.head;
	// the node that ENDS at the caret: at the end of an item's line that is still the item
	const at = syntaxTree(state).resolveInner(pos, -1);
	return openEquation(state, at, pos) ?? continueComment(state, at, pos) ?? continueItem(state, at, pos);
}

function indentOf(state: EditorState, pos: number): string {
	return /^[ \t]*/.exec(state.doc.lineAt(pos).text)![0];
}

/** the blanks right after the caret on its line, which a split moves past rather than into the new line */
function blanksAfter(state: EditorState, pos: number): number {
	const line = state.doc.lineAt(pos);
	return /^[ \t]*/.exec(state.doc.sliceString(pos, line.to))![0].length;
}

/** a newline and `lead` at the caret, the rest of the line following it */
function split(state: EditorState, pos: number, lead: string): TransactionSpec {
	const insert = `\n${lead}`;
	return {
		changes: { from: pos, to: pos + blanksAfter(state, pos), insert },
		selection: { anchor: pos + insert.length },
		scrollIntoView: true,
		userEvent: 'input'
	};
}

/** drop what opened an empty item or comment line: Enter there means "done with this list" */
function clear(from: number, to: number): TransactionSpec {
	return { changes: { from, to }, selection: { anchor: from }, scrollIntoView: true, userEvent: 'delete' };
}

// `$|$` or `$ | $`: open it into a display block with the caret on the middle line
function openEquation(state: EditorState, at: SyntaxNode, pos: number): TransactionSpec | null {
	let eq: SyntaxNode | null = at;
	while (eq && eq.name !== 'Equation') eq = eq.parent;
	if (!eq || pos <= eq.from || pos >= eq.to) return null;
	const inner = state.doc.sliceString(eq.from + 1, eq.to - 1);
	if (state.doc.sliceString(eq.from, eq.from + 1) !== '$' || inner.trim()) return null;
	const indent = indentOf(state, eq.from);
	const insert = `\n${indent}  \n${indent}`;
	return {
		changes: { from: eq.from + 1, to: eq.to - 1, insert },
		selection: { anchor: eq.from + 1 + indent.length + 3 },
		scrollIntoView: true,
		userEvent: 'input'
	};
}

// A comment on a line of its own. Doc comments (`///`, `//!`) always continue; a plain `//` only
// when Enter splits it or follows a trailing space - at the very end of a finished `// note` it is
// just a newline.
function continueComment(state: EditorState, at: SyntaxNode, pos: number): TransactionSpec | null {
	if (at.name !== 'LineComment') return null;
	const text = state.doc.sliceString(at.from, at.to);
	const prefix = /^\/\/[/!]?/.exec(text)![0];
	if (pos < at.from + prefix.length) return null;
	const line = state.doc.lineAt(at.from);
	if (state.doc.sliceString(line.from, at.from).trim()) return null;
	const body = text.slice(prefix.length);
	if (!body.trim()) return pos === at.to ? clear(at.from, at.to) : null;
	const doc = prefix.length === 3;
	const splits = pos < at.to;
	if (!doc && !splits && !/[ \t]$/.test(body)) return null;
	return split(state, pos, `${indentOf(state, at.from)}${prefix} `);
}

function continueItem(state: EditorState, at: SyntaxNode, pos: number): TransactionSpec | null {
	// an item with nothing in it yet ends at its marker, so a caret after `- ` is outside it: read
	// the line, and let the tree confirm the marker is one
	const line = state.doc.lineAt(pos);
	const bare = /^([ \t]*)(?:[-+/]|\d+\.)[ \t]+$/.exec(state.doc.sliceString(line.from, pos));
	if (bare && !state.doc.sliceString(pos, line.to).trim()) {
		const from = line.from + bare[1].length;
		return /Marker$/.test(syntaxTree(state).resolveInner(from, 1).name) ? clear(from, pos) : null;
	}
	let item: SyntaxNode | null = at;
	for (; item && !ITEMS.has(item.name); item = item.parent) if (NOT_MARKUP.has(item.name) && encloses(item, pos)) return null;
	if (!item) return null;
	const marker = item.firstChild;
	if (!marker || !/Marker$/.test(marker.name)) return null;
	// a term item's body starts after its colon; Enter inside the term itself is left alone
	let bodyFrom = marker.to;
	let term = '';
	if (item.name === 'TermItem') {
		let colon = marker.nextSibling;
		while (colon && colon.name !== 'Colon') colon = colon.nextSibling;
		if (!colon) return null;
		term = state.doc.sliceString(marker.to, colon.from);
		bodyFrom = colon.to;
	}
	if (pos < bodyFrom) return null;
	if (!state.doc.sliceString(bodyFrom, item.to).trim()) return pos >= item.to && !term.trim() ? clear(marker.from, item.to) : null;
	return split(state, pos, `${indentOf(state, marker.from)}${nextMarker(item.name, state.doc.sliceString(marker.from, marker.to))} `);
}

/** the caret is inside `node`, not just after its closing delimiter */
function encloses(node: SyntaxNode, pos: number): boolean {
	// an unclosed one runs to the end of the document, so a caret at its end is still in it
	return pos < node.to || node.firstChild?.name === 'Error';
}

/** `-` stays `-`, `+` stays `+`, `3.` becomes `4.`, and a term item opens with `/` */
function nextMarker(kind: string, marker: string): string {
	if (kind === 'TermItem') return '/';
	const n = /^(\d+)\.$/.exec(marker);
	return n ? `${Number(n[1]) + 1}.` : marker;
}

function runEnter(view: EditorView): boolean {
	const spec = typstEnter(view.state);
	if (!spec) return false;
	view.dispatch(spec);
	return true;
}

/** ahead of the default keymap, so Enter reaches it first; declining hands Enter back */
export function typstEnterContinuation(): Extension {
	return keymap.of([{ key: 'Enter', run: runEnter }]);
}
