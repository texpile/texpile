import type { MarkSpec } from 'prosemirror-model';
import { childrenOf, type MarkdownPlugin } from '$lib/languages/markdown/visual/core';

const strikethrough: MarkSpec = {
	parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
	toDOM() {
		return ['s', 0];
	}
};

export const strike: MarkdownPlugin = {
	import: {
		inline: {
			Strikethrough(r, node, marks, st) {
				const kids = childrenOf(node);
				const open = kids[0];
				const close = kids[kids.length - 1];
				return r.inline(r, kids.slice(1, -1), open.to, close.from, [...marks, { type: 's' }], st);
			}
		}
	},
	schema: ({ nodes, marks }) => ({ nodes, marks: marks.addToEnd('s', strikethrough) }),
	save: { marks: { s: () => ({ open: '~~', close: '~~', expel: true }) } }
};
