// a paragraph's \par and the gap after it
import type { Node } from 'prosemirror-model';
import { follows, isLastOfParse, type Neighbour } from '$lib/serializer/blockAssembly';
import type { BlockOrigin } from '$lib/editor/visual/parseOrigins';
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
	return kept ? text : text.replace(/[ \t]*\\par$/, '');
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
