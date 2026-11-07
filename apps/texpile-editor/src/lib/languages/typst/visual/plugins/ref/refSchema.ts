// the typ_ref atom: `@target` is a citation or a cross reference, written the same either way
import type { NodeSpec } from 'prosemirror-model';

// supplement: the `@target[...]` markup verbatim, null for none (not `[]`); form: `#cite(<target>, form: ..)`
export const typRefSpec: NodeSpec = {
	inline: true,
	group: 'inline',
	atom: true,
	selectable: true,
	attrs: { target: {}, supplement: { default: null }, form: { default: null } },
	parseDOM: [
		{
			tag: 'span[data-typ-ref]',
			getAttrs: (dom) => {
				const el = dom as HTMLElement;
				return {
					target: el.getAttribute('data-typ-ref') || '',
					supplement: el.getAttribute('data-supplement'),
					form: el.getAttribute('data-form') || null
				};
			}
		}
	],
	toDOM: (node) => [
		'span',
		{
			'data-typ-ref': String(node.attrs.target),
			'data-supplement': node.attrs.supplement,
			'data-form': node.attrs.form,
			class: 'typ-ref'
		},
		`@${node.attrs.target}`
	],
	leafText: (node) => `@${node.attrs.target}`
};
