// a paragraph's \par and the gap after it
import type { Node } from 'prosemirror-model';
import { follows, isLastOfParse, type Neighbour } from '$lib/serializer/blockAssembly';
import { originsOf, type BlockOrigin } from '$lib/editor/visual/parseOrigins';
import { endsInComment } from '../parser/urlMask';

/**
 * A \par the source had stays while the same block follows, so typing never rewrites how a
 * paragraph ends. `was` is what the parse knew the paragraph as before the edit; `next` is the
 * block written after it, or 'end' for the body's end.
 */
export function dropParagraphEnd(
	text: string,
	last: Node | null,
	was: BlockOrigin | null = null,
	next: BlockOrigin | 'end' | null = null
): string {
	if (last?.type.name !== 'paragraph') return text;
	const hadPar = typeof was?.text === 'string' && /\\par\s*$/.test(was.text);
	const kept = hadPar && (next === 'end' ? isLastOfParse(was!) : follows(was, next));
	// the line end a comment closes goes with the \par after it, as the separator brings its own
	return kept ? text : text.replace(/\n?[ \t]*\\par$/, '');
}

/** a container's children written afresh: a paragraph that a blank line parts from the next one needs no \par of its own */
export function dropInnerParagraphEnds(parent: Node, pieces: string[]): string[] {
	if (parent.childCount !== pieces.length) return pieces;
	const { origins, was } = originsOf(parent);
	return pieces.map((piece, i) => {
		let next = i + 1;
		while (next < pieces.length && pieces[next] === '') next++;
		if (next >= pieces.length || !pieces[next].startsWith('\n')) return piece;
		const trail = /\n*$/.exec(piece)![0];
		return dropParagraphEnd(piece.slice(0, piece.length - trail.length), parent.child(i), was[i], origins[next] ?? was[next]) + trail;
	});
}

// the file's own gap between a pair still the source pair, even a single line end: prose can
// only merge across one into prose, so after anything but a paragraph (a heading, an
// environment, a comment line) the gap is safe as written, and after a paragraph while it still
// ends in the \par the file gave it
export function paragraphGap(prev: Neighbour, next: Neighbour, contiguous: boolean, before: string): string | null {
	const origin = next.origin ?? next.was;
	const pre = origin?.pre;
	// a later member of a construct (an item of a list written as one) has no gap of its own
	if (!contiguous || typeof pre !== 'string' || origin!.member !== 0) return null;
	// a paragraph, or a heading, after a paragraph on a single line end takes a blank line unless
	// a \par parts them; an environment, a list or a display the paragraph ran into opens on the
	// file's own gap, as it did
	const prose = next.node.type.name === 'paragraph' || next.node.type.name === 'heading';
	if (prev.node.type.name === 'paragraph' && prose && !/\\par\s*$/.test(before.slice(-16))) return null;
	// a comment ending what was written owns the rest of its line: the next block needs a line of its own
	return endsInComment(before.replace(/\n+$/, '')) && !pre.startsWith('\n') ? '\n' + pre : pre;
}

// unset (a display the editor has not placed yet, or a test's) reads as inside its paragraph, as LaTeX writes a display
export function displayInParagraph(display: Node): boolean {
	return display.attrs.inParagraph !== false;
}

export function displayContinues(display: Node): boolean {
	return display.attrs.continuesAfter !== false;
}

function displayJoins(prev: Node, next: Node): boolean | null {
	if (prev.type.name === 'block_math' && next.type.name === 'paragraph') return displayContinues(prev);
	if (prev.type.name === 'paragraph' && next.type.name === 'block_math') return displayInParagraph(next);
	return null;
}

/** a display and the paragraph beside it are one paragraph or two as the display says, whatever gap the file had */
export function displayGap(prev: Neighbour, next: Neighbour, gap: string): string {
	const joins = displayJoins(prev.node, next.node);
	if (joins === null || !/^[ \t\n]*$/.test(gap)) return gap;
	const blank = /\n[ \t]*\n/.test(gap);
	if (joins && blank) return '\n';
	return !joins && !blank ? '\n\n' : gap;
}

export function isLabelOnlyParagraph(node: Node): boolean {
	let sawLabel = false;
	let sawOther = false;
	node.forEach((c) => {
		if (c.type.name === 'label') sawLabel = true;
		else if (c.isText) sawOther ||= (c.text ?? '').trim() !== '';
		else sawOther = true;
	});
	return sawLabel && !sawOther;
}

export function isEmptyParagraph(node: Node): boolean {
	if (node.childCount === 0) return true;
	let empty = true;
	node.forEach((c) => {
		if (c.isText) {
			if (c.text && c.text.trim() !== '') empty = false;
		} else if (c.type.name !== 'hard_break') {
			empty = false;
		}
	});
	return empty;
}
