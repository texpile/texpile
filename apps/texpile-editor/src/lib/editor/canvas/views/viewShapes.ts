// a node view's shape, which its caret policy is derived from (plan 1.4): kept per node, a node never laid out built detached
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasNodeView, CanvasNodeViewConstructor } from '../contracts/nodeViewTypes';
import type { CaretPolicy } from '../contracts/geometryTypes';

export type NodeViewShape = {
	/** the view has a contentDOM */
	readonly content: boolean;
	/** setSelection and stopEvent: a nested editor owns the caret inside */
	readonly nested: boolean;
	readonly ownLine: boolean;
	readonly character: boolean;
};

const BLOCK_DISPLAYS = new Set(['block', 'flex', 'grid', 'table', 'list-item', 'flow-root']);
const BLOCK_TAGS = new Set([
	'DIV',
	'P',
	'FIGURE',
	'PRE',
	'BLOCKQUOTE',
	'UL',
	'OL',
	'LI',
	'TABLE',
	'HR',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6'
]);

const shapes = new WeakMap<PMNode, { constructor: CanvasNodeViewConstructor; shape: NodeViewShape }>();

function shapeOfView(spec: CanvasNodeView): NodeViewShape {
	const display = spec.dom.style.getPropertyValue('display');
	return {
		content: !!spec.contentDOM,
		nested: !!spec.setSelection && !!spec.stopEvent,
		ownLine: display ? BLOCK_DISPLAYS.has(display) : BLOCK_TAGS.has(spec.dom.tagName),
		character: spec.dom.hasAttribute('data-chip-character')
	};
}

/** a built view tells its node's shape, so a node laid out once is never built detached */
export function noteViewShape(node: PMNode, constructor: CanvasNodeViewConstructor, spec: CanvasNodeView): void {
	shapes.set(node, { constructor, shape: shapeOfView(spec) });
}

export function viewShapeOf(node: PMNode, constructor: CanvasNodeViewConstructor, buildDetached: () => CanvasNodeView): NodeViewShape {
	const known = shapes.get(node);
	if (known?.constructor === constructor) return known.shape;
	const spec = buildDetached();
	const shape = shapeOfView(spec);
	spec.destroy?.();
	shapes.set(node, { constructor, shape });
	return shape;
}

export function policyOfShape(shape: NodeViewShape, node: PMNode): CaretPolicy {
	if (shape.content) return shape.nested ? 'island' : 'text';
	if (shape.nested) return 'formula';
	if (!node.isInline) return 'drawnBlock';
	if (shape.character) return 'character';
	return shape.ownLine ? 'ownLine' : 'atom';
}
