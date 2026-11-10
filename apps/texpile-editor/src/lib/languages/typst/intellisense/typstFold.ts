// Which Typst nodes fold, and where each fold starts and ends.
//
// A syntax tree does not give folding on its own: CodeMirror asks either a `foldService` or the
// `foldNodeProp` hung on node types, and a tree with neither has nothing foldable. BOTH are needed
// here, for a reason worth writing down:
//
//   - Blocks (code, content, argument lists) are single nodes that span from their opening
//     delimiter to their closing one, so the node prop describes them directly.
//   - Headings cannot use the prop at all. Typst's tree is flat — a Heading node covers only the
//     heading LINE, not the content beneath it — and CodeMirror's syntaxFolding skips any node
//     whose `to` is at or before the end of the line being folded. A heading is always exactly
//     that, so its prop callback would never even be consulted. Sections therefore go through a
//     foldService, the same mechanism .tex uses (intellisense/fold.ts).
//
// This lives in the app rather than in packages/typst-syntax-wasm because both APIs come from
// @codemirror/language, and that package deliberately depends on Lezer only.
import { foldNodeProp, foldService, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** the closing delimiters a finished block ends with */
const CLOSERS = new Set(['RightBrace', 'RightBracket', 'RightParen']);

/**
 * Fold everything between the outer delimiters, leaving both on screen.
 *
 * Returns null unless the block is actually closed: while the user is still typing, Typst reports
 * the unmatched opener as an Error node and the block runs to end of file, so folding it would
 * collapse the rest of the document.
 */
export function insideDelimiters(node: SyntaxNode) {
	const first = node.firstChild;
	const last = node.lastChild;
	if (!first || !last || last.from <= first.to) return null;
	if (!CLOSERS.has(last.name)) return null;
	return { from: first.to, to: last.from };
}

/** a display equation across lines folds between its dollars */
export function displayEquationFold(node: SyntaxNode, state: EditorState) {
	const open = node.firstChild;
	const close = node.lastChild;
	if (!open || !close || open.name !== 'Dollar' || close.name !== 'Dollar' || close === open) return null;
	if (open.nextSibling?.name !== 'Space' || close.prevSibling?.name !== 'Space') return null;
	return state.doc.lineAt(open.to).number < state.doc.lineAt(close.from).number ? { from: open.to, to: close.from } : null;
}

export const typstFold = foldNodeProp.add({
	'CodeBlock ContentBlock Args Params Array Dict Destructuring Parenthesized ImportItems': insideDelimiters,
	Equation: displayEquationFold,
	// a raw block collapses to its opening fence
	Raw: (node) => {
		const first = node.firstChild;
		return first && node.to > first.to && first.name === 'RawDelim' ? { from: first.to, to: node.to } : null;
	}
});

/** a heading's depth, read from the width of its `=` marker */
function headingLevel(node: SyntaxNode) {
	return (node.firstChild?.to ?? node.from) - node.from;
}

/**
 * Fold a heading's whole section: from the end of its own line to the end of everything it
 * introduces, stopping before the next heading of the same or shallower depth.
 */
function foldSection(state: EditorState, lineStart: number, lineEnd: number) {
	const tree = syntaxTree(state);
	// the heading node starts the line; resolve just inside it and walk out to the Heading itself
	let node: SyntaxNode | null = tree.resolveInner(lineStart, 1);
	while (node && node.name !== 'Heading') node = node.parent;
	if (!node || node.from < lineStart) return null;

	const level = headingLevel(node);
	let end = lineEnd;
	for (let sib: SyntaxNode | null = node.nextSibling; sib; sib = sib.nextSibling) {
		if (sib.name === 'Heading' && headingLevel(sib) <= level) break;
		end = sib.to;
	}
	// trailing blank lines belong to the gap between sections, not to the fold
	while (end > lineEnd && /\s/.test(state.doc.sliceString(end - 1, end))) end--;
	return end > lineEnd ? { from: lineEnd, to: end } : null;
}

export const typstFoldSections = foldService.of(foldSection);
