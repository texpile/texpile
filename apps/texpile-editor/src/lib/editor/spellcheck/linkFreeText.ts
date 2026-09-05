// The text prosemirror-proofread lints for one block, with link text blanked.
import type { Node as PmNode } from 'prosemirror-model';

/**
 * The block's text as prosemirror-proofread's default builds it (inline atoms wrapped in `$`),
 * with every character under a link mark turned into a space. A link's text is an address, or a
 * label whose click belongs to the link tooltip (see spellClickBoundaryPlugin), so a lint there
 * shows a squiggle nobody can open, let alone ignore. Spaces keep the offsets identical.
 */
export function textWithoutLinks(node: PmNode): string {
	const linkType = node.type.schema.marks.link;
	let text = '';
	node.content.forEach((child) => {
		if (child.isText) {
			const t = child.text ?? '';
			text += linkType && child.marks.some((mk) => mk.type === linkType) ? ' '.repeat(t.length) : t;
		} else if (child.isInline) {
			text += `$${textWithoutLinks(child)}$`;
		} else {
			text += textWithoutLinks(child);
		}
	});
	return text;
}
