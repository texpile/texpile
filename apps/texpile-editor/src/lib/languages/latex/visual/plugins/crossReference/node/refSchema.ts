import type { NodeSpec } from 'prosemirror-model';

export const refNodeSpec: NodeSpec = {
	group: 'inline',
	content: 'text*',
	inline: true,
	atom: true,
	attrs: {
		// 'reference' is the general/default type when the target kind is unknown; specific types
		// are only set when the label clearly identifies one (tab:/fig:/eq: or \eqref)
		refType: { default: 'reference' },
		// the original latex command (ref, eqref) so it round-trips verbatim. \ref is the default
		// because it is plain LaTeX: \autoref needs hyperref, and the parser no longer reads one
		// back, so a node defaulting to it could not survive a save and a reload.
		command: { default: 'ref' }
	},
	toDOM: (node) => [
		'span',
		{
			class: 'ref-node',
			'data-ref-type': node.attrs.refType,
			'data-command': node.attrs.command
		},
		0
	],
	parseDOM: [
		{
			tag: 'span.ref-node',
			getAttrs: (dom: HTMLElement) => ({
				refType: dom.getAttribute('data-ref-type') || 'reference',
				command: dom.getAttribute('data-command') || 'ref'
			})
		}
	]
};
