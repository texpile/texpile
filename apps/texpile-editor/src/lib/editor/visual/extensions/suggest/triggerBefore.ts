import type { Node as PMNode } from 'prosemirror-model';

/** offsets in the textblock: the trigger nearest before `cursor` that only supported characters follow, and the text after it */
export function triggerBefore(textblock: PMNode, cursor: number, trigger: string, supported: RegExp): { at: number; query: string } | null {
	const pieces: { text: string; at: number }[] = [];
	textblock.nodesBetween(0, cursor, (node, at) => {
		if (node.isText) pieces.push({ text: node.text!.slice(0, cursor - at), at });
	});
	let query = '';
	for (let piece = pieces.length - 1; piece >= 0; piece--) {
		const { text, at } = pieces[piece];
		for (let i = text.length - 1; i >= 0; i--) {
			if (text[i] === trigger) return { at: at + i, query: text.slice(i + 1) + query };
			if (!supported.test(text[i])) return null;
		}
		query = text + query;
	}
	return null;
}
