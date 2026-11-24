import type { Node as PMNode } from 'prosemirror-model';
import type { StyleBase, StyleLook } from '../../contracts/styleTypes';
import type { FaceElement } from '../../tree/faceElement';
import type { BaseSettings, ParagraphSpacing, StyleNodeSource } from './baseTypes';
import { BLOCKQUOTE_LOOK, headingLook, paragraphLook, RULE_LOOK, type ParagraphLead } from './coreNodeLooks';
import { rootLook } from './rootLook';
import { tagLook } from './baseTags';

const SELECTED_NODE: StyleLook = { outline: '2px solid var(--selected-node-outline)' };

function spacingOf(parent: PMNode): ParagraphSpacing {
	return (parent.type.spec.paragraphSpacing as ParagraphSpacing | undefined) ?? 'flow';
}

function leadOf(parent: PMNode, node: PMNode): ParagraphLead {
	if (parent.type.name === 'list' && parent.attrs.envName === 'description' && parent.firstChild === node) return 'hanging';
	return parent.type.name === 'term_item' && parent.childCount > 1 && parent.child(1) === node ? 'inline' : null;
}

/** the core's looks: tags, the root, paragraphs by container, headings, blockquote and rule */
export function createStyleBase(source: StyleNodeSource, settings: () => BaseSettings): StyleBase {
	return {
		root: () => rootLook(settings()),
		tag: tagLook,
		node(el: FaceElement): StyleLook | null {
			const ref = source.nodeOf(el);
			if (!ref) return null;
			const { name } = ref.node.type;
			if (name === 'blockquote') return BLOCKQUOTE_LOOK;
			if (name === 'horizontal_rule') return RULE_LOOK;
			if (name !== 'paragraph' && name !== 'heading') return null;
			let parent: PMNode;
			let firstInDoc: boolean;
			if (ref.parent === undefined) {
				const $pos = source.doc().resolve(ref.getPos());
				parent = $pos.parent;
				firstInDoc = $pos.depth === 0 && $pos.index() === 0;
			} else {
				parent = ref.parent ?? source.doc();
				firstInDoc = ref.parent === null && ref.getPos() === 0;
			}
			if (name === 'heading') return headingLook(settings(), ref.node.attrs.level as number, firstInDoc);
			const last = parent.lastChild === ref.node;
			return paragraphLook(spacingOf(parent), ref.node.attrs.indent as string | null, firstInDoc, leadOf(parent, ref.node), last);
		},
		selectedNode: () => (settings().readOnly ? null : SELECTED_NODE)
	};
}
