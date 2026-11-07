import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

export function repointCitations(tr: Transaction, doc: PMNode, from: string, to: string): void {
	if (!from || !to || from === to) return;
	doc.descendants((node, pos) => {
		if (node.type.name !== 'citation') return true;
		const keys = node.textContent.split(',');
		if (!keys.some((key) => key.trim() === from)) return false;
		const text = keys.map((key) => (key.trim() === from ? key.replace(from, to) : key)).join(',');
		const at = tr.mapping.map(pos);
		tr.replaceWith(at, at + node.nodeSize, node.type.create(node.attrs, node.type.schema.text(text), node.marks));
		return false;
	});
}
