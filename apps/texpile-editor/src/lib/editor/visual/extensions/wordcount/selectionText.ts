import type { Node } from 'prosemirror-model';

/** latexProse or typstProse; without one, raw blocks are left out and raw inline text counts as written */
export type RawProse = (raw: string) => string;

// never prose: math, code, and a citation, reference or label, whose text is a key
const SKIPPED = new Set(['inline_math', 'block_math', 'code_block', 'citation', 'ref', 'typ_ref', 'label']);
const RAW = new Set(['raw_latex', 'inline_latex']);

/** the prose of a stretch of the document, read one top-level block at a time: a yield between blocks lets a long one run in slices */
export function* extractTextSlices(doc: Node, from: number, to: number, prose?: RawProse): Generator<void, string> {
	// pieces joined once: asking a string grown piece by piece how it ends flattens it every time
	const pieces: string[] = [];
	let spaced = true;
	function add(piece: string): void {
		pieces.push(piece);
		spaced = piece.endsWith(' ');
	}

	function visit(node: Node, pos: number): boolean {
		if (SKIPPED.has(node.type.name)) return false;
		if (prose && RAW.has(node.type.name)) {
			const start = Math.max(0, from - pos - 1);
			const end = Math.min(node.content.size, to - pos - 1);
			if (start < end) add(` ${prose(node.textBetween(start, end))} `);
			return false;
		}
		if (!prose && node.type.name === 'raw_latex') return false;
		if (node.type.name === 'hard_break') {
			add(' ');
			return false;
		}

		if (node.type.name === 'text' && node.text) {
			const start = Math.max(0, from - pos);
			const end = Math.min(node.text.length, to - pos);
			if (start < end) add(node.text.slice(start, end));
		}

		// space between blocks so words don't merge
		if (node.isBlock && !spaced) add(' ');

		return true;
	}

	for (let child = 0, start = 0; child < doc.childCount && start < to; child++) {
		const end = start + doc.child(child).nodeSize;
		// nodesBetween over exactly this block's range reaches this block and none of its neighbors
		if (end > from) doc.nodesBetween(Math.max(from, start), Math.min(to, end), visit);
		start = end;
		yield;
	}

	return pieces.join('').trim();
}

export function extractText(doc: Node, from: number, to: number, prose?: RawProse): string {
	const slices = extractTextSlices(doc, from, to, prose);
	for (;;) {
		const step = slices.next();
		if (step.done) return step.value;
	}
}
