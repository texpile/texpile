// the typ_ref atom
import type { NodeSpec } from 'prosemirror-model';

// `@target` - one atom for BOTH of typst's meanings (bibliography citation and label
// cross-reference): the serialization is identical either way, so the doc never has to decide.
// The node VIEW resolves the target against the loaded bibliography for display.
//
// supplement: the markup inside `@target[...]` (a citation's page, a reference's word before the
// number), verbatim; null for none, which is not the empty `[]`. form: the `form:` of a
// `#cite(<target>, form: "prose")`, the one spelling that needs the call; null leaves it to the style
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
