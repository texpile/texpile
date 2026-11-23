// the view a node draws with: the nodeViews prop's, else the schema's toDOM (NodeViewDesc.create)
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasBuildHelpers, CanvasNodeViewConstructor, CanvasNodeViews } from '../contracts/nodeViewTypes';
import { renderFaceSpec } from '../tree/faceDocument';
import type { FaceElement } from '../tree/faceElement';

/** what a view reads its constructors from; plugins' nodeViews props hold DOM node views until package Z */
export type NodeViewSource = { readonly nodeViews?: CanvasNodeViews };

export function nodeViewOf(source: NodeViewSource, node: PMNode): CanvasNodeViewConstructor | null {
	return source.nodeViews?.[node.type.name] ?? null;
}

/** the element tree a node's toDOM spec describes, contentDOM at the spec's 0 */
export function renderToDom(node: PMNode, checkbox: CanvasBuildHelpers['checkbox']): { dom: FaceElement; contentDOM: FaceElement | null } {
	const toDom = node.type.spec.toDOM;
	if (!toDom) throw new Error(`the node ${node.type.name} has no node view and no toDOM`);
	const rendered = renderFaceSpec(toDom(node));
	// prosemirror-flat-list's task marker holds the browser's checkbox
	for (const box of rendered.dom.querySelectorAll('input[type="checkbox"]')) box.replaceWith(checkbox(box.hasAttribute('checked')));
	return rendered;
}
