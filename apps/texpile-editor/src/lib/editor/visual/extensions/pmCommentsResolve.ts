// Resolving stored anchors against the rendered document: prose survives the round trip
// verbatim, so the same quote search that places a thread in CodeMirror places it here.
// Quotes containing markup, math, or wrap whitespace fail to resolve and draw nothing -
// honest absence over a guessed highlight, same policy as anchor.ts.
import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import {
	prepareLoose,
	resolveAnchor,
	resolveAnchorLooseIn,
	resolveFragment,
	type AnchorDialect,
	type LooseHaystack
} from '$lib/comments/anchor';
import type { CommentThread } from '$lib/comments/log';
import type { PmCommentRange } from './pmComments';

export type FlatDoc = {
	/** the document's prose in reading order */
	text: string;
	/** index[i] = ProseMirror position of text[i]; the whole reason this exists instead of textBetween */
	index: number[];
};

/**
 * Atoms whose content ProseMirror still renders, through a hole its node view leaves open.
 *
 * A figure caption is ordinary prose - visible, editable, and exactly the sort of line a reviewer
 * wants to argue with - so it has to be walked like any other text. The image node is only an atom
 * for SELECTION purposes; imageNodeView hands back a contentDOM, so a decoration over the caption
 * renders normally.
 *
 * Math is deliberately not here. block_math/inline_math are atoms with content too, but mathlive
 * draws that content itself and ProseMirror never renders it, so a range placed inside one would
 * report a thread as placed while drawing nothing - the exact lie resolvePmComments refuses to tell.
 */
const ATOMS_WITH_PROSE = new Set(['image']);

/**
 * One walk over the document collecting its text AND where each character lives.
 *
 * Atoms (math, includes, chips) become a single object-replacement character rather than being
 * skipped: skipping them would splice their neighbours together, and a quote could then match
 * across content that is not text at all. Block boundaries emit one newline, so a quote can never
 * run silently across a paragraph edge - the flat text has a separator where the reader sees one.
 */
export function flattenDoc(doc: PMNode): FlatDoc {
	const index: number[] = [];
	let text = '';
	doc.descendants((node, pos) => {
		// entering any block after the first: separate it from what came before
		if (!node.isText && node.isBlock && text.length > 0 && !text.endsWith('\n')) {
			index.push(pos);
			text += '\n';
		}
		if (node.isText) {
			const s = node.text ?? '';
			for (let i = 0; i < s.length; i++) index.push(pos + i);
			text += s;
			return false;
		}
		// an EMPTY captionable atom still needs its placeholder: with nothing to walk it would
		// splice the blocks on either side of the figure together
		if (node.isAtom && !(ATOMS_WITH_PROSE.has(node.type.name) && node.content.size > 0)) {
			index.push(pos);
			text += '￼';
			return false;
		}
		return true;
	});
	return { text, index };
}

function textPosition(doc: PMNode, index: number[], flat: number): number | null {
	const raw = flat < index.length ? index[flat] : index.length ? index[index.length - 1] + 1 : null;
	if (raw === null) return null;
	try {
		return TextSelection.near(doc.resolve(raw), 1).from;
	} catch {
		return null;
	}
}

/**
 * Place every thread in the rendered document, or report it as not visible in this view.
 *
 * Tiered, most precise first:
 *  1. the quote in the rendered text as-is (source offsets only feed the fast path/tie-break,
 *     where a miss costs one string compare);
 *  2. the quote through normalizeForMatch with the file's dialect, which is what lets a quote
 *     survive line wraps, escapes, ligatures AND the inline markup between the two dialects -
 *     the normal fate of any selection;
 *  3. a quote that crossed an atom (math, a citation chip): its longest text fragment locates
 *     it, and the highlight covers the enclosing BLOCKS - the same block granularity the
 *     controller downgrades such anchors to at creation, so both views agree on the extent;
 *  4. not visible in this view. The panel still lists the thread and says so; the source editor
 *     still places it.
 */
export function resolvePmComments(
	doc: PMNode,
	threads: CommentThread[],
	dialect: AnchorDialect = 'tex'
): { ranges: PmCommentRange[]; lost: string[] } {
	const { text, index } = flattenDoc(doc);
	const ranges: PmCommentRange[] = [];
	const lost: string[] = [];
	// the flat text is normalized once for the whole pass, and only once something misses: this runs
	// on every re-place, so a document whose threads all still fit pays nothing for tier 2
	let hay: LooseHaystack | null = null;
	for (const t of threads) {
		let hit = resolveAnchor(text, t.anchor);
		if (!hit) {
			hay ??= prepareLoose(text, dialect);
			hit = resolveAnchorLooseIn(hay, t.anchor);
		}
		if (hit) {
			if (hit.to === hit.from) {
				const at = textPosition(doc, index, hit.from);
				if (at !== null) {
					ranges.push({ id: t.id, from: at, to: at, resolved: t.resolved });
					continue;
				}
			} else {
				const from = index[hit.from];
				const to = index[hit.to - 1] + 1;
				if (from !== undefined && to !== undefined && to > from) {
					ranges.push({ id: t.id, from, to, resolved: t.resolved });
					continue;
				}
			}
		}
		// tier 3: the fragment places the thread, the enclosing textblocks carry the highlight
		hay ??= prepareLoose(text, dialect);
		const frag = resolveFragment(hay, t.anchor.quote);
		if (frag) {
			const from = index[frag.from];
			const to = frag.to > frag.from ? index[frag.to - 1] + 1 : from;
			if (from !== undefined && to !== undefined && to > from) {
				try {
					const $a = doc.resolve(from);
					const $b = doc.resolve(to - 1);
					ranges.push({ id: t.id, from: $a.start(), to: $b.end(), resolved: t.resolved });
					continue;
				} catch {
					/* an edge position the resolver rejects falls through to lost */
				}
			}
		}
		lost.push(t.id);
	}
	return { ranges, lost };
}
