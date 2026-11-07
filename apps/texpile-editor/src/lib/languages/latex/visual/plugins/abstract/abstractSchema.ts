import type { NodeSpec } from 'prosemirror-model';

export const abstractNodes: Record<string, NodeSpec> = {
	abstract: {
		content: 'block+',
		group: 'block',
		definingAsContext: true,
		attrs: {
			sourceForm: { default: 'env' }
		},
		parseDOM: [
			{
				tag: 'div.abstract',
				getAttrs(dom: HTMLElement) {
					return { sourceForm: dom.getAttribute('data-source-form') || 'env' };
				}
			}
		],
		toDOM(node) {
			return ['div', { class: 'abstract', 'data-source-form': node.attrs.sourceForm }, 0];
		}
	}
};
