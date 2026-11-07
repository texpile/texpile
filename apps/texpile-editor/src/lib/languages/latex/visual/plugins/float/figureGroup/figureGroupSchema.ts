import type { NodeSpec } from 'prosemirror-model';

export const figureGroupNodeSpecs: Record<string, NodeSpec> = {
	// a figure of several images, each with its own caption; the images take numbered: false
	figure_group: {
		content: 'image+ figure_caption',
		group: 'block',
		createGapCursor: true,
		attrs: {
			// the float as written, its images, captions and labels swapped for slots (figureGroupTree.ts)
			figureTemplate: { default: null },
			label: { default: null }
		},
		parseDOM: [{ tag: 'div.figure-group', getAttrs: (dom: HTMLElement) => ({ label: dom.getAttribute('data-label') }) }],
		toDOM: (node) => ['div', { class: 'figure-group', 'data-label': node.attrs.label }, 0]
	},
	figure_caption: {
		content: 'inline*',
		// starred: \caption*; captionOpt: the short caption of \caption[short]{long}, brackets excluded
		attrs: { starred: { default: false }, captionOpt: { default: null } },
		parseDOM: [{ tag: 'div.figure-group-caption' }],
		toDOM: () => ['div', { class: 'figure-group-caption' }, 0]
	}
};
