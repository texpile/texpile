// The save check: the file a document was written to must parse back to that document. That is
// the second law of the round trip (see blockAssembly.ts); the first, that an untouched document
// writes its file back byte for byte, holds by construction. When the file fails it, the blame
// lies in a block that was written from the document, since every other block is the file's own
// bytes, or in one whose bytes read otherwise now that the edit took out what they referred to
// (a link's definition): those blocks are written out whole instead of patched inside, then their
// neighbours with them, and the file checked again. What still reads as it did is never regenerated,
// and a rewrite that reads back as the file before it did is dropped, since it fixed nothing.
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { type SourceMap } from '$lib/editor/visual/sourceSpans';
import { forgetBlock, originsOf } from '$lib/editor/visual/parseOrigins';
import { padTables } from '$lib/editor/visual/padTables';
import { differingBlocks, reopenDifference, type VisualFormat } from '$lib/editor/visual/docShape';

export type Serialized = { text: string; map: SourceMap };

export type Verified = Serialized & {
	/** how far the fallback went: 0 the file as first written, 1 the changed blocks written whole,
	 *  2 their neighbours too, 3 still not agreeing, saved as the last rewrite that changed the reading wrote it */
	rung: 0 | 1 | 2 | 3;
	/** how many top-level blocks were written whole */
	rewritten: number;
	/** what still differs on reopen, at rung 3 */
	difference: string | null;
	/** false when the file could not be parsed now and so was not checked; it is saved as written */
	checked: boolean;
};

export type VerifyOptions = {
	format: VisualFormat;
	/** the document as the editor holds it */
	doc: PMNode;
	/** the file as first written from it */
	first: Serialized;
	/** the file written from `doc` with the blocks in `afresh` written whole */
	serialize: (doc: PMNode, afresh: ReadonlySet<PMNode>) => Serialized;
	/** the document a file parses to; null when it cannot be parsed now (a timeout), which
	 *  leaves the file as it is */
	reparse: (text: string) => Promise<PMNode | null>;
};

/** the top-level blocks the parse no longer knows: the only ones written from the document */
export function changedBlocks(doc: PMNode): number[] {
	const { origins } = originsOf(doc);
	const out: number[] = [];
	for (let i = 0; i < doc.childCount; i++) if (!origins[i]) out.push(i);
	return out;
}

/** `doc` with the blocks at `indices` made afresh, and those blocks, for the serializer */
function withAfresh(doc: PMNode, indices: number[]): { doc: PMNode; afresh: Set<PMNode> } {
	const set = new Set(indices);
	const afresh = new Set<PMNode>();
	const kids: PMNode[] = [];
	doc.forEach((child, _off, i) => {
		if (!set.has(i)) return kids.push(child);
		const fresh = forgetBlock(child);
		afresh.add(fresh);
		kids.push(fresh);
	});
	return { doc: doc.copy(Fragment.fromArray(kids)), afresh };
}

const UNPARSED = Symbol('unparsed');

export async function verifiedSerialize(o: VerifyOptions): Promise<Verified> {
	async function readBack(out: Serialized): Promise<PMNode | typeof UNPARSED> {
		const again = await o.reparse(out.text);
		return again ? padTables(again) : UNPARSED;
	}
	const reread = await o.reparse(o.first.text);
	if (!reread) return { ...o.first, rung: 0, rewritten: 0, difference: null, checked: false };
	const again = padTables(reread);
	const d0 = reopenDifference(o.doc, again, o.format);
	if (!d0) return { ...o.first, rung: 0, rewritten: 0, difference: null, checked: true };
	// and the untouched ones that read otherwise now: their bytes leaned on one the edit took out (a link's definition)
	const changed = [...new Set([...changedBlocks(o.doc), ...differingBlocks(o.doc, again, o.format)])].sort((a, b) => a - b);
	if (changed.length === 0) return { ...o.first, rung: 3, rewritten: 0, difference: d0, checked: true };
	function attempt(indices: number[]): Serialized {
		const { doc, afresh } = withAfresh(o.doc, indices);
		return o.serialize(doc, afresh);
	}
	const first = attempt(changed);
	const read1 = await readBack(first);
	if (read1 === UNPARSED) return { ...first, rung: 1, rewritten: changed.length, difference: null, checked: false };
	const d1 = reopenDifference(o.doc, read1, o.format);
	if (!d1) return { ...first, rung: 1, rewritten: changed.length, difference: null, checked: true };
	// no writing gives what the editor holds (a \cite chip the file reads as a citation): neighbours are not the cause
	if (!reopenDifference(again, read1, o.format)) return { ...o.first, rung: 3, rewritten: 0, difference: d0, checked: true };
	const wider = new Set<number>();
	for (const i of changed) for (const k of [i - 1, i, i + 1]) if (k >= 0 && k < o.doc.childCount) wider.add(k);
	const widened = [...wider].sort((a, b) => a - b);
	if (widened.length === changed.length) return { ...first, rung: 3, rewritten: changed.length, difference: d1, checked: true };
	const second = attempt(widened);
	const read2 = await readBack(second);
	if (read2 === UNPARSED) return { ...second, rung: 2, rewritten: widened.length, difference: null, checked: false };
	const d2 = reopenDifference(o.doc, read2, o.format);
	if (!d2) return { ...second, rung: 2, rewritten: widened.length, difference: null, checked: true };
	if (!reopenDifference(read1, read2, o.format)) return { ...first, rung: 3, rewritten: changed.length, difference: d1, checked: true };
	return { ...second, rung: 3, rewritten: widened.length, difference: d2, checked: true };
}
