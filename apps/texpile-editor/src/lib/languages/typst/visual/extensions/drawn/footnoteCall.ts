// a footnote as its one setting, the note's markup (#footnote[..]); and the footnotes a chip holds, which Typst counts
// in document order
import type { SyntaxNode } from '@lezer/common';
import { blockMarkup, positionalArgs, readTypstCall, rewrittenCall, typstSyntax } from './typstCall';

const MOST_KEPT = 500;

export type FootnoteCall = { note: string };

const counted = new Map<string, number>();

export function readFootnote(source: string): FootnoteCall | null {
	const call = readTypstCall(source);
	if (!call || call.form !== 'call' || call.name !== 'footnote' || positionalArgs(call).length || call.bodies.length !== 1) return null;
	return { note: blockMarkup(call.bodies[0]) };
}

/** the footnote with its note replaced, or null while the note would not stand as one (a bracket not yet closed) */
export function writeFootnote(source: string, note: string): string | null {
	const call = readTypstCall(source);
	if (!call || !readFootnote(source)) return null;
	const next = rewrittenCall(call, { body: note });
	return readFootnote(next)?.note === note ? next : null;
}

/** a footnote with a note of its own steps the counter; #footnote(<label>) repeats another's number */
function footnotesIn(node: SyntaxNode, source: string): number {
	let count = 0;
	if (node.name === 'FuncCall' && node.firstChild && source.slice(node.firstChild.from, node.firstChild.to) === 'footnote') {
		const args = node.lastChild;
		for (let c = args?.firstChild; c; c = c.nextSibling) if (c.name === 'ContentBlock') count++;
	}
	for (let c = node.firstChild; c; c = c.nextSibling) count += footnotesIn(c, source);
	return count;
}

/** the footnote marks in a Typst chip, each taking the counter's next number */
export function typstFootnoteMarks(source: string): null[] {
	if (!source.includes('footnote')) return [];
	let count = counted.get(source);
	if (count === undefined) {
		count = footnotesIn(typstSyntax(source), source);
		if (counted.size >= MOST_KEPT) counted.clear();
		counted.set(source, count);
	}
	return new Array<null>(count).fill(null);
}
