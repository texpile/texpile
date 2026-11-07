import type { NodeSpec } from 'prosemirror-model';

export const figureGroupNodeSpecs: Record<string, NodeSpec> = {
	figure_group: {
		content: 'image+ figure_caption',
		group: 'block',
		createGapCursor: true,
		attrs: {
			figureTemplate: { default: null },
			label: { default: null }
		},
		parseDOM: [{ tag: 'div.figure-group', getAttrs: (dom: HTMLElement) => ({ label: dom.getAttribute('data-label') }) }],
		toDOM: (node) => ['div', { class: 'figure-group', 'data-label': node.attrs.label }, 0]
	},
	figure_caption: {
		content: 'inline*',
		attrs: { starred: { default: false }, captionOpt: { default: null } },
		parseDOM: [{ tag: 'div.figure-group-caption' }],
		toDOM: () => ['div', { class: 'figure-group-caption' }, 0]
	}
};
