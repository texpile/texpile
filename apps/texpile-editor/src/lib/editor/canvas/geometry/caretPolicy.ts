// the caret policy of a node (7.1), derived from its view's shape in place of isContentEditable and contentDOM checks
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';
import type { CaretPolicy } from '../contracts/geometryTypes';
import type { CanvasBuildHelpers } from '../contracts/nodeViewTypes';
import type { VisualView } from '../contracts/viewTypes';
import { inBuild, OUTSIDE_BUILD } from '../views/buildScope';
import { policyOfShape, viewShapeOf } from '../views/viewShapes';

const TAKES_CARET: ReadonlySet<CaretPolicy> = new Set(['text', 'island', 'caption']);
const WITHOUT_CONTENT: ReadonlySet<CaretPolicy> = new Set(['atom', 'character', 'ownLine', 'formula']);

const detachedBuilds = new WeakMap<object, () => CanvasBuildHelpers>();

/** the helpers a node view built detached reads, for a node never laid out */
export function provideDetachedBuild(view: VisualView, tools: () => CanvasBuildHelpers): void {
	detachedBuilds.set(view, tools);
}

/** a node drawn by its toDOM: content where it has a hole, a leaf drawn whole */
function plainPolicy(node: PMNode): CaretPolicy {
	if (node.isLeaf || (node.isInline && node.isAtom)) return node.isInline ? 'atom' : 'drawnBlock';
	return 'text';
}

export function caretPolicyOf(view: VisualView, node: PMNode): CaretPolicy {
	const custom = view.props.nodeViews?.[node.type.name];
	if (custom) {
		const tools = detachedBuilds.get(view)?.() ?? OUTSIDE_BUILD;
		return policyOfShape(
			viewShapeOf(node, custom, () => inBuild(tools, () => custom(node, view, () => undefined, [], DecorationSet.empty))),
			node
		);
	}
	return plainPolicy(node);
}

/** the policy of the node starting at pos; null where no node starts */
export function caretPolicyAt(view: VisualView, pos: number): CaretPolicy | null {
	const node = view.state.doc.nodeAt(pos);
	return node ? caretPolicyOf(view, node) : null;
}

/** the old nodeDOM(pos).isContentEditable test: true for text, island, caption and the containers holding one */
export function takesCaret(view: VisualView, blockPos: number): boolean {
	const node = view.state.doc.nodeAt(blockPos);
	return !!node && nodeTakesCaret(view, node);
}

function nodeTakesCaret(view: VisualView, node: PMNode): boolean {
	const policy = caretPolicyOf(view, node);
	if (node.inlineContent || node.isLeaf || policy !== 'text') return TAKES_CARET.has(policy);
	let found = false;
	node.forEach((child) => {
		found ||= !child.isInline && nodeTakesCaret(view, child);
	});
	return found;
}

/** prosemirror-view's desc && !desc.contentDOM: true for atom, character, ownLine and formula */
export function drawnWithoutContent(view: VisualView, pos: number): boolean {
	const policy = caretPolicyAt(view, pos);
	return policy !== null && WITHOUT_CONTENT.has(policy);
}
