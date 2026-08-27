import type { NodeSpec } from 'prosemirror-model';

/**
 * A \label that no float, table or equation claimed - the one after a \section, an \item, or a
 * theorem. It used to fall through to a raw chip, which is why section labels showed as source in
 * the middle of prose.
 *
 * The name is an ATTR, not content: the chip is a single thing to select and delete, the way the
 * label is a single thing in the source. It sits exactly where the \label sat, so serializing puts
 * it back in the same place - which is what makes this safe for the positions the editor does not
 * model, an \item's counter or a theorem's.
 */
export const labelNodeSpec: NodeSpec = {
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	attrs: { name: { default: '' } },
	toDOM: (node) => ['span', { class: 'label-node', 'data-label-name': String(node.attrs.name) }],
	parseDOM: [
		{
			tag: 'span.label-node',
			getAttrs: (dom: HTMLElement) => ({ name: dom.getAttribute('data-label-name') || '' })
		}
	]
};
