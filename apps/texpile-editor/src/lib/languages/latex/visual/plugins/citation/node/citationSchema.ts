import type { NodeSpec } from 'prosemirror-model';

export const citationNodeSpec: NodeSpec = {
	group: 'inline',
	content: 'text*',
	inline: true,
	atom: true,
	attrs: {
		prenote: { default: '' },
		postnote: { default: '' },
		// \cite is the one spelling every bibliography package defines; \autocite is biblatex-only
		variant: { default: 'cite' }
	},
	toDOM: (node) => [
		'footnote',
		{
			'data-prenote': node.attrs.prenote,
			'data-postnote': node.attrs.postnote,
			'data-variant': node.attrs.variant
		},
		0
	],
	parseDOM: [
		{
			tag: 'footnote',
			getAttrs: (dom: HTMLElement) => ({
				prenote: dom.getAttribute('data-prenote') || '',
				postnote: dom.getAttribute('data-postnote') || '',
				variant: dom.getAttribute('data-variant') || 'autocite'
			})
		}
	]
};
