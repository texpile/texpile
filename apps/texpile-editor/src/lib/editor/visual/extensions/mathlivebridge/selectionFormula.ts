// words selected for Ctrl+M become the formula's source: plain text only, so a citation or another formula is never
// flattened into it, and with the characters that would end or comment out the formula escaped
import type { Node as PMNode } from 'prosemirror-model';

export function formulaFromSelection(doc: PMNode, from: number, to: number): string | null {
	let plain = true;
	doc.nodesBetween(from, to, (node) => {
		if (node.isInline && !node.isText) plain = false;
		return plain;
	});
	return plain ? doc.textBetween(from, to).replace(/[%#&$]/g, (c) => `\\${c}`) : null;
}
