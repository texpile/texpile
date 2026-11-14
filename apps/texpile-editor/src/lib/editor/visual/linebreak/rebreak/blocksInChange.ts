// A text block that sits where the document changed, yet is the same node as before, did not change itself. What
// holds it did: a list it was put into, a theorem given another style, a deletion undone. Its width, its font or the
// marks on it may be other ones now
import type { Node as PMNode } from 'prosemirror-model';

export function textBlocksInChange(before: PMNode, doc: PMNode): PMNode[] {
	const from = before.content.findDiffStart(doc.content);
	const end = before.content.findDiffEnd(doc.content);
	if (from === null || !end) return [];
	const blocks: PMNode[] = [];
	// repeated text makes the two ends cross
	doc.nodesBetween(from, Math.min(Math.max(from, end.b), doc.content.size), (node) => {
		if (node.isTextblock) blocks.push(node);
		return !node.isTextblock;
	});
	return blocks;
}
