import { childrenOf, type MarkdownInlineImport, type MarkdownPlugin } from '$lib/languages/markdown/visual/core';

function markedRun(type: string): MarkdownInlineImport {
	return (r, node, marks, st) => {
		const kids = childrenOf(node);
		const open = kids[0];
		const close = kids[kids.length - 1];
		return r.inline(r, kids.slice(1, -1), open.to, close.from, [...marks, { type }], st);
	};
}

export const emphasis: MarkdownPlugin = {
	import: { inline: { StrongEmphasis: markedRun('strong'), Emphasis: markedRun('em') } },
	save: {
		marks: {
			strong: () => ({ open: '**', close: '**', expel: true }),
			em: () => ({ open: '*', close: '*', expel: true })
		}
	}
};
