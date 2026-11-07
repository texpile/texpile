import type { NodeSpec } from 'prosemirror-model';

export const termTitleSpec: NodeSpec = {
	content: 'inline*',
	parseDOM: [{ tag: 'div[data-term-title]' }],
	toDOM: () => ['div', { 'data-term-title': '', class: 'term-title' }, 0]
};
export const termItemSpec: NodeSpec = {
	content: 'term_title block+',
	group: 'block',
	defining: true,
	parseDOM: [{ tag: 'div[data-term-item]' }],
	toDOM: () => ['div', { 'data-term-item': '', class: 'term-item' }, 0]
};
